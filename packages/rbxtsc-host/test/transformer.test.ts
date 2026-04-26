import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transform as compilerTransform } from "@vela-rbxts/compiler";
import ts from "typescript";
import { beforeEach, expect, test, vi } from "vitest";

import createRbxtsTailwindProgramTransformer from "../src/transformer";

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
	const transformerFactory = createRbxtsTailwindProgramTransformer(
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
		code: '<frame __rbxtsTailwindTag="frame" __rbxtsTailwindRules={[{ condition: { kind: "orientation", value: "portrait" }, effects: { props: [], helpers: [] } }]} />',
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
			"const RbxtsTailwindRuntimeHost = __createVelaRuntimeHost(__VelaRuntimeConfig);",
			'<RbxtsTailwindRuntimeHost __rbxtsTailwindTag="frame" __rbxtsTailwindRules={[{ condition: { kind: "width", alias: "md", minWidth: 768, maxWidth: null }, effects: { props: [{ name: "PaddingLeft", value: "new UDim(0, 12)" }], helpers: [] } }]} className={condition ? "px-4" : "px-2"} />',
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
		'RbxtsTailwindRuntimeHost __rbxtsTailwindTag="frame"',
	);
	expect(result.transformedSource).toContain("__createVelaRuntimeHost");
	expect(result.transformedSource).toContain("__VelaRuntimeConfig");
	expect(result.transformedSource).toContain("__VelaReact");
	// Intentional regression checks for the deleted runtime package imports.
	expect(result.transformedSource).not.toContain("@vela-rbxts/runtime");
	expect(result.transformedSource).not.toContain("vela-rbxts/runtime");
	expect(result.transformedSource).not.toContain("../__vela__/runtime-host");
	expect(result.transformedSource).toContain("__rbxtsTailwindRules");
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
