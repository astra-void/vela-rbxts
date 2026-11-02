import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transform as compilerTransform } from "@vela-rbxts/compiler";
import ts from "typescript";
import { beforeEach, expect, test, vi } from "vitest";

import { createVelaProgramTransformer } from "../src/transformer";

vi.mock("@vela-rbxts/compiler", () => ({
	transform: vi.fn(() => ({
		code: "<frame BackgroundColor3={Color3.fromRGB(1, 2, 3)}><uicorner CornerRadius={new UDim(0, 6)} /></frame>",
		diagnostics: [],
		changed: true,
		ir: [],
		needsRuntimeHost: false,
	})),
}));

const mockedCompilerTransform = vi.mocked(compilerTransform);

function runLifecycleTransform(sourceText: string, projectRoot: string) {
	const sourceFile = ts.createSourceFile(
		path.join(projectRoot, "src", "client", "App.tsx"),
		sourceText,
		ts.ScriptTarget.ESNext,
		true,
		ts.ScriptKind.TSX,
	);
	const transformerFactory = createVelaProgramTransformer(
		{} as ts.Program,
		{ projectRoot },
		{ ts },
	);
	const result = ts.transform(sourceFile, [transformerFactory]);
	const transformedSourceFile = result.transformed[0] as ts.SourceFile;
	const printedSource = ts.createPrinter().printFile(transformedSourceFile);

	return {
		transformedSource: printedSource,
		diagnostics: result.diagnostics ?? [],
		dispose: () => result.dispose(),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

test("reinjects transformed source through the TypeScript transformer lifecycle", () => {
	const project = createProject();
	const result = runLifecycleTransform(
		'<frame className="rounded-md px-4 bg-slate-500" />',
		project.root,
	);

	expect(mockedCompilerTransform).toHaveBeenCalledTimes(1);
	expect(result.transformedSource).toContain("BackgroundColor3");
	expect(result.transformedSource).not.toContain("className=");
	expect(result.diagnostics).toHaveLength(0);
	// Intentional regression check for the removed __vela__ runtime artifact directory.
	expect(fs.existsSync(path.join(project.root, "src", "__vela__"))).toBe(false);

	result.dispose();
});

test("skips non-eligible files before compiler invocation", () => {
	const project = createProject();
	const result = runLifecycleTransform(
		"export const value = React.createElement('frame');",
		project.root,
	);

	expect(mockedCompilerTransform).not.toHaveBeenCalled();
	expect(result.transformedSource).toContain("export const value");

	result.dispose();
});

test("bridges compiler diagnostics into TypeScript diagnostics", () => {
	mockedCompilerTransform.mockReturnValueOnce({
		code: '<frame __velaTag="frame" __velaRules={[{ condition: { kind: "orientation", value: "portrait" }, effects: { props: [], helpers: [] } }]} />',
		diagnostics: [
			{
				level: "warning",
				code: "unknown-theme-key",
				message: "Unknown theme key",
				token: "bg-missing",
			},
		],
		changed: false,
		ir: [
			JSON.stringify({
				base: {
					props: [],
					helpers: [],
				},
				runtimeRules: [
					{
						condition: {
							kind: "orientation",
							value: "portrait",
						},
						effects: {
							props: [],
							helpers: [],
						},
					},
				],
				runtimeClassValue: false,
			}),
		],
		needsRuntimeHost: false,
	});

	const project = createProject();
	const result = runLifecycleTransform(
		'<frame className="bg-missing" />',
		project.root,
	);

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0]).toMatchObject({
		category: ts.DiagnosticCategory.Warning,
		code: 89000,
		messageText: expect.stringContaining("unknown-theme-key"),
	});
	expect(path.normalize(result.diagnostics[0].file?.fileName ?? "")).toBe(
		path.normalize(path.join(project.root, "src", "client", "App.tsx")),
	);
	expect(result.diagnostics[0].start).toBeGreaterThanOrEqual(0);

	result.dispose();
});

test("keeps host diagnostic failures visible in the rbxtsc lifecycle", () => {
	mockedCompilerTransform.mockImplementationOnce(() => {
		throw new Error("native compiler invocation failed");
	});

	const project = createProject();
	const result = runLifecycleTransform(
		'<frame className="rounded-md px-4 bg-slate-500" />',
		project.root,
	);

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0]).toMatchObject({
		category: ts.DiagnosticCategory.Error,
		code: 89000,
		messageText: expect.stringContaining("compiler-invocation-failed"),
	});

	result.dispose();
});

