use serde::Serialize;
use std::borrow::Cow;

/// Owned rather than `&'static str` because a plugin utility names its props in
/// the project's own config.
pub(crate) type PropName = Cow<'static, str>;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct PropEntry {
    pub(crate) name: PropName,
    pub(crate) value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct HelperEntry {
    pub(crate) tag: &'static str,
    pub(crate) props: Vec<PropEntry>,
}

#[derive(Clone, Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StyleIr {
    pub(crate) base: StyleEffectBundle,
    pub(crate) runtime_rules: Vec<RuntimeRule>,
    pub(crate) runtime_class_value: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) transition: Option<TransitionSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) animation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) text: Option<TextSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) margin: Option<MarginSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) divide: Option<DivideSpec>,
    /// What an `opacity-*` came to on a component element. There is no tag there
    /// to name a transparency channel against, so the alpha is carried instead
    /// and handed to whatever the component renders.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) opacity_alpha: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct DivideSpec {
    pub(crate) axis: String,
    pub(crate) thickness: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) transparency: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct MarginSpec {
    pub(crate) top: f64,
    pub(crate) right: f64,
    pub(crate) bottom: f64,
    pub(crate) left: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct TextSpec {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) transform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) decoration: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct TransitionSpec {
    pub(crate) time: f64,
    pub(crate) style: String,
    pub(crate) direction: String,
    pub(crate) delay: f64,
    pub(crate) property: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Default)]
pub(crate) struct StyleEffectBundle {
    pub(crate) props: Vec<PropEntry>,
    pub(crate) helpers: Vec<HelperEntry>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(crate) enum RuntimeCondition {
    All {
        conditions: Vec<RuntimeCondition>,
    },
    Width {
        alias: String,
        #[serde(rename = "minWidth")]
        min_width: u32,
        /// Exclusive, so `md:` and `max-md:` partition every viewport between
        /// them instead of overlapping at the breakpoint itself.
        #[serde(rename = "maxWidth", skip_serializing_if = "Option::is_none")]
        max_width: Option<u32>,
    },
    Orientation {
        value: String,
    },
    Input {
        value: String,
    },
    ColorScheme {
        value: String,
    },
    Hover,
    Active,
    Focus,
    /// A Roblox attribute on the styled instance, named either by a registered
    /// variant or by an inline `attr-[…]`. The runtime subscribes to the
    /// attribute only where a rule reads it.
    Attribute {
        name: String,
        value: crate::config::model::AttributeValue,
    },
    /// A branch of a class value this pass read but could not decide. The test
    /// travels as `__velaTests` and the condition names it by index, so the
    /// expression is evaluated once however many branches hang on it.
    Test {
        index: usize,
        expected: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub(crate) struct RuntimeRule {
    pub(crate) condition: RuntimeCondition,
    pub(crate) effects: StyleEffectBundle,
}

#[derive(Clone)]
pub(crate) struct SizeAxisValue {
    pub(crate) scale: String,
    pub(crate) offset: String,
}

impl SizeAxisValue {
    pub(crate) fn offset(offset: impl Into<String>) -> Self {
        Self {
            scale: "0".to_owned(),
            offset: offset.into(),
        }
    }

    pub(crate) fn scale(scale: impl Into<String>) -> Self {
        Self {
            scale: scale.into(),
            offset: "0".to_owned(),
        }
    }

    pub(crate) fn zero() -> Self {
        Self::offset("0")
    }
}

impl StyleIr {
    pub(crate) fn set_prop(&mut self, name: impl Into<PropName>, value: String) {
        let name = name.into();
        self.base.props.retain(|prop| prop.name != name);
        self.base.props.push(PropEntry { name, value });
    }

    pub(crate) fn remove_prop(&mut self, name: &str) {
        self.base.props.retain(|prop| prop.name != name);
    }

    pub(crate) fn set_helper_prop(
        &mut self,
        tag: &'static str,
        name: impl Into<PropName>,
        value: String,
    ) {
        let name = name.into();

        if let Some(helper) = self
            .base
            .helpers
            .iter_mut()
            .find(|helper| helper.tag == tag)
        {
            helper.props.retain(|prop| prop.name != name);
            helper.props.push(PropEntry { name, value });
            return;
        }

        self.base.helpers.push(HelperEntry {
            tag,
            props: vec![PropEntry { name, value }],
        });
    }
}
