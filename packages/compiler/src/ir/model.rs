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
    /// The CollectionService tags `group` and `peer` markers lower to, which
    /// `group-*` and `peer-*` find this instance by.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) markers: Vec<String>,
    /// Classes no rule bundle can carry, such as a margin or a transition under a
    /// variant, forwarded to the runtime host as a class value of their own.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub(crate) runtime_classes: Vec<String>,
    /// What the base's grid tokens fed into `CellSize`, kept for the runtime in
    /// case a rule or a class value it resolves moves the grid or its gap.
    #[serde(skip)]
    pub(crate) grid_inputs: Vec<PropEntry>,
    /// The same for the base's size axes and the automatic size between them.
    #[serde(skip)]
    pub(crate) size_inputs: Vec<PropEntry>,
    #[serde(skip)]
    pub(crate) transform_inputs: Option<TransformInputs>,
}

/// The base's translate axes, and the AnchorPoint and Position it has without them.
#[derive(Clone, Debug, Default)]
pub(crate) struct TransformInputs {
    pub(crate) translate: Vec<PropEntry>,
    pub(crate) anchor: Option<String>,
    pub(crate) position: Option<String>,
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
    /// A state of the nearest ancestor tagged with the group marker, the named
    /// one when `name` is set. The inner condition is what is read off it.
    Group {
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        condition: Box<RuntimeCondition>,
    },
    /// The same over any same-parent sibling tagged with the peer marker.
    Peer {
        #[serde(skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        condition: Box<RuntimeCondition>,
    },
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

/// Above every breakpoint rank, where Tailwind registers orientation, `dark`
/// and the pointer variants.
const AFTER_SCREENS: u64 = 1 << 33;

impl RuntimeCondition {
    /// Where a rule ranks when several write one property, the order Tailwind's
    /// stylesheet gives them: unconditional first, then a state such as `hover:`,
    /// then breakpoints by their minimum width, then orientation, `dark:` and the
    /// input variants. Equal ranks keep source order.
    pub(crate) fn precedence(&self) -> u64 {
        match self {
            Self::All { conditions } => conditions.iter().map(Self::precedence).max().unwrap_or(0),
            Self::Test { .. } => 0,
            Self::Width { min_width, .. } => 2 + u64::from(*min_width),
            Self::Orientation { .. } => AFTER_SCREENS,
            Self::ColorScheme { .. } => AFTER_SCREENS + 1,
            Self::Input { .. } => AFTER_SCREENS + 2,
            _ => 1,
        }
    }
}

/// Stable, so rules of one rank keep the order they were written in.
pub(crate) fn sort_rules_by_precedence(rules: &mut [RuntimeRule]) {
    rules.sort_by_key(|rule| rule.condition.precedence());
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

    /// The bundle of the rule that always applies, first so every other rule
    /// overwrites it, made when there is none yet.
    pub(crate) fn always_on_effects(&mut self) -> &mut StyleEffectBundle {
        let always_on = matches!(
            self.runtime_rules.first(),
            Some(RuntimeRule {
                condition: RuntimeCondition::All { conditions },
                ..
            }) if conditions.is_empty()
        );
        if !always_on {
            self.runtime_rules.insert(
                0,
                RuntimeRule {
                    condition: RuntimeCondition::All {
                        conditions: Vec::new(),
                    },
                    effects: StyleEffectBundle::default(),
                },
            );
        }
        &mut self.runtime_rules[0].effects
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
