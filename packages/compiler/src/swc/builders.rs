use crate::ir::model::{HelperEntry, PropEntry};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        Expr, Ident, IdentName, ImportDecl, ImportNamedSpecifier, ImportSpecifier, JSXAttr,
        JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXElement, JSXElementChild, JSXElementName,
        JSXExpr, JSXExprContainer, JSXOpeningElement, ModuleDecl, Str,
    },
};

pub(crate) fn create_prop_attr(prop: PropEntry) -> JSXAttrOrSpread {
    JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName::new(prop.name.into(), DUMMY_SP)),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(parse_expression(&prop.value)),
        })),
    })
}

pub(crate) fn create_helper_child(helper: HelperEntry) -> JSXElementChild {
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

pub(crate) fn create_runtime_import_declaration() -> ModuleDecl {
    ModuleDecl::Import(ImportDecl {
        span: DUMMY_SP,
        specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
            span: DUMMY_SP,
            local: Ident::new_no_ctxt("createTailwindRuntimeHost".into(), DUMMY_SP),
            imported: None,
            is_type_only: false,
        })],
        src: Box::new(Str {
            span: DUMMY_SP,
            value: "@vela-rbxts/runtime".into(),
            raw: None,
        }),
        type_only: false,
        with: None,
        phase: Default::default(),
    })
}

pub(crate) fn parse_expression(value: &str) -> Box<Expr> {
    crate::swc::parse::parse_expression(value)
}
