import type {
	Diagnostic as CompilerDiagnostic,
	TransformOptions as CompilerTransformOptions,
	TransformResult as CompilerTransformResult,
} from "@vela-rbxts/compiler";
import type { TailwindConfig } from "@vela-rbxts/config";
import type { StyleIR } from "@vela-rbxts/ir";

export type HostSourceFile = {
	fileName: string;
	sourceText: string;
};

export type HostTransformRequest = HostSourceFile & {
	config?: TailwindConfig;
	projectRoot?: string;
};

export type HostFileEligibilityReason =
	| "not-tsx"
	| "declaration-file"
	| "node-modules"
	| "missing-class-name"
	| "missing-jsx"
	| "eligible";

export type HostFileEligibility = {
	eligible: boolean;
	reason: HostFileEligibilityReason;
};

export type HostFileFilterOptions = {
	skipNodeModules?: boolean;
	requireClassName?: boolean;
	requireJsxSyntax?: boolean;
};

export type HostDiagnosticSource = "compiler" | "host";

export type HostDiagnostic = {
	source: HostDiagnosticSource;
	level: string;
	code: string;
	message: string;
	token?: string;
	compilerDiagnostic?: CompilerDiagnostic;
};

export type HostTransformResult = {
	fileName: string;
	sourceText: string;
	diagnostics: HostDiagnostic[];
	changed: boolean;
	skipped: boolean;
	eligibility: HostFileEligibility;
	compilerResult?: HostCompilerResult;
};

export type HostCompilerResult = Omit<CompilerTransformResult, "ir"> & {
	ir: StyleIR[];
};

export type HostCompiler = {
	transform(
		sourceText: string,
		options?: CompilerTransformOptions | null,
	): CompilerTransformResult;
};

export type HostDiagnosticMapper = (
	diagnostic: CompilerDiagnostic,
) => HostDiagnostic;

export type RbxtscTransformerBridgeOptions = {
	config?: TailwindConfig;
	compiler?: HostCompiler;
	filter?: HostFileFilterOptions;
	mapDiagnostic?: HostDiagnosticMapper;
	projectRoot?: string;
};

export type RbxtscTransformerBridge = {
	name: "@vela-rbxts/rbxtsc-host";
	getFileEligibility(sourceFile: HostSourceFile): HostFileEligibility;
	shouldTransformFile(sourceFile: HostSourceFile): boolean;
	transformSource(request: HostTransformRequest): HostTransformResult;
	transformFile(request: HostTransformRequest): HostTransformResult;
};

export type HostTransformResponse = HostTransformResult;
