import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { transform } from "@vela-rbxts/compiler";
import { beforeEach, expect, test, vi } from "vitest";
import { defaultConfig, defineConfig } from "../../config/src/index";
import {
	clearProjectConfigCache,
	createRbxtscTransformerBridge,
	isTransformableHostFile,
	resolveProjectConfig,
	transformSourceForHost,
} from "../src/index";

const mockTransformedCode =
	"<frame BackgroundColor3={Color3.fromRGB(1, 2, 3)}><uicorner CornerRadius={new UDim(0, 6)}/><uipadding PaddingLeft={new UDim(0, 12)} PaddingRight={new UDim(0, 12)}/></frame>";

vi.mock("@vela-rbxts/compiler", () => ({
	transform: vi.fn(() => ({
		code: mockTransformedCode,
		diagnostics: [
			{
				level: "warning",
				code: "unknown-theme-key",
				message: "Unknown theme key",
				token: "bg-missing",
			},
		],
		changed: true,
		ir: [],
		needsRuntimeHost: false,
	})),
}));

const sourceFile = {
	fileName: "src/client/App.tsx",
	sourceText: '<frame className="rounded-md px-4 bg-slate-500" />',
};

beforeEach(() => {
	vi.clearAllMocks();
});

test("treats a TSX file with className JSX as transformable", () => {
	expect(isTransformableHostFile(sourceFile)).toBe(true);
});

test("skips non-TSX and irrelevant files", () => {
	expect(
		isTransformableHostFile({
			fileName: "src/client/App.ts",
			sourceText: sourceFile.sourceText,
		}),
	).toBe(false);
	expect(
		isTransformableHostFile({
			fileName: "src/client/Plain.tsx",
			sourceText: "export const value = 1;",
		}),
	).toBe(false);
});

test("returns a skipped result without invoking the compiler", () => {
	const result = transformSourceForHost({
		fileName: "src/client/Plain.tsx",
		sourceText: "export const value = 1;",
	});

	expect(transform).not.toHaveBeenCalled();
	expect(result).toEqual(
		expect.objectContaining({
			sourceText: "export const value = 1;",
			changed: false,
			skipped: true,
			eligibility: {
				eligible: false,
				reason: "missing-class-name",
			},
		}),
	);
});

test("falls back to defaultConfig when vela.config.ts is absent", () => {
	const project = createProject();

	const result = transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
	});

	expect(transform).toHaveBeenCalledTimes(1);
	expect(transform).toHaveBeenCalledWith(sourceFile.sourceText, {
		configJson: JSON.stringify(defaultConfig),
	});
	expect(result.skipped).toBe(false);
	expect(result.changed).toBe(true);
	expect(result.sourceText).toBe(mockTransformedCode);
	expect(result.compilerResult?.needsRuntimeHost).toBe(false);
});

test("does not write generated runtime files for pure static files", () => {
	const project = createProject();
	const generatedRuntimeDir = path.join(project.root, "src", "__vela__");

	const result = transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
		projectRoot: project.root,
	});

	// Intentional regression check for the removed __vela__ runtime artifact directory.
	expect(fs.existsSync(generatedRuntimeDir)).toBe(false);
	expect(result.compilerResult?.needsRuntimeHost).toBe(false);
});

