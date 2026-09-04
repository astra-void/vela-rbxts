declare const __dirname: string;
declare const __filename: string;
declare const require: (id: string) => unknown;

const fs = require("node:fs") as {
	readFileSync(path: string, encoding: string): string;
	statSync(path: string): {
		isFile(): boolean;
	};
};

const path = require("node:path") as {
	join(...segments: string[]): string;
	dirname(path: string): string;
	resolve(path: string): string;
	basename(path: string): string;
};

const { createRequire } = require("node:module") as {
	createRequire(filename: string): (id: string) => unknown;
};

import type {
	ColorInputMap,
	ColorPalette,
	TailwindConfig,
	TailwindConfigInput,
	ThemeColors,
} from "@vela-rbxts/config";
import {
	defaultConfig,
	defineConfig,
	definePreset,
	PALETTE_DEFAULT_KEY,
	plugin,
	SHADES,
} from "@vela-rbxts/config";

type TypeScriptModule = typeof import("typescript");
type ConfigLoader = (input?: TailwindConfigInput) => TailwindConfig;

const CONFIG_FILE_NAME = "vela.config.ts";
// `vela.config.json` lets a project keep the config out of the TypeScript
// program, which typed ESLint setups reject for files outside `include`.
const CONFIG_FILE_NAMES = [CONFIG_FILE_NAME, "vela.config.json"];

export type ProjectConfigInfo = {
	config: TailwindConfig;
	configFilePath?: string;
	projectRoot: string;
};

export function resolveProjectConfig(sourceFileName: string): TailwindConfig {
	return resolveProjectConfigInfo(sourceFileName).config;
}

/**
 * Every eligible source file asks for its config, and a project has one config
 * for whole directories at a time, so the answer is cached per directory, and
 * the config file behind it is only re-read when the file on disk has moved.
 * A `vela.config.ts` is transpiled and executed to resolve, which is far too
 * much work to repeat per file.
 */
export function resolveProjectConfigInfo(
	sourceFileName: string,
): ProjectConfigInfo {
	const directory = path.dirname(path.resolve(sourceFileName));
	const configFilePath = findProjectConfigFile(directory);

	if (!configFilePath) {
		const cached = infoCache.get(directory);
		if (cached !== undefined && cached.loaded === undefined) {
			return cached.info;
		}

		const info: ProjectConfigInfo = {
			config: inferFramework(directory, defaultConfig, false),
			projectRoot: directory,
		};
		infoCache.set(directory, { info });

		return info;
	}

	const loaded = loadProjectConfig(configFilePath);
	// Identity, not equality: `loadProjectConfig` hands back the very object it
	// cached, and a fresh one is exactly what a changed config file produces.
	const cached = infoCache.get(directory);
	if (cached !== undefined && cached.loaded === loaded) {
		return cached.info;
	}

	const info: ProjectConfigInfo = {
		config: inferFramework(directory, loaded.config, loaded.declaresFramework),
		configFilePath,
		projectRoot: path.dirname(configFilePath),
	};
	infoCache.set(directory, { info, loaded });

	return info;
}

type LoadedProjectConfig = {
	config: TailwindConfig;
	/// `defineConfig` resolves an unset framework to the default, so whether the
	/// project asked for one has to be read off the input rather than the result.
	declaresFramework: boolean;
};

type ConfigCacheEntry = {
	sourceText: string;
	/// Exactly one of these is set. A failure is cached the same way a success
	/// is, since every source file in the project would otherwise re-run a
	/// config that is known to throw, and the next edit is what lets a fix
	/// take effect.
	loaded?: LoadedProjectConfig;
	error?: unknown;
};

// Every source file resolves its own config, so a host that walks a whole
// project would otherwise transpile and evaluate the same file once per file.
const configCache = new Map<string, ConfigCacheEntry>();

/// The upward walk for a config file, memoized per directory. Sibling files
/// share a directory, and a directory's answer only changes when a config file
/// is added or removed, which is what `clearProjectConfigCache` is for.
const configPathCache = new Map<string, string | undefined>();

/// The finished answer per directory, so `inferFramework` and its own tsconfig
/// walk are not repeated either.
const infoCache = new Map<
	string,
	{ info: ProjectConfigInfo; loaded?: LoadedProjectConfig }
