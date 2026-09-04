// Parts of this vocabulary are read only by the editor, which the wasm
// binding leaves out; the native build still checks them for real dead code.
#![cfg_attr(target_arch = "wasm32", allow(dead_code))]

use crate::api::Diagnostic;
use crate::config::model::{ColorValue, TailwindConfig};
use crate::diagnostics::compiler::{
    color_does_not_accept_shade_diagnostic, color_missing_shade_diagnostic,
    color_requires_shade_diagnostic, unknown_theme_key_diagnostic,
    unsupported_arbitrary_value_diagnostic, unsupported_arbitrary_z_index_diagnostic,
    unsupported_color_keyword_diagnostic, unsupported_size_spacing_value_diagnostic,
    unsupported_z_index_auto_diagnostic, unsupported_z_index_value_diagnostic,
};
use crate::ir::model::SizeAxisValue;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PaddingKind {
    All,
    X,
    Y,
    Top,
    Right,
    Bottom,
    Left,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RadiusKind {
    All,
    Top,
    Right,
    Bottom,
    Left,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

impl RadiusKind {
    pub(crate) fn props(self) -> &'static [&'static str] {
        match self {
            Self::All => &["CornerRadius"],
            Self::Top => &["TopLeftRadius", "TopRightRadius"],
            Self::Right => &["TopRightRadius", "BottomRightRadius"],
            Self::Bottom => &["BottomLeftRadius", "BottomRightRadius"],
            Self::Left => &["TopLeftRadius", "BottomLeftRadius"],
            Self::TopLeft => &["TopLeftRadius"],
            Self::TopRight => &["TopRightRadius"],
            Self::BottomLeft => &["BottomLeftRadius"],
            Self::BottomRight => &["BottomRightRadius"],
        }
    }

    pub(crate) fn suffix(self) -> &'static str {
        match self {
            Self::All => "",
            Self::Top => "t",
            Self::Right => "r",
            Self::Bottom => "b",
            Self::Left => "l",
            Self::TopLeft => "tl",
            Self::TopRight => "tr",
            Self::BottomLeft => "bl",
            Self::BottomRight => "br",
        }
    }
}

pub(crate) const RADIUS_KINDS: [RadiusKind; 9] = [
    RadiusKind::All,
    RadiusKind::Top,
    RadiusKind::Right,
    RadiusKind::Bottom,
    RadiusKind::Left,
    RadiusKind::TopLeft,
    RadiusKind::TopRight,
    RadiusKind::BottomLeft,
    RadiusKind::BottomRight,
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum UtilityKind {
    BackgroundColor,
    TextColor,
    ImageColor,
    PlaceholderColor,
    Border,
    Radius(RadiusKind),
    ZIndex,
    Padding(PaddingKind),
    Gap,
    Width,
    Height,
    Size,
    Rotation,
    Opacity,
    AspectRatio,
    FlexDirection,
    JustifyContent,
    AlignItems,
    PositionX,
    PositionY,
    PositionRight,
    PositionBottom,
    Inset,
    AnchorPoint,
    AlignContent,
    AlignSelf,
    LayoutOrder,
    LineHeight,
    FontStyle,
    Grid,
    GridColumns,
    GridRows,
    GridAutoRows,
    GridAutoColumns,
    Basis,
    TranslateX,
    TranslateY,
    ObjectFit,
    PointerEvents,
    Transition,
    TransitionDuration,
    TransitionEase,
    TransitionDelay,
    Animation,
    TextTransform,
    TextDecoration,
    Margin(PaddingKind),
    DivideX,
    DivideY,
    DivideColor,
    SpaceX,
    SpaceY,
    Whitespace,
    Overscroll,
    ScrollDirection,
    ScrollbarThickness,
    ScrollbarColor,
    CanvasSize,
    Ring,
    Outline,
    CenterX,
    CenterY,
    TextSize,
    FontWeight,
    FontFamily,
    TextXAlignment,
    TextYAlignment,
    TextWrap,
    TextTruncate,
    Visibility,
    Overflow,
    FlexWrap,
    MinWidth,
    MaxWidth,
    MinHeight,
    MaxHeight,
    ShadowSize,
    ShadowColor,
    GradientDirection,
    GradientFrom,
    GradientVia,
    GradientTo,
    FlexItem,
    Scale,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ColorFamilySpec {
    pub(crate) theme_family: &'static str,
    pub(crate) color_prop: &'static str,
    pub(crate) transparency_prop: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ColorResolution {
    Expression(String),
    Transparent,
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

pub(crate) const BORDER_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "border color",
    color_prop: "Color",
    transparency_prop: Some("Transparency"),
};

pub(crate) const Z_INDEX_VALUES: [&str; 6] = ["0", "10", "20", "30", "40", "50"];
pub(crate) const BORDER_THICKNESS_VALUES: [&str; 4] = ["0", "1", "2", "4"];
pub(crate) const ROTATION_VALUES: [&str; 9] = ["0", "1", "2", "3", "6", "12", "45", "90", "180"];
pub(crate) const SCALE_VALUES: [(&str, &str); 10] = [
    ("0", "0"),
    ("50", "0.5"),
    ("75", "0.75"),
    ("90", "0.9"),
    ("95", "0.95"),
    ("100", "1"),
    ("105", "1.05"),
    ("110", "1.1"),
    ("125", "1.25"),
    ("150", "1.5"),
];
pub(crate) const BORDER_LINE_JOIN_VALUES: [(&str, &str); 3] =
    [("round", "Round"), ("bevel", "Bevel"), ("miter", "Miter")];
pub(crate) const OPACITY_VALUES: [&str; 14] = [
    "0", "5", "10", "20", "25", "30", "40", "50", "60", "70", "75", "80", "90", "100",
];
pub(crate) const ASPECT_RATIO_VALUES: [&str; 2] = ["square", "video"];
pub(crate) const FLEX_DIRECTION_VALUES: [&str; 2] = ["row", "col"];
pub(crate) const ALIGNMENT_VALUES: [&str; 3] = ["start", "center", "end"];
pub(crate) const JUSTIFY_FLEX_VALUES: [(&str, &str); 4] = [
    ("between", "SpaceBetween"),
    ("around", "SpaceAround"),
    ("evenly", "SpaceEvenly"),
    ("stretch", "Fill"),
];
pub(crate) const FLEX_ITEM_VALUES: [&str; 8] = [
    "flex-1",
    "flex-auto",
    "flex-initial",
    "flex-none",
    "grow",
    "grow-0",
    "shrink",
    "shrink-0",
];
pub(crate) const TEXT_SIZE_VALUES: [(&str, &str); 13] = [
    ("xs", "12"),
    ("sm", "14"),
    ("base", "16"),
    ("lg", "18"),
    ("xl", "20"),
    ("2xl", "24"),
    ("3xl", "30"),
    ("4xl", "36"),
    ("5xl", "48"),
    ("6xl", "60"),
    ("7xl", "72"),
    ("8xl", "96"),
    ("9xl", "128"),
];
pub(crate) const FONT_WEIGHT_VALUES: [(&str, &str); 9] = [
    ("thin", "Thin"),
    ("extralight", "ExtraLight"),
    ("light", "Light"),
    ("normal", "Regular"),
    ("medium", "Medium"),
    ("semibold", "SemiBold"),
    ("bold", "Bold"),
    ("extrabold", "ExtraBold"),
    ("black", "Heavy"),
];
pub(crate) const SHADOW_SIZE_VALUES: [&str; 6] = ["sm", "md", "lg", "xl", "2xl", "none"];
pub(crate) const GRADIENT_DIRECTION_VALUES: [(&str, &str); 8] = [
    ("t", "270"),
    ("tr", "315"),
    ("r", "0"),
    ("br", "45"),
    ("b", "90"),
    ("bl", "135"),
    ("l", "180"),
    ("tl", "225"),
];
pub(crate) const GRADIENT_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "gradient color",
    color_prop: "Color",
    transparency_prop: None,
};
pub(crate) const SHADOW_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "shadow color",
    color_prop: "Color",
    transparency_prop: Some("Transparency"),
};
pub(crate) const TEXT_X_ALIGN_VALUES: [(&str, &str); 3] = [
    ("left", "Enum.TextXAlignment.Left"),
    ("center", "Enum.TextXAlignment.Center"),
    ("right", "Enum.TextXAlignment.Right"),
];
pub(crate) const TEXT_Y_ALIGN_VALUES: [(&str, &str); 3] = [
    ("top", "Enum.TextYAlignment.Top"),
    ("middle", "Enum.TextYAlignment.Center"),
    ("bottom", "Enum.TextYAlignment.Bottom"),
];
pub(crate) const TEXT_WRAP_VALUES: [&str; 2] = ["wrap", "nowrap"];
pub(crate) const DEFAULT_FONT_FAMILY: &str = "rbxasset://fonts/families/SourceSansPro.json";
pub(crate) const ALIGN_CONTENT_VALUES: [&str; 7] = [
    "start", "center", "end", "between", "around", "evenly", "stretch",
];
pub(crate) const ALIGN_SELF_VALUES: [(&str, &str); 5] = [
    ("auto", "Automatic"),
    ("start", "Start"),
    ("center", "Center"),
    ("end", "End"),
    ("stretch", "Stretch"),
];
pub(crate) const LINE_HEIGHT_VALUES: [(&str, &str); 6] = [
    ("none", "1"),
    ("tight", "1.25"),
    ("snug", "1.375"),
    ("normal", "1.5"),
    ("relaxed", "1.625"),
    ("loose", "2"),
];
pub(crate) const LAYOUT_ORDER_KEYWORDS: [(&str, &str); 3] =
    [("first", "-9999"), ("last", "9999"), ("none", "0")];
pub(crate) const FONT_STYLE_VALUES: [(&str, &str); 2] =
    [("italic", "Italic"), ("not-italic", "Normal")];
pub(crate) const GRID_CELL_COUNT_MAX: u32 = 12;
pub(crate) const OBJECT_FIT_VALUES: [(&str, &str); 4] = [
    ("cover", "Crop"),
    ("contain", "Fit"),
    ("fill", "Stretch"),
    // Roblox-only extension; Tailwind has no tiling object fit.
    ("tile", "Tile"),
];
pub(crate) const POINTER_EVENTS_VALUES: [(&str, &str); 2] = [("none", "false"), ("auto", "true")];
pub(crate) const WHITESPACE_VALUES: [(&str, &str); 2] = [("normal", "true"), ("nowrap", "false")];
pub(crate) const OVERSCROLL_VALUES: [(&str, &str); 3] = [
    ("auto", "Always"),
    ("contain", "WhenScrollable"),
    ("none", "Never"),
];
/// `scroll-none` turns scrolling off outright, so it carries `ScrollingEnabled`
/// instead of a `ScrollingDirection` member.
pub(crate) const SCROLL_DIRECTION_VALUES: [(&str, &str); 3] =
    [("x", "X"), ("y", "Y"), ("xy", "XY")];
pub(crate) const CANVAS_SIZE_VALUES: [(&str, &str); 4] = [
    ("auto", "XY"),
    ("auto-x", "X"),
    ("auto-y", "Y"),
    ("none", "None"),
];
pub(crate) const SCROLLBAR_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "scrollbar color",
    color_prop: "ScrollBarImageColor3",
    transparency_prop: Some("ScrollBarImageTransparency"),
};
pub(crate) const RING_THICKNESS_VALUES: [&str; 5] = ["0", "1", "2", "4", "8"];
/// `shadow` is missing on purpose: a shadow lives on a helper instance, which
/// applies instantly, so there would be nothing for the filter to hold back.
pub(crate) const TRANSITION_PROPERTY_VALUES: [&str; 4] = ["all", "colors", "opacity", "transform"];
pub(crate) const DURATION_PRESET_VALUES: [&str; 8] =
    ["75", "100", "150", "200", "300", "500", "700", "1000"];
