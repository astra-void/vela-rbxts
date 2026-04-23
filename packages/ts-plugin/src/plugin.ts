import {
	type CompletionItem,
	getCompletions,
	getDiagnostics,
	getHover,
} from "@vela-rbxts/compiler";
import type ts from "typescript/lib/tsserverlibrary";
import { resolveEditorOptions } from "./config.js";
import {
	getSupportedClassNameContextAtPosition,
	hasSupportedClassNameContext,
} from "./context.js";
import {
	isVelaRbxtsCompletionData,
	toCompletionDetails,
	toCompletionEntry,
	toQuickInfo,
	toTsDiagnostic,
	VELA_RBXTS_COMPLETION_SOURCE,
} from "./translate.js";

export function createVelaRbxtsLanguageServicePlugin(
	typescript: typeof ts,
	info: ts.server.PluginCreateInfo,
): ts.LanguageService {
	const languageService = info.languageService;
	const languageServiceHost = info.languageServiceHost;
	const proxy = Object.create(null) as ts.LanguageService;

	for (const key of Object.keys(languageService) as Array<
		keyof ts.LanguageService
	>) {
		const value = languageService[key];
		(proxy as Record<keyof ts.LanguageService, unknown>)[key] =
			typeof value === "function" ? value.bind(languageService) : value;
	}

	proxy.getCompletionsAtPosition = (
		fileName,
		position,
		options,
		formatting,
	) => {
		const prior = languageService.getCompletionsAtPosition(
			fileName,
			position,
			options,
			formatting,
		);
		const sourceFile = getSourceFile(
			typescript,
			languageService,
			languageServiceHost,
			fileName,
		);
		if (
			!sourceFile ||
			!getSupportedClassNameContextAtPosition(typescript, sourceFile, position)
		) {
			return prior;
		}

		let response: ReturnType<typeof getCompletions>;
		try {
			response = getCompletions({
				source: sourceFile.getFullText(),
				position,
				options: resolveEditorOptions(fileName),
			});
		} catch {
			return prior;
		}

		if (!response.isInClassNameContext || response.items.length === 0) {
			return prior;
		}

		const entries = sortCompletionEntries(
			response.items.map((item) => toCompletionEntry(typescript, item)),
		);

		if (prior) {
			return {
				...prior,
				entries: mergeCompletionEntries(entries, prior.entries),
			};
		}

		return {
			isGlobalCompletion: false,
			isMemberCompletion: false,
			isNewIdentifierLocation: false,
			entries,
		};
	};

	proxy.getCompletionEntryDetails = (
		fileName,
		position,
		entryName,
		formatOptions,
		source,
		preferences,
		data,
	) => {
		const sourceFile = getSourceFile(
			typescript,
			languageService,
			languageServiceHost,
			fileName,
		);

		if (
			source === VELA_RBXTS_COMPLETION_SOURCE &&
			isVelaRbxtsCompletionData(data) &&
			sourceFile &&
			getSupportedClassNameContextAtPosition(typescript, sourceFile, position)
		) {
			return toCompletionDetails(typescript, {
				label: data.label,
				insertText: data.label,
				kind: "utility",
				category: "utility",
				documentation: data.documentation,
			});
		}

		return languageService.getCompletionEntryDetails(
			fileName,
			position,
			entryName,
			formatOptions,
			source,
			preferences,
			data,
		);
	};

	proxy.getQuickInfoAtPosition = (fileName, position) => {
		const sourceFile = getSourceFile(
			typescript,
			languageService,
			languageServiceHost,
			fileName,
		);
		if (
			sourceFile &&
			getSupportedClassNameContextAtPosition(typescript, sourceFile, position)
		) {
			let quickInfo: ts.QuickInfo | undefined;
			try {
				quickInfo = toQuickInfo(
					typescript,
					getHover({
						source: sourceFile.getFullText(),
						position,
						options: resolveEditorOptions(fileName),
					}),
				);
			} catch {
				quickInfo = undefined;
			}
			if (quickInfo) {
				return quickInfo;
			}
		}

		return languageService.getQuickInfoAtPosition(fileName, position);
	};

	proxy.getSemanticDiagnostics = (fileName) => {
		const prior = languageService.getSemanticDiagnostics(fileName);
		const sourceFile = getSourceFile(
			typescript,
			languageService,
			languageServiceHost,
			fileName,
		);
		if (!sourceFile || !hasSupportedClassNameContext(typescript, sourceFile)) {
			return prior;
		}

		let response: ReturnType<typeof getDiagnostics>;
		try {
			response = getDiagnostics({
				source: sourceFile.getFullText(),
				options: resolveEditorOptions(fileName),
			});
		} catch {
			return prior;
		}

		const pluginDiagnostics = response.diagnostics.map((diagnostic) =>
			toTsDiagnostic(typescript, sourceFile, diagnostic),
		);

		if (pluginDiagnostics.length === 0) {
			return prior;
		}

		return dedupeDiagnostics([...prior, ...pluginDiagnostics]);
	};

	return proxy;
}

