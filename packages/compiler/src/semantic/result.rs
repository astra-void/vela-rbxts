use super::token::ParsedClassToken;
use super::utility::UtilityKind;
use crate::ir::model::RuntimeCondition;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum SemanticIssue {
    UnsupportedUtilityFamily { family: String },
    UnsupportedZIndexValue { value: String },
    UnsupportedZIndexAuto,
    UnsupportedArbitraryZIndex,
    NegativeZIndex,
    UnsupportedSizeMode { mode: String },
}

#[derive(Clone, Debug)]
pub(crate) struct AnalyzedClassToken {
    pub(crate) parsed: ParsedClassToken,
    pub(crate) utility: UtilityKind,
    pub(crate) value: Option<String>,
    pub(crate) supported: bool,
    pub(crate) needs_config_lookup: bool,
    pub(crate) runtime_aware: bool,
    pub(crate) static_only: bool,
    pub(crate) runtime_condition: Option<RuntimeCondition>,
    pub(crate) issues: Vec<SemanticIssue>,
}

impl AnalyzedClassToken {
    pub(crate) fn payload(&self) -> Option<&str> {
        self.value.as_deref()
    }
}