pub(crate) const EASE_VALUES: [(&str, &str, &str); 4] = [
    ("linear", "Linear", "InOut"),
    ("in", "Quad", "In"),
    ("out", "Quad", "Out"),
    ("in-out", "Quad", "InOut"),
];
pub(crate) const DEFAULT_TRANSITION_TIME: f64 = 0.15;
pub(crate) const TEXT_TRANSFORM_VALUES: [(&str, &str); 4] = [
    ("uppercase", "upper"),
    ("lowercase", "lower"),
    ("capitalize", "capitalize"),
    ("normal-case", "none"),
];
pub(crate) const TEXT_DECORATION_VALUES: [(&str, &str); 3] = [
    ("underline", "underline"),
    ("line-through", "strike"),
    ("no-underline", "none"),
];
pub(crate) const ANIMATION_VALUES: [(&str, &str); 4] = [
    ("spin", "Loop Rotation a full turn every second."),
    ("pulse", "Fade BackgroundTransparency toward 0.5 and back."),
    ("bounce", "Bob the element up by a quarter of its height."),
    ("none", "Stop the preset animation."),
];
pub(crate) const RING_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "ring color",
    color_prop: "Color",
    transparency_prop: Some("Transparency"),
};
pub(crate) const OUTLINE_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "outline color",
    color_prop: "Color",
    transparency_prop: Some("Transparency"),
};
pub(crate) const DIVIDE_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "divide color",
    color_prop: "BackgroundColor3",
    transparency_prop: None,
};
pub(crate) const ANCHOR_ORIGIN_VALUES: [(&str, &str, &str); 9] = [
    ("top-left", "0", "0"),
    ("top", "0.5", "0"),
    ("top-right", "1", "0"),
    ("left", "0", "0.5"),
    ("center", "0.5", "0.5"),
    ("right", "1", "0.5"),
    ("bottom-left", "0", "1"),
    ("bottom", "0.5", "1"),
    ("bottom-right", "1", "1"),
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedUtility {
    pub(crate) raw: String,
    pub(crate) family: String,
    pub(crate) payload: Option<String>,
    pub(crate) kind: UtilityKind,
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
                    // `slate-DEFAULT` is not a class; the DEFAULT shade is what
                    // a bare `slate` resolves to.
                    if shade == PALETTE_DEFAULT_KEY {
                        push_unique(&mut keys, name.clone());
                        continue;
                    }

                    push_unique(&mut keys, format!("{name}-{shade}"));
                }
            }
        }
    }
    keys
}

pub(crate) fn radius_completion_keys(config: &TailwindConfig) -> Vec<String> {
    config.theme.radius.keys().cloned().collect()
}

