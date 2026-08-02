use crate::api::Diagnostic;
use crate::config::model::TailwindConfig;
use crate::diagnostics::compiler::{
    negative_z_index_diagnostic, no_roblox_equivalent_diagnostic, unknown_theme_key_diagnostic,
    unknown_variant_diagnostic, unsupported_alignment_value_diagnostic,
    unsupported_anchor_value_diagnostic, unsupported_animation_value_diagnostic,
    unsupported_arbitrary_value_diagnostic, unsupported_arbitrary_z_index_diagnostic,
    unsupported_aspect_value_diagnostic, unsupported_border_value_diagnostic,
    unsupported_color_keyword_diagnostic, unsupported_divide_value_diagnostic,
    unsupported_flex_direction_diagnostic, unsupported_font_weight_diagnostic,
    unsupported_gradient_direction_diagnostic, unsupported_grid_value_diagnostic,
    unsupported_layout_order_value_diagnostic, unsupported_line_height_value_diagnostic,
    unsupported_margin_value_diagnostic, unsupported_negative_margin_diagnostic,
    unsupported_object_fit_value_diagnostic, unsupported_opacity_modifier_diagnostic,
    unsupported_opacity_value_diagnostic, unsupported_overflow_diagnostic,
    unsupported_overscroll_value_diagnostic, unsupported_pointer_events_value_diagnostic,
    unsupported_rotation_value_diagnostic, unsupported_scale_diagnostic,
    unsupported_shadow_inset_diagnostic, unsupported_space_value_diagnostic,
    unsupported_stroke_value_diagnostic, unsupported_text_alignment_diagnostic,
    unsupported_text_size_diagnostic, unsupported_transition_value_diagnostic,
    unsupported_utility_family_diagnostic, unsupported_whitespace_value_diagnostic,
    unsupported_z_index_auto_diagnostic, unsupported_z_index_value_diagnostic,
};
use crate::ir::model::{
    DivideSpec, MarginSpec, PropEntry, RuntimeRule, SizeAxisValue, StyleIr, TextSpec,
    TransitionSpec,
};
use crate::semantic::{
    analyze::analyze_class_token,
    result::{AnalyzedClassToken, SemanticIssue},
    utility::{
        BACKGROUND_COLOR_FAMILY, BORDER_COLOR_FAMILY, ColorFamilySpec, ColorResolution,
        DEFAULT_TRANSITION_TIME, DIVIDE_COLOR_FAMILY, GRADIENT_COLOR_FAMILY, IMAGE_COLOR_FAMILY,
        OUTLINE_COLOR_FAMILY, PLACEHOLDER_COLOR_FAMILY, PaddingKind, RING_COLOR_FAMILY,
        RING_THICKNESS_VALUES, SHADOW_COLOR_FAMILY, ShadowPreset, StrokePayload, TEXT_COLOR_FAMILY,
        UtilityKind, classify_stroke_payload, end_relative_position_axis, font_face_expression,
        is_automatic_size_key, is_known_unsupported_border_payload,
        resolve_align_content_flex_value, resolve_align_items_value, resolve_align_self_value,
        resolve_anchor_point_value, resolve_animation_value, resolve_aspect_ratio_value,
        resolve_border_thickness_value, resolve_color_value, resolve_duration_seconds,
        resolve_ease_value, resolve_flex_direction_value, resolve_flex_item_mode,
        resolve_flex_wrap_value, resolve_font_style_value, resolve_font_weight_enum,
        resolve_gradient_rotation, resolve_grid_cell_count, resolve_items_flex_value,
        resolve_justify_flex_value, resolve_justify_value, resolve_layout_order_value,
        resolve_line_height_value, resolve_line_join_value, resolve_object_fit_value,
        resolve_opacity_value, resolve_overflow_value, resolve_overscroll_value,
        resolve_pointer_events_value, resolve_position_axis_value, resolve_radius_value,
        resolve_rotation_value, resolve_scale_value, resolve_shadow_preset,
        resolve_size_axis_value, resolve_size_spacing_offset, resolve_spacing_value,
        resolve_text_decoration_value, resolve_text_size_value, resolve_text_transform_value,
        resolve_text_wrap_value, resolve_text_x_alignment_value, resolve_text_y_alignment_value,
        resolve_transition_toggle, resolve_visibility_value, resolve_whitespace_value,
        resolve_z_index_value, spacing_value_to_offset, split_color_opacity,
    },
};

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
    let mut pending = PendingAxes::default();

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

        apply_analyzed_token(&analysis, config, diagnostics, &mut style, &mut pending);
    }

    pending.flush(&mut style, SizeEmission::Combined);
    default_list_layout_sort_order(&mut style);
    reset_variant_color_opacity(&mut style);
    style
}

/// `UIListLayout.SortOrder` defaults to `Name`, which would sort children by
/// their instance name and silently ignore every `order-*`.
fn default_list_layout_sort_order(style: &mut StyleIr) {
    let Some(helper) = style
        .base
        .helpers
        .iter_mut()
        .find(|helper| helper.tag == "uilistlayout")
    else {
        return;
    };

    if helper.props.iter().any(|prop| prop.name == "SortOrder") {
        return;
    }

    helper.props.push(PropEntry {
        name: "SortOrder",
        value: "Enum.SortOrder.LayoutOrder".to_owned(),
    });
}

const COLOR_OPACITY_FAMILIES: [ColorFamilySpec; 3] = [
    BACKGROUND_COLOR_FAMILY,
    TEXT_COLOR_FAMILY,
    IMAGE_COLOR_FAMILY,
];

