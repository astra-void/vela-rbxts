use crate::api::{CompletionItem, CompletionRequest, CompletionResponse, EditorRange};
use crate::config::model::{PluginUtility, TailwindConfig};
use crate::editor::colors::parse_color3_from_rgb;
use crate::editor::{
    ClassToken, class_name_context_at_position, token_at_position, tokenize_class_name_with_ranges,
    utf16_len,
};
use crate::semantic::{
    utility::{
        ALIGN_CONTENT_VALUES, ALIGN_SELF_VALUES, ALIGNMENT_VALUES, ANCHOR_ORIGIN_VALUES,
        ANIMATION_VALUES, ASPECT_RATIO_VALUES, BACKGROUND_COLOR_FAMILY, BORDER_LINE_JOIN_VALUES,
        BORDER_THICKNESS_VALUES, CANVAS_SIZE_VALUES, ColorResolution, DURATION_PRESET_VALUES,
        EASE_VALUES, FLEX_DIRECTION_VALUES, FLEX_ITEM_VALUES, FONT_STYLE_VALUES,
        FONT_WEIGHT_VALUES, GRADIENT_DIRECTION_VALUES, GRID_CELL_COUNT_MAX, JUSTIFY_FLEX_VALUES,
        LAYOUT_ORDER_KEYWORDS, LINE_HEIGHT_VALUES, OBJECT_FIT_VALUES, OPACITY_VALUES,
        OVERSCROLL_VALUES, PALETTE_DEFAULT_KEY, POINTER_EVENTS_VALUES, PaddingKind, RADIUS_KINDS,
        RING_THICKNESS_VALUES, ROTATION_VALUES, SCALE_VALUES, SCROLL_DIRECTION_VALUES,
        SHADOW_SIZE_VALUES, TEXT_SIZE_VALUES, TEXT_WRAP_VALUES, TEXT_X_ALIGN_VALUES,
        TEXT_Y_ALIGN_VALUES, UtilityKind, WHITESPACE_VALUES, Z_INDEX_VALUES, color_completion_keys,
        font_family_completion_keys, is_utility_allowed_on_host, position_completion_keys,
        radius_completion_keys, resolve_color_value, size_completion_keys, spacing_completion_keys,
    },
    variant::{RUNTIME_VARIANTS, split_variant_prefixes},
};

struct CompletionSpec {
    item: CompletionItem,
    utility_kind: UtilityKind,
}

impl CompletionSpec {
    /// A candidate inserts what it is labelled, and the ranking fields are
    /// filled in later against what the user typed, so a family only ever says
    /// its label, its group and what it does.
    fn new(
        label: impl Into<String>,
        category: &str,
        documentation: String,
        utility_kind: UtilityKind,
    ) -> Self {
        let label = label.into();

        Self {
            item: CompletionItem {
                insert_text: label.clone(),
                label,
                kind: "utility".to_owned(),
                category: category.to_owned(),
                documentation,
                replacement: None,
                color: None,
                sort_text: None,
            },
            utility_kind,
        }
    }

    fn with_swatch(mut self, color: Option<String>) -> Self {
        self.item.color = color;
        self
    }
}

pub(crate) fn get_completions_impl(request: CompletionRequest) -> CompletionResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let Some(context) = class_name_context_at_position(&request.source, request.position) else {
        return CompletionResponse {
            is_in_class_name_context: false,
            items: Vec::new(),
        };
    };

    let tokens = tokenize_class_name_with_ranges(&context.value, context.value_range.start);
    let target = completion_target(&tokens, request.position);

    let items = completion_candidates(
        &config,
        context.element_tag.as_deref(),
        &target.variants,
        &target.prefix,
    )
    .into_iter()
    .filter(|item| !target.variants_only || item.label.ends_with(':'))
    .map(|mut item| {
        item.replacement = Some(target.replacement.clone());
        item
    })
    .collect();

    CompletionResponse {
        is_in_class_name_context: true,
        items,
    }
}

struct CompletionTarget {
    replacement: EditorRange,
    variants: String,
    prefix: String,
    /// A cursor inside the variant chain completes that segment alone: a utility
    /// inserted there would be glued to the rest of the token.
    variants_only: bool,
}