pub(crate) fn spacing_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = config.theme.spacing.keys().cloned().collect::<Vec<_>>();
    for key in [
        "0", "0.5", "1", "1.5", "2", "3", "4", "6", "8", "12", "16", "20", "24", "32", "40", "64",
        "80",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

pub(crate) fn size_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = spacing_completion_keys(config);
    for key in [
        "px", "full", "auto", "fit", "1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5",
        "1/6", "5/6", "1/12", "5/12", "11/12",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

pub(crate) fn is_automatic_size_key(key: &str) -> bool {
    matches!(key, "auto" | "fit")
}

pub(crate) fn position_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = spacing_completion_keys(config);
    for key in [
        "px", "full", "1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

impl UtilityKind {
    pub(crate) fn needs_config_lookup(&self) -> bool {
        matches!(
            self,
            UtilityKind::BackgroundColor
                | UtilityKind::TextColor
                | UtilityKind::ImageColor
                | UtilityKind::PlaceholderColor
                | UtilityKind::Border
                | UtilityKind::Radius(_)
                | UtilityKind::Padding(_)
                | UtilityKind::Gap
                | UtilityKind::GridAutoRows
                | UtilityKind::GridAutoColumns
                | UtilityKind::Width
                | UtilityKind::Height
                | UtilityKind::Size
                | UtilityKind::PositionX
                | UtilityKind::PositionY
                | UtilityKind::PositionRight
                | UtilityKind::PositionBottom
                | UtilityKind::Inset
                | UtilityKind::Basis
                | UtilityKind::TranslateX
                | UtilityKind::TranslateY
                | UtilityKind::SpaceX
                | UtilityKind::SpaceY
                | UtilityKind::Ring
                | UtilityKind::Outline
                | UtilityKind::Margin(_)
                | UtilityKind::DivideColor
                | UtilityKind::MinWidth
                | UtilityKind::MaxWidth
                | UtilityKind::MinHeight
                | UtilityKind::MaxHeight
                | UtilityKind::ShadowColor
                | UtilityKind::ScrollbarThickness
                | UtilityKind::ScrollbarColor
                | UtilityKind::FontFamily
                | UtilityKind::GradientFrom
                | UtilityKind::GradientVia
                | UtilityKind::GradientTo
        )
    }
}

/// `None` means the element is a component, whose Roblox host element is not
/// known at this point, so every utility stays available.
pub(crate) fn is_utility_allowed_on_host(element_tag: Option<&str>, kind: &UtilityKind) -> bool {
    let Some(element_tag) = element_tag else {
        return true;
    };

    match kind {
        UtilityKind::TextColor
        | UtilityKind::TextSize
        | UtilityKind::FontWeight
        | UtilityKind::FontFamily
        | UtilityKind::FontStyle
        | UtilityKind::TextXAlignment
        | UtilityKind::TextYAlignment
        | UtilityKind::TextWrap
        | UtilityKind::TextTruncate
        | UtilityKind::LineHeight
        | UtilityKind::Whitespace
        | UtilityKind::TextTransform
        | UtilityKind::TextDecoration => {
            matches!(element_tag, "textlabel" | "textbutton" | "textbox")
        }
        UtilityKind::ImageColor | UtilityKind::ObjectFit => {
            matches!(element_tag, "imagelabel" | "imagebutton")
        }
        UtilityKind::PlaceholderColor => element_tag == "textbox",
        UtilityKind::Overscroll
        | UtilityKind::ScrollDirection
        | UtilityKind::ScrollbarThickness
        | UtilityKind::ScrollbarColor
        | UtilityKind::CanvasSize => element_tag == "scrollingframe",
        _ => true,
    }
}

pub(crate) fn parse_utility(token: &str) -> ParsedUtility {
    if token.starts_with("-z-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "z".to_owned(),
            payload: token.strip_prefix("-z-").map(|value| value.to_owned()),
            kind: UtilityKind::ZIndex,
        };
    }

    if let Some(value) = token.strip_prefix("-rotate-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "rotate".to_owned(),
            payload: Some(value.to_owned()),
            kind: UtilityKind::Rotation,
        };
    }

    for (prefix, family, kind) in [
        ("-top-", "top", UtilityKind::PositionY),
        ("-left-", "left", UtilityKind::PositionX),
        ("-right-", "right", UtilityKind::PositionRight),
        ("-bottom-", "bottom", UtilityKind::PositionBottom),
        ("-inset-", "inset", UtilityKind::Inset),
        ("-order-", "order", UtilityKind::LayoutOrder),
        ("-translate-x-", "translate", UtilityKind::TranslateX),
        ("-translate-y-", "translate", UtilityKind::TranslateY),
        ("-mx-", "mx", UtilityKind::Margin(PaddingKind::X)),
        ("-my-", "my", UtilityKind::Margin(PaddingKind::Y)),
        ("-mt-", "mt", UtilityKind::Margin(PaddingKind::Top)),
        ("-mr-", "mr", UtilityKind::Margin(PaddingKind::Right)),
        ("-mb-", "mb", UtilityKind::Margin(PaddingKind::Bottom)),
        ("-ml-", "ml", UtilityKind::Margin(PaddingKind::Left)),
        ("-m-", "m", UtilityKind::Margin(PaddingKind::All)),
    ] {
        if let Some(value) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: family.to_owned(),
                payload: Some(value.to_owned()),
                kind,
            };
        }
    }

    if token == "border" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "border".to_owned(),
            payload: None,
            kind: UtilityKind::Border,
        };
    }

    if token == "grid" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "grid".to_owned(),
            payload: None,
            kind: UtilityKind::Grid,
        };
    }

    // `scrollbar-none` hides the bar by zeroing its thickness, so it belongs to
    // the thickness family rather than the color one it looks like.
    if let Some(payload) = token
        .strip_prefix("scrollbar-w-")
        .or_else(|| (token == "scrollbar-none").then_some("none"))
    {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "scrollbar".to_owned(),
            payload: Some(payload.to_owned()),
            kind: UtilityKind::ScrollbarThickness,
        };
    }

    for (exact, kind) in [
        ("ring", UtilityKind::Ring),
        ("outline", UtilityKind::Outline),
        ("mx-auto", UtilityKind::CenterX),
        ("my-auto", UtilityKind::CenterY),
        ("transition", UtilityKind::Transition),
        ("divide-x", UtilityKind::DivideX),
        ("divide-y", UtilityKind::DivideY),
    ] {
        if token == exact {
            return ParsedUtility {
                raw: token.to_owned(),
                family: exact
                    .split_once('-')
                    .map_or(exact, |(family, _)| family)
                    .to_owned(),
                payload: None,
                kind,
            };
        }
    }

    for (exact, kind) in [
        ("rounded", RadiusKind::All),
        ("rounded-t", RadiusKind::Top),
        ("rounded-r", RadiusKind::Right),
        ("rounded-b", RadiusKind::Bottom),
        ("rounded-l", RadiusKind::Left),
        ("rounded-tl", RadiusKind::TopLeft),
        ("rounded-tr", RadiusKind::TopRight),
        ("rounded-bl", RadiusKind::BottomLeft),
        ("rounded-br", RadiusKind::BottomRight),
    ] {
        if token == exact {
            return ParsedUtility {
                raw: token.to_owned(),
                family: exact.to_owned(),
                payload: Some(PALETTE_DEFAULT_KEY.to_owned()),
                kind: UtilityKind::Radius(kind),
            };
        }
    }

    if token == "truncate" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "truncate".to_owned(),
            payload: None,
            kind: UtilityKind::TextTruncate,
        };
    }

    if FONT_STYLE_VALUES.iter().any(|(name, _)| *name == token) {
        return ParsedUtility {
            raw: token.to_owned(),
            family: token.to_owned(),
            payload: Some(token.to_owned()),
            kind: UtilityKind::FontStyle,
        };
    }

    if TEXT_TRANSFORM_VALUES.iter().any(|(name, _)| *name == token) {
        return ParsedUtility {
            raw: token.to_owned(),
            family: token.to_owned(),
            payload: Some(token.to_owned()),
            kind: UtilityKind::TextTransform,
        };
    }

    if TEXT_DECORATION_VALUES
        .iter()
        .any(|(name, _)| *name == token)
    {
        return ParsedUtility {
            raw: token.to_owned(),
            family: token.to_owned(),
            payload: Some(token.to_owned()),
            kind: UtilityKind::TextDecoration,
        };
    }

    if let Some(payload) = token.strip_prefix("text-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "text".to_owned(),
            payload: Some(payload.to_owned()),
            kind: classify_text_utility(payload),
        };
    }

    for prefix in ["bg-gradient-to-", "bg-linear-to-"] {
        if let Some(dir) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: "gradient".to_owned(),
                payload: Some(dir.to_owned()),
                kind: UtilityKind::GradientDirection,
            };
        }
    }

    if token == "shadow" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "shadow".to_owned(),
            payload: None,
            kind: UtilityKind::ShadowSize,
        };
    }

    if let Some(payload) = token.strip_prefix("shadow-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "shadow".to_owned(),
            payload: Some(payload.to_owned()),
            kind: classify_shadow_utility(payload),
        };
    }

    if token == "flex" {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "flex".to_owned(),
            payload: None,
            kind: UtilityKind::FlexDirection,
        };
    }

    if matches!(token, "flex-wrap" | "flex-nowrap") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "flex".to_owned(),
            payload: token.strip_prefix("flex-").map(|value| value.to_owned()),
            kind: UtilityKind::FlexWrap,
        };
    }

    if FLEX_ITEM_VALUES.contains(&token) {
        return ParsedUtility {
            raw: token.to_owned(),
            family: token
                .split_once('-')
                .map_or("flex", |(family, _)| family)
                .to_owned(),
            payload: Some(token.to_owned()),
            kind: UtilityKind::FlexItem,
        };
    }

    if matches!(token, "hidden" | "visible") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: token.to_owned(),
            payload: Some(token.to_owned()),
            kind: UtilityKind::Visibility,
        };
    }

    // `font-*` carries both the weight scale and the theme's font families, the
    // way Tailwind does; the fixed weight names win and anything else is read as
    // a theme key.
    if let Some(payload) = token.strip_prefix("font-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "font".to_owned(),
            payload: Some(payload.to_owned()),
            kind: if resolve_font_weight_enum(payload).is_some() {
                UtilityKind::FontWeight
            } else {
                UtilityKind::FontFamily
            },
        };
    }

    for (prefix, kind) in UTILITY_PREFIXES {
        if let Some(payload) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: prefix.trim_end_matches('-').to_owned(),
                payload: Some(payload.to_owned()),
                kind,
            };
        }
    }

    ParsedUtility {
        raw: token.to_owned(),
        family: token
            .split_once('-')
            .map(|(family, _)| family)
            .unwrap_or(token)
            .to_owned(),
        payload: token.split_once('-').map(|(_, payload)| payload.to_owned()),
        kind: UtilityKind::Unknown,
    }
}

/// Every prefixed family, in match order — `top-` has to win over `to-`, and a
/// shorter prefix must never shadow a longer one that starts the same way.
pub(crate) const UTILITY_PREFIXES: [(&str, UtilityKind); 84] = [
    ("bg-", UtilityKind::BackgroundColor),
    ("align-", UtilityKind::TextYAlignment),
    ("image-", UtilityKind::ImageColor),
    ("placeholder-", UtilityKind::PlaceholderColor),
    ("border-", UtilityKind::Border),
    ("rounded-tl-", UtilityKind::Radius(RadiusKind::TopLeft)),
    ("rounded-tr-", UtilityKind::Radius(RadiusKind::TopRight)),
    ("rounded-bl-", UtilityKind::Radius(RadiusKind::BottomLeft)),
    ("rounded-br-", UtilityKind::Radius(RadiusKind::BottomRight)),
    ("rounded-t-", UtilityKind::Radius(RadiusKind::Top)),
    ("rounded-r-", UtilityKind::Radius(RadiusKind::Right)),
    ("rounded-b-", UtilityKind::Radius(RadiusKind::Bottom)),
    ("rounded-l-", UtilityKind::Radius(RadiusKind::Left)),
    ("rounded-", UtilityKind::Radius(RadiusKind::All)),
    ("z-", UtilityKind::ZIndex),
    ("p-", UtilityKind::Padding(PaddingKind::All)),
    ("px-", UtilityKind::Padding(PaddingKind::X)),
    ("py-", UtilityKind::Padding(PaddingKind::Y)),
    ("pt-", UtilityKind::Padding(PaddingKind::Top)),
    ("pr-", UtilityKind::Padding(PaddingKind::Right)),
    ("pb-", UtilityKind::Padding(PaddingKind::Bottom)),
    ("pl-", UtilityKind::Padding(PaddingKind::Left)),
    ("gap-", UtilityKind::Gap),
    ("mx-", UtilityKind::Margin(PaddingKind::X)),
    ("my-", UtilityKind::Margin(PaddingKind::Y)),
    ("mt-", UtilityKind::Margin(PaddingKind::Top)),
    ("mr-", UtilityKind::Margin(PaddingKind::Right)),
    ("mb-", UtilityKind::Margin(PaddingKind::Bottom)),
    ("ml-", UtilityKind::Margin(PaddingKind::Left)),
    ("m-", UtilityKind::Margin(PaddingKind::All)),
    ("min-w-", UtilityKind::MinWidth),
    ("max-w-", UtilityKind::MaxWidth),
    ("min-h-", UtilityKind::MinHeight),
    ("max-h-", UtilityKind::MaxHeight),
    ("w-", UtilityKind::Width),
    ("h-", UtilityKind::Height),
    ("size-", UtilityKind::Size),
    ("overflow-", UtilityKind::Overflow),
    ("rotate-", UtilityKind::Rotation),
    ("scale-", UtilityKind::Scale),
    ("opacity-", UtilityKind::Opacity),
    ("aspect-", UtilityKind::AspectRatio),
    ("flex-", UtilityKind::FlexDirection),
    ("justify-", UtilityKind::JustifyContent),
    ("items-", UtilityKind::AlignItems),
    ("from-", UtilityKind::GradientFrom),
    ("via-", UtilityKind::GradientVia),
    // `top-` must come before `to-`, which would otherwise swallow it.
    ("top-", UtilityKind::PositionY),
    ("to-", UtilityKind::GradientTo),
    ("left-", UtilityKind::PositionX),
    ("right-", UtilityKind::PositionRight),
    ("bottom-", UtilityKind::PositionBottom),
    ("inset-", UtilityKind::Inset),
    ("origin-", UtilityKind::AnchorPoint),
    ("content-", UtilityKind::AlignContent),
    ("self-", UtilityKind::AlignSelf),
    ("order-", UtilityKind::LayoutOrder),
    ("leading-", UtilityKind::LineHeight),
    ("grid-cols-", UtilityKind::GridColumns),
    ("grid-rows-", UtilityKind::GridRows),
    ("auto-rows-", UtilityKind::GridAutoRows),
    ("auto-cols-", UtilityKind::GridAutoColumns),
    ("basis-", UtilityKind::Basis),
    ("translate-x-", UtilityKind::TranslateX),
    ("translate-y-", UtilityKind::TranslateY),
    ("object-", UtilityKind::ObjectFit),
    ("pointer-events-", UtilityKind::PointerEvents),
    ("space-x-", UtilityKind::SpaceX),
    ("space-y-", UtilityKind::SpaceY),
    ("whitespace-", UtilityKind::Whitespace),
    ("overscroll-", UtilityKind::Overscroll),
    ("scrollbar-", UtilityKind::ScrollbarColor),
    ("scroll-", UtilityKind::ScrollDirection),
    ("canvas-", UtilityKind::CanvasSize),
    ("ring-", UtilityKind::Ring),
    ("outline-", UtilityKind::Outline),
    ("divide-x-", UtilityKind::DivideX),
    ("divide-y-", UtilityKind::DivideY),
    ("divide-", UtilityKind::DivideColor),
    ("transition-", UtilityKind::Transition),
    ("duration-", UtilityKind::TransitionDuration),
    ("ease-", UtilityKind::TransitionEase),
    ("delay-", UtilityKind::TransitionDelay),
    ("animate-", UtilityKind::Animation),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ShadowPreset {
    pub(crate) blur: u32,
    pub(crate) offset_y: u32,
    pub(crate) spread: i32,
    pub(crate) transparency: &'static str,
}

fn classify_shadow_utility(payload: &str) -> UtilityKind {
    if SHADOW_SIZE_VALUES.contains(&payload) || payload == "inner" {
        UtilityKind::ShadowSize
    } else {
        UtilityKind::ShadowColor
    }
}

pub(crate) fn resolve_gradient_rotation(direction: &str) -> Option<&'static str> {
    lookup_table(&GRADIENT_DIRECTION_VALUES, direction)
}

