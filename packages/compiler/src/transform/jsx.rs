use crate::api::{Diagnostic, EditorRange};
use crate::class_token::{ClassToken, tokenize_class_name_with_ranges};
use crate::class_value::collapse::{
    collapse_class_value_expr, collapse_class_value_expr_without_branches,
};
use crate::class_value::scope::ClassValueScopeStack;
use crate::diagnostics::compiler::transition_without_runtime_diagnostic;
use crate::ir::model::{StyleIr, sort_rules_by_precedence};
use crate::semantic::analyze::analyze_class_token;
use crate::semantic::utility::UtilityKind;
use crate::semantic::variant::VariantRegistry;
use crate::transform::branch::lower_branches;
use crate::transform::conflicts::drop_props_declared_on_element;
use crate::transform::module::is_class_name_attr;
use crate::transform::runtime::{
    resolve_class_tokens, share_grid_inputs, share_size_inputs, share_transform_inputs,
};
use swc_core::common::{DUMMY_SP, Span};
use swc_core::ecma::ast::{
    ArrayLit, Expr, ExprOrSpread, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue,
    JSXElementName, JSXExpr, JSXExprContainer, JSXObject,
};

pub(crate) struct LoweredClassName {
    pub(crate) style_ir: StyleIr,
    pub(crate) preserved_attrs: Vec<JSXAttrOrSpread>,
    pub(crate) runtime_class_name: Option<JSXAttr>,
    pub(crate) needs_runtime_host: bool,
    /// The expressions the emitted branch rules decide on, in the order they
    /// name them. Empty unless a branch was lowered.
    pub(crate) tests: Vec<Expr>,
    /// Whether a margin this pass could read is left for the runtime to
    /// resolve. The box one needs is an instance above the element, so a target
    /// that builds its tree bottom-up has to be told before the element exists.
    pub(crate) runtime_margin: bool,
    /// Whether a divide can reach the element, which then has to hand its list
    /// gap to the separators at render time.
    pub(crate) may_divide: bool,
    /// Where the `className` was written, for what is synthesized in its place.
    pub(crate) class_name_span: Span,
    /// How many of `preserved_attrs` were written before the `className`, which
    /// is where what it lowers to goes, so a spread after it still wins.
    pub(crate) class_name_index: usize,
    /// The tokens this pass read, for diagnostics raised once the element is
    /// known, with ranges when the value is a literal.
    pub(crate) tokens: Vec<ClassToken>,
}