/// Decides what an accepted item replaces. The variants already typed stay put
/// and only the utility after the last `:` is completed, which keeps labels
/// short and the list free of a variant cross-product. Editing a variant in the
/// middle of a token is the mirror image: the segment under the cursor is the
/// only part that may be rewritten, so the utility behind it survives.
fn completion_target(tokens: &[ClassToken], position: u32) -> CompletionTarget {
    let Some(token) = token_at_position(tokens, position) else {
        return CompletionTarget {
            replacement: EditorRange {
                start: position,
                end: position,
            },
            variants: String::new(),
            prefix: String::new(),
            variants_only: false,
        };
    };

    let cursor = utf16_offset_to_byte(&token.text, position.saturating_sub(token.range.start));
    let (_, utility) = split_variant_prefixes(&token.text);
    let variants_end = token.text.len() - utility.len();

    if cursor < variants_end {
        let segment_start = token.text[..cursor]
            .rfind(':')
            .map_or(0, |index| index + ':'.len_utf8());
        let segment_end = token.text[cursor..variants_end]
            .find(':')
            .map_or(variants_end, |index| cursor + index + ':'.len_utf8());

        return CompletionTarget {
            replacement: EditorRange {
                start: token.range.start + utf16_len(&token.text[..segment_start]),
                end: token.range.start + utf16_len(&token.text[..segment_end]),
            },
            variants: token.text[..segment_start].to_owned(),
            prefix: token.text[segment_start..cursor].to_owned(),
            variants_only: true,
        };
    }

    CompletionTarget {
        replacement: EditorRange {
            start: token.range.start + utf16_len(&token.text[..variants_end]),
            end: token.range.end,
        },
        variants: token.text[..variants_end].to_owned(),
        prefix: token.text[variants_end..cursor].to_owned(),
        variants_only: false,
    }
}

fn utf16_offset_to_byte(text: &str, offset: u32) -> usize {
    let mut units = 0u32;
    let mut byte = 0usize;

    for (index, ch) in text.char_indices() {
        let next = units + ch.len_utf16() as u32;
        if next > offset {
            return index;
        }
        units = next;
        byte = index + ch.len_utf8();
    }

    byte
}

fn completion_candidates(
    config: &TailwindConfig,
    element_tag: Option<&str>,
    typed_variants: &str,
    prefix: &str,
) -> Vec<CompletionItem> {
    let mut items = Vec::new();
    let used: Vec<&str> = typed_variants
        .split(':')
        .filter(|v| !v.is_empty())
        .collect();

    for (variant, condition) in RUNTIME_VARIANTS {
        if used.contains(&variant) {
            continue;
        }

        let label = format!("{variant}:");
        // Variants rank just behind utilities so a literal match still wins.
        let Some(score) = match_score(&label, prefix).map(|score| score + 1) else {
            continue;
        };

        items.push(CompletionItem {
            label: label.clone(),
            insert_text: label.clone(),
            kind: "runtime variant".to_owned(),
            category: "variant".to_owned(),
            documentation: format!("Apply the following vela-rbxts utility when {condition}."),
            replacement: None,
            color: None,
            sort_text: Some(sort_text(score, &label)),
        });
    }

    for item in plugin_utility_candidates(config) {
        let Some(score) = match_score(&item.label, prefix) else {
            continue;
        };

        let mut item = item;
        // A project's own utilities rank ahead of the built-ins on a tie.
        item.sort_text = Some(sort_text(score.saturating_sub(1), &item.label));
        items.push(item);
    }

    for base in base_utility_candidates(config) {
        if !is_utility_allowed_on_host(element_tag, &base.utility_kind) {
            continue;
        }

        let Some(score) = match_score(&base.item.label, prefix) else {
            continue;
        };

        let mut item = base.item;
        item.sort_text = Some(sort_text(score, &item.label));
        items.push(item);
    }

    let mut seen = std::collections::HashSet::new();
    items.retain(|item| seen.insert(item.label.clone()));
    items.sort_by(|left, right| left.sort_text.cmp(&right.sort_text));
    items
}

fn sort_text(score: u32, label: &str) -> String {
    format!("{score:03}-{label}")
}

/// Ranks a candidate against what the user typed, lower being better. `None`
/// means the candidate does not match at all. Beyond a literal prefix this
/// accepts word-boundary and subsequence hits, so `slate` reaches
/// `bg-slate-500` and `bgsl` reaches `bg-slate-*`.
fn match_score(label: &str, prefix: &str) -> Option<u32> {
    if prefix.is_empty() {
        return Some(50);
    }

    if label.starts_with(prefix) {
        return Some(0);
    }

    if let Some(index) = label.find(prefix) {
        let at_boundary = label[..index].ends_with('-');
        return Some(if at_boundary { 10 } else { 20 });
    }

    is_subsequence(label, prefix).then_some(30)
}

fn is_subsequence(label: &str, prefix: &str) -> bool {
    let mut candidate = label.chars();
    prefix
        .chars()
        .all(|wanted| candidate.any(|actual| actual == wanted))
}

/// `#rrggbb` for a theme color key, so the editor can draw a swatch next to the
/// completion instead of a generic icon.
fn color_swatch(config: &TailwindConfig, color_key: &str) -> Option<String> {
    let mut diagnostics = Vec::new();
    let resolution = resolve_color_value(
        config,
        &mut diagnostics,
        BACKGROUND_COLOR_FAMILY,
        color_key,
        color_key,
    )?;

    let ColorResolution::Expression(value) = resolution else {
        return None;
    };

    let (red, green, blue) = parse_color3_from_rgb(&value)?;
    Some(format!("#{red:02x}{green:02x}{blue:02x}"))
}