/// Roblox paints a `GuiObject` as an opaque gray box with a 1px border unless
/// something says otherwise, and a utility framework that only adds properties
/// can never take that back. Preflight neutralizes it on the elements vela
/// already owns, so only an explicit `bg-*` paints.
pub(crate) fn apply_preflight(style: &mut StyleIr, declared_props: &[String]) {
    let declared = |name: &str| declared_props.iter().any(|prop| prop == name);
    let styled =
        |style: &StyleIr, name: &str| style.base.props.iter().any(|prop| prop.name == name);

    if !styled(style, "BorderSizePixel") && !declared("BorderSizePixel") {
        style.set_prop("BorderSizePixel", "0".to_owned());
    }

    // A background the base already paints is opaque on purpose, and a variant
    // that paints over a neutralized base is carried by the opacity reset.
    if !styled(style, "BackgroundColor3")
        && !styled(style, "BackgroundTransparency")
        && !declared("BackgroundColor3")
        && !declared("BackgroundTransparency")
    {
        style.set_prop("BackgroundTransparency", "1".to_owned());
    }

    reset_variant_color_opacity(style);
}

/// A variant bundle overlays the base at runtime, so dropping the transparency
/// prop from the variant's own bundle — all a bare `hover:bg-blue-600` can do
/// while it is resolved in isolation — leaves the base `/50` standing. The
/// variant has to state the opaque value for the override to reach it.
fn reset_variant_color_opacity(style: &mut StyleIr) {
    for spec in COLOR_OPACITY_FAMILIES {
        let Some(transparency_prop) = spec.transparency_prop else {
            continue;
        };

        let sets_transparency =
            |props: &[PropEntry]| props.iter().any(|prop| prop.name == transparency_prop);
        let anything_sets_transparency = sets_transparency(&style.base.props)
            || style
                .runtime_rules
                .iter()
                .any(|rule| sets_transparency(&rule.effects.props));
        if !anything_sets_transparency {
            continue;
        }

        for rule in &mut style.runtime_rules {
            let sets_color = rule
                .effects
                .props
                .iter()
                .any(|prop| prop.name == spec.color_prop);
            if sets_color && !sets_transparency(&rule.effects.props) {
                rule.effects.props.push(PropEntry {
                    name: transparency_prop,
                    value: "0".to_owned(),
                });
            }
        }
    }
}

/// A variant bundle overlays a base it cannot see, so a whole `Size` would drop
/// the axis the variant never named; per-axis props let the runtime keep it.
#[derive(Clone, Copy)]
enum SizeEmission {
    Combined,
    PerAxis,
}

#[derive(Default)]
struct PendingAxes {
    size_width: Option<SizeAxisValue>,
    size_height: Option<SizeAxisValue>,
    position_x: Option<SizeAxisValue>,
    position_y: Option<SizeAxisValue>,
    auto_x: bool,
    auto_y: bool,
    min_width: Option<String>,
    min_height: Option<String>,
    max_width: Option<String>,
    max_height: Option<String>,
    gradient_rotation: Option<&'static str>,
    gradient_from: Option<String>,
    gradient_via: Option<String>,
    gradient_to: Option<String>,
    font_weight: Option<&'static str>,
    font_style: Option<&'static str>,
    translate_x: Option<SizeAxisValue>,
    translate_y: Option<SizeAxisValue>,
    gap_offset: Option<String>,
    center_x: bool,
    center_y: bool,
    transition_enabled: Option<bool>,
    transition_time: Option<f64>,
    transition_ease: Option<(&'static str, &'static str)>,
    transition_delay: Option<f64>,
    animation: Option<&'static str>,
    text_transform: Option<&'static str>,
    text_decoration: Option<&'static str>,
    margin_top: Option<f64>,
    margin_right: Option<f64>,
    margin_bottom: Option<f64>,
    margin_left: Option<f64>,
    margin_shift_x: f64,
    margin_shift_y: f64,
    divide_axis: Option<&'static str>,
    divide_thickness: Option<f64>,
    divide_color: Option<String>,
}

