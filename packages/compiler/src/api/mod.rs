#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
use serde::{Deserialize, Serialize};

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Diagnostic {
    pub level: String,
    pub code: String,
    pub message: String,
    pub token: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TransformOptions {
    pub config_json: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TransformResult {
    pub code: String,
    pub diagnostics: Vec<Diagnostic>,
    pub changed: bool,
    pub ir: Vec<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorOptions {
    pub config_json: Option<String>,
    pub file_name: Option<String>,
    pub project_root: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CompletionRequest {
    pub source: String,
    pub position: u32,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HoverRequest {
    pub source: String,
    pub position: u32,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DiagnosticsRequest {
    pub source: String,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EditorRange {
    pub start: u32,
    pub end: u32,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CompletionItem {
    pub label: String,
    pub insert_text: String,
    pub kind: String,
    pub category: String,
    pub documentation: String,
    pub replacement: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResponse {
    pub is_in_class_name_context: bool,
    pub items: Vec<CompletionItem>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HoverContent {
    pub display: String,
    pub documentation: String,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HoverResponse {
    pub contents: Option<HoverContent>,
    pub range: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EditorDiagnostic {
    pub level: String,
    pub code: String,
    pub message: String,
    pub token: Option<String>,
    pub range: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DiagnosticsResponse {
    pub diagnostics: Vec<EditorDiagnostic>,
}

pub mod transform;
pub mod editor;

#[cfg(target_arch = "wasm32")]
pub mod wasm;
