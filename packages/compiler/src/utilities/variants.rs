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

pub(crate) fn split_variant_prefixes(token: &str) -> Option<(Vec<String>, &str)> {
    let mut variants = Vec::new();
    let mut remainder = token;

    while let Some((prefix, next)) = remainder.split_once(':') {
        if parse_runtime_prefix(prefix).is_none() {
            return None;
        }
        variants.push(prefix.to_owned());
        remainder = next;
    }

    Some((variants, remainder))
}

pub(crate) fn parse_runtime_variant_token(token: &str) -> Option<(RuntimeCondition, &str)> {
    let mut prefixes = Vec::new();
    let mut remainder = token;

    while let Some((prefix, next)) = remainder.split_once(':') {
        let condition = parse_runtime_prefix(prefix)?;
        prefixes.push(condition);
        remainder = next;
    }

    if prefixes.is_empty() {
        return None;
    }

    let condition = if prefixes.len() == 1 {
        prefixes.into_iter().next().unwrap()
    } else {
        RuntimeCondition::All {
            conditions: prefixes,
        }
    };

    Some((condition, remainder))
}

pub(crate) fn parse_runtime_prefix(prefix: &str) -> Option<RuntimeCondition> {
    match prefix {
        "sm" => Some(RuntimeCondition::Width {
            alias: "sm".to_owned(),
            min_width: 640,
            max_width: None,
        }),
        "md" => Some(RuntimeCondition::Width {
            alias: "md".to_owned(),
            min_width: 768,
            max_width: None,
        }),
        "lg" => Some(RuntimeCondition::Width {
            alias: "lg".to_owned(),
            min_width: 1024,
            max_width: None,
        }),
        "portrait" => Some(RuntimeCondition::Orientation {
            value: "portrait".to_owned(),
        }),
        "landscape" => Some(RuntimeCondition::Orientation {
            value: "landscape".to_owned(),
        }),
        "touch" => Some(RuntimeCondition::Input {
            value: "touch".to_owned(),
        }),
        "mouse" => Some(RuntimeCondition::Input {
            value: "mouse".to_owned(),
        }),
        "gamepad" => Some(RuntimeCondition::Input {
            value: "gamepad".to_owned(),
        }),
        _ => None,
    }
}
