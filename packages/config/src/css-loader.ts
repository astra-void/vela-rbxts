import { type CssDiagnostic, parseVelaCss } from "./css.js";
import type { TailwindConfigInput } from "./index.js";

/** Returns a file's text, or `undefined` when it cannot be read. */
export type CssSourceReader = (path: string) => string | undefined;

export type VelaCssDiagnostic = CssDiagnostic & {
	file: string;
	line: number;
	column: number;
};

export type LoadedVelaCss = {
	input: TailwindConfigInput;
	/** Every file folded in, entry first, so a caller can watch them. */
	files: string[];
	diagnostics: VelaCssDiagnostic[];
};

/** How deep `@import` may nest, mirroring the preset limit it resolves as. */
const MAX_IMPORT_DEPTH = 10;

type LoaderState = {
	read: CssSourceReader;
	files: string[];
	diagnostics: VelaCssDiagnostic[];
	visiting: Set<string>;
	loaded: Map<string, TailwindConfigInput | undefined>;
};

/**
 * Folds a `vela.css` and everything it imports into one config input. Imports
 * resolve as presets of the file that names them, so an importing file outranks
 * what it pulled in, the way a project outranks its presets.
 */
export function loadVelaCss(
	entryPath: string,
	read: CssSourceReader,
): LoadedVelaCss {
	const state: LoaderState = {
		read,
		files: [],
		diagnostics: [],
		visiting: new Set(),
		loaded: new Map(),
	};
	const entry = normalizePath(entryPath);
	const input = loadFile(entry, state, 0);

	if (input === undefined) {
		state.diagnostics.push({
			file: entry,
			message: `Could not read ${entry}.`,
			start: 0,
			end: 0,
			line: 1,
			column: 1,
		});
	}

	return {
		input: input ?? {},
		files: state.files,
		diagnostics: state.diagnostics,
	};
}

function loadFile(
	filePath: string,
	state: LoaderState,
	depth: number,
): TailwindConfigInput | undefined {
	const cached = state.loaded.get(filePath);
	if (cached !== undefined || state.loaded.has(filePath)) {
		return cached;
	}

	const source = state.read(filePath);

	if (source === undefined) {
		state.loaded.set(filePath, undefined);
		return undefined;
	}

	state.files.push(filePath);
	state.visiting.add(filePath);

	const parsed = parseVelaCss(source);

	for (const diagnostic of parsed.diagnostics) {
		state.diagnostics.push(locate(diagnostic, filePath, source));
	}

	const presets: TailwindConfigInput[] = [];

	for (const entry of parsed.imports) {
		const report = (message: string) => {
			state.diagnostics.push(
				locate(
					{ message, start: entry.start, end: entry.end },
					filePath,
					source,
				),
			);
		};
		const resolved = resolveRelative(filePath, entry.specifier);

		if (resolved === undefined) {
			report(
				`"${entry.specifier}" is not a relative path. Vela CSS imports a sibling file, as "./buttons.css".`,
			);
			continue;
		}

		if (state.visiting.has(resolved)) {
			report(
				`"${entry.specifier}" imports a file that is already importing it.`,
			);
			continue;
		}

		if (depth + 1 > MAX_IMPORT_DEPTH) {
			report(
				`Vela CSS imports nest more than ${MAX_IMPORT_DEPTH} levels deep; check for a file that imports itself.`,
			);
			continue;
		}

		const imported = loadFile(resolved, state, depth + 1);

		if (imported === undefined) {
			report(`Could not read ${resolved}.`);
			continue;
		}

		presets.push(imported);
	}

	state.visiting.delete(filePath);

	const input: TailwindConfigInput =
		presets.length > 0 ? { ...parsed.input, presets } : parsed.input;
	state.loaded.set(filePath, input);

	return input;
}

function locate(
	diagnostic: CssDiagnostic,
	file: string,
	source: string,
): VelaCssDiagnostic {
	let line = 1;
	let lineStart = 0;

	for (
		let index = 0;
		index < diagnostic.start && index < source.length;
		index += 1
	) {
		if (source[index] === "\n") {
			line += 1;
			lineStart = index + 1;
		}
	}

	return {
		...diagnostic,
		file,
		line,
		column: diagnostic.start - lineStart + 1,
	};
}

/**
 * Only relative specifiers resolve: a package specifier would have to be
 * resolved the way the host's module loader does, and a vela stylesheet is a
 * project file rather than something a package publishes.
 */
function resolveRelative(
	fromFile: string,
	specifier: string,
): string | undefined {
	if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
		return undefined;
	}

	const segments = fromFile.split("/");
	segments.pop();

	for (const segment of specifier.split("/")) {
		if (segment === "." || segment === "") {
			continue;
		}

		if (segment === "..") {
			if (segments.length > 0) {
				segments.pop();
			}
			continue;
		}

		segments.push(segment);
	}

	return segments.join("/");
}

export function normalizePath(filePath: string): string {
	return filePath.split(/[\\/]/).join("/");
}
