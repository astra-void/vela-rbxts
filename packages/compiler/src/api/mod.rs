#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Serialize)]
pub struct Diagnostic {
    pub level: String,
    pub code: String,
    pub message: String,
    pub token: Option<String>,
    /// Byte range of the offending token in the transformed source, when known.
    pub range: Option<EditorRange>,
}

// napi camel-cases object fields itself; the serde rename keeps the wasm
// binding on the same names.
#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOptions {
    pub config_json: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformResult {
    pub code: String,
    pub diagnostics: Vec<Diagnostic>,
    pub changed: bool,
    pub ir: Vec<String>,
    pub needs_runtime_host: bool,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct EditorOptions {
    pub config_json: Option<String>,
    pub file_name: Option<String>,
    pub project_root: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct CompletionRequest {
    pub source: String,
    pub position: u32,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct HoverRequest {
    pub source: String,
    pub position: u32,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct DiagnosticsRequest {
    pub source: String,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct InlayHintsRequest {
    pub source: String,
    pub options: Option<EditorOptions>,
}

/// What one class token lowers to, for an editor that wants to show it inline.
/// It is the compiler's own lowering read back, so a hint cannot drift from the
/// emit the way a second semantic model would.
#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct InlayHint {
    /// UTF-16 offset just past the token the hint belongs to.
    pub position: u32,
    /// The summary as it should render inline, trimmed to stay on the line.
    pub label: String,
    /// The untrimmed summary, for a hover over the hint.
    pub tooltip: String,
    pub token: String,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct InlayHintsResponse {
    pub hints: Vec<InlayHint>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct DocumentColorsRequest {
    pub source: String,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Serialize)]
pub struct EditorRange {
    pub start: u32,
    pub end: u32,
}

/// Rust-only editor API surface (not exposed over napi/wasm).
#[derive(Clone, Debug)]
pub struct ClassTokenSpan {
    pub text: String,
    pub range: EditorRange,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct CompletionItem {
    pub label: String,
    pub insert_text: String,
    pub kind: String,
    pub category: String,
    pub documentation: String,
    pub replacement: Option<EditorRange>,
    /// `#rrggbb` for utilities that resolve to a theme color, so the editor can
    /// render a swatch.
    pub color: Option<String>,
    /// Relevance order decided by the matcher; lower sorts first.
    pub sort_text: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct CompletionResponse {
    pub is_in_class_name_context: bool,
    pub items: Vec<CompletionItem>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct HoverContent {
    pub display: String,
    pub documentation: String,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct HoverResponse {
    pub contents: Option<HoverContent>,
    pub range: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct EditorDiagnostic {
    pub level: String,
    pub code: String,
    pub message: String,
    pub token: Option<String>,
    pub range: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct DiagnosticsResponse {
    pub diagnostics: Vec<EditorDiagnostic>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct DocumentColor {
    pub range: EditorRange,
    pub red: f64,
    pub green: f64,
    pub blue: f64,
    pub alpha: f64,
    pub token: String,
    pub presentation: String,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct DocumentColorsResponse {
    pub colors: Vec<DocumentColor>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct SortClassNamesRequest {
    pub source: String,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct ClassNameEdit {
    pub range: EditorRange,
    pub text: String,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug)]
pub struct SortClassNamesResponse {
    pub edits: Vec<ClassNameEdit>,
}

#[cfg(not(target_arch = "wasm32"))]
pub mod editor;
#[cfg(not(target_arch = "wasm32"))]
pub mod transform;

#[cfg(target_arch = "wasm32")]
pub mod wasm;
