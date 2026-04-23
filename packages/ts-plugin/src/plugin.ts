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
	toCompletionDetails,
	toCompletionEntry,
	toQuickInfo,
	toTsDiagnostic,
} from "./translate.js";

export function createRbxtsTailwindLanguageServicePlugin(
	typescript: typeof ts,
	info: ts.server.PluginCreateInfo,
): ts.LanguageService {
	const languageService = info.languageService;
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
		const sourceFile = getSourceFile(languageService, fileName);
		if (
			!sourceFile ||
			!getSupportedClassNameContextAtPosition(typescript, sourceFile, position)
		) {
			return prior;
		}

		const response = getCompletions({
			source: sourceFile.getFullText(),
			position,
			options: resolveEditorOptions(fileName),
		});

		if (!response.isInClassNameContext || response.items.length === 0) {
			return prior;
		}

		const entries = response.items.map((item) =>
			toCompletionEntry(typescript, item),
		);

		if (prior) {
			return {
				...prior,
				entries: [...entries, ...prior.entries],
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
		const sourceFile = getSourceFile(languageService, fileName);
		if (
			sourceFile &&
			getSupportedClassNameContextAtPosition(typescript, sourceFile, position)
		) {
			const response = getCompletions({
				source: sourceFile.getFullText(),
				position,
				options: resolveEditorOptions(fileName),
			});
			const item = response.items.find(
				(candidate) => candidate.label === entryName,
			);
			if (item) {
				return toCompletionDetails(typescript, item);
			}
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
		const sourceFile = getSourceFile(languageService, fileName);
		if (
			sourceFile &&
			getSupportedClassNameContextAtPosition(typescript, sourceFile, position)
		) {
			const quickInfo = toQuickInfo(
				typescript,
				getHover({
					source: sourceFile.getFullText(),
					position,
					options: resolveEditorOptions(fileName),
				}),
			);
			if (quickInfo) {
				return quickInfo;
			}
		}

		return languageService.getQuickInfoAtPosition(fileName, position);
	};

	proxy.getSemanticDiagnostics = (fileName) => {
		const prior = languageService.getSemanticDiagnostics(fileName);
		const sourceFile = getSourceFile(languageService, fileName);
		if (!sourceFile || !hasSupportedClassNameContext(typescript, sourceFile)) {
			return prior;
		}

		const response = getDiagnostics({
			source: sourceFile.getFullText(),
			options: resolveEditorOptions(fileName),
		});

		return [
			...prior,
			...response.diagnostics.map((diagnostic) =>
				toTsDiagnostic(typescript, sourceFile, diagnostic),
			),
		];
	};

	return proxy;
}

export function findCompletionItem(
	items: readonly CompletionItem[],
	label: string,
): CompletionItem | undefined {
	return items.find((item) => item.label === label);
}

function getSourceFile(
	languageService: ts.LanguageService,
	fileName: string,
): ts.SourceFile | undefined {
	const program = languageService.getProgram();
	return program?.getSourceFile(fileName);
}