test("keeps runtime-aware output self-contained when runtime rules are reported", () => {
	vi.mocked(transform).mockImplementationOnce(() => ({
		code: [
			'import __VelaReact from "@rbxts/react";',
			'import { UserInputService as __VelaUserInputService, Workspace as __VelaWorkspace } from "@rbxts/services";',
			"function __createVelaRuntimeHost(config) {",
			'\treturn () => __VelaReact.createElement("frame", {});',
			"}",
			"const __VelaRuntimeConfig = { theme: { colors: {}, radius: {}, spacing: {} } };",
			"const VelaRuntimeHost = __createVelaRuntimeHost(__VelaRuntimeConfig);",
			'<VelaRuntimeHost __velaTag="frame" __velaRules={[{ condition: { kind: "width", alias: "md", minWidth: 768, maxWidth: null }, effects: { props: [{ name: "PaddingLeft", value: "new UDim(0, 12)" }], helpers: [] } }]} className={condition ? "px-4" : "px-2"} />',
		].join("\n"),
		diagnostics: [],
		changed: true,
		ir: [
			JSON.stringify({
				base: {
					props: [],
					helpers: [],
				},
				runtimeRules: [
					{
						condition: {
							kind: "width",
							alias: "md",
							minWidth: 768,
							maxWidth: null,
						},
						effects: {
							props: [
								{
									name: "PaddingLeft",
									value: "new UDim(0, 12)",
								},
							],
							helpers: [],
						},
					},
				],
				runtimeClassValue: false,
			}),
		],
		needsRuntimeHost: true,
	}));

	const project = createProject(
		`export default defineConfig({
			theme: {
				colors: {
					primary: "Color3.fromRGB(99, 102, 241)",
				},
				radius: {
					md: "new UDim(0, 6)",
				},
				spacing: {
					"4": "new UDim(0, 10)",
				},
			},
		});`,
	);

	const result = transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
		projectRoot: project.root,
	});

	expect(transform).toHaveBeenCalledTimes(1);
	// Intentional regression check for the removed __vela__ runtime artifact directory.
	expect(fs.existsSync(path.join(project.root, "src", "__vela__"))).toBe(false);
	expect(result.compilerResult?.needsRuntimeHost).toBe(true);
	expect(result.sourceText).toContain("__createVelaRuntimeHost");
	expect(result.sourceText).toContain("VelaRuntimeHost");
	expect(result.sourceText).toContain("__VelaRuntimeConfig");
	expect(result.sourceText).toContain("__VelaReact");
	// Intentional regression checks for the deleted runtime package imports.
	expect(result.sourceText).not.toContain("@vela-rbxts/runtime");
	expect(result.sourceText).not.toContain("vela-rbxts/runtime");
	expect(result.sourceText).not.toContain("../__vela__/runtime-host");
});

test("loads vela.config.ts when present", () => {
	const project = createProject(
		`import { defineConfig } from "vela-rbxts";

		export default defineConfig({
			theme: {
				colors: {
					primary: "Color3.fromRGB(99, 102, 241)",
				},
				radius: {
					md: "new UDim(0, 6)",
				},
				spacing: {
					"4": "new UDim(0, 10)",
				},
				extend: {
					colors: {
						secondary: "Color3.fromRGB(16, 185, 129)",
					},
					radius: {
						lg: "new UDim(0, 12)",
					},
					spacing: {
						"6": "new UDim(0, 16)",
					},
				},
			},
		});`,
	);

	const result = transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
	});

	expect(transform).toHaveBeenCalledTimes(1);
	expect(transform).toHaveBeenCalledWith(sourceFile.sourceText, {
		configJson: JSON.stringify(
			defineConfig({
				theme: {
					colors: {
						primary: "Color3.fromRGB(99, 102, 241)",
					},
					radius: {
						md: "new UDim(0, 6)",
					},
					spacing: {
						"4": "new UDim(0, 10)",
					},
				},
			}),
		),
	});
	expect(result.skipped).toBe(false);
	expect(result.changed).toBe(true);
	expect(result.sourceText).toBe(mockTransformedCode);
});

test("loads vela.config.json when present", () => {
	const project = createProject(
		JSON.stringify({
			$schema: "./node_modules/vela-rbxts/schema.json",
			theme: {
				extend: {
					colors: {
						secondary: "Color3.fromRGB(16, 185, 129)",
					},
				},
			},
		}),
		"vela.config.json",
	);

	const result = transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
	});

	expect(transform).toHaveBeenCalledWith(sourceFile.sourceText, {
		configJson: JSON.stringify(
			defineConfig({
				theme: {
					extend: {
						colors: {
							secondary: "Color3.fromRGB(16, 185, 129)",
						},
					},
				},
			}),
		),
	});
	expect(result.skipped).toBe(false);
});

