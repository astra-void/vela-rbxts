// Parts of this vocabulary are read only by the editor, which the wasm
// binding leaves out; the native build still checks them for real dead code.
#![cfg_attr(target_arch = "wasm32", allow(dead_code))]

use crate::config::model::{AttributeValue, TailwindConfig, VariantDefinition};
use crate::ir::model::RuntimeCondition;
use std::collections::BTreeMap;

/// Variant names that are neither a breakpoint nor a project registration,
/// paired with the condition they check, phrased for editor documentation.
pub(crate) const BUILT_IN_VARIANTS: [(&str, &str); 9] = [
    ("portrait", "the viewport is taller than it is wide"),
    ("landscape", "the viewport is wider than it is tall"),
    ("touch", "the last input was touch"),
    ("mouse", "the last input was a mouse or keyboard"),
    ("gamepad", "the last input was a gamepad"),
    ("hover", "the pointer is over the element"),
    ("active", "the element is being pressed"),
    ("focus", "the element holds input focus"),
    ("dark", "the player's color scheme is dark"),
];

/// The prefix a maximum-width variant is written with: `max-md:`.
pub(crate) const MAX_WIDTH_PREFIX: &str = "max-";

/// The prefix a variant that names a Roblox attribute inline is written with.
pub(crate) const ATTRIBUTE_PREFIX: &str = "attr-";

/// What `attr-[…]` came to, or why it could not be read. The malformed cases
/// are kept apart so a half-typed variant is reported as itself rather than as
/// an unknown one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum AttributeVariantError {
    /// `attr-State=open`: the brackets the value is written inside are missing.
    MissingBrackets,
    /// `attr-[State]`: nothing to compare the attribute against.
    MissingSeparator,
    /// `attr-[=open]`: no attribute to read.
    MissingName,
    /// `attr-[State=]`: an empty value.
    MissingValue,
    /// `attr-[St ate=open]`: the name is not a Roblox attribute name.
    InvalidName { name: String },
    /// `attr-[State=open]` written with no `:utility` after it.
    MissingUtility,
}

