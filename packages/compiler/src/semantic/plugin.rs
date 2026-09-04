use crate::config::model::{PluginUtility, TailwindConfig};
use crate::ir::model::RuntimeCondition;
use crate::semantic::variant::{ParsedVariant, utility_of};

/// How deep one plugin utility may reach through others before the expansion is
/// treated as a cycle the config has to fix.
const MAX_EXPANSION_DEPTH: usize = 8;

#[derive(Clone, Debug)]
pub(crate) enum ExpandedToken {
    /// A token the normal utility pipeline resolves.
    Class {
        token: String,
        /// The plugin utility the token came out of, when it is not written in
        /// the source. Diagnostics are re-pointed at it.
        origin: Option<String>,
    },
    /// A plugin utility that names Roblox properties directly.
    Props {
        origin: String,
        variants: Vec<ParsedVariant>,
        props: Vec<(String, String)>,
    },
}

pub(crate) fn lookup_plugin_utility<'a>(
    config: &'a TailwindConfig,
    name: &str,
) -> Option<&'a PluginUtility> {
    config.plugins.utilities.get(name)
}

/// Rewrites a class token into what the pipeline should actually resolve,
/// pulling plugin utilities in. Everything else passes through untouched.
pub(crate) fn expand_class_token(token: &str, config: &TailwindConfig) -> Vec<ExpandedToken> {
    if config.plugins.utilities.is_empty() {
        return vec![ExpandedToken::Class {
            token: token.to_owned(),
            origin: None,
        }];
    }

    let mut expanded = Vec::new();
    let mut visiting = Vec::new();
    expand_into(token, None, config, &mut visiting, &mut expanded, 0);
    expanded
}

fn expand_into(
    token: &str,
    origin: Option<&str>,
    config: &TailwindConfig,
    visiting: &mut Vec<String>,
    out: &mut Vec<ExpandedToken>,
    depth: usize,
) {
    let base = utility_of(token);

    let Some(utility) = lookup_plugin_utility(config, base) else {
        out.push(ExpandedToken::Class {
            token: token.to_owned(),
            origin: origin.map(str::to_owned),
        });
        return;
    };

    // A utility that reaches itself would otherwise expand forever; the class
    // is dropped and the token is left for the unknown-family diagnostic.
    if depth >= MAX_EXPANSION_DEPTH || visiting.iter().any(|name| name == base) {
        return;
    }

    let origin = origin.unwrap_or(token);

    match utility {
        PluginUtility::Props(props) => out.push(ExpandedToken::Props {
            origin: origin.to_owned(),
            variants: crate::semantic::variant::VariantRegistry::new(config)
                .split(token)
                .0,
            props: props
                .iter()
                .map(|(name, value)| (name.clone(), value.clone()))
                .collect(),
        }),
        PluginUtility::Classes(classes) => {
            let prefix = &token[..token.len() - base.len()];
            visiting.push(base.to_owned());

            for part in classes.split_whitespace() {
                expand_into(
                    &format!("{prefix}{part}"),
                    Some(origin),
                    config,
                    visiting,
                    out,
                    depth + 1,
                );
            }

            visiting.pop();
        }
    }
}

/// The runtime condition a token's variants describe, or the first prefix that
/// could not be read as one.
pub(crate) fn variants_runtime_condition(
    variants: &[ParsedVariant],
) -> Result<Option<RuntimeCondition>, String> {
    if let Some(unknown) = variants.iter().find(|variant| variant.kind.is_none()) {
        return Err(unknown.raw.clone());
    }

    if variants.is_empty() {
        return Ok(None);
    }

    let conditions: Vec<_> = variants
        .iter()
        .filter_map(|variant| variant.runtime_condition())
        .collect();

    Ok(Some(if conditions.len() == 1 {
        conditions
            .into_iter()
            .next()
            .expect("a single condition is present")
    } else {
        RuntimeCondition::All { conditions }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn config_with(utilities: &[(&str, PluginUtility)]) -> TailwindConfig {
        let mut config = TailwindConfig::default();
        config.plugins.utilities = utilities
            .iter()
            .map(|(name, utility)| ((*name).to_owned(), utility.clone()))
            .collect();
        config
    }

    fn props(entries: &[(&str, &str)]) -> PluginUtility {
        PluginUtility::Props(
            entries
                .iter()
                .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
                .collect::<BTreeMap<_, _>>(),
        )
    }

    #[test]
    fn expands_a_class_list_and_carries_the_variants() {
        let config = config_with(&[(
            "btn",
            PluginUtility::Classes("bg-blue-600 hover:bg-blue-700".to_owned()),
        )]);

        let expanded = expand_class_token("md:btn", &config);
        let tokens: Vec<_> = expanded
            .iter()
            .map(|entry| match entry {
                ExpandedToken::Class { token, origin } => (token.clone(), origin.clone()),
                ExpandedToken::Props { .. } => unreachable!(),
            })
            .collect();

        assert_eq!(
            tokens,
            vec![
                ("md:bg-blue-600".to_owned(), Some("md:btn".to_owned())),
                ("md:hover:bg-blue-700".to_owned(), Some("md:btn".to_owned())),
            ]
        );
    }

    #[test]
    fn expands_nested_plugin_utilities() {
        let config = config_with(&[
            ("btn", PluginUtility::Classes("surface px-4".to_owned())),
            ("surface", PluginUtility::Classes("bg-slate-800".to_owned())),
        ]);

        let expanded = expand_class_token("btn", &config);
        assert_eq!(expanded.len(), 2);
        assert!(matches!(
            &expanded[0],
            ExpandedToken::Class { token, .. } if token == "bg-slate-800"
        ));
    }

    #[test]
    fn drops_a_cyclic_expansion() {
        let config = config_with(&[
            ("a", PluginUtility::Classes("b".to_owned())),
            ("b", PluginUtility::Classes("a".to_owned())),
        ]);

        assert!(expand_class_token("a", &config).is_empty());
    }

    #[test]
    fn keeps_property_utilities_with_their_variants() {
        let config = config_with(&[("panel", props(&[("BackgroundTransparency", "0.5")]))]);

        let expanded = expand_class_token("hover:panel", &config);
        let ExpandedToken::Props {
            origin,
            variants,
            props,
        } = &expanded[0]
        else {
            unreachable!()
        };

        assert_eq!(origin, "hover:panel");
        assert_eq!(variants.len(), 1);
        assert_eq!(
            props,
            &vec![("BackgroundTransparency".to_owned(), "0.5".to_owned())]
        );
    }

    #[test]
    fn leaves_ordinary_tokens_alone() {
        let config = config_with(&[("btn", PluginUtility::Classes("px-4".to_owned()))]);

        assert!(matches!(
            &expand_class_token("bg-blue-600", &config)[0],
            ExpandedToken::Class { token, origin } if token == "bg-blue-600" && origin.is_none()
        ));
    }
}
