use crate::ir::model::{HelperEntry, PropEntry};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ArrowExpr, BlockStmtOrExpr, Expr, Ident, IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread,
        JSXAttrValue, JSXElement, JSXElementChild, JSXElementName, JSXExpr, JSXExprContainer,
        JSXOpeningElement,
    },
};

pub(crate) fn create_prop_attr(prop: PropEntry) -> JSXAttrOrSpread {
    let PropEntry { name, value } = prop;
    create_prop_attr_with_expr(name.to_string(), parse_expression(&value))
}

pub(crate) fn create_prop_attr_cast_any(prop: PropEntry) -> JSXAttrOrSpread {
    let PropEntry { name, value } = prop;
    create_prop_attr_with_expr(
        name.to_string(),
        parse_expression(&format!("({value} as never)")),
    )
}

pub(crate) fn create_prop_attr_with_expr(name: String, expr: Box<Expr>) -> JSXAttrOrSpread {
    JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName::new(name.into(), DUMMY_SP)),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(expr),
        })),
    })
}

/// The tag name a helper is written with when the target can spell it as is.
pub(crate) fn helper_tag_name(tag: &'static str) -> JSXElementName {
    JSXElementName::Ident(Ident::new_no_ctxt(tag.into(), DUMMY_SP))
}

pub(crate) fn create_helper_child(helper: HelperEntry, name: JSXElementName) -> JSXElementChild {
    create_helper_child_with_expr(helper, name, create_prop_attr)
}

pub(crate) fn create_helper_child_cast_any(
    helper: HelperEntry,
    name: JSXElementName,
) -> JSXElementChild {
    create_helper_child_with_expr(helper, name, create_prop_attr_cast_any)
}

fn create_helper_child_with_expr(
    helper: HelperEntry,
    name: JSXElementName,
    create_prop_attr: fn(PropEntry) -> JSXAttrOrSpread,
) -> JSXElementChild {
    JSXElementChild::JSXElement(Box::new(JSXElement {
        span: DUMMY_SP,
        opening: JSXOpeningElement {
            name,
            span: DUMMY_SP,
            attrs: helper.props.into_iter().map(create_prop_attr).collect(),
            self_closing: true,
            type_args: None,
        },
        children: vec![],
        closing: None,
    }))
}

/// The namespace both targets' runtimes export their opacity helpers under.
/// What `Provider` is shaped like is the target's business.
pub(crate) const OPACITY_NAMESPACE: &str = "__VelaOpacity";

/// The namespace for what crosses a component boundary rather than being
/// composed into the emit: `Consume` reads it at a component's root, `Pin`
/// opens it over a container's subtree.
pub(crate) const BOUNDARY_NAMESPACE: &str = "__VelaBoundary";

/// The namespace a helper's exact Roblox class name is read from, for a target
/// that cannot resolve the lowercase tag itself.
pub(crate) const HELPER_NAMESPACE: &str = "__VelaHelper";

/// Vide reads a `Derivable<T>`: a function value on a non-event property becomes
/// an effect. Wrapping is what keeps an expression re-readable, since nothing
/// there re-renders to read it again.
pub(crate) fn thunk(expr: Expr) -> Expr {
    Expr::Arrow(ArrowExpr {
        span: DUMMY_SP,
        params: Vec::new(),
        body: Box::new(BlockStmtOrExpr::Expr(Box::new(expr))),
        is_async: false,
        is_generator: false,
        type_params: None,
        return_type: None,
        ctxt: Default::default(),
    })
}

/// The body of a zero-parameter arrow, which is how a deferred class value is
/// written. Anything else is handed back untouched.
pub(crate) fn deferred_body(expr: &Expr) -> Option<&Expr> {
    let Expr::Arrow(arrow) = expr else {
        return None;
    };
    if !arrow.params.is_empty() || arrow.is_async || arrow.is_generator {
        return None;
    }

    match &*arrow.body {
        BlockStmtOrExpr::Expr(body) => Some(body),
        BlockStmtOrExpr::BlockStmt(_) => None,
    }
}

pub(crate) fn parse_expression(value: &str) -> Box<Expr> {
    crate::swc::parse::parse_expression(value)
}
