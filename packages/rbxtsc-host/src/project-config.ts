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
	TailwindConfig,
	TailwindConfigInput,
} from "@rbxts-tailwind/config";

type TypeScriptModule = typeof import("typescript");
type ConfigLoader = (input?: TailwindConfigInput) => TailwindConfig;

const CONFIG_FILE_NAME = "rbxtw.config.ts";
const DEFAULT_CONFIG_PATH = path.join(
	__dirname,
	"../../config/src/defaults.json",
);

const defaultConfig = loadDefaultConfig();

export function resolveProjectConfig(sourceFileName: string): TailwindConfig {
	const configFilePath = findProjectConfigFile(sourceFileName);

	if (!configFilePath) {
		return defaultConfig;
	}

	return loadProjectConfig(configFilePath);
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

function loadDefaultConfig(): TailwindConfig {
	return coerceTailwindConfig(
		JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, "utf8")),
		DEFAULT_CONFIG_PATH,
	);
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

function defineConfig(input: TailwindConfigInput = {}): TailwindConfig {
	const extend = input.theme?.extend;

	return {
		theme: {
			colors: mergeThemeScale(
				defaultConfig.theme.colors,
				extend?.colors,
				input.theme?.colors,
			),
			radius: mergeThemeScale(
				defaultConfig.theme.radius,
				extend?.radius,
				input.theme?.radius,
			),
			spacing: mergeThemeScale(
				defaultConfig.theme.spacing,
				extend?.spacing,
				input.theme?.spacing,
			),
		},
	};
}

function mergeThemeScale(
	base: Record<string, string>,
	extend: Record<string, string> | undefined,
	override: Record<string, string> | undefined,
): Record<string, string> {
	return {
		...base,
		...extend,
		...override,
	};
}

function coerceTailwindConfig(
	value: unknown,
	sourcePath: string,
): TailwindConfig {
	if (!isTailwindConfig(value)) {
		throw new Error(
			`Expected ${sourcePath} to export a TailwindConfig-compatible object.`,
		);
	}

	return value;
}

function normalizeConfigExport(value: unknown): unknown {
	if (
		isRecord(value) &&
		"default" in value &&
		isTailwindConfig(value.default)
	) {
		return value.default;
	}

	return value;
}

function isTailwindConfig(value: unknown): value is TailwindConfig {
	return (
		isRecord(value) &&
		isRecord(value.theme) &&
		isThemeScale(value.theme.colors) &&
		isThemeScale(value.theme.radius) &&
		isThemeScale(value.theme.spacing)
	);
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
