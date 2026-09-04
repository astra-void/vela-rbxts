use super::result::{AnalyzedClassToken, SemanticIssue};
use super::token::parse_class_token;
use super::utility::{
    UtilityKind, Z_INDEX_VALUES, is_known_unsupported_border_payload, parse_arbitrary_number,
    parse_arbitrary_value, resolve_border_thickness_value,
};

pub(crate) fn analyze_class_token(
    token: &str,
    variants: &super::variant::VariantRegistry<'_>,
) -> AnalyzedClassToken {
    let parsed = parse_class_token(token, variants);
    let utility = parsed.utility.kind.clone();
    let unreadable_variant = parsed
        .variants
        .iter()
        .find(|variant| variant.kind.is_none())
        .map(|variant| variant.raw.clone());

    let runtime_condition = super::plugin::variants_runtime_condition(&parsed.variants)
        .ok()
        .flatten();

    let mut issues = Vec::new();
    issues.extend(variant_issues(&parsed.variants));

    if let Some(issue) = payload_shape_issue(&utility, parsed.utility.payload.as_deref()) {
        issues.push(issue);
    }

    let supported = match &utility {
        UtilityKind::Unknown => {
            let family = parsed.utility.family.clone();
            // A token that opens with `attr-` in the utility position is a
            // variant that lost its `:` or its brackets, not a utility family
            // nobody implements. Say so rather than blaming the family.
            issues.push(
                if let Some(detail) =
                    super::variant::utility_position_attribute_error(&parsed.utility.raw)
                {
                    SemanticIssue::MalformedAttributeVariant {
                        variant: parsed.utility.raw.clone(),
                        detail,
                    }
                } else if is_known_tailwind_family(&family) {
                    SemanticIssue::NoRobloxEquivalent { family }
                } else {
                    SemanticIssue::UnsupportedUtilityFamily { family }
                },
            );
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
    } && unreadable_variant.is_none()
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

/// What each prefix in the chain got wrong, plus the one thing only the whole
/// chain can be wrong about: bounds that leave no viewport for the rule.
fn variant_issues(variants: &[super::variant::ParsedVariant]) -> Vec<SemanticIssue> {
    use super::variant::{VariantError, VariantKind};

    let mut issues = Vec::new();

    for variant in variants {
        match &variant.error {
            Some(VariantError::Unknown) => issues.push(SemanticIssue::UnknownVariant {
                variant: variant.raw.clone(),
            }),
            Some(VariantError::UnknownBreakpoint { name }) => {
                issues.push(SemanticIssue::UnknownBreakpoint {
                    variant: variant.raw.clone(),
                    name: name.clone(),
                })
            }
            Some(VariantError::MalformedAttribute { detail }) => {
                issues.push(SemanticIssue::MalformedAttributeVariant {
                    variant: variant.raw.clone(),
                    detail: detail.clone(),
                })
            }
            None => {}
        }
    }

    let mut min_width = 0u32;
    let mut max_width: Option<u32> = None;
    for variant in variants {
        if let Some(VariantKind::Width {
            min_width: min,
            max_width: max,
            ..
        }) = &variant.kind
        {
            min_width = min_width.max(*min);
            if let Some(max) = max {
                max_width = Some(max_width.map_or(*max, |current: u32| current.min(*max)));
            }
        }
    }

    // The bounds meet rather than overlap: `min` is inclusive and `max` is not,
    // so a rule needs a viewport strictly below `max` and at least `min`.
    if let Some(max) = max_width
        && min_width >= max
    {
        issues.push(SemanticIssue::InvalidBreakpointRange {
            min_width,
            max_width: max,
        });
    }

    issues
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
            | UtilityKind::Radius
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
    use crate::config::defaults::default_config;
    use crate::ir::model::RuntimeCondition;
    use crate::semantic::result::SemanticIssue;
    use crate::semantic::utility::UtilityKind;
    use crate::semantic::variant::VariantRegistry;

    fn analyze(token: &str) -> crate::semantic::result::AnalyzedClassToken {
        static CONFIG: std::sync::LazyLock<crate::config::model::TailwindConfig> =
            std::sync::LazyLock::new(default_config);
        analyze_class_token(token, &VariantRegistry::new(&CONFIG))
    }

    #[test]
    fn classifies_supported_runtime_tokens() {
        let analysis = analyze("md:portrait:bg-slate-700");

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
    fn reports_a_range_that_can_never_match() {
        let analysis = analyze("md:max-sm:px-4");

        assert!(!analysis.supported || !analysis.issues.is_empty());
        assert!(matches!(
            analysis.issues.as_slice(),
            [SemanticIssue::InvalidBreakpointRange {
                min_width: 768,
                max_width: 640
            }]
        ));
    }

    #[test]
    fn a_range_that_leaves_a_viewport_is_accepted() {
        let analysis = analyze("md:max-lg:px-4");

        assert!(analysis.supported);
        assert!(analysis.issues.is_empty());
        assert!(matches!(
            analysis.runtime_condition,
            Some(RuntimeCondition::All { .. })
        ));
    }

    #[test]
    fn flags_unsupported_semantic_shapes() {
        let z_index = analyze("z-100");
        assert!(!z_index.supported);
        assert!(matches!(
            z_index.issues.as_slice(),
            [SemanticIssue::UnsupportedZIndexValue { value }] if value == "100"
        ));

        let border = analyze("border-dashed");
        assert!(!border.supported);
        assert!(matches!(
            border.issues.as_slice(),
            [SemanticIssue::UnsupportedBorderValue { value }] if value == "dashed"
        ));
    }
}
