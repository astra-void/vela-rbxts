use super::utility::{ParsedUtility, parse_utility};
use super::variant::{ParsedVariant, split_variant_prefixes};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedClassToken {
    pub(crate) raw: String,
    pub(crate) variants: Vec<ParsedVariant>,
    pub(crate) utility: ParsedUtility,
}

pub(crate) fn parse_class_token(token: &str) -> ParsedClassToken {
    let (variants, base_token) = match split_variant_prefixes(token) {
        Some((variants, remainder)) => (variants, remainder),
        None => (Vec::new(), token),
    };

    ParsedClassToken {
        raw: token.to_owned(),
        variants,
        utility: parse_utility(base_token),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::semantic::utility::{PaddingKind, UtilityKind};
    use crate::semantic::variant::VariantKind;

    #[test]
    fn parses_variants_and_utility_payload() {
        let parsed = parse_class_token("md:px-4");

        assert_eq!(parsed.raw, "md:px-4");
        assert_eq!(parsed.variants.len(), 1);
        assert!(matches!(parsed.variants[0].kind, VariantKind::Width { .. }));
        assert!(matches!(
            parsed.utility.kind,
            UtilityKind::Padding(PaddingKind::X)
        ));
        assert_eq!(parsed.utility.payload.as_deref(), Some("4"));
    }

    #[test]
    fn parses_variant_chain() {
        let parsed = parse_class_token("sm:portrait:bg-slate-700");

        assert_eq!(parsed.variants.len(), 2);
        assert_eq!(parsed.utility.payload.as_deref(), Some("slate-700"));
    }
}
