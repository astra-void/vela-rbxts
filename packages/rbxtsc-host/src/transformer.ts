import { createRbxtscTransformerBridge } from "./bridge.js";
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

function findDiagnosticSpan(
	sourceText: string,
	token: string | undefined,
): {
	start: number;
	length: number;
} {
	if (!token) {
		return { start: 0, length: 0 };
	}

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
			? "@rbxts-tailwind/compiler"
			: "@rbxts-tailwind/rbxtsc-host";
	const span = findDiagnosticSpan(sourceFile.text, diagnostic.token);

	return {
		category: toDiagnosticCategory(ts, diagnostic.level),
		code,
		file: sourceFile,
		start: span.start,
		length: span.length,
		messageText: `[${phase}] ${diagnostic.code}: ${diagnostic.message}`,
	};
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

export default function createRbxtsTailwindProgramTransformer(
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

	const { diagnosticCodeBase = DEFAULT_DIAGNOSTIC_CODE_BASE, ...bridgeOptions } =
		options;
	const bridge = createRbxtscTransformerBridge(bridgeOptions);

	return (context) => {
		const addDiagnostic = (
			context as {
				addDiagnostic?: (diagnostic: import("typescript").Diagnostic) => void;
			}
		).addDiagnostic;

		return (sourceFile) => {
			const request: HostTransformRequest = {
				fileName: sourceFile.fileName,
				sourceText: sourceFile.text,
			};

			const eligibility = bridge.getFileEligibility(request);
			if (!eligibility.eligible) {
				return sourceFile;
			}

			const result = bridge.transformSource(request);

			if (addDiagnostic) {
				for (let i = 0; i < result.diagnostics.length; i++) {
					addDiagnostic(
						mapHostDiagnosticToTsDiagnostic(
							ts,
							sourceFile,
							result.diagnostics[i],
							diagnosticCodeBase + i,
						),
					);
				}
			}

			if (!result.changed || result.sourceText === sourceFile.text) {
				return sourceFile;
			}

			return reinjectTransformedSource(ts, sourceFile, result.sourceText);
		};
	};
}
