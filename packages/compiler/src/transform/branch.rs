use crate::api::Diagnostic;
use crate::class_value::collapse::{
    BranchCondition, ClassValueCollapse, ClassValueSegment, branch_context_tokens,
};
use crate::config::model::TailwindConfig;
use crate::ir::model::{
    HelperEntry, PropEntry, RuntimeCondition, RuntimeRule, StyleEffectBundle, StyleIr,
};
use crate::transform::opacity::branch_opacity_needs_runtime;
use crate::transform::runtime::resolve_class_tokens;

pub(crate) struct LoweredBranches {
    pub(crate) rules: Vec<RuntimeRule>,
    pub(crate) diagnostics: Vec<Diagnostic>,
}

/// Resolves every branch of a class value the way the static path resolves the
/// tokens around it, and hands the difference to the runtime host as rules the
/// tests decide. `None` when a branch names something a rule cannot carry, and
/// the class value goes back to the runtime as it was written.
pub(crate) fn lower_branches(
    collapse: &ClassValueCollapse,
    base: &StyleIr,
    config: &TailwindConfig,
    element_tag: Option<&str>,
) -> Option<LoweredBranches> {
    // The fade a bare `opacity-*` asks for reaches past this element, and a rule
    // only ever reaches the element. Caught here rather than in `diff_effects`,
    // which compares `opacity_alpha` — a host has none, because its fade lowers
    // to a transparency prop and a wrapper around its children.
    if branch_opacity_needs_runtime(collapse, element_tag, config) {
        return None;
    }

    let mut rules = Vec::new();
    let mut diagnostics: Vec<Diagnostic> = Vec::new();

    for (index, segment) in collapse.segments.iter().enumerate() {
        let ClassValueSegment::Branch(branch) = segment else {
            continue;
        };

        let mut branch_diagnostics = Vec::new();
        // The branch is resolved among the tokens written around it, so a size
        // axis it completes still lands as one prop rather than overwriting one.
        let style = resolve_class_tokens(
            branch_context_tokens(&collapse.segments, index),
            config,
            element_tag,
            &mut branch_diagnostics,
        );

        let effects = diff_effects(base, &style)?;
        let condition = branch_condition(&branch.conditions);

        if !effects.props.is_empty() || !effects.helpers.is_empty() {
            rules.push(RuntimeRule {
                condition: condition.clone(),
                effects,
            });
        }

        // A variant inside a branch answers to both, so the two conditions meet.
        for rule in diff_rules(base, &style) {
            rules.push(RuntimeRule {
                condition: conjoin(condition.clone(), rule.condition),
                effects: rule.effects,
            });
        }

        diagnostics.extend(branch_diagnostics.into_iter().filter(|diagnostic| {
            diagnostic
                .token
                .as_deref()
                .is_some_and(|token| branch.tokens.iter().any(|own| own == token))
        }));
    }

    Some(LoweredBranches { rules, diagnostics })
}

/// A helper is one instance, and the host renders whatever the resolution came
/// to alongside the children it was handed. A base helper a rule also names
/// would arrive twice — as a child here and as a resolved helper there — so it
/// joins the resolution instead, where the two merge by tag.
pub(crate) fn hoist_helpers_shared_with_rules(style: &mut StyleIr) {
    let touched: Vec<&'static str> = style
        .runtime_rules
        .iter()
        .flat_map(|rule| rule.effects.helpers.iter().map(|helper| helper.tag))
        .collect();

    if touched.is_empty() {
        return;
    }

    let (hoisted, kept): (Vec<_>, Vec<_>) = std::mem::take(&mut style.base.helpers)
        .into_iter()
        .partition(|helper| touched.contains(&helper.tag));
    style.base.helpers = kept;

    if hoisted.is_empty() {
        return;
    }

    // No condition at all, so it stands under every rule that overwrites it.
    style.runtime_rules.insert(
        0,
        RuntimeRule {
            condition: RuntimeCondition::All {
                conditions: Vec::new(),
            },
            effects: StyleEffectBundle {
                props: Vec::new(),
                helpers: hoisted,
            },
        },
    );
}

fn branch_condition(conditions: &[BranchCondition]) -> RuntimeCondition {
    let mut conditions = conditions.iter().map(|condition| RuntimeCondition::Test {
        index: condition.test,
        expected: condition.expected,
    });

    match conditions.len() {
        1 => conditions
            .next()
            .expect("a branch carries at least one condition"),
        _ => RuntimeCondition::All {
            conditions: conditions.collect(),
        },
    }
}

fn conjoin(left: RuntimeCondition, right: RuntimeCondition) -> RuntimeCondition {
    let mut conditions = flatten(left);
    conditions.extend(flatten(right));

    RuntimeCondition::All { conditions }
}

fn flatten(condition: RuntimeCondition) -> Vec<RuntimeCondition> {
    match condition {
        RuntimeCondition::All { conditions } => conditions,
        condition => vec![condition],
    }
}

/// What the branch adds on top of the tokens that always apply. `None` when the
/// branch reaches past what a rule bundle can carry: an effect the host reads
/// off its own props rather than off the resolution, or a prop it would have to
/// take back rather than overwrite.
fn diff_effects(base: &StyleIr, branch: &StyleIr) -> Option<StyleEffectBundle> {
    if branch.text != base.text
        || branch.margin != base.margin
        || branch.divide != base.divide
        || branch.transition != base.transition
        || branch.animation != base.animation
        || branch.opacity_alpha != base.opacity_alpha
        || branch.markers != base.markers
        || branch.runtime_classes != base.runtime_classes
    {
        return None;
    }

    if base.base.props.iter().any(|prop| {
        !branch
            .base
            .props
            .iter()
            .any(|entry| entry.name == prop.name)
    }) {
        return None;
    }

    let props = added_props(&base.base.props, &branch.base.props);
    let mut helpers = Vec::new();

    for helper in &branch.base.helpers {
        let Some(base_helper) = base
            .base
            .helpers
            .iter()
            .find(|entry| entry.tag == helper.tag)
        else {
            helpers.push(helper.clone());
            continue;
        };

        if base_helper
            .props
            .iter()
            .any(|prop| !helper.props.iter().any(|entry| entry.name == prop.name))
        {
            return None;
        }

        let props = added_props(&base_helper.props, &helper.props);
        if !props.is_empty() {
            helpers.push(HelperEntry {
                tag: helper.tag,
                props,
            });
        }
    }

    if base.base.helpers.iter().any(|helper| {
        !branch
            .base
            .helpers
            .iter()
            .any(|entry| entry.tag == helper.tag)
    }) {
        return None;
    }

    Some(StyleEffectBundle { props, helpers })
}

fn added_props(base: &[PropEntry], branch: &[PropEntry]) -> Vec<PropEntry> {
    branch
        .iter()
        .filter(|prop| !base.iter().any(|entry| entry == *prop))
        .cloned()
        .collect()
}

fn diff_rules(base: &StyleIr, branch: &StyleIr) -> Vec<RuntimeRule> {
    let mut remaining: Vec<&RuntimeRule> = base.runtime_rules.iter().collect();

    branch
        .runtime_rules
        .iter()
        .filter(
            |rule| match remaining.iter().position(|entry| entry == rule) {
                Some(position) => {
                    remaining.remove(position);
                    false
                }
                None => true,
            },
        )
        .cloned()
        .collect()
}