impl PendingAxes {
    fn flush(self, style: &mut StyleIr, size_emission: SizeEmission) {
        match size_emission {
            SizeEmission::Combined => {
                if self.size_width.is_some() || self.size_height.is_some() {
                    style.set_prop("Size", format_udim2_prop(self.size_width, self.size_height));
                }
            }
            SizeEmission::PerAxis => {
                if let Some(width) = self.size_width {
                    style.set_prop("SizeX", format_udim_axis(width));
                }
                if let Some(height) = self.size_height {
                    style.set_prop("SizeY", format_udim_axis(height));
                }
            }
        }

        // A fractional translate is a shift by the element's own size, which is
        // exactly what AnchorPoint expresses; pixel translates shift Position.
        let (anchor_x, shift_x) = split_translate_axis(self.translate_x);
        let (anchor_y, shift_y) = split_translate_axis(self.translate_y);
        let anchor_x = anchor_x.or_else(|| self.center_x.then(|| "0.5".to_owned()));
        let anchor_y = anchor_y.or_else(|| self.center_y.then(|| "0.5".to_owned()));
        if anchor_x.is_some() || anchor_y.is_some() {
            style.set_prop(
                "AnchorPoint",
                format!(
                    "new Vector2({}, {})",
                    anchor_x.as_deref().unwrap_or("0"),
                    anchor_y.as_deref().unwrap_or("0")
                ),
            );
        }

        let position_x = shift_position_axis(self.position_x, shift_x + self.margin_shift_x);
        let position_y = shift_position_axis(self.position_y, shift_y + self.margin_shift_y);
        if position_x.is_some() || position_y.is_some() {
            style.set_prop("Position", format_udim2_prop(position_x, position_y));
        }

        if let Some(axis) = automatic_size_axis(self.auto_x, self.auto_y) {
            style.set_prop("AutomaticSize", format!("Enum.AutomaticSize.{axis}"));
        }

        if self.min_width.is_some() || self.min_height.is_some() {
            let x = self.min_width.unwrap_or_else(|| "0".to_owned());
            let y = self.min_height.unwrap_or_else(|| "0".to_owned());
            style.set_helper_prop(
                "uisizeconstraint",
                "MinSize",
                format!("new Vector2({x}, {y})"),
            );
        }

        if self.max_width.is_some() || self.max_height.is_some() {
            let x = self.max_width.unwrap_or_else(|| "math.huge".to_owned());
            let y = self.max_height.unwrap_or_else(|| "math.huge".to_owned());
            style.set_helper_prop(
                "uisizeconstraint",
                "MaxSize",
                format!("new Vector2({x}, {y})"),
            );
        }

        if self.font_weight.is_some() || self.font_style.is_some() {
            style.set_prop(
                "FontFace",
                font_face_expression(self.font_weight, self.font_style),
            );
        }

        if let Some(gap) = self.gap_offset
            && style
                .base
                .helpers
                .iter()
                .any(|helper| helper.tag == "uigridlayout")
        {
            style.set_helper_prop(
                "uigridlayout",
                "CellPadding",
                format!("UDim2.fromOffset({gap}, {gap})"),
            );
        }

        // `duration`/`ease`/`delay` enable the transition on their own so a
        // missing bare `transition` is not a silent trap; `transition-none`
        // always wins.
        let transition_enabled = self.transition_enabled.unwrap_or(
            self.transition_time.is_some()
                || self.transition_ease.is_some()
                || self.transition_delay.is_some(),
        );
        if transition_enabled {
            let (easing_style, easing_direction) = self.transition_ease.unwrap_or(("Quad", "Out"));
            style.transition = Some(TransitionSpec {
                time: self.transition_time.unwrap_or(DEFAULT_TRANSITION_TIME),
                style: easing_style.to_owned(),
                direction: easing_direction.to_owned(),
                delay: self.transition_delay.unwrap_or(0.0),
            });
        }

        if let Some(animation) = self.animation.filter(|animation| *animation != "none") {
            style.animation = Some(animation.to_owned());
        }

        if self.margin_top.is_some()
            || self.margin_right.is_some()
            || self.margin_bottom.is_some()
            || self.margin_left.is_some()
        {
            style.margin = Some(MarginSpec {
                top: self.margin_top.unwrap_or(0.0),
                right: self.margin_right.unwrap_or(0.0),
                bottom: self.margin_bottom.unwrap_or(0.0),
                left: self.margin_left.unwrap_or(0.0),
            });
        }

        // A divide color without an axis has no separators to paint.
        if let Some(axis) = self.divide_axis {
            style.divide = Some(DivideSpec {
                axis: axis.to_owned(),
                thickness: self.divide_thickness.unwrap_or(1.0),
                color: self.divide_color,
            });
        }

        let text_transform = self.text_transform.filter(|value| *value != "none");
        let text_decoration = self.text_decoration.filter(|value| *value != "none");
        if text_transform.is_some() || text_decoration.is_some() {
            style.text = Some(TextSpec {
                transform: text_transform.map(str::to_owned),
                decoration: text_decoration.map(str::to_owned),
            });
        }

        let stops: Vec<String> = [self.gradient_from, self.gradient_via, self.gradient_to]
            .into_iter()
            .flatten()
            .collect();
        if !stops.is_empty() {
            style.set_helper_prop("uigradient", "Color", color_sequence_expr(&stops));
            if let Some(rotation) = self.gradient_rotation.filter(|rotation| *rotation != "0") {
                style.set_helper_prop("uigradient", "Rotation", rotation.to_owned());
            }
            // UIGradient modulates BackgroundColor3, so force a white base for true stop colors.
            style.set_prop(
                "BackgroundColor3",
                "Color3.fromRGB(255, 255, 255)".to_owned(),
            );
        }
    }
}

fn color_sequence_expr(stops: &[String]) -> String {
    match stops {
        [single] => format!("new ColorSequence({single})"),
        [start, end] => format!("new ColorSequence({start}, {end})"),
        _ => {
            let last = stops.len() - 1;
            let keypoints = stops
                .iter()
                .enumerate()
                .map(|(index, color)| {
                    let position = format_stop_position(index as f64 / last as f64);
                    format!("new ColorSequenceKeypoint({position}, {color})")
                })
                .collect::<Vec<_>>()
                .join(", ");
            format!("new ColorSequence([{keypoints}])")
        }
    }
}

