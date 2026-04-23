use crate::config::model::TailwindConfig;

pub(crate) fn radius_completion_keys(config: &TailwindConfig) -> Vec<String> {
    config.theme.radius.keys().cloned().collect()
}
