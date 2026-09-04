use crate::api::{ClassNameEdit, SortClassNamesRequest, SortClassNamesResponse};
use crate::class_token::class_token_ranges;
use crate::editor::{collect_class_name_contexts, tokenize_class_name_with_ranges};
use crate::semantic::analyze::analyze_class_token;
use crate::semantic::utility::{PaddingKind, UtilityKind};
use crate::semantic::variant::RUNTIME_VARIANTS;

pub(crate) fn sort_class_names_impl(request: SortClassNamesRequest) -> SortClassNamesResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
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
        order.sort_by_key(|index| sort_key(&tokens[*index].text, *index, &config));
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
) -> (Vec<usize>, i64, usize) {
    let analysis = analyze_class_token(token);
    let variants = analysis
        .parsed
        .variants
        .iter()
        .map(|variant| variant_rank(&variant.raw))
        .collect();

    // A plugin utility bundles whole property groups, so it leads: a utility
    // written beside it is the one meant to win.
    let group = if crate::semantic::plugin::lookup_plugin_utility(
        config,
        crate::semantic::variant::split_variant_prefixes(token).1,
    )
    .is_some()
    {
        PLUGIN_UTILITY_RANK
    } else {
        group_rank(&analysis.utility).into()
    };

    (variants, group, index)
}

/// Ahead of every `group_rank`, so a plugin utility sorts to the front.
const PLUGIN_UTILITY_RANK: i64 = -1;

fn variant_rank(prefix: &str) -> usize {
    RUNTIME_VARIANTS
        .iter()
        .position(|(name, _)| *name == prefix)
        .map_or(usize::MAX, |position| position + 1)
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
        UtilityKind::Radius(_) => 11,
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