test("prefers vela.config.ts over vela.config.json in the same directory", () => {
	const project = createProject(
		`export default { theme: { extend: { colors: { primary: "Color3.fromRGB(1, 1, 1)" } } } };`,
	);
	fs.writeFileSync(
		path.join(project.root, "vela.config.json"),
		JSON.stringify({
			theme: { extend: { colors: { primary: "Color3.fromRGB(2, 2, 2)" } } },
		}),
		"utf8",
	);

	transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
	});

	const [, options] = vi.mocked(transform).mock.calls[0] ?? [];
	expect(options?.configJson).toContain("Color3.fromRGB(1, 1, 1)");
});

test("names the failing theme key when vela.config.ts is invalid", () => {
	const project = createProject(
		`export default { theme: { extend: { colors: { surface: { 55: "Color3.fromRGB(7, 8, 9)" } } } } };`,
	);

	const result = transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
	});

	expect(result.diagnostics[0]?.message).toContain(
		"`theme.extend.colors.surface.55` is not a valid shade",
	);
});

test("normalizes nearest vela.config.ts authoring-shaped color input", () => {
	const project = createProject(
		`export default {
			theme: {
				extend: {
					colors: {
						surface: {
							700: "Color3.fromRGB(7, 8, 9)",
						},
					},
				},
			},
		};`,
	);

	transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
	});

	expect(transform).toHaveBeenCalledWith(sourceFile.sourceText, {
		configJson: JSON.stringify(
			defineConfig({
				theme: {
					extend: {
						colors: {
							surface: {
								700: "Color3.fromRGB(7, 8, 9)",
							},
						},
					},
				},
			}),
		),
	});
});

test("calls the compiler and returns transformed host source", () => {
	const result = transformSourceForHost(sourceFile);

	expect(transform).toHaveBeenCalledTimes(1);
	expect(transform).toHaveBeenCalledWith(sourceFile.sourceText, {
		configJson: JSON.stringify(defaultConfig),
	});
	expect(result.skipped).toBe(false);
	expect(result.changed).toBe(true);
	expect(result.sourceText).toBe(mockTransformedCode);
});

test("carries compiler diagnostics through the host diagnostic boundary", () => {
	const result = transformSourceForHost(sourceFile);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			source: "compiler",
			level: "warning",
			code: "unknown-theme-key",
			message: "Unknown theme key",
			token: "bg-missing",
			compilerDiagnostic: expect.objectContaining({
				code: "unknown-theme-key",
			}),
		}),
	]);
});

test("bridge exposes selection and transform entrypoints", () => {
	const bridge = createRbxtscTransformerBridge();

	expect(bridge.name).toBe("@vela-rbxts/rbxtsc-host");
	expect(bridge.shouldTransformFile(sourceFile)).toBe(true);
	expect(bridge.getFileEligibility(sourceFile)).toEqual({
		eligible: true,
		reason: "eligible",
	});
	expect(bridge.transformFile(sourceFile).sourceText).toContain(
		"BackgroundColor3",
	);
});

// `jsxFactory` is program-wide, so a project pointing it at Vide cannot compile
// React JSX at all — a config that never named a framework is taking the
// default rather than asking for React.
test("infers the Vide framework from the tsconfig jsxFactory", () => {
	const project = createProject();
	writeTsconfig(project.root, { compilerOptions: { jsxFactory: "Vide.jsx" } });
	clearProjectConfigCache();

	expect(resolveProjectConfig(project.sourceFile).framework).toBe("vide");
});

test("keeps React when the tsconfig names no Vide factory", () => {
	const project = createProject();
	writeTsconfig(project.root, {
		compilerOptions: { jsxFactory: "React.createElement" },
	});
	clearProjectConfigCache();

	expect(resolveProjectConfig(project.sourceFile).framework).toBe("react");
});

test("follows a relative tsconfig extends to find the factory", () => {
	const project = createProject();
	writeTsconfig(project.root, { extends: "./tsconfig.base.json" });
	fs.writeFileSync(
		path.join(project.root, "tsconfig.base.json"),
		JSON.stringify({ compilerOptions: { jsxFactory: "Vide.jsx" } }),
		"utf8",
	);
	clearProjectConfigCache();

	expect(resolveProjectConfig(project.sourceFile).framework).toBe("vide");
});

