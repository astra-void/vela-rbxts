use crate::api::{
    CompletionRequest, CompletionResponse, DiagnosticsRequest, DiagnosticsResponse, HoverRequest,
    HoverResponse, DocumentColorsRequest, DocumentColorsResponse,
};

pub(crate) fn get_completions_impl(request: CompletionRequest) -> CompletionResponse {
    crate::editor::completions::get_completions_impl(request)
}

pub(crate) fn get_hover_impl(request: HoverRequest) -> HoverResponse {
    crate::editor::hover::get_hover_impl(request)
}

pub(crate) fn get_diagnostics_impl(request: DiagnosticsRequest) -> DiagnosticsResponse {
    crate::editor::diagnostics::get_diagnostics_impl(request)
}

pub(crate) fn get_document_colors_impl(
    request: DocumentColorsRequest,
) -> DocumentColorsResponse {
    crate::editor::colors::get_document_colors_impl(request)
}
