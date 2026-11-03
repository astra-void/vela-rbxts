use crate::config::model::TailwindConfig;
use crate::swc::builders::{
    BOUNDARY_NAMESPACE, HELPER_NAMESPACE, OPACITY_NAMESPACE, create_prop_attr_with_expr,
    parse_expression,
};
use crate::transform::runtime_host::{
    REACT_RUNTIME_MODULE, RuntimeNeeds, create_runtime_module_items,
};
use crate::transform::target::EmitTarget;
use swc_core::{
    common::{DUMMY_SP, Span},
    ecma::ast::{
        ArrayLit, Bool, CondExpr, Expr, ExprOrSpread, Ident, IdentName, JSXAttr, JSXAttrName,
        JSXAttrOrSpread, JSXAttrValue, JSXClosingElement, JSXElement, JSXElementChild,
        JSXElementName, JSXExpr, JSXExprContainer, JSXMemberExpr, JSXObject, JSXOpeningElement,
        Lit, ModuleItem, Str,
    },
};

pub(crate) struct ReactTarget;

/// Helper classes missing from the hardcoded class list `@rbxts/react` maps a
/// lowercase tag through. It hands an unknown tag to `Instance.new` as is, and
/// that is case sensitive.
const UNLISTED_HELPER_TAGS: [&str; 2] = ["uishadow", "uiblur"];

impl EmitTarget for ReactTarget {
    fn runtime_module_items(
        &self,
        config: &TailwindConfig,
        needs: &RuntimeNeeds<'_>,
    ) -> Vec<ModuleItem> {
        create_runtime_module_items(config, needs, REACT_RUNTIME_MODULE)
    }

    fn host_element_name(&self) -> &'static str {
        "VelaRuntimeHost"
    }

    fn class_value_is_deferred(&self) -> bool {
        false
    }

    /// A render that resolves a margin also renders the wrapper around it.
    fn needs_margin_box_hint(&self) -> bool {
        false
    }

    fn reads_built_layout_order(&self) -> bool {
        false
    }

    fn binds_rem_by_action(&self) -> bool {
        false
    }

    /// Each test is narrowed to a boolean where it is written, so an expression
    /// the rules hang on is evaluated once however many of them name it. A
    /// re-render is what brings the next value, so the value itself travels.
    fn tests_attr(&self, tests: Vec<Expr>) -> JSXAttrOrSpread {
        let elems = tests
            .into_iter()
            .map(|test| {
                Some(ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Cond(CondExpr {
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
                    })),
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

    /// Renders no instance of its own, so the tree it wraps keeps its shape,
    /// its keys and the names Roblox gives them.
    fn opacity_provider(&self, alpha: f64, children: Vec<JSXElementChild>) -> Box<JSXElement> {
        let name = opacity_member("Provider");

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

    fn provider_child(&self, child: JSXElementChild) -> JSXElementChild {
        child
    }

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

    /// A statically lowered instance cannot read a context, so this is what
    /// reads one on its behalf.
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

    /// `@rbxts/react` applies a `Tag` prop as space-separated CollectionService
    /// tags, so a marker merges into a literal one. An expression, or a spread
    /// that may carry one, is only known at render time.
    fn static_markers(&self, markers: &[String], attrs: &mut Vec<JSXAttrOrSpread>) -> bool {
        if attrs
            .iter()
            .any(|attr| matches!(attr, JSXAttrOrSpread::SpreadElement(_)))
        {
            return false;
        }

        let existing = attrs.iter_mut().find_map(|attr| match attr {
            JSXAttrOrSpread::JSXAttr(attr)
                if matches!(&attr.name, JSXAttrName::Ident(ident) if ident.sym == "Tag") =>
            {
                Some(attr)
            }
            _ => None,
        });

        let Some(attr) = existing else {
            attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
                span: DUMMY_SP,
                name: JSXAttrName::Ident(IdentName::new("Tag".into(), DUMMY_SP)),
                value: Some(tag_value(DUMMY_SP, markers.join(" "))),
            }));
            return true;
        };

        let (span, written) = match &attr.value {
            Some(JSXAttrValue::Str(value)) => (value.span, value.value.to_string_lossy()),
            Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                span,
                expr: JSXExpr::Expr(expr),
            })) => match expr.as_ref() {
                Expr::Lit(Lit::Str(value)) => (*span, value.value.to_string_lossy()),
                _ => return false,
            },
            _ => return false,
        };

        let mut tags: Vec<String> = written.split_whitespace().map(str::to_owned).collect();
        for marker in markers {
            if !tags.contains(marker) {
                tags.push(marker.clone());
            }
        }
        attr.value = Some(tag_value(span, tags.join(" ")));
        true
    }

    fn helper_element_name(&self, tag: &'static str) -> Option<JSXElementName> {
        UNLISTED_HELPER_TAGS
            .contains(&tag)
            .then(|| namespace_member(HELPER_NAMESPACE, tag))
    }
}

fn tag_value(span: Span, tags: String) -> JSXAttrValue {
    JSXAttrValue::Str(Str {
        span,
        value: tags.into(),
        raw: None,
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
