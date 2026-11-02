use std::collections::{BTreeMap, BTreeSet};

use crate::config::model::TailwindConfig;
use crate::ir::model::{
    DivideSpec, MarginSpec, RuntimeCondition, RuntimeRule, StyleEffectBundle, StyleIr, TextSpec,
    TransitionSpec,
};
use crate::semantic::analyze::analyze_class_token;
use crate::semantic::utility::UtilityKind;
use crate::semantic::variant::{VariantRegistry, utility_of};
use crate::transform::opacity::static_opacity_alpha;
use crate::transform::runtime::resolve_class_tokens;

// Every suspect costs a full re-resolve, paid on each keystroke.
const MAX_CLASSES: usize = 64;

pub(crate) struct OverriddenClass {
    pub(crate) index: usize,
    pub(crate) message: String,
}

/// Resolves with and without each class, so merged axes and flush defaults count as they lower.
pub(crate) fn overridden_classes(
    tokens: &[&str],
    config: &TailwindConfig,
    element_tag: Option<&str>,
) -> Vec<OverriddenClass> {
    if tokens.len() < 2 || tokens.len() > MAX_CLASSES {
        return Vec::new();
    }

    let resolver = Resolver {
        config,
        element_tag,
        variants: VariantRegistry::new(config),
    };
    let slots: Vec<BTreeSet<Slot>> = tokens.iter().map(|token| resolver.slots(token)).collect();
    let whole = resolver.canon(tokens);
    let is_transition = |token: &str| resolver.kind(token) == UtilityKind::Transition;
    let mut overridden = Vec::new();

    for index in 0..tokens.len() {
        let rivals: Vec<usize> = (index + 1..tokens.len())
            .filter(|later| !slots[index].is_disjoint(&slots[*later]))
            .collect();
        if rivals.is_empty() {
            continue;
        }

        // `duration-*`, `ease-*` and `delay-*` only imply the enable `transition` writes.
        let only_implied = is_transition(tokens[index])
            && !rivals.iter().any(|rival| is_transition(tokens[*rival]));
        if only_implied {
            continue;
        }

        let without: Vec<&str> = tokens
            .iter()
            .enumerate()
            .filter(|(other, _)| *other != index)
            .map(|(_, token)| *token)
            .collect();
        if resolver.canon(&without) != whole {
            continue;
        }

        // Spares the later copy of a duplicate and a class that does nothing anywhere.
        if resolver.canon(&tokens[..=index]) == resolver.canon(&tokens[..index]) {
            continue;
        }

        let blame = resolver.blame(tokens, index, rivals);
        overridden.push(OverriddenClass {
            index,
            message: resolver.message(tokens, index, &blame),
        });
    }

    overridden
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Key {
    Prop(String),
    /// `None` is the instance itself, created even when every prop it names is written elsewhere.
    Helper(&'static str, Option<String>),
    Spec(&'static str),
}

/// A key and the canonical condition it is written under, `None` for the base.
type Slot = (Option<String>, Key);

#[derive(PartialEq)]
struct CanonBundle {
    props: BTreeMap<String, String>,
    helpers: BTreeMap<&'static str, BTreeMap<String, String>>,
}

impl CanonBundle {
    fn new(bundle: StyleEffectBundle) -> Self {
        Self {
            props: bundle
                .props
                .into_iter()
                .map(|prop| (prop.name.into_owned(), prop.value))
                .collect(),
            helpers: bundle
                .helpers
                .into_iter()
                .map(|helper| {
                    let props = helper
                        .props
                        .into_iter()
                        .map(|prop| (prop.name.into_owned(), prop.value))
                        .collect();
                    (helper.tag, props)
                })
                .collect(),
        }
    }

    fn keys(&self) -> Vec<Key> {
        let props = self.props.keys().map(|name| Key::Prop(name.clone()));
        let helpers = self.helpers.iter().flat_map(|(&tag, props)| {
            std::iter::once(Key::Helper(tag, None)).chain(
                props
                    .keys()
                    .map(move |name| Key::Helper(tag, Some(name.clone()))),
            )
        });
        props.chain(helpers).collect()
    }

    fn drop_keys(&mut self, dead: &BTreeSet<Key>) {
        self.props
            .retain(|name, _| !dead.contains(&Key::Prop(name.clone())));
        self.helpers.retain(|&tag, props| {
            props.retain(|name, _| !dead.contains(&Key::Helper(tag, Some(name.clone()))));
            !props.is_empty() || !dead.contains(&Key::Helper(tag, None))
        });
    }

    fn is_empty(&self) -> bool {
        self.props.is_empty() && self.helpers.is_empty()
    }
}

#[derive(PartialEq)]
struct CanonStyle {
    base: CanonBundle,
    rules: Vec<(String, CanonBundle)>,
    runtime_class_value: bool,
    transition: Option<TransitionSpec>,
    animation: Option<String>,
    text: Option<TextSpec>,
    margin: Option<MarginSpec>,
    divide: Option<DivideSpec>,
    opacity_alpha: Option<f64>,
    /// The fade a host hands its subtree, which lowers outside the element's own style.
    subtree_alpha: Option<f64>,
    markers: BTreeSet<String>,
    /// Forwarded classes, composed per canonical condition the way the runtime composes them.
    classes: BTreeMap<String, CanonSpecs>,
}

#[derive(PartialEq)]
struct CanonSpecs {
    /// What the group writes as props, such as the Position shift of a negative margin.
    base: CanonBundle,
    transition: Option<TransitionSpec>,
    animation: Option<String>,
    text: Option<TextSpec>,
    margin: Option<MarginSpec>,
    divide: Option<DivideSpec>,
}

impl CanonSpecs {
    fn present(&self) -> [(&'static str, bool); 5] {
        [
            ("transition", self.transition.is_some()),
            ("animation", self.animation.is_some()),
            ("text", self.text.is_some()),
            ("margin", self.margin.is_some()),
            ("divide", self.divide.is_some()),
        ]
    }
}

impl CanonStyle {
    fn new(
        style: StyleIr,
        classes: BTreeMap<String, CanonSpecs>,
        subtree_alpha: Option<f64>,
    ) -> Self {
        let mut canon = Self {
            base: CanonBundle::new(style.base),
            rules: canon_rules(style.runtime_rules),
            runtime_class_value: style.runtime_class_value,
            transition: style.transition,
            animation: style.animation,
            text: style.text,
            margin: style.margin,
            divide: style.divide,
            opacity_alpha: style.opacity_alpha,
            subtree_alpha,
            markers: style.markers.into_iter().collect(),
            classes,
        };
        canon.drop_default_transparency();
        canon
    }

    /// A solid color writes the instance default `0` to take back an earlier `/N`, which changes
    /// nothing when no write anywhere leaves that channel at another value.
    fn drop_default_transparency(&mut self) {
        let names: BTreeSet<String> = std::iter::once(&self.base)
            .chain(self.rules.iter().map(|(_, bundle)| bundle))
            .flat_map(|bundle| bundle.props.keys())
            .filter(|name| name.ends_with("Transparency"))
            .cloned()
            .collect();

        for name in names {
            let only_default = std::iter::once(&self.base)
                .chain(self.rules.iter().map(|(_, bundle)| bundle))
                .filter_map(|bundle| bundle.props.get(&name))
                .all(|value| value == "0");
            if !only_default {
                continue;
            }

            self.base.props.remove(&name);
            for (_, bundle) in &mut self.rules {
                bundle.props.remove(&name);
            }
        }

        self.rules.retain(|(_, bundle)| !bundle.is_empty());
    }
}

/// Drops only keys a later rule under the same condition rewrites; other conditions overlap partially.
fn canon_rules(rules: Vec<RuntimeRule>) -> Vec<(String, CanonBundle)> {
    let mut rules: Vec<(String, CanonBundle)> = rules
        .into_iter()
        .map(|rule| {
            (
                condition_key(&rule.condition),
                CanonBundle::new(rule.effects),
            )
        })
        .collect();
    let mut written: BTreeMap<String, BTreeSet<Key>> = BTreeMap::new();

    for (condition, bundle) in rules.iter_mut().rev() {
        let later = written.entry(condition.clone()).or_default();
        let own = bundle.keys();
        bundle.drop_keys(later);
        later.extend(own);
    }

    rules.retain(|(_, bundle)| !bundle.is_empty());
    rules
}

/// `md:hover:` and `hover:md:` build `All` in written order, so the parts compare as a set.
fn condition_key(condition: &RuntimeCondition) -> String {
    fn flatten(condition: &RuntimeCondition, parts: &mut BTreeSet<String>) {
        match condition {
            RuntimeCondition::All { conditions } => {
                for condition in conditions {
                    flatten(condition, parts);
                }
            }
            leaf => {
                parts.insert(serde_json::to_string(leaf).unwrap_or_default());
            }
        }
    }

    let mut parts = BTreeSet::new();
    flatten(condition, &mut parts);
    parts.into_iter().collect::<Vec<_>>().join("&")
}

struct Resolver<'a> {
    config: &'a TailwindConfig,
    element_tag: Option<&'a str>,
    variants: VariantRegistry<'a>,
}

impl Resolver<'_> {
    fn kind(&self, token: &str) -> UtilityKind {
        analyze_class_token(token, &self.variants).utility
    }

    fn canon(&self, tokens: &[&str]) -> CanonStyle {
        // The editor already reported each class on its own.
        let mut scratch = Vec::new();
        let mut style = resolve_class_tokens(
            tokens.iter().copied(),
            self.config,
            self.element_tag,
            &mut scratch,
        );
        let classes = self.canon_classes(std::mem::take(&mut style.runtime_classes));
        // A CanvasGroup composites its subtree, so `GroupTransparency` already carries the fade.
        let subtree_alpha = (self.element_tag != Some("canvasgroup"))
            .then(|| static_opacity_alpha(tokens.iter().copied(), self.config))
            .flatten();
        CanonStyle::new(style, classes, subtree_alpha)
    }

    fn canon_classes(&self, classes: Vec<String>) -> BTreeMap<String, CanonSpecs> {
        let mut groups: BTreeMap<String, Vec<String>> = BTreeMap::new();
        for class in classes {
            let analysis = analyze_class_token(&class, &self.variants);
            let condition = analysis
                .runtime_condition
                .as_ref()
                .map(condition_key)
                .unwrap_or_default();
            groups
                .entry(condition)
                .or_default()
                .push(utility_of(&class).to_owned());
        }

        groups
            .into_iter()
            .filter_map(|(condition, utilities)| {
                let style =
                    resolve_class_tokens(utilities, self.config, self.element_tag, &mut Vec::new());
                let specs = CanonSpecs {
                    base: CanonBundle::new(style.base),
                    transition: style.transition,
                    animation: style.animation,
                    text: style.text,
                    margin: style.margin,
                    divide: style.divide,
                };
                (!specs.base.is_empty() || specs.present().iter().any(|(_, present)| *present))
                    .then_some((condition, specs))
            })
            .collect()
    }

    /// Only a later class sharing one of these slots can override this one.
    fn slots(&self, token: &str) -> BTreeSet<Slot> {
        let style = self.canon(&[token]);
        let mut slots: BTreeSet<Slot> = style
            .base
            .keys()
            .into_iter()
            .map(|key| (None, key))
            .collect();

        for (condition, bundle) in &style.rules {
            slots.extend(
                bundle
                    .keys()
                    .into_iter()
                    .map(|key| (Some(condition.clone()), key)),
            );
        }

        let specs = [
            ("transition", style.transition.is_some()),
            ("animation", style.animation.is_some()),
            ("text", style.text.is_some()),
            ("margin", style.margin.is_some()),
            ("divide", style.divide.is_some()),
            (
                "opacity",
                style.opacity_alpha.is_some() || style.subtree_alpha.is_some(),
            ),
        ];
        slots.extend(
            specs
                .into_iter()
                .filter(|(_, present)| *present)
                .map(|(name, _)| (None, Key::Spec(name))),
        );

        // A divide color paints nothing without an axis, yet it still contends for the spec.
        let analysis = analyze_class_token(token, &self.variants);
        if analysis.utility == UtilityKind::DivideColor {
            let condition = analysis.runtime_condition.as_ref().map(condition_key);
            slots.insert((condition, Key::Spec("divide")));
        }

        for (condition, specs) in &style.classes {
            let condition = (!condition.is_empty()).then(|| condition.clone());
            slots.extend(
                specs
                    .base
                    .keys()
                    .into_iter()
                    .map(|key| (condition.clone(), key)),
            );
            slots.extend(
                specs
                    .present()
                    .into_iter()
                    .filter(|(_, present)| *present)
                    .map(|(name, _)| (condition.clone(), Key::Spec(name))),
            );
        }

        slots
    }

    /// Drops the earliest rivals first, so the class that finally wins is the one named.
    fn blame(&self, tokens: &[&str], index: usize, mut rivals: Vec<usize>) -> Vec<usize> {
        let hides = |rivals: &[usize]| {
            let mut without = tokens[..index].to_vec();
            without.extend(rivals.iter().map(|rival| tokens[*rival]));
            let mut with = tokens[..=index].to_vec();
            with.extend(rivals.iter().map(|rival| tokens[*rival]));
            self.canon(&with) == self.canon(&without)
        };

        if !hides(&rivals) {
            return Vec::new();
        }

        let mut cursor = 0;
        while cursor < rivals.len() {
            let mut fewer = rivals.clone();
            fewer.remove(cursor);
            if !fewer.is_empty() && hides(&fewer) {
                rivals = fewer;
            } else {
                cursor += 1;
            }
        }

        rivals
    }

    fn message(&self, tokens: &[&str], index: usize, blame: &[usize]) -> String {
        let token = tokens[index];

        if blame.iter().any(|blamed| tokens[*blamed] == token) {
            return format!("\"{token}\" is repeated later, so this one has no effect.");
        }

        if blame.is_empty() {
            return format!(
                "\"{token}\" has no effect: later classes under the same conditions override every property it sets."
            );
        }

        let is_gradient = |token: &str| {
            let analysis = analyze_class_token(token, &self.variants);
            !analysis.runtime_aware
                && matches!(
                    analysis.utility,
                    UtilityKind::GradientDirection
                        | UtilityKind::GradientFrom
                        | UtilityKind::GradientVia
                        | UtilityKind::GradientTo
                )
        };

        // The forced white base is a lowering detail, so name the gradient, not the stop that flushed it.
        if !is_gradient(token) && blame.iter().all(|blamed| is_gradient(tokens[*blamed])) {
            let gradient: Vec<&str> = tokens[index + 1..]
                .iter()
                .copied()
                .filter(|later| is_gradient(later))
                .collect();
            return format!(
                "\"{token}\" has no effect: the gradient {} sets BackgroundColor3 to white so UIGradient can tint it.",
                quoted_list(&gradient)
            );
        }

        let names: Vec<&str> = blame.iter().map(|blamed| tokens[*blamed]).collect();
        let verb = if names.len() == 1 {
            "overrides"
        } else {
            "override"
        };
        format!(
            "\"{token}\" has no effect: {} {verb} every property it sets under the same conditions.",
            quoted_list(&names)
        )
    }
}

fn quoted_list(names: &[&str]) -> String {
    let quoted: Vec<String> = names.iter().map(|name| format!("\"{name}\"")).collect();
    match quoted.split_last() {
        Some((last, rest)) if !rest.is_empty() => format!("{} and {last}", rest.join(", ")),
        _ => quoted.concat(),
    }
}