pub(crate) fn resolve_shadow_preset(key: Option<&str>) -> Option<ShadowPreset> {
    let (blur, offset_y, spread, transparency) = match key {
        None => (3, 1, 0, "0.9"),
        Some("sm") => (2, 1, 0, "0.95"),
        Some("md") => (6, 4, -1, "0.9"),
        Some("lg") => (15, 10, -3, "0.9"),
        Some("xl") => (25, 20, -5, "0.9"),
        Some("2xl") => (50, 25, -12, "0.75"),
        _ => return None,
    };

    Some(ShadowPreset {
        blur,
        offset_y,
        spread,
        transparency,
    })
}

fn classify_text_utility(payload: &str) -> UtilityKind {
    if TEXT_SIZE_VALUES.iter().any(|(key, _)| *key == payload) {
        UtilityKind::TextSize
    } else if TEXT_X_ALIGN_VALUES.iter().any(|(key, _)| *key == payload) || payload == "justify" {
        UtilityKind::TextXAlignment
    } else if TEXT_WRAP_VALUES.contains(&payload) {
        UtilityKind::TextWrap
    } else if parse_arbitrary_length(payload).is_some() {
        // `text-[#f00]` stays a color; only a number reads as a size.
        UtilityKind::TextSize
    } else {
        UtilityKind::TextColor
    }
}

fn lookup_table(table: &[(&'static str, &'static str)], key: &str) -> Option<&'static str> {
    table
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(_, value)| *value)
}

pub(crate) fn resolve_text_size_value(config: &TailwindConfig, key: &str) -> Option<String> {
    if let Some(size) = parse_arbitrary_length(key) {
        return Some(size.offset(config));
    }

    lookup_table(&TEXT_SIZE_VALUES, key).map(str::to_owned)
}

pub(crate) fn resolve_font_weight_enum(key: &str) -> Option<&'static str> {
    lookup_table(&FONT_WEIGHT_VALUES, key)
}

pub(crate) fn resolve_font_weight_value(key: &str) -> Option<String> {
    resolve_font_weight_enum(key).map(|weight| font_face_expression(None, Some(weight), None))
}

pub(crate) fn resolve_font_family_value(config: &TailwindConfig, key: &str) -> Option<String> {
    config.theme.font_family.get(key).cloned()
}

pub(crate) fn font_family_completion_keys(config: &TailwindConfig) -> Vec<String> {
    config.theme.font_family.keys().cloned().collect()
}

pub(crate) fn font_face_expression(
    family: Option<&str>,
    weight: Option<&str>,
    style: Option<&str>,
) -> String {
    let family = family.unwrap_or(DEFAULT_FONT_FAMILY);
    let weight = weight.unwrap_or("Regular");
    match style.filter(|style| *style != "Normal") {
        Some(style) => {
            format!("new Font(\"{family}\", Enum.FontWeight.{weight}, Enum.FontStyle.{style})")
        }
        None => format!("new Font(\"{family}\", Enum.FontWeight.{weight})"),
    }
}

pub(crate) fn resolve_text_x_alignment_value(key: &str) -> Option<String> {
    lookup_table(&TEXT_X_ALIGN_VALUES, key).map(str::to_owned)
}

pub(crate) fn resolve_text_y_alignment_value(key: &str) -> Option<String> {
    lookup_table(&TEXT_Y_ALIGN_VALUES, key).map(str::to_owned)
}

pub(crate) fn resolve_text_wrap_value(key: &str) -> Option<&'static str> {
    match key {
        "wrap" => Some("true"),
        "nowrap" => Some("false"),
        _ => None,
    }
}

pub(crate) fn resolve_visibility_value(key: &str) -> Option<&'static str> {
    match key {
        "hidden" => Some("false"),
        "visible" => Some("true"),
        _ => None,
    }
}

pub(crate) fn resolve_overflow_value(key: &str) -> Option<&'static str> {
    match key {
        "hidden" | "clip" => Some("true"),
        "visible" => Some("false"),
        _ => None,
    }
}

pub(crate) fn resolve_flex_wrap_value(key: &str) -> Option<&'static str> {
    match key {
        "wrap" => Some("true"),
        "nowrap" => Some("false"),
        _ => None,
    }
}

/// The thickness itself rather than the pixels it comes to, so a caller without
/// a config — the analyzer, deciding only whether the payload is supported —
/// can still ask.
pub(crate) fn resolve_border_thickness_value(payload: Option<&str>) -> Option<Length> {
    match payload {
        None => Some(Length::Pixels(1.0)),
        Some("0") => Some(Length::Pixels(0.0)),
        Some("1") => Some(Length::Pixels(1.0)),
        Some("2") => Some(Length::Pixels(2.0)),
        Some("4") => Some(Length::Pixels(4.0)),
        Some(value) => parse_arbitrary_length(value),
    }
}

pub(crate) fn is_known_unsupported_border_payload(payload: &str) -> bool {
    if payload.is_empty() {
        return false;
    }

    if matches!(payload, "dashed" | "solid" | "dotted" | "double") {
        return true;
    }

    if matches!(payload, "x" | "y" | "t" | "r" | "b" | "l") {
        return true;
    }

    if payload.starts_with("x-")
        || payload.starts_with("y-")
        || payload.starts_with("t-")
        || payload.starts_with("r-")
        || payload.starts_with("b-")
        || payload.starts_with("l-")
    {
        return true;
    }

    if payload.starts_with("opacity-") {
        return true;
    }

    // A trailing `/N` lowers to `UIStroke.Transparency`; any other slash is a
    // Tailwind shape this family does not implement.
    let (payload, opacity) = split_color_opacity(payload);
    if opacity.is_none() && payload.contains('/') {
        return true;
    }

    if payload.parse::<f64>().is_ok() {
        return !BORDER_THICKNESS_VALUES.contains(&payload);
    }

    false
}

/// Splits a trailing `/N` opacity modifier off a color payload. Only a 0-100
/// integer counts; anything else stays part of the key.
pub(crate) fn split_color_opacity(payload: &str) -> (&str, Option<u32>) {
    if let Some((base, modifier)) = payload.rsplit_once('/')
        && let Ok(percent) = modifier.parse::<u32>()
        && percent <= 100
    {
        return (base, Some(percent));
    }

    (payload, None)
}

