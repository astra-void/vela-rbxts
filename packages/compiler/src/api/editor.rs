use crate::api::{
    CompletionRequest, CompletionResponse, DiagnosticsRequest, DiagnosticsResponse,
    DocumentColorsRequest, DocumentColorsResponse, HoverRequest, HoverResponse, InlayHintsRequest,
    InlayHintsResponse, SortClassNamesRequest, SortClassNamesResponse,
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

pub(crate) fn get_document_colors_impl(request: DocumentColorsRequest) -> DocumentColorsResponse {
    crate::editor::colors::get_document_colors_impl(request)
}

pub(crate) fn get_inlay_hints_impl(request: InlayHintsRequest) -> InlayHintsResponse {
    crate::editor::inlay::get_inlay_hints_impl(request)
}

pub(crate) fn sort_class_names_impl(request: SortClassNamesRequest) -> SortClassNamesResponse {
    crate::editor::sort::sort_class_names_impl(request)
}