impl AttributeVariantError {
    pub(crate) fn message(&self) -> String {
        match self {
            Self::MissingBrackets => {
                "write the attribute inside brackets, as `attr-[State=open]`".to_owned()
            }
            Self::MissingSeparator => {
                "name the value to compare against, as `attr-[State=open]`".to_owned()
            }
            Self::MissingName => "name the attribute to read, as `attr-[State=open]`".to_owned(),
            Self::MissingValue => {
                "name the value to compare against, as `attr-[State=open]`".to_owned()
            }
            Self::InvalidName { name } => format!(
                "\"{name}\" is not a Roblox attribute name; use letters, digits and underscores, starting with a letter or underscore"
            ),
            Self::MissingUtility => {
                "a variant needs a utility after it, as `attr-[State=open]:bg-blue-600`".to_owned()
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum VariantKind {
    Width {
        alias: String,
        min_width: u32,
        /// Exclusive: `max-md:` matches strictly below the breakpoint, so it and
        /// `md:` cover every viewport exactly once.
        max_width: Option<u32>,
    },
    Orientation {
        value: String,
    },
    Input {
        value: String,
    },
    ColorScheme {
        value: String,
    },
    Hover,
    Active,
    Focus,
    /// A registered variant, or one an `attr-[…]` named inline. Both read the
    /// same attribute off the styled instance.
    Attribute {
        /// The registered name, when the variant came from one. `None` for the
        /// inline form, which has no name of its own.
        variant: Option<String>,
        name: String,
        value: AttributeValue,
    },
}

/// Why a prefix is not a variant. `Unknown` is the plain "never heard of it";
/// the rest are prefixes vela recognises and could not read.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum VariantError {
    Unknown,
    UnknownBreakpoint { name: String },
    MalformedAttribute { detail: AttributeVariantError },
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct ParsedVariant {
    pub(crate) raw: String,
    /// `None` for a prefix that is not a vela-rbxts runtime variant; `error`
    /// then says why.
    pub(crate) kind: Option<VariantKind>,
    pub(crate) error: Option<VariantError>,
}

impl ParsedVariant {
    pub(crate) fn runtime_condition(&self) -> Option<RuntimeCondition> {
        Some(match self.kind.as_ref()? {
            VariantKind::Width {
                alias,
                min_width,
                max_width,
            } => RuntimeCondition::Width {
                alias: alias.clone(),
                min_width: *min_width,
                max_width: *max_width,
            },
            VariantKind::Orientation { value } => RuntimeCondition::Orientation {
                value: value.clone(),
            },
            VariantKind::Input { value } => RuntimeCondition::Input {
                value: value.clone(),
            },
            VariantKind::ColorScheme { value } => RuntimeCondition::ColorScheme {
                value: value.clone(),
            },
            VariantKind::Hover => RuntimeCondition::Hover,
            VariantKind::Active => RuntimeCondition::Active,
            VariantKind::Focus => RuntimeCondition::Focus,
            VariantKind::Attribute { name, value, .. } => RuntimeCondition::Attribute {
                name: name.clone(),
                value: value.clone(),
            },
        })
    }
}

/// Everything a class token's prefixes are resolved against: the breakpoints a
/// project configured and the variants its plugins registered. One registry
/// serves the transform, the runtime config and every editor feature, so a
/// token means the same thing in all of them.
#[derive(Clone, Copy, Debug)]
pub(crate) struct VariantRegistry<'a> {
    screens: &'a BTreeMap<String, u32>,
    variants: &'a BTreeMap<String, VariantDefinition>,
}

impl<'a> VariantRegistry<'a> {
    pub(crate) fn new(config: &'a TailwindConfig) -> Self {
        Self {
            screens: &config.theme.screens,
            variants: &config.plugins.variants,
        }
    }

    /// Breakpoints ordered narrow to wide, which is the order they rank in and
    /// the order the editor offers them.
    pub(crate) fn screens(&self) -> Vec<(&'a str, u32)> {
        let mut screens: Vec<(&str, u32)> = self
            .screens
            .iter()
            .map(|(name, width)| (name.as_str(), *width))
            .collect();
        screens.sort_by(|left, right| left.1.cmp(&right.1).then_with(|| left.0.cmp(right.0)));
        screens
    }

    pub(crate) fn screen_width(&self, name: &str) -> Option<u32> {
        self.screens.get(name).copied()
    }

    pub(crate) fn custom_variants(&self) -> impl Iterator<Item = (&'a str, &'a VariantDefinition)> {
        self.variants
            .iter()
            .map(|(name, definition)| (name.as_str(), definition))
    }

    pub(crate) fn custom_variant(&self, name: &str) -> Option<&'a VariantDefinition> {
        self.variants.get(name)
    }

    /// Every prefix the editor can offer, with the sentence describing when it
    /// applies. Ordered the way they rank, so completions and sorting agree.
    pub(crate) fn documented_variants(&self) -> Vec<(String, String)> {
        let mut entries = Vec::new();

        for (name, width) in self.screens() {
            entries.push((
                name.to_owned(),
                format!("the viewport is at least {width}px wide"),
            ));
        }

        for (name, width) in self.screens() {
            entries.push((
                format!("{MAX_WIDTH_PREFIX}{name}"),
                format!("the viewport is narrower than {width}px"),
            ));
        }

        // Ordered the way `sort_key` ranks them, so the completion list and the
        // canonical class order read the same.
        let describe = |wanted: &str| {
            BUILT_IN_VARIANTS
                .iter()
                .find(|(name, _)| *name == wanted)
                .map(|(_, condition)| (*condition).to_owned())
                .unwrap_or_default()
        };

        for name in ["portrait", "landscape", "touch", "mouse", "gamepad"] {
            entries.push((name.to_owned(), describe(name)));
        }

        for (name, definition) in self.custom_variants() {
            entries.push((name.to_owned(), describe_attribute_variant(definition)));
        }

        for name in ["hover", "active", "focus", "dark"] {
            entries.push((name.to_owned(), describe(name)));
        }

        entries
    }

    /// Resolves one `prefix:` segment. The single place a variant prefix is
    /// interpreted, so the transform, the runtime config and the editor cannot
    /// read the same token differently.
    pub(crate) fn parse(&self, prefix: &str) -> Result<VariantKind, VariantError> {
        if let Some(width) = self.screen_width(prefix) {
            return Ok(VariantKind::Width {
                alias: prefix.to_owned(),
                min_width: width,
                max_width: None,
            });
        }

        if let Some(name) = prefix.strip_prefix(MAX_WIDTH_PREFIX) {
            return match self.screen_width(name) {
                Some(width) => Ok(VariantKind::Width {
                    alias: prefix.to_owned(),
                    min_width: 0,
                    max_width: Some(width),
                }),
                None => Err(VariantError::UnknownBreakpoint {
                    name: name.to_owned(),
                }),
            };
        }

        if let Some(rest) = prefix.strip_prefix(ATTRIBUTE_PREFIX) {
            return match parse_attribute_payload(rest) {
                Ok((name, value)) => Ok(VariantKind::Attribute {
                    variant: None,
                    name,
                    value,
                }),
                Err(detail) => Err(VariantError::MalformedAttribute { detail }),
            };
        }

        if let Some(definition) = self.custom_variant(prefix) {
            return Ok(VariantKind::Attribute {
                variant: Some(prefix.to_owned()),
                name: definition.attribute.clone(),
                value: definition.equals.clone(),
            });
        }

        match prefix {
            "portrait" | "landscape" => Ok(VariantKind::Orientation {
                value: prefix.to_owned(),
            }),
            "touch" | "mouse" | "gamepad" => Ok(VariantKind::Input {
                value: prefix.to_owned(),
            }),
            "dark" => Ok(VariantKind::ColorScheme {
                value: prefix.to_owned(),
            }),
            "hover" => Ok(VariantKind::Hover),
            "active" => Ok(VariantKind::Active),
            "focus" => Ok(VariantKind::Focus),
            _ => Err(VariantError::Unknown),
        }
    }

    /// Splits every `prefix:` segment off the token. Unrecognised prefixes are
    /// kept as variants with no kind so the utility behind them still gets
    /// analyzed and the prefix can be reported on its own.
    pub(crate) fn split<'t>(&self, token: &'t str) -> (Vec<ParsedVariant>, &'t str) {
        let mut variants = Vec::new();
        let mut remainder = token;

        while let Some(index) = top_level_colon(remainder) {
            let prefix = &remainder[..index];
            let (kind, error) = match self.parse(prefix) {
                Ok(kind) => (Some(kind), None),
                Err(error) => (None, Some(error)),
            };
            variants.push(ParsedVariant {
                raw: prefix.to_owned(),
                kind,
                error,
            });
            remainder = &remainder[index + 1..];
        }

        (variants, remainder)
    }

    /// What a diagnostic offers instead of the prefix it could not read. The
    /// breakpoints are summarized rather than listed twice, since every one of
    /// them also has a `max-` form.
    pub(crate) fn supported_variant_list(&self) -> String {
        let mut names: Vec<String> = BUILT_IN_VARIANTS
            .iter()
            .map(|(name, _)| (*name).to_owned())
            .collect();
        names.extend(self.custom_variants().map(|(name, _)| name.to_owned()));
        names.sort();

        let screens = self.screen_names();
        let mut parts = vec![names.join(", ")];

        if !screens.is_empty() {
            parts.push(format!(
                "the breakpoints {} and their `max-` forms",
                screens.join(", ")
            ));
        }

        parts.push("and `attr-[Name=value]`".to_owned());

        parts.join(", ")
    }

    /// Breakpoint names, for a completion list or a "did you mean" suggestion.
    pub(crate) fn screen_names(&self) -> Vec<String> {
        self.screens()
            .into_iter()
            .map(|(name, _)| name.to_owned())
            .collect()
    }
}

/// Why a registered variant name cannot be used, or `None` when it can. Only a
/// hand-written JSON config reaches this: `addVariant` rejects the same names
/// where they are written.
pub(crate) fn custom_variant_problem(
    name: &str,
    screens: &BTreeMap<String, u32>,
) -> Option<&'static str> {
    if name.is_empty()
        || !name
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_alphanumeric())
        || !name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Some("is not a usable class prefix");
    }

    if BUILT_IN_VARIANTS.iter().any(|(entry, _)| *entry == name) {
        return Some("is a built-in vela variant");
    }

    if name.starts_with(MAX_WIDTH_PREFIX) || name.starts_with(ATTRIBUTE_PREFIX) {
        return Some("vela reads as a breakpoint range or an inline attribute variant");
    }

    if screens.contains_key(name) {
        return Some("is already a breakpoint in `theme.screens`");
    }

    None
}

