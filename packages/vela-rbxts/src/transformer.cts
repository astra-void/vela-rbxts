import type * as Host from "@vela-rbxts/rbxtsc-host";

type TransformerArgs = Parameters<typeof Host.createVelaProgramTransformer>;
type TsModule = typeof import("typescript");

const DIAGNOSTIC_CODE = 89000;

// roblox-ts reports a plugin that throws while loading as a warning and builds
// without it, which would ship every `className` unlowered. The host, and the
// native compiler it loads, are required here instead, where a failure can
// still fail the files it would have lowered.
function loadHost(): typeof Host | Error {
	try {
		return require("@vela-rbxts/rbxtsc-host") as typeof Host;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}
}

function mayNeedLowering(fileName: string, sourceText: string): boolean {
	const normalized = fileName.toLowerCase();

	return (
		normalized.endsWith(".tsx") &&
		!normalized.endsWith(".d.tsx") &&
		!fileName.split(/[\\/]/).includes("node_modules") &&
		sourceText.includes("className")
	);
}

function createUnavailableTransformer(
	error: Error,
	ts: TsModule | undefined,
): import("typescript").TransformerFactory<import("typescript").SourceFile> {
	const messageText = `[vela-rbxts] compiler-unavailable: the Vela compiler could not be loaded, so this file was not lowered. ${error.message}`;

	return (context) => {
		const addDiagnostic = (
			context as {
				addDiagnostic?: (diagnostic: import("typescript").Diagnostic) => void;
			}
		).addDiagnostic;

		return (sourceFile) => {
			if (!mayNeedLowering(sourceFile.fileName, sourceFile.text)) {
				return sourceFile;
			}

			if (!addDiagnostic || !ts) {
				throw new Error(messageText);
			}

			addDiagnostic({
				category: ts.DiagnosticCategory.Error,
				code: DIAGNOSTIC_CODE,
				file: sourceFile,
				start: 0,
				length: 0,
				messageText,
			});

			return sourceFile;
		};
	};
}

function createTransformer(...args: TransformerArgs) {
	const host = loadHost();
	if (host instanceof Error) {
		return createUnavailableTransformer(host, args[2]?.ts);
	}

	return host.createVelaProgramTransformer(...args);
}

/** @deprecated Use createVelaProgramTransformer instead. */
const exportedTransformer = Object.assign(createTransformer, {
	createTransformer,
	createRbxtsTailwindProgramTransformer: createTransformer,
	default: createTransformer,
});

export = exportedTransformer;
