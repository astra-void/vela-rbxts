use crate::config::model::TailwindConfig;

#[allow(dead_code)]
pub(crate) fn color_completion_keys(config: &TailwindConfig) -> Vec<String> {
    crate::semantic::utility::color_completion_keys(config)
}
