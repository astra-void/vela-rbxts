use crate::config::model::TailwindConfig;
use crate::swc::builders::{
    BOUNDARY_NAMESPACE, OPACITY_NAMESPACE, create_prop_attr_with_expr, parse_expression, thunk,
};
use crate::transform::runtime_host::{
    RuntimeNeeds, VIDE_RUNTIME_MODULE, create_runtime_module_items,
};
use crate::transform::target::EmitTarget;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ArrayLit, Bool, CondExpr, Expr, ExprOrSpread, Ident, IdentName, JSXAttrOrSpread,
        JSXClosingElement, JSXElement, JSXElementChild, JSXElementName, JSXExpr, JSXExprContainer,
        JSXMemberExpr, JSXObject, JSXOpeningElement, Lit, ModuleItem,
    },
};

pub(crate) struct VideTarget;

impl EmitTarget for VideTarget {
    fn runtime_module_items(
        &self,
        config: &TailwindConfig,
        needs: &RuntimeNeeds<'_>,
    ) -> Vec<ModuleItem> {
        create_runtime_module_items(config, needs, VIDE_RUNTIME_MODULE)
    }

    fn host_element_name(&self) -> &'static str {
        "VelaRuntimeHost"
    }

    fn class_value_is_deferred(&self) -> bool {
        true
    }

    /// The element is parented by the time its resolution first runs, and the
    /// margin box goes above it — so the host builds one whenever a margin is
    /// still possible rather than when it is already known.
    fn needs_margin_box_hint(&self) -> bool {
        true
    }

    /// The React target can hand the host a boolean, because a re-render brings
    /// the next one. A Vide component body runs once, so a test that arrived
    /// evaluated would pin its rule to whatever was true at creation.
    fn tests_attr(&self, tests: Vec<Expr>) -> JSXAttrOrSpread {
        let elems = tests
            .into_iter()
            .map(|test| {
                Some(ExprOrSpread {
                    spread: None,
                    expr: Box::new(thunk(Expr::Cond(CondExpr {
                        span: DUMMY_SP,
                        test: Box::new(test),
                        cons: Box::new(Expr::Lit(Lit::Bool(Bool {
                            span: DUMMY_SP,
                            value: true,
                        }))),
                        alt: Box::new(Expr::Lit(Lit::Bool(Bool {
                            span: DUMMY_SP,
                            value: false,
                        }))),
                    }))),
                })
            })
            .collect();

        create_prop_attr_with_expr(
            "__velaTests".to_owned(),
            Box::new(Expr::Array(ArrayLit {
                span: DUMMY_SP,
                elems,
            })),
        )
    }

    fn opacity_provider(&self, alpha: f64, children: Vec<JSXElementChild>) -> Box<JSXElement> {
        provider_element(opacity_member("Provider"), alpha, children)
    }

    /// Vide builds a child eagerly, so by the time the provider runs the
    /// instances that should have read its value already exist. A thunk is what
    /// defers them into the scope that holds it.
    fn provider_child(&self, child: JSXElementChild) -> JSXElementChild {
        let body = match child {
            JSXElementChild::JSXElement(element) => Expr::JSXElement(element),
            JSXElementChild::JSXFragment(fragment) => Expr::JSXFragment(fragment),
            JSXElementChild::JSXExprContainer(JSXExprContainer {
                expr: JSXExpr::Expr(expr),
                ..
            }) => *expr,
            other => return other,
        };

        JSXElementChild::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(Box::new(thunk(body))),
        })
    }

    /// The scale a thunk reads is settled where the thunk is built, which is
    /// inside this scope, so the pin only has to be open while the children are.
    fn pin_provider(&self, children: Vec<JSXElementChild>) -> Box<JSXElement> {
        let name = boundary_member("Pin");

        Box::new(JSXElement {
            span: DUMMY_SP,
            opening: JSXOpeningElement {
                name: name.clone(),
                span: DUMMY_SP,
                attrs: Vec::new(),
                self_closing: false,
                type_args: None,
            },
            children,
            closing: Some(JSXClosingElement {
                span: DUMMY_SP,
                name,
            }),
        })
    }

    /// The instance already exists by the time this runs, so the consumer
    /// applies the alpha rather than cloning an element around it. The emitted
    /// shape is the same either way.
    fn boundary_element(&self, child: Expr) -> Box<JSXElement> {
        let name = boundary_member("Consume");

        let child = match child {
            Expr::JSXElement(element) => JSXElementChild::JSXElement(element),
            Expr::JSXFragment(fragment) => JSXElementChild::JSXFragment(fragment),
            other => JSXElementChild::JSXExprContainer(JSXExprContainer {
                span: DUMMY_SP,
                expr: JSXExpr::Expr(Box::new(other)),
            }),
        };

        Box::new(JSXElement {
            span: DUMMY_SP,
            opening: JSXOpeningElement {
                name: name.clone(),
                span: DUMMY_SP,
                attrs: Vec::new(),
                self_closing: false,
                type_args: None,
            },
            children: vec![child],
            closing: Some(JSXClosingElement {
                span: DUMMY_SP,
                name,
            }),
        })
    }

    /// Vide maps every lowercase tag through the engine's own class list.
    fn helper_element_name(&self, _tag: &'static str) -> Option<JSXElementName> {
        None
    }
}

fn provider_element(
    name: JSXElementName,
    alpha: f64,
    children: Vec<JSXElementChild>,
) -> Box<JSXElement> {
    Box::new(JSXElement {
        span: DUMMY_SP,
        opening: JSXOpeningElement {
            name: name.clone(),
            span: DUMMY_SP,
            attrs: vec![create_prop_attr_with_expr(
                "value".to_owned(),
                parse_expression(&alpha.to_string()),
            )],
            self_closing: false,
            type_args: None,
        },
        children,
        closing: Some(JSXClosingElement {
            span: DUMMY_SP,
            name,
        }),
    })
}

fn opacity_member(prop: &str) -> JSXElementName {
    namespace_member(OPACITY_NAMESPACE, prop)
}

fn boundary_member(prop: &str) -> JSXElementName {
    namespace_member(BOUNDARY_NAMESPACE, prop)
}

fn namespace_member(namespace: &str, prop: &str) -> JSXElementName {
    JSXElementName::JSXMemberExpr(JSXMemberExpr {
        span: DUMMY_SP,
        obj: JSXObject::Ident(Ident::new_no_ctxt(namespace.into(), DUMMY_SP)),
        prop: IdentName::new(prop.into(), DUMMY_SP),
    })
}
