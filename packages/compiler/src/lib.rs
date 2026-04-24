#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub(crate) mod api;
pub(crate) mod class_value;
pub(crate) mod config;
pub(crate) mod diagnostics;
pub(crate) mod editor;
pub(crate) mod ir;
pub(crate) mod semantic;
pub(crate) mod swc;
pub(crate) mod transform;
pub(crate) mod utilities;

pub use api::{
    CompletionItem, CompletionRequest, CompletionResponse, Diagnostic, DiagnosticsRequest,
    DiagnosticsResponse, DocumentColor, DocumentColorsRequest, DocumentColorsResponse,
    EditorDiagnostic, EditorOptions, EditorRange, HoverContent, HoverRequest, HoverResponse,
    TransformOptions, TransformResult,
};

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "implementationKind")]
pub fn implementation_kind() -> String {
    "native".to_owned()
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = implementationKind)]
pub fn implementation_kind() -> String {
    "wasm".to_owned()
}

#[cfg(not(target_arch = "wasm32"))]
#[napi]
pub fn transform(source: String, options: Option<TransformOptions>) -> TransformResult {
    api::transform::transform_impl(source, options)
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getCompletions")]
pub fn get_completions(request: CompletionRequest) -> CompletionResponse {
    api::editor::get_completions_impl(request)
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getHover")]
pub fn get_hover(request: HoverRequest) -> HoverResponse {
    api::editor::get_hover_impl(request)
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getDiagnostics")]
pub fn get_diagnostics(request: DiagnosticsRequest) -> DiagnosticsResponse {
    api::editor::get_diagnostics_impl(request)
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getDocumentColors")]
pub fn get_document_colors(request: DocumentColorsRequest) -> DocumentColorsResponse {
    api::editor::get_document_colors_impl(request)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = transform)]
pub fn transform(source: String, options: JsValue) -> Result<JsValue, JsValue> {
    api::wasm::transform_wasm(source, options)
}