pub(crate) fn lower_class_name(
    attrs: &[JSXAttrOrSpread],
    config: &crate::config::model::TailwindConfig,
    element_tag: Option<&str>,
    scopes: &ClassValueScopeStack,
    target: &dyn crate::transform::target::EmitTarget,
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
    let class_name_index = attrs
        .iter()
        .position(|attr| {
            matches!(
                attr,
                JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name)
            )
        })
        .unwrap_or(0);
    let declared = declared_prop_names(attrs);

    match &class_name_attr.value {
        Some(JSXAttrValue::Str(value)) => {
            let class_name = value.value.to_string_lossy().into_owned();
            // `span.lo` sits on the opening quote, so it is also the offset of the first
            // value byte once the source map's leading byte is subtracted.
            let value_offset = value.span.lo.0;
            let spans = tokenize_class_name_with_ranges(&class_name, value_offset);
            let diagnostics_before = diagnostics.len();
            let mut style = resolve_class_tokens(
                spans.iter().map(|token| token.text.as_str()),
                config,
                element_tag,
                diagnostics,
            );
            share_grid_inputs(&mut style, false);
            share_size_inputs(&mut style);
            share_transform_inputs(&mut style);
            let texts: Vec<&str> = spans.iter().map(|token| token.text.as_str()).collect();
            diagnostics.extend(drop_props_declared_on_element(
                &mut style,
                &declared,
                &texts,
                config,
                element_tag,
            ));
            attach_token_ranges(&mut diagnostics[diagnostics_before..], &spans);
            // A preset animation loops on its own, so it promotes an otherwise
            // static element to the runtime host.
            let needs_runtime_host = !style.runtime_rules.is_empty()
                || style.runtime_class_value
                || style.animation.is_some()
                || style.margin.is_some()
                || style.divide.is_some();
            if style.transition.is_some() && !needs_runtime_host {
                diagnostics.push(transition_without_runtime_diagnostic());
                style.transition = None;
            }

            let runtime_class_name = (!style.runtime_classes.is_empty())
                .then(|| runtime_class_attr(class_name_attr, forwarded_classes(&style), None));
            // A margin the literal resolved is handed over whole; one forwarded
            // with a variant is only known to be coming.
            let runtime_margin = forwards_margin(&style, config);
            let may_divide = style.divide.is_some() || forwards_divide(&style, config);

            Some(LoweredClassName {
                style_ir: style,
                preserved_attrs,
                runtime_class_name,
                needs_runtime_host,
                tests: Vec::new(),
                runtime_margin,
                may_divide,
                class_name_span: class_name_attr.span,
                class_name_index,
                tokens: spans,
            })
        }
        Some(JSXAttrValue::JSXExprContainer(container)) => {
            let JSXExpr::Expr(expr) = &container.expr else {
                return Some(LoweredClassName {
                    style_ir: StyleIr {
                        runtime_class_value: true,
                        ..StyleIr::default()
                    },
                    preserved_attrs,
                    runtime_class_name: Some(class_name_attr.clone()),
                    needs_runtime_host: true,
                    tests: Vec::new(),
                    runtime_margin: false,
                    may_divide: true,
                    class_name_span: class_name_attr.span,
                    class_name_index,
                    tokens: Vec::new(),
                });
            };

            let deferred = target
                .class_value_is_deferred()
                .then(|| crate::swc::builders::deferred_body(expr))
                .flatten();
            let expr: &Expr = deferred.unwrap_or(expr);

            let mut collapse = collapse_class_value_expr(expr, scopes);
            // Read before the fallback below, which drops the branch tokens that
            // may be the only place a margin is named.
            let readable_margin = class_value_names_margin(&collapse, config, element_tag);
            let mut style =
                resolve_class_tokens(collapse.static_tokens(), config, element_tag, diagnostics);
            let mut tests = Vec::new();

            if collapse.has_branches() {
                match lower_branches(&collapse, &style, config, element_tag) {
                    Some(lowered) => {
                        for diagnostic in lowered.diagnostics {
                            if !diagnostics.iter().any(|reported| {
                                reported.code == diagnostic.code
                                    && reported.token == diagnostic.token
                            }) {
                                diagnostics.push(diagnostic);
                            }
                        }

                        if !lowered.rules.is_empty() {
                            style.runtime_rules.extend(lowered.rules);
                            tests = std::mem::take(&mut collapse.tests);
                        }
                    }
                    // A branch that reaches past what a rule can carry takes the
                    // whole class value with it: the runtime resolves it as it
                    // was written, and nothing is lowered here twice.
                    None => {
                        collapse = collapse_class_value_expr_without_branches(expr, scopes);
                        style = resolve_class_tokens(
                            collapse.static_tokens(),
                            config,
                            element_tag,
                            &mut Vec::new(),
                        );
                    }
                }
            }

            sort_rules_by_precedence(&mut style.runtime_rules);
            share_grid_inputs(&mut style, collapse.dynamic_expr.is_some());
            share_size_inputs(&mut style);
            share_transform_inputs(&mut style);
            let texts: Vec<&str> = collapse
                .static_tokens()
                .into_iter()
                .chain(
                    collapse
                        .branches()
                        .flat_map(|branch| branch.tokens.iter().map(String::as_str)),
                )
                .collect();
            diagnostics.extend(drop_props_declared_on_element(
                &mut style,
                &declared,
                &texts,
                config,
                element_tag,
            ));
            // The tests are read only by the branch rules, and a declared prop
            // can take every one of those out.
            if style.runtime_rules.is_empty() {
                tests.clear();
            }
            let tokens: Vec<ClassToken> = texts
                .iter()
                .map(|text| ClassToken {
                    text: (*text).to_owned(),
                    range: EditorRange {
                        start: container.span.lo.0,
                        end: container.span.hi.0,
                    },
                })
                .collect();

            let runtime_class_value =
                collapse.dynamic_expr.is_some() || !tests.is_empty() || style.runtime_class_value;
            let needs_runtime_host = !style.runtime_rules.is_empty()
                || runtime_class_value
                || style.animation.is_some()
                || style.margin.is_some()
                || style.divide.is_some();
            let may_divide = style.divide.is_some()
                || forwards_divide(&style, config)
                || collapse.dynamic_expr.is_some();
            let forwarded = (!style.runtime_classes.is_empty()).then(|| forwarded_classes(&style));
            let leftover = match (forwarded, collapse.dynamic_expr) {
                (Some(forwarded), Some(leftover)) => Some(Box::new(Expr::Array(ArrayLit {
                    span: DUMMY_SP,
                    elems: vec![
                        Some(ExprOrSpread {
                            spread: None,
                            expr: forwarded,
                        }),
                        Some(ExprOrSpread {
                            spread: None,
                            expr: leftover,
                        }),
                    ],
                }))),
                (forwarded, leftover) => forwarded.or(leftover),
            };
            let runtime_class_name = leftover.map(|leftover| {
                // What is left of a deferred class value goes back deferred:
                // read once, it would hold whatever its sources said at
                // creation and never look again.
                let leftover = if deferred.is_some() {
                    Box::new(crate::swc::builders::thunk(*leftover))
                } else {
                    leftover
                };

                runtime_class_attr(class_name_attr, leftover, Some(container.span))
            });

            let runtime_margin = readable_margin && style.margin.is_none();

            Some(LoweredClassName {
                style_ir: StyleIr {
                    runtime_class_value,
                    ..style
                },
                preserved_attrs,
                runtime_class_name,
                needs_runtime_host,
                tests,
                runtime_margin,
                may_divide,
                class_name_span: class_name_attr.span,
                class_name_index,
                tokens,
            })
        }
        _ => Some(LoweredClassName {
            style_ir: StyleIr {
                runtime_class_value: true,
                ..StyleIr::default()
            },
            preserved_attrs,
            runtime_class_name: Some(class_name_attr.clone()),
            needs_runtime_host: true,
            tests: Vec::new(),
            // Nothing here was readable, so nothing can be said about a margin.
            runtime_margin: false,
            may_divide: true,
            class_name_span: class_name_attr.span,
            class_name_index,
            tokens: Vec::new(),
        }),
    }
}

