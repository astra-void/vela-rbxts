import fs from "node:fs";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

import type { CliOptions } from "./options.js";
import { MAPS_DIR } from "./options.js";
import {
	decodeMappings,
	hashGeneratedText,
	originalPositionFor,
	type VelaSourceMap,
} from "./source-map.js";

export type SourceMapIndexOptions = {
	projectRoot: string;
	srcDir: string;
	outDir: string;
	cwd: string;
};

export type GeneratedFile =
	| { kind: "copied"; originalPath: string }
	| {
			kind: "mapped";
			originalPath: string;
			quads: readonly number[];
			originalLines(): readonly string[];
	  }
	| { kind: "stale" };

export type SourceMapIndex = {
	/** Undefined for a path outside the generated tree. */
	lookup(printedPath: string): GeneratedFile | undefined;
	/** A path the way TypeScript prints one: relative to the working directory. */
	displayPath(absolutePath: string): string;
};

type LoadedMap = { quads: number[]; sourcePath: string; generatedHash: string };

type Cache<T> = Map<string, { stamp: string; value: T }>;

const LINE_BREAK = /\r\n|\r|\n|\u2028|\u2029/;

/** Reads maps as diagnostics name their files, again only once a file changed. */
export function createSourceMapIndex(
	options: SourceMapIndexOptions,
): SourceMapIndex {
	const projectRoot = path.resolve(options.projectRoot);
	const srcDir = path.resolve(projectRoot, options.srcDir);
	const outDir = path.resolve(projectRoot, options.outDir);
	const mapsDir = path.resolve(projectRoot, MAPS_DIR);
	const cwd = path.resolve(options.cwd);
	const maps: Cache<LoadedMap | null> = new Map();
	const hashes: Cache<string> = new Map();
	const sources: Cache<string[]> = new Map();

	function hashOf(filePath: string): string | undefined {
		return cached(hashes, filePath, () =>
			hashGeneratedText(fs.readFileSync(filePath, "utf8")),
		);
	}

	return {
		lookup(printedPath) {
			const generatedPath = path.resolve(cwd, printedPath);
			const relative = path.relative(outDir, generatedPath);
			if (
				relative === "" ||
				relative.startsWith("..") ||
				path.isAbsolute(relative)
			) {
				return undefined;
			}

			const mapPath = path.join(mapsDir, `${relative}.map`);
			const map = cached(maps, mapPath, () => readMap(mapPath));
			const hash = hashOf(generatedPath);
			if (map === undefined) {
				// A lowered file can lack a map too: maps were off, or an older vela wrote the tree.
				const originalPath = path.join(srcDir, relative);
				return hash !== undefined && hash === hashOf(originalPath)
					? { kind: "copied", originalPath }
					: { kind: "stale" };
			}

			if (map === null || hash !== map.generatedHash) {
				return { kind: "stale" };
			}

			return {
				kind: "mapped",
				originalPath: map.sourcePath,
				quads: map.quads,
				originalLines: () =>
					cached(sources, map.sourcePath, () =>
						fs
							.readFileSync(map.sourcePath, "utf8")
							.replace(/^\uFEFF/, "")
							.split(LINE_BREAK),
					) ?? [],
			};
		},

		displayPath(absolutePath) {
			return path.relative(cwd, absolutePath).split(path.sep).join("/");
		},
	};
}

function cached<T>(
	cache: Cache<T>,
	filePath: string,
	load: () => T,
): T | undefined {
	let stamp: string;
	try {
		const stats = fs.statSync(filePath);
		stamp = `${stats.mtimeMs}:${stats.size}`;
	} catch {
		cache.delete(filePath);
		return undefined;
	}

	const hit = cache.get(filePath);
	if (hit !== undefined && hit.stamp === stamp) {
		return hit.value;
	}

	let value: T;
	try {
		value = load();
	} catch {
		return undefined;
	}
	cache.set(filePath, { stamp, value });

	return value;
}

function readMap(mapPath: string): LoadedMap | null {
	try {
		const map = JSON.parse(
			fs.readFileSync(mapPath, "utf8"),
		) as Partial<VelaSourceMap>;
		const source = map.sources?.[0];
		if (
			map.version !== 3 ||
			typeof source !== "string" ||
			typeof map.mappings !== "string" ||
			typeof map.x_vela_generated !== "string"
		) {
			return null;
		}

		return {
			quads: decodeMappings(map.mappings),
			sourcePath: path.resolve(path.dirname(mapPath), source),
			generatedHash: map.x_vela_generated,
		};
	} catch {
		return null;
	}
}

const ESCAPE = "\u001b[";
const RESET = `${ESCAPE}0m`;
const GUTTER_STYLE = `${ESCAPE}7m`;
const PATH_STYLE = `${ESCAPE}96m`;
const NUMBER_STYLE = `${ESCAPE}93m`;

