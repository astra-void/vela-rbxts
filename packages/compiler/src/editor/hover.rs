use crate::api::{HoverContent, HoverRequest, HoverResponse};
use crate::editor::{
    class_name_context_at_position, token_at_position, tokenize_class_name_with_ranges,
};
use crate::ir::model::SizeAxisValue;
use crate::semantic::{
    analyze::analyze_class_token,
    utility::{
        BACKGROUND_COLOR_FAMILY, ColorResolution, IMAGE_COLOR_FAMILY, PLACEHOLDER_COLOR_FAMILY,
        PaddingKind, TEXT_COLOR_FAMILY, UtilityKind, is_utility_allowed_on_host,
        resolve_color_value, resolve_radius_value, resolve_size_axis_value, resolve_spacing_value,
        resolve_z_index_value,
    },
};

pub(crate) fn get_hover_impl(request: HoverRequest) -> HoverResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let Some(context) = class_name_context_at_position(&request.source, request.position) else {
        return HoverResponse {
            contents: None,
            range: None,
        };
    };

    let Some(token) = token_at_position(
        &tokenize_class_name_with_ranges(&context.value, context.value_range.start),
        request.position,
    ) else {
        return HoverResponse {
            contents: None,
            range: None,
        };
    };

    let Some(contents) = describe_token(&token.text, &config, &context.element_tag) else {
        return HoverResponse {
            contents: None,
            range: None,
        };
    };

    HoverResponse {
        contents: Some(contents),
        range: Some(token.range),
    }
}

fn describe_token(
    token: &str,
    config: &crate::config::model::TailwindConfig,
    element_tag: &str,
) -> Option<HoverContent> {
    let analysis = analyze_class_token(token);
    let variant_prefix = variant_prefix(&analysis);

    if !is_utility_allowed_on_host(element_tag, &analysis.utility) {
        return Some(HoverContent {
            display: format!("`{token}`"),
            documentation: format!(
                "{variant_prefix}This utility is not valid on Roblox `{element_tag}` elements."
            ),
        });
    }

    match &analysis.utility {
        UtilityKind::BackgroundColor => describe_color_token(
            token,
            analysis.payload()?,
            config,
            BACKGROUND_COLOR_FAMILY,
            "BackgroundColor3",
            variant_prefix,
        ),
        UtilityKind::TextColor => describe_color_token(
            token,
            analysis.payload()?,
            config,
            TEXT_COLOR_FAMILY,
            "TextColor3",
            variant_prefix,
        ),
        UtilityKind::ImageColor => describe_color_token(
            token,
            analysis.payload()?,
            config,
            IMAGE_COLOR_FAMILY,
            "ImageColor3",
            variant_prefix,
        ),
        UtilityKind::PlaceholderColor => describe_color_token(
            token,
            analysis.payload()?,
            config,
            PLACEHOLDER_COLOR_FAMILY,
            "PlaceholderColor3",
            variant_prefix,
        ),
        UtilityKind::Radius => {
            let radius_key = analysis.payload()?;
            let value = resolve_radius_value(config, radius_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> UICorner.CornerRadius"),
                documentation: format!(
                    "{variant_prefix}Sets `UICorner.CornerRadius` to `{value}`."
                ),
            })
        }
        UtilityKind::ZIndex => {
            let z_key = analysis.payload()?;
            let mut diagnostics = Vec::new();
            let value = resolve_z_index_value(z_key, token, &mut diagnostics)?;
            Some(HoverContent {
                display: format!("`{token}` -> ZIndex"),
                documentation: format!("{variant_prefix}Sets `ZIndex` to `{value}`."),
            })
        }
        UtilityKind::Padding(axis) => {
            let spacing_key = analysis.payload()?;
            let target = padding_target(axis);
            let value = resolve_spacing_value(config, spacing_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` to `{value}`."),
            })
        }
        UtilityKind::Gap => {
            let spacing_key = analysis.payload()?;
            let value = resolve_spacing_value(config, spacing_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIListLayout.Padding"),
                documentation: format!("{variant_prefix}Sets `UIListLayout.Padding` to `{value}`."),
            })
        }
        UtilityKind::Width | UtilityKind::Height | UtilityKind::Size => {
            let size_key = analysis.payload()?;
            let target = match &analysis.utility {
                UtilityKind::Width => "Size.X",
                UtilityKind::Height => "Size.Y",
                UtilityKind::Size => "Size",
                _ => unreachable!(),
            };

            if size_key == "fit" {
                return Some(HoverContent {
                    display: format!("`{token}` -> recognized, not lowered"),
                    documentation: format!(
                        "{variant_prefix}`fit` needs Roblox automatic sizing semantics and is not lowered to `Size`."
                    ),
                });
            }

            let mut diagnostics = Vec::new();
            let value = resolve_size_axis_value(
                config,
                &mut diagnostics,
                size_key,
                &analysis.parsed.utility.raw,
            )?;
            let resolved = describe_size_axis_value(&value);

            Some(HoverContent {
                display: format!("`{token}` -> Roblox {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` using {resolved}."),
            })
        }
        UtilityKind::Unknown => None,
    }
}

fn describe_color_token(
    token: &str,
    color_key: &str,
    config: &crate::config::model::TailwindConfig,
    spec: crate::semantic::utility::ColorFamilySpec,
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

fn describe_size_axis_value(value: &SizeAxisValue) -> String {
    if value.scale == "0" {
        format!("offset {}", value.offset)
    } else if value.offset == "0" {
        format!("scale {}", value.scale)
    } else {
        format!("scale {} plus offset {}", value.scale, value.offset)
    }
}

fn padding_target(axis: &PaddingKind) -> &'static str {
    match axis {
        PaddingKind::All => "UIPadding",
        PaddingKind::X => "UIPadding.PaddingLeft / PaddingRight",
        PaddingKind::Y => "UIPadding.PaddingTop / PaddingBottom",
        PaddingKind::Top => "UIPadding.PaddingTop",
        PaddingKind::Right => "UIPadding.PaddingRight",
        PaddingKind::Bottom => "UIPadding.PaddingBottom",
        PaddingKind::Left => "UIPadding.PaddingLeft",
    }
}

fn variant_prefix(analysis: &crate::semantic::result::AnalyzedClassToken) -> String {
    if analysis.parsed.variants.is_empty() {
        return String::new();
    }

    let variant_label = analysis
        .parsed
        .variants
        .iter()
        .map(|variant| variant.raw.as_str())
        .collect::<Vec<_>>()
        .join(":");
    format!("Runtime variant `{variant_label}`. ")
}
