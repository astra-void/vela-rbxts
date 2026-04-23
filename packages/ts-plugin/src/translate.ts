import type {
	CompletionItem,
	EditorDiagnostic,
	HoverResponse,
} from "@vela-rbxts/compiler";
import type ts from "typescript/lib/tsserverlibrary";

export const VELA_RBXTS_COMPLETION_SOURCE = "vela-rbxts";

type VelaRbxtsCompletionData = {
	__velaRbxts: true;
	label: string;
	documentation: string;
};

export function isVelaRbxtsCompletionData(
	value: unknown,
): value is VelaRbxtsCompletionData {
	return (
		typeof value === "object" &&
		value !== null &&
		"__velaRbxts" in value &&
		(value as { __velaRbxts?: unknown }).__velaRbxts === true &&
		"label" in value &&
		typeof (value as { label?: unknown }).label === "string" &&
		"documentation" in value &&
		typeof (value as { documentation?: unknown }).documentation === "string"
	);
}

export function toCompletionEntry(
	typescript: typeof ts,
	item: CompletionItem,
): ts.CompletionEntry {
	return {
		name: item.label,
		kind: typescript.ScriptElementKind.string,
		kindModifiers: "",
		sortText: item.category === "variant" ? "0" : "1",
		insertText: item.insertText,
		replacementSpan: item.replacement
			? toTextSpan(item.replacement.start, item.replacement.end)
			: undefined,
		source: VELA_RBXTS_COMPLETION_SOURCE,
		data: {
			__velaRbxts: true,
			label: item.label,
			documentation: item.documentation,
		} as unknown as ts.CompletionEntryData,
	};
}

export function toCompletionDetails(
	typescript: typeof ts,
	item: CompletionItem,
): ts.CompletionEntryDetails {
	return {
		name: item.label,
		kind: typescript.ScriptElementKind.string,
		kindModifiers: "",
		displayParts: [
			{
				text: item.label,
				kind: "text",
			},
		],
		documentation: [
			{
				text: item.documentation,
				kind: "text",
			},
		],
		tags: [],
	};
}

export function toQuickInfo(
	typescript: typeof ts,
	hover: HoverResponse,
): ts.QuickInfo | undefined {
	if (!hover.contents || !hover.range) {
		return undefined;
	}

	return {
		kind: typescript.ScriptElementKind.string,
		kindModifiers: "",
		textSpan: toTextSpan(hover.range.start, hover.range.end),
		displayParts: [
			{
				text: hover.contents.display,
				kind: "text",
			},
		],
		documentation: [
			{
				text: hover.contents.documentation,
				kind: "text",
			},
		],
		tags: [],
	};
}

export function toTsDiagnostic(
	typescript: typeof ts,
	file: ts.SourceFile,
	diagnostic: EditorDiagnostic,
): ts.Diagnostic {
	const start = diagnostic.range?.start ?? 0;
	const end = diagnostic.range?.end ?? start;

	return {
		file,
		start,
		length: Math.max(0, end - start),
		category:
			diagnostic.level === "error"
				? typescript.DiagnosticCategory.Error
				: typescript.DiagnosticCategory.Warning,
		code: diagnosticCode(diagnostic.code),
		source: VELA_RBXTS_COMPLETION_SOURCE,
		messageText: diagnostic.message,
	};
}

function toTextSpan(start: number, end: number): ts.TextSpan {
	return {
		start,
		length: Math.max(0, end - start),
	};
}

function diagnosticCode(code: string): number {
	let hash = 0;
	for (const char of code) {
		hash = (hash * 31 + char.charCodeAt(0)) % 10000;
	}
	return 9000 + hash;
}
