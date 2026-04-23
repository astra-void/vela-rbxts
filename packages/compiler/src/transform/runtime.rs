use crate::api::Diagnostic;
use crate::config::model::TailwindConfig;
use crate::diagnostics::compiler::{
    negative_z_index_diagnostic, unsupported_arbitrary_z_index_diagnostic,
    unsupported_size_mode_diagnostic, unsupported_utility_family_diagnostic,
    unsupported_z_index_auto_diagnostic, unsupported_z_index_value_diagnostic,
};
use crate::ir::model::{RuntimeRule, SizeAxisValue, StyleIr};
use crate::semantic::{
    analyze::analyze_class_token,
    result::{AnalyzedClassToken, SemanticIssue},
    utility::{PaddingKind, UtilityKind},
};
use crate::utilities::color::{
    BACKGROUND_COLOR_FAMILY, IMAGE_COLOR_FAMILY, PLACEHOLDER_COLOR_FAMILY, TEXT_COLOR_FAMILY,
    apply_color_utility,
};
use crate::utilities::size::{format_size_prop, resolve_size_axis_value};
use crate::utilities::spacing::resolve_spacing_value;

pub(crate) const Z_INDEX_VALUES: [&str; 6] = ["0", "10", "20", "30", "40", "50"];

pub(crate) fn resolve_z_index_value(
    z_key: &str,
    token: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<String> {
    if z_key == "auto" {
        diagnostics.push(unsupported_z_index_auto_diagnostic(token));
        return None;
    }

    if z_key.starts_with('[') && z_key.ends_with(']') {
        diagnostics.push(unsupported_arbitrary_z_index_diagnostic(token));
        return None;
    }

    if Z_INDEX_VALUES.contains(&z_key) {
        return Some(z_key.to_owned());
    }

    if z_key.parse::<i32>().is_ok() {
        diagnostics.push(unsupported_z_index_value_diagnostic(z_key, token));
        return None;
    }

    diagnostics.push(unsupported_z_index_value_diagnostic(z_key, token));
    None
}

pub(crate) fn resolve_class_tokens<T, I>(
    tokens: I,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr
where
    I: IntoIterator<Item = T>,
    T: AsRef<str>,
{
    let mut style = StyleIr::default();
    let mut pending_size_width: Option<SizeAxisValue> = None;
    let mut pending_size_height: Option<SizeAxisValue> = None;

    for token in tokens {
        let analysis = analyze_class_token(token.as_ref());
        debug_assert_eq!(analysis.static_only, !analysis.runtime_aware);

        if analysis.runtime_aware {
            let condition = analysis
                .runtime_condition
                .clone()
                .expect("runtime-aware analysis must carry a runtime condition");
            let runtime_style = resolve_single_analyzed_token(&analysis, config, diagnostics);
            if !runtime_style.base.props.is_empty() || !runtime_style.base.helpers.is_empty() {
                style.runtime_rules.push(RuntimeRule {
                    condition,
                    effects: runtime_style.base,
                });
            }
            continue;
        }

        apply_analyzed_token(
            &analysis,
            config,
            diagnostics,
            &mut style,
            &mut pending_size_width,
            &mut pending_size_height,
        );
    }

    if pending_size_width.is_some() || pending_size_height.is_some() {
        style.set_prop(
            "Size",
            format_size_prop(pending_size_width, pending_size_height),
        );
    }

    style
}

fn resolve_single_analyzed_token(
    analysis: &AnalyzedClassToken,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr {
    let mut style = StyleIr::default();
    let mut pending_size_width: Option<SizeAxisValue> = None;
    let mut pending_size_height: Option<SizeAxisValue> = None;
    apply_analyzed_token(
        analysis,
        config,
        diagnostics,
        &mut style,
        &mut pending_size_width,
        &mut pending_size_height,
    );

    if pending_size_width.is_some() || pending_size_height.is_some() {
        style.set_prop(
            "Size",
            format_size_prop(pending_size_width, pending_size_height),
        );
    }

    style
}

fn apply_analyzed_token(
    analysis: &AnalyzedClassToken,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    style: &mut StyleIr,
    pending_size_width: &mut Option<SizeAxisValue>,
    pending_size_height: &mut Option<SizeAxisValue>,
) {
    let _needs_config_lookup = analysis.needs_config_lookup;

    if !analysis.supported {
        for issue in &analysis.issues {
            match issue {
                SemanticIssue::UnsupportedUtilityFamily { .. } => {
                    diagnostics.push(unsupported_utility_family_diagnostic(&analysis.parsed.raw));
                    return;
                }
                SemanticIssue::UnsupportedZIndexValue { value } => {
                    diagnostics.push(unsupported_z_index_value_diagnostic(
                        value,
                        &analysis.parsed.raw,
                    ));
                    return;
                }
                SemanticIssue::UnsupportedZIndexAuto => {
                    diagnostics.push(unsupported_z_index_auto_diagnostic(&analysis.parsed.raw));
                    return;
                }
                SemanticIssue::UnsupportedArbitraryZIndex => {
                    diagnostics.push(unsupported_arbitrary_z_index_diagnostic(
                        &analysis.parsed.raw,
                    ));
                    return;
                }
                SemanticIssue::NegativeZIndex => {
                    diagnostics.push(negative_z_index_diagnostic(&analysis.parsed.raw));
                    return;
                }
                SemanticIssue::UnsupportedSizeMode { mode } => {
                    diagnostics.push(unsupported_size_mode_diagnostic(mode, &analysis.parsed.raw));
                    return;
                }
            }
        }
    }

    match &analysis.utility {
        UtilityKind::BackgroundColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    BACKGROUND_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::TextColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    TEXT_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::ImageColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    IMAGE_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::PlaceholderColor => {
            if let Some(color_key) = analysis.payload() {
                apply_color_utility(
                    style,
                    config,
                    diagnostics,
                    PLACEHOLDER_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::Radius => {
            if let Some(radius_key) = analysis.payload() {
                if let Some(value) = config.theme.radius.get(radius_key) {
                    style.set_helper_prop("uicorner", "CornerRadius", value.clone());
                } else {
                    diagnostics.push(crate::diagnostics::compiler::unknown_theme_key_diagnostic(
                        "radius",
                        radius_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::ZIndex => {
            if let Some(z_key) = analysis.payload() {
                if let Some(value) = resolve_z_index_value(z_key, &analysis.parsed.raw, diagnostics)
                {
                    style.set_prop("ZIndex", value);
                }
            }
        }
        UtilityKind::Padding(axis) => {
            if let Some(spacing_key) = analysis.payload() {
                apply_spacing_utility(
                    style,
                    config,
                    diagnostics,
                    spacing_key,
                    &analysis.parsed.raw,
                    &axis,
                );
            }
        }
        UtilityKind::Gap => {
            if let Some(spacing_key) = analysis.payload() {
                apply_spacing_utility(
                    style,
                    config,
                    diagnostics,
                    spacing_key,
                    &analysis.parsed.raw,
                    &PaddingKind::All,
                );
            }
        }
        UtilityKind::Width => {
            if let Some(size_key) = analysis.payload() {
                *pending_size_width =
                    resolve_size_axis_value(config, diagnostics, size_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::Height => {
            if let Some(size_key) = analysis.payload() {
                *pending_size_height =
                    resolve_size_axis_value(config, diagnostics, size_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::Size => {
            if let Some(size_key) = analysis.payload() {
                let value =
                    resolve_size_axis_value(config, diagnostics, size_key, &analysis.parsed.raw);
                *pending_size_width = value.clone();
                *pending_size_height = value;
            }
        }
        UtilityKind::Unknown => {
            diagnostics.push(unsupported_utility_family_diagnostic(&analysis.parsed.raw));
        }
    }
}

fn apply_spacing_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
    axis: &PaddingKind,
) {
    if let Some(value) = resolve_spacing_value(config, spacing_key) {
        match axis {
            PaddingKind::All => {
                style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                style.set_helper_prop("uipadding", "PaddingRight", value.clone());
                style.set_helper_prop("uipadding", "PaddingBottom", value.clone());
                style.set_helper_prop("uipadding", "PaddingLeft", value);
            }
            PaddingKind::X => {
                style.set_helper_prop("uipadding", "PaddingLeft", value.clone());
                style.set_helper_prop("uipadding", "PaddingRight", value);
            }
            PaddingKind::Y => {
                style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                style.set_helper_prop("uipadding", "PaddingBottom", value);
            }
            PaddingKind::Top => {
                style.set_helper_prop("uipadding", "PaddingTop", value);
            }
            PaddingKind::Right => {
                style.set_helper_prop("uipadding", "PaddingRight", value);
            }
            PaddingKind::Bottom => {
                style.set_helper_prop("uipadding", "PaddingBottom", value);
            }
            PaddingKind::Left => {
                style.set_helper_prop("uipadding", "PaddingLeft", value);
            }
        }
        return;
    }

    diagnostics.push(crate::diagnostics::compiler::unknown_theme_key_diagnostic(
        "spacing",
        spacing_key,
        token,
    ));
}
