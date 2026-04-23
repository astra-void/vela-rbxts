use crate::api::{Diagnostic, EditorDiagnostic, EditorRange};
use crate::semantic::{
    token::parse_class_token, utility::is_utility_allowed_on_host as utility_kind_allowed_on_host,
};

pub(crate) fn host_utility_diagnostic(
    element_tag: &str,
    token: &str,
    range: EditorRange,
) -> Option<EditorDiagnostic> {
    if utility_allowed_on_host(element_tag, token) {
        return None;
    }

    Some(EditorDiagnostic {
        level: "warning".to_owned(),
        code: "unsupported-host-utility".to_owned(),
        message: format!("Utility \"{token}\" is not valid on Roblox `{element_tag}` elements."),
        token: Some(token.to_owned()),
        range: Some(range),
    })
}

pub(crate) fn compiler_to_editor_diagnostic(
    diagnostic: Diagnostic,
    range: Option<EditorRange>,
) -> EditorDiagnostic {
    EditorDiagnostic {
        level: diagnostic.level,
        code: diagnostic.code,
        message: diagnostic.message,
        token: diagnostic.token,
        range,
    }
}

pub(crate) fn filter_compiler_diagnostics(
    token_text: &str,
    diagnostics: Vec<Diagnostic>,
) -> Vec<Diagnostic> {
    diagnostics
        .into_iter()
        .filter(|diag| {
            if diag.code != "unknown-theme-key" {
                return true;
            }

            if let Some(pos) = token_text.find('-') {
                let rest = &token_text[pos + 1..];
                if rest.len() <= 3 {
                    return false;
                }
            }

            true
        })
        .collect()
}

fn utility_allowed_on_host(element_tag: &str, token: &str) -> bool {
    let parsed = parse_class_token(token);
    utility_kind_allowed_on_host(element_tag, &parsed.utility.kind)
}