pub(crate) fn describe_attribute_variant(definition: &VariantDefinition) -> String {
    format!(
        "the element's `{}` attribute is `{}`",
        definition.attribute,
        definition.equals.display()
    )
}

pub(crate) fn describe_variant_kind(kind: &VariantKind) -> String {
    match kind {
        VariantKind::Width {
            min_width,
            max_width,
            ..
        } => match (min_width, max_width) {
            (0, Some(max)) => format!("the viewport is narrower than {max}px"),
            (min, Some(max)) => {
                format!("the viewport is at least {min}px and narrower than {max}px")
            }
            (min, None) => format!("the viewport is at least {min}px wide"),
        },
        VariantKind::Orientation { value } => {
            if value == "portrait" {
                "the viewport is taller than it is wide".to_owned()
            } else {
                "the viewport is wider than it is tall".to_owned()
            }
        }
        VariantKind::Input { value } => match value.as_str() {
            "touch" => "the last input was touch".to_owned(),
            "gamepad" => "the last input was a gamepad".to_owned(),
            _ => "the last input was a mouse or keyboard".to_owned(),
        },
        VariantKind::ColorScheme { .. } => "the player's color scheme is dark".to_owned(),
        VariantKind::Hover => "the pointer is over the element".to_owned(),
        VariantKind::Active => "the element is being pressed".to_owned(),
        VariantKind::Focus => "the element holds input focus".to_owned(),
        VariantKind::Attribute { name, value, .. } => {
            format!("the element's `{name}` attribute is `{}`", value.display())
        }
    }
}

