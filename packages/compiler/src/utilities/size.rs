use crate::config::model::TailwindConfig;

#[allow(dead_code)]
pub(crate) fn size_completion_keys(config: &TailwindConfig) -> Vec<String> {
    crate::semantic::utility::size_completion_keys(config)
}