test("infers from the tsconfig through a config that names no framework", () => {
	const project = createProject(`export default defineConfig({});`);
	writeTsconfig(project.root, { compilerOptions: { jsxFactory: "Vide.jsx" } });
	clearProjectConfigCache();

	expect(resolveProjectConfig(project.sourceFile).framework).toBe("vide");
});

test("a config that names its framework is not overridden by the tsconfig", () => {
	const project = createProject(
		`export default defineConfig({ framework: "react" });`,
	);
	writeTsconfig(project.root, { compilerOptions: { jsxFactory: "Vide.jsx" } });
	clearProjectConfigCache();

	expect(resolveProjectConfig(project.sourceFile).framework).toBe("react");
});

test("does not expose semantic utility resolution functions from the host", async () => {
	const hostExports = await import("../src/index");

	expect(hostExports).not.toHaveProperty("resolveUtility");
	expect(hostExports).not.toHaveProperty("resolveClassName");
	expect(hostExports).not.toHaveProperty("lowerClassName");
	expect(hostExports).not.toHaveProperty("parseClassName");
});

function createProject(
	configFileText?: string,
	configFileName = "vela.config.ts",
): {
	sourceFile: string;
	root: string;
} {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vela-rbxts-host-"));
	const sourceFile = path.join(root, "src", "client", "App.tsx");
	fs.mkdirSync(path.dirname(sourceFile), { recursive: true });

	if (configFileText !== undefined) {
		fs.writeFileSync(path.join(root, configFileName), configFileText, "utf8");
	}

	return {
		sourceFile,
		root,
	};
}

function writeTsconfig(root: string, contents: object) {
	fs.writeFileSync(
		path.join(root, "tsconfig.json"),
		JSON.stringify(contents),
		"utf8",
	);
}

// Every eligible source file asks for its config, so a project of any size
// would otherwise transpile and execute the same file once per file.
test("executes an unchanged vela.config.ts once for the whole project", () => {
	const project = createProject(countingConfig("Color3.fromRGB(1, 2, 3)"));
	const other = path.join(project.root, "src", "client", "Other.tsx");
	fs.mkdirSync(path.dirname(other), { recursive: true });
	clearProjectConfigCache();
	resetConfigLoadCount();

	const first = resolveProjectConfig(project.sourceFile);
	const second = resolveProjectConfig(other);

	expect(configLoadCount()).toBe(1);
	// The same object, which is what lets everything derived from it be reused.
	expect(second).toBe(first);
	expect(first.theme.colors.brand).toBe("Color3.fromRGB(1, 2, 3)");
});

test("re-runs a vela.config.ts that changed on disk", () => {
	const project = createProject(countingConfig("Color3.fromRGB(1, 2, 3)"));
	clearProjectConfigCache();
	resetConfigLoadCount();

	expect(resolveProjectConfig(project.sourceFile).theme.colors.brand).toBe(
		"Color3.fromRGB(1, 2, 3)",
	);

	fs.writeFileSync(
		path.join(project.root, "vela.config.ts"),
		countingConfig("Color3.fromRGB(4, 5, 6)"),
		"utf8",
	);

	expect(resolveProjectConfig(project.sourceFile).theme.colors.brand).toBe(
		"Color3.fromRGB(4, 5, 6)",
	);
	expect(configLoadCount()).toBe(2);
});

// A watch process that kept serving a config that threw would never recover
// from the typo that made it throw.
test("does not cache a config failure past the edit that fixes it", () => {
	const project = createProject(
		`export default defineConfig({ theme: { colors: { brand: (() => { throw new Error("boom"); })() } } });`,
	);
	clearProjectConfigCache();

	expect(() => resolveProjectConfig(project.sourceFile)).toThrow("boom");
	// A second call replays the cached failure rather than re-running it.
	expect(() => resolveProjectConfig(project.sourceFile)).toThrow("boom");

	fs.writeFileSync(
		path.join(project.root, "vela.config.ts"),
		countingConfig("Color3.fromRGB(7, 8, 9)"),
		"utf8",
	);

	expect(resolveProjectConfig(project.sourceFile).theme.colors.brand).toBe(
		"Color3.fromRGB(7, 8, 9)",
	);
});

