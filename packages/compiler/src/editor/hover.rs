use crate::api::{HoverContent, HoverRequest, HoverResponse};
use crate::editor::{
    class_name_context_at_position, offset_value_text, px_length_text, token_at_position,
    tokenize_class_name_with_ranges,
};
use crate::ir::model::SizeAxisValue;
use crate::semantic::{
    analyze::analyze_class_token,
    utility::{
        ANIMATION_VALUES, BACKGROUND_COLOR_FAMILY, BORDER_COLOR_FAMILY, ColorResolution,
        DEFAULT_TRANSITION_TIME, DIVIDE_COLOR_FAMILY, GRADIENT_COLOR_FAMILY, IMAGE_COLOR_FAMILY,
        OUTLINE_COLOR_FAMILY, PLACEHOLDER_COLOR_FAMILY, PaddingKind, RING_COLOR_FAMILY,
        SCROLLBAR_COLOR_FAMILY, SHADOW_COLOR_FAMILY, StrokePayload, TEXT_COLOR_FAMILY, UtilityKind,
        classify_stroke_payload, end_relative_position_axis, font_face_expression,
        is_automatic_size_key, is_known_unsupported_border_payload, is_utility_allowed_on_host,
        resolve_align_content_flex_value, resolve_align_items_value, resolve_align_self_value,
        resolve_anchor_point_value, resolve_aspect_ratio_value, resolve_border_thickness_value,
        resolve_canvas_size_value, resolve_color_value, resolve_duration_seconds,
        resolve_ease_value, resolve_flex_direction_value, resolve_flex_item_mode,
        resolve_flex_wrap_value, resolve_font_family_value, resolve_font_style_value,
        resolve_font_weight_value, resolve_gradient_rotation, resolve_grid_cell_count,
        resolve_items_flex_value, resolve_justify_flex_value, resolve_justify_value,
        resolve_layout_order_value, resolve_line_height_value, resolve_line_join_value,
        resolve_object_fit_value, resolve_opacity_value, resolve_overflow_value,
        resolve_overscroll_value, resolve_pointer_events_value, resolve_position_axis_value,
        resolve_radius_value, resolve_rotation_value, resolve_scale_value,
        resolve_scroll_direction_value, resolve_shadow_preset, resolve_size_axis_value,
        resolve_size_spacing_offset, resolve_spacing_value, resolve_text_decoration_value,
        resolve_text_size_value, resolve_text_transform_value, resolve_text_wrap_value,
        resolve_text_x_alignment_value, resolve_text_y_alignment_value, resolve_transition_toggle,
        resolve_visibility_value, resolve_whitespace_value, resolve_z_index_value,
        spacing_value_to_offset, split_color_opacity,
    },
};
use crate::transform::opacity::opacity_transparency_props;

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

    let Some(contents) = describe_token(&token.text, &config, context.element_tag.as_deref())
    else {
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
    element_tag: Option<&str>,
) -> Option<HoverContent> {
    let analysis = analyze_class_token(token);
    let variant_prefix = variant_prefix(&analysis);

    if let Some(utility) = crate::semantic::plugin::lookup_plugin_utility(
        config,
        crate::semantic::variant::split_variant_prefixes(token).1,
    ) {
        return Some(HoverContent {
            display: format!("`{token}`"),
            documentation: format!(
                "{variant_prefix}{}",
                crate::editor::completions::describe_plugin_utility(utility)
            ),
        });
    }

    if !is_utility_allowed_on_host(element_tag, &analysis.utility) {
        let element_tag = element_tag.unwrap_or_default();
        return Some(HoverContent {
            display: format!("`{token}`"),
            documentation: format!(
                "{variant_prefix}This utility is not valid on Roblox `{element_tag}` elements."
            ),
        });
    }

    match &analysis.utility {
        UtilityKind::BackgroundColor
        | UtilityKind::TextColor
        | UtilityKind::ImageColor
        | UtilityKind::PlaceholderColor
        | UtilityKind::DivideColor
        | UtilityKind::ScrollbarColor
        | UtilityKind::ShadowColor
        | UtilityKind::GradientDirection
        | UtilityKind::GradientFrom
        | UtilityKind::GradientVia
        | UtilityKind::GradientTo => {
            describe_color_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::Border | UtilityKind::Radius(_) | UtilityKind::Ring | UtilityKind::Outline => {
            describe_border_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::Padding(_)
        | UtilityKind::Gap
        | UtilityKind::Margin(_)
        | UtilityKind::SpaceX
        | UtilityKind::SpaceY
        | UtilityKind::CenterX
        | UtilityKind::CenterY => {
            describe_spacing_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::Width
        | UtilityKind::Height
        | UtilityKind::Size
        | UtilityKind::AspectRatio
        | UtilityKind::Basis
        | UtilityKind::MinWidth
        | UtilityKind::MaxWidth
        | UtilityKind::MinHeight
        | UtilityKind::MaxHeight => {
            describe_size_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::ZIndex
        | UtilityKind::Rotation
        | UtilityKind::Scale
        | UtilityKind::PositionX
        | UtilityKind::PositionY
        | UtilityKind::Inset
        | UtilityKind::PositionRight
        | UtilityKind::PositionBottom
        | UtilityKind::AnchorPoint
        | UtilityKind::TranslateX
        | UtilityKind::TranslateY => {
            describe_position_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::GridAutoRows
        | UtilityKind::GridAutoColumns
        | UtilityKind::FlexDirection
        | UtilityKind::JustifyContent
        | UtilityKind::AlignItems
        | UtilityKind::AlignContent
        | UtilityKind::AlignSelf
        | UtilityKind::LayoutOrder
        | UtilityKind::Grid
        | UtilityKind::GridColumns
        | UtilityKind::GridRows
        | UtilityKind::Visibility
        | UtilityKind::Overflow
        | UtilityKind::FlexWrap
        | UtilityKind::FlexItem => {
            describe_layout_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::LineHeight
        | UtilityKind::TextTransform
        | UtilityKind::TextDecoration
        | UtilityKind::Whitespace
        | UtilityKind::FontStyle
        | UtilityKind::TextSize
        | UtilityKind::FontWeight
        | UtilityKind::FontFamily
        | UtilityKind::TextXAlignment
        | UtilityKind::TextYAlignment
        | UtilityKind::TextWrap
        | UtilityKind::TextTruncate => {
            describe_text_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::ObjectFit
        | UtilityKind::PointerEvents
        | UtilityKind::Overscroll
        | UtilityKind::ScrollDirection
        | UtilityKind::ScrollbarThickness
        | UtilityKind::CanvasSize => {
            describe_host_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::Opacity
        | UtilityKind::DivideX
        | UtilityKind::DivideY
        | UtilityKind::ShadowSize => {
            describe_effects_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::Transition
        | UtilityKind::TransitionDuration
        | UtilityKind::TransitionDelay
        | UtilityKind::TransitionEase
        | UtilityKind::Animation => {
            describe_motion_family(&analysis, token, config, element_tag, &variant_prefix)
        }
        UtilityKind::Unknown => None,
    }
}

/// Color, gradient stops and the gradient direction they are read with.
fn describe_color_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

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
        UtilityKind::DivideColor => {
            let (color_key, opacity) = split_color_opacity(analysis.payload()?);
            let mut diagnostics = Vec::new();
            let resolution = resolve_color_value(
                config,
                &mut diagnostics,
                DIVIDE_COLOR_FAMILY,
                color_key,
                token,
            )?;
            let ColorResolution::Expression(value) = resolution else {
                return None;
            };
            let fade = match opacity_modifier_transparency(opacity) {
                Some(transparency) => {
                    format!(" Sets each separator's `BackgroundTransparency` to `{transparency}`.")
                }
                None => String::new(),
            };
            Some(HoverContent {
                display: format!("`{token}` -> separator color"),
                documentation: format!(
                    "{variant_prefix}Paints the `divide-x`/`divide-y` separators with `{value}`.{fade}"
                ),
            })
        }
        UtilityKind::ScrollbarColor => describe_color_token(
            token,
            analysis.payload()?,
            config,
            SCROLLBAR_COLOR_FAMILY,
            "ScrollBarImageColor3",
            variant_prefix,
        ),
        UtilityKind::ShadowColor => {
            let color_key = analysis.payload()?;
            let mut diagnostics = Vec::new();
            let resolution = resolve_color_value(
                config,
                &mut diagnostics,
                SHADOW_COLOR_FAMILY,
                color_key,
                token,
            )?;
            let documentation = match resolution {
                ColorResolution::Expression(value) => {
                    format!("{variant_prefix}Sets `UIShadow.Color` to `{value}`.")
                }
                ColorResolution::Transparent => {
                    format!("{variant_prefix}Sets `UIShadow.Transparency` to `1`.")
                }
            };
            Some(HoverContent {
                display: format!("`{token}` -> UIShadow.Color"),
                documentation,
            })
        }
        UtilityKind::GradientDirection => {
            let rotation = resolve_gradient_rotation(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIGradient.Rotation"),
                documentation: format!(
                    "{variant_prefix}Creates a Roblox UIGradient with `Rotation = {rotation}`. Combine with `from-*`, `via-*`, and `to-*` color stops."
                ),
            })
        }
        UtilityKind::GradientFrom | UtilityKind::GradientVia | UtilityKind::GradientTo => {
            let (color_key, opacity) = split_color_opacity(analysis.payload()?);
            let stop = match &analysis.utility {
                UtilityKind::GradientFrom => "from",
                UtilityKind::GradientVia => "via",
                UtilityKind::GradientTo => "to",
                _ => unreachable!(),
            };
            let mut diagnostics = Vec::new();
            let resolution = resolve_color_value(
                config,
                &mut diagnostics,
                GRADIENT_COLOR_FAMILY,
                color_key,
                token,
            )?;
            let fade = match opacity_modifier_transparency(opacity) {
                Some(transparency) => {
                    format!(" Sets its `UIGradient.Transparency` keypoint to `{transparency}`.")
                }
                None => String::new(),
            };
            let documentation = match resolution {
                ColorResolution::Expression(value) => format!(
                    "{variant_prefix}Adds a `{stop}` color stop `{value}` to the parent's UIGradient.{fade}"
                ),
                ColorResolution::Transparent => format!(
                    "{variant_prefix}`transparent` gradient stops are not lowered to UIGradient yet."
                ),
            };
            Some(HoverContent {
                display: format!("`{token}` -> UIGradient.Color"),
                documentation,
            })
        }
        _ => None,
    }
}

/// The stroke and corner families, which share one UIStroke and one UICorner.
fn describe_border_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::Border => {
            describe_border_token(token, analysis.payload(), config, variant_prefix)
        }
        UtilityKind::Radius(kind) => {
            let radius_key = analysis.payload()?;
            let value = resolve_radius_value(config, radius_key)?;
            let props = if kind.suffix().is_empty() {
                "UICorner.CornerRadius".to_owned()
            } else {
                kind.props()
                    .iter()
                    .map(|prop| format!("UICorner.{prop}"))
                    .collect::<Vec<_>>()
                    .join(", ")
            };
            Some(HoverContent {
                display: format!("`{token}` -> {props}"),
                documentation: format!(
                    "{variant_prefix}Sets `{}` to {}.",
                    props.replace(", ", "`, `"),
                    udim_value_text(config, &value)
                ),
            })
        }
        UtilityKind::Ring | UtilityKind::Outline => {
            let family = match &analysis.utility {
                UtilityKind::Ring => "ring",
                _ => "outline",
            };
            let documentation = match analysis.payload() {
                None => {
                    let thickness = if family == "ring" { "3" } else { "2" };
                    format!(
                        "{variant_prefix}Sets `UIStroke.Thickness` to {} with `ApplyStrokeMode = Border`. Shares the same UIStroke as `border-*`.",
                        offset_value_text(config, thickness)
                    )
                }
                Some(payload) => match classify_stroke_payload(&analysis.utility, payload) {
                    StrokePayload::Thickness(thickness) => format!(
                        "{variant_prefix}Sets `UIStroke.Thickness` to {} with `ApplyStrokeMode = Border`. Shares the same UIStroke as `border-*`.",
                        offset_value_text(config, &thickness.offset(config))
                    ),
                    StrokePayload::Unsupported => return None,
                    StrokePayload::Color => {
                        let mut diagnostics = Vec::new();
                        let resolution = resolve_color_value(
                            config,
                            &mut diagnostics,
                            if family == "ring" {
                                RING_COLOR_FAMILY
                            } else {
                                OUTLINE_COLOR_FAMILY
                            },
                            payload,
                            token,
                        )?;
                        match resolution {
                            ColorResolution::Expression(value) => format!(
                                "{variant_prefix}Sets `UIStroke.Color` to `{value}`. Shares the same UIStroke as `border-*`."
                            ),
                            ColorResolution::Transparent => {
                                format!("{variant_prefix}Sets `UIStroke.Transparency` to `1`.")
                            }
                        }
                    }
                },
            };
            Some(HoverContent {
                display: format!("`{token}` -> UIStroke"),
                documentation,
            })
        }
        _ => None,
    }
}

/// What puts space around or between elements.
fn describe_spacing_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::Padding(axis) => {
            let spacing_key = analysis.payload()?;
            let target = padding_target(axis);
            let value = resolve_spacing_value(config, spacing_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> {target}"),
                documentation: format!(
                    "{variant_prefix}Sets `{target}` to {}.",
                    udim_value_text(config, &value)
                ),
            })
        }
        UtilityKind::Gap => {
            let spacing_key = analysis.payload()?;
            let value = resolve_spacing_value(config, spacing_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIListLayout.Padding"),
                documentation: format!(
                    "{variant_prefix}Sets `UIListLayout.Padding` to {}.",
                    udim_value_text(config, &value)
                ),
            })
        }
        UtilityKind::Margin(axis) => {
            let spacing_key = analysis.payload()?;
            let value = resolve_spacing_value(config, spacing_key)?;
            let negative = analysis.parsed.utility.raw.starts_with("-m");
            let sides = match axis {
                PaddingKind::All => "all sides",
                PaddingKind::X => "the left and right",
                PaddingKind::Y => "the top and bottom",
                PaddingKind::Top => "the top",
                PaddingKind::Right => "the right",
                PaddingKind::Bottom => "the bottom",
                PaddingKind::Left => "the left",
            };
            Some(HoverContent {
                display: format!("`{token}` -> margin box"),
                documentation: if negative {
                    let shift = spacing_value_to_offset(&value)
                        .and_then(|offset| offset.parse::<f64>().ok())
                        .and_then(|px| crate::editor::rem_offset_label(config, -px))
                        .unwrap_or_else(|| format!("`-{value}`"));
                    format!(
                        "{variant_prefix}Shifts `Position` by {shift} (negative margins pull from the top/left edge)."
                    )
                } else {
                    format!(
                        "{variant_prefix}Wraps the element in a transparent margin box padded by {} on {sides}.",
                        udim_value_text(config, &value)
                    )
                },
            })
        }
        UtilityKind::SpaceX | UtilityKind::SpaceY => {
            let spacing_key = analysis.payload()?;
            let value = resolve_spacing_value(config, spacing_key)?;
            let direction = match &analysis.utility {
                UtilityKind::SpaceX => "Horizontal",
                _ => "Vertical",
            };
            Some(HoverContent {
                display: format!("`{token}` -> UIListLayout.Padding"),
                documentation: format!(
                    "{variant_prefix}Sets `UIListLayout.Padding` to {} with `FillDirection = Enum.FillDirection.{direction}`.",
                    udim_value_text(config, &value)
                ),
            })
        }
        UtilityKind::CenterX | UtilityKind::CenterY => {
            let axis = match &analysis.utility {
                UtilityKind::CenterX => "X",
                _ => "Y",
            };
            Some(HoverContent {
                display: format!("`{token}` -> AnchorPoint + Position"),
                documentation: format!(
                    "{variant_prefix}Centers the element on the {axis} axis with `AnchorPoint.{axis} = 0.5` and `Position.{axis} = UDim(0.5, 0)`."
                ),
            })
        }
        _ => None,
    }
}

