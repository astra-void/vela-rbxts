use crate::api::{ClassNameEdit, SortClassNamesRequest, SortClassNamesResponse};
use crate::class_token::class_token_ranges;
use crate::editor::{collect_class_name_contexts, tokenize_class_name_with_ranges};
use crate::semantic::analyze::analyze_class_token;
use crate::semantic::utility::{PaddingKind, UtilityKind};
use crate::semantic::variant::{VariantKind, VariantRegistry};

pub(crate) fn sort_class_names_impl(request: SortClassNamesRequest) -> SortClassNamesResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let variants = VariantRegistry::new(&config);
    let mut edits = Vec::new();

    for context in collect_class_name_contexts(&request.source) {
        let tokens = tokenize_class_name_with_ranges(&context.value, context.value_range.start);
        if tokens.len() < 2 {
            continue;
        }

        // A bracket left open runs across the whitespace the tokenizer splits on,
        // so the pieces either side of it are not independent classes and moving
        // them apart would scramble the source.
        if tokens.iter().any(|token| !is_bracket_balanced(&token.text)) {
            continue;
        }

        let mut order: Vec<usize> = (0..tokens.len()).collect();
        order.sort_by_key(|index| sort_key(&tokens[*index].text, *index, &config, &variants));
        if order.iter().enumerate().all(|(to, from)| to == *from) {
            continue;
        }

        // The whitespace is the value's, not the sort's: the space either side of
        // a template's `${}` keeps the neighbouring token off whatever the
        // interpolation resolves to, and the line breaks a wrapped class list is
        // written across are the shape its author gave it. Only the tokens move.
        let leading = &context.value[..context.value.len() - context.value.trim_start().len()];
        let trailing = &context.value[context.value.trim_end().len()..];
        let separators = class_token_ranges(&context.value)
            .windows(2)
            .map(|pair| &context.value[pair[0].1..pair[1].0])
            .collect::<Vec<_>>();

        let mut text = leading.to_owned();
        for (position, index) in order.into_iter().enumerate() {
            if position > 0 {
                text.push_str(separators[position - 1]);
            }
            text.push_str(&tokens[index].text);
        }
        text.push_str(trailing);

        edits.push(ClassNameEdit {
            range: context.value_range.clone(),
            text,
        });
    }

    SortClassNamesResponse { edits }
}

fn is_bracket_balanced(token: &str) -> bool {
    let mut depth = 0i32;

    for ch in token.chars() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => {
                depth -= 1;
                if depth < 0 {
                    return false;
                }
            }
            _ => {}
        }
    }

    depth == 0
}

/// Variants first, then the property group, then the token's original position.
/// The last part is what keeps the sort stable, and stability is what keeps it
/// safe: utilities that write the same Roblox property share a group, so
/// reordering never changes which one wins.
fn sort_key(
    token: &str,
    index: usize,
    config: &crate::config::model::TailwindConfig,
    variants: &VariantRegistry<'_>,
) -> (Vec<VariantRank>, i64, usize) {
    let analysis = analyze_class_token(token, variants);
    let ranks = analysis
        .parsed
        .variants
        .iter()
        .map(|variant| variant_rank(variant.kind.as_ref(), &variant.raw))
        .collect();

    // A plugin utility bundles whole property groups, so it leads: a utility
    // written beside it is the one meant to win.
    let group = if crate::semantic::plugin::lookup_plugin_utility(
        config,
        crate::semantic::variant::utility_of(token),
    )
    .is_some()
    {
        PLUGIN_UTILITY_RANK
    } else {
        group_rank(&analysis.utility).into()
    };

    (ranks, group, index)
}

/// Ahead of every `group_rank`, so a plugin utility sorts to the front.
const PLUGIN_UTILITY_RANK: i64 = -1;

/// Where a variant sorts: the band it belongs to, then how it orders inside
/// that band, then its own spelling so two of the same width stay stable.
type VariantRank = (u8, i64, String);

/// Bands, narrow to broad. The relative order of the variants v0.12 already
/// ranked is unchanged, because new kinds slot into bands of their own and
/// moving one past another changes which rule wins where both apply.
const BAND_MIN_WIDTH: u8 = 0;
const BAND_MAX_WIDTH: u8 = 1;
const BAND_ORIENTATION: u8 = 2;
const BAND_INPUT: u8 = 3;
const BAND_STATE: u8 = 4;
const BAND_INTERACTION: u8 = 5;
const BAND_COLOR_SCHEME: u8 = 6;
const BAND_UNKNOWN: u8 = 7;

