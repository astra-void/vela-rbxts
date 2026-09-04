use crate::api::Diagnostic;
#[cfg(not(target_arch = "wasm32"))]
use crate::api::EditorOptions;
use crate::config::defaults::default_config;
use crate::config::merge::resolve_config_input as merge_resolve_config_input;
use crate::config::model::{TailwindConfig, TailwindConfigInput};

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn parse_config(config_json: Option<&str>) -> TailwindConfig {
    parse_config_with_diagnostic(config_json).0
}

/// Falls back to the default theme on malformed JSON, reporting the failure so
/// direct napi consumers do not get their config silently ignored.
pub(crate) fn parse_config_with_diagnostic(
    config_json: Option<&str>,
) -> (TailwindConfig, Vec<Diagnostic>) {
    let Some(value) = config_json else {
        return (default_config(), Vec::new());
    };

    match parse_config_json(value) {
        Ok(mut config) => {
            let diagnostics = prune_invalid_variants(&mut config);
            (config, diagnostics)
        }
        Err(error) => (
            default_config(),
            vec![Diagnostic {
                level: "error".to_owned(),
                code: "invalid-config-json".to_owned(),
                message: format!(
                    "configJson is not a valid vela config ({error}); compiling against the default theme instead."
                ),
                token: None,
                range: None,
            }],
        ),
    }
}

/// Drops registrations vela would read as something else. `addVariant` rejects
/// them where they are written, so only a hand-written JSON config gets here,
/// and a name left standing would shadow a built-in prefix silently.
fn prune_invalid_variants(config: &mut TailwindConfig) -> Vec<Diagnostic> {
    let screens = config.theme.screens.clone();
    let invalid: Vec<(String, &'static str)> = config
        .plugins
        .variants
        .keys()
        .filter_map(|name| {
            crate::semantic::variant::custom_variant_problem(name, &screens)
                .map(|reason| (name.clone(), reason))
        })
        .collect();

    invalid
        .into_iter()
        .map(|(name, reason)| {
            config.plugins.variants.remove(&name);
            crate::diagnostics::compiler::invalid_custom_variant_diagnostic(&name, reason)
        })
        .collect()
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn parse_editor_config(options: Option<&EditorOptions>) -> TailwindConfig {
    parse_config(options.and_then(|value| value.config_json.as_deref()))
}

pub(crate) fn parse_config_json(value: &str) -> Result<TailwindConfig, serde_json::Error> {
    // A resolved config and an authoring-shaped one overlap, and the resolved
    // shape ignores the keys it has no field for, so a config written with
    // `presets` or `theme.extend` would otherwise parse as a resolved one with
    // those keys silently dropped.
    if names_authoring_only_keys(value) {
        return serde_json::from_str::<TailwindConfigInput>(value)
            .map(|input| merge_resolve_config_input(input, &default_config()));
    }

    serde_json::from_str::<TailwindConfig>(value).or_else(|_| {
        serde_json::from_str::<TailwindConfigInput>(value)
            .map(|input| merge_resolve_config_input(input, &default_config()))
    })
}

fn names_authoring_only_keys(value: &str) -> bool {
    // A resolved config carries neither key, and this runs on every transform,
    // so the scan comes before the parse rather than the other way round.
    if !value.contains("\"presets\"") && !value.contains("\"extend\"") {
        return false;
    }

    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(value) else {
        return false;
    };

    parsed.get("presets").is_some()
        || parsed
            .get("theme")
            .and_then(|theme| theme.get("extend"))
            .is_some()
}

pub(crate) use crate::config::merge::resolve_config_input;