/// Whether a class value names a margin anywhere this pass could read it —
/// a static token or a branch's. What it resolves to is the runtime's to decide;
/// that one may be coming is all a target needs in order to build the box.
fn class_value_names_margin(
    collapse: &crate::class_value::collapse::ClassValueCollapse,
    config: &crate::config::model::TailwindConfig,
    element_tag: Option<&str>,
) -> bool {
    use crate::class_value::collapse::ClassValueSegment;

    let mut tokens: Vec<&str> = Vec::new();
    for segment in &collapse.segments {
        match segment {
            ClassValueSegment::Static(token) => tokens.push(token.as_str()),
            ClassValueSegment::Branch(branch) => {
                tokens.extend(branch.tokens.iter().map(String::as_str));
            }
        }
    }

    if tokens.is_empty() {
        return false;
    }

    let style = resolve_class_tokens(tokens, config, element_tag, &mut Vec::new());
    style.margin.is_some() || forwards_margin(&style, config)
}

/// Whether a forwarded class can give the element a margin box. A negative
/// margin only shifts it, so it needs none.
fn forwards_margin(style: &StyleIr, config: &crate::config::model::TailwindConfig) -> bool {
    let variants = VariantRegistry::new(config);
    style.runtime_classes.iter().any(|token| {
        let analysis = analyze_class_token(token, &variants);
        matches!(analysis.utility, UtilityKind::Margin(_)) && !analysis.is_negative()
    })
}

fn forwards_divide(style: &StyleIr, config: &crate::config::model::TailwindConfig) -> bool {
    let variants = VariantRegistry::new(config);
    style.runtime_classes.iter().any(|token| {
        matches!(
            analyze_class_token(token, &variants).utility,
            UtilityKind::DivideX | UtilityKind::DivideY
        )
    })
}

fn forwarded_classes(style: &StyleIr) -> Box<Expr> {
    crate::swc::builders::parse_expression(
        &serde_json::to_string(&style.runtime_classes.join(" "))
            .expect("class names must serialize to JSON"),
    )
}