fn variant_rank(kind: Option<&VariantKind>, raw: &str) -> VariantRank {
    let Some(kind) = kind else {
        return (BAND_UNKNOWN, 0, raw.to_owned());
    };

    match kind {
        // A wider minimum is the more specific rule, so it comes later; a wider
        // maximum is the less specific one, so it comes first.
        VariantKind::Width {
            min_width,
            max_width: None,
            ..
        } => (BAND_MIN_WIDTH, i64::from(*min_width), raw.to_owned()),
        VariantKind::Width {
            max_width: Some(max),
            ..
        } => (BAND_MAX_WIDTH, -i64::from(*max), raw.to_owned()),
        VariantKind::Orientation { value } => (
            BAND_ORIENTATION,
            i64::from(value != "portrait"),
            raw.to_owned(),
        ),
        VariantKind::Input { value } => (
            BAND_INPUT,
            match value.as_str() {
                "touch" => 0,
                "mouse" => 1,
                _ => 2,
            },
            raw.to_owned(),
        ),
        // A registered variant leads the inline form: it is the project's own
        // vocabulary, and `attr-[…]` is the escape hatch beside it.
        VariantKind::Attribute { variant, name, .. } => (
            BAND_STATE,
            i64::from(variant.is_none()),
            format!("{name}:{raw}"),
        ),
        VariantKind::Hover => (BAND_INTERACTION, 0, raw.to_owned()),
        VariantKind::Active => (BAND_INTERACTION, 1, raw.to_owned()),
        VariantKind::Focus => (BAND_INTERACTION, 2, raw.to_owned()),
        VariantKind::ColorScheme { .. } => (BAND_COLOR_SCHEME, 0, raw.to_owned()),
    }
}

fn group_rank(utility: &UtilityKind) -> u32 {
    match utility {
        UtilityKind::Visibility | UtilityKind::Overflow | UtilityKind::PointerEvents => 0,
        UtilityKind::ZIndex | UtilityKind::LayoutOrder => 1,
        UtilityKind::FlexDirection
        | UtilityKind::FlexWrap
        | UtilityKind::JustifyContent
        | UtilityKind::AlignItems
        | UtilityKind::AlignContent
        | UtilityKind::Grid
        | UtilityKind::GridColumns
        | UtilityKind::GridRows
        | UtilityKind::GridAutoRows
        | UtilityKind::GridAutoColumns => 2,
        UtilityKind::FlexItem | UtilityKind::AlignSelf | UtilityKind::Basis => 3,
        // `gap-*` and `space-*` both write `UIListLayout.Padding`.
        UtilityKind::Gap | UtilityKind::SpaceX | UtilityKind::SpaceY => 4,
        // Every one of these can end up in `AnchorPoint` or `Position`.
        UtilityKind::PositionX
        | UtilityKind::PositionY
        | UtilityKind::PositionRight
        | UtilityKind::PositionBottom
        | UtilityKind::Inset
        | UtilityKind::AnchorPoint
        | UtilityKind::CenterX
        | UtilityKind::CenterY
        | UtilityKind::TranslateX
        | UtilityKind::TranslateY => 5,
        // `w-*`/`h-*`/`size-*` merge into one `Size`.
        UtilityKind::Width
        | UtilityKind::Height
        | UtilityKind::Size
        | UtilityKind::MinWidth
        | UtilityKind::MaxWidth
        | UtilityKind::MinHeight
        | UtilityKind::MaxHeight
        | UtilityKind::AspectRatio => 6,
        UtilityKind::Margin(_) => 7,
        UtilityKind::Padding(PaddingKind::All)
        | UtilityKind::Padding(PaddingKind::X)
        | UtilityKind::Padding(PaddingKind::Y)
        | UtilityKind::Padding(PaddingKind::Top)
        | UtilityKind::Padding(PaddingKind::Right)
        | UtilityKind::Padding(PaddingKind::Bottom)
        | UtilityKind::Padding(PaddingKind::Left) => 8,
        // `opacity-*` composes over whatever alpha the background settled on.
        UtilityKind::BackgroundColor
        | UtilityKind::Opacity
        | UtilityKind::ImageColor
        | UtilityKind::PlaceholderColor
        | UtilityKind::GradientDirection
        | UtilityKind::GradientFrom
        | UtilityKind::GradientVia
        | UtilityKind::GradientTo => 9,
        // `border-*`, `ring-*` and `outline-*` share one `UIStroke`.
        UtilityKind::Border | UtilityKind::Ring | UtilityKind::Outline => 10,
        UtilityKind::Radius => 11,
        UtilityKind::DivideX | UtilityKind::DivideY | UtilityKind::DivideColor => 12,
        UtilityKind::ShadowSize | UtilityKind::ShadowColor => 13,
        UtilityKind::Rotation | UtilityKind::Scale => 14,
        UtilityKind::TextSize => 15,
        UtilityKind::FontFamily | UtilityKind::FontWeight | UtilityKind::FontStyle => 16,
        UtilityKind::TextColor => 17,
        UtilityKind::TextXAlignment | UtilityKind::TextYAlignment => 18,
        UtilityKind::LineHeight => 19,
        // `text-wrap`/`whitespace-*` are aliases for the same `TextWrapped`.
        UtilityKind::TextWrap | UtilityKind::Whitespace | UtilityKind::TextTruncate => 20,
        UtilityKind::TextTransform | UtilityKind::TextDecoration => 21,
        UtilityKind::ObjectFit => 22,
        UtilityKind::Overscroll
        | UtilityKind::ScrollDirection
        | UtilityKind::ScrollbarThickness
        | UtilityKind::ScrollbarColor
        | UtilityKind::CanvasSize => 23,
        UtilityKind::Transition
        | UtilityKind::TransitionDuration
        | UtilityKind::TransitionEase
        | UtilityKind::TransitionDelay
        | UtilityKind::Animation => 24,
        UtilityKind::Unknown => 25,
    }
}