/// The size axes and the constraints that bound them.
fn describe_size_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::Width | UtilityKind::Height | UtilityKind::Size => {
            let size_key = analysis.payload()?;
            let target = match &analysis.utility {
                UtilityKind::Width => "Size.X",
                UtilityKind::Height => "Size.Y",
                UtilityKind::Size => "Size",
                _ => unreachable!(),
            };

            if is_automatic_size_key(size_key) {
                let axis = match &analysis.utility {
                    UtilityKind::Width => "X",
                    UtilityKind::Height => "Y",
                    UtilityKind::Size => "XY",
                    _ => unreachable!(),
                };
                return Some(HoverContent {
                    display: format!("`{token}` -> AutomaticSize"),
                    documentation: format!(
                        "{variant_prefix}Sets `AutomaticSize` to `Enum.AutomaticSize.{axis}`."
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
            let resolved = describe_size_axis_value(config, &value);

            Some(HoverContent {
                display: format!("`{token}` -> Roblox {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` using {resolved}."),
            })
        }
        UtilityKind::AspectRatio => {
            let ratio_key = analysis.payload()?;
            let value = resolve_aspect_ratio_value(ratio_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIAspectRatioConstraint.AspectRatio"),
                documentation: format!(
                    "{variant_prefix}Sets `UIAspectRatioConstraint.AspectRatio` to `{value}`."
                ),
            })
        }
        UtilityKind::Basis => {
            let size_key = analysis.payload()?;
            if is_automatic_size_key(size_key) {
                return Some(HoverContent {
                    display: format!("`{token}` -> AutomaticSize"),
                    documentation: format!(
                        "{variant_prefix}Enables `AutomaticSize` on the X axis."
                    ),
                });
            }

            let mut diagnostics = Vec::new();
            let value =
                resolve_size_axis_value(config, &mut diagnostics, size_key, &analysis.parsed.raw)?;
            let resolved = describe_size_axis_value(config, &value);
            Some(HoverContent {
                display: format!("`{token}` -> Roblox Size.X"),
                documentation: format!(
                    "{variant_prefix}Sets the main-axis (row) size `Size.X` using {resolved}."
                ),
            })
        }
        UtilityKind::MinWidth
        | UtilityKind::MaxWidth
        | UtilityKind::MinHeight
        | UtilityKind::MaxHeight => {
            let size_key = analysis.payload()?;
            let target = match &analysis.utility {
                UtilityKind::MinWidth => "UISizeConstraint.MinSize.X",
                UtilityKind::MaxWidth => "UISizeConstraint.MaxSize.X",
                UtilityKind::MinHeight => "UISizeConstraint.MinSize.Y",
                UtilityKind::MaxHeight => "UISizeConstraint.MaxSize.Y",
                _ => unreachable!(),
            };
            let mut diagnostics = Vec::new();
            let value = resolve_size_spacing_offset(
                config,
                &mut diagnostics,
                size_key,
                &analysis.parsed.utility.raw,
            )?;
            Some(HoverContent {
                display: format!("`{token}` -> {target}"),
                documentation: format!(
                    "{variant_prefix}Sets `{target}` to {}.",
                    offset_value_text(config, &value)
                ),
            })
        }
        _ => None,
    }
}

/// Where an element sits and how it is transformed about that point.
fn describe_position_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::ZIndex => {
            let z_key = analysis.payload()?;
            let mut diagnostics = Vec::new();
            let value = resolve_z_index_value(z_key, token, &mut diagnostics)?;
            Some(HoverContent {
                display: format!("`{token}` -> ZIndex"),
                documentation: format!("{variant_prefix}Sets `ZIndex` to `{value}`."),
            })
        }
        UtilityKind::Rotation => {
            let degrees = analysis.payload()?;
            let negative = analysis.parsed.utility.raw.starts_with("-rotate-");
            let value = resolve_rotation_value(degrees, negative)?;
            Some(HoverContent {
                display: format!("`{token}` -> Rotation"),
                documentation: format!("{variant_prefix}Sets `Rotation` to `{value}`."),
            })
        }
        UtilityKind::Scale => {
            let scale_key = analysis.payload()?;
            let value = resolve_scale_value(scale_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIScale.Scale"),
                documentation: format!("{variant_prefix}Sets `UIScale.Scale` to `{value}`."),
            })
        }
        UtilityKind::PositionX | UtilityKind::PositionY | UtilityKind::Inset => {
            let position_key = analysis.payload()?;
            let (negative, target) = match &analysis.utility {
                UtilityKind::PositionX => (
                    analysis.parsed.utility.raw.starts_with("-left-"),
                    "Position.X",
                ),
                UtilityKind::PositionY => (
                    analysis.parsed.utility.raw.starts_with("-top-"),
                    "Position.Y",
                ),
                UtilityKind::Inset => (
                    analysis.parsed.utility.raw.starts_with("-inset-"),
                    "Position",
                ),
                _ => unreachable!(),
            };

            let mut diagnostics = Vec::new();
            let value = resolve_position_axis_value(
                config,
                &mut diagnostics,
                position_key,
                &analysis.parsed.utility.raw,
                negative,
            )?;
            let resolved = describe_size_axis_value(config, &value);

            Some(HoverContent {
                display: format!("`{token}` -> Roblox {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` using {resolved}."),
            })
        }
        UtilityKind::PositionRight | UtilityKind::PositionBottom => {
            let position_key = analysis.payload()?;
            let (negative, target, edge) = match &analysis.utility {
                UtilityKind::PositionRight => (
                    analysis.parsed.utility.raw.starts_with("-right-"),
                    "Position.X",
                    "right",
                ),
                UtilityKind::PositionBottom => (
                    analysis.parsed.utility.raw.starts_with("-bottom-"),
                    "Position.Y",
                    "bottom",
                ),
                _ => unreachable!(),
            };

            let mut diagnostics = Vec::new();
            let value = end_relative_position_axis(resolve_position_axis_value(
                config,
                &mut diagnostics,
                position_key,
                &analysis.parsed.utility.raw,
                negative,
            )?);
            let resolved = describe_size_axis_value(config, &value);

            Some(HoverContent {
                display: format!("`{token}` -> Roblox {target}"),
                documentation: format!(
                    "{variant_prefix}Sets `{target}` from the {edge} edge using {resolved}."
                ),
            })
        }
        UtilityKind::AnchorPoint => {
            let origin_key = analysis.payload()?;
            let value = resolve_anchor_point_value(origin_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> AnchorPoint"),
                documentation: format!("{variant_prefix}Sets `AnchorPoint` to `{value}`."),
            })
        }
        UtilityKind::TranslateX | UtilityKind::TranslateY => {
            let translate_key = analysis.payload()?;
            let (negative, axis) = match &analysis.utility {
                UtilityKind::TranslateX => (
                    analysis.parsed.utility.raw.starts_with("-translate-x-"),
                    "X",
                ),
                _ => (
                    analysis.parsed.utility.raw.starts_with("-translate-y-"),
                    "Y",
                ),
            };

            let mut diagnostics = Vec::new();
            let value = resolve_position_axis_value(
                config,
                &mut diagnostics,
                translate_key,
                &analysis.parsed.utility.raw,
                negative,
            )?;
            let documentation = if value.scale != "0" {
                format!(
                    "{variant_prefix}Shifts the element by `{}` of its own size on the {axis} axis via `AnchorPoint`.",
                    value.scale
                )
            } else {
                match value
                    .offset
                    .parse::<f64>()
                    .ok()
                    .and_then(|px| crate::editor::rem_offset_label(config, px))
                {
                    Some(shift) => {
                        format!("{variant_prefix}Shifts `Position.{axis}` by {shift}.")
                    }
                    None => format!(
                        "{variant_prefix}Shifts `Position.{axis}` by `{}` pixels.",
                        value.offset
                    ),
                }
            };
            Some(HoverContent {
                display: format!("`{token}` -> Roblox transform"),
                documentation,
            })
        }
        _ => None,
    }
}

