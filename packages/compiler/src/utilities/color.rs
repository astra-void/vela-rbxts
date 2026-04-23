use crate::api::HoverContent;
use crate::config::model::{ColorValue, TailwindConfig};
use crate::diagnostics::compiler::{
    color_does_not_accept_shade_diagnostic, color_missing_shade_diagnostic,
    color_requires_shade_diagnostic, unknown_theme_key_diagnostic,
    unsupported_color_keyword_diagnostic,
};
use crate::ir::model::StyleIr;

#[derive(Clone)]
pub(crate) enum ColorResolution {
    Expression(String),
    Transparent,
}

#[derive(Clone, Copy)]
pub(crate) struct ColorFamilySpec {
    pub(crate) theme_family: &'static str,
    pub(crate) color_prop: &'static str,
    pub(crate) transparency_prop: Option<&'static str>,
}

pub(crate) const BACKGROUND_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "background color",
    color_prop: "BackgroundColor3",
    transparency_prop: Some("BackgroundTransparency"),
};

pub(crate) const TEXT_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "text color",
    color_prop: "TextColor3",
    transparency_prop: Some("TextTransparency"),
};

pub(crate) const IMAGE_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "image color",
    color_prop: "ImageColor3",
    transparency_prop: Some("ImageTransparency"),
};

pub(crate) const PLACEHOLDER_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "placeholder color",
    color_prop: "PlaceholderColor3",
    transparency_prop: None,
};

pub(crate) fn apply_color_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<crate::api::Diagnostic>,
    spec: ColorFamilySpec,
    color_key: &str,
    token: &str,
) {
    let Some(resolution) = resolve_color_value(config, diagnostics, spec, color_key, token) else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(transparency_prop);
            }

            style.set_prop(spec.color_prop, value);
        }
        ColorResolution::Transparent => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(spec.color_prop);
                style.set_prop(transparency_prop, "1".to_owned());
                return;
            }

            diagnostics.push(unsupported_color_keyword_diagnostic(
                spec.theme_family,
                color_key,
                token,
            ));
        }
    }
}

pub(crate) fn resolve_color_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<crate::api::Diagnostic>,
    spec: ColorFamilySpec,
    color_key: &str,
    token: &str,
) -> Option<ColorResolution> {
    if matches!(color_key, "current" | "inherit") {
        diagnostics.push(unsupported_color_keyword_diagnostic(
            spec.theme_family,
            color_key,
            token,
        ));
        return None;
    }

    if color_key == "transparent" {
        return Some(ColorResolution::Transparent);
    }

    match split_color_key(color_key) {
        ColorKey::Semantic(color_name) => match config.theme.colors.get(color_name) {
            Some(ColorValue::Literal(value)) => Some(ColorResolution::Expression(value.clone())),
            Some(ColorValue::Palette(_)) => {
                diagnostics.push(color_requires_shade_diagnostic(
                    spec.theme_family,
                    color_name,
                    token,
                ));
                None
            }
            None => {
                diagnostics.push(unknown_theme_key_diagnostic(
                    spec.theme_family,
                    color_key,
                    token,
                ));
                None
            }
        },
        ColorKey::Shaded { color_name, shade } => match config.theme.colors.get(color_name) {
            Some(ColorValue::Literal(_)) => {
                diagnostics.push(color_does_not_accept_shade_diagnostic(
                    spec.theme_family,
                    color_name,
                    shade,
                    token,
                ));
                None
            }
            Some(ColorValue::Palette(scale)) => match scale.get(shade) {
                Some(value) => Some(ColorResolution::Expression(value.clone())),
                None => {
                    diagnostics.push(color_missing_shade_diagnostic(
                        spec.theme_family,
                        color_name,
                        shade,
                        token,
                    ));
                    None
                }
            },
            None => {
                diagnostics.push(unknown_theme_key_diagnostic(
                    spec.theme_family,
                    color_key,
                    token,
                ));
                None
            }
        },
    }
}

pub(crate) enum ColorKey<'a> {
    Semantic(&'a str),
    Shaded { color_name: &'a str, shade: &'a str },
}

pub(crate) fn split_color_key(key: &str) -> ColorKey<'_> {
    let Some((name, shade)) = key.rsplit_once('-') else {
        return ColorKey::Semantic(key);
    };

    if is_shade_token(shade) {
        return ColorKey::Shaded {
            color_name: name,
            shade,
        };
    }

    ColorKey::Semantic(key)
}

pub(crate) fn is_shade_token(value: &str) -> bool {
    matches!(
        value,
        "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950"
    )
}

pub(crate) fn describe_color_token(
    token: &str,
    color_key: &str,
    config: &TailwindConfig,
    spec: ColorFamilySpec,
    prop: &str,
    variant_prefix: String,
) -> Option<HoverContent> {
    let mut diagnostics = Vec::new();
    let resolution = resolve_color_value(config, &mut diagnostics, spec, color_key, token)?;
    let documentation = match resolution {
        ColorResolution::Expression(value) => {
            format!("{variant_prefix}Sets `{prop}` to `{value}`.")
        }
        ColorResolution::Transparent => {
            format!("{variant_prefix}Sets the matching Roblox transparency prop for `{prop}`.")
        }
    };

    Some(HoverContent {
        display: format!("`{token}` -> {prop}"),
        documentation,
    })
}

pub(crate) fn color_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = Vec::new();
    for (name, color) in &config.theme.colors {
        match color {
            ColorValue::Literal(_) => {
                push_unique(&mut keys, name.clone());
            }
            ColorValue::Palette(scale) => {
                for shade in scale.keys() {
                    push_unique(&mut keys, format!("{name}-{shade}"));
                }
            }
        }
    }
    keys
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}
