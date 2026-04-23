use crate::config::model::TailwindConfig;

#[allow(dead_code)]
pub(crate) fn spacing_completion_keys(config: &TailwindConfig) -> Vec<String> {
    crate::semantic::utility::spacing_completion_keys(config)
}
