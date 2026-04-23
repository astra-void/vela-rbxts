export { createRbxtscTransformerBridge } from "./bridge.js";
export {
	createHostDiagnostic,
	mapCompilerDiagnosticsToHostDiagnostics,
	mapCompilerDiagnosticToHostDiagnostic,
} from "./diagnostics.js";
export {
	getHostFileEligibility,
	isTransformableHostFile,
} from "./filter.js";
export {
	resolveProjectConfig,
	resolveProjectConfigInfo,
} from "./project-config.js";
export {
	type TransformSourceForHostOptions,
	transformSourceForHost,
} from "./transform.js";
export {
	default as createRbxtsTailwindProgramTransformer,
	type RbxtscProgramTransformerOptions,
} from "./transformer.js";
export type {
	HostCompiler,
	HostDiagnostic,
	HostDiagnosticMapper,
	HostDiagnosticSource,
	HostFileEligibility,
	HostFileEligibilityReason,
	HostFileFilterOptions,
	HostRuntimeArtifact,
	HostSourceFile,
	HostTransformRequest,
	HostTransformResponse,
	HostTransformResult,
	RbxtscTransformerBridge,
	RbxtscTransformerBridgeOptions,
} from "./types.js";
