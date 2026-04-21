import { transform } from "@rbxts-tailwind/compiler";
import { defaultConfig, type TailwindConfig } from "@rbxts-tailwind/config";

import {
	createHostDiagnostic,
	mapCompilerDiagnosticsToHostDiagnostics,
} from "./diagnostics.js";
import { getHostFileEligibility } from "./filter.js";
import type {
	HostCompiler,
	HostDiagnosticMapper,
	HostFileFilterOptions,
	HostTransformRequest,
	HostTransformResult,
} from "./types.js";

const defaultCompiler: HostCompiler = {
	transform,
};

export type TransformSourceForHostOptions = {
	config?: TailwindConfig;
	compiler?: HostCompiler;
	filter?: HostFileFilterOptions;
	mapDiagnostic?: HostDiagnosticMapper;
};

export function transformSourceForHost(
	request: HostTransformRequest,
	options: TransformSourceForHostOptions = {},
): HostTransformResult {
	const eligibility = getHostFileEligibility(request, options.filter);

	if (!eligibility.eligible) {
		return {
			fileName: request.fileName,
			sourceText: request.sourceText,
			diagnostics: [],
			changed: false,
			skipped: true,
			eligibility,
		};
	}

	const compiler = options.compiler ?? defaultCompiler;
	const config = request.config ?? options.config ?? defaultConfig;

	try {
		const compilerResult = compiler.transform(request.sourceText, {
			configJson: JSON.stringify(config),
		});

		return {
			fileName: request.fileName,
			sourceText: compilerResult.code,
			diagnostics: mapCompilerDiagnosticsToHostDiagnostics(
				compilerResult.diagnostics,
				options.mapDiagnostic,
			),
			changed: compilerResult.changed,
			skipped: false,
			eligibility,
			compilerResult,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		return {
			fileName: request.fileName,
			sourceText: request.sourceText,
			diagnostics: [
				createHostDiagnostic({
					level: "error",
					code: "compiler-invocation-failed",
					message,
				}),
			],
			changed: false,
			skipped: false,
			eligibility,
		};
	}
}
