import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { expect, test, vi } from "vitest";
import { createVelaRbxtsLanguageServicePlugin } from "../src/plugin";
import { VELA_RBXTS_COMPLETION_SOURCE } from "../src/translate";

function positionAfter(source: string, needle: string) {
	const index = source.indexOf(needle);
	if (index < 0) {
		throw new Error(`Missing test needle: ${needle}`);
	}
	return index + needle.length;
}

function createSourceFile(
	fileName: string,
	source: string,
	scriptKind: ts.ScriptKind = ts.ScriptKind.TSX,
) {
	return ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind,
	);
}

function createLanguageService(
	fileName: string,
	sourceFile: ts.SourceFile,
	overrides: Partial<ts.LanguageService> = {},
) {
	return {
		getProgram: () => ({
			getSourceFile: (requestedFileName: string) =>
				requestedFileName === fileName ? sourceFile : undefined,
		}),
		getCompletionsAtPosition: () => undefined,
		getCompletionEntryDetails: () => undefined,
		getQuickInfoAtPosition: () => undefined,
		getSemanticDiagnostics: () => [],
		...overrides,
	} as unknown as ts.LanguageService;
}

function createPlugin(
	fileName: string,
	sourceFile: ts.SourceFile,
	overrides: Partial<ts.LanguageService> = {},
) {
	return createVelaRbxtsLanguageServicePlugin(ts, {
		languageService: createLanguageService(fileName, sourceFile, overrides),
		languageServiceHost: {},
	} as unknown as ts.server.PluginCreateInfo);
}

test("uses compiler default completions when project config is absent", () => {
	const fileName = "/tmp/vela-rbxts-no-config/src/view.tsx";
	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = createSourceFile(fileName, source);
	const plugin = createPlugin(fileName, sourceFile);

	expect(
		plugin
			.getCompletionsAtPosition(fileName, positionAfter(source, "bg-"), {})
			?.entries.map((entry) => entry.name),
	).toContain("bg-surface");
});

test("does not add Vela completions outside supported className contexts", () => {
	const fileName = "/tmp/vela-rbxts-no-context/src/view.tsx";
	const source = "const value = bg;";
	const sourceFile = createSourceFile(fileName, source);
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

	const plugin = createPlugin(fileName, sourceFile, {
		getCompletionsAtPosition: () => nativeCompletion,
	});

	expect(plugin.getCompletionsAtPosition(fileName, source.length, {})).toBe(
		nativeCompletion,
	);
});

test("merges Vela completions with native completions without duplicates", () => {
	const fileName = "/tmp/vela-rbxts-merge/src/view.tsx";
	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = createSourceFile(fileName, source);
	const nativeCompletion: ts.WithMetadata<ts.CompletionInfo> = {
		isGlobalCompletion: false,
		isMemberCompletion: false,
		isNewIdentifierLocation: false,
		entries: [
			{
				name: "bg-surface",
				kind: ts.ScriptElementKind.string,
				kindModifiers: "",
				sortText: "2",
			},
			{
				name: "native",
				kind: ts.ScriptElementKind.string,
				kindModifiers: "",
				sortText: "3",
			},
		],
	};

	const plugin = createPlugin(fileName, sourceFile, {
		getCompletionsAtPosition: () => nativeCompletion,
	});

	const completions = plugin.getCompletionsAtPosition(
		fileName,
		positionAfter(source, "bg-"),
		{},
	);

	expect(
		completions?.entries.filter((entry) => entry.name === "bg-surface"),
	).toHaveLength(1);
	expect(
		completions?.entries.find((entry) => entry.name === "bg-surface")?.source,
	).toBe(VELA_RBXTS_COMPLETION_SOURCE);
	expect(completions?.entries.some((entry) => entry.name === "native")).toBe(
		true,
	);
});

test("labels plugin completion entries with vela-rbxts source", () => {
	const fileName = "/tmp/vela-rbxts-source-label/src/view.tsx";
	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = createSourceFile(fileName, source);
	const plugin = createPlugin(fileName, sourceFile);

	const completions = plugin.getCompletionsAtPosition(
		fileName,
		positionAfter(source, "bg-"),
		{},
	);

	expect(
		completions?.entries.some((entry) => entry.name === "bg-surface"),
	).toBe(true);
	expect(
		completions?.entries.find((entry) => entry.name === "bg-surface")?.source,
	).toBe(VELA_RBXTS_COMPLETION_SOURCE);
});