export const createRbxtsTailwindLanguageServicePlugin =
	createVelaRbxtsLanguageServicePlugin;

export function findCompletionItem(
	items: readonly CompletionItem[],
	label: string,
): CompletionItem | undefined {
	return items.find((item) => item.label === label);
}

function getSourceFile(
	typescript: typeof ts,
	languageService: ts.LanguageService,
	languageServiceHost: ts.LanguageServiceHost,
	fileName: string,
): ts.SourceFile | undefined {
	const program = languageService.getProgram();
	const sourceFile = program?.getSourceFile(fileName);
	if (sourceFile) {
		return sourceFile;
	}

	const snapshot = languageServiceHost.getScriptSnapshot?.(fileName);
	if (!snapshot) {
		return undefined;
	}

	return typescript.createSourceFile(
		fileName,
		snapshot.getText(0, snapshot.getLength()),
		typescript.ScriptTarget.Latest,
		true,
		scriptKindForFileName(typescript, fileName),
	);
}

function scriptKindForFileName(
	typescript: typeof ts,
	fileName: string,
): ts.ScriptKind {
	if (fileName.endsWith(".tsx")) {
		return typescript.ScriptKind.TSX;
	}
	if (fileName.endsWith(".jsx")) {
		return typescript.ScriptKind.JSX;
	}
	if (fileName.endsWith(".js")) {
		return typescript.ScriptKind.JS;
	}
	return typescript.ScriptKind.TS;
}

function mergeCompletionEntries(
	pluginEntries: readonly ts.CompletionEntry[],
	priorEntries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
	const merged: ts.CompletionEntry[] = [];
	const seen = new Set<string>();

	for (const entry of [...pluginEntries, ...priorEntries]) {
		const key = entry.name;
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		merged.push(entry);
	}

	return merged;
}

function sortCompletionEntries(
	entries: readonly ts.CompletionEntry[],
): ts.CompletionEntry[] {
	return [...entries].sort((left, right) => {
		const leftSort = left.sortText ?? "";
		const rightSort = right.sortText ?? "";
		if (leftSort !== rightSort) {
			return leftSort.localeCompare(rightSort);
		}

		if (left.name !== right.name) {
			return left.name.localeCompare(right.name);
		}

		return (left.source ?? "").localeCompare(right.source ?? "");
	});
}

function dedupeDiagnostics(
	diagnostics: readonly ts.Diagnostic[],
): ts.Diagnostic[] {
	const deduped: ts.Diagnostic[] = [];
	const seen = new Set<string>();

	for (const diagnostic of diagnostics) {
		const key = `${diagnostic.source ?? ""}::${diagnostic.code}::${diagnostic.start ?? -1}::${diagnostic.length ?? -1}::${String(diagnostic.messageText)}`;
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(diagnostic);
	}

	return deduped;
}