/// How a container arranges its children, and where a child sits in that.
fn describe_layout_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::GridAutoRows | UtilityKind::GridAutoColumns => {
            let spacing_key = analysis.payload()?;
            let value = resolve_spacing_value(config, spacing_key)?;
            let axis = match &analysis.utility {
                UtilityKind::GridAutoRows => "Y",
                _ => "X",
            };
            Some(HoverContent {
                display: format!("`{token}` -> UIGridLayout.CellSize.{axis}"),
                documentation: format!(
                    "{variant_prefix}Sets the cross axis of `UIGridLayout.CellSize` to {}. `grid-cols-*`/`grid-rows-*` size the axis they fill; this names the other one.",
                    udim_value_text(config, &value)
                ),
            })
        }
        UtilityKind::FlexDirection => {
            let value = resolve_flex_direction_value(analysis.payload())?;
            Some(HoverContent {
                display: format!("`{token}` -> UIListLayout.FillDirection"),
                documentation: format!(
                    "{variant_prefix}Sets `UIListLayout.FillDirection` to `{value}`."
                ),
            })
        }
        UtilityKind::JustifyContent => {
            let key = analysis.payload()?;
            if let Some(flex) = resolve_justify_flex_value(key) {
                return Some(HoverContent {
                    display: format!("`{token}` -> UIListLayout.HorizontalFlex"),
                    documentation: format!(
                        "{variant_prefix}Sets `UIListLayout.HorizontalFlex` to `Enum.UIFlexAlignment.{flex}`."
                    ),
                });
            }
            let value = resolve_justify_value(key)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIListLayout.HorizontalAlignment"),
                documentation: format!(
                    "{variant_prefix}Sets `UIListLayout.HorizontalAlignment` to `{value}`."
                ),
            })
        }
        UtilityKind::AlignItems => {
            let key = analysis.payload()?;
            if let Some(flex) = resolve_items_flex_value(key) {
                return Some(HoverContent {
                    display: format!("`{token}` -> UIListLayout.VerticalFlex"),
                    documentation: format!(
                        "{variant_prefix}Sets `UIListLayout.VerticalFlex` to `Enum.UIFlexAlignment.{flex}`."
                    ),
                });
            }
            let value = resolve_align_items_value(key)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIListLayout.VerticalAlignment"),
                documentation: format!(
                    "{variant_prefix}Sets `UIListLayout.VerticalAlignment` to `{value}`."
                ),
            })
        }
        UtilityKind::AlignContent => {
            let alignment_key = analysis.payload()?;
            if let Some(flex) = resolve_align_content_flex_value(alignment_key) {
                Some(HoverContent {
                    display: format!("`{token}` -> UIListLayout.VerticalFlex"),
                    documentation: format!(
                        "{variant_prefix}Sets `UIListLayout.VerticalFlex` to `Enum.UIFlexAlignment.{flex}`."
                    ),
                })
            } else {
                let value = resolve_align_items_value(alignment_key)?;
                Some(HoverContent {
                    display: format!("`{token}` -> UIListLayout.VerticalAlignment"),
                    documentation: format!(
                        "{variant_prefix}Sets `UIListLayout.VerticalAlignment` to `{value}`."
                    ),
                })
            }
        }
        UtilityKind::AlignSelf => {
            let alignment = resolve_align_self_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIFlexItem.ItemLineAlignment"),
                documentation: format!(
                    "{variant_prefix}Adds a Roblox UIFlexItem with `ItemLineAlignment = Enum.ItemLineAlignment.{alignment}`."
                ),
            })
        }
        UtilityKind::LayoutOrder => {
            let order_key = analysis.payload()?;
            let negative = analysis.parsed.utility.raw.starts_with("-order-");
            let value = resolve_layout_order_value(order_key, negative)?;
            Some(HoverContent {
                display: format!("`{token}` -> LayoutOrder"),
                documentation: format!("{variant_prefix}Sets `LayoutOrder` to `{value}`."),
            })
        }
        UtilityKind::Grid => Some(HoverContent {
            display: format!("`{token}` -> UIGridLayout"),
            documentation: format!(
                "{variant_prefix}Adds a Roblox UIGridLayout with `SortOrder = Enum.SortOrder.LayoutOrder`. Combine with `grid-cols-*`, `grid-rows-*`, and `gap-*`."
            ),
        }),
        UtilityKind::GridColumns | UtilityKind::GridRows => {
            let count = resolve_grid_cell_count(analysis.payload()?)?;
            let direction = match &analysis.utility {
                UtilityKind::GridColumns => "Horizontal",
                _ => "Vertical",
            };
            Some(HoverContent {
                display: format!("`{token}` -> UIGridLayout.FillDirectionMaxCells"),
                documentation: format!(
                    "{variant_prefix}Adds a Roblox UIGridLayout with `FillDirection = Enum.FillDirection.{direction}` and `FillDirectionMaxCells = {count}`."
                ),
            })
        }
        UtilityKind::Visibility => {
            let value = resolve_visibility_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> Visible"),
                documentation: format!("{variant_prefix}Sets `Visible` to `{value}`."),
            })
        }
        UtilityKind::Overflow => {
            let value = resolve_overflow_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> ClipsDescendants"),
                documentation: format!("{variant_prefix}Sets `ClipsDescendants` to `{value}`."),
            })
        }
        UtilityKind::FlexWrap => {
            let value = resolve_flex_wrap_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIListLayout.Wraps"),
                documentation: format!("{variant_prefix}Sets `UIListLayout.Wraps` to `{value}`."),
            })
        }
        UtilityKind::FlexItem => {
            let mode = resolve_flex_item_mode(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> UIFlexItem.FlexMode"),
                documentation: format!(
                    "{variant_prefix}Adds a Roblox UIFlexItem with `FlexMode = Enum.UIFlexMode.{mode}`."
                ),
            })
        }
        _ => None,
    }
}