fn plugin_utility_candidates(config: &TailwindConfig) -> Vec<CompletionItem> {
    config
        .plugins
        .utilities
        .iter()
        .map(|(name, utility)| CompletionItem {
            label: name.clone(),
            insert_text: name.clone(),
            kind: "plugin utility".to_owned(),
            category: "plugin".to_owned(),
            documentation: describe_plugin_utility(utility),
            replacement: None,
            color: None,
            sort_text: None,
        })
        .collect()
}

pub(crate) fn describe_plugin_utility(utility: &PluginUtility) -> String {
    match utility {
        PluginUtility::Classes(classes) => {
            format!("Plugin utility for `{classes}`.")
        }
        PluginUtility::Props(props) => {
            let body = props
                .iter()
                .map(|(name, value)| format!("`{name} = {value}`"))
                .collect::<Vec<_>>()
                .join(", ");

            format!("Plugin utility setting {body}.")
        }
    }
}

fn base_utility_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    [
        color_candidates as fn(&TailwindConfig) -> Vec<CompletionSpec>,
        border_candidates,
        radius_and_stacking_candidates,
        spacing_and_size_candidates,
        transform_and_opacity_candidates,
        layout_candidates,
        stroke_effect_candidates,
        motion_candidates,
        divide_and_margin_candidates,
        grid_and_basis_candidates,
        typography_candidates,
        visibility_candidates,
        shadow_and_gradient_candidates,
        size_constraint_candidates,
        flex_alignment_candidates,
    ]
    .into_iter()
    .flat_map(|family| family(config))
    .collect()
}

fn color_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (prefix, prop, category, utility_kind) in [
        (
            "bg",
            "BackgroundColor3",
            "color",
            UtilityKind::BackgroundColor,
        ),
        ("text", "TextColor3", "color", UtilityKind::TextColor),
        ("image", "ImageColor3", "color", UtilityKind::ImageColor),
        (
            "placeholder",
            "PlaceholderColor3",
            "color",
            UtilityKind::PlaceholderColor,
        ),
        (
            "scrollbar",
            "ScrollBarImageColor3",
            "color",
            UtilityKind::ScrollbarColor,
        ),
    ] {
        for color_key in color_completion_keys(config) {
            items.push(
                CompletionSpec::new(
                    format!("{prefix}-{color_key}"),
                    category,
                    format!("Set Roblox {prop} from theme color `{color_key}`."),
                    utility_kind.clone(),
                )
                .with_swatch(color_swatch(config, &color_key)),
            );
        }
        // Roblox has no placeholder transparency, so the compiler turns this one
        // down: offering it would only hand back a diagnostic.
        if !matches!(utility_kind, UtilityKind::PlaceholderColor) {
            items.push(CompletionSpec::new(
                format!("{prefix}-transparent"),
                category,
                format!("Use the transparent keyword for Roblox {prop}."),
                utility_kind,
            ));
        }
    }

    items
}

fn border_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    items.push(CompletionSpec::new(
        "border",
        "border",
        format!(
            "Create a Roblox UIStroke with `Thickness` set to {}.",
            crate::editor::offset_value_text(config, "1")
        ),
        UtilityKind::Border,
    ));

    for thickness in BORDER_THICKNESS_VALUES {
        items.push(CompletionSpec::new(
            format!("border-{thickness}"),
            "border",
            format!(
                "Set Roblox UIStroke.Thickness to {}.",
                crate::editor::offset_value_text(config, thickness)
            ),
            UtilityKind::Border,
        ));
    }

    items.push(CompletionSpec::new(
        "border-transparent",
        "border",
        "Set Roblox UIStroke.Transparency to `1`.".to_owned(),
        UtilityKind::Border,
    ));

    for (line_join, _) in BORDER_LINE_JOIN_VALUES {
        items.push(CompletionSpec::new(
            format!("border-{line_join}"),
            "border",
            format!("Set Roblox UIStroke.LineJoinMode from `border-{line_join}`."),
            UtilityKind::Border,
        ));
    }

    for color_key in color_completion_keys(config) {
        items.push(
            CompletionSpec::new(
                format!("border-{color_key}"),
                "color",
                format!("Set Roblox UIStroke.Color from theme color `{color_key}`."),
                UtilityKind::Border,
            )
            .with_swatch(color_swatch(config, &color_key)),
        );
    }

    items
}

