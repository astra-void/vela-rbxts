use crate::api::Diagnostic;
use crate::config::model::TailwindConfig;
use crate::diagnostics::compiler::{
    negative_z_index_diagnostic, unsupported_arbitrary_z_index_diagnostic,
    unsupported_utility_family_diagnostic, unsupported_z_index_auto_diagnostic,
    unsupported_z_index_value_diagnostic,
};
use crate::ir::model::{RuntimeRule, SizeAxisValue, StyleIr};
use crate::utilities::color::{
    apply_color_utility, BACKGROUND_COLOR_FAMILY, IMAGE_COLOR_FAMILY, PLACEHOLDER_COLOR_FAMILY,
    TEXT_COLOR_FAMILY,
};
use crate::utilities::size::{
    format_size_prop, resolve_size_axis_value,
};
use crate::utilities::spacing::{resolve_spacing_value};
use crate::utilities::variants::parse_runtime_variant_token;

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
        let token = token.as_ref();
        if let Some((condition, runtime_token)) = parse_runtime_variant_token(token) {
            let runtime_style = resolve_class_tokens(vec![runtime_token], config, diagnostics);
            if !runtime_style.base.props.is_empty() || !runtime_style.base.helpers.is_empty() {
                style.runtime_rules.push(RuntimeRule {
                    condition,
                    effects: runtime_style.base,
                });
            }
            continue;
        }

        if let Some(color_key) = token.strip_prefix("bg-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                BACKGROUND_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(color_key) = token.strip_prefix("text-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                TEXT_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(color_key) = token.strip_prefix("image-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                IMAGE_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(color_key) = token.strip_prefix("placeholder-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                PLACEHOLDER_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(radius_key) = token.strip_prefix("rounded-") {
            if let Some(value) = config.theme.radius.get(radius_key) {
                style.set_helper_prop("uicorner", "CornerRadius", value.clone());
            } else {
                diagnostics.push(crate::diagnostics::compiler::unknown_theme_key_diagnostic("radius", radius_key, token));
            }
            continue;
        }

        if token.starts_with("-z-") {
            diagnostics.push(negative_z_index_diagnostic(token));
            continue;
        }

        if let Some(z_key) = token.strip_prefix("z-") {
            if let Some(value) = resolve_z_index_value(z_key, token, diagnostics) {
                style.set_prop("ZIndex", value);
            }
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("p-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                    style.set_helper_prop("uipadding", "PaddingRight", value.clone());
                    style.set_helper_prop("uipadding", "PaddingBottom", value.clone());
                    style.set_helper_prop("uipadding", "PaddingLeft", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("px-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingLeft", value.clone());
                    style.set_helper_prop("uipadding", "PaddingRight", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("py-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                    style.set_helper_prop("uipadding", "PaddingBottom", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pt-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingTop", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pr-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingRight", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pb-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingBottom", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pl-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingLeft", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("gap-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uilistlayout", "Padding", value);
                },
            );
            continue;
        }

        if let Some(size_key) = token.strip_prefix("w-") {
            pending_size_width = resolve_size_axis_value(config, diagnostics, size_key, token);
            continue;
        }

        if let Some(size_key) = token.strip_prefix("h-") {
            pending_size_height = resolve_size_axis_value(config, diagnostics, size_key, token);
            continue;
        }

        if let Some(size_key) = token.strip_prefix("size-") {
            let value = resolve_size_axis_value(config, diagnostics, size_key, token);
            pending_size_width = value.clone();
            pending_size_height = value;
            continue;
        }

        diagnostics.push(unsupported_utility_family_diagnostic(token));
    }

    if pending_size_width.is_some() || pending_size_height.is_some() {
        style.set_prop(
            "Size",
            format_size_prop(pending_size_width, pending_size_height),
        );
    }

    style
}

fn apply_spacing_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
    apply: impl FnOnce(&mut StyleIr, String),
) {
    if let Some(value) = resolve_spacing_value(config, spacing_key) {
        apply(style, value);
        return;
    }

    diagnostics.push(crate::diagnostics::compiler::unknown_theme_key_diagnostic("spacing", spacing_key, token));
}
