use crate::config::model::TailwindConfig;

#[allow(dead_code)]
pub(crate) fn radius_completion_keys(config: &TailwindConfig) -> Vec<String> {
    crate::semantic::utility::radius_completion_keys(config)
}