test("provides replacement spans for partial tokens inside multi-token className", () => {
	const fileName = "/tmp/vela-rbxts-replacement-span/src/view.tsx";
	const source = 'const view = <frame className="rounded-md bg-su px-4" />;';
	const sourceFile = createSourceFile(fileName, source);
	const plugin = createPlugin(fileName, sourceFile);

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

test("provides zero-length replacement spans at token boundaries and in empty className strings", () => {
	const boundaryFileName = "/tmp/vela-rbxts-boundary/src/view.tsx";
	const boundarySource =
		'const view = <frame className="rounded-md bg- px-4" />;';
	const boundarySourceFile = createSourceFile(boundaryFileName, boundarySource);
	const boundaryPlugin = createPlugin(boundaryFileName, boundarySourceFile);

	const boundaryPosition = boundarySource.indexOf("bg-") + "bg-".length;
	const boundaryCompletions = boundaryPlugin.getCompletionsAtPosition(
		boundaryFileName,
		boundaryPosition,
		{},
	);
	const boundaryEntry = boundaryCompletions?.entries.find((candidate) =>
		candidate.name.startsWith("bg-"),
	);

	expect(boundaryEntry?.replacementSpan).toEqual({
		start: boundarySource.indexOf("bg-"),
		length: "bg-".length,
	});

	const emptyFileName = "/tmp/vela-rbxts-empty/src/view.tsx";
	const emptySource = 'const view = <frame className="" />;';
	const emptySourceFile = createSourceFile(emptyFileName, emptySource);
	const emptyPlugin = createPlugin(emptyFileName, emptySourceFile);

	const emptyPosition = positionAfter(emptySource, 'className="');
	const emptyCompletions = emptyPlugin.getCompletionsAtPosition(
		emptyFileName,
		emptyPosition,
		{},
	);

	expect(emptyCompletions?.entries.length).toBeGreaterThan(0);
	expect(emptyCompletions?.entries[0].replacementSpan).toEqual({
		start: emptyPosition,
		length: 0,
	});
});

test("offers completions between whitespace-separated tokens", () => {
	const fileName = "/tmp/vela-rbxts-between-tokens/src/view.tsx";
	const source = 'const view = <frame className="rounded-md  bg- px-4" />;';
	const sourceFile = createSourceFile(fileName, source);
	const plugin = createPlugin(fileName, sourceFile);

	const cursorPosition = source.indexOf("  ") + 1;
	const completions = plugin.getCompletionsAtPosition(
		fileName,
		cursorPosition,
		{},
	);
	const entry = completions?.entries.find((candidate) =>
		candidate.name.startsWith("bg-"),
	);

	expect(entry).toBeDefined();
	expect(entry?.replacementSpan).toEqual({
		start: cursorPosition,
		length: 0,
	});
});

test("returns vela completion details only for branded completion entries", () => {
	const fileName = "/tmp/vela-rbxts-details/src/view.tsx";
	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = createSourceFile(fileName, source);
	const nativeDetails = {
		name: "native",
		kind: ts.ScriptElementKind.string,
		kindModifiers: "",
		displayParts: [{ text: "native", kind: "text" }],
		documentation: [{ text: "native details", kind: "text" }],
		tags: [],
	};
	const getCompletionEntryDetails = vi.fn(() => nativeDetails);
	const getCompletionsAtPosition = vi.fn(() => {
		throw new Error("detail resolution should not recompute completions");
	});
	const plugin = createPlugin(fileName, sourceFile, {
		getCompletionsAtPosition,
		getCompletionEntryDetails,
	});

	const velaDetails = plugin.getCompletionEntryDetails(
		fileName,
		positionAfter(source, "bg-"),
		"bg-surface",
		{},
		VELA_RBXTS_COMPLETION_SOURCE,
		undefined,
		{
			__velaRbxts: true,
			label: "bg-surface",
			documentation: "Set Roblox BackgroundColor3 from theme color `surface`.",
		} as unknown as ts.CompletionEntryData,
	);

	expect(velaDetails?.name).toBe("bg-surface");
	expect(getCompletionsAtPosition).not.toHaveBeenCalled();

	const nativeResult = plugin.getCompletionEntryDetails(
		fileName,
		positionAfter(source, "bg-"),
		"native",
		{},
		undefined,
		undefined,
		undefined,
	);

	expect(nativeResult).toBe(nativeDetails);
	expect(getCompletionEntryDetails).toHaveBeenCalledTimes(1);
	expect(getCompletionsAtPosition).not.toHaveBeenCalled();
});

test("prefers vela hover results when available and falls back to typescript quick info otherwise", () => {
	const fileName = "/tmp/vela-rbxts-hover/src/view.tsx";
	const source = 'const view = <frame className="bg-surface" />;';
	const sourceFile = createSourceFile(fileName, source);
	const nativeQuickInfo: ts.QuickInfo = {
		kind: ts.ScriptElementKind.string,
		kindModifiers: "",
		textSpan: { start: 0, length: 0 },
		displayParts: [{ text: "native hover", kind: "text" }],
		documentation: [{ text: "native docs", kind: "text" }],
		tags: [],
	};
	const getQuickInfoAtPosition = vi.fn(
		(_fileName: string, _position: number) => nativeQuickInfo,
	);
	const plugin = createPlugin(fileName, sourceFile, {
		getQuickInfoAtPosition,
	});

	const velaHover = plugin.getQuickInfoAtPosition(
		fileName,
		positionAfter(source, "bg-surface"),
	);

	expect(velaHover?.displayParts?.[0].text).toContain("bg-surface");
	expect(velaHover?.textSpan).toEqual({
		start: source.indexOf("bg-surface"),
		length: "bg-surface".length,
	});
	expect(getQuickInfoAtPosition).not.toHaveBeenCalled();

	const fallbackSource = 'const view = <frame className="unknown" />;';
	const fallbackSourceFile = createSourceFile(fileName, fallbackSource);
	const fallbackPlugin = createPlugin(fileName, fallbackSourceFile, {
		getQuickInfoAtPosition,
	});

	const fallbackHover = fallbackPlugin.getQuickInfoAtPosition(
		fileName,
		positionAfter(fallbackSource, "unknown"),
	);

	expect(fallbackHover).toBe(nativeQuickInfo);
	const lastCall = getQuickInfoAtPosition.mock.calls.at(-1);
	expect(lastCall).toEqual([
		fileName,
		positionAfter(fallbackSource, "unknown"),
	]);
});

test("appends vela diagnostics without dropping native diagnostics", () => {
	const fileName = "/tmp/vela-rbxts-diagnostics/src/view.tsx";
	const source = 'const view = <frame className="bg-not-a-real-color" />;';
	const sourceFile = createSourceFile(fileName, source);
	const nativeDiagnostic = {
		file: sourceFile,
		start: 0,
		length: 5,
		category: ts.DiagnosticCategory.Warning,
		code: 1234,
		source: "typescript",
		messageText: "native diagnostic",
	} satisfies ts.Diagnostic;
	const plugin = createPlugin(fileName, sourceFile, {
		getSemanticDiagnostics: () => [nativeDiagnostic],
	});

	const diagnostics = plugin.getSemanticDiagnostics(fileName);

	expect(diagnostics).toContain(nativeDiagnostic);
	expect(
		diagnostics.some(
			(diagnostic) => diagnostic.source === VELA_RBXTS_COMPLETION_SOURCE,
		),
	).toBe(true);
	expect(
		diagnostics.filter(
			(diagnostic) => diagnostic.source === VELA_RBXTS_COMPLETION_SOURCE,
		).length,
	).toBeGreaterThan(0);
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
	const sourceFile = createSourceFile(sourceFilePath, source);
	const plugin = createPlugin(sourceFilePath, sourceFile);

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

test("uses custom config completions when rbxtw.config.ts resolves", () => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "vela-rbxts-custom-config-"),
	);
	const sourceFilePath = path.join(root, "src", "view.tsx");
	fs.mkdirSync(path.dirname(sourceFilePath), { recursive: true });
	fs.writeFileSync(
		path.join(root, "rbxtw.config.ts"),
		[
			"export default defineConfig({",
			"\ttheme: {",
			"\t\tcolors: {",
			'\t\t\tbrand: "#123456",',
			"\t\t},",
			"\t},",
			"});",
		].join("\n"),
		"utf8",
	);

	const source = 'const view = <frame className="bg-" />;';
	const sourceFile = createSourceFile(sourceFilePath, source);
	const plugin = createPlugin(sourceFilePath, sourceFile);

	const completions = plugin.getCompletionsAtPosition(
		sourceFilePath,
		positionAfter(source, "bg-"),
		{},
	);

	expect(completions?.entries.map((entry) => entry.name)).toContain("bg-brand");

	fs.rmSync(root, { recursive: true, force: true });
});