fn radius_and_stacking_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    let radius_keys = radius_completion_keys(config);
    for kind in RADIUS_KINDS {
        let prefix = if kind.suffix().is_empty() {
            "rounded".to_owned()
        } else {
            format!("rounded-{}", kind.suffix())
        };
        let targets = kind
            .props()
            .iter()
            .map(|prop| format!("UICorner.{prop}"))
            .collect::<Vec<_>>()
            .join(", ");

        for key in &radius_keys {
            // `rounded-DEFAULT` is not a class; the DEFAULT radius is what a bare
            // directional or all-corner utility resolves to.
            let label = if key == PALETTE_DEFAULT_KEY {
                prefix.clone()
            } else {
                format!("{prefix}-{key}")
            };
            items.push(CompletionSpec::new(
                label,
                "radius",
                format!("Set {targets} from theme radius `{key}`."),
                UtilityKind::Radius(kind),
            ));
        }
    }

    for key in Z_INDEX_VALUES {
        items.push(CompletionSpec::new(
            format!("z-{key}"),
            "stacking",
            format!("Set Roblox ZIndex to `{key}`."),
            UtilityKind::ZIndex,
        ));
    }

    items
}

fn spacing_and_size_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    let spacing_keys = spacing_completion_keys(config);
    for (prefix, utility_kind) in [
        ("p", UtilityKind::Padding(PaddingKind::All)),
        ("px", UtilityKind::Padding(PaddingKind::X)),
        ("py", UtilityKind::Padding(PaddingKind::Y)),
        ("pt", UtilityKind::Padding(PaddingKind::Top)),
        ("pr", UtilityKind::Padding(PaddingKind::Right)),
        ("pb", UtilityKind::Padding(PaddingKind::Bottom)),
        ("pl", UtilityKind::Padding(PaddingKind::Left)),
        ("gap", UtilityKind::Gap),
    ] {
        for key in &spacing_keys {
            let target = if prefix == "gap" {
                "UIListLayout.Padding"
            } else {
                "UIPadding"
            };
            items.push(CompletionSpec::new(
                format!("{prefix}-{key}"),
                "spacing",
                format!("Set Roblox {target} from spacing `{key}`."),
                utility_kind.clone(),
            ));
        }
    }

    for (prefix, utility_kind) in [
        ("w", UtilityKind::Width),
        ("h", UtilityKind::Height),
        ("size", UtilityKind::Size),
    ] {
        for key in size_completion_keys(config) {
            items.push(CompletionSpec::new(
                format!("{prefix}-{key}"),
                "size",
                format!("Set Roblox Size using `{prefix}-{key}`."),
                utility_kind.clone(),
            ));
        }
    }

    items
}

fn transform_and_opacity_candidates(_config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for degrees in ROTATION_VALUES {
        items.push(CompletionSpec::new(
            format!("rotate-{degrees}"),
            "transform",
            format!("Set Roblox Rotation to `{degrees}`."),
            UtilityKind::Rotation,
        ));

        if degrees != "0" {
            items.push(CompletionSpec::new(
                format!("-rotate-{degrees}"),
                "transform",
                format!("Set Roblox Rotation to `-{degrees}`."),
                UtilityKind::Rotation,
            ));
        }
    }

    for (scale, _) in SCALE_VALUES {
        items.push(CompletionSpec::new(
            format!("scale-{scale}"),
            "transform",
            format!("Set Roblox UIScale.Scale from `scale-{scale}`."),
            UtilityKind::Scale,
        ));
    }

    for percent in OPACITY_VALUES {
        items.push(CompletionSpec::new(
            format!("opacity-{percent}"),
            "effects",
            format!("Fade this element to `{percent}%` opacity, children included."),
            UtilityKind::Opacity,
        ));
    }

    items
}

