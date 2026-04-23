use super::result::{AnalyzedClassToken, SemanticIssue};
use super::token::parse_class_token;
use super::utility::UtilityKind;

pub(crate) fn analyze_class_token(token: &str) -> AnalyzedClassToken {
    let parsed = parse_class_token(token);
    let utility = parsed.utility.kind.clone();
    let runtime_condition = if parsed.variants.is_empty() {
        None
    } else {
        let mut conditions = Vec::with_capacity(parsed.variants.len());
        for variant in &parsed.variants {
            conditions.push(variant.runtime_condition());
        }

        Some(if conditions.len() == 1 {
            conditions.into_iter().next().unwrap()
        } else {
            crate::ir::model::RuntimeCondition::All { conditions }
        })
    };

    let mut issues = Vec::new();
    let supported = match &utility {
        UtilityKind::Unknown => {
            issues.push(SemanticIssue::UnsupportedUtilityFamily {
                family: parsed.utility.family.clone(),
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
                issues.push(SemanticIssue::UnsupportedArbitraryZIndex);
                false
            } else if let Some(value) = parsed.utility.payload.as_deref() {
                if value.parse::<i32>().is_ok()
                    && !matches!(value, "0" | "10" | "20" | "30" | "40" | "50")
                {
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
        UtilityKind::Size => matches!(parsed.utility.payload.as_deref(), Some("fit"))
            .then(|| {
                issues.push(SemanticIssue::UnsupportedSizeMode {
                    mode: "fit".to_owned(),
                });
            })
            .is_none(),
        _ => utility.is_supported(),
    };

    let needs_config_lookup = utility.needs_config_lookup();
    let runtime_aware = runtime_condition.is_some();

    AnalyzedClassToken {
        parsed,
        utility,
        supported,
        needs_config_lookup,
        runtime_aware,
        static_only: !runtime_aware,
        runtime_condition,
        issues,
    }
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
        assert!(analysis.needs_config_lookup);
        assert!(analysis.runtime_aware);
        assert!(!analysis.static_only);
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

        let size = analyze_class_token("size-fit");
        assert!(!size.supported);
        assert!(matches!(
            size.issues.as_slice(),
            [SemanticIssue::UnsupportedSizeMode { mode }] if mode == "fit"
        ));
    }
}
