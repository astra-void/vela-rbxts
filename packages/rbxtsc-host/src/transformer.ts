import path from "node:path";

import { createRbxtscTransformerBridge } from "./bridge.js";
import { resolveProjectConfigInfo } from "./project-config.js";
import type {
	HostDiagnostic,
	HostTransformRequest,
	RbxtscTransformerBridgeOptions,
} from "./types.js";

type TsModule = typeof import("typescript");

const DEFAULT_DIAGNOSTIC_CODE_BASE = 89000;

export type RbxtscProgramTransformerOptions = RbxtscTransformerBridgeOptions & {
	diagnosticCodeBase?: number;
};

function toDiagnosticCategory(
	ts: TsModule,
	level: string,
): import("typescript").DiagnosticCategory {
	switch (level.toLowerCase()) {
		case "error":
			return ts.DiagnosticCategory.Error;
		case "warning":
			return ts.DiagnosticCategory.Warning;
		case "suggestion":
			return ts.DiagnosticCategory.Suggestion;
		case "message":
		case "info":
			return ts.DiagnosticCategory.Message;
		default:
			return ts.DiagnosticCategory.Warning;
	}
}

function byteOffsetToCharOffset(
	sourceText: string,
	byteOffset: number,
): number {
	return Buffer.from(sourceText, "utf8")
		.subarray(0, byteOffset)
		.toString("utf8").length;
}

function findDiagnosticSpan(
	sourceText: string,
	diagnostic: HostDiagnostic,
): {
	start: number;
	length: number;
} {
	const range = diagnostic.range;
	if (
		range &&
		range.end >= range.start &&
		range.end <= Buffer.byteLength(sourceText)
	) {
		const start = byteOffsetToCharOffset(sourceText, range.start);
		const end = byteOffsetToCharOffset(sourceText, range.end);
		return { start, length: end - start };
	}

	const token = diagnostic.token;
	if (!token) {
		return { start: 0, length: 0 };
	}

	// Fallback for diagnostics the compiler could not anchor, such as dynamic
	// className expressions. Picks the first textual match in the file.
	const start = sourceText.indexOf(token);
	if (start < 0) {
		return { start: 0, length: 0 };
	}

	return {
		start,
		length: token.length,
	};
}

function mapHostDiagnosticToTsDiagnostic(
	ts: TsModule,
	sourceFile: import("typescript").SourceFile,
	diagnostic: HostDiagnostic,
	code: number,
): import("typescript").DiagnosticWithLocation {
	const phase =
		diagnostic.source === "compiler"
			? "@vela-rbxts/compiler"
			: "@vela-rbxts/rbxtsc-host";
	const span = findDiagnosticSpan(sourceFile.text, diagnostic);

	return {
		category: toDiagnosticCategory(ts, diagnostic.level),
		code,
		file: sourceFile,
		start: span.start,
		length: span.length,
		messageText: `[${phase}] ${diagnostic.code}: ${diagnostic.message}`,
	};
}

/// roblox-ts only transforms the files that changed, so a config that broke
/// after the last build would otherwise go unreported until a file is edited.
function projectConfigFailures(
	program: import("typescript").Program,
	isEligible: (sourceFile: import("typescript").SourceFile) => boolean,
): string[] {
	if (typeof program.getSourceFiles !== "function") {
		return [];
	}

	const directories = new Set<string>();
	for (const sourceFile of program.getSourceFiles()) {
		if (!sourceFile.isDeclarationFile && isEligible(sourceFile)) {
			directories.add(path.dirname(sourceFile.fileName));
		}
	}

	const failures = new Set<string>();
	for (const directory of directories) {
		try {
			resolveProjectConfigInfo(path.join(directory, "index.tsx"));
		} catch (error) {
			failures.add(error instanceof Error ? error.message : String(error));
		}
	}

	return [...failures];
}

function hasParseErrors(sourceFile: import("typescript").SourceFile): boolean {
	const parseDiagnostics = (
		sourceFile as { parseDiagnostics?: readonly unknown[] }
	).parseDiagnostics;

	return parseDiagnostics !== undefined && parseDiagnostics.length > 0;
}

