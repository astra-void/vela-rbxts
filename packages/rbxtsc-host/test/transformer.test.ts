import { transform as compilerTransform } from "@rbxts-tailwind/compiler";
import ts from "typescript";
import { beforeEach, expect, test, vi } from "vitest";

import createRbxtsTailwindProgramTransformer from "../src/transformer";

vi.mock("@rbxts-tailwind/compiler", () => ({
	transform: vi.fn(() => ({
		code: "<frame BackgroundColor3={Color3.fromRGB(40, 48, 66)} />",
		diagnostics: [],
		changed: true,
	})),
}));

const mockedCompilerTransform = vi.mocked(compilerTransform);

function runLifecycleTransform(sourceText: string) {
	const sourceFile = ts.createSourceFile(
		"src/client/App.tsx",
		sourceText,
		ts.ScriptTarget.ESNext,
		true,
		ts.ScriptKind.TSX,
	);
	const transformerFactory = createRbxtsTailwindProgramTransformer(
		{} as ts.Program,
		{},
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
	const result = runLifecycleTransform(
		'<frame className="rounded-md px-4 bg-surface" />',
	);

	expect(mockedCompilerTransform).toHaveBeenCalledTimes(1);
	expect(result.transformedSource).toContain("BackgroundColor3");
	expect(result.transformedSource).not.toContain("className=");
	expect(result.diagnostics).toHaveLength(0);

	result.dispose();
});

test("skips non-eligible files before compiler invocation", () => {
	const result = runLifecycleTransform(
		"export const value = React.createElement('frame');",
	);

	expect(mockedCompilerTransform).not.toHaveBeenCalled();
	expect(result.transformedSource).toContain("export const value");

	result.dispose();
});

test("bridges compiler diagnostics into TypeScript diagnostics", () => {
	mockedCompilerTransform.mockReturnValueOnce({
		code: '<frame className="bg-missing" />',
		diagnostics: [
			{
				level: "warning",
				code: "unknown-theme-key",
				message: "Unknown theme key",
				token: "bg-missing",
			},
		],
		changed: false,
	});

	const result = runLifecycleTransform('<frame className="bg-missing" />');

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0]).toMatchObject({
		category: ts.DiagnosticCategory.Warning,
		code: 89000,
		messageText: expect.stringContaining("unknown-theme-key"),
	});
	expect(result.diagnostics[0].file?.fileName).toBe("src/client/App.tsx");
	expect(result.diagnostics[0].start).toBeGreaterThanOrEqual(0);

	result.dispose();
});

test("keeps host diagnostic failures visible in the rbxtsc lifecycle", () => {
	mockedCompilerTransform.mockImplementationOnce(() => {
		throw new Error("native compiler invocation failed");
	});

	const result = runLifecycleTransform(
		'<frame className="rounded-md px-4 bg-surface" />',
	);

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0]).toMatchObject({
		category: ts.DiagnosticCategory.Error,
		code: 89000,
		messageText: expect.stringContaining("compiler-invocation-failed"),
	});

	result.dispose();
});
