use crate::api::EditorOptions;
use crate::config::defaults::default_config;
use crate::config::merge::resolve_config_input as merge_resolve_config_input;
use crate::config::model::{TailwindConfig, TailwindConfigInput};

pub(crate) fn parse_config(config_json: Option<&str>) -> TailwindConfig {
    config_json
        .and_then(parse_config_json)
        .unwrap_or_else(default_config)
}

pub(crate) fn parse_editor_config(options: Option<&EditorOptions>) -> TailwindConfig {
    parse_config(options.and_then(|value| value.config_json.as_deref()))
}

pub(crate) fn parse_config_json(value: &str) -> Option<TailwindConfig> {
    serde_json::from_str::<TailwindConfig>(value)
        .ok()
        .or_else(|| {
            serde_json::from_str::<TailwindConfigInput>(value)
                .ok()
                .map(|input| merge_resolve_config_input(input, &default_config()))
        })
}

pub(crate) use crate::config::merge::resolve_config_input;