function inferScriptKind(
	ts: TsModule,
	fileName: string,
): import("typescript").ScriptKind {
	const normalizedFileName = fileName.toLowerCase();

	if (normalizedFileName.endsWith(".tsx")) {
		return ts.ScriptKind.TSX;
	}

	if (normalizedFileName.endsWith(".ts")) {
		return ts.ScriptKind.TS;
	}

	if (normalizedFileName.endsWith(".jsx")) {
		return ts.ScriptKind.JSX;
	}

	if (normalizedFileName.endsWith(".js")) {
		return ts.ScriptKind.JS;
	}

	if (normalizedFileName.endsWith(".json")) {
		return ts.ScriptKind.JSON;
	}

	return ts.ScriptKind.Unknown;
}

function reinjectTransformedSource(
	ts: TsModule,
	sourceFile: import("typescript").SourceFile,
	sourceText: string,
): import("typescript").SourceFile {
	const scriptKind = inferScriptKind(ts, sourceFile.fileName);

	return ts.createSourceFile(
		sourceFile.fileName,
		sourceText,
		sourceFile.languageVersion,
		true,
		scriptKind,
	);
}

export function createVelaProgramTransformer(
	_program: import("typescript").Program,
	options: RbxtscProgramTransformerOptions = {},
	extra?: {
		ts?: TsModule;
	},
): import("typescript").TransformerFactory<import("typescript").SourceFile> {
	const ts = extra?.ts;
	if (!ts) {
		throw new Error(
			"rbxtsc-host transformer requires roblox-ts to provide the TypeScript module.",
		);
	}

	const {
		diagnosticCodeBase = DEFAULT_DIAGNOSTIC_CODE_BASE,
		...bridgeOptions
	} = options;
	const projectRoot =
		bridgeOptions.projectRoot ??
		(typeof _program.getCurrentDirectory === "function"
			? _program.getCurrentDirectory()
			: undefined);
	const bridge = createRbxtscTransformerBridge({
		...bridgeOptions,
		projectRoot,
	});

	return (context) => {
		const addDiagnostic = (
			context as {
				addDiagnostic?: (diagnostic: import("typescript").Diagnostic) => void;
			}
		).addDiagnostic;
		// Without a channel for diagnostics, a failure is thrown rather than
		// dropped, since dropping it would emit the file unlowered.
		const report = (diagnostic: import("typescript").Diagnostic) => {
			if (addDiagnostic) {
				addDiagnostic(diagnostic);
			} else if (diagnostic.category === ts.DiagnosticCategory.Error) {
				throw new Error(
					ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
				);
			}
		};

		const configFailures =
			bridgeOptions.config === undefined
				? projectConfigFailures(_program, (sourceFile) =>
						bridge.shouldTransformFile({
							fileName: sourceFile.fileName,
							sourceText: sourceFile.text,
						}),
					)
				: [];
		for (const failure of configFailures) {
			report({
				category: ts.DiagnosticCategory.Error,
				code: diagnosticCodeBase,
				file: undefined,
				start: undefined,
				length: undefined,
				messageText: `[@vela-rbxts/rbxtsc-host] config-resolution-failed: ${failure}`,
			});
		}

		return (sourceFile) => {
			const request: HostTransformRequest = {
				fileName: sourceFile.fileName,
				sourceText: sourceFile.text,
				projectRoot,
			};

			const eligibility = bridge.getFileEligibility(request);
			if (!eligibility.eligible) {
				return sourceFile;
			}

			const result = bridge.transformSource(request);

			for (let i = 0; i < result.diagnostics.length; i++) {
				report(
					mapHostDiagnosticToTsDiagnostic(
						ts,
						sourceFile,
						result.diagnostics[i],
						diagnosticCodeBase + i,
					),
				);
			}

			if (
				result.fatal ||
				!result.changed ||
				result.sourceText === sourceFile.text
			) {
				return sourceFile;
			}

			const transformed = reinjectTransformedSource(
				ts,
				sourceFile,
				result.sourceText,
			);
			if (hasParseErrors(transformed)) {
				report({
					category: ts.DiagnosticCategory.Error,
					code: diagnosticCodeBase + result.diagnostics.length,
					file: sourceFile,
					start: 0,
					length: 0,
					messageText:
						"[@vela-rbxts/rbxtsc-host] transformed-source-invalid: the lowered file does not parse, so it was not emitted. Please report this with the file's className usage.",
				});
				return sourceFile;
			}

			return transformed;
		};
	};
}

/** @deprecated Use createVelaProgramTransformer instead. */
export const createRbxtsTailwindProgramTransformer =
	createVelaProgramTransformer;

export default createVelaProgramTransformer;
