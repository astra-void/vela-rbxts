import { transform } from "@vela-rbxts/compiler";
import type { TailwindConfig } from "@vela-rbxts/config";
import type { StyleIR } from "@vela-rbxts/ir";
import {
	createHostDiagnostic,
	mapCompilerDiagnosticsToHostDiagnostics,
} from "./diagnostics.js";
import { getHostFileEligibility } from "./filter.js";
import { resolveProjectConfigInfo } from "./project-config.js";
import type {
	HostCompiler,
	HostCompilerResult,
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
	projectRoot?: string;
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

	try {
		const projectConfig = resolveProjectConfigInfo(request.fileName);
		const config = request.config ?? options.config ?? projectConfig.config;
		const compilerResult = compiler.transform(request.sourceText, {
			configJson: JSON.stringify(config),
		});
		const normalizedCompilerResult = normalizeCompilerResult(compilerResult);

		return {
			fileName: request.fileName,
			sourceText: normalizedCompilerResult.code,
			diagnostics: mapCompilerDiagnosticsToHostDiagnostics(
				normalizedCompilerResult.diagnostics,
				options.mapDiagnostic,
			),
			changed: normalizedCompilerResult.changed,
			skipped: false,
			eligibility,
			compilerResult: normalizedCompilerResult,
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

function normalizeCompilerResult(
	result: ReturnType<HostCompiler["transform"]>,
): HostCompilerResult {
	const ir = (result.ir ?? []).map((entry: string | StyleIR) => {
		if (typeof entry === "string") {
			return JSON.parse(entry) as StyleIR;
		}

		return entry;
	});

	return {
		...result,
		ir,
	} as HostCompilerResult;
}