/// Typography, including the families that compose into one FontFace.
fn describe_text_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::LineHeight => {
            let value = resolve_line_height_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> LineHeight"),
                documentation: format!("{variant_prefix}Sets `LineHeight` to `{value}`."),
            })
        }
        UtilityKind::TextTransform => {
            let value = resolve_text_transform_value(analysis.payload()?)?;
            let documentation = match value {
                "upper" => "Uppercases the element's `Text` (ASCII letters only).",
                "lower" => "Lowercases the element's `Text` (ASCII letters only).",
                "capitalize" => {
                    "Uppercases the first ASCII letter of each word in the element's `Text`."
                }
                _ => "Removes the text transform.",
            };
            Some(HoverContent {
                display: format!("`{token}` -> Text"),
                documentation: format!("{variant_prefix}{documentation}"),
            })
        }
        UtilityKind::TextDecoration => {
            let value = resolve_text_decoration_value(analysis.payload()?)?;
            let documentation = match value {
                "underline" => "Enables `RichText` and wraps the escaped `Text` in `<u>...</u>`.",
                "strike" => "Enables `RichText` and wraps the escaped `Text` in `<s>...</s>`.",
                _ => "Removes the text decoration.",
            };
            Some(HoverContent {
                display: format!("`{token}` -> Text"),
                documentation: format!("{variant_prefix}{documentation}"),
            })
        }
        UtilityKind::Whitespace => {
            let value = resolve_whitespace_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> TextWrapped"),
                documentation: format!("{variant_prefix}Sets `TextWrapped` to `{value}`."),
            })
        }
        UtilityKind::FontStyle => {
            let style = resolve_font_style_value(analysis.payload()?)?;
            let value = font_face_expression(None, None, Some(style));
            Some(HoverContent {
                display: format!("`{token}` -> FontFace"),
                documentation: format!("{variant_prefix}Sets `FontFace` to `{value}`."),
            })
        }
        UtilityKind::TextSize => {
            let size_key = analysis.payload()?;
            let value = resolve_text_size_value(config, size_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> TextSize"),
                documentation: format!(
                    "{variant_prefix}Sets `TextSize` to {}.",
                    offset_value_text(config, &value)
                ),
            })
        }
        UtilityKind::FontWeight => {
            let weight_key = analysis.payload()?;
            let value = resolve_font_weight_value(weight_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> FontFace"),
                documentation: format!("{variant_prefix}Sets `FontFace` to `{value}`."),
            })
        }
        UtilityKind::FontFamily => {
            let family_key = analysis.payload()?;
            let family = resolve_font_family_value(config, family_key)?;
            let value = font_face_expression(Some(&family), None, None);
            Some(HoverContent {
                display: format!("`{token}` -> FontFace"),
                documentation: format!(
                    "{variant_prefix}Sets `FontFace` to `{value}` from font family `{family_key}`."
                ),
            })
        }
        UtilityKind::TextXAlignment => {
            let value = resolve_text_x_alignment_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> TextXAlignment"),
                documentation: format!("{variant_prefix}Sets `TextXAlignment` to `{value}`."),
            })
        }
        UtilityKind::TextYAlignment => {
            let value = resolve_text_y_alignment_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> TextYAlignment"),
                documentation: format!("{variant_prefix}Sets `TextYAlignment` to `{value}`."),
            })
        }
        UtilityKind::TextWrap => {
            let value = resolve_text_wrap_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> TextWrapped"),
                documentation: format!("{variant_prefix}Sets `TextWrapped` to `{value}`."),
            })
        }
        UtilityKind::TextTruncate => Some(HoverContent {
            display: format!("`{token}` -> TextTruncate"),
            documentation: format!(
                "{variant_prefix}Sets `TextTruncate` to `Enum.TextTruncate.AtEnd`."
            ),
        }),
        _ => None,
    }
}