/// Reads the `[Name=value]` an `attr-` prefix carries. Values are taken at face
/// value: `true`/`false` compare as booleans, a number as a number, anything
/// else as a string, so nothing here evaluates what the class wrote.
pub(crate) fn parse_attribute_payload(
    payload: &str,
) -> Result<(String, AttributeValue), AttributeVariantError> {
    let Some(inner) = payload
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
    else {
        return Err(AttributeVariantError::MissingBrackets);
    };

    // The first `=` separates: an attribute name can never contain one, so
    // `attr-[State=a=b]` compares against the literal `a=b`.
    let Some((name, value)) = inner.split_once('=') else {
        return Err(AttributeVariantError::MissingSeparator);
    };

    if name.is_empty() {
        return Err(AttributeVariantError::MissingName);
    }

    if !is_attribute_name(name) {
        return Err(AttributeVariantError::InvalidName {
            name: name.to_owned(),
        });
    }

    if value.is_empty() {
        return Err(AttributeVariantError::MissingValue);
    }

    Ok((name.to_owned(), parse_attribute_value(value)))
}

pub(crate) fn parse_attribute_value(value: &str) -> AttributeValue {
    match value {
        "true" => AttributeValue::Bool(true),
        "false" => AttributeValue::Bool(false),
        _ => match value.parse::<f64>() {
            Ok(number) if number.is_finite() => AttributeValue::Number(number),
            _ => AttributeValue::Text(value.to_owned()),
        },
    }
}

