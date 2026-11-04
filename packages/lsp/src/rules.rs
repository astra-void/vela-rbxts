use std::collections::HashMap;

use serde_json::Value;
use tower_lsp_server::ls_types::{Diagnostic, DiagnosticSeverity, NumberOrString};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RuleLevel {
    Severity(DiagnosticSeverity),
    Ignore,
}

impl RuleLevel {
    fn parse(value: &Value) -> Option<Self> {
        Some(match value.as_str()? {
            "error" => Self::Severity(DiagnosticSeverity::ERROR),
            "warning" => Self::Severity(DiagnosticSeverity::WARNING),
            "info" => Self::Severity(DiagnosticSeverity::INFORMATION),
            "hint" => Self::Severity(DiagnosticSeverity::HINT),
            "ignore" => Self::Ignore,
            _ => return None,
        })
    }
}

/// What the client asked of the diagnostics: whether to publish any, and a
/// level per code that replaces the compiler's own.
#[derive(Clone, Debug, PartialEq)]
pub struct DiagnosticRules {
    validate: bool,
    levels: HashMap<String, RuleLevel>,
}

impl Default for DiagnosticRules {
    fn default() -> Self {
        Self {
            validate: true,
            levels: HashMap::new(),
        }
    }
}

impl DiagnosticRules {
    pub fn set_validate(&mut self, validate: bool) {
        self.validate = validate;
    }

    /// A level it does not know is dropped rather than failing the whole
    /// payload, which would lose the settings that came with it.
    pub fn set_levels(&mut self, levels: &HashMap<String, Value>) {
        self.levels = levels
            .iter()
            .filter_map(|(code, level)| Some((code.clone(), RuleLevel::parse(level)?)))
            .collect();
    }

    pub fn apply(&self, diagnostics: Vec<Diagnostic>) -> Vec<Diagnostic> {
        if !self.validate {
            return Vec::new();
        }

        diagnostics
            .into_iter()
            .filter_map(|mut diagnostic| {
                let level = match &diagnostic.code {
                    Some(NumberOrString::String(code)) => self.levels.get(code),
                    _ => None,
                };
                match level {
                    Some(RuleLevel::Ignore) => return None,
                    Some(RuleLevel::Severity(severity)) => diagnostic.severity = Some(*severity),
                    None => {}
                }
                Some(diagnostic)
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn diagnostic(code: &str) -> Diagnostic {
        Diagnostic {
            code: Some(NumberOrString::String(code.to_owned())),
            severity: Some(DiagnosticSeverity::WARNING),
            ..Default::default()
        }
    }

    #[test]
    fn overrides_ignores_and_keeps_by_code() {
        let mut rules = DiagnosticRules::default();
        rules.set_levels(&HashMap::from([
            ("overridden-class".to_owned(), Value::from("ignore")),
            ("unknown-theme-key".to_owned(), Value::from("error")),
            ("unknown-variant".to_owned(), Value::from("loud")),
        ]));

        let kept = rules.apply(vec![
            diagnostic("overridden-class"),
            diagnostic("unknown-theme-key"),
            diagnostic("unknown-variant"),
        ]);

        assert_eq!(
            kept.iter()
                .map(|diagnostic| (diagnostic.code.clone(), diagnostic.severity))
                .collect::<Vec<_>>(),
            vec![
                (
                    Some(NumberOrString::String("unknown-theme-key".to_owned())),
                    Some(DiagnosticSeverity::ERROR)
                ),
                (
                    Some(NumberOrString::String("unknown-variant".to_owned())),
                    Some(DiagnosticSeverity::WARNING)
                ),
            ]
        );
    }

    #[test]
    fn publishes_nothing_when_validation_is_off() {
        let mut rules = DiagnosticRules::default();
        rules.set_validate(false);

        assert!(
            rules
                .apply(vec![diagnostic("unknown-theme-key")])
                .is_empty()
        );
    }
}