fn layout_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for key in ASPECT_RATIO_VALUES {
        items.push(CompletionSpec::new(
            format!("aspect-{key}"),
            "layout",
            format!("Set Roblox UIAspectRatioConstraint.AspectRatio from `aspect-{key}`."),
            UtilityKind::AspectRatio,
        ));
    }

    items.push(CompletionSpec::new(
        "flex",
        "layout",
        "Create a Roblox UIListLayout with a horizontal fill direction.".to_owned(),
        UtilityKind::FlexDirection,
    ));

    for direction in FLEX_DIRECTION_VALUES {
        items.push(CompletionSpec::new(
            format!("flex-{direction}"),
            "layout",
            format!("Set Roblox UIListLayout.FillDirection from `flex-{direction}`."),
            UtilityKind::FlexDirection,
        ));
    }

    for (prefix, utility_kind, axis) in [
        ("left", UtilityKind::PositionX, "Position.X"),
        ("top", UtilityKind::PositionY, "Position.Y"),
        ("right", UtilityKind::PositionRight, "Position.X"),
        ("bottom", UtilityKind::PositionBottom, "Position.Y"),
        ("inset", UtilityKind::Inset, "Position"),
        ("translate-x", UtilityKind::TranslateX, "Position.X shift"),
        ("translate-y", UtilityKind::TranslateY, "Position.Y shift"),
    ] {
        for key in position_completion_keys(config) {
            for label in [format!("{prefix}-{key}"), format!("-{prefix}-{key}")] {
                items.push(CompletionSpec::new(
                    label.clone(),
                    "layout",
                    format!("Set Roblox {axis} using `{prefix}-{key}`."),
                    utility_kind.clone(),
                ));
            }
        }
    }

    for alignment in ALIGN_CONTENT_VALUES {
        items.push(CompletionSpec::new(
            format!("content-{alignment}"),
            "layout",
            format!("Set Roblox UIListLayout cross-axis packing from `content-{alignment}`."),
            UtilityKind::AlignContent,
        ));
    }

    for (key, alignment) in ALIGN_SELF_VALUES {
        items.push(CompletionSpec::new(format!("self-{key}"), "layout", format!(
                    "Add a Roblox UIFlexItem with `ItemLineAlignment = Enum.ItemLineAlignment.{alignment}`."
                ), UtilityKind::AlignSelf));
    }

    for key in LAYOUT_ORDER_KEYWORDS
        .iter()
        .map(|(name, _)| (*name).to_owned())
        .chain((1..=12).map(|order| order.to_string()))
    {
        items.push(CompletionSpec::new(
            format!("order-{key}"),
            "layout",
            format!("Set Roblox LayoutOrder from `order-{key}`."),
            UtilityKind::LayoutOrder,
        ));
    }

    for (key, scale_type) in OBJECT_FIT_VALUES {
        items.push(CompletionSpec::new(
            format!("object-{key}"),
            "layout",
            format!("Set Roblox ScaleType to `Enum.ScaleType.{scale_type}`."),
            UtilityKind::ObjectFit,
        ));
    }

    for (key, value) in POINTER_EVENTS_VALUES {
        items.push(CompletionSpec::new(
            format!("pointer-events-{key}"),
            "layout",
            format!("Set Roblox Interactable to `{value}`."),
            UtilityKind::PointerEvents,
        ));
    }

    for (prefix, utility_kind, direction) in [
        ("space-x", UtilityKind::SpaceX, "Horizontal"),
        ("space-y", UtilityKind::SpaceY, "Vertical"),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec::new(format!("{prefix}-{key}"), "layout", format!(
                        "Set Roblox UIListLayout.Padding from spacing `{key}` with `FillDirection = Enum.FillDirection.{direction}`."
                    ), utility_kind.clone()));
        }
    }

    for (key, value) in WHITESPACE_VALUES {
        items.push(CompletionSpec::new(
            format!("whitespace-{key}"),
            "typography",
            format!("Set Roblox TextWrapped to `{value}`."),
            UtilityKind::Whitespace,
        ));
    }

    for (key, behavior) in OVERSCROLL_VALUES {
        items.push(CompletionSpec::new(
            format!("overscroll-{key}"),
            "layout",
            format!("Set Roblox ElasticBehavior to `Enum.ElasticBehavior.{behavior}`."),
            UtilityKind::Overscroll,
        ));
    }

    for (key, direction) in SCROLL_DIRECTION_VALUES {
        items.push(CompletionSpec::new(
            format!("scroll-{key}"),
            "layout",
            format!("Set Roblox ScrollingDirection to `Enum.ScrollingDirection.{direction}`."),
            UtilityKind::ScrollDirection,
        ));
    }

    items.push(CompletionSpec::new(
        "scroll-none",
        "layout",
        "Set Roblox ScrollingEnabled to `false`.".to_owned(),
        UtilityKind::ScrollDirection,
    ));

    for key in spacing_completion_keys(config) {
        items.push(CompletionSpec::new(
            format!("scrollbar-w-{key}"),
            "layout",
            format!("Set Roblox ScrollBarThickness from spacing `{key}`."),
            UtilityKind::ScrollbarThickness,
        ));
    }

    items.push(CompletionSpec::new(
        "scrollbar-none",
        "layout",
        "Hide the scrollbar by setting `ScrollBarThickness = 0`.".to_owned(),
        UtilityKind::ScrollbarThickness,
    ));

    for (key, axis) in CANVAS_SIZE_VALUES {
        items.push(CompletionSpec::new(
            format!("canvas-{key}"),
            "layout",
            format!("Set Roblox AutomaticCanvasSize to `Enum.AutomaticSize.{axis}`."),
            UtilityKind::CanvasSize,
        ));
    }

    items
}

fn stroke_effect_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (family, utility_kind) in [
        ("ring", UtilityKind::Ring),
        ("outline", UtilityKind::Outline),
    ] {
        items.push(CompletionSpec::new(family.to_owned(), "effects", "Set UIStroke.Thickness with `ApplyStrokeMode = Border`; shares the same UIStroke as `border-*`.".to_owned(), utility_kind.clone()));

        for thickness in RING_THICKNESS_VALUES {
            items.push(CompletionSpec::new(
                format!("{family}-{thickness}"),
                "effects",
                format!(
                    "Set UIStroke.Thickness to {}.",
                    crate::editor::offset_value_text(config, thickness)
                ),
                utility_kind.clone(),
            ));
        }

        for color_key in color_completion_keys(config) {
            items.push(
                CompletionSpec::new(
                    format!("{family}-{color_key}"),
                    "color",
                    format!("Set UIStroke.Color from theme color `{color_key}`."),
                    utility_kind.clone(),
                )
                .with_swatch(color_swatch(config, &color_key)),
            );
        }
    }

    items
}

