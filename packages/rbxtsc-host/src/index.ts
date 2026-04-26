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
	default as createVelaProgramTransformer,
	type RbxtscProgramTransformerOptions,
} from "./transformer.js";
/**
 * @deprecated Use createVelaProgramTransformer instead.
 */
export { createVelaProgramTransformer as createRbxtsTailwindProgramTransformer } from "./transformer.js";
export type {
	HostCompiler,
	HostDiagnostic,
	HostDiagnosticMapper,
	HostDiagnosticSource,
	HostFileEligibility,
	HostFileEligibilityReason,
	HostFileFilterOptions,
	HostSourceFile,
	HostTransformRequest,
	HostTransformResponse,
	HostTransformResult,
	RbxtscTransformerBridge,
	RbxtscTransformerBridgeOptions,
} from "./types.js";