fn format_stop_position(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    format!("{value:.4}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

fn automatic_size_axis(x: bool, y: bool) -> Option<&'static str> {
    match (x, y) {
        (true, true) => Some("XY"),
        (true, false) => Some("X"),
        (false, true) => Some("Y"),
        (false, false) => None,
    }
}

fn resolve_single_analyzed_token(
    analysis: &AnalyzedClassToken,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr {
    let mut style = StyleIr::default();
    let mut pending = PendingAxes::default();
    apply_analyzed_token(analysis, config, diagnostics, &mut style, &mut pending);
    pending.flush(&mut style, SizeEmission::PerAxis);
    style
}

fn apply_analyzed_token(
    analysis: &AnalyzedClassToken,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    style: &mut StyleIr,
    pending: &mut PendingAxes,
) {
    let _needs_config_lookup = analysis.needs_config_lookup;

    if !analysis.supported
        && let Some(issue) = analysis.issues.first()
    {
        diagnostics.push(match issue {
            SemanticIssue::UnsupportedUtilityFamily { .. } => {
                unsupported_utility_family_diagnostic(&analysis.parsed.raw)
            }
            SemanticIssue::UnsupportedZIndexValue { value } => {
                unsupported_z_index_value_diagnostic(value, &analysis.parsed.raw)
            }
            SemanticIssue::UnsupportedZIndexAuto => {
                unsupported_z_index_auto_diagnostic(&analysis.parsed.raw)
            }
            SemanticIssue::UnsupportedArbitraryZIndex => {
                unsupported_arbitrary_z_index_diagnostic(&analysis.parsed.raw)
            }
            SemanticIssue::NegativeZIndex => negative_z_index_diagnostic(&analysis.parsed.raw),
            SemanticIssue::UnsupportedBorderValue { value } => {
                unsupported_border_value_diagnostic(value, &analysis.parsed.raw)
            }
            SemanticIssue::NoRobloxEquivalent { family } => {
                no_roblox_equivalent_diagnostic(family, &analysis.parsed.raw)
            }
            SemanticIssue::UnknownVariant { variant } => {
                unknown_variant_diagnostic(variant, &analysis.parsed.raw)
            }
            SemanticIssue::UnsupportedArbitraryValue { value } => {
                unsupported_arbitrary_value_diagnostic(value, &analysis.parsed.raw)
            }
            SemanticIssue::UnsupportedOpacityModifier { modifier } => {
                unsupported_opacity_modifier_diagnostic(modifier, &analysis.parsed.raw)
            }
        });
        return;
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
        UtilityKind::Border => {
            if let Some(border_key) = analysis.payload() {
                apply_border_utility(style, config, diagnostics, border_key, &analysis.parsed.raw);
            } else if let Some(value) = resolve_border_thickness_value(None) {
                style.set_helper_prop("uistroke", "Thickness", value.to_owned());
            }
        }
        UtilityKind::Radius => {
            if let Some(radius_key) = analysis.payload() {
                if let Some(value) = resolve_radius_value(config, radius_key) {
                    style.set_helper_prop("uicorner", "CornerRadius", value);
                } else {
                    diagnostics.push(unknown_theme_key_diagnostic(
                        "radius",
                        radius_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::ZIndex => {
            if let Some(z_key) = analysis.payload()
                && let Some(value) = resolve_z_index_value(z_key, &analysis.parsed.raw, diagnostics)
            {
                style.set_prop("ZIndex", value);
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
                    axis,
                );
            }
        }
        UtilityKind::Gap => {
            if let Some(spacing_key) = analysis.payload() {
                apply_gap_utility(
                    style,
                    config,
                    diagnostics,
                    spacing_key,
                    &analysis.parsed.raw,
                );
                pending.gap_offset = resolve_spacing_value(config, spacing_key)
                    .as_deref()
                    .and_then(spacing_value_to_offset);
            }
        }
        UtilityKind::Width => {
            if let Some(size_key) = analysis.payload() {
                if is_automatic_size_key(size_key) {
                    pending.auto_x = true;
                } else {
                    pending.size_width = resolve_size_axis_value(
                        config,
                        diagnostics,
                        size_key,
                        &analysis.parsed.raw,
                    );
                }
            }
        }
        UtilityKind::Height => {
            if let Some(size_key) = analysis.payload() {
                if is_automatic_size_key(size_key) {
                    pending.auto_y = true;
                } else {
                    pending.size_height = resolve_size_axis_value(
                        config,
                        diagnostics,
                        size_key,
                        &analysis.parsed.raw,
                    );
                }
            }
        }
        UtilityKind::Size => {
            if let Some(size_key) = analysis.payload() {
                if is_automatic_size_key(size_key) {
                    pending.auto_x = true;
                    pending.auto_y = true;
                } else {
                    let value = resolve_size_axis_value(
                        config,
                        diagnostics,
                        size_key,
                        &analysis.parsed.raw,
                    );
                    pending.size_width = value.clone();
                    pending.size_height = value;
                }
            }
        }
        UtilityKind::PositionX => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.raw.starts_with("-left-");
                pending.position_x = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                );
            }
        }
        UtilityKind::PositionY => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.raw.starts_with("-top-");
                pending.position_y = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                );
            }
        }
        UtilityKind::PositionRight => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-right-");
                pending.position_x = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                )
                .map(end_relative_position_axis);
            }
        }
        UtilityKind::PositionBottom => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-bottom-");
                pending.position_y = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                )
                .map(end_relative_position_axis);
            }
        }
        UtilityKind::Inset => {
            if let Some(position_key) = analysis.payload() {
                let negative = analysis.parsed.raw.starts_with("-inset-");
                let value = resolve_position_axis_value(
                    config,
                    diagnostics,
                    position_key,
                    &analysis.parsed.raw,
                    negative,
                );
                pending.position_x = value.clone();
                pending.position_y = value;
            }
        }
        UtilityKind::AnchorPoint => {
            if let Some(origin_key) = analysis.payload() {
                if let Some(value) = resolve_anchor_point_value(origin_key) {
                    style.set_prop("AnchorPoint", value);
                } else {
                    diagnostics.push(unsupported_anchor_value_diagnostic(
                        origin_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Rotation => {
            if let Some(degrees) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-rotate-");
                if let Some(value) = resolve_rotation_value(degrees, negative) {
                    style.set_prop("Rotation", value);
                } else {
                    diagnostics.push(unsupported_rotation_value_diagnostic(
                        degrees,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Scale => {
            if let Some(scale_key) = analysis.payload() {
                if let Some(value) = resolve_scale_value(scale_key) {
                    style.set_helper_prop("uiscale", "Scale", value.to_owned());
                } else {
                    diagnostics.push(unsupported_scale_diagnostic(
                        scale_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Opacity => {
            if let Some(percent) = analysis.payload() {
                if let Some(value) = resolve_opacity_value(percent) {
                    style.set_prop("BackgroundTransparency", value);
                } else {
                    diagnostics.push(unsupported_opacity_value_diagnostic(
                        percent,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::AspectRatio => {
            if let Some(ratio_key) = analysis.payload() {
                if let Some(value) = resolve_aspect_ratio_value(ratio_key) {
                    style.set_helper_prop("uiaspectratioconstraint", "AspectRatio", value);
                } else {
                    diagnostics.push(unsupported_aspect_value_diagnostic(
                        ratio_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::FlexDirection => {
            if let Some(value) = resolve_flex_direction_value(analysis.payload()) {
                style.set_helper_prop("uilistlayout", "FillDirection", value);
            } else {
                diagnostics.push(unsupported_flex_direction_diagnostic(
                    analysis.payload().unwrap_or_default(),
                    &analysis.parsed.raw,
                ));
            }
        }
        UtilityKind::JustifyContent => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(flex) = resolve_justify_flex_value(alignment_key) {
                    style.set_helper_prop(
                        "uilistlayout",
                        "HorizontalFlex",
                        format!("Enum.UIFlexAlignment.{flex}"),
                    );
                } else if let Some(value) = resolve_justify_value(alignment_key) {
                    style.set_helper_prop("uilistlayout", "HorizontalAlignment", value);
                } else {
                    diagnostics.push(unsupported_alignment_value_diagnostic(
                        "justify",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::AlignItems => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(flex) = resolve_items_flex_value(alignment_key) {
                    style.set_helper_prop(
                        "uilistlayout",
                        "VerticalFlex",
                        format!("Enum.UIFlexAlignment.{flex}"),
                    );
                } else if let Some(value) = resolve_align_items_value(alignment_key) {
                    style.set_helper_prop("uilistlayout", "VerticalAlignment", value);
                } else {
                    diagnostics.push(unsupported_alignment_value_diagnostic(
                        "items",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::FlexItem => {
            if let Some(mode) = analysis.payload().and_then(resolve_flex_item_mode) {
                style.set_helper_prop("uiflexitem", "FlexMode", format!("Enum.UIFlexMode.{mode}"));
            }
        }
        UtilityKind::AlignContent => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(flex) = resolve_align_content_flex_value(alignment_key) {
                    style.set_helper_prop(
                        "uilistlayout",
                        "VerticalFlex",
                        format!("Enum.UIFlexAlignment.{flex}"),
                    );
                } else if let Some(value) = resolve_align_items_value(alignment_key) {
                    style.set_helper_prop("uilistlayout", "VerticalAlignment", value);
                } else {
                    diagnostics.push(unsupported_alignment_value_diagnostic(
                        "content",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::AlignSelf => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(alignment) = resolve_align_self_value(alignment_key) {
                    style.set_helper_prop(
                        "uiflexitem",
                        "ItemLineAlignment",
                        format!("Enum.ItemLineAlignment.{alignment}"),
                    );
                } else {
                    diagnostics.push(unsupported_alignment_value_diagnostic(
                        "self",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::LayoutOrder => {
            if let Some(order_key) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-order-");
                if let Some(value) = resolve_layout_order_value(order_key, negative) {
                    style.set_prop("LayoutOrder", value);
                } else {
                    diagnostics.push(unsupported_layout_order_value_diagnostic(
                        order_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::LineHeight => {
            if let Some(leading_key) = analysis.payload() {
                if let Some(value) = resolve_line_height_value(leading_key) {
                    style.set_prop("LineHeight", value.to_owned());
                } else {
                    diagnostics.push(unsupported_line_height_value_diagnostic(
                        leading_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::FontStyle => {
            if let Some(style_key) = analysis.payload()
                && let Some(font_style) = resolve_font_style_value(style_key)
            {
                pending.font_style = Some(font_style);
            }
        }
        UtilityKind::Grid => {
            style.set_helper_prop(
                "uigridlayout",
                "SortOrder",
                "Enum.SortOrder.LayoutOrder".to_owned(),
            );
        }
        UtilityKind::GridColumns | UtilityKind::GridRows => {
            if let Some(count_key) = analysis.payload() {
                if let Some(count) = resolve_grid_cell_count(count_key) {
                    let direction = match &analysis.utility {
                        UtilityKind::GridColumns => "Horizontal",
                        _ => "Vertical",
                    };
                    style.set_helper_prop(
                        "uigridlayout",
                        "SortOrder",
                        "Enum.SortOrder.LayoutOrder".to_owned(),
                    );
                    style.set_helper_prop(
                        "uigridlayout",
                        "FillDirection",
                        format!("Enum.FillDirection.{direction}"),
                    );
                    style.set_helper_prop("uigridlayout", "FillDirectionMaxCells", count);
                } else {
                    diagnostics.push(unsupported_grid_value_diagnostic(
                        count_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Basis => {
            // Main-axis size; the flex default is a row, so basis maps to the
            // width axis exactly like `w-*`.
            if let Some(size_key) = analysis.payload() {
                if is_automatic_size_key(size_key) {
                    pending.auto_x = true;
                } else {
                    pending.size_width = resolve_size_axis_value(
                        config,
                        diagnostics,
                        size_key,
                        &analysis.parsed.raw,
                    );
                }
            }
        }
        UtilityKind::TranslateX => {
            if let Some(translate_key) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-translate-x-");
                pending.translate_x = resolve_position_axis_value(
                    config,
                    diagnostics,
                    translate_key,
                    &analysis.parsed.raw,
                    negative,
                );
            }
        }
        UtilityKind::TranslateY => {
            if let Some(translate_key) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-translate-y-");
                pending.translate_y = resolve_position_axis_value(
                    config,
                    diagnostics,
                    translate_key,
                    &analysis.parsed.raw,
                    negative,
                );
            }
        }
        UtilityKind::ObjectFit => {
            if let Some(fit_key) = analysis.payload() {
                if let Some(scale_type) = resolve_object_fit_value(fit_key) {
                    style.set_prop("ScaleType", format!("Enum.ScaleType.{scale_type}"));
                } else {
                    diagnostics.push(unsupported_object_fit_value_diagnostic(
                        fit_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::PointerEvents => {
            if let Some(events_key) = analysis.payload() {
                if let Some(value) = resolve_pointer_events_value(events_key) {
                    style.set_prop("Interactable", value.to_owned());
                } else {
                    diagnostics.push(unsupported_pointer_events_value_diagnostic(
                        events_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::SpaceX | UtilityKind::SpaceY => {
            if let Some(spacing_key) = analysis.payload() {
                if let Some(value) = resolve_spacing_value(config, spacing_key) {
                    let direction = match &analysis.utility {
                        UtilityKind::SpaceX => "Horizontal",
                        _ => "Vertical",
                    };
                    style.set_helper_prop("uilistlayout", "Padding", value);
                    style.set_helper_prop(
                        "uilistlayout",
                        "FillDirection",
                        format!("Enum.FillDirection.{direction}"),
                    );
                } else {
                    diagnostics.push(unsupported_space_value_diagnostic(
                        spacing_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Whitespace => {
            if let Some(whitespace_key) = analysis.payload() {
                if let Some(value) = resolve_whitespace_value(whitespace_key) {
                    style.set_prop("TextWrapped", value.to_owned());
                } else {
                    diagnostics.push(unsupported_whitespace_value_diagnostic(
                        whitespace_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Overscroll => {
            if let Some(overscroll_key) = analysis.payload() {
                if let Some(behavior) = resolve_overscroll_value(overscroll_key) {
                    style.set_prop(
                        "ElasticBehavior",
                        format!("Enum.ElasticBehavior.{behavior}"),
                    );
                } else {
                    diagnostics.push(unsupported_overscroll_value_diagnostic(
                        overscroll_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::Ring | UtilityKind::Outline => {
            apply_stroke_utility(style, config, diagnostics, analysis);
        }
        UtilityKind::CenterX => {
            pending.center_x = true;
            pending.position_x = Some(SizeAxisValue::scale("0.5"));
        }
        UtilityKind::CenterY => {
            pending.center_y = true;
            pending.position_y = Some(SizeAxisValue::scale("0.5"));
        }
        UtilityKind::Transition => {
            if let Some(enabled) = resolve_transition_toggle(analysis.payload()) {
                pending.transition_enabled = Some(enabled);
            } else {
                diagnostics.push(unsupported_transition_value_diagnostic(
                    "transition",
                    analysis.payload().unwrap_or_default(),
                    &analysis.parsed.raw,
                ));
            }
        }
        UtilityKind::TransitionDuration => {
            if let Some(duration_key) = analysis.payload() {
                if let Some(time) = resolve_duration_seconds(duration_key) {
                    pending.transition_time = Some(time);
                } else {
                    diagnostics.push(unsupported_transition_value_diagnostic(
                        "duration",
                        duration_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TransitionEase => {
            if let Some(ease_key) = analysis.payload() {
                if let Some(ease) = resolve_ease_value(ease_key) {
                    pending.transition_ease = Some(ease);
                } else {
                    diagnostics.push(unsupported_transition_value_diagnostic(
                        "ease",
                        ease_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::DivideX | UtilityKind::DivideY => {
            let axis = match &analysis.utility {
                UtilityKind::DivideX => "x",
                _ => "y",
            };
            match analysis.payload() {
                None => {
                    pending.divide_axis = Some(axis);
                    pending.divide_thickness.get_or_insert(1.0);
                }
                Some(thickness_key) => {
                    if RING_THICKNESS_VALUES.contains(&thickness_key) {
                        pending.divide_axis = Some(axis);
                        pending.divide_thickness =
                            Some(thickness_key.parse::<f64>().unwrap_or(1.0));
                    } else {
                        diagnostics.push(unsupported_divide_value_diagnostic(
                            thickness_key,
                            &analysis.parsed.raw,
                        ));
                    }
                }
            }
        }
        UtilityKind::DivideColor => {
            if let Some(color_key) = analysis.payload()
                && let Some(resolution) = resolve_color_value(
                    config,
                    diagnostics,
                    DIVIDE_COLOR_FAMILY,
                    color_key,
                    &analysis.parsed.raw,
                )
            {
                match resolution {
                    ColorResolution::Expression(value) => {
                        pending.divide_color = Some(value);
                    }
                    ColorResolution::Transparent => {
                        diagnostics.push(unsupported_color_keyword_diagnostic(
                            DIVIDE_COLOR_FAMILY.theme_family,
                            color_key,
                            &analysis.parsed.raw,
                        ));
                    }
                }
            }
        }
        UtilityKind::Margin(axis) => {
            if let Some(spacing_key) = analysis.payload() {
                let negative = analysis.parsed.utility.raw.starts_with("-m");
                let offset = resolve_spacing_value(config, spacing_key)
                    .as_deref()
                    .and_then(spacing_value_to_offset)
                    .and_then(|value| value.parse::<f64>().ok());

                let Some(offset) = offset else {
                    diagnostics.push(unsupported_margin_value_diagnostic(
                        spacing_key,
                        &analysis.parsed.raw,
                    ));
                    return;
                };

                if negative {
                    // UIPadding cannot go negative, and a negative right/bottom
                    // margin would have to pull the *next* sibling closer.
                    match axis {
                        PaddingKind::Top => pending.margin_shift_y -= offset,
                        PaddingKind::Left => pending.margin_shift_x -= offset,
                        _ => diagnostics
                            .push(unsupported_negative_margin_diagnostic(&analysis.parsed.raw)),
                    }
                    return;
                }

                match axis {
                    PaddingKind::All => {
                        pending.margin_top = Some(offset);
                        pending.margin_right = Some(offset);
                        pending.margin_bottom = Some(offset);
                        pending.margin_left = Some(offset);
                    }
                    PaddingKind::X => {
                        pending.margin_left = Some(offset);
                        pending.margin_right = Some(offset);
                    }
                    PaddingKind::Y => {
                        pending.margin_top = Some(offset);
                        pending.margin_bottom = Some(offset);
                    }
                    PaddingKind::Top => pending.margin_top = Some(offset),
                    PaddingKind::Right => pending.margin_right = Some(offset),
                    PaddingKind::Bottom => pending.margin_bottom = Some(offset),
                    PaddingKind::Left => pending.margin_left = Some(offset),
                }
            }
        }
        UtilityKind::TextTransform => {
            if let Some(transform) = analysis.payload().and_then(resolve_text_transform_value) {
                pending.text_transform = Some(transform);
            }
        }
        UtilityKind::TextDecoration => {
            if let Some(decoration) = analysis.payload().and_then(resolve_text_decoration_value) {
                pending.text_decoration = Some(decoration);
            }
        }
        UtilityKind::Animation => {
            if let Some(animation_key) = analysis.payload() {
                if let Some(animation) = resolve_animation_value(animation_key) {
                    pending.animation = Some(animation);
                } else {
                    diagnostics.push(unsupported_animation_value_diagnostic(
                        animation_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TransitionDelay => {
            if let Some(delay_key) = analysis.payload() {
                if let Some(delay) = resolve_duration_seconds(delay_key) {
                    pending.transition_delay = Some(delay);
                } else {
                    diagnostics.push(unsupported_transition_value_diagnostic(
                        "delay",
                        delay_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextSize => {
            if let Some(size_key) = analysis.payload() {
                if let Some(value) = resolve_text_size_value(size_key) {
                    style.set_prop("TextSize", value.to_owned());
                } else {
                    diagnostics.push(unsupported_text_size_diagnostic(
                        size_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::FontWeight => {
            if let Some(weight_key) = analysis.payload() {
                if let Some(weight) = resolve_font_weight_enum(weight_key) {
                    pending.font_weight = Some(weight);
                } else {
                    diagnostics.push(unsupported_font_weight_diagnostic(
                        weight_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextXAlignment => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(value) = resolve_text_x_alignment_value(alignment_key) {
                    style.set_prop("TextXAlignment", value);
                } else {
                    diagnostics.push(unsupported_text_alignment_diagnostic(
                        "text",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextYAlignment => {
            if let Some(alignment_key) = analysis.payload() {
                if let Some(value) = resolve_text_y_alignment_value(alignment_key) {
                    style.set_prop("TextYAlignment", value);
                } else {
                    diagnostics.push(unsupported_text_alignment_diagnostic(
                        "align",
                        alignment_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::TextWrap => {
            if let Some(value) = analysis.payload().and_then(resolve_text_wrap_value) {
                style.set_prop("TextWrapped", value.to_owned());
            }
        }
        UtilityKind::TextTruncate => {
            style.set_prop("TextTruncate", "Enum.TextTruncate.AtEnd".to_owned());
        }
        UtilityKind::Visibility => {
            if let Some(value) = analysis.payload().and_then(resolve_visibility_value) {
                style.set_prop("Visible", value.to_owned());
            }
        }
        UtilityKind::Overflow => {
            if let Some(overflow_key) = analysis.payload() {
                if let Some(value) = resolve_overflow_value(overflow_key) {
                    style.set_prop("ClipsDescendants", value.to_owned());
                } else {
                    diagnostics.push(unsupported_overflow_diagnostic(
                        overflow_key,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::FlexWrap => {
            if let Some(value) = analysis.payload().and_then(resolve_flex_wrap_value) {
                style.set_helper_prop("uilistlayout", "Wraps", value.to_owned());
            }
        }
        UtilityKind::MinWidth => {
            if let Some(size_key) = analysis.payload() {
                pending.min_width = resolve_size_spacing_offset(
                    config,
                    diagnostics,
                    size_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::MaxWidth => {
            if let Some(size_key) = analysis.payload() {
                pending.max_width = resolve_size_spacing_offset(
                    config,
                    diagnostics,
                    size_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::MinHeight => {
            if let Some(size_key) = analysis.payload() {
                pending.min_height = resolve_size_spacing_offset(
                    config,
                    diagnostics,
                    size_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::MaxHeight => {
            if let Some(size_key) = analysis.payload() {
                pending.max_height = resolve_size_spacing_offset(
                    config,
                    diagnostics,
                    size_key,
                    &analysis.parsed.raw,
                );
            }
        }
        UtilityKind::ShadowSize => match analysis.payload() {
            Some("none") => {
                style.set_helper_prop("uishadow", "Enabled", "false".to_owned());
            }
            Some("inner") => {
                diagnostics.push(unsupported_shadow_inset_diagnostic(&analysis.parsed.raw));
            }
            key => {
                if let Some(preset) = resolve_shadow_preset(key) {
                    apply_shadow_preset(style, &preset);
                }
            }
        },
        UtilityKind::ShadowColor => {
            if let Some(color_key) = analysis.payload() {
                apply_shadow_color(style, config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::GradientDirection => {
            if let Some(direction) = analysis.payload() {
                if let Some(rotation) = resolve_gradient_rotation(direction) {
                    pending.gradient_rotation = Some(rotation);
                } else {
                    diagnostics.push(unsupported_gradient_direction_diagnostic(
                        direction,
                        &analysis.parsed.raw,
                    ));
                }
            }
        }
        UtilityKind::GradientFrom => {
            if let Some(color_key) = analysis.payload() {
                pending.gradient_from =
                    resolve_gradient_stop(config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::GradientVia => {
            if let Some(color_key) = analysis.payload() {
                pending.gradient_via =
                    resolve_gradient_stop(config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::GradientTo => {
            if let Some(color_key) = analysis.payload() {
                pending.gradient_to =
                    resolve_gradient_stop(config, diagnostics, color_key, &analysis.parsed.raw);
            }
        }
        UtilityKind::Unknown => {
            diagnostics.push(unsupported_utility_family_diagnostic(&analysis.parsed.raw));
        }
    }
}

fn apply_color_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spec: ColorFamilySpec,
    color_key: &str,
    token: &str,
) {
    let (color_key, opacity) = split_color_opacity(color_key);
    let Some(resolution) = resolve_color_value(config, diagnostics, spec, color_key, token) else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(transparency_prop);
                if let Some(percent) = opacity {
                    style.set_prop(transparency_prop, opacity_to_transparency(percent));
                }
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

fn apply_border_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    border_key: &str,
    token: &str,
) {
    if let Some(thickness) = resolve_border_thickness_value(Some(border_key)) {
        style.set_helper_prop("uistroke", "Thickness", thickness.to_owned());
        return;
    }

    if border_key == "transparent" {
        style.set_helper_prop("uistroke", "Transparency", "1".to_owned());
        return;
    }

    if let Some(line_join) = resolve_line_join_value(border_key) {
        style.set_helper_prop(
            "uistroke",
            "LineJoinMode",
            format!("Enum.LineJoinMode.{line_join}"),
        );
        return;
    }

    if is_known_unsupported_border_payload(border_key) {
        diagnostics.push(unsupported_border_value_diagnostic(border_key, token));
        return;
    }

    let Some(resolution) =
        resolve_color_value(config, diagnostics, BORDER_COLOR_FAMILY, border_key, token)
    else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            style.set_helper_prop("uistroke", "Color", value);
            style.set_helper_prop("uistroke", "Transparency", "0".to_owned());
        }
        ColorResolution::Transparent => {
            style.set_helper_prop("uistroke", "Transparency", "1".to_owned());
        }
    }
}

/// `/N` opacity → the matching Roblox transparency (1 - N/100).
fn opacity_to_transparency(percent: u32) -> String {
    resolve_opacity_value(&percent.to_string()).unwrap_or_else(|| "0".to_owned())
}

fn apply_stroke_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    analysis: &AnalyzedClassToken,
) {
    let (family, default_thickness, color_family) = match &analysis.utility {
        UtilityKind::Ring => ("ring", "3", RING_COLOR_FAMILY),
        _ => ("outline", "2", OUTLINE_COLOR_FAMILY),
    };

    let Some(payload) = analysis.payload() else {
        style.set_helper_prop("uistroke", "Thickness", default_thickness.to_owned());
        style.set_helper_prop(
            "uistroke",
            "ApplyStrokeMode",
            "Enum.ApplyStrokeMode.Border".to_owned(),
        );
        return;
    };

    match classify_stroke_payload(&analysis.utility, payload) {
        StrokePayload::Thickness(thickness) => {
            style.set_helper_prop("uistroke", "Thickness", thickness.to_owned());
            style.set_helper_prop(
                "uistroke",
                "ApplyStrokeMode",
                "Enum.ApplyStrokeMode.Border".to_owned(),
            );
        }
        StrokePayload::Unsupported => {
            diagnostics.push(unsupported_stroke_value_diagnostic(
                family,
                payload,
                &analysis.parsed.raw,
            ));
        }
        StrokePayload::Color => {
            let (payload, opacity) = split_color_opacity(payload);
            let Some(resolution) = resolve_color_value(
                config,
                diagnostics,
                color_family,
                payload,
                &analysis.parsed.raw,
            ) else {
                return;
            };

            match resolution {
                ColorResolution::Expression(value) => {
                    style.set_helper_prop("uistroke", "Color", value);
                    style.set_helper_prop(
                        "uistroke",
                        "Transparency",
                        opacity.map_or_else(|| "0".to_owned(), opacity_to_transparency),
                    );
                }
                ColorResolution::Transparent => {
                    style.set_helper_prop("uistroke", "Transparency", "1".to_owned());
                }
            }
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

    diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
}

fn resolve_gradient_stop(
    style_config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    color_key: &str,
    token: &str,
) -> Option<String> {
    match resolve_color_value(
        style_config,
        diagnostics,
        GRADIENT_COLOR_FAMILY,
        color_key,
        token,
    )? {
        ColorResolution::Expression(value) => Some(value),
        ColorResolution::Transparent => None,
    }
}

fn apply_shadow_color(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    color_key: &str,
    token: &str,
) {
    let (color_key, opacity) = split_color_opacity(color_key);
    let Some(resolution) =
        resolve_color_value(config, diagnostics, SHADOW_COLOR_FAMILY, color_key, token)
    else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            style.set_helper_prop("uishadow", "Color", value);
            if let Some(percent) = opacity {
                style.set_helper_prop("uishadow", "Transparency", opacity_to_transparency(percent));
            }
        }
        ColorResolution::Transparent => {
            style.set_helper_prop("uishadow", "Transparency", "1".to_owned());
        }
    }
}

fn apply_shadow_preset(style: &mut StyleIr, preset: &ShadowPreset) {
    style.set_helper_prop(
        "uishadow",
        "BlurRadius",
        format!("new UDim(0, {})", preset.blur),
    );
    style.set_helper_prop(
        "uishadow",
        "Offset",
        format!("UDim2.fromOffset(0, {})", preset.offset_y),
    );
    if preset.spread != 0 {
        style.set_helper_prop(
            "uishadow",
            "Spread",
            format!("UDim2.fromOffset({}, {})", preset.spread, preset.spread),
        );
    }
    style.set_helper_prop("uishadow", "Transparency", preset.transparency.to_owned());
}

fn apply_gap_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
) {
    if let Some(value) = resolve_spacing_value(config, spacing_key) {
        style.set_helper_prop("uilistlayout", "Padding", value);
        return;
    }

    diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
}

/// Splits a resolved translate distance into its AnchorPoint component (the
/// scale, negated because AnchorPoint moves opposite the shift) and its
/// Position offset shift in pixels.
fn split_translate_axis(value: Option<SizeAxisValue>) -> (Option<String>, f64) {
    let Some(value) = value else {
        return (None, 0.0);
    };

    let scale = value.scale.parse::<f64>().unwrap_or(0.0);
    let anchor = (scale.abs() >= 1e-9).then(|| format_translate_number(-scale));
    let shift = value.offset.parse::<f64>().unwrap_or(0.0);
    (anchor, shift)
}

fn shift_position_axis(axis: Option<SizeAxisValue>, shift: f64) -> Option<SizeAxisValue> {
    if shift.abs() < 1e-9 {
        return axis;
    }

    let base = axis.unwrap_or_else(SizeAxisValue::zero);
    let offset = base.offset.parse::<f64>().unwrap_or(0.0) + shift;
    Some(SizeAxisValue {
        scale: base.scale,
        offset: format_translate_number(offset),
    })
}

fn format_translate_number(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    format!("{value:.10}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

fn format_udim_axis(axis: SizeAxisValue) -> String {
    format!("new UDim({}, {})", axis.scale, axis.offset)
}

fn format_udim2_prop(width: Option<SizeAxisValue>, height: Option<SizeAxisValue>) -> String {
    let width = width.unwrap_or_else(SizeAxisValue::zero);
    let height = height.unwrap_or_else(SizeAxisValue::zero);

    if width.scale == "0" && height.scale == "0" {
        return format!("UDim2.fromOffset({}, {})", width.offset, height.offset);
    }

    if width.offset == "0" && height.offset == "0" {
        return format!("UDim2.fromScale({}, {})", width.scale, height.scale);
    }

    format!(
        "new UDim2({}, {}, {}, {})",
        width.scale, width.offset, height.scale, height.offset
    )
}
