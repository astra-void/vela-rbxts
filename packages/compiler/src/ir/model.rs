use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub(crate) struct PropEntry {
    pub(crate) name: &'static str,
    pub(crate) value: String,
}

#[derive(Clone, Debug, Serialize)]
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
}

#[derive(Clone, Debug, Serialize, Default)]
pub(crate) struct StyleEffectBundle {
    pub(crate) props: Vec<PropEntry>,
    pub(crate) helpers: Vec<HelperEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub(crate) enum RuntimeCondition {
    All {
        conditions: Vec<RuntimeCondition>,
    },
    Width {
        alias: String,
        #[serde(rename = "minWidth")]
        min_width: u32,
        #[serde(rename = "maxWidth", skip_serializing_if = "Option::is_none")]
        max_width: Option<u32>,
    },
    Orientation {
        value: String,
    },
    Input {
        value: String,
    },
}

#[derive(Clone, Debug, Serialize)]
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
    pub(crate) fn set_prop(&mut self, name: &'static str, value: String) {
        self.base.props.retain(|prop| prop.name != name);
        self.base.props.push(PropEntry { name, value });
    }

    pub(crate) fn remove_prop(&mut self, name: &'static str) {
        self.base.props.retain(|prop| prop.name != name);
    }

    pub(crate) fn set_helper_prop(&mut self, tag: &'static str, name: &'static str, value: String) {
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
