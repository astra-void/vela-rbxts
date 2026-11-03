use crate::swc::builders::{OPACITY_NAMESPACE, parse_expression};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            ArrayLit, CallExpr, Callee, Expr, ExprOrSpread, JSXAttr, JSXAttrName, JSXAttrOrSpread,
            JSXAttrValue, JSXElement, JSXElementChild, JSXElementName, JSXExpr, JSXExprContainer,
            Lit, Str,
        },
        visit::{VisitMut, VisitMutWith},
    },
};

/// Rides the element from the lowering pass to the one that wraps it, since the
/// lowering of its parent still has to see a plain JSX child.
const MARKER: &str = "__velaOwnTransparency";

/// The transparencies written on an instance element. The static path leaves
/// those alone under a fade, so the runtime is told which ones they are; a
/// literal `1` composes to itself and needs no record.
pub(crate) fn owned_transparency(element: &JSXElement) -> Vec<String> {
    if !is_instance_element(&element.opening.name) {
        return Vec::new();
    }

    declared_transparency(&element.opening.attrs)
}

pub(crate) fn declared_transparency(attrs: &[JSXAttrOrSpread]) -> Vec<String> {
    attrs
        .iter()
        .filter_map(|attr| {
            let JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(name),
                value,
                ..
            }) = attr
            else {
                return None;
            };
            if !name.sym.ends_with("Transparency") || is_literal_one(value.as_ref()) {
                return None;
            }

            Some(name.sym.to_string())
        })
        .collect()
}

/// Whether the element still builds an instance a fade walks, rather than the
/// runtime host, which is handed its own props as `__velaOwn`.
pub(crate) fn is_instance_element(name: &JSXElementName) -> bool {
    matches!(name, JSXElementName::Ident(ident) if ident.sym.starts_with(|c: char| c.is_ascii_lowercase()))
}

pub(crate) fn mark(element: &mut JSXElement, names: &[String]) {
    element
        .opening
        .attrs
        .push(JSXAttrOrSpread::JSXAttr(JSXAttr {
            span: DUMMY_SP,
            name: JSXAttrName::Ident(MARKER.into()),
            value: Some(JSXAttrValue::Str(Str {
                span: DUMMY_SP,
                value: names.join(",").into(),
                raw: None,
            })),
        }));
}

fn is_literal_one(value: Option<&JSXAttrValue>) -> bool {
    matches!(
        value,
        Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            expr: JSXExpr::Expr(expr),
            ..
        })) if matches!(&**expr, Expr::Lit(Lit::Num(number)) if number.value == 1.0)
    )
}

fn take_marker(element: &mut JSXElement) -> Option<Vec<String>> {
    let index = element.opening.attrs.iter().position(|attr| {
        matches!(
            attr,
            JSXAttrOrSpread::JSXAttr(JSXAttr { name: JSXAttrName::Ident(name), .. })
                if name.sym == MARKER
        )
    })?;
    let JSXAttrOrSpread::JSXAttr(JSXAttr {
        value: Some(JSXAttrValue::Str(names)),
        ..
    }) = element.opening.attrs.remove(index)
    else {
        return None;
    };

    Some(
        names
            .value
            .to_string_lossy()
            .split(',')
            .map(str::to_owned)
            .collect(),
    )
}

fn own_call(element: Box<JSXElement>, names: Vec<String>) -> Expr {
    let names = ArrayLit {
        span: DUMMY_SP,
        elems: names
            .into_iter()
            .map(|name| {
                Some(ExprOrSpread {
                    spread: None,
                    expr: Box::new(Expr::Lit(Lit::Str(Str {
                        span: DUMMY_SP,
                        value: name.into(),
                        raw: None,
                    }))),
                })
            })
            .collect(),
    };

    Expr::Call(CallExpr {
        span: DUMMY_SP,
        callee: Callee::Expr(parse_expression(&format!("{OPACITY_NAMESPACE}.own"))),
        args: vec![
            ExprOrSpread {
                spread: None,
                expr: Box::new(Expr::JSXElement(element)),
            },
            ExprOrSpread {
                spread: None,
                expr: Box::new(Expr::Array(names)),
            },
        ],
        type_args: None,
        ctxt: Default::default(),
    })
}

/// Wraps every marked element in `__VelaOpacity.own(element, names)`, which
/// both runtimes read before they fade what the element built.
pub(crate) struct OwnTransparency;

impl VisitMut for OwnTransparency {
    fn visit_mut_expr(&mut self, expr: &mut Expr) {
        expr.visit_mut_children_with(self);
        if let Expr::JSXElement(element) = expr
            && let Some(names) = take_marker(element)
        {
            let Expr::JSXElement(element) =
                std::mem::replace(expr, Expr::Invalid(Default::default()))
            else {
                unreachable!();
            };
            *expr = own_call(element, names);
        }
    }

    fn visit_mut_jsx_element_child(&mut self, child: &mut JSXElementChild) {
        child.visit_mut_children_with(self);
        if let JSXElementChild::JSXElement(element) = child
            && let Some(names) = take_marker(element)
        {
            let JSXElementChild::JSXElement(element) = std::mem::replace(
                child,
                JSXElementChild::JSXText(swc_core::ecma::ast::JSXText {
                    span: DUMMY_SP,
                    value: "".into(),
                    raw: "".into(),
                }),
            ) else {
                unreachable!();
            };
            *child = JSXElementChild::JSXExprContainer(JSXExprContainer {
                span: DUMMY_SP,
                expr: JSXExpr::Expr(Box::new(own_call(element, names))),
            });
        }
    }

    fn visit_mut_jsx_attr_value(&mut self, value: &mut JSXAttrValue) {
        value.visit_mut_children_with(self);
        if let JSXAttrValue::JSXElement(element) = value
            && let Some(names) = take_marker(element)
        {
            let JSXAttrValue::JSXElement(element) = std::mem::replace(
                value,
                JSXAttrValue::Str(Str {
                    span: DUMMY_SP,
                    value: "".into(),
                    raw: None,
                }),
            ) else {
                unreachable!();
            };
            *value = JSXAttrValue::JSXExprContainer(JSXExprContainer {
                span: DUMMY_SP,
                expr: JSXExpr::Expr(Box::new(own_call(element, names))),
            });
        }
    }
}
