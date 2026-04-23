import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { transform } from "@vela-rbxts/compiler";
import { beforeEach, expect, test, vi } from "vitest";
import { defaultConfig, defineConfig } from "../../config/src/index";
import {
	createRbxtscTransformerBridge,
	isTransformableHostFile,
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

test("falls back to defaultConfig when rbxtw.config.ts is absent", () => {
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
});

test("does not generate runtime artifacts for pure static files", () => {
	const project = createProject();

	const result = transformSourceForHost({
		fileName: project.sourceFile,
		sourceText: sourceFile.sourceText,
		projectRoot: project.root,
	});

	expect(result.runtimeArtifact).toBeUndefined();
	expect(fs.existsSync(project.runtimeArtifactPath)).toBe(false);
});

test("does not write a generated runtime artifact when runtime rules are reported", () => {
	vi.mocked(transform).mockReturnValueOnce({
		code: '<frame __rbxtsTailwindTag="frame" />',
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
	});

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

	expect(result.runtimeArtifact).toBeUndefined();
	expect(fs.existsSync(project.runtimeArtifactPath)).toBe(false);
});

test("loads rbxtw.config.ts when present", () => {
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

test("normalizes nearest rbxtw.config.ts authoring-shaped color input", () => {
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

test("does not expose semantic utility resolution functions from the host", async () => {
	const hostExports = await import("../src/index");

	expect(hostExports).not.toHaveProperty("resolveUtility");
	expect(hostExports).not.toHaveProperty("resolveClassName");
	expect(hostExports).not.toHaveProperty("lowerClassName");
	expect(hostExports).not.toHaveProperty("parseClassName");
});

function createProject(configFileText?: string): {
	sourceFile: string;
	root: string;
	runtimeArtifactPath: string;
} {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vela-rbxts-host-"));
	const sourceFile = path.join(root, "src", "client", "App.tsx");
	fs.mkdirSync(path.dirname(sourceFile), { recursive: true });

	if (configFileText !== undefined) {
		fs.writeFileSync(
			path.join(root, "rbxtw.config.ts"),
			configFileText,
			"utf8",
		);
	}

	return {
		sourceFile,
		root,
		runtimeArtifactPath: path.join(
			root,
			"include",
			"vela-rbxts",
			"runtime-host.ts",
		),
	};
}