fn motion_candidates(_config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (label, documentation) in [
        (
            "transition".to_owned(),
            "Tween runtime style changes with TweenService (0.15s by default).".to_owned(),
        ),
        (
            "transition-none".to_owned(),
            "Disable the transition; runtime style changes apply instantly.".to_owned(),
        ),
    ] {
        items.push(CompletionSpec::new(
            label.clone(),
            "effects",
            documentation,
            UtilityKind::Transition,
        ));
    }

    for (prefix, utility_kind, field) in [
        ("duration", UtilityKind::TransitionDuration, "duration"),
        ("delay", UtilityKind::TransitionDelay, "delay"),
    ] {
        for millis in DURATION_PRESET_VALUES {
            items.push(CompletionSpec::new(
                format!("{prefix}-{millis}"),
                "effects",
                format!("Set the transition {field} to `{millis}ms`."),
                utility_kind.clone(),
            ));
        }
    }

    for (key, description) in ANIMATION_VALUES {
        items.push(CompletionSpec::new(
            format!("animate-{key}"),
            "effects",
            description.to_owned(),
            UtilityKind::Animation,
        ));
    }

    for (key, style, direction) in EASE_VALUES {
        items.push(CompletionSpec::new(format!("ease-{key}"), "effects", format!(
                    "Set the transition easing to `Enum.EasingStyle.{style}` / `Enum.EasingDirection.{direction}`."
                ), UtilityKind::TransitionEase));
    }

    items
}

fn divide_and_margin_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (label, utility_kind, axis) in [
        ("divide-x", UtilityKind::DivideX, "vertical"),
        ("divide-y", UtilityKind::DivideY, "horizontal"),
    ] {
        items.push(CompletionSpec::new(
            label.to_owned(),
            "layout",
            format!(
                "Insert a {} {axis} separator frame between children (not for LayoutOrder lists).",
                crate::editor::px_length_text(config, "1")
            ),
            utility_kind.clone(),
        ));

        for thickness in RING_THICKNESS_VALUES {
            items.push(CompletionSpec::new(
                format!("{label}-{thickness}"),
                "layout",
                format!(
                    "Insert a {} {axis} separator frame between children.",
                    crate::editor::px_length_text(config, thickness)
                ),
                utility_kind.clone(),
            ));
        }
    }

    for color_key in color_completion_keys(config) {
        items.push(
            CompletionSpec::new(
                format!("divide-{color_key}"),
                "color",
                format!("Paint the divide separators from theme color `{color_key}`."),
                UtilityKind::DivideColor,
            )
            .with_swatch(color_swatch(config, &color_key)),
        );
    }

    for (prefix, utility_kind, sides) in [
        ("m", UtilityKind::Margin(PaddingKind::All), "all sides"),
        (
            "mx",
            UtilityKind::Margin(PaddingKind::X),
            "the left and right",
        ),
        (
            "my",
            UtilityKind::Margin(PaddingKind::Y),
            "the top and bottom",
        ),
        ("mt", UtilityKind::Margin(PaddingKind::Top), "the top"),
        ("mr", UtilityKind::Margin(PaddingKind::Right), "the right"),
        ("mb", UtilityKind::Margin(PaddingKind::Bottom), "the bottom"),
        ("ml", UtilityKind::Margin(PaddingKind::Left), "the left"),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec::new(
                format!("{prefix}-{key}"),
                "layout",
                format!("Wrap the element in a margin box padded by spacing `{key}` on {sides}."),
                utility_kind.clone(),
            ));
        }
    }

    for (prefix, utility_kind) in [
        ("-mt", UtilityKind::Margin(PaddingKind::Top)),
        ("-ml", UtilityKind::Margin(PaddingKind::Left)),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec::new(
                format!("{prefix}-{key}"),
                "layout",
                format!("Shift Position by negative spacing `{key}` (margin pull)."),
                utility_kind.clone(),
            ));
        }
    }

    for (label, utility_kind, axis) in [
        ("mx-auto", UtilityKind::CenterX, "X"),
        ("my-auto", UtilityKind::CenterY, "Y"),
    ] {
        items.push(CompletionSpec::new(
            label.to_owned(),
            "layout",
            format!("Center the element on the {axis} axis via AnchorPoint and Position."),
            utility_kind.clone(),
        ));
    }

    items
}

