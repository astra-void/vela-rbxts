import type { Diagnostic as CompilerDiagnostic } from "@vela-rbxts/compiler";

import type { HostDiagnostic, HostDiagnosticMapper } from "./types.js";

export const mapCompilerDiagnosticToHostDiagnostic: HostDiagnosticMapper = (
	diagnostic: CompilerDiagnostic,
): HostDiagnostic => ({
	source: "compiler",
	level: diagnostic.level,
	code: diagnostic.code,
	message: diagnostic.message,
	token: diagnostic.token,
	compilerDiagnostic: diagnostic,
});

export function mapCompilerDiagnosticsToHostDiagnostics(
	diagnostics: CompilerDiagnostic[],
	mapDiagnostic: HostDiagnosticMapper = mapCompilerDiagnosticToHostDiagnostic,
): HostDiagnostic[] {
	return diagnostics.map((diagnostic) => mapDiagnostic(diagnostic));
}

export function createHostDiagnostic(
	diagnostic: Omit<HostDiagnostic, "source">,
): HostDiagnostic {
	return {
		source: "host",
		...diagnostic,
	};
}