/// Why a token that was written in the utility position cannot be one: it opens
/// with the attribute-variant prefix, so it is a variant that lost its `:` or
/// its brackets rather than a utility family nobody implements.
pub(crate) fn utility_position_attribute_error(utility: &str) -> Option<AttributeVariantError> {
    let rest = utility.strip_prefix(ATTRIBUTE_PREFIX)?;

    Some(match parse_attribute_payload(rest) {
        Ok(_) => AttributeVariantError::MissingUtility,
        Err(error) => error,
    })
}

fn is_attribute_name(name: &str) -> bool {
    let mut chars = name.chars();

    chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic() || first == '_')
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

/// Colons inside `[...]` belong to an arbitrary value, not a variant separator.
fn top_level_colon(token: &str) -> Option<usize> {
    let mut depth = 0usize;

    for (index, ch) in token.char_indices() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            ':' if depth == 0 => return Some(index),
            _ => {}
        }
    }

    None
}

/// Splits variant prefixes off a token without resolving any of them, for the
/// callers that only need to know where the utility starts.
pub(crate) fn split_variant_prefixes(token: &str) -> (Vec<String>, &str) {
    let mut prefixes = Vec::new();
    let mut remainder = token;

    while let Some(index) = top_level_colon(remainder) {
        prefixes.push(remainder[..index].to_owned());
        remainder = &remainder[index + 1..];
    }

    (prefixes, remainder)
}

/// Where the utility starts in a token, i.e. everything past the last
/// top-level `:`.
pub(crate) fn utility_of(token: &str) -> &str {
    split_variant_prefixes(token).1
}

/// The vocabulary is spelled three times: here, in the config package that
/// validates a registration against it, and in the runtime that reads a class
/// value in-game. These read the other two so a prefix cannot come to mean
/// different things in the compiler and at runtime.
#[cfg(test)]
mod parity {
    use super::{ATTRIBUTE_PREFIX, BUILT_IN_VARIANTS, MAX_WIDTH_PREFIX};

    const CONFIG_VARIANTS: &str = include_str!("../../../config/src/variants.ts");
    const RUNTIME_VARIANTS: &str = include_str!("../../../runtime-core/src/variant.ts");

    #[test]
    fn the_config_package_validates_against_this_built_in_list() {
        for (name, _) in BUILT_IN_VARIANTS {
            assert!(
                CONFIG_VARIANTS.contains(&format!("\"{name}\"")),
                "packages/config never names the built-in variant `{name}`, so addVariant would accept it"
            );
        }

        // And nothing it names is missing here, which would let a registration
        // be rejected for shadowing a prefix this crate does not implement.
        let listed = CONFIG_VARIANTS
            .split_once("BUILT_IN_VARIANTS = [")
            .and_then(|(_, rest)| rest.split_once(']'))
            .map(|(body, _)| body)
            .expect("packages/config must export BUILT_IN_VARIANTS as a literal array");

        for entry in listed.split(',') {
            let name = entry.trim().trim_matches('"');
            if name.is_empty() {
                continue;
            }

            assert!(
                BUILT_IN_VARIANTS.iter().any(|(entry, _)| *entry == name),
                "packages/config lists `{name}`, which this crate never resolves"
            );
        }
    }

    #[test]
    fn every_reader_spells_the_reserved_prefixes_the_same_way() {
        for source in [CONFIG_VARIANTS, RUNTIME_VARIANTS] {
            assert!(source.contains(&format!("\"{MAX_WIDTH_PREFIX}\"")));
            assert!(source.contains(&format!("\"{ATTRIBUTE_PREFIX}\"")));
        }
    }