/// `[#rgb]` / `[#rrggbb]` arbitrary color payloads.
pub(crate) fn parse_arbitrary_color(payload: &str) -> Option<String> {
    let inner = payload.strip_prefix('[')?.strip_suffix(']')?;
    let hex = inner.strip_prefix('#')?;

    let (red, green, blue) = match hex.len() {
        3 => {
            let mut channels = hex.chars().map(|ch| ch.to_digit(16).map(|d| d * 17));
            (channels.next()??, channels.next()??, channels.next()??)
        }
        6 => (
            u32::from_str_radix(&hex[0..2], 16).ok()?,
            u32::from_str_radix(&hex[2..4], 16).ok()?,
            u32::from_str_radix(&hex[4..6], 16).ok()?,
        ),
        _ => return None,
    };

    Some(format!("Color3.fromRGB({red}, {green}, {blue})"))
}

pub(crate) fn resolve_color_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spec: ColorFamilySpec,
    color_key: &str,
    token: &str,
) -> Option<ColorResolution> {
    if color_key.starts_with('[') && color_key.ends_with(']') {
        return match parse_arbitrary_color(color_key) {
            Some(value) => Some(ColorResolution::Expression(value)),
            None => {
                diagnostics.push(unsupported_arbitrary_value_diagnostic(color_key, token));
                None
            }
        };
    }

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
            Some(ColorValue::Palette(scale)) => match scale.get(PALETTE_DEFAULT_KEY) {
                Some(value) => Some(ColorResolution::Expression(value.clone())),
                None => {
                    diagnostics.push(color_requires_shade_diagnostic(
                        spec.theme_family,
                        color_name,
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

/// A length before the theme turns it into pixels. `px` and a unitless number
/// already are pixels, matching Tailwind's own `w-[120]`-style shorthand; `rem`
/// is the unit the viewport scales by, so it only becomes a number once
/// `theme.rem.base` is known.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Length {
    Pixels(f64),
    Rem(f64),
}

impl Length {
    pub(crate) fn pixels(self, config: &TailwindConfig) -> f64 {
        match self {
            Self::Pixels(pixels) => pixels,
            Self::Rem(rem) => rem * config.theme.rem.base,
        }
    }

    pub(crate) fn offset(self, config: &TailwindConfig) -> String {
        format_number(self.pixels(config))
    }
}

/// A `[...]` payload, already split into the two shapes a Roblox `UDim` axis
/// can take.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum ArbitraryValue {
    Length(Length),
    Scale(f64),
}

pub(crate) fn parse_arbitrary_value(payload: &str) -> Option<ArbitraryValue> {
    let inner = payload.strip_prefix('[')?.strip_suffix(']')?.trim();
    if inner.is_empty() {
        return None;
    }

    if let Some(percent) = inner.strip_suffix('%') {
        return parse_finite(percent).map(|value| ArbitraryValue::Scale(value / 100.0));
    }

    parse_length(inner).map(ArbitraryValue::Length)
}

/// The `[...]` payload of a family that only counts in pixels — a thickness, a
/// text size — where a percentage would have nothing to be a fraction of.
pub(crate) fn parse_arbitrary_length(payload: &str) -> Option<Length> {
    parse_length(payload.strip_prefix('[')?.strip_suffix(']')?.trim())
}

fn parse_length(value: &str) -> Option<Length> {
    if let Some(rem) = value.strip_suffix("rem") {
        return parse_finite(rem).map(Length::Rem);
    }

    parse_finite(value.strip_suffix("px").unwrap_or(value)).map(Length::Pixels)
}

/// The plain number behind a `[...]` payload, for families that count in
/// something other than pixels — degrees, line height multiples, `ZIndex`.
pub(crate) fn parse_arbitrary_number(payload: &str, unit: &str) -> Option<f64> {
    let inner = payload.strip_prefix('[')?.strip_suffix(']')?.trim();
    parse_finite(inner.strip_suffix(unit).unwrap_or(inner))
}

fn parse_finite(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }

    let parsed = value.parse::<f64>().ok()?;
    parsed.is_finite().then_some(parsed)
}

pub(crate) fn format_number(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    value.to_string()
}

fn arbitrary_udim(config: &TailwindConfig, value: ArbitraryValue) -> String {
    match value {
        ArbitraryValue::Length(length) => format!("new UDim(0, {})", length.offset(config)),
        ArbitraryValue::Scale(scale) => format!("new UDim({}, 0)", format_number(scale)),
    }
}

fn arbitrary_size_axis(config: &TailwindConfig, value: ArbitraryValue) -> SizeAxisValue {
    match value {
        ArbitraryValue::Length(length) => SizeAxisValue::offset(length.offset(config)),
        ArbitraryValue::Scale(scale) => SizeAxisValue::scale(format_number(scale)),
    }
}

pub(crate) fn resolve_radius_value(config: &TailwindConfig, key: &str) -> Option<String> {
    if let Some(value) = parse_arbitrary_value(key) {
        return Some(arbitrary_udim(config, value));
    }

    config.theme.radius.get(key).cloned()
}

pub(crate) fn resolve_spacing_value(config: &TailwindConfig, key: &str) -> Option<String> {
    if let Some(value) = parse_arbitrary_value(key) {
        return Some(arbitrary_udim(config, value));
    }

    config
        .theme
        .spacing
        .get(key)
        .cloned()
        .or_else(|| resolve_numeric_spacing_value(key))
}

pub(crate) fn resolve_size_axis_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    size_key: &str,
    token: &str,
) -> Option<SizeAxisValue> {
    if let Some(value) = parse_arbitrary_value(size_key) {
        return Some(arbitrary_size_axis(config, value));
    }

    if size_key == "px" {
        return Some(SizeAxisValue::offset("1"));
    }

    if size_key == "full" {
        return Some(SizeAxisValue::scale("1"));
    }

    if let Some(fraction) = resolve_size_fraction_scale(size_key) {
        return Some(SizeAxisValue::scale(fraction));
    }

    resolve_size_spacing_offset(config, diagnostics, size_key, token).map(SizeAxisValue::offset)
}

pub(crate) fn resolve_position_axis_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    position_key: &str,
    token: &str,
    negative: bool,
) -> Option<SizeAxisValue> {
    let base = resolve_size_axis_value(config, diagnostics, position_key, token)?;

    Some(if negative {
        negate_size_axis(base)
    } else {
        base
    })
}

pub(crate) fn resolve_anchor_point_value(key: &str) -> Option<String> {
    let (_, x, y) = ANCHOR_ORIGIN_VALUES
        .iter()
        .find(|(name, _, _)| *name == key)?;

    Some(format!("new Vector2({x}, {y})"))
}

fn negate_size_axis(value: SizeAxisValue) -> SizeAxisValue {
    SizeAxisValue {
        scale: negate_number(value.scale),
        offset: negate_number(value.offset),
    }
}

fn negate_number(value: String) -> String {
    if value == "0" {
        value
    } else if let Some(rest) = value.strip_prefix('-') {
        rest.to_owned()
    } else {
        format!("-{value}")
    }
}

pub(crate) fn resolve_size_spacing_offset(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
) -> Option<String> {
    let Some(value) = resolve_spacing_value(config, spacing_key) else {
        diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
        return None;
    };

    if let Some(offset) = spacing_value_to_offset(&value) {
        return Some(offset);
    }

    diagnostics.push(unsupported_size_spacing_value_diagnostic(&value, token));
    None
}

pub(crate) fn resolve_size_fraction_scale(key: &str) -> Option<String> {
    let (numerator, denominator) = key.split_once('/')?;
    let numerator = numerator.parse::<u32>().ok()?;
    let denominator = denominator.parse::<u32>().ok()?;

    let is_supported = match denominator {
        2 => numerator == 1,
        3 => matches!(numerator, 1 | 2),
        4 => matches!(numerator, 1 | 3),
        5 => (1..=4).contains(&numerator),
        6 => matches!(numerator, 1 | 5),
        12 => (1..=11).contains(&numerator),
        _ => false,
    };

    if !is_supported {
        return None;
    }

    Some(format_ratio(f64::from(numerator) / f64::from(denominator)))
}

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
        // `ZIndex` is an integer, so a fractional arbitrary value would round
        // silently instead of doing what the class says.
        match parse_arbitrary_number(z_key, "").filter(|value| value.fract() == 0.0) {
            Some(value) => return Some(format_number(value)),
            None => {
                diagnostics.push(unsupported_arbitrary_z_index_diagnostic(token));
                return None;
            }
        }
    }

    if Z_INDEX_VALUES.contains(&z_key) {
        return Some(z_key.to_owned());
    }

    diagnostics.push(unsupported_z_index_value_diagnostic(z_key, token));
    None
}

pub(crate) fn resolve_scale_value(key: &str) -> Option<&'static str> {
    lookup_table(&SCALE_VALUES, key)
}

pub(crate) fn resolve_line_join_value(key: &str) -> Option<&'static str> {
    lookup_table(&BORDER_LINE_JOIN_VALUES, key)
}

pub(crate) fn resolve_rotation_value(degrees: &str, negative: bool) -> Option<String> {
    if let Some(value) = parse_arbitrary_number(degrees, "deg") {
        let value = if negative { -value } else { value };
        return Some(format_number(value));
    }

    if !ROTATION_VALUES.contains(&degrees) {
        return None;
    }

    if negative && degrees != "0" {
        return Some(format!("-{degrees}"));
    }

    Some(degrees.to_owned())
}

pub(crate) fn resolve_opacity_value(percent: &str) -> Option<String> {
    let percent = percent.parse::<u32>().ok()?;
    if percent > 100 {
        return None;
    }

    Some(format_transparency(100 - percent))
}

pub(crate) fn resolve_aspect_ratio_value(key: &str) -> Option<String> {
    let ratio = match key {
        "square" => 1.0,
        "video" => 16.0 / 9.0,
        _ => parse_arbitrary_aspect_ratio(key)?,
    };

    Some(format_ratio(ratio))
}

