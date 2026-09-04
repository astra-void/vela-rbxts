use super::result::{AnalyzedClassToken, SemanticIssue};
use super::token::parse_class_token;
use super::utility::{
    UtilityKind, Z_INDEX_VALUES, is_known_unsupported_border_payload, parse_arbitrary_number,
    parse_arbitrary_value, resolve_border_thickness_value,
};

pub(crate) fn analyze_class_token(token: &str) -> AnalyzedClassToken {
    let parsed = parse_class_token(token);
    let utility = parsed.utility.kind.clone();
    let unknown_variant = parsed
        .variants
        .iter()
        .find(|variant| variant.kind.is_none())
        .map(|variant| variant.raw.clone());

    let runtime_condition = super::plugin::variants_runtime_condition(&parsed.variants)
        .ok()
        .flatten();

    let mut issues = Vec::new();
    if let Some(variant) = unknown_variant.clone() {
        issues.push(SemanticIssue::UnknownVariant { variant });
    }

    if let Some(issue) = payload_shape_issue(&utility, parsed.utility.payload.as_deref()) {
        issues.push(issue);
    }

    let supported = match &utility {
        UtilityKind::Unknown => {
            let family = parsed.utility.family.clone();
            issues.push(if is_known_tailwind_family(&family) {
                SemanticIssue::NoRobloxEquivalent { family }
            } else {
                SemanticIssue::UnsupportedUtilityFamily { family }
            });
            false
        }
        UtilityKind::ZIndex => {
            if parsed.raw.starts_with("-z-") {
                issues.push(SemanticIssue::NegativeZIndex);
                false
            } else if matches!(parsed.utility.payload.as_deref(), Some("auto")) {
                issues.push(SemanticIssue::UnsupportedZIndexAuto);
                false
            } else if matches!(parsed.utility.payload.as_deref(), Some(value) if value.starts_with('[') && value.ends_with(']'))
            {
                // `ZIndex` is an integer; a fractional arbitrary would round
                // silently instead of doing what the class says.
                let whole = parsed
                    .utility
                    .payload
                    .as_deref()
                    .and_then(|value| parse_arbitrary_number(value, ""))
                    .is_some_and(|value| value.fract() == 0.0);
                if !whole {
                    issues.push(SemanticIssue::UnsupportedArbitraryZIndex);
                }
                whole
            } else if let Some(value) = parsed.utility.payload.as_deref() {
                if value.parse::<i32>().is_ok() && !Z_INDEX_VALUES.contains(&value) {
                    issues.push(SemanticIssue::UnsupportedZIndexValue {
                        value: value.to_owned(),
                    });
                    false
                } else {
                    true
                }
            } else {
                false
            }
        }
        UtilityKind::Border => {
            if let Some(payload) = parsed.utility.payload.as_deref() {
                if resolve_border_thickness_value(Some(payload)).is_some()
                    || payload == "transparent"
                {
                    true
                } else if is_known_unsupported_border_payload(payload) {
                    issues.push(SemanticIssue::UnsupportedBorderValue {
                        value: payload.to_owned(),
                    });
                    false
                } else {
                    true
                }
            } else {
                true
            }
        }
        _ => true,
    } && unknown_variant.is_none()
        && !issues.iter().any(|issue| {
            matches!(
                issue,
                SemanticIssue::UnsupportedArbitraryValue { .. }
                    | SemanticIssue::UnsupportedOpacityModifier { .. }
            )
        });

    let runtime_aware = runtime_condition.is_some();

    AnalyzedClassToken {
        parsed,
        utility,
        supported,
        runtime_aware,
        runtime_condition,
        issues,
    }
}

/// Tailwind payload shapes vela-rbxts does not implement. Reporting them by
/// shape keeps the message about the actual feature instead of blaming the
/// theme for a key it was never asked to hold.
fn payload_shape_issue(utility: &UtilityKind, payload: Option<&str>) -> Option<SemanticIssue> {
    let payload = payload?;

    // Only theme-backed utilities, where an arbitrary value would otherwise be
    // reported as a missing theme key. Color utilities parse `[#hex]` payloads
    // themselves, and `border-[…]`, `z-[…]` and the aspect ratios keep their
    // own handling.
    if payload.starts_with('[')
        && payload.ends_with(']')
        && utility.needs_config_lookup()
        && !matches!(utility, UtilityKind::Border)
        && !is_color_utility(utility)
        && !(supports_arbitrary_value(utility) && parse_arbitrary_value(payload).is_some())
    {
        return Some(SemanticIssue::UnsupportedArbitraryValue {
            value: payload.to_owned(),
        });
    }

    // Fractions such as `w-1/2` are real values, so only colors read `/` as an
    // opacity modifier. Families that can express transparency consume the
    // modifier during lowering; the rest reject it here.
    if is_color_utility(utility)
        && !supports_opacity_modifier(utility)
        && let Some((_, modifier)) = payload.rsplit_once('/')
    {
        return Some(SemanticIssue::UnsupportedOpacityModifier {
            modifier: modifier.to_owned(),
        });
    }

    None
}

