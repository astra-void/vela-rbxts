use super::token::ParsedClassToken;
use super::utility::UtilityKind;
use crate::ir::model::RuntimeCondition;

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SemanticIssue {
    UnsupportedUtilityFamily {
        family: String,
    },
    NoRobloxEquivalent {
        family: String,
    },
    UnknownVariant {
        variant: String,
    },
    /// `max-foo:` where `foo` is not a configured breakpoint.
    UnknownBreakpoint {
        variant: String,
        name: String,
    },
    /// `attr-[…]` vela recognised and could not read.
    MalformedAttributeVariant {
        variant: String,
        detail: crate::semantic::variant::AttributeVariantError,
    },
    /// A chain whose width bounds leave no viewport, such as `md:max-sm:`.
    InvalidBreakpointRange {
        min_width: u32,
        max_width: u32,
    },
    UnsupportedArbitraryValue {
        value: String,
    },
    UnsupportedOpacityModifier {
        modifier: String,
    },
    UnsupportedBorderValue {
        value: String,
    },
    UnsupportedZIndexValue {
        value: String,
    },
    UnsupportedZIndexAuto,
    UnsupportedArbitraryZIndex,
    NegativeZIndex,
}

#[derive(Clone, Debug)]
pub(crate) struct AnalyzedClassToken {
    pub(crate) parsed: ParsedClassToken,
    pub(crate) utility: UtilityKind,
    pub(crate) supported: bool,
    pub(crate) runtime_aware: bool,
    pub(crate) runtime_condition: Option<RuntimeCondition>,
    pub(crate) issues: Vec<SemanticIssue>,
}

impl AnalyzedClassToken {
    pub(crate) fn payload(&self) -> Option<&str> {
        self.parsed.utility.payload.as_deref()
    }

    /// Only the negative-prefix table in `parse_utility` produces a leading `-`,
    /// so this reads the utility rather than `parsed.raw` — the latter still
    /// carries the variant prefixes and never starts with the sign.
    pub(crate) fn is_negative(&self) -> bool {
        self.parsed.utility.raw.starts_with('-')
    }
}