pub(crate) fn resolve_flex_direction_value(key: Option<&str>) -> Option<String> {
    match key {
        None | Some("row") => Some("Enum.FillDirection.Horizontal".to_owned()),
        Some("col") => Some("Enum.FillDirection.Vertical".to_owned()),
        _ => None,
    }
}

pub(crate) fn resolve_justify_flex_value(key: &str) -> Option<&'static str> {
    lookup_table(&JUSTIFY_FLEX_VALUES, key)
}

pub(crate) fn resolve_items_flex_value(key: &str) -> Option<&'static str> {
    match key {
        "stretch" => Some("Fill"),
        _ => None,
    }
}

pub(crate) fn resolve_flex_item_mode(key: &str) -> Option<&'static str> {
    match key {
        "grow" => Some("Grow"),
        "shrink" | "flex-initial" => Some("Shrink"),
        "flex-1" | "flex-auto" => Some("Fill"),
        "grow-0" | "shrink-0" | "flex-none" => Some("None"),
        _ => None,
    }
}

pub(crate) fn resolve_justify_value(key: &str) -> Option<String> {
    let alignment = match key {
        "start" => "Enum.HorizontalAlignment.Left",
        "center" => "Enum.HorizontalAlignment.Center",
        "end" => "Enum.HorizontalAlignment.Right",
        _ => return None,
    };

    Some(alignment.to_owned())
}

pub(crate) fn resolve_align_items_value(key: &str) -> Option<String> {
    let alignment = match key {
        "start" => "Enum.VerticalAlignment.Top",
        "center" => "Enum.VerticalAlignment.Center",
        "end" => "Enum.VerticalAlignment.Bottom",
        _ => return None,
    };

    Some(alignment.to_owned())
}

pub(crate) fn resolve_align_content_flex_value(key: &str) -> Option<&'static str> {
    match key {
        "between" => Some("SpaceBetween"),
        "around" => Some("SpaceAround"),
        "evenly" => Some("SpaceEvenly"),
        "stretch" => Some("Fill"),
        _ => None,
    }
}

pub(crate) fn resolve_align_self_value(key: &str) -> Option<&'static str> {
    lookup_table(&ALIGN_SELF_VALUES, key)
}

pub(crate) fn resolve_line_height_value(key: &str) -> Option<String> {
    if let Some(height) = parse_arbitrary_number(key, "") {
        return Some(format_number(height));
    }

    resolve_line_height_preset(key).map(|value| value.to_owned())
}

fn resolve_line_height_preset(key: &str) -> Option<&'static str> {
    lookup_table(&LINE_HEIGHT_VALUES, key)
}

pub(crate) fn resolve_font_style_value(key: &str) -> Option<&'static str> {
    lookup_table(&FONT_STYLE_VALUES, key)
}

pub(crate) fn resolve_layout_order_value(key: &str, negative: bool) -> Option<String> {
    if let Some((_, value)) = LAYOUT_ORDER_KEYWORDS.iter().find(|(name, _)| *name == key) {
        return (!negative).then(|| (*value).to_owned());
    }

    let order = key.parse::<i32>().ok()?;
    Some(if negative && order != 0 {
        format!("-{order}")
    } else {
        order.to_string()
    })
}

/// `Some(true)` enables, `Some(false)` disables, `None` is an unknown payload.
/// `None` payload and `all` mean the same thing; a named group narrows which
/// props the tween is allowed to touch.
pub(crate) fn resolve_transition_toggle(payload: Option<&str>) -> Option<(bool, &'static str)> {
    match payload {
        None => Some((true, "all")),
        Some("none") => Some((false, "all")),
        Some(value) => TRANSITION_PROPERTY_VALUES
            .iter()
            .find(|property| **property == value)
            .map(|property| (true, *property)),
    }
}

pub(crate) fn resolve_duration_seconds(key: &str) -> Option<f64> {
    let millis = key.parse::<u32>().ok()?;
    Some(f64::from(millis) / 1000.0)
}

pub(crate) fn resolve_ease_value(key: &str) -> Option<(&'static str, &'static str)> {
    EASE_VALUES
        .iter()
        .find(|(name, _, _)| *name == key)
        .map(|(_, style, direction)| (*style, *direction))
}

pub(crate) fn resolve_text_transform_value(key: &str) -> Option<&'static str> {
    lookup_table(&TEXT_TRANSFORM_VALUES, key)
}

pub(crate) fn resolve_text_decoration_value(key: &str) -> Option<&'static str> {
    lookup_table(&TEXT_DECORATION_VALUES, key)
}

pub(crate) fn resolve_animation_value(key: &str) -> Option<&'static str> {
    ANIMATION_VALUES
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(name, _)| *name)
}

pub(crate) fn resolve_object_fit_value(key: &str) -> Option<&'static str> {
    lookup_table(&OBJECT_FIT_VALUES, key)
}

pub(crate) fn resolve_pointer_events_value(key: &str) -> Option<&'static str> {
    lookup_table(&POINTER_EVENTS_VALUES, key)
}

pub(crate) fn resolve_whitespace_value(key: &str) -> Option<&'static str> {
    lookup_table(&WHITESPACE_VALUES, key)
}

pub(crate) fn resolve_overscroll_value(key: &str) -> Option<&'static str> {
    lookup_table(&OVERSCROLL_VALUES, key)
}

pub(crate) fn resolve_scroll_direction_value(key: &str) -> Option<&'static str> {
    lookup_table(&SCROLL_DIRECTION_VALUES, key)
}

pub(crate) fn resolve_canvas_size_value(key: &str) -> Option<&'static str> {
    lookup_table(&CANVAS_SIZE_VALUES, key)
}

/// `ring`/`outline` payloads with a stroke meaning; anything else falls
/// through to color resolution.
pub(crate) enum StrokePayload {
    Thickness(Length),
    Unsupported,
    Color,
}

pub(crate) fn classify_stroke_payload(kind: &UtilityKind, payload: &str) -> StrokePayload {
    if let Some(thickness) = RING_THICKNESS_VALUES
        .iter()
        .find(|value| **value == payload)
        .and_then(|thickness| parse_finite(thickness))
    {
        return StrokePayload::Thickness(Length::Pixels(thickness));
    }

    if matches!(kind, UtilityKind::Outline) && matches!(payload, "none" | "hidden") {
        return StrokePayload::Thickness(Length::Pixels(0.0));
    }

    if let Some(thickness) = parse_arbitrary_length(payload) {
        return StrokePayload::Thickness(thickness);
    }

    if matches!(payload, "inset" | "solid" | "dashed" | "dotted" | "double")
        || payload.starts_with("offset-")
        || payload.parse::<f64>().is_ok()
    {
        return StrokePayload::Unsupported;
    }

    StrokePayload::Color
}

pub(crate) fn resolve_grid_cell_count(key: &str) -> Option<String> {
    let count = key.parse::<u32>().ok()?;
    ((1..=GRID_CELL_COUNT_MAX).contains(&count)).then(|| count.to_string())
}

/// Re-anchors a `left`/`top`-style axis value to the far edge, mirroring CSS
/// `right`/`bottom`: the resolved distance is measured back from scale 1.
pub(crate) fn end_relative_position_axis(value: SizeAxisValue) -> SizeAxisValue {
    let scale = value.scale.parse::<f64>().unwrap_or(0.0);
    SizeAxisValue {
        scale: format_ratio(1.0 - scale),
        offset: negate_number(value.offset),
    }
}

fn parse_arbitrary_aspect_ratio(key: &str) -> Option<f64> {
    let inner = key.strip_prefix('[')?.strip_suffix(']')?;

    if let Some((width, height)) = inner.split_once('/') {
        let width = width.trim().parse::<f64>().ok()?;
        let height = height.trim().parse::<f64>().ok()?;
        if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
            return None;
        }

        return Some(width / height);
    }

    let value = inner.trim().parse::<f64>().ok()?;
    if !value.is_finite() || value <= 0.0 {
        return None;
    }

    Some(value)
}

fn format_transparency(remainder: u32) -> String {
    if remainder == 0 {
        return "0".to_owned();
    }

    if remainder >= 100 {
        return "1".to_owned();
    }

    if remainder.is_multiple_of(10) {
        return format!("0.{}", remainder / 10);
    }

    format!("0.{remainder:02}")
}

