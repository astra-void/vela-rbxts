use crate::ir::model::RuntimeCondition;

pub(crate) const RUNTIME_VARIANTS: [&str; 8] = [
    "sm",
    "md",
    "lg",
    "portrait",
    "landscape",
    "touch",
    "mouse",
    "gamepad",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum VariantKind {
    Width {
        alias: String,
        min_width: u32,
        max_width: Option<u32>,
    },
    Orientation {
        value: String,
    },
    Input {
        value: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedVariant {
    pub(crate) raw: String,
    pub(crate) kind: VariantKind,
}

impl ParsedVariant {
    pub(crate) fn runtime_condition(&self) -> RuntimeCondition {
        match &self.kind {
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
        }
    }
}

pub(crate) fn parse_variant_prefix(prefix: &str) -> Option<VariantKind> {
    match prefix {
        "sm" => Some(VariantKind::Width {
            alias: "sm".to_owned(),
            min_width: 640,
            max_width: None,
        }),
        "md" => Some(VariantKind::Width {
            alias: "md".to_owned(),
            min_width: 768,
            max_width: None,
        }),
        "lg" => Some(VariantKind::Width {
            alias: "lg".to_owned(),
            min_width: 1024,
            max_width: None,
        }),
        "portrait" => Some(VariantKind::Orientation {
            value: "portrait".to_owned(),
        }),
        "landscape" => Some(VariantKind::Orientation {
            value: "landscape".to_owned(),
        }),
        "touch" => Some(VariantKind::Input {
            value: "touch".to_owned(),
        }),
        "mouse" => Some(VariantKind::Input {
            value: "mouse".to_owned(),
        }),
        "gamepad" => Some(VariantKind::Input {
            value: "gamepad".to_owned(),
        }),
        _ => None,
    }
}

pub(crate) fn split_variant_prefixes(token: &str) -> Option<(Vec<ParsedVariant>, &str)> {
    let mut variants = Vec::new();
    let mut remainder = token;

    while let Some((prefix, next)) = remainder.split_once(':') {
        let kind = parse_variant_prefix(prefix)?;
        variants.push(ParsedVariant {
            raw: prefix.to_owned(),
            kind,
        });
        remainder = next;
    }

    Some((variants, remainder))
}