/// Families only some hosts carry: scrolling frames, images and input.
fn describe_host_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::ObjectFit => {
            let scale_type = resolve_object_fit_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> ScaleType"),
                documentation: format!(
                    "{variant_prefix}Sets `ScaleType` to `Enum.ScaleType.{scale_type}`."
                ),
            })
        }
        UtilityKind::PointerEvents => {
            let value = resolve_pointer_events_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> Interactable"),
                documentation: format!("{variant_prefix}Sets `Interactable` to `{value}`."),
            })
        }
        UtilityKind::Overscroll => {
            let behavior = resolve_overscroll_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> ElasticBehavior"),
                documentation: format!(
                    "{variant_prefix}Sets `ElasticBehavior` to `Enum.ElasticBehavior.{behavior}`."
                ),
            })
        }
        UtilityKind::ScrollDirection => {
            let payload = analysis.payload()?;
            if payload == "none" {
                return Some(HoverContent {
                    display: format!("`{token}` -> ScrollingEnabled"),
                    documentation: format!("{variant_prefix}Sets `ScrollingEnabled` to `false`."),
                });
            }

            let direction = resolve_scroll_direction_value(payload)?;
            Some(HoverContent {
                display: format!("`{token}` -> ScrollingDirection"),
                documentation: format!(
                    "{variant_prefix}Sets `ScrollingDirection` to `Enum.ScrollingDirection.{direction}`."
                ),
            })
        }
        UtilityKind::ScrollbarThickness => {
            let payload = analysis.payload()?;
            let thickness = if payload == "none" {
                "0".to_owned()
            } else {
                resolve_spacing_value(config, payload)
                    .as_deref()
                    .and_then(spacing_value_to_offset)?
            };
            Some(HoverContent {
                display: format!("`{token}` -> ScrollBarThickness"),
                documentation: format!(
                    "{variant_prefix}Sets `ScrollBarThickness` to {}.",
                    offset_value_text(config, &thickness)
                ),
            })
        }
        UtilityKind::CanvasSize => {
            let axis = resolve_canvas_size_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> AutomaticCanvasSize"),
                documentation: format!(
                    "{variant_prefix}Sets `AutomaticCanvasSize` to `Enum.AutomaticSize.{axis}`."
                ),
            })
        }
        _ => None,
    }
}