fn grid_and_basis_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    items.push(CompletionSpec::new(
        "grid",
        "layout",
        "Add a Roblox UIGridLayout ordered by LayoutOrder.".to_owned(),
        UtilityKind::Grid,
    ));

    for (prefix, utility_kind, direction) in [
        ("grid-cols", UtilityKind::GridColumns, "Horizontal"),
        ("grid-rows", UtilityKind::GridRows, "Vertical"),
    ] {
        for count in 1..=GRID_CELL_COUNT_MAX {
            items.push(CompletionSpec::new(format!("{prefix}-{count}"), "layout", format!(
                        "Add a Roblox UIGridLayout with `FillDirection = Enum.FillDirection.{direction}` and `FillDirectionMaxCells = {count}`."
                    ), utility_kind.clone()));
        }
    }

    for key in size_completion_keys(config) {
        items.push(CompletionSpec::new(
            format!("basis-{key}"),
            "layout",
            format!("Set the main-axis (row) size from `basis-{key}`."),
            UtilityKind::Basis,
        ));
    }

    for (origin, _, _) in ANCHOR_ORIGIN_VALUES {
        items.push(CompletionSpec::new(
            format!("origin-{origin}"),
            "layout",
            format!("Set Roblox AnchorPoint from `origin-{origin}`."),
            UtilityKind::AnchorPoint,
        ));
    }

    items
}

fn typography_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (key, value) in TEXT_SIZE_VALUES {
        items.push(CompletionSpec::new(
            format!("text-{key}"),
            "typography",
            format!("Set Roblox TextSize to `{value}`."),
            UtilityKind::TextSize,
        ));
    }

    for key in font_family_completion_keys(config) {
        items.push(CompletionSpec::new(
            format!("font-{key}"),
            "typography",
            format!("Set the Roblox FontFace family from font family `{key}`."),
            UtilityKind::FontFamily,
        ));
    }

    for (key, weight) in FONT_WEIGHT_VALUES {
        items.push(CompletionSpec::new(
            format!("font-{key}"),
            "typography",
            format!("Set Roblox FontFace weight to `{weight}`."),
            UtilityKind::FontWeight,
        ));
    }

    for (key, value) in LINE_HEIGHT_VALUES {
        items.push(CompletionSpec::new(
            format!("leading-{key}"),
            "typography",
            format!("Set Roblox LineHeight to `{value}`."),
            UtilityKind::LineHeight,
        ));
    }

    for (label, documentation, utility_kind) in [
        (
            "uppercase",
            "Uppercase the element's Text (ASCII letters only).",
            UtilityKind::TextTransform,
        ),
        (
            "lowercase",
            "Lowercase the element's Text (ASCII letters only).",
            UtilityKind::TextTransform,
        ),
        (
            "capitalize",
            "Uppercase the first ASCII letter of each word in the element's Text.",
            UtilityKind::TextTransform,
        ),
        (
            "normal-case",
            "Remove the text transform.",
            UtilityKind::TextTransform,
        ),
        (
            "underline",
            "Enable RichText and wrap the escaped Text in `<u>...</u>`.",
            UtilityKind::TextDecoration,
        ),
        (
            "line-through",
            "Enable RichText and wrap the escaped Text in `<s>...</s>`.",
            UtilityKind::TextDecoration,
        ),
        (
            "no-underline",
            "Remove the text decoration.",
            UtilityKind::TextDecoration,
        ),
    ] {
        items.push(CompletionSpec::new(
            label.to_owned(),
            "typography",
            documentation.to_owned(),
            utility_kind,
        ));
    }

    for (key, style) in FONT_STYLE_VALUES {
        items.push(CompletionSpec::new(
            key.to_owned(),
            "typography",
            format!("Set Roblox FontFace style to `Enum.FontStyle.{style}`."),
            UtilityKind::FontStyle,
        ));
    }

    for (alignment, _) in TEXT_X_ALIGN_VALUES {
        items.push(CompletionSpec::new(
            format!("text-{alignment}"),
            "typography",
            format!("Set Roblox TextXAlignment from `text-{alignment}`."),
            UtilityKind::TextXAlignment,
        ));
    }

    for (alignment, _) in TEXT_Y_ALIGN_VALUES {
        items.push(CompletionSpec::new(
            format!("align-{alignment}"),
            "typography",
            format!("Set Roblox TextYAlignment from `align-{alignment}`."),
            UtilityKind::TextYAlignment,
        ));
    }

    for wrap in TEXT_WRAP_VALUES {
        items.push(CompletionSpec::new(
            format!("text-{wrap}"),
            "typography",
            format!("Set Roblox TextWrapped from `text-{wrap}`."),
            UtilityKind::TextWrap,
        ));
    }

    items.push(CompletionSpec::new(
        "truncate",
        "typography",
        "Set Roblox TextTruncate to `Enum.TextTruncate.AtEnd`.".to_owned(),
        UtilityKind::TextTruncate,
    ));

    items
}