function ansiPattern(source: string, flags?: string): RegExp {
	return new RegExp(
		source.split("ESC").join("\\u001b").split("CSI").join("\\u001b\\["),
		flags,
	);
}

// The shapes `ts.formatDiagnosticsWithColorAndContext` and `ts.formatDiagnostics` print, which roblox-ts uses for every diagnostic.
const COLORED_HEADER = ansiPattern(
	"^(\\s*)CSI96m(.+?)CSI0m:CSI93m(\\d+)CSI0m:CSI93m(\\d+)CSI0m(.*)$",
	"s",
);
const PRETTY_HEADER = ansiPattern(
	"^(\\s*)([^\\sESC][^ESC]*?):(\\d+):(\\d+)((?: - .*)?)$",
	"s",
);
const PLAIN_HEADER = ansiPattern(
	"^(\\s*)([^\\sESC][^ESC]*?)\\((\\d+),(\\d+)\\)(: .*)$",
	"s",
);
const GUTTER_LINE = ansiPattern("^(\\s*)CSI7m *(\\d+)CSI0m (.*)$", "s");
const ELLIPSIS_LINE = ansiPattern("^\\s*CSI7m *\\.\\.\\.CSI0m ?$");
const SQUIGGLE_LINE = ansiPattern(
	"^(\\s*)CSI7m *CSI0m (CSI[0-9;]*m)?([ ~]*)(?:CSI0m)?$",
);

type Header = {
	style: "colored" | "pretty" | "plain";
	indent: string;
	path: string;
	line: number;
	column: number;
	rest: string;
};

type Line = { body: string; eol: string };

type PendingBlock = {
	header: Header;
	lines: Line[];
	sawFrame: boolean;
	quads: readonly number[];
	originalLines(): readonly string[];
	start: { line: number; column: number };
};

function matchHeader(body: string): Header | undefined {
	const colored = COLORED_HEADER.exec(body);
	if (colored) {
		return toHeader("colored", colored);
	}

	const plain = PLAIN_HEADER.exec(body);
	if (plain) {
		return toHeader("plain", plain);
	}

	const pretty = PRETTY_HEADER.exec(body);
	return pretty ? toHeader("pretty", pretty) : undefined;
}

function toHeader(style: Header["style"], match: RegExpExecArray): Header {
	return {
		style,
		indent: match[1],
		path: match[2],
		line: Number(match[3]),
		column: Number(match[4]),
		rest: match[5],
	};
}

function formatHeader(
	header: Header,
	filePath: string,
	line: number,
	column: number,
): string {
	switch (header.style) {
		case "colored":
			return `${header.indent}${PATH_STYLE}${filePath}${RESET}:${NUMBER_STYLE}${line}${RESET}:${NUMBER_STYLE}${column}${RESET}${header.rest}`;
		case "pretty":
			return `${header.indent}${filePath}:${line}:${column}${header.rest}`;
		case "plain":
			return `${header.indent}${filePath}(${line},${column})${header.rest}`;
	}
}

/** Undefined when the frame is not one TypeScript printed, so the caller keeps it as it came. */
function renderFrame(block: PendingBlock): string | undefined {
	// The rest of a chained message comes before the frame.
	let prefix = "";
	let first = 0;
	while (
		first < block.lines.length &&
		!GUTTER_LINE.test(block.lines[first].body)
	) {
		prefix += block.lines[first].body + block.lines[first].eol;
		first += 1;
	}

	const frame = block.lines.slice(first);
	type Pair = { line: number; squiggle: string; color: string };
	const pairs: Pair[] = [];
	let indent = "";

	for (let index = 0; index < frame.length; index += 1) {
		if (ELLIPSIS_LINE.test(frame[index].body)) {
			continue;
		}

		const gutter = GUTTER_LINE.exec(frame[index].body);
		const squiggle = SQUIGGLE_LINE.exec(frame[index + 1]?.body ?? "");
		if (!gutter || !squiggle) {
			return undefined;
		}

		if (pairs.length === 0) {
			indent = gutter[1];
		}
		pairs.push({
			line: Number(gutter[2]),
			squiggle: squiggle[3],
			color: squiggle[2] ?? "",
		});
		index += 1;
	}

	if (pairs.length === 0) {
		return undefined;
	}

	const firstPair = pairs[0];
	const lastPair = pairs[pairs.length - 1];
	const generatedStart = Math.max(firstPair.squiggle.indexOf("~"), 0);
	const generatedEnd =
		pairs.length === 1
			? Math.max(firstPair.squiggle.lastIndexOf("~") + 1, generatedStart)
			: lastPair.squiggle.lastIndexOf("~") + 1;
	const end = originalPositionFor(block.quads, lastPair.line - 1, generatedEnd);

	const { start } = block;
	const content = (block.originalLines()[start.line] ?? "")
		.trimEnd()
		.replace(/\t/g, " ");
	let endColumn = content.length;
	if (end.line === start.line && end.column > start.column) {
		endColumn = end.column;
	} else if (end.line <= start.line && pairs.length === 1) {
		// A mapping only marks where a token starts, so a span ending inside one keeps its generated length.
		endColumn = start.column + (generatedEnd - generatedStart);
	}

	const from = Math.min(start.column, content.length);
	const to = Math.max(from, Math.min(endColumn, content.length));
	const lineNumber = String(start.line + 1);
	const blank = " ".repeat(lineNumber.length);
	const lead = content.slice(0, from).replace(/\S/g, " ");
	const squiggle = "~".repeat(to - from);
	const gutterEol = frame[0].eol;
	const lastEol = frame[frame.length - 1].eol;

	return `${prefix}${indent}${GUTTER_STYLE}${lineNumber}${RESET} ${content}${gutterEol}${indent}${GUTTER_STYLE}${blank}${RESET} ${firstPair.color}${lead}${squiggle}${RESET}${lastEol}`;
}