fn runtime_class_attr(class_name_attr: &JSXAttr, value: Box<Expr>, span: Option<Span>) -> JSXAttr {
    let mut runtime_attr = class_name_attr.clone();
    runtime_attr.value = Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
        span: span.unwrap_or(DUMMY_SP),
        expr: JSXExpr::Expr(value),
    }));
    runtime_attr
}

pub(crate) fn attach_token_ranges(diagnostics: &mut [Diagnostic], spans: &[ClassToken]) {
    for diagnostic in diagnostics {
        if diagnostic.range.is_some() {
            continue;
        }

        let Some(token) = diagnostic.token.as_deref() else {
            continue;
        };

        if let Some(span) = spans.iter().find(|span| span.text == token) {
            diagnostic.range = Some(span.range.clone());
        }
    }
}

/// Reports `className` on host elements the transformer never lowers, so it does
/// not silently reach the runtime as an unknown Roblox property.
pub(crate) fn unsupported_host_class_name_diagnostic(
    name: &JSXElementName,
    attrs: &[JSXAttrOrSpread],
) -> Option<Diagnostic> {
    let class_name_attr = find_class_name_attr(attrs)?;
    let element = element_display_name(name);

    Some(Diagnostic {
        level: "warning".to_owned(),
        code: "classname-on-unsupported-host".to_owned(),
        message: format!(
            "`className` on `{element}` is not lowered; supported host elements are frame, scrollingframe, canvasgroup, textlabel, textbutton, textbox, imagelabel, and imagebutton."
        ),
        token: None,
        range: class_name_value_range(class_name_attr),
    })
}

/// Renders a component element name as the expression the runtime host renders.
pub(crate) fn element_expression_source(name: &JSXElementName) -> Option<String> {
    match name {
        JSXElementName::Ident(ident) => Some(ident.sym.to_string()),
        JSXElementName::JSXMemberExpr(member) => {
            let mut parts = vec![member.prop.sym.to_string()];
            let mut object = &member.obj;
            loop {
                match object {
                    JSXObject::Ident(ident) => {
                        parts.push(ident.sym.to_string());
                        break;
                    }
                    JSXObject::JSXMemberExpr(inner) => {
                        parts.push(inner.prop.sym.to_string());
                        object = &inner.obj;
                    }
                }
            }
            parts.reverse();
            Some(parts.join("."))
        }
        JSXElementName::JSXNamespacedName(_) => None,
    }
}

/// The props an element writes itself. A spread names nothing this pass can
/// read, so it is left to the order JSX gives it.
pub(crate) fn declared_prop_names(attrs: &[JSXAttrOrSpread]) -> Vec<String> {
    attrs
        .iter()
        .filter_map(|attr| match attr {
            JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(ident),
                ..
            }) if ident.sym != "className" => Some(ident.sym.to_string()),
            _ => None,
        })
        .collect()
}

fn find_class_name_attr(attrs: &[JSXAttrOrSpread]) -> Option<&JSXAttr> {
    attrs.iter().find_map(|attr| match attr {
        JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name) => Some(attr),
        _ => None,
    })
}

fn class_name_value_range(attr: &JSXAttr) -> Option<EditorRange> {
    match &attr.value {
        // `span.lo` is the opening quote and `span.hi` is one past the closing
        // quote, so the value itself sits between them.
        Some(JSXAttrValue::Str(value)) => Some(EditorRange {
            start: value.span.lo.0,
            end: value.span.hi.0.saturating_sub(2),
        }),
        _ => None,
    }
}

pub(crate) fn element_display_name(name: &JSXElementName) -> String {
    match name {
        JSXElementName::Ident(ident) => ident.sym.to_string(),
        JSXElementName::JSXMemberExpr(member) => member.prop.sym.to_string(),
        JSXElementName::JSXNamespacedName(namespaced) => namespaced.name.sym.to_string(),
    }
}

pub(crate) fn is_component_element(name: &JSXElementName) -> bool {
    match name {
        JSXElementName::Ident(ident) => ident.sym.chars().next().is_some_and(char::is_uppercase),
        JSXElementName::JSXMemberExpr(_) => true,
        JSXElementName::JSXNamespacedName(_) => false,
    }
}