test("injects the runtime host when the compiler reports runtime-aware className usage", () => {
	mockedCompilerTransform.mockImplementationOnce(() => ({
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

	const project = createProject();
	const result = runLifecycleTransform(
		'<frame className={condition ? "px-4" : "px-2"} />',
		project.root,
	);

	expect(mockedCompilerTransform).toHaveBeenCalledTimes(1);
	expect(result.transformedSource).toContain(
		'VelaRuntimeHost __velaTag="frame"',
	);
	expect(result.transformedSource).toContain("__createVelaRuntimeHost");
	expect(result.transformedSource).toContain("__VelaRuntimeConfig");
	expect(result.transformedSource).toContain("__VelaReact");
	// Intentional regression checks for the deleted runtime package imports.
	expect(result.transformedSource).not.toContain("@vela-rbxts/runtime");
	expect(result.transformedSource).not.toContain("vela-rbxts/runtime");
	expect(result.transformedSource).not.toContain("../__vela__/runtime-host");
	expect(result.transformedSource).toContain("__velaRules");
	expect(result.transformedSource).toContain(
		'className={condition ? "px-4" : "px-2"}',
	);
	// Intentional regression check for the removed __vela__ runtime artifact directory.
	expect(fs.existsSync(path.join(project.root, "src", "__vela__"))).toBe(false);

	result.dispose();
});

function createProject(): {
	root: string;
	sourceFile: string;
} {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vela-transformer-"));
	const sourceFile = path.join(root, "src", "client", "App.tsx");

	return {
		root,
		sourceFile,
	};
}

test("anchors diagnostics with a compiler range instead of the first text match", () => {
	const sourceText = [
		'const unrelated = "bg-missing in a string";',
		'export const App = () => <frame className="bg-missing" />;',
	].join("\n");
	const tokenStart = sourceText.lastIndexOf("bg-missing");

	mockedCompilerTransform.mockReturnValueOnce({
		code: sourceText,
		diagnostics: [
			{
				level: "warning",
				code: "unknown-theme-key",
				message: "Unknown theme key",
				token: "bg-missing",
				range: { start: tokenStart, end: tokenStart + "bg-missing".length },
			},
		],
		changed: false,
		ir: [],
		needsRuntimeHost: false,
	});

	const project = createProject();
	const result = runLifecycleTransform(sourceText, project.root);

	expect(result.diagnostics[0].start).toBe(tokenStart);
	expect(result.diagnostics[0].length).toBe("bg-missing".length);

	result.dispose();
});

test("falls back to a text match when the compiler reports no range", () => {
	const sourceText =
		'export const App = () => <frame className="bg-missing" />;';

	mockedCompilerTransform.mockReturnValueOnce({
		code: sourceText,
		diagnostics: [
			{
				level: "warning",
				code: "unknown-theme-key",
				message: "Unknown theme key",
				token: "bg-missing",
			},
		],
		changed: false,
		ir: [],
		needsRuntimeHost: false,
	});

	const project = createProject();
	const result = runLifecycleTransform(sourceText, project.root);

	expect(result.diagnostics[0].start).toBe(sourceText.indexOf("bg-missing"));

	result.dispose();
});

test("keeps a file whose lowering reported an error out of the emit", () => {
	mockedCompilerTransform.mockReturnValueOnce({
		code: "<frame BackgroundColor3={Color3.fromRGB(1, 2, 3)} />",
		diagnostics: [
			{
				level: "error",
				code: "invalid-config-json",
				message: "configJson is not a valid vela config",
			},
		],
		changed: true,
		ir: [],
		needsRuntimeHost: false,
	});

	const project = createProject();
	const result = runLifecycleTransform(
		'<frame className="bg-slate-500" />',
		project.root,
	);

	expect(result.transformedSource).toContain('className="bg-slate-500"');
	expect(result.diagnostics[0].category).toBe(ts.DiagnosticCategory.Error);

	result.dispose();
});

test("throws a failure it has no diagnostic channel for rather than emitting the file unlowered", () => {
	mockedCompilerTransform.mockImplementationOnce(() => {
		throw new Error("native compiler invocation failed");
	});

	const project = createProject();
	const sourceFile = ts.createSourceFile(
		project.sourceFile,
		'<frame className="bg-slate-500" />',
		ts.ScriptTarget.ESNext,
		true,
		ts.ScriptKind.TSX,
	);
	const factory = createVelaProgramTransformer(
		{} as ts.Program,
		{ projectRoot: project.root },
		{ ts },
	);
	const context = {} as ts.TransformationContext;

	expect(() => factory(context)(sourceFile)).toThrow(
		"compiler-invocation-failed",
	);
});

test("rejects a lowering that no longer parses", () => {
	mockedCompilerTransform.mockReturnValueOnce({
		code: "<frame BackgroundColor3={ />",
		diagnostics: [],
		changed: true,
		ir: [],
		needsRuntimeHost: false,
	});

	const project = createProject();
	const result = runLifecycleTransform(
		'<frame className="bg-slate-500" />',
		project.root,
	);

	expect(result.transformedSource).toContain('className="bg-slate-500"');
	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0]).toMatchObject({
		category: ts.DiagnosticCategory.Error,
		messageText: expect.stringContaining("transformed-source-invalid"),
	});

	result.dispose();
});

test("fails a build whose config broke even when no file changed", () => {
	const project = createProject();
	fs.mkdirSync(path.dirname(project.sourceFile), { recursive: true });
	fs.writeFileSync(
		path.join(project.root, "vela.config.json"),
		JSON.stringify({
			theme: { extend: { colors: { surface: { raised: "Color3.new()" } } } },
		}),
	);
	const sourceText = '<frame className="bg-surface" />';
	fs.writeFileSync(project.sourceFile, sourceText);
	const program = {
		getCurrentDirectory: () => project.root,
		getSourceFiles: () => [
			ts.createSourceFile(
				project.sourceFile,
				sourceText,
				ts.ScriptTarget.ESNext,
				true,
				ts.ScriptKind.TSX,
			),
		],
	} as unknown as ts.Program;
	const factory = createVelaProgramTransformer(program, {}, { ts });
	const result = ts.transform([] as ts.SourceFile[], [factory]);

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics?.[0]).toMatchObject({
		category: ts.DiagnosticCategory.Error,
		file: undefined,
		messageText: expect.stringContaining("config-resolution-failed"),
	});
	expect(mockedCompilerTransform).not.toHaveBeenCalled();

	result.dispose();
});
