use crate::api::Diagnostic;
use crate::config::model::TailwindConfig;
use crate::diagnostics::compiler::{
    explicit_helper_overrides_class_diagnostic, explicit_prop_overrides_class_diagnostic,
    possible_duplicate_helper_diagnostic,
};
use crate::editor::inlay::helper_class_name;
use crate::ir::model::StyleIr;
use crate::semantic::utility::helper_element_tag;
use crate::transform::runtime::{
    resolve_class_tokens, share_grid_inputs, share_size_inputs, share_transform_inputs,
};
use swc_core::ecma::ast::{Expr, JSXElementChild, JSXElementName, JSXExpr};

/// An element's own prop outranks every class that names it, under every
/// condition, the way an inline style outranks a stylesheet. The class's copy
/// is dropped rather than emitted beside it, where JSX would let the later of
/// the two win and a class could silently replace a reactive binding.
pub(crate) fn drop_props_declared_on_element(
    style: &mut StyleIr,
    declared: &[String],
    tokens: &[&str],
    config: &TailwindConfig,
    element_tag: Option<&str>,
) -> Vec<Diagnostic> {
    let is_declared = |name: &str| declared.iter().any(|declared| declared == name);
    let mut conflicts: Vec<String> = Vec::new();
    let mut note = |name: &str| {
        if !conflicts.iter().any(|seen| seen == name) {
            conflicts.push(name.to_owned());
        }
    };

    style.base.props.retain(|prop| {
        let keep = !is_declared(&prop.name);
        if !keep {
            note(&prop.name);
        }
        keep
    });
    for rule in &mut style.runtime_rules {
        rule.effects.props.retain(|prop| {
            let keep = !is_declared(&prop.name);
            if !keep {
                note(&prop.name);
            }
            keep
        });
    }
    style
        .runtime_rules
        .retain(|rule| !rule.effects.props.is_empty() || !rule.effects.helpers.is_empty());

    let mut diagnostics = Vec::new();
    for prop in &conflicts {
        let sources = tokens_lowering_to(tokens, config, element_tag, |style| {
            style
                .base
                .props
                .iter()
                .any(|entry| entry.name == prop.as_str())
                || style.runtime_rules.iter().any(|rule| {
                    rule.effects
                        .props
                        .iter()
                        .any(|entry| entry.name == prop.as_str())
                })
        });
        if sources.is_empty() {
            diagnostics.push(explicit_prop_overrides_class_diagnostic(None, prop));
        }
        for token in sources {
            diagnostics.push(explicit_prop_overrides_class_diagnostic(Some(token), prop));
        }
    }

    diagnostics
}

/// The tokens that lower to what `names` looks for on their own. Only asked
/// once a conflict is found, so the cost of resolving each one alone is paid
/// for the diagnostic and nothing else.
fn tokens_lowering_to<'a>(
    tokens: &[&'a str],
    config: &TailwindConfig,
    element_tag: Option<&str>,
    names: impl Fn(&StyleIr) -> bool,
) -> Vec<&'a str> {
    tokens
        .iter()
        .copied()
        .filter(|token| {
            let mut style = resolve_class_tokens([*token], config, element_tag, &mut Vec::new());
            share_grid_inputs(&mut style, false);
            share_size_inputs(&mut style);
            share_transform_inputs(&mut style);
            names(&style)
        })
        .collect()
}

/// How a helper the class lowers to is already written among the children.
#[derive(Clone, Copy, PartialEq, Eq)]
enum WrittenHelper {
    Always,
    Maybe,
}

/// A UIShadow is the one helper several of which apply at once, each its own
/// layer, so a written one is no reason to drop a class's.
fn is_layered_helper(tag: &str) -> bool {
    tag == "uishadow"
}

/// Drops a helper the class lowers to when the element already writes one of
/// the same class as a child: Roblox applies one UICorner, UIStroke, UIPadding,
/// layout or constraint per instance, and the written one is the author's. A
/// helper a class variant also changes stays, since the runtime host keys its
/// rules on it, and so does one beside a child that is only sometimes there.
pub(crate) fn drop_helpers_written_as_children(
    style: &mut StyleIr,
    children: &[JSXElementChild],
    tokens: &[&str],
    config: &TailwindConfig,
    element_tag: Option<&str>,
) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();
    let mut kept = Vec::new();

    for helper in std::mem::take(&mut style.base.helpers) {
        let tag = helper_element_tag(helper.tag);
        let written = if is_layered_helper(tag) {
            None
        } else {
            written_helper(children, tag)
        };
        let Some(written) = written else {
            kept.push(helper);
            continue;
        };

        let varied = style.runtime_rules.iter().any(|rule| {
            rule.effects
                .helpers
                .iter()
                .any(|other| other.tag == helper.tag)
        });
        let dropped = written == WrittenHelper::Always && !varied;
        let virtual_tag = helper.tag;
        let sources = tokens_lowering_to(tokens, config, element_tag, |style| {
            style
                .base
                .helpers
                .iter()
                .any(|entry| entry.tag == virtual_tag)
        });
        let class_name = helper_class_name(tag);
        let report = |token: Option<&str>| {
            if dropped {
                explicit_helper_overrides_class_diagnostic(token, class_name, tag)
            } else {
                possible_duplicate_helper_diagnostic(token, class_name, tag)
            }
        };
        if sources.is_empty() {
            diagnostics.push(report(None));
        }
        for token in sources {
            diagnostics.push(report(Some(token)));
        }

        if !dropped {
            kept.push(helper);
        }
    }

    style.base.helpers = kept;
    diagnostics
}

fn written_helper(children: &[JSXElementChild], tag: &str) -> Option<WrittenHelper> {
    let mut found = None;

    for child in children {
        let here = match child {
            JSXElementChild::JSXElement(element) => {
                names_tag(&element.opening.name, tag).then_some(WrittenHelper::Always)
            }
            JSXElementChild::JSXFragment(fragment) => written_helper(&fragment.children, tag),
            JSXElementChild::JSXExprContainer(container) => match &container.expr {
                JSXExpr::Expr(expr) => expr_renders_tag(expr, tag).then_some(WrittenHelper::Maybe),
                JSXExpr::JSXEmptyExpr(_) => None,
            },
            _ => None,
        };

        match here {
            Some(WrittenHelper::Always) => return Some(WrittenHelper::Always),
            Some(WrittenHelper::Maybe) => found = Some(WrittenHelper::Maybe),
            None => {}
        }
    }

    found
}

fn names_tag(name: &JSXElementName, tag: &str) -> bool {
    matches!(name, JSXElementName::Ident(ident) if ident.sym.eq_ignore_ascii_case(tag))
}

/// Whether an expression child can evaluate to the helper written as JSX:
/// `{open && <uicorner />}`, `{open ? <uicorner /> : undefined}`.
fn expr_renders_tag(expr: &Expr, tag: &str) -> bool {
    match expr {
        Expr::JSXElement(element) => names_tag(&element.opening.name, tag),
        Expr::JSXFragment(fragment) => written_helper(&fragment.children, tag).is_some(),
        Expr::Paren(paren) => expr_renders_tag(&paren.expr, tag),
        Expr::Bin(bin) => expr_renders_tag(&bin.left, tag) || expr_renders_tag(&bin.right, tag),
        Expr::Cond(cond) => expr_renders_tag(&cond.cons, tag) || expr_renders_tag(&cond.alt, tag),
        _ => false,
    }
}