/// What paints over or beside an element rather than laying it out.
fn describe_effects_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    config: &crate::config::model::TailwindConfig,
    element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::Opacity => {
            let percent = analysis.payload()?;
            let value = resolve_opacity_value(percent)?;
            // A component element names no instance, so there is no channel to
            // report: the fade crosses to whatever it renders and lowers there.
            let Some(tag) = element_tag else {
                return Some(HoverContent {
                    display: format!("`{token}` -> the component's subtree"),
                    documentation: format!(
                        "{variant_prefix}Fades everything this component renders to `{value}` transparency, multiplied with any fade it is already nested in."
                    ),
                });
            };
            let props = opacity_transparency_props(Some(tag)).join(", ");
            Some(HoverContent {
                display: format!("`{token}` -> {props}"),
                documentation: format!(
                    "{variant_prefix}Fades this element to `{value}` transparency, and composes into the subtree under it."
                ),
            })
        }
        UtilityKind::DivideX | UtilityKind::DivideY => {
            let axis = match &analysis.utility {
                UtilityKind::DivideX => "vertical",
                _ => "horizontal",
            };
            let thickness = px_length_text(config, analysis.payload().unwrap_or("1"));
            Some(HoverContent {
                display: format!("`{token}` -> child separators"),
                documentation: format!(
                    "{variant_prefix}Inserts a {thickness} {axis} separator frame between the element's children. Not compatible with children that set an explicit `LayoutOrder`."
                ),
            })
        }
        UtilityKind::ShadowSize => {
            let key = analysis.payload();
            match key {
                Some("none") => Some(HoverContent {
                    display: format!("`{token}` -> UIShadow.Enabled"),
                    documentation: format!("{variant_prefix}Sets `UIShadow.Enabled` to `false`."),
                }),
                Some("inner") => Some(HoverContent {
                    display: format!("`{token}`"),
                    documentation: format!(
                        "{variant_prefix}`shadow-inner` is not supported; Roblox `UIShadow` cannot render inset shadows."
                    ),
                }),
                _ => {
                    let preset = resolve_shadow_preset(key)?;
                    let scaling = if config.theme.rem.is_static() {
                        ""
                    } else {
                        " `BlurRadius` scales with the viewport rem."
                    };
                    Some(HoverContent {
                        display: format!("`{token}` -> UIShadow"),
                        documentation: format!(
                            "{variant_prefix}Creates a Roblox UIShadow with `BlurRadius = {}`, `Offset = (0, {})`, and `Transparency = {}`.{scaling}",
                            preset.blur, preset.offset_y, preset.transparency
                        ),
                    })
                }
            }
        }
        _ => None,
    }
}