export type DiagnosticRemapper = {
	write(chunk: string): void;
	/** Lets out a block still waiting for frame lines that may never come. */
	idle(): void;
	end(): void;
};

export function createDiagnosticRemapper(
	index: SourceMapIndex,
	emit: (text: string) => void,
): DiagnosticRemapper {
	let buffered = "";
	let pending: PendingBlock | undefined;

	function finishPending(): void {
		if (pending === undefined) {
			return;
		}

		const block = pending;
		pending = undefined;
		emit(
			renderFrame(block) ??
				block.lines.map((line) => line.body + line.eol).join(""),
		);
	}

	function processLine(body: string, eol: string): void {
		if (pending !== undefined) {
			const isFrame =
				GUTTER_LINE.test(body) ||
				SQUIGGLE_LINE.test(body) ||
				ELLIPSIS_LINE.test(body);
			if (isFrame || (!pending.sawFrame && matchHeader(body) === undefined)) {
				pending.lines.push({ body, eol });
				pending.sawFrame ||= isFrame;
				return;
			}
			finishPending();
		}

		const header = matchHeader(body);
		const file = header && index.lookup(header.path);
		if (header === undefined || file === undefined || file.kind === "stale") {
			emit(body + eol);
			return;
		}

		const displayPath = index.displayPath(file.originalPath);
		if (file.kind === "copied") {
			emit(formatHeader(header, displayPath, header.line, header.column) + eol);
			return;
		}

		const start = originalPositionFor(
			file.quads,
			header.line - 1,
			header.column - 1,
		);
		emit(
			formatHeader(header, displayPath, start.line + 1, start.column + 1) + eol,
		);
		// Only the colored formatter prints a frame.
		if (header.style === "colored") {
			pending = {
				header,
				lines: [],
				sawFrame: false,
				quads: file.quads,
				originalLines: file.originalLines,
				start,
			};
		}
	}

	function drain(final: boolean): void {
		let newline = buffered.indexOf("\n");
		while (newline >= 0) {
			const line = buffered.slice(0, newline);
			buffered = buffered.slice(newline + 1);
			if (line.endsWith("\r")) {
				processLine(line.slice(0, -1), "\r\n");
			} else {
				processLine(line, "\n");
			}
			newline = buffered.indexOf("\n");
		}

		if (final) {
			if (buffered !== "") {
				processLine(buffered, "");
				buffered = "";
			}
			finishPending();
		}
	}

	return {
		write(chunk) {
			buffered += chunk;
			drain(false);
		},
		idle() {
			drain(true);
		},
		end() {
			drain(true);
		},
	};
}

export function remapDiagnosticText(
	text: string,
	index: SourceMapIndex,
): string {
	let output = "";
	const remapper = createDiagnosticRemapper(index, (chunk) => {
		output += chunk;
	});
	remapper.write(text);
	remapper.end();

	return output;
}

const IDLE_MS = 50;

export function pipeRemapped(
	source: Readable,
	target: Writable,
	index: SourceMapIndex,
): Promise<void> {
	const remapper = createDiagnosticRemapper(index, (text) => {
		target.write(text);
	});
	let timer: NodeJS.Timeout | undefined;
	source.setEncoding("utf8");

	return new Promise((resolve) => {
		source.on("data", (chunk: string) => {
			remapper.write(chunk);
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			timer = setTimeout(() => remapper.idle(), IDLE_MS);
		});
		source.on("end", () => {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			remapper.end();
			resolve();
		});
	});
}

export async function runRemap(options: CliOptions): Promise<number> {
	const index = createSourceMapIndex({ ...options, cwd: process.cwd() });
	await pipeRemapped(process.stdin, process.stdout, index);

	return 0;
}