>();

export function clearProjectConfigCache(): void {
	configCache.clear();
	configPathCache.clear();
	infoCache.clear();
	jsxFactoryCache.clear();
}

const TSCONFIG_FILE_NAME = "tsconfig.json";
const MAX_TSCONFIG_EXTENDS_DEPTH = 8;
const jsxFactoryCache = new Map<string, string | undefined>();

/// `jsxFactory` is program-wide, so a project pointing it at Vide cannot
/// compile React JSX at all — a config that never named a framework is taking
/// the default rather than asking for React.
function inferFramework(
	directory: string,
	config: TailwindConfig,
	declared: boolean,
): TailwindConfig {
	if (declared) {
		return config;
	}

	const factory = findJsxFactory(directory);
	if (factory === undefined || !factory.startsWith("Vide.")) {
		return config;
	}

	return { ...config, framework: "vide" };
}

function findJsxFactory(directory: string): string | undefined {
	let currentDirectory = directory;

	while (true) {
		const candidate = path.join(currentDirectory, TSCONFIG_FILE_NAME);
		if (isExistingFile(candidate)) {
			return readJsxFactory(candidate, 0);
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			return undefined;
		}

		currentDirectory = parentDirectory;
	}
}

function readJsxFactory(
	tsconfigPath: string,
	depth: number,
): string | undefined {
	if (depth > MAX_TSCONFIG_EXTENDS_DEPTH) {
		return undefined;
	}

	if (jsxFactoryCache.has(tsconfigPath)) {
		return jsxFactoryCache.get(tsconfigPath);
	}

	const parsed = readTsconfig(tsconfigPath);
	const compilerOptions = isRecord(parsed?.compilerOptions)
		? parsed.compilerOptions
		: undefined;
	let factory =
		typeof compilerOptions?.jsxFactory === "string"
			? compilerOptions.jsxFactory
			: undefined;

	// Only a relative base is followed: a package specifier would have to be
	// resolved the way TypeScript does, and roblox-ts projects set the factory
	// in the tsconfig they compile with.
	const extended = parsed?.extends;
	if (factory === undefined && typeof extended === "string") {
		if (extended.startsWith(".")) {
			const base = path.join(path.dirname(tsconfigPath), extended);
			const basePath = base.endsWith(".json") ? base : `${base}.json`;
			if (isExistingFile(basePath)) {
				factory = readJsxFactory(basePath, depth + 1);
			}
		}
	}

	jsxFactoryCache.set(tsconfigPath, factory);

	return factory;
}