fn supports_opacity_modifier(utility: &UtilityKind) -> bool {
    matches!(
        utility,
        UtilityKind::BackgroundColor
            | UtilityKind::TextColor
            | UtilityKind::ImageColor
            | UtilityKind::ShadowColor
            | UtilityKind::Ring
            | UtilityKind::Outline
            | UtilityKind::GradientFrom
            | UtilityKind::GradientVia
            | UtilityKind::GradientTo
            | UtilityKind::DivideColor
    )
}

/// Families whose resolver reads a `[…]` payload as a length. Everything else
/// keeps reporting the payload as unsupported rather than guessing a unit.
fn supports_arbitrary_value(utility: &UtilityKind) -> bool {
    matches!(
        utility,
        UtilityKind::Padding(_)
            | UtilityKind::Margin(_)
            | UtilityKind::Gap
            | UtilityKind::SpaceX
            | UtilityKind::SpaceY
            | UtilityKind::ScrollbarThickness
            | UtilityKind::GridAutoRows
            | UtilityKind::GridAutoColumns
            | UtilityKind::Width
            | UtilityKind::Height
            | UtilityKind::Size
            | UtilityKind::MinWidth
            | UtilityKind::MaxWidth
            | UtilityKind::MinHeight
            | UtilityKind::MaxHeight
            | UtilityKind::Basis
            | UtilityKind::PositionX
            | UtilityKind::PositionY
            | UtilityKind::PositionRight
            | UtilityKind::PositionBottom
            | UtilityKind::Inset
            | UtilityKind::TranslateX
            | UtilityKind::TranslateY
            | UtilityKind::Radius(_)
    )
}

fn is_color_utility(utility: &UtilityKind) -> bool {
    matches!(
        utility,
        UtilityKind::BackgroundColor
            | UtilityKind::TextColor
            | UtilityKind::ImageColor
            | UtilityKind::PlaceholderColor
            | UtilityKind::ShadowColor
            | UtilityKind::GradientFrom
            | UtilityKind::GradientVia
            | UtilityKind::GradientTo
            | UtilityKind::Ring
            | UtilityKind::Outline
            | UtilityKind::DivideColor
    )
}

/// Tailwind families that describe browser-only concepts. They are valid
/// Tailwind, so they are reported as "no Roblox equivalent" rather than as a
/// typo the user should fix.
fn is_known_tailwind_family(family: &str) -> bool {
    // `grid`/`translate`/`basis` cover the subtokens their prefixes do not
    // parse, such as `grid-flow-*` or a bare `basis`.
    matches!(
        family,
        "grid"
            | "translate"
            | "basis"
            | "ms"
            | "me"
            | "space"
            | "static"
            | "fixed"
            | "absolute"
            | "relative"
            | "sticky"
            | "block"
            | "inline"
            | "table"
            | "contents"
            | "float"
            | "clear"
            | "columns"
            | "col"
            | "row"
            | "tracking"
            | "indent"
            | "whitespace"
            | "break"
            | "hyphens"
            | "decoration"
            | "overline"
            | "antialiased"
            | "list"
            | "ring"
            | "outline"
            | "blur"
            | "brightness"
            | "contrast"
            | "grayscale"
            | "invert"
            | "saturate"
            | "sepia"
            | "backdrop"
            | "cursor"
            | "pointer"
            | "resize"
            | "snap"
            | "select"
            | "accent"
            | "caret"
            | "appearance"
            | "skew"
            | "transform"
            | "perspective"
            | "fill"
            | "stroke"
            | "object"
            | "overscroll"
            | "isolate"
            | "box"
            | "container"
            | "sr"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::model::RuntimeCondition;
    use crate::semantic::result::SemanticIssue;
    use crate::semantic::utility::UtilityKind;

    #[test]
    fn classifies_supported_runtime_tokens() {
        let analysis = analyze_class_token("md:portrait:bg-slate-700");

        assert!(analysis.supported);
        assert!(analysis.utility.needs_config_lookup());
        assert!(analysis.runtime_aware);
        assert!(matches!(analysis.utility, UtilityKind::BackgroundColor));
        assert!(matches!(
            analysis.runtime_condition,
            Some(RuntimeCondition::All { .. })
        ));
    }

    #[test]
    fn flags_unsupported_semantic_shapes() {
        let z_index = analyze_class_token("z-100");
        assert!(!z_index.supported);
        assert!(matches!(
            z_index.issues.as_slice(),
            [SemanticIssue::UnsupportedZIndexValue { value }] if value == "100"
        ));

        let border = analyze_class_token("border-dashed");
        assert!(!border.supported);
        assert!(matches!(
            border.issues.as_slice(),
            [SemanticIssue::UnsupportedBorderValue { value }] if value == "dashed"
        ));
    }
}
