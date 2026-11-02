use crate::api::{DiagnosticsRequest, DiagnosticsResponse, EditorDiagnostic};
use crate::config::model::TailwindConfig;
use crate::diagnostics::compiler::explicit_prop_overrides_class_diagnostic;
use crate::diagnostics::editor::{compiler_to_editor_diagnostic, host_utility_diagnostic};
use crate::editor::conflicts::overridden_classes;
use crate::editor::{collect_class_name_contexts, tokenize_class_name_with_ranges};
use crate::semantic::analyze::analyze_class_token;
use crate::semantic::utility::{
    PaddingKind, UtilityKind, color_completion_keys, font_family_completion_keys,
    position_completion_keys, radius_completion_keys, size_completion_keys,
    spacing_completion_keys,
};

pub(crate) fn get_diagnostics_impl(request: DiagnosticsRequest) -> DiagnosticsResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let variants = crate::semantic::variant::VariantRegistry::new(&config);
    let contexts = collect_class_name_contexts(&request.source);
    let mut diagnostics = Vec::new();

    for context in contexts {
        let tokens = tokenize_class_name_with_ranges(&context.value, context.value_range.start);
        let mut written = Vec::new();

        for token in &tokens {
            if token.text.ends_with('-') || token.text.ends_with(':') {
                continue;
            }

            if context.splices_into(token) {
                continue;
            }

            let analysis = analyze_class_token(&token.text, &variants);

            // A utility that does not belong on this host is wrong whatever its
            // value is, so its value diagnostics would only be noise.
            if let Some(diagnostic) = host_utility_diagnostic(
                context.element_tag.as_deref(),
                &analysis.utility,
                &token.text,
                token.range.clone(),
            ) {
                diagnostics.push(diagnostic);
                continue;
            }

            written.push(token);
            let mut compiler_diagnostics = Vec::new();
            let mut style = crate::transform::runtime::resolve_class_tokens(
                vec![token.text.as_str()],
                &config,
                context.element_tag.as_deref(),
                &mut compiler_diagnostics,
            );
            crate::transform::runtime::share_size_inputs(&mut style);
            crate::transform::runtime::share_transform_inputs(&mut style);
            for prop in declared_props_the_class_names(&style, &context.declared_props) {
                compiler_diagnostics.push(explicit_prop_overrides_class_diagnostic(
                    Some(&token.text),
                    &prop,
                ));
            }

            diagnostics.extend(
                compiler_diagnostics
                    .into_iter()
                    .filter(|diagnostic| {
                        diagnostic.code != "unknown-theme-key"
                            || !is_half_typed_key(&config, &analysis.utility, analysis.payload())
                    })
                    .map(|diagnostic| {
                        compiler_to_editor_diagnostic(diagnostic, Some(token.range.clone()))
                    }),
            );
        }

        let texts: Vec<&str> = written.iter().map(|token| token.text.as_str()).collect();
        for overridden in overridden_classes(&texts, &config, context.element_tag.as_deref()) {
            let token = written[overridden.index];
            diagnostics.push(EditorDiagnostic {
                level: "warning".to_owned(),
                code: "overridden-class".to_owned(),
                message: overridden.message,
                token: Some(token.text.clone()),
                range: Some(token.range.clone()),
            });
        }
    }

    DiagnosticsResponse { diagnostics }
}

/// What the build drops from this class because the element declares it too.
fn declared_props_the_class_names(
    style: &crate::ir::model::StyleIr,
    declared: &[String],
) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let effects =
        std::iter::once(&style.base).chain(style.runtime_rules.iter().map(|rule| &rule.effects));
    for prop in effects.flat_map(|effects| effects.props.iter()) {
        if declared.iter().any(|name| *name == prop.name)
            && !names.iter().any(|name| *name == prop.name)
        {
            names.push(prop.name.to_string());
        }
    }

    names
}

/// A payload that is a strict prefix of a real theme key is still being typed,
/// so reporting it as unknown would flag every keystroke on the way there.
fn is_half_typed_key(
    config: &TailwindConfig,
    utility: &UtilityKind,
    payload: Option<&str>,
) -> bool {
    let Some(payload) = payload.filter(|payload| !payload.is_empty()) else {
        return false;
    };

    candidate_keys(config, utility).is_some_and(|keys| {
        keys.iter()
            .any(|key| key.len() > payload.len() && key.starts_with(payload))
    })
}

fn candidate_keys(config: &TailwindConfig, utility: &UtilityKind) -> Option<Vec<String>> {
    match utility {
        UtilityKind::BackgroundColor
        | UtilityKind::TextColor
        | UtilityKind::ImageColor
        | UtilityKind::PlaceholderColor
        | UtilityKind::ShadowColor(_)
        | UtilityKind::GradientFrom
        | UtilityKind::GradientVia
        | UtilityKind::GradientTo
        | UtilityKind::Border
        | UtilityKind::Ring
        | UtilityKind::Outline
        | UtilityKind::ScrollbarColor => Some(color_completion_keys(config)),
        UtilityKind::FontFamily => Some(font_family_completion_keys(config)),
        UtilityKind::Radius(_) => Some(radius_completion_keys(config)),
        UtilityKind::Padding(PaddingKind::All | PaddingKind::X | PaddingKind::Y)
        | UtilityKind::Padding(PaddingKind::Top | PaddingKind::Right)
        | UtilityKind::Padding(PaddingKind::Bottom | PaddingKind::Left)
        | UtilityKind::Gap
        | UtilityKind::MinWidth
        | UtilityKind::MaxWidth
        | UtilityKind::MinHeight
        | UtilityKind::MaxHeight
        | UtilityKind::SpaceX
        | UtilityKind::SpaceY
        | UtilityKind::ScrollbarThickness => Some(spacing_completion_keys(config)),
        UtilityKind::Margin(_) => Some(spacing_completion_keys(config)),
        UtilityKind::Width | UtilityKind::Height | UtilityKind::Size | UtilityKind::Basis => {
            Some(size_completion_keys(config))
        }
        UtilityKind::PositionX
        | UtilityKind::PositionY
        | UtilityKind::PositionRight
        | UtilityKind::PositionBottom
        | UtilityKind::Inset
        | UtilityKind::TranslateX
        | UtilityKind::TranslateY => Some(position_completion_keys(config)),
        _ => None,
    }
}