    /// The runtime resolves a prefix out of a class value the compiler could not
    /// read. A name it never matches is a token that lowers statically and does
    /// nothing in-game.
    #[test]
    fn the_runtime_resolves_every_built_in_prefix() {
        for (name, _) in BUILT_IN_VARIANTS {
            assert!(
                RUNTIME_VARIANTS.contains(&format!("case \"{name}\"")),
                "the runtime never matches the `{name}` variant"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> VariantRegistry<'static> {
        static CONFIG: std::sync::LazyLock<TailwindConfig> =
            std::sync::LazyLock::new(crate::config::defaults::default_config);
        VariantRegistry::new(&CONFIG)
    }

    #[test]
    fn resolves_the_default_breakpoints_and_their_ranges() {
        let registry = registry();

        assert_eq!(
            registry.parse("md"),
            Ok(VariantKind::Width {
                alias: "md".to_owned(),
                min_width: 768,
                max_width: None,
            })
        );
        assert_eq!(
            registry.parse("max-md"),
            Ok(VariantKind::Width {
                alias: "max-md".to_owned(),
                min_width: 0,
                max_width: Some(768),
            })
        );
        assert_eq!(
            registry.parse("2xl"),
            Ok(VariantKind::Width {
                alias: "2xl".to_owned(),
                min_width: 1536,
                max_width: None,
            })
        );
        assert_eq!(
            registry.parse("max-nope"),
            Err(VariantError::UnknownBreakpoint {
                name: "nope".to_owned()
            })
        );
    }

    #[test]
    fn reads_an_inline_attribute_variant() {
        let registry = registry();

        assert_eq!(
            registry.parse("attr-[State=open]"),
            Ok(VariantKind::Attribute {
                variant: None,
                name: "State".to_owned(),
                value: AttributeValue::Text("open".to_owned()),
            })
        );
        assert_eq!(
            registry.parse("attr-[Disabled=true]"),
            Ok(VariantKind::Attribute {
                variant: None,
                name: "Disabled".to_owned(),
                value: AttributeValue::Bool(true),
            })
        );
        assert_eq!(
            registry.parse("attr-[Level=3]"),
            Ok(VariantKind::Attribute {
                variant: None,
                name: "Level".to_owned(),
                value: AttributeValue::Number(3.0),
            })
        );
        // The first `=` separates, so the rest is compared as written.
        assert_eq!(
            registry.parse("attr-[State=a=b]"),
            Ok(VariantKind::Attribute {
                variant: None,
                name: "State".to_owned(),
                value: AttributeValue::Text("a=b".to_owned()),
            })
        );
    }

    #[test]
    fn reports_each_malformed_attribute_shape_as_itself() {
        let registry = registry();
        let detail = |token: &str| match registry.parse(token) {
            Err(VariantError::MalformedAttribute { detail }) => detail,
            other => panic!("expected a malformed attribute variant, got {other:?}"),
        };

        assert_eq!(detail("attr-["), AttributeVariantError::MissingBrackets);
        assert_eq!(
            detail("attr-[State=open"),
            AttributeVariantError::MissingBrackets
        );
        assert_eq!(
            detail("attr-[State]"),
            AttributeVariantError::MissingSeparator
        );
        assert_eq!(detail("attr-[=open]"), AttributeVariantError::MissingName);
        assert_eq!(detail("attr-[State=]"), AttributeVariantError::MissingValue);
        assert_eq!(
            detail("attr-[St ate=open]"),
            AttributeVariantError::InvalidName {
                name: "St ate".to_owned()
            }
        );
    }

    #[test]
    fn keeps_a_colon_inside_an_attribute_value_out_of_the_split() {
        let registry = registry();
        let (variants, utility) = registry.split("hover:attr-[State=a:b]:bg-blue-600");

        assert_eq!(utility, "bg-blue-600");
        assert_eq!(variants.len(), 2);
        assert_eq!(variants[1].raw, "attr-[State=a:b]");
        assert!(variants[1].kind.is_some());
    }
}