function readTsconfig(
	tsconfigPath: string,
): Record<string, unknown> | undefined {
	let sourceText: string;

	try {
		sourceText = fs.readFileSync(tsconfigPath, "utf8");
	} catch {
		return undefined;
	}

	// A tsconfig is JSONC, so TypeScript's own reader is preferred; a project
	// without it falls back to plain JSON rather than losing the inference.
	try {
		const ts = loadTypeScript(tsconfigPath);
		const parsed = ts.parseConfigFileTextToJson(tsconfigPath, sourceText);
		if (parsed.error === undefined && isRecord(parsed.config)) {
			return parsed.config;
		}
	} catch {
		// fall through to JSON.parse
	}

	try {
		const parsed: unknown = JSON.parse(sourceText);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

/// Reading the file is cheap; transpiling and executing it is not, and neither
/// is everything hanging off the resolved config. The text is compared rather
/// than an mtime because two edits inside one filesystem tick share a stamp,
/// and a config the host kept serving after it changed is the one failure mode
/// worth spending a read to rule out.
function loadProjectConfig(configFilePath: string): LoadedProjectConfig {
	const sourceText = fs.readFileSync(configFilePath, "utf8");
	const cached = configCache.get(configFilePath);

	if (cached !== undefined && cached.sourceText === sourceText) {
		return replayCacheEntry(cached);
	}

	let entry: ConfigCacheEntry;
	try {
		entry = {
			sourceText,
			loaded: configFilePath.endsWith(".json")
				? loadJsonProjectConfig(configFilePath, sourceText)
				: loadTypeScriptProjectConfig(configFilePath, sourceText),
		};
	} catch (error) {
		entry = { sourceText, error };
	}

	configCache.set(configFilePath, entry);

	return replayCacheEntry(entry);
}

function replayCacheEntry(entry: ConfigCacheEntry): LoadedProjectConfig {
	if (entry.loaded !== undefined) {
		return entry.loaded;
	}

	throw entry.error;
}

function loadTypeScriptProjectConfig(
	configFilePath: string,
	rawSourceText: string,
): LoadedProjectConfig {
	const ts = loadTypeScript(configFilePath);
	const sourceText = stripVelaRbxtsImports(ts, rawSourceText);
	const transpiled = ts.transpileModule(sourceText, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
			esModuleInterop: true,
			allowSyntheticDefaultImports: true,
		},
		fileName: configFilePath,
		reportDiagnostics: true,
	});

	if ((transpiled.diagnostics?.length ?? 0) > 0) {
		throw new Error(
			`Failed to compile ${path.basename(configFilePath)}:\n${formatTypeScriptDiagnostics(
				ts,
				transpiled.diagnostics ?? [],
			)}`,
		);
	}

	const localRequire = createRequire(configFilePath);
	const module = { exports: {} as unknown };
	// The only place the input is still readable: what comes back has already
	// resolved an unset framework to the default.
	let declaresFramework = false;
	const resolvedConfigs = new Set<unknown>();
	const trackedDefineConfig: ConfigLoader = (input) => {
		declaresFramework ||= declaresFrameworkInput(input);

		const resolved = defineConfig(input);
		resolvedConfigs.add(resolved);

		return resolved;
	};
	const executeModule = new Function(
		"exports",
		"require",
		"module",
		"__filename",
		"__dirname",
		"defineConfig",
		"defaultConfig",
		"plugin",
		"definePreset",
		transpiled.outputText,
	) as (
		exports: unknown,
		require: ReturnType<typeof createRequire>,
		module: { exports: unknown },
		filename: string,
		dirname: string,
		defineConfig: ConfigLoader,
		defaultConfig: TailwindConfig,
		plugin: typeof import("@vela-rbxts/config").plugin,
		definePreset: typeof import("@vela-rbxts/config").definePreset,
	) => void;

	executeModule(
		module.exports,
		localRequire,
		module,
		configFilePath,
		path.dirname(configFilePath),
		trackedDefineConfig,
		defaultConfig,
		plugin,
		definePreset,
	);

	const exported = normalizeConfigExport(module.exports);

	// A config `defineConfig` returned always carries a framework it resolved
	// itself, so only an export it never produced can be read as a declaration.
	return {
		config: coerceTailwindConfig(exported, configFilePath),
		declaresFramework:
			declaresFramework ||
			(!resolvedConfigs.has(exported) &&
				isRecord(exported) &&
				"framework" in exported),
	};
}

/// Whether the input, or anything it pulls in, names a framework. A preset is
/// as good a place to state one as the config itself.
function declaresFrameworkInput(input: unknown, depth = 0): boolean {
	if (!isRecord(input) || depth > 10) {
		return false;
	}

	if ("framework" in input) {
		return true;
	}

	const presets = input.presets;

	return (
		Array.isArray(presets) &&
		presets.some((preset) => declaresFrameworkInput(preset, depth + 1))
	);
}

function loadJsonProjectConfig(
	configFilePath: string,
	sourceText: string,
): LoadedProjectConfig {
	let parsed: unknown;

	try {
		parsed = JSON.parse(sourceText);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		throw new Error(
			`Failed to parse ${path.basename(configFilePath)}: ${message}`,
		);
	}

	const stripped = stripSchemaKey(parsed);

	return {
		config: coerceTailwindConfig(stripped, configFilePath),
		declaresFramework: declaresFrameworkInput(stripped),
	};
}

function stripSchemaKey(value: unknown): unknown {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return value;
	}

	const { $schema, ...rest } = value as Record<string, unknown>;
	return rest;
}

