use crate::api::Diagnostic;

pub(crate) fn unsupported_utility_family_diagnostic(token: &str) -> Diagnostic {
    let family = token
        .split_once('-')
        .map(|(family, _)| family)
        .unwrap_or(token);

    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-utility-family".to_owned(),
        message: format!("Unsupported utility family \"{family}\" in className literal."),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn no_roblox_equivalent_diagnostic(family: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "no-roblox-equivalent".to_owned(),
        message: format!(
            "Tailwind \"{family}\" utilities have no Roblox equivalent, so \"{token}\" is ignored."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unknown_variant_diagnostic(
    variant: &str,
    token: &str,
    variants: &crate::semantic::variant::VariantRegistry<'_>,
) -> Diagnostic {
    let supported = variants.supported_variant_list();

    Diagnostic {
        level: "warning".to_owned(),
        code: "unknown-variant".to_owned(),
        message: format!(
            "Unknown variant \"{variant}\" in \"{token}\"; supported variants are {supported}."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

/// `max-foo:` where `foo` is not a breakpoint. Reported apart from an unknown
/// variant so the message can point at `theme.screens` instead of listing every
/// prefix vela knows.
pub(crate) fn unknown_breakpoint_diagnostic(
    name: &str,
    token: &str,
    variants: &crate::semantic::variant::VariantRegistry<'_>,
) -> Diagnostic {
    let screens = variants.screen_names().join(", ");

    Diagnostic {
        level: "warning".to_owned(),
        code: "unknown-breakpoint".to_owned(),
        message: format!(
            "Unknown breakpoint \"{name}\" in \"{token}\"; configured breakpoints are {screens}. Add one under `theme.screens` in `vela.config.ts`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn malformed_attribute_variant_diagnostic(
    variant: &str,
    detail: &crate::semantic::variant::AttributeVariantError,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "malformed-attribute-variant".to_owned(),
        message: format!(
            "Attribute variant \"{variant}\" in \"{token}\" is malformed; {}.",
            detail.message()
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

/// Width bounds that leave no viewport. The rule would be emitted and never
/// match, which reads as a utility that silently does nothing.
pub(crate) fn invalid_breakpoint_range_diagnostic(
    min_width: u32,
    max_width: u32,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "invalid-breakpoint-range".to_owned(),
        message: format!(
            "\"{token}\" needs a viewport at least {min_width}px wide and narrower than {max_width}px, which no viewport is; the utility never applies."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

/// A variant a config registered that vela reads as something else. Only a
/// hand-written JSON config reaches this: `addVariant` rejects the same names.
pub(crate) fn invalid_custom_variant_diagnostic(name: &str, reason: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "invalid-custom-variant".to_owned(),
        message: format!(
            "`plugins.variants` registered \"{name}\", which {reason}. The registration is ignored."
        ),
        token: None,
        range: None,
    }
}

pub(crate) fn unsupported_arbitrary_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-arbitrary-value".to_owned(),
        message: format!(
            "Arbitrary value \"{value}\" is not supported yet; use a theme key from `vela.config.ts` instead."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_opacity_modifier_diagnostic(modifier: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-opacity-modifier".to_owned(),
        message: format!(
            "Color opacity modifier \"/{modifier}\" is not supported; this family has no Roblox transparency channel, so use an `opacity-*` utility instead."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_object_fit_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-object-fit-value".to_owned(),
        message: format!(
            "Object fit \"{value}\" is not supported; use cover, contain, fill, or tile."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_pointer_events_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-pointer-events-value".to_owned(),
        message: format!("Pointer events value \"{value}\" is not supported; use none or auto."),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_whitespace_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-whitespace-value".to_owned(),
        message: format!("Whitespace value \"{value}\" is not supported; use normal or nowrap."),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_overscroll_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-overscroll-value".to_owned(),
        message: format!(
            "Overscroll value \"{value}\" is not supported; use auto, contain, or none."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_scroll_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-scroll-value".to_owned(),
        message: format!("Scroll value \"{value}\" is not supported; use x, y, xy, or none."),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_scrollbar_thickness_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-scrollbar-thickness".to_owned(),
        message: format!(
            "Scrollbar thickness \"{value}\" is not supported; use a spacing key from `vela.config.ts`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_canvas_size_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-canvas-size-value".to_owned(),
        message: format!(
            "Canvas size \"{value}\" is not supported; use auto, auto-x, auto-y, or none."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_space_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-space-value".to_owned(),
        message: format!(
            "Space value \"{value}\" is not supported; use a spacing key from `vela.config.ts`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_stroke_value_diagnostic(
    family: &str,
    value: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-stroke-value".to_owned(),
        message: format!(
            "The {family} value \"{value}\" is not supported; use a thickness (0, 1, 2, 4, 8) or a theme color."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_transition_value_diagnostic(
    family: &str,
    value: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-transition-value".to_owned(),
        message: format!("The {family} value \"{value}\" is not supported."),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_animation_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-animation-value".to_owned(),
        message: format!(
            "Animation \"{value}\" is not supported; use spin, pulse, bounce, or none."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_divide_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-divide-value".to_owned(),
        message: format!("Divide thickness \"{value}\" is not supported; use 0, 1, 2, 4, or 8."),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_negative_margin_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-negative-margin".to_owned(),
        message: format!(
            "Negative margins can only pull from the top or left edge in Roblox, so \"{token}\" is ignored; use -mt-* or -ml-*."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_margin_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-margin-value".to_owned(),
        message: format!(
            "Margin value \"{value}\" is not supported; use a spacing key, or mx-auto/my-auto for centering."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn decoration_on_richtext_diagnostic() -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "decoration-on-richtext".to_owned(),
        message: "This element already sets `RichText`, so underline/line-through would double-escape its markup; the decoration is ignored.".to_owned(),
        token: None,
        range: None,
    }
}

pub(crate) fn motion_on_component_diagnostic() -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "motion-on-component".to_owned(),
        message: "Transitions and preset animations need direct access to a Roblox instance, which a component element cannot provide; apply them to a host element (for example the `asChild` child) instead.".to_owned(),
        token: None,
        range: None,
    }
}

pub(crate) fn transition_without_runtime_diagnostic() -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "transition-without-runtime".to_owned(),
        message: "Transition utilities have no effect without runtime variants or a dynamic className, so they are ignored.".to_owned(),
        token: None,
        range: None,
    }
}

pub(crate) fn unsupported_grid_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-grid-value".to_owned(),
        message: format!(
            "Grid cell count \"{value}\" is not supported; use an integer between 1 and 12."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_layout_order_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-layout-order-value".to_owned(),
        message: format!(
            "LayoutOrder value \"{value}\" is not supported; use an integer, first, last, or none."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_line_height_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-line-height-value".to_owned(),
        message: format!(
            "Line height \"{value}\" is not supported; use none, tight, snug, normal, relaxed, or loose."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_z_index_auto_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-z-index-auto".to_owned(),
        message: "Roblox `ZIndex` does not support Tailwind `auto`.".to_owned(),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn negative_z_index_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-negative-z-index".to_owned(),
        message: "Negative z-index is not supported on Roblox `ZIndex`.".to_owned(),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_arbitrary_z_index_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-arbitrary-z-index".to_owned(),
        message: "Arbitrary z-index values are not supported yet on Roblox `ZIndex`.".to_owned(),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_z_index_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-z-index-value".to_owned(),
        message: format!(
            "Tailwind `z-{value}` is not supported yet; supported values are z-0, z-10, z-20, z-30, z-40, and z-50."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_rotation_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-rotation-value".to_owned(),
        message: format!(
            "Tailwind `rotate-{value}` is not supported yet; supported values are rotate-0, rotate-1, rotate-2, rotate-3, rotate-6, rotate-12, rotate-45, rotate-90, and rotate-180."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_scale_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-scale-value".to_owned(),
        message: format!(
            "Tailwind `scale-{value}` is not supported; Roblox `UIScale` is uniform, and supported values are `scale-0`, `scale-50`, `scale-75`, `scale-90`, `scale-95`, `scale-100`, `scale-105`, `scale-110`, `scale-125`, and `scale-150`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_opacity_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-opacity-value".to_owned(),
        message: format!(
            "Tailwind `opacity-{value}` is not supported; opacity must be an integer between 0 and 100."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_aspect_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-aspect-value".to_owned(),
        message: format!(
            "Tailwind `aspect-{value}` is not supported; supported values are `aspect-square`, `aspect-video`, and arbitrary ratios such as `aspect-[4/3]`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_flex_direction_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-flex-direction".to_owned(),
        message: format!(
            "Tailwind `flex-{value}` is not supported; supported values are `flex`, `flex-row`, and `flex-col`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_alignment_value_diagnostic(
    family: &str,
    value: &str,
    token: &str,
) -> Diagnostic {
    let supported = if family == "justify" {
        "`justify-start`, `justify-center`, `justify-end`, `justify-between`, `justify-around`, `justify-evenly`, and `justify-stretch`"
    } else {
        "`items-start`, `items-center`, `items-end`, and `items-stretch`"
    };

    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-alignment-value".to_owned(),
        message: format!(
            "Tailwind `{family}-{value}` is not supported; supported values are {supported}."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_text_size_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-text-size".to_owned(),
        message: format!(
            "Tailwind `text-{value}` is not a supported font size; supported values are `text-xs` through `text-9xl`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_font_weight_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-font-weight".to_owned(),
        message: format!(
            "Tailwind `font-{value}` is not supported; supported values are `font-thin`, `font-extralight`, `font-light`, `font-normal`, `font-medium`, `font-semibold`, `font-bold`, `font-extrabold`, and `font-black`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_text_alignment_diagnostic(
    family: &str,
    value: &str,
    token: &str,
) -> Diagnostic {
    let supported = if family == "align" {
        "`align-top`, `align-middle`, and `align-bottom`"
    } else {
        "`text-left`, `text-center`, and `text-right`"
    };

    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-text-alignment".to_owned(),
        message: format!(
            "Tailwind `{family}-{value}` is not supported; supported values are {supported}."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_gradient_direction_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-gradient-direction".to_owned(),
        message: format!(
            "Tailwind `bg-gradient-to-{value}` is not supported; supported directions are `t`, `tr`, `r`, `br`, `b`, `bl`, `l`, and `tl`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_shadow_inset_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-shadow-inset".to_owned(),
        message: "Tailwind `shadow-inner` is not supported; Roblox `UIShadow` cannot render inset shadows.".to_owned(),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_overflow_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-overflow-value".to_owned(),
        message: format!(
            "Tailwind `overflow-{value}` is not supported; supported values are `overflow-hidden`, `overflow-clip`, and `overflow-visible`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_anchor_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-anchor-value".to_owned(),
        message: format!(
            "`origin-{value}` is not supported; supported values are `origin-top-left`, `origin-top`, `origin-top-right`, `origin-left`, `origin-center`, `origin-right`, `origin-bottom-left`, `origin-bottom`, and `origin-bottom-right`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unknown_theme_key_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unknown-theme-key".to_owned(),
        message: format!(
            "Unknown theme key \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_size_spacing_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-size-spacing-value".to_owned(),
        message: format!(
            "Spacing value \"{value}\" for size utility must be an offset-only UDim expression."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_border_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-border-value".to_owned(),
        message: format!(
            "Tailwind `border-{value}` is not supported yet; supported border utilities are `border`, `border-0`, `border-1`, `border-2`, `border-4`, `border-transparent`, and `border-{{color}}`."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn unsupported_color_keyword_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-color-key".to_owned(),
        message: format!(
            "Unsupported color keyword \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn color_requires_shade_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-missing-shade".to_owned(),
        message: format!(
            "Color palette \"{key}\" for {theme_family} utility has no \"DEFAULT\" shade, so it requires an explicit shade such as \"{key}-500\" in className literal."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn color_does_not_accept_shade_diagnostic(
    theme_family: &str,
    key: &str,
    shade: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-invalid-shade".to_owned(),
        message: format!(
            "Color \"{key}\" for {theme_family} utility is a singleton semantic color and does not accept shade \"{shade}\" in className literal."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}

pub(crate) fn color_missing_shade_diagnostic(
    theme_family: &str,
    key: &str,
    shade: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-invalid-shade".to_owned(),
        message: format!(
            "Color palette \"{key}\" for {theme_family} utility does not define shade \"{shade}\" in className literal."
        ),
        token: Some(token.to_owned()),
        range: None,
    }
}