pub(crate) fn format_ratio(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    format!("{value:.10}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
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

/// Palette key a bare family name resolves to, mirroring Tailwind's `DEFAULT`.
pub(crate) const PALETTE_DEFAULT_KEY: &str = "DEFAULT";

pub(crate) fn is_shade_token(value: &str) -> bool {
    matches!(
        value,
        "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950"
    )
}

fn resolve_numeric_spacing_value(key: &str) -> Option<String> {
    if matches!(key.as_bytes().first(), Some(b'-') | Some(b'+')) {
        return None;
    }

    let numeric_key = key.parse::<f64>().ok()?;
    if !numeric_key.is_finite() || numeric_key < 0.0 {
        return None;
    }

    let half_step_units = numeric_key * 2.0;
    if !half_step_units.is_finite() || !is_whole_number(half_step_units) {
        return None;
    }

    let offset_px = numeric_key * 4.0;
    if !offset_px.is_finite() {
        return None;
    }

    Some(format!("new UDim(0, {})", format_number(offset_px)))
}

pub(crate) fn spacing_value_to_offset(value: &str) -> Option<String> {
    let args = value.trim().strip_prefix("new UDim(")?.strip_suffix(')')?;

    let mut parts = args.split(',');
    let scale = parts.next()?.trim().parse::<f64>().ok()?;
    let offset = parts.next()?.trim().parse::<f64>().ok()?;
    if parts.next().is_some() || !scale.is_finite() || !offset.is_finite() {
        return None;
    }

    if scale.abs() >= 1e-9 {
        return None;
    }

    Some(format_number(offset))
}

fn is_whole_number(value: f64) -> bool {
    let rounded = value.round();
    (value - rounded).abs() < 1e-9
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::model::TailwindConfig;

    #[test]
    fn host_allowlist_matches_utility_family() {
        assert!(is_utility_allowed_on_host(
            Some("textbox"),
            &UtilityKind::PlaceholderColor
        ));
        assert!(!is_utility_allowed_on_host(
            Some("frame"),
            &UtilityKind::TextColor
        ));
        assert!(is_utility_allowed_on_host(
            Some("frame"),
            &UtilityKind::BackgroundColor
        ));
    }

    #[test]
    fn components_allow_every_utility_family() {
        assert!(is_utility_allowed_on_host(None, &UtilityKind::TextColor));
        assert!(is_utility_allowed_on_host(None, &UtilityKind::ImageColor));
        assert!(is_utility_allowed_on_host(
            None,
            &UtilityKind::PlaceholderColor
        ));
    }

    #[test]
    fn resolves_shared_semantic_values() {
        let config = TailwindConfig::default();

        let mut diagnostics = Vec::new();
        assert_eq!(
            resolve_z_index_value("10", "z-10", &mut diagnostics),
            Some("10".to_owned())
        );
        assert_eq!(diagnostics.len(), 0);

        assert_eq!(
            resolve_spacing_value(&config, "4"),
            Some("new UDim(0, 16)".to_owned())
        );
    }

    #[test]
    fn bare_palette_name_resolves_through_default() {
        let config = crate::config::defaults::default_config();
        let spec = BACKGROUND_COLOR_FAMILY;

        let mut diagnostics = Vec::new();
        let resolved = resolve_color_value(&config, &mut diagnostics, spec, "slate", "bg-slate");

        assert_eq!(
            resolved,
            Some(ColorResolution::Expression(
                "Color3.fromRGB(98, 116, 142)".to_owned()
            ))
        );
        assert_eq!(diagnostics.len(), 0);
    }

    #[test]
    fn palette_without_default_still_requires_a_shade() {
        let mut config = crate::config::defaults::default_config();
        let mut scale = std::collections::BTreeMap::new();
        scale.insert("700".to_owned(), "Color3.fromRGB(1, 2, 3)".to_owned());
        config
            .theme
            .colors
            .insert("brand".to_owned(), ColorValue::Palette(scale));

        let mut diagnostics = Vec::new();
        let resolved = resolve_color_value(
            &config,
            &mut diagnostics,
            BACKGROUND_COLOR_FAMILY,
            "brand",
            "bg-brand",
        );

        assert_eq!(resolved, None);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, "color-missing-shade");
    }

    #[test]
    fn completions_offer_bare_names_not_default_shade() {
        let keys = color_completion_keys(&crate::config::defaults::default_config());

        assert!(keys.iter().any(|key| key == "slate"));
        assert!(keys.iter().any(|key| key == "slate-700"));
        assert!(!keys.iter().any(|key| key.ends_with("-DEFAULT")));
    }

    #[test]
    fn resolves_rotation_opacity_and_aspect_values() {
        assert_eq!(resolve_rotation_value("45", false), Some("45".to_owned()));
        assert_eq!(resolve_rotation_value("90", true), Some("-90".to_owned()));
        assert_eq!(resolve_rotation_value("0", true), Some("0".to_owned()));
        assert_eq!(resolve_rotation_value("17", false), None);

        assert_eq!(resolve_opacity_value("0"), Some("1".to_owned()));
        assert_eq!(resolve_opacity_value("50"), Some("0.5".to_owned()));
        assert_eq!(resolve_opacity_value("25"), Some("0.75".to_owned()));
        assert_eq!(resolve_opacity_value("95"), Some("0.05".to_owned()));
        assert_eq!(resolve_opacity_value("100"), Some("0".to_owned()));
        assert_eq!(resolve_opacity_value("101"), None);
        assert_eq!(resolve_opacity_value("half"), None);

        assert_eq!(resolve_aspect_ratio_value("square"), Some("1".to_owned()));
        assert_eq!(
            resolve_aspect_ratio_value("video"),
            Some("1.7777777778".to_owned())
        );
        assert_eq!(
            resolve_aspect_ratio_value("[4/3]"),
            Some("1.3333333333".to_owned())
        );
        assert_eq!(resolve_aspect_ratio_value("[3]"), Some("3".to_owned()));
        assert_eq!(resolve_aspect_ratio_value("auto"), None);
        assert_eq!(resolve_aspect_ratio_value("[1/0]"), None);
    }

    /// A rem payload is written in the unit the viewport scales by, so it has to
    /// land as the pixels the theme's base says it is worth and nothing else —
    /// the runtime multiplies from there.
    #[test]
    fn an_arbitrary_rem_resolves_against_the_theme_base() {
        let mut config = TailwindConfig::default();
        let mut diagnostics = Vec::new();

        assert_eq!(
            parse_arbitrary_value("[2rem]"),
            Some(ArbitraryValue::Length(Length::Rem(2.0)))
        );
        assert_eq!(
            parse_arbitrary_value("[2px]"),
            Some(ArbitraryValue::Length(Length::Pixels(2.0)))
        );
        assert_eq!(parse_arbitrary_value("[2em]"), None);
        assert_eq!(parse_arbitrary_value("[rem]"), None);

        let size = resolve_size_axis_value(&config, &mut diagnostics, "[1.5rem]", "w-[1.5rem]")
            .expect("rem size");
        assert_eq!(size.offset, "24");
        assert_eq!(size.scale, "0");
        assert_eq!(
            resolve_text_size_value(&config, "[1.5rem]").as_deref(),
            Some("24")
        );
        assert_eq!(
            resolve_border_thickness_value(Some("[0.125rem]")),
            Some(Length::Rem(0.125))
        );

        config.theme.rem.base = 20.0;
        let rebased = resolve_size_axis_value(&config, &mut diagnostics, "[2rem]", "w-[2rem]")
            .expect("rem size");
        assert_eq!(rebased.offset, "40");
        assert_eq!(diagnostics.len(), 0);
    }

    #[test]
    fn resolves_position_and_anchor_values() {
        let config = TailwindConfig::default();
        let mut diagnostics = Vec::new();

        let offset = resolve_position_axis_value(&config, &mut diagnostics, "4", "left-4", false)
            .expect("spacing offset");
        assert_eq!(offset.scale, "0");
        assert_eq!(offset.offset, "16");

        let negative =
            resolve_position_axis_value(&config, &mut diagnostics, "4", "-top-4", true).unwrap();
        assert_eq!(negative.offset, "-16");

        let half = resolve_position_axis_value(&config, &mut diagnostics, "1/2", "left-1/2", false)
            .unwrap();
        assert_eq!(half.scale, "0.5");
        assert_eq!(half.offset, "0");

        let negative_half =
            resolve_position_axis_value(&config, &mut diagnostics, "1/2", "-left-1/2", true)
                .unwrap();
        assert_eq!(negative_half.scale, "-0.5");
        assert_eq!(diagnostics.len(), 0);

        assert_eq!(
            resolve_anchor_point_value("center"),
            Some("new Vector2(0.5, 0.5)".to_owned())
        );
        assert_eq!(
            resolve_anchor_point_value("bottom-right"),
            Some("new Vector2(1, 1)".to_owned())
        );
        assert_eq!(resolve_anchor_point_value("middle"), None);
    }

    #[test]
    fn classifies_and_resolves_text_utilities() {
        assert!(matches!(
            parse_utility("text-lg").kind,
            UtilityKind::TextSize
        ));
        assert!(matches!(
            parse_utility("text-center").kind,
            UtilityKind::TextXAlignment
        ));
        assert!(matches!(
            parse_utility("text-nowrap").kind,
            UtilityKind::TextWrap
        ));
        assert!(matches!(
            parse_utility("text-red-500").kind,
            UtilityKind::TextColor
        ));
        assert!(matches!(
            parse_utility("text-transparent").kind,
            UtilityKind::TextColor
        ));
        assert!(matches!(
            parse_utility("font-bold").kind,
            UtilityKind::FontWeight
        ));
        assert!(matches!(
            parse_utility("align-middle").kind,
            UtilityKind::TextYAlignment
        ));
        assert!(matches!(
            parse_utility("truncate").kind,
            UtilityKind::TextTruncate
        ));

        let config = TailwindConfig::default();
        assert_eq!(
            resolve_text_size_value(&config, "2xl").as_deref(),
            Some("24")
        );
        assert_eq!(resolve_text_size_value(&config, "huge"), None);
        assert_eq!(
            resolve_font_weight_value("bold"),
            Some(format!(
                "new Font(\"{DEFAULT_FONT_FAMILY}\", Enum.FontWeight.Bold)"
            ))
        );
        assert_eq!(
            resolve_text_x_alignment_value("center"),
            Some("Enum.TextXAlignment.Center".to_owned())
        );
        assert_eq!(resolve_text_x_alignment_value("justify"), None);
        assert_eq!(
            resolve_text_y_alignment_value("bottom"),
            Some("Enum.TextYAlignment.Bottom".to_owned())
        );
        assert_eq!(resolve_text_wrap_value("nowrap"), Some("false"));
    }

    #[test]
    fn restricts_text_utilities_to_text_hosts() {
        assert!(is_utility_allowed_on_host(
            Some("textlabel"),
            &UtilityKind::TextSize
        ));
        assert!(!is_utility_allowed_on_host(
            Some("frame"),
            &UtilityKind::TextSize
        ));
        assert!(!is_utility_allowed_on_host(
            Some("frame"),
            &UtilityKind::FontWeight
        ));
    }

    #[test]
    fn parses_position_families() {
        assert!(matches!(
            parse_utility("left-4").kind,
            UtilityKind::PositionX
        ));
        assert!(matches!(
            parse_utility("top-4").kind,
            UtilityKind::PositionY
        ));
        assert!(matches!(parse_utility("inset-0").kind, UtilityKind::Inset));
        let negative = parse_utility("-left-4");
        assert!(matches!(negative.kind, UtilityKind::PositionX));
        assert_eq!(negative.payload.as_deref(), Some("4"));
        assert!(matches!(
            parse_utility("origin-center").kind,
            UtilityKind::AnchorPoint
        ));
    }

    #[test]
    fn resolves_layout_enum_values() {
        assert_eq!(
            resolve_flex_direction_value(None),
            Some("Enum.FillDirection.Horizontal".to_owned())
        );
        assert_eq!(
            resolve_flex_direction_value(Some("col")),
            Some("Enum.FillDirection.Vertical".to_owned())
        );
        assert_eq!(resolve_flex_direction_value(Some("row-reverse")), None);

        assert_eq!(
            resolve_justify_value("center"),
            Some("Enum.HorizontalAlignment.Center".to_owned())
        );
        assert_eq!(resolve_justify_value("between"), None);

        assert_eq!(
            resolve_align_items_value("end"),
            Some("Enum.VerticalAlignment.Bottom".to_owned())
        );
        assert_eq!(resolve_align_items_value("stretch"), None);
    }

    #[test]
    fn parses_rotation_and_layout_families() {
        assert!(matches!(
            parse_utility("rotate-45").kind,
            UtilityKind::Rotation
        ));
        let negative = parse_utility("-rotate-90");
        assert!(matches!(negative.kind, UtilityKind::Rotation));
        assert_eq!(negative.payload.as_deref(), Some("90"));

        assert!(matches!(
            parse_utility("flex").kind,
            UtilityKind::FlexDirection
        ));
        assert!(matches!(
            parse_utility("flex-col").kind,
            UtilityKind::FlexDirection
        ));
        assert!(matches!(
            parse_utility("justify-center").kind,
            UtilityKind::JustifyContent
        ));
        assert!(matches!(
            parse_utility("items-end").kind,
            UtilityKind::AlignItems
        ));
        assert!(matches!(
            parse_utility("opacity-50").kind,
            UtilityKind::Opacity
        ));
        assert!(matches!(
            parse_utility("aspect-video").kind,
            UtilityKind::AspectRatio
        ));
    }

    #[test]
    fn parses_and_resolves_state_utilities() {
        assert!(matches!(
            parse_utility("hidden").kind,
            UtilityKind::Visibility
        ));
        assert!(matches!(
            parse_utility("visible").kind,
            UtilityKind::Visibility
        ));
        assert!(matches!(
            parse_utility("overflow-hidden").kind,
            UtilityKind::Overflow
        ));
        assert!(matches!(
            parse_utility("flex-wrap").kind,
            UtilityKind::FlexWrap
        ));
        assert!(matches!(
            parse_utility("flex-col").kind,
            UtilityKind::FlexDirection
        ));
        assert!(matches!(
            parse_utility("min-w-40").kind,
            UtilityKind::MinWidth
        ));
        assert!(matches!(
            parse_utility("max-h-40").kind,
            UtilityKind::MaxHeight
        ));

        assert_eq!(resolve_visibility_value("hidden"), Some("false"));
        assert_eq!(resolve_visibility_value("visible"), Some("true"));
        assert_eq!(resolve_overflow_value("clip"), Some("true"));
        assert_eq!(resolve_overflow_value("scroll"), None);
        assert_eq!(resolve_flex_wrap_value("nowrap"), Some("false"));

        let config = TailwindConfig::default();
        let mut diagnostics = Vec::new();
        assert_eq!(
            resolve_size_spacing_offset(&config, &mut diagnostics, "40", "min-w-40"),
            Some("160".to_owned())
        );
        assert_eq!(diagnostics.len(), 0);
    }

    #[test]
    fn parses_and_resolves_scale_and_line_join() {
        assert!(matches!(
            parse_utility("scale-110").kind,
            UtilityKind::Scale
        ));
        assert!(matches!(
            parse_utility("scale-x-110").kind,
            UtilityKind::Scale
        ));

        assert_eq!(resolve_scale_value("100"), Some("1"));
        assert_eq!(resolve_scale_value("110"), Some("1.1"));
        assert_eq!(resolve_scale_value("50"), Some("0.5"));
        assert_eq!(resolve_scale_value("x-110"), None);
        assert_eq!(resolve_scale_value("113"), None);

        assert_eq!(resolve_line_join_value("round"), Some("Round"));
        assert_eq!(resolve_line_join_value("miter"), Some("Miter"));
        assert_eq!(resolve_line_join_value("groove"), None);
        assert!(matches!(
            parse_utility("border-round").kind,
            UtilityKind::Border
        ));
    }

    #[test]
    fn classifies_and_resolves_flex_utilities() {
        assert!(matches!(
            parse_utility("flex-1").kind,
            UtilityKind::FlexItem
        ));
        assert!(matches!(parse_utility("grow").kind, UtilityKind::FlexItem));
        assert!(matches!(
            parse_utility("grow-0").kind,
            UtilityKind::FlexItem
        ));
        assert!(matches!(
            parse_utility("shrink").kind,
            UtilityKind::FlexItem
        ));
        assert!(matches!(
            parse_utility("flex-col").kind,
            UtilityKind::FlexDirection
        ));
        assert!(matches!(
            parse_utility("flex-wrap").kind,
            UtilityKind::FlexWrap
        ));

        assert_eq!(resolve_flex_item_mode("grow"), Some("Grow"));
        assert_eq!(resolve_flex_item_mode("grow-0"), Some("None"));
        assert_eq!(resolve_flex_item_mode("flex-1"), Some("Fill"));
        assert_eq!(resolve_flex_item_mode("flex-initial"), Some("Shrink"));
        assert_eq!(resolve_flex_item_mode("flex-none"), Some("None"));

        assert_eq!(resolve_justify_flex_value("between"), Some("SpaceBetween"));
        assert_eq!(resolve_justify_flex_value("evenly"), Some("SpaceEvenly"));
        assert_eq!(resolve_justify_flex_value("center"), None);
        assert_eq!(resolve_items_flex_value("stretch"), Some("Fill"));
        assert_eq!(resolve_items_flex_value("center"), None);
    }

    #[test]
    fn classifies_and_resolves_gradient_utilities() {
        assert!(matches!(
            parse_utility("bg-gradient-to-r").kind,
            UtilityKind::GradientDirection
        ));
        assert!(matches!(
            parse_utility("bg-linear-to-br").kind,
            UtilityKind::GradientDirection
        ));
        assert!(matches!(
            parse_utility("from-cyan-500").kind,
            UtilityKind::GradientFrom
        ));
        assert!(matches!(
            parse_utility("via-purple-500").kind,
            UtilityKind::GradientVia
        ));
        assert!(matches!(
            parse_utility("to-blue-500").kind,
            UtilityKind::GradientTo
        ));
        assert!(matches!(
            parse_utility("bg-red-500").kind,
            UtilityKind::BackgroundColor
        ));

        assert_eq!(resolve_gradient_rotation("r"), Some("0"));
        assert_eq!(resolve_gradient_rotation("b"), Some("90"));
        assert_eq!(resolve_gradient_rotation("tl"), Some("225"));
        assert_eq!(resolve_gradient_rotation("nope"), None);
    }

    #[test]
    fn classifies_and_resolves_shadow_utilities() {
        assert!(matches!(
            parse_utility("shadow").kind,
            UtilityKind::ShadowSize
        ));
        assert!(matches!(
            parse_utility("shadow-lg").kind,
            UtilityKind::ShadowSize
        ));
        assert!(matches!(
            parse_utility("shadow-none").kind,
            UtilityKind::ShadowSize
        ));
        assert!(matches!(
            parse_utility("shadow-inner").kind,
            UtilityKind::ShadowSize
        ));
        assert!(matches!(
            parse_utility("shadow-red-500").kind,
            UtilityKind::ShadowColor
        ));

        let base = resolve_shadow_preset(None).unwrap();
        assert_eq!(base.blur, 3);
        assert_eq!(base.offset_y, 1);
        assert_eq!(base.transparency, "0.9");

        let two_xl = resolve_shadow_preset(Some("2xl")).unwrap();
        assert_eq!(two_xl.blur, 50);
        assert_eq!(two_xl.spread, -12);
        assert_eq!(two_xl.transparency, "0.75");

        assert!(resolve_shadow_preset(Some("none")).is_none());
        assert!(resolve_shadow_preset(Some("inner")).is_none());
    }

    #[test]
    fn recognizes_automatic_size_keys() {
        assert!(is_automatic_size_key("auto"));
        assert!(is_automatic_size_key("fit"));
        assert!(!is_automatic_size_key("full"));
        assert!(!is_automatic_size_key("4"));
    }
}