function stripVelaRbxtsImports(
	ts: TypeScriptModule,
	sourceText: string,
): string {
	const sourceFile = ts.createSourceFile(
		CONFIG_FILE_NAME,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	const chunks: string[] = [];
	let lastPosition = 0;
	let removedImport = false;

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) {
			continue;
		}

		const moduleSpecifier = statement.moduleSpecifier;
		if (
			!ts.isStringLiteral(moduleSpecifier) ||
			moduleSpecifier.text !== "vela-rbxts"
		) {
			continue;
		}

		chunks.push(sourceText.slice(lastPosition, statement.getFullStart()));
		lastPosition = statement.getEnd();
		removedImport = true;
	}

	if (!removedImport) {
		return sourceText;
	}

	chunks.push(sourceText.slice(lastPosition));
	return chunks.join("");
}

function findProjectConfigFile(directory: string): string | undefined {
	const cached = configPathCache.get(directory);
	// A cached path is still checked for existence: deleting the config file is
	// the one change that has to take effect without an explicit cache clear.
	if (cached === undefined) {
		if (configPathCache.has(directory)) {
			return undefined;
		}
	} else if (isExistingFile(cached)) {
		return cached;
	}

	// The walk visits every directory on the way up, and each of them resolves
	// to the same file, so they are all recorded, and a sibling directory
	// deeper in the tree costs one lookup rather than a walk of its own.
	const visited: string[] = [];
	let currentDirectory = directory;

	while (true) {
		visited.push(currentDirectory);

		for (const fileName of CONFIG_FILE_NAMES) {
			const candidate = path.join(currentDirectory, fileName);
			if (isExistingFile(candidate)) {
				for (const entry of visited) {
					configPathCache.set(entry, candidate);
				}
				return candidate;
			}
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
			for (const entry of visited) {
				configPathCache.set(entry, undefined);
			}
			return undefined;
		}

		currentDirectory = parentDirectory;
	}
}

function isExistingFile(filePath: string): boolean {
	try {
		return fs.statSync(filePath).isFile();
	} catch {
		return false;
	}
}

// Resolve from the config's own project first: the VS Code extension bundles
// this loader, so its own install tree has no TypeScript to fall back on.
function loadTypeScript(configFilePath?: string): TypeScriptModule {
	const bases = configFilePath ? [configFilePath, __filename] : [__filename];
	let lastMessage = "";

	for (const base of bases) {
		try {
			return createRequire(base)("typescript") as TypeScriptModule;
		} catch (error) {
			lastMessage = error instanceof Error ? error.message : String(error);
		}
	}

	throw new Error(
		`Failed to load the TypeScript runtime needed for ${CONFIG_FILE_NAME}: ${lastMessage}`,
	);
}

function coerceTailwindConfig(
	value: unknown,
	sourcePath: string,
): TailwindConfig {
	if (isTailwindConfig(value)) {
		return value;
	}

	if (isTailwindConfigInput(value)) {
		return defineConfig(value);
	}

	const problem = describeConfigProblem(value);

	throw new Error(
		`Expected ${sourcePath} to export a TailwindConfig-compatible object${
			problem ? `: ${problem}` : "."
		}`,
	);
}

function describeConfigProblem(value: unknown): string | undefined {
	if (!isRecord(value)) {
		return "the export is not an object";
	}

	if (!isRecord(value.theme)) {
		return "`theme` is not an object";
	}

	return describeThemeProblem(value.theme, "theme");
}

function describeThemeProblem(
	theme: Record<string, unknown>,
	path: string,
): string | undefined {
	const colorsProblem =
		theme.colors === undefined
			? undefined
			: describeColorsProblem(theme.colors, `${path}.colors`);

	if (colorsProblem) {
		return colorsProblem;
	}

	for (const key of ["radius", "spacing"] as const) {
		const scale = theme[key];

		if (scale === undefined) {
			continue;
		}

		if (!isRecord(scale)) {
			return `\`${path}.${key}\` is not an object`;
		}

		const invalid = Object.entries(scale).find(
			([, entry]) => typeof entry !== "string",
		);

		if (invalid) {
			return `\`${path}.${key}.${invalid[0]}\` must be a string`;
		}
	}

	if (path === "theme" && theme.extend !== undefined) {
		if (!isRecord(theme.extend)) {
			return "`theme.extend` is not an object";
		}

		return describeThemeProblem(theme.extend, "theme.extend");
	}

	return undefined;
}

