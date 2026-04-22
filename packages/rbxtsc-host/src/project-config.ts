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
	ColorScaleInput,
	NormalizedColorScale,
	TailwindConfig,
	TailwindConfigInput,
	ThemeColors,
} from "@rbxts-tailwind/config";
import { defaultConfig, defineConfig, SHADES } from "@rbxts-tailwind/config";

type TypeScriptModule = typeof import("typescript");
type ConfigLoader = (input?: TailwindConfigInput) => TailwindConfig;

const CONFIG_FILE_NAME = "rbxtw.config.ts";

export function resolveProjectConfig(sourceFileName: string): TailwindConfig {
	const configFilePath = findProjectConfigFile(sourceFileName);

	if (!configFilePath) {
		return defaultConfig;
	}

	return loadProjectConfig(configFilePath);
}

export function resolveProjectConfigInfo(sourceFileName: string): {
	config: TailwindConfig;
	configFilePath?: string;
	projectRoot: string;
} {
	const configFilePath = findProjectConfigFile(sourceFileName);

	if (!configFilePath) {
		return {
			config: defaultConfig,
			projectRoot: path.dirname(path.resolve(sourceFileName)),
		};
	}

	return {
		config: loadProjectConfig(configFilePath),
		configFilePath,
		projectRoot: path.dirname(configFilePath),
	};
}

function loadProjectConfig(configFilePath: string): TailwindConfig {
	const ts = loadTypeScript();
	const sourceText = fs.readFileSync(configFilePath, "utf8");
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
	const executeModule = new Function(
		"exports",
		"require",
		"module",
		"__filename",
		"__dirname",
		"defineConfig",
		"defaultConfig",
		transpiled.outputText,
	) as (
		exports: unknown,
		require: ReturnType<typeof createRequire>,
		module: { exports: unknown },
		filename: string,
		dirname: string,
		defineConfig: ConfigLoader,
		defaultConfig: TailwindConfig,
	) => void;

	executeModule(
		module.exports,
		localRequire,
		module,
		configFilePath,
		path.dirname(configFilePath),
		defineConfig,
		defaultConfig,
	);

	return coerceTailwindConfig(
		normalizeConfigExport(module.exports),
		configFilePath,
	);
}

function findProjectConfigFile(sourceFileName: string): string | undefined {
	let currentDirectory = path.dirname(path.resolve(sourceFileName));

	while (true) {
		const candidate = path.join(currentDirectory, CONFIG_FILE_NAME);
		if (isExistingFile(candidate)) {
			return candidate;
		}

		const parentDirectory = path.dirname(currentDirectory);
		if (parentDirectory === currentDirectory) {
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

function loadTypeScript(): TypeScriptModule {
	const require = createRequire(__filename);

	try {
		return require("typescript") as TypeScriptModule;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		throw new Error(
			`Failed to load the TypeScript runtime needed for rbxtw.config.ts: ${message}`,
		);
	}
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

	throw new Error(
		`Expected ${sourcePath} to export a TailwindConfig-compatible object.`,
	);
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
		isThemeScale(value.theme.spacing)
	);
}

function isThemeColors(value: unknown): value is ThemeColors {
	return (
		isRecord(value) &&
		Object.values(value).every((entry) => isNormalizedColorScale(entry))
	);
}

function isNormalizedColorScale(value: unknown): value is NormalizedColorScale {
	return (
		isRecord(value) && SHADES.every((shade) => typeof value[shade] === "string")
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
	if (value === undefined) {
		return true;
	}

	return isRecord(value) && Object.values(value).every(isColorScaleInput);
}

function isColorScaleInput(value: unknown): value is ColorScaleInput {
	return (
		typeof value === "string" ||
		(isRecord(value) &&
			Object.values(value).every((entry) => typeof entry === "string"))
	);
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
