import fs from "node:fs";
import path from "node:path";
import { transformSourceForHost } from "@vela-rbxts/rbxtsc-host";

import { type FormattedDiagnostic, formatDiagnostic } from "./diagnostics.js";
import {
	isFile,
	listFilesRecursive,
	removeEmptyDirectories,
	removeFile,
	toSystemPath,
	writeFileIfChanged,
} from "./files.js";
import type { CliOptions } from "./options.js";
import { MANIFEST_FILE, MAPS_DIR } from "./options.js";
import {
	encodeMappings,
	hashGeneratedText,
	type VelaSourceMap,
} from "./source-map.js";

const MANIFEST_VERSION = 1;

export type BuildStats = {
	transformed: number;
	copied: number;
	written: number;
	removed: number;
	errors: number;
	warnings: number;
	diagnostics: FormattedDiagnostic[];
	durationMs: number;
};

export type Builder = {
	buildAll(): BuildStats;
	rebuild(relativePaths: readonly string[]): BuildStats;
	clean(): void;
};

type Manifest = {
	version: number;
	outDir: string;
	files: string[];
};

export function createBuilder(options: CliOptions): Builder {
	const manifestPath = path.resolve(options.projectRoot, MANIFEST_FILE);
	const mapsDir = path.resolve(options.projectRoot, MAPS_DIR);
	// rbxtsc copies everything under its rootDir to out/, maps included.
	const writesMaps = !isWithin(options.outDir, mapsDir);
	let emitted = readManifest(manifestPath, options);

	function mapPathFor(relativePath: string): string {
		return `${toSystemPath(mapsDir, relativePath)}.map`;
	}

	function removeMap(relativePath: string): void {
		const mapPath = mapPathFor(relativePath);
		if (removeFile(mapPath)) {
			removeEmptyDirectories(path.dirname(mapPath), mapsDir);
		}
	}

	function emit(relativePath: string, stats: MutableStats): void {
		const sourcePath = toSystemPath(options.srcDir, relativePath);
		const outputPath = toSystemPath(options.outDir, relativePath);

		if (!relativePath.endsWith(".tsx")) {
			if (writeFileIfChanged(outputPath, fs.readFileSync(sourcePath))) {
				stats.written += 1;
			}
			stats.copied += 1;
			emitted.add(relativePath);
			return;
		}

		const sourceText = fs.readFileSync(sourcePath, "utf8");
		const result = transformSourceForHost(
			{
				fileName: sourcePath,
				sourceText,
				projectRoot: options.projectRoot,
			},
			{ sourceMap: writesMaps },
		);

		for (const diagnostic of result.diagnostics) {
			const formatted = formatDiagnostic(relativePath, sourceText, diagnostic);
			stats.diagnostics.push(formatted);

			if (formatted.severity === "error") {
				stats.errors += 1;
			} else if (formatted.severity === "warning") {
				stats.warnings += 1;
			}
		}

		// An unchanged file goes out as written, and a map lands before its file so `rbxtsc -w` never reads one through a stale map.
		const generatedText = result.changed ? result.sourceText : sourceText;
		if (result.changed && writesMaps) {
			const mapPath = mapPathFor(relativePath);
			writeFileIfChanged(
				mapPath,
				`${JSON.stringify(
					createSourceMap(
						mapPath,
						sourcePath,
						outputPath,
						generatedText,
						result.mappings ?? [],
					),
				)}\n`,
			);
		} else {
			removeMap(relativePath);
		}

		if (writeFileIfChanged(outputPath, generatedText)) {
			stats.written += 1;
		}

		if (result.changed) {
			stats.transformed += 1;
		} else {
			stats.copied += 1;
		}

		emitted.add(relativePath);
	}

	function drop(relativePath: string, stats: MutableStats): void {
		const outputPath = toSystemPath(options.outDir, relativePath);

		if (removeFile(outputPath)) {
			stats.removed += 1;
		}

		emitted.delete(relativePath);
		removeEmptyDirectories(path.dirname(outputPath), options.outDir);
		removeMap(relativePath);
	}

	return {
		buildAll() {
			const started = Date.now();
			const stats = createStats();
			const sources = listFilesRecursive(options.srcDir);
			const live = new Set(sources);

			for (const relativePath of sources) {
				emit(relativePath, stats);
			}

			for (const relativePath of [...emitted]) {
				if (!live.has(relativePath)) {
					drop(relativePath, stats);
				}
			}

			emitted = live;
			writeManifest(manifestPath, options, emitted);

			return finish(stats, started);
		},

		rebuild(relativePaths) {
			const started = Date.now();
			const stats = createStats();

			for (const relativePath of relativePaths) {
				if (isFile(toSystemPath(options.srcDir, relativePath))) {
					emit(relativePath, stats);
				} else {
					drop(relativePath, stats);
				}
			}

			writeManifest(manifestPath, options, emitted);

			return finish(stats, started);
		},

		clean() {
			fs.rmSync(options.outDir, { recursive: true, force: true });
			if (writesMaps) {
				fs.rmSync(mapsDir, { recursive: true, force: true });
			}
			emitted = new Set();
			writeManifest(manifestPath, options, emitted);
		},
	};
}

type MutableStats = Omit<BuildStats, "durationMs">;

function createStats(): MutableStats {
	return {
		transformed: 0,
		copied: 0,
		written: 0,
		removed: 0,
		errors: 0,
		warnings: 0,
		diagnostics: [],
	};
}

function finish(stats: MutableStats, started: number): BuildStats {
	return { ...stats, durationMs: Date.now() - started };
}

function createSourceMap(
	mapPath: string,
	sourcePath: string,
	outputPath: string,
	generatedText: string,
	mappings: readonly number[],
): VelaSourceMap {
	const mapDir = path.dirname(mapPath);

	return {
		version: 3,
		file: toPosixRelative(mapDir, outputPath),
		sources: [toPosixRelative(mapDir, sourcePath)],
		names: [],
		mappings: encodeMappings(mappings),
		x_vela_generated: hashGeneratedText(generatedText),
	};
}

function toPosixRelative(from: string, to: string): string {
	return path.relative(from, to).split(path.sep).join("/");
}

function isWithin(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return !relative.startsWith("..") && !path.isAbsolute(relative);
}

// Pruning is driven by what an earlier run recorded, never by whatever else
// happens to sit in the output directory.
function readManifest(manifestPath: string, options: CliOptions): Set<string> {
	let manifest: Manifest;

	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
	} catch {
		return new Set();
	}

	if (
		manifest.version !== MANIFEST_VERSION ||
		path.resolve(options.projectRoot, manifest.outDir) !== options.outDir ||
		!Array.isArray(manifest.files)
	) {
		return new Set();
	}

	return new Set(manifest.files);
}

function writeManifest(
	manifestPath: string,
	options: CliOptions,
	emitted: ReadonlySet<string>,
): void {
	const manifest: Manifest = {
		version: MANIFEST_VERSION,
		outDir: path
			.relative(options.projectRoot, options.outDir)
			.split(path.sep)
			.join("/"),
		files: [...emitted].sort(),
	};

	fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
	fs.writeFileSync(
		manifestPath,
		`${JSON.stringify(manifest, undefined, "\t")}\n`,
	);
}
