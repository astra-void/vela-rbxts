import { transform } from "@vela-rbxts/compiler";
import type { TailwindConfig } from "@vela-rbxts/config";
import type { StyleIR } from "@vela-rbxts/ir";
import {
	createHostDiagnostic,
	mapCompilerDiagnosticsToHostDiagnostics,
} from "./diagnostics.js";
import { getHostFileEligibility } from "./filter.js";
import { resolveProjectConfigInfo } from "./project-config.js";
import { checkRuntimeInstall } from "./runtime-install.js";
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

/// The resolved config is one object shared by every file under a directory,
/// and serializing it means serializing the whole default palette. Keyed by the
/// object itself, so a config that was re-resolved is serialized again.
const configJsonCache = new WeakMap<TailwindConfig, string>();

export function configJsonFor(config: TailwindConfig): string {
	const cached = configJsonCache.get(config);
	if (cached !== undefined) {
		return cached;
	}

	const json = JSON.stringify(config);
	configJsonCache.set(config, json);

	return json;
}

export type TransformSourceForHostOptions = {
	config?: TailwindConfig;
	compiler?: HostCompiler;
	filter?: HostFileFilterOptions;
	mapDiagnostic?: HostDiagnosticMapper;
	projectRoot?: string;
	/** Asks the compiler for `mappings` from the output back to `sourceText`. */
	sourceMap?: boolean;
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
			fatal: false,
			eligibility,
		};
	}

	const compiler = options.compiler ?? defaultCompiler;

	try {
		const projectConfig = resolveProjectConfigInfo(request.fileName);
		const config = request.config ?? options.config ?? projectConfig.config;
		const compilerOptions = {
			configJson: configJsonFor(config),
			...(options.sourceMap ? { sourceMap: true } : {}),
		} as const;
		const compilerResult = normalizeCompilerResult(
			compiler.transform(request.sourceText, compilerOptions),
		);
		const diagnostics = mapCompilerDiagnosticsToHostDiagnostics(
			compilerResult.diagnostics,
			options.mapDiagnostic,
		);
		const runtimeInstall = compilerResult.changed
			? checkRuntimeInstall(request.fileName, compilerResult.code)
			: undefined;
		if (runtimeInstall) {
			diagnostics.push(runtimeInstall);
		}
		const fatal =
			compilerResult.diagnostics.some(isErrorDiagnostic) ||
			runtimeInstall !== undefined;

		return {
			fileName: request.fileName,
			sourceText: compilerResult.code,
			diagnostics,
			changed: compilerResult.changed,
			skipped: false,
			fatal,
			eligibility,
			compilerResult,
			...(compilerResult.mappings ? { mappings: compilerResult.mappings } : {}),
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
			fatal: true,
			eligibility,
		};
	}
}

function isErrorDiagnostic(diagnostic: { level: string }): boolean {
	return diagnostic.level.toLowerCase() === "error";
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
