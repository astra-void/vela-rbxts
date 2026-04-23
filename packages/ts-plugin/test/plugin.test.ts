import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";
import { getSupportedClassNameContextAtPosition } from "../src/context";
import { createVelaRbxtsLanguageServicePlugin } from "../src/plugin";
import { VELA_RBXTS_COMPLETION_SOURCE } from "../src/translate";

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
	const fileName = "/tmp/vela-rbxts-no-config/src/view.tsx";
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
	const plugin = createVelaRbxtsLanguageServicePlugin(ts, {
		languageService,
		languageServiceHost: {},
	} as unknown as ts.server.PluginCreateInfo);

	expect(
		plugin
			.getCompletionsAtPosition(fileName, positionAfter(source, "bg-"), {})
			?.entries.map((entry) => entry.name),
	).toContain("bg-surface");
});

test("does not override native completions outside supported className contexts", () => {
	const fileName = "/tmp/vela-rbxts-no-context/src/view.tsx";
	const source = "const value = bg;";
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const nativeCompletion: ts.WithMetadata<ts.CompletionInfo> = {
		isGlobalCompletion: false,
		isMemberCompletion: false,
		isNewIdentifierLocation: false,
		entries: [
			{
				name: "native",
				kind: ts.ScriptElementKind.string,
				kindModifiers: "",
				sortText: "1",
			},
		],
	};

	const languageService = {
		getProgram: () => ({
			getSourceFile: (requestedFileName: string) =>
				requestedFileName === fileName ? sourceFile : undefined,
		}),
		getCompletionsAtPosition: () => nativeCompletion,
		getCompletionEntryDetails: () => undefined,
		getQuickInfoAtPosition: () => undefined,
		getSemanticDiagnostics: () => [],
	} as unknown as ts.LanguageService;

	const plugin = createVelaRbxtsLanguageServicePlugin(ts, {
		languageService,
		languageServiceHost: {},
	} as unknown as ts.server.PluginCreateInfo);

	expect(plugin.getCompletionsAtPosition(fileName, source.length, {})).toBe(
		nativeCompletion,
	);
});

test("labels plugin completion entries with vela-rbxts source", () => {
	const fileName = "/tmp/vela-rbxts-source-label/src/view.tsx";
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
	const plugin = createVelaRbxtsLanguageServicePlugin(ts, {
		languageService,
		languageServiceHost: {},
	} as unknown as ts.server.PluginCreateInfo);

	const completions = plugin.getCompletionsAtPosition(
		fileName,
		positionAfter(source, "bg-"),
		{},
	);

	expect(completions?.entries.some((entry) => entry.name === "bg-surface")).toBe(
		true,
	);
	expect(
		completions?.entries.find((entry) => entry.name === "bg-surface")?.source,
	).toBe(VELA_RBXTS_COMPLETION_SOURCE);
});

test("provides replacement spans for partial tokens inside multi-token className", () => {
	const fileName = "/tmp/vela-rbxts-replacement-span/src/view.tsx";
	const source = 'const view = <frame className="rounded-md bg-su px-4" />;';
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
	const plugin = createVelaRbxtsLanguageServicePlugin(ts, {
		languageService,
		languageServiceHost: {},
	} as unknown as ts.server.PluginCreateInfo);

	const tokenStart = source.indexOf("bg-su");
	const tokenEnd = tokenStart + "bg-su".length;
	const cursorPosition = tokenStart + "bg-su".length;

	const completions = plugin.getCompletionsAtPosition(
		fileName,
		cursorPosition,
		{},
	);
	const entry = completions?.entries.find((candidate) =>
		candidate.name.startsWith("bg-su"),
	);

	expect(entry).toBeDefined();
	expect(entry?.replacementSpan).toEqual({
		start: tokenStart,
		length: tokenEnd - tokenStart,
	});
});

test("falls back to defaults when loading rbxtw.config.ts fails", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vela-rbxts-plugin-"));
	const sourceFilePath = path.join(root, "src", "view.tsx");
	fs.mkdirSync(path.dirname(sourceFilePath), { recursive: true });
	fs.writeFileSync(
		path.join(root, "rbxtw.config.ts"),
		"export default defineConfig({",
		"utf8",
	);

	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = ts.createSourceFile(
		sourceFilePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const languageService = {
		getProgram: () => ({
			getSourceFile: (requestedFileName: string) =>
				requestedFileName === sourceFilePath ? sourceFile : undefined,
		}),
		getCompletionsAtPosition: () => undefined,
		getCompletionEntryDetails: () => undefined,
		getQuickInfoAtPosition: () => undefined,
		getSemanticDiagnostics: () => [],
	} as unknown as ts.LanguageService;
	const plugin = createVelaRbxtsLanguageServicePlugin(ts, {
		languageService,
		languageServiceHost: {},
	} as unknown as ts.server.PluginCreateInfo);

	const completions = plugin.getCompletionsAtPosition(
		sourceFilePath,
		positionAfter(source, "bg-"),
		{},
	);

	expect(completions?.entries.map((entry) => entry.name)).toContain(
		"bg-surface",
	);

	fs.rmSync(root, { recursive: true, force: true });
});