function describeColorsProblem(
	colors: unknown,
	path: string,
): string | undefined {
	if (!isRecord(colors)) {
		return `\`${path}\` is not an object`;
	}

	for (const [family, entry] of Object.entries(colors)) {
		if (typeof entry === "string") {
			continue;
		}

		if (!isRecord(entry)) {
			return `\`${path}.${family}\` must be a hex string or a shade palette`;
		}

		if (Object.keys(entry).length === 0) {
			return `\`${path}.${family}\` is an empty palette`;
		}

		for (const [shade, color] of Object.entries(entry)) {
			if (
				shade !== PALETTE_DEFAULT_KEY &&
				!SHADES.includes(Number(shade) as (typeof SHADES)[number])
			) {
				return `\`${path}.${family}.${shade}\` is not a valid shade; use ${SHADES.join(", ")}, or DEFAULT`;
			}

			if (typeof color !== "string") {
				return `\`${path}.${family}.${shade}\` must be a string`;
			}
		}
	}

	return undefined;
}

function normalizeConfigExport(value: unknown): unknown {
	if (isRecord(value) && "default" in value) {
		return value.default;
	}

	return value;
}

function isTailwindConfig(value: unknown): value is TailwindConfig {
	return (
		isRecord(value) &&
		isRecord(value.theme) &&
		isThemeColors(value.theme.colors) &&
		isThemeScale(value.theme.radius) &&
		isThemeScale(value.theme.spacing) &&
		// A `plugins` array still holds unrun handlers, so the config has to go
		// back through `defineConfig()` rather than be taken as resolved.
		(value.plugins === undefined || isResolvedPlugins(value.plugins))
	);
}

function isResolvedPlugins(value: unknown): boolean {
	return isRecord(value) && isRecord(value.utilities);
}

function isThemeColors(value: unknown): value is ThemeColors {
	return (
		isRecord(value) &&
		Object.values(value).every((entry) => isColorValue(entry))
	);
}

function isColorValue(value: unknown): value is string | ColorPalette {
	return typeof value === "string" || isColorPalette(value);
}

function isColorPalette(value: unknown): value is ColorPalette {
	return (
		isRecord(value) &&
		Object.keys(value).length > 0 &&
		Object.entries(value).every(
			([shade, entry]) =>
				(shade === PALETTE_DEFAULT_KEY ||
					SHADES.includes(Number(shade) as (typeof SHADES)[number])) &&
				typeof entry === "string",
		)
	);
}

function isTailwindConfigInput(value: unknown): value is TailwindConfigInput {
	if (!isRecord(value)) {
		return false;
	}

	if (!("theme" in value)) {
		return true;
	}

	if (!isRecord(value.theme)) {
		return false;
	}

	return isThemeConfigInput(value.theme);
}

function isThemeConfigInput(value: Record<string, unknown>): boolean {
	return (
		isOptionalColorInputMap(value.colors) &&
		isOptionalThemeScale(value.radius) &&
		isOptionalThemeScale(value.spacing) &&
		(value.extend === undefined ||
			(isRecord(value.extend) &&
				isOptionalColorInputMap(value.extend.colors) &&
				isOptionalThemeScale(value.extend.radius) &&
				isOptionalThemeScale(value.extend.spacing)))
	);
}

function isOptionalColorInputMap(
	value: unknown,
): value is ColorInputMap | undefined {
	return value === undefined || isThemeColors(value);
}

function isOptionalThemeScale(
	value: unknown,
): value is Record<string, string> | undefined {
	return value === undefined || isThemeScale(value);
}

function isThemeScale(value: unknown): value is Record<string, string> {
	return (
		isRecord(value) &&
		Object.values(value).every((entry) => typeof entry === "string")
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTypeScriptDiagnostics(
	ts: TypeScriptModule,
	diagnostics: readonly import("typescript").Diagnostic[],
): string {
	return diagnostics
		.map((diagnostic) => {
			const message = ts.flattenDiagnosticMessageText(
				diagnostic.messageText,
				"\n",
			);

			if (!diagnostic.file || diagnostic.start === undefined) {
				return `- TS${diagnostic.code}: ${message}`;
			}

			const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
				diagnostic.start,
			);

			return `- ${diagnostic.file.fileName}:${line + 1}:${character + 1} TS${diagnostic.code}: ${message}`;
		})
		.join("\n");
}
