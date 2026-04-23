use crate::config::model::TailwindConfig;

pub(crate) fn radius_completion_keys(config: &TailwindConfig) -> Vec<String> {
    config.theme.radius.keys().cloned().collect()
}

pub(crate) fn resolve_radius_value(config: &TailwindConfig, key: &str) -> Option<String> {
    config.theme.radius.get(key).cloned()
}
