use crate::ir::model::{HelperEntry, PropEntry};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        Expr, Ident, IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXElement,
        JSXElementChild, JSXElementName, JSXExpr, JSXExprContainer, JSXOpeningElement,
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

fn create_prop_attr_with_expr(name: String, expr: Box<Expr>) -> JSXAttrOrSpread {
    JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName::new(name.into(), DUMMY_SP)),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(expr),
        })),
    })
}

pub(crate) fn create_helper_child(helper: HelperEntry) -> JSXElementChild {
    create_helper_child_with_expr(helper, create_prop_attr)
}

pub(crate) fn create_helper_child_cast_any(helper: HelperEntry) -> JSXElementChild {
    create_helper_child_with_expr(helper, create_prop_attr_cast_any)
}

fn create_helper_child_with_expr(
    helper: HelperEntry,
    create_prop_attr: fn(PropEntry) -> JSXAttrOrSpread,
) -> JSXElementChild {
    JSXElementChild::JSXElement(Box::new(JSXElement {
        span: DUMMY_SP,
        opening: JSXOpeningElement {
            name: JSXElementName::Ident(Ident::new_no_ctxt(helper.tag.into(), DUMMY_SP)),
            span: DUMMY_SP,
            attrs: helper.props.into_iter().map(create_prop_attr).collect(),
            self_closing: true,
            type_args: None,
        },
        children: vec![],
        closing: None,
    }))
}

pub(crate) fn parse_expression(value: &str) -> Box<Expr> {
    crate::swc::parse::parse_expression(value)
}
