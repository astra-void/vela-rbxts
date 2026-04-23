use crate::config::model::{TailwindConfig, TailwindConfigInput};
use crate::config::resolve::resolve_config_input;
use std::sync::OnceLock;

const DEFAULT_CONFIG_JSON: &str = include_str!("../../../config/src/defaults.json");
static DEFAULT_CONFIG: OnceLock<TailwindConfig> = OnceLock::new();

pub(crate) fn default_config() -> TailwindConfig {
    default_config_ref().clone()
}

pub(crate) fn default_config_ref() -> &'static TailwindConfig {
    DEFAULT_CONFIG.get_or_init(|| {
        serde_json::from_str::<TailwindConfig>(DEFAULT_CONFIG_JSON)
            .or_else(|_| {
                serde_json::from_str::<TailwindConfigInput>(DEFAULT_CONFIG_JSON)
                    .map(|input| resolve_config_input(input, &TailwindConfig::default()))
            })
            .expect(
                "packages/config/src/defaults.json must be valid TailwindConfig-compatible JSON",
            )
    })
}
