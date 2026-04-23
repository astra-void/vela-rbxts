use crate::api::Diagnostic;
use crate::class_value::collapse::collapse_class_value_expr;
use crate::class_value::scope::ClassValueScopeStack;
use crate::ir::model::{StyleEffectBundle, StyleIr};
use crate::transform::runtime::resolve_class_tokens;
use swc_core::ecma::ast::{JSXAttr, JSXAttrOrSpread, JSXAttrValue, JSXExpr, JSXExprContainer};

pub(crate) struct LoweredClassName {
    pub(crate) style_ir: StyleIr,
    pub(crate) preserved_attrs: Vec<JSXAttrOrSpread>,
    pub(crate) runtime_class_name: Option<JSXAttr>,
    pub(crate) needs_runtime_host: bool,
}

pub(crate) fn lower_class_name(
    attrs: &[JSXAttrOrSpread],
    config: &crate::config::model::TailwindConfig,
    scopes: &ClassValueScopeStack,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<LoweredClassName> {
    let class_name_attr = attrs.iter().find_map(|attr| match attr {
        JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name) => Some(attr),
        _ => None,
    })?;

    let preserved_attrs = attrs
        .iter()
        .filter(|attr| {
            !matches!(
                attr,
                JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name)
            )
        })
        .cloned()
        .collect();

    match &class_name_attr.value {
        Some(JSXAttrValue::Str(value)) => {
            let class_name = value.value.to_string_lossy().into_owned();
            let style = resolve_class_tokens(
                crate::editor::tokenize_class_name_with_ranges(&class_name, 0)
                    .into_iter()
                    .map(|token| token.text),
                config,
                diagnostics,
            );
            let needs_runtime_host = !style.runtime_rules.is_empty() || style.runtime_class_value;

            Some(LoweredClassName {
                style_ir: style,
                preserved_attrs,
                runtime_class_name: None,
                needs_runtime_host,
            })
        }
        Some(JSXAttrValue::JSXExprContainer(container)) => {
            let JSXExpr::Expr(expr) = &container.expr else {
                return Some(LoweredClassName {
                    style_ir: StyleIr {
                        base: StyleEffectBundle::default(),
                        runtime_rules: Vec::new(),
                        runtime_class_value: true,
                    },
                    preserved_attrs,
                    runtime_class_name: Some(class_name_attr.clone()),
                    needs_runtime_host: true,
                });
            };

            let collapse = collapse_class_value_expr(expr, scopes);
            let runtime_class_value = collapse.is_dynamic();
            let style = resolve_class_tokens(collapse.static_tokens.clone(), config, diagnostics);
            let needs_runtime_host = !style.runtime_rules.is_empty() || runtime_class_value;
            let runtime_class_name = collapse.dynamic_expr.map(|expr| {
                let mut runtime_attr = class_name_attr.clone();
                runtime_attr.value = Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                    span: container.span,
                    expr: JSXExpr::Expr(expr),
                }));
                runtime_attr
            });

            Some(LoweredClassName {
                style_ir: StyleIr {
                    runtime_class_value,
                    ..style
                },
                preserved_attrs,
                runtime_class_name,
                needs_runtime_host,
            })
        }
        _ => Some(LoweredClassName {
            style_ir: StyleIr {
                base: StyleEffectBundle::default(),
                runtime_rules: Vec::new(),
                runtime_class_value: true,
            },
            preserved_attrs,
            runtime_class_name: Some(class_name_attr.clone()),
            needs_runtime_host: true,
        }),
    }
}

fn is_class_name_attr(name: &swc_core::ecma::ast::JSXAttrName) -> bool {
    matches!(name, swc_core::ecma::ast::JSXAttrName::Ident(ident) if ident.sym == "className")
}
