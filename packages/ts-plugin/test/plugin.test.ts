import ts from "typescript";
import { expect, test } from "vitest";
import { getSupportedClassNameContextAtPosition } from "../src/context";
import { createRbxtsTailwindLanguageServicePlugin } from "../src/plugin";

function positionAfter(source: string, needle: string) {
	const index = source.indexOf(needle);
	if (index < 0) {
		throw new Error(`Missing test needle: ${needle}`);
	}
	return index + needle.length;
}

test("detects supported TSX className string contexts", () => {
	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = ts.createSourceFile(
		"view.tsx",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);

	expect(
		getSupportedClassNameContextAtPosition(
			ts,
			sourceFile,
			positionAfter(source, "bg-"),
		),
	).toEqual({
		elementTag: "frame",
		range: {
			start: source.indexOf("bg-"),
			end: source.indexOf("bg-") + "bg-".length,
		},
	});
});

test("ignores unsupported TSX host element className strings", () => {
	const source = 'const view = <part className="bg-" />;';
	const sourceFile = ts.createSourceFile(
		"view.tsx",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);

	expect(
		getSupportedClassNameContextAtPosition(
			ts,
			sourceFile,
			positionAfter(source, "bg-"),
		),
	).toBeUndefined();
});

test("uses compiler default completions when project config is absent", () => {
	const fileName = "/tmp/rbxts-tailwind-no-config/src/view.tsx";
	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const languageService = {
		getProgram: () => ({
			getSourceFile: (requestedFileName: string) =>
				requestedFileName === fileName ? sourceFile : undefined,
		}),
		getCompletionsAtPosition: () => undefined,
		getCompletionEntryDetails: () => undefined,
		getQuickInfoAtPosition: () => undefined,
		getSemanticDiagnostics: () => [],
	} as unknown as ts.LanguageService;
	const plugin = createRbxtsTailwindLanguageServicePlugin(ts, {
		languageService,
	} as ts.server.PluginCreateInfo);

	expect(
		plugin
			.getCompletionsAtPosition(fileName, positionAfter(source, "bg-"), {})
			?.entries.map((entry) => entry.name),
	).toContain("bg-surface");
});