fn visibility_candidates(_config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (label, prop, value, utility_kind) in [
        ("hidden", "Visible", "false", UtilityKind::Visibility),
        ("visible", "Visible", "true", UtilityKind::Visibility),
        (
            "overflow-hidden",
            "ClipsDescendants",
            "true",
            UtilityKind::Overflow,
        ),
        (
            "overflow-clip",
            "ClipsDescendants",
            "true",
            UtilityKind::Overflow,
        ),
        (
            "overflow-visible",
            "ClipsDescendants",
            "false",
            UtilityKind::Overflow,
        ),
        (
            "flex-wrap",
            "UIListLayout.Wraps",
            "true",
            UtilityKind::FlexWrap,
        ),
        (
            "flex-nowrap",
            "UIListLayout.Wraps",
            "false",
            UtilityKind::FlexWrap,
        ),
    ] {
        items.push(CompletionSpec::new(
            label.to_owned(),
            "layout",
            format!("Set Roblox {prop} to `{value}`."),
            utility_kind,
        ));
    }

    items
}

fn shadow_and_gradient_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    items.push(CompletionSpec::new(
        "shadow",
        "effects",
        "Create a Roblox UIShadow with the default drop shadow.".to_owned(),
        UtilityKind::ShadowSize,
    ));

    for size in SHADOW_SIZE_VALUES {
        let documentation = if size == "none" {
            "Disable the UIShadow via `UIShadow.Enabled = false`.".to_owned()
        } else {
            format!("Create a Roblox UIShadow sized like Tailwind `shadow-{size}`.")
        };
        items.push(CompletionSpec::new(
            format!("shadow-{size}"),
            "effects",
            documentation,
            UtilityKind::ShadowSize,
        ));
    }

    for color_key in color_completion_keys(config) {
        items.push(
            CompletionSpec::new(
                format!("shadow-{color_key}"),
                "color",
                format!("Set Roblox UIShadow.Color from theme color `{color_key}`."),
                UtilityKind::ShadowColor,
            )
            .with_swatch(color_swatch(config, &color_key)),
        );
    }

    for (direction, _) in GRADIENT_DIRECTION_VALUES {
        items.push(CompletionSpec::new(format!("bg-gradient-to-{direction}"), "effects", format!(
                    "Create a Roblox UIGradient pointing `{direction}`. Combine with `from-*`/`via-*`/`to-*`."
                ), UtilityKind::GradientDirection));
    }

    for (prefix, utility_kind) in [
        ("from", UtilityKind::GradientFrom),
        ("via", UtilityKind::GradientVia),
        ("to", UtilityKind::GradientTo),
    ] {
        for color_key in color_completion_keys(config) {
            items.push(
                CompletionSpec::new(
                    format!("{prefix}-{color_key}"),
                    "color",
                    format!(
                        "Add a `{prefix}` UIGradient color stop from theme color `{color_key}`."
                    ),
                    utility_kind.clone(),
                )
                .with_swatch(color_swatch(config, &color_key)),
            );
        }
    }

    items
}

fn size_constraint_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (prefix, target, utility_kind) in [
        ("min-w", "UISizeConstraint.MinSize.X", UtilityKind::MinWidth),
        ("max-w", "UISizeConstraint.MaxSize.X", UtilityKind::MaxWidth),
        (
            "min-h",
            "UISizeConstraint.MinSize.Y",
            UtilityKind::MinHeight,
        ),
        (
            "max-h",
            "UISizeConstraint.MaxSize.Y",
            UtilityKind::MaxHeight,
        ),
    ] {
        for key in spacing_completion_keys(config) {
            items.push(CompletionSpec::new(
                format!("{prefix}-{key}"),
                "size",
                format!("Set Roblox {target} from spacing `{key}`."),
                utility_kind.clone(),
            ));
        }
    }

    items
}

fn flex_alignment_candidates(_config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (prefix, utility_kind) in [
        ("justify", UtilityKind::JustifyContent),
        ("items", UtilityKind::AlignItems),
    ] {
        for alignment in ALIGNMENT_VALUES {
            let target = if prefix == "justify" {
                "UIListLayout.HorizontalAlignment"
            } else {
                "UIListLayout.VerticalAlignment"
            };
            items.push(CompletionSpec::new(
                format!("{prefix}-{alignment}"),
                "layout",
                format!("Set Roblox {target} from `{prefix}-{alignment}`."),
                utility_kind.clone(),
            ));
        }
    }

    for (alignment, _) in JUSTIFY_FLEX_VALUES {
        items.push(CompletionSpec::new(
            format!("justify-{alignment}"),
            "layout",
            format!("Set Roblox UIListLayout.HorizontalFlex from `justify-{alignment}`."),
            UtilityKind::JustifyContent,
        ));
    }

    items.push(CompletionSpec::new(
        "items-stretch",
        "layout",
        "Set Roblox UIListLayout.VerticalFlex to `Enum.UIFlexAlignment.Fill`.".to_owned(),
        UtilityKind::AlignItems,
    ));

    for label in FLEX_ITEM_VALUES {
        items.push(CompletionSpec::new(
            label.to_owned(),
            "layout",
            format!("Add a Roblox UIFlexItem from `{label}`."),
            UtilityKind::FlexItem,
        ));
    }

    items
}