/// The transition and animation specs the runtime host tweens with.
fn describe_motion_family(
    analysis: &crate::semantic::result::AnalyzedClassToken,
    token: &str,
    _config: &crate::config::model::TailwindConfig,
    _element_tag: Option<&str>,
    variant_prefix: &str,
) -> Option<HoverContent> {
    let variant_prefix = variant_prefix.to_owned();

    match &analysis.utility {
        UtilityKind::Transition => {
            let (enabled, property) = resolve_transition_toggle(analysis.payload())?;
            Some(HoverContent {
                display: format!("`{token}` -> TweenService"),
                documentation: if enabled {
                    let scope = if property == "all" {
                        "every tweenable prop".to_owned()
                    } else {
                        format!("the `{property}` props only")
                    };
                    format!(
                        "{variant_prefix}Tweens runtime style changes with TweenService ({DEFAULT_TRANSITION_TIME}s by default), covering {scope}. Combine with `duration-*`, `ease-*`, and `delay-*`."
                    )
                } else {
                    format!(
                        "{variant_prefix}Disables the transition; runtime style changes apply instantly."
                    )
                },
            })
        }
        UtilityKind::TransitionDuration | UtilityKind::TransitionDelay => {
            let seconds = resolve_duration_seconds(analysis.payload()?)?;
            let field = match &analysis.utility {
                UtilityKind::TransitionDuration => "duration",
                _ => "delay",
            };
            Some(HoverContent {
                display: format!("`{token}` -> TweenInfo"),
                documentation: format!(
                    "{variant_prefix}Sets the transition {field} to `{seconds}s`."
                ),
            })
        }
        UtilityKind::TransitionEase => {
            let (style, direction) = resolve_ease_value(analysis.payload()?)?;
            Some(HoverContent {
                display: format!("`{token}` -> TweenInfo"),
                documentation: format!(
                    "{variant_prefix}Sets the transition easing to `Enum.EasingStyle.{style}` / `Enum.EasingDirection.{direction}`."
                ),
            })
        }
        UtilityKind::Animation => {
            let animation_key = analysis.payload()?;
            let (_, description) = ANIMATION_VALUES
                .iter()
                .find(|(name, _)| *name == animation_key)?;
            Some(HoverContent {
                display: format!("`{token}` -> TweenService loop"),
                documentation: format!("{variant_prefix}{description}"),
            })
        }
        _ => None,
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
    let (color_key, opacity) = split_color_opacity(color_key);
    let mut diagnostics = Vec::new();
    let resolution = resolve_color_value(config, &mut diagnostics, spec, color_key, token)?;
    let documentation = match resolution {
        ColorResolution::Expression(value) => {
            let fade = match (
                opacity_modifier_transparency(opacity),
                spec.transparency_prop,
            ) {
                (Some(transparency), Some(transparency_prop)) => {
                    format!(" Sets `{transparency_prop}` to `{transparency}`.")
                }
                _ => String::new(),
            };
            format!("{variant_prefix}Sets `{prop}` to `{value}`.{fade}")
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

fn opacity_modifier_transparency(opacity: Option<u32>) -> Option<String> {
    resolve_opacity_value(&opacity?.to_string())
}

fn describe_border_token(
    token: &str,
    border_key: Option<&str>,
    config: &crate::config::model::TailwindConfig,
    variant_prefix: String,
) -> Option<HoverContent> {
    let Some(border_key) = border_key else {
        return Some(HoverContent {
            display: format!("`{token}` -> UIStroke.Thickness"),
            documentation: format!(
                "{variant_prefix}Creates a Roblox UIStroke with `Thickness` set to {}.",
                offset_value_text(config, "1")
            ),
        });
    };

    if let Some(thickness) = resolve_border_thickness_value(Some(border_key)) {
        return Some(HoverContent {
            display: format!("`{token}` -> UIStroke.Thickness"),
            documentation: format!(
                "{variant_prefix}Sets `UIStroke.Thickness` to {}.",
                offset_value_text(config, &thickness.offset(config))
            ),
        });
    }

    if border_key == "transparent" {
        return Some(HoverContent {
            display: format!("`{token}` -> UIStroke.Transparency"),
            documentation: format!("{variant_prefix}Sets `UIStroke.Transparency` to `1`."),
        });
    }

    if let Some(line_join) = resolve_line_join_value(border_key) {
        return Some(HoverContent {
            display: format!("`{token}` -> UIStroke.LineJoinMode"),
            documentation: format!(
                "{variant_prefix}Sets `UIStroke.LineJoinMode` to `Enum.LineJoinMode.{line_join}`."
            ),
        });
    }

    if is_known_unsupported_border_payload(border_key) {
        return Some(HoverContent {
            display: format!("`{token}`"),
            documentation: format!(
                "{variant_prefix}This border utility is not supported on Roblox yet."
            ),
        });
    }

    let (border_key, opacity) = split_color_opacity(border_key);
    let mut diagnostics = Vec::new();
    let resolution = resolve_color_value(
        config,
        &mut diagnostics,
        BORDER_COLOR_FAMILY,
        border_key,
        token,
    )?;

    let transparency = opacity
        .and_then(|percent| resolve_opacity_value(&percent.to_string()))
        .unwrap_or_else(|| "0".to_owned());
    let documentation = match resolution {
        ColorResolution::Expression(value) => format!(
            "{variant_prefix}Sets `UIStroke.Color` to the resolved `{border_key}` Color3 value `{value}` and `UIStroke.Transparency` to `{transparency}`."
        ),
        ColorResolution::Transparent => {
            format!("{variant_prefix}Sets `UIStroke.Transparency` to `1`.")
        }
    };

    Some(HoverContent {
        display: format!("`{token}` -> UIStroke.Color"),
        documentation,
    })
}

fn describe_size_axis_value(
    config: &crate::config::model::TailwindConfig,
    value: &SizeAxisValue,
) -> String {
    let offset = || {
        value
            .offset
            .parse::<f64>()
            .ok()
            .and_then(|px| crate::editor::rem_offset_label(config, px))
            .unwrap_or_else(|| value.offset.clone())
    };
    if value.scale == "0" {
        format!("offset {}", offset())
    } else if value.offset == "0" {
        format!("scale {}", value.scale)
    } else {
        format!("scale {} plus offset {}", value.scale, offset())
    }
}

fn udim_value_text(config: &crate::config::model::TailwindConfig, value: &str) -> String {
    spacing_value_to_offset(value)
        .and_then(|offset| offset.parse::<f64>().ok())
        .and_then(|px| crate::editor::rem_offset_label(config, px))
        .unwrap_or_else(|| format!("`{value}`"))
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

    let unknown: Vec<&str> = analysis
        .parsed
        .variants
        .iter()
        .filter(|variant| variant.kind.is_none())
        .map(|variant| variant.raw.as_str())
        .collect();
    if !unknown.is_empty() {
        return format!(
            "Unknown variant `{}`; this class never applies at runtime. ",
            unknown.join("`, `")
        );
    }

    let variant_label = analysis
        .parsed
        .variants
        .iter()
        .map(|variant| variant.raw.as_str())
        .collect::<Vec<_>>()
        .join(":");
    let conditions = analysis
        .parsed
        .variants
        .iter()
        .filter_map(|variant| crate::semantic::variant::variant_condition(&variant.raw))
        .collect::<Vec<_>>()
        .join(" and ");
    format!("Runtime variant `{variant_label}`; applies when {conditions}. ")
}
