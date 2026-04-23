use crate::api::{DiagnosticsRequest, DiagnosticsResponse};
use crate::diagnostics::editor::{
    compiler_to_editor_diagnostic, filter_compiler_diagnostics, host_utility_diagnostic,
};
use crate::editor::{collect_class_name_contexts, tokenize_class_name_with_ranges};
use crate::semantic::analyze::analyze_class_token;

pub(crate) fn get_diagnostics_impl(request: DiagnosticsRequest) -> DiagnosticsResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let contexts = collect_class_name_contexts(&request.source);
    let mut diagnostics = Vec::new();

    for context in contexts {
        for token in tokenize_class_name_with_ranges(&context.value, context.value_range.start) {
            if token.text.ends_with('-') {
                continue;
            }

            let analysis = analyze_class_token(&token.text);

            if let Some(diagnostic) = host_utility_diagnostic(
                &context.element_tag,
                &analysis.utility,
                &token.text,
                token.range.clone(),
            ) {
                diagnostics.push(diagnostic);
            }

            let mut compiler_diagnostics = Vec::new();
            crate::transform::runtime::resolve_class_tokens(
                vec![token.text.as_str()],
                &config,
                &mut compiler_diagnostics,
            );

            let filtered = filter_compiler_diagnostics(&token.text, compiler_diagnostics);
            diagnostics.extend(filtered.into_iter().map(|diagnostic| {
                compiler_to_editor_diagnostic(diagnostic, Some(token.range.clone()))
            }));
        }
    }

    DiagnosticsResponse { diagnostics }
}
