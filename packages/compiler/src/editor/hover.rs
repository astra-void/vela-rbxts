use crate::api::{HoverContent, HoverRequest, HoverResponse};
use crate::editor::{
    class_name_context_at_position, token_at_position, tokenize_class_name_with_ranges,
};
use crate::utilities::{
    color::{describe_color_token, BACKGROUND_COLOR_FAMILY, IMAGE_COLOR_FAMILY, PLACEHOLDER_COLOR_FAMILY, TEXT_COLOR_FAMILY},
    radius::resolve_radius_value,
    size::resolve_size_axis_value,
    spacing::resolve_spacing_value,
    variants::split_variant_prefixes,
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

fn describe_token(token: &str, config: &crate::config::model::TailwindConfig, element_tag: &str) -> Option<HoverContent> {
    let (variants, base_token) = split_variant_prefixes(token)?;
    let variant_prefix = if variants.is_empty() {
        String::new()
    } else {
        format!("Runtime variant `{}`. ", variants.join(":"))
    };

    if !crate::editor::is_utility_allowed_on_host(element_tag, token) {
        return Some(HoverContent {
            display: format!("`{token}`"),
            documentation: format!(
                "{variant_prefix}This utility is not valid on Roblox `{element_tag}` elements."
            ),
        });
    }

    if let Some(color_key) = base_token.strip_prefix("bg-") {
        return describe_color_token(
            token,
            color_key,
            config,
            BACKGROUND_COLOR_FAMILY,
            "BackgroundColor3",
            variant_prefix,
        );
    }
    if let Some(color_key) = base_token.strip_prefix("text-") {
        return describe_color_token(
            token,
            color_key,
            config,
            TEXT_COLOR_FAMILY,
            "TextColor3",
            variant_prefix,
        );
    }
    if let Some(color_key) = base_token.strip_prefix("image-") {
        return describe_color_token(
            token,
            color_key,
            config,
            IMAGE_COLOR_FAMILY,
            "ImageColor3",
            variant_prefix,
        );
    }
    if let Some(color_key) = base_token.strip_prefix("placeholder-") {
        return describe_color_token(
            token,
            color_key,
            config,
            PLACEHOLDER_COLOR_FAMILY,
            "PlaceholderColor3",
            variant_prefix,
        );
    }
    if let Some(radius_key) = base_token.strip_prefix("rounded-") {
        let value = resolve_radius_value(config, radius_key)?;
        return Some(HoverContent {
            display: format!("`{token}` -> UICorner.CornerRadius"),
            documentation: format!("{variant_prefix}Sets `UICorner.CornerRadius` to `{value}`."),
        });
    }

    if let Some(z_key) = base_token.strip_prefix("z-") {
        let mut diagnostics = Vec::new();
        let value = crate::transform::runtime::resolve_z_index_value(z_key, token, &mut diagnostics)?;
        return Some(HoverContent {
            display: format!("`{token}` -> ZIndex"),
            documentation: format!("{variant_prefix}Sets `ZIndex` to `{value}`."),
        });
    }

    for (prefix, target) in [
        ("p-", "UIPadding"),
        ("px-", "UIPadding.PaddingLeft / PaddingRight"),
        ("py-", "UIPadding.PaddingTop / PaddingBottom"),
        ("pt-", "UIPadding.PaddingTop"),
        ("pr-", "UIPadding.PaddingRight"),
        ("pb-", "UIPadding.PaddingBottom"),
        ("pl-", "UIPadding.PaddingLeft"),
        ("gap-", "UIListLayout.Padding"),
    ] {
        if let Some(spacing_key) = base_token.strip_prefix(prefix) {
            let value = resolve_spacing_value(config, spacing_key)?;
            return Some(HoverContent {
                display: format!("`{token}` -> {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` to `{value}`."),
            });
        }
    }

    for (prefix, target) in [("w-", "Size.X"), ("h-", "Size.Y"), ("size-", "Size")] {
        if let Some(size_key) = base_token.strip_prefix(prefix) {
            if size_key == "fit" {
                return Some(HoverContent {
                    display: format!("`{token}` -> recognized, not lowered"),
                    documentation: format!(
                        "{variant_prefix}`fit` needs Roblox automatic sizing semantics and is not lowered to `Size`."
                    ),
                });
            }

            let mut diagnostics = Vec::new();
            let value = resolve_size_axis_value(config, &mut diagnostics, size_key, base_token)?;
            let resolved = if value.scale == "0" {
                format!("offset {}", value.offset)
            } else if value.offset == "0" {
                format!("scale {}", value.scale)
            } else {
                format!("scale {} plus offset {}", value.scale, value.offset)
            };

            return Some(HoverContent {
                display: format!("`{token}` -> Roblox {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` using {resolved}."),
            });
        }
    }

    None
}