test("keeps resolving the nearest config while both are cached", () => {
	const project = createProject(countingConfig("Color3.fromRGB(1, 2, 3)"));
	const nested = path.join(project.root, "src", "ui");
	fs.mkdirSync(nested, { recursive: true });
	fs.writeFileSync(
		path.join(nested, "vela.config.ts"),
		countingConfig("Color3.fromRGB(9, 9, 9)"),
		"utf8",
	);
	clearProjectConfigCache();

	const outer = resolveProjectConfig(project.sourceFile);
	const inner = resolveProjectConfig(path.join(nested, "Panel.tsx"));

	expect(outer.theme.colors.brand).toBe("Color3.fromRGB(1, 2, 3)");
	expect(inner.theme.colors.brand).toBe("Color3.fromRGB(9, 9, 9)");
	// And again, off the cache, in the other order.
	expect(
		resolveProjectConfig(path.join(nested, "Card.tsx")).theme.colors.brand,
	).toBe("Color3.fromRGB(9, 9, 9)");
	expect(resolveProjectConfig(project.sourceFile).theme.colors.brand).toBe(
		"Color3.fromRGB(1, 2, 3)",
	);
});

// The config runs through `new Function`, so a counter on the global object is
// visible to both sides and says exactly how often it executed.
const CONFIG_LOAD_COUNTER = "__velaTestConfigLoads";

function countingConfig(brand: string): string {
	return `(globalThis as Record<string, number>).${CONFIG_LOAD_COUNTER} =
		((globalThis as Record<string, number>).${CONFIG_LOAD_COUNTER} ?? 0) + 1;
	export default defineConfig({ theme: { extend: { colors: { brand: "${brand}" } } } });`;
}

function configLoadCount(): number {
	return (globalThis as Record<string, unknown>)[CONFIG_LOAD_COUNTER] as number;
}

function resetConfigLoadCount() {
	(globalThis as Record<string, unknown>)[CONFIG_LOAD_COUNTER] = 0;
}

test("resolves presets a vela.config.ts imports from vela-rbxts", () => {
	const project = createProject(
		`import { defineConfig, definePreset, plugin } from "vela-rbxts";

		const gameUi = definePreset({
			theme: { extend: { colors: { brand: "Color3.fromRGB(255, 136, 0)" }, screens: { tablet: 900 } } },
			plugins: [
				plugin(({ addVariant }) => {
					addVariant("open", { attribute: "State", equals: "open" });
				}),
			],
		});

		export default defineConfig({ presets: [gameUi] });`,
	);
	clearProjectConfigCache();

	const config = resolveProjectConfig(project.sourceFile);

	expect(config.theme.colors.brand).toBe("Color3.fromRGB(255, 136, 0)");
	expect(config.theme.screens.tablet).toBe(900);
	expect(config.plugins.variants.open).toEqual({
		attribute: "State",
		equals: "open",
	});
});

// `framework` is program-wide, so a preset that states one has to be read as a
// declaration rather than left to the tsconfig inference.
test("reads a framework a preset declares as a declaration", () => {
	const project = createProject(
		`export default defineConfig({ presets: [{ framework: "react" }] });`,
	);
	writeTsconfig(project.root, { compilerOptions: { jsxFactory: "Vide.jsx" } });
	clearProjectConfigCache();

	expect(resolveProjectConfig(project.sourceFile).framework).toBe("react");
});

test("loads screens and variants from a vela.config.json", () => {
	const project = createProject(
		JSON.stringify({
			$schema: "./schema.json",
			theme: { extend: { screens: { tablet: 900 } } },
			plugins: {
				variants: { open: { attribute: "State", equals: "open" } },
			},
		}),
		"vela.config.json",
	);
	clearProjectConfigCache();

	const config = resolveProjectConfig(project.sourceFile);

	expect(config.theme.screens).toEqual({
		sm: 640,
		md: 768,
		lg: 1024,
		xl: 1280,
		"2xl": 1536,
		tablet: 900,
	});
	expect(config.plugins.variants).toEqual({
		open: { attribute: "State", equals: "open" },
	});
});
