#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

pub(crate) mod api;
pub(crate) mod class_token;
pub(crate) mod class_value;
pub(crate) mod config;
pub(crate) mod diagnostics;
#[cfg(not(target_arch = "wasm32"))]
pub(crate) mod editor;
pub(crate) mod ir;
pub(crate) mod semantic;
pub(crate) mod swc;
pub(crate) mod transform;

pub use api::{
    ClassNameEdit, ClassTokenSpan, CompletionItem, CompletionRequest, CompletionResponse,
    Diagnostic, DiagnosticsRequest, DiagnosticsResponse, DocumentColor, DocumentColorsRequest,
    DocumentColorsResponse, EditorDiagnostic, EditorOptions, EditorRange, HoverContent,
    HoverRequest, HoverResponse, InlayHint, InlayHintsRequest, InlayHintsResponse,
    SortClassNamesRequest, SortClassNamesResponse, TransformOptions, TransformResult,
};

/// All class tokens in `className` attributes of supported host elements,
/// with UTF-16 source ranges. Rust-only; used by the LSP for highlights.
#[cfg(not(target_arch = "wasm32"))]
pub fn get_class_tokens(source: &str) -> Vec<ClassTokenSpan> {
    editor::collect_class_tokens(source)
        .into_iter()
        .map(|token| ClassTokenSpan {
            text: token.text,
            range: token.range,
        })
        .collect()
}

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

/// What every class in one document lowers to, for an editor that shows it
/// inline. Off by default in the clients that offer it: the summaries are for
/// reading a class list back, not for every edit.
#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getInlayHints")]
pub fn get_inlay_hints(request: InlayHintsRequest) -> InlayHintsResponse {
    api::editor::get_inlay_hints_impl(request)
}

/// Canonical class order for one document, as replacement edits over each
/// `className` string. Rust-only consumers and the LSP share this so the
/// editor never has to know the ordering rules.
#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "sortClassNames")]
pub fn sort_class_names(request: SortClassNamesRequest) -> SortClassNamesResponse {
    api::editor::sort_class_names_impl(request)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = transform)]
pub fn transform(source: String, options: JsValue) -> Result<JsValue, JsValue> {
    api::wasm::transform_wasm(source, options)
}
