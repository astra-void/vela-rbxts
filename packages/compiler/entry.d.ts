export type {
	CompletionItem,
	CompletionRequest,
	CompletionResponse,
	Diagnostic,
	DiagnosticsRequest,
	DiagnosticsResponse,
	EditorDiagnostic,
	EditorOptions,
	EditorRange,
	HoverContent,
	HoverRequest,
	HoverResponse,
	TransformOptions,
	TransformResult,
} from "./index";
export {
	getCompletions,
	getDiagnostics,
	getHover,
	implementationKind,
	transform,
} from "./index";
