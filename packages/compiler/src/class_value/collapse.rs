use crate::class_value::scope::ClassValueScopeStack;
use crate::class_value::tokenize_class_name;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ArrayLit, BinExpr, BinaryOp, Bool, CondExpr, Expr, ExprOrSpread, KeyValueProp, Lit,
        ObjectLit, ParenExpr, Prop, PropName, PropOrSpread, Str, UnaryExpr, UnaryOp,
    },
};

#[derive(Clone, Default)]
pub(crate) struct ClassValueCollapse {
    pub(crate) static_tokens: Vec<String>,
    pub(crate) dynamic_expr: Option<Box<Expr>>,
}

impl ClassValueCollapse {
    pub(crate) fn static_only(tokens: Vec<String>) -> Self {
        Self {
            static_tokens: tokens,
            dynamic_expr: None,
        }
    }

    pub(crate) fn dynamic(expr: Box<Expr>) -> Self {
        Self {
            static_tokens: Vec::new(),
            dynamic_expr: Some(expr),
        }
    }

    pub(crate) fn is_dynamic(&self) -> bool {
        self.dynamic_expr.is_some()
    }

    pub(crate) fn into_expr(self) -> Box<Expr> {
        match self.dynamic_expr {
            Some(expr) => expr,
            None if self.static_tokens.is_empty() => Box::new(Expr::Lit(Lit::Bool(Bool {
                span: DUMMY_SP,
                value: false,
            }))),
            None => Box::new(Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: self.static_tokens.join(" ").into(),
                raw: None,
            }))),
        }
    }
}

pub(crate) fn collapse_class_value_expr(
    expr: &Expr,
    scopes: &ClassValueScopeStack,
) -> ClassValueCollapse {
    match expr {
        Expr::Paren(ParenExpr { expr, .. }) => collapse_class_value_expr(expr, scopes),
        Expr::Lit(Lit::Str(value)) => ClassValueCollapse::static_only(
            tokenize_class_name(&value.value.to_string_lossy())
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
        Expr::Lit(Lit::Bool(_)) | Expr::Lit(Lit::Null(_)) => ClassValueCollapse::default(),
        Expr::Ident(ident) if ident.sym == "undefined" => ClassValueCollapse::default(),
        Expr::Ident(ident) if scopes.resolve(ident).is_some() => ClassValueCollapse::default(),
        Expr::Unary(UnaryExpr {
            op: UnaryOp::Bang,
            arg,
            ..
        }) => {
            if evaluate_constant_truthiness(arg, scopes).is_some() {
                ClassValueCollapse::default()
            } else {
                ClassValueCollapse::dynamic(Box::new(expr.clone()))
            }
        }
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalAnd,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(true) => collapse_class_value_expr(right, scopes),
            Some(false) => ClassValueCollapse::default(),
            None => ClassValueCollapse::dynamic(Box::new(Expr::Bin(BinExpr {
                span: DUMMY_SP,
                op: BinaryOp::LogicalAnd,
                left: collapse_class_value_expr(left, scopes).into_expr(),
                right: collapse_class_value_expr(right, scopes).into_expr(),
            }))),
        },
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalOr,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(true) => ClassValueCollapse::default(),
            Some(false) => collapse_class_value_expr(right, scopes),
            None => ClassValueCollapse::dynamic(Box::new(Expr::Bin(BinExpr {
                span: DUMMY_SP,
                op: BinaryOp::LogicalOr,
                left: collapse_class_value_expr(left, scopes).into_expr(),
                right: collapse_class_value_expr(right, scopes).into_expr(),
            }))),
        },
        Expr::Cond(CondExpr {
            test, cons, alt, ..
        }) => match evaluate_constant_truthiness(test, scopes) {
            Some(true) => collapse_class_value_expr(cons, scopes),
            Some(false) => collapse_class_value_expr(alt, scopes),
            None => ClassValueCollapse::dynamic(Box::new(Expr::Cond(CondExpr {
                span: DUMMY_SP,
                test: test.clone(),
                cons: collapse_class_value_expr(cons, scopes).into_expr(),
                alt: collapse_class_value_expr(alt, scopes).into_expr(),
            }))),
        },
        Expr::Array(ArrayLit { elems, .. }) => {
            let mut static_tokens = Vec::new();
            let mut dynamic_elems = Vec::new();

            for elem in elems.iter().flatten() {
                if elem.spread.is_some() {
                    dynamic_elems.push(elem.clone());
                    continue;
                }

                let collapse = collapse_class_value_expr(&elem.expr, scopes);
                static_tokens.extend(collapse.static_tokens);

                if let Some(dynamic_expr) = collapse.dynamic_expr {
                    dynamic_elems.push(ExprOrSpread {
                        spread: None,
                        expr: dynamic_expr,
                    });
                }
            }

            if dynamic_elems.is_empty() {
                ClassValueCollapse::static_only(static_tokens)
            } else {
                let dynamic_expr = if dynamic_elems.len() == 1 {
                    dynamic_elems
                        .into_iter()
                        .next()
                        .expect("at least one dynamic array element")
                        .expr
                } else {
                    Box::new(Expr::Array(ArrayLit {
                        span: DUMMY_SP,
                        elems: dynamic_elems.into_iter().map(Some).collect(),
                    }))
                };

                ClassValueCollapse {
                    static_tokens,
                    dynamic_expr: Some(dynamic_expr),
                }
            }
        }
        Expr::Object(ObjectLit { props, .. }) => {
            let mut static_tokens = Vec::new();
            let mut dynamic_props = Vec::new();

            for prop in props {
                match prop {
                    PropOrSpread::Prop(prop) => match &**prop {
                        Prop::KeyValue(KeyValueProp { key, value }) => {
                            let Some(class_key) = static_object_key(key) else {
                                dynamic_props.push(PropOrSpread::Prop(prop.clone()));
                                continue;
                            };

                            if let Some(truthy) = evaluate_constant_truthiness(value, scopes) {
                                if truthy {
                                    static_tokens.extend(
                                        tokenize_class_name(&class_key)
                                            .into_iter()
                                            .map(str::to_owned),
                                    );
                                }
                                continue;
                            }

                            let reduced_value = collapse_class_value_expr(value, scopes);
                            if let Some(dynamic_expr) = reduced_value.dynamic_expr {
                                dynamic_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(
                                    KeyValueProp {
                                        key: key.clone(),
                                        value: dynamic_expr,
                                    },
                                ))));
                            }
                        }
                        _ => dynamic_props.push(PropOrSpread::Prop(prop.clone())),
                    },
                    PropOrSpread::Spread(spread) => {
                        dynamic_props.push(PropOrSpread::Spread(spread.clone()))
                    }
                }
            }

            if dynamic_props.is_empty() {
                ClassValueCollapse::static_only(static_tokens)
            } else {
                ClassValueCollapse {
                    static_tokens,
                    dynamic_expr: Some(Box::new(Expr::Object(ObjectLit {
                        span: DUMMY_SP,
                        props: dynamic_props,
                    }))),
                }
            }
        }
        _ => ClassValueCollapse::dynamic(Box::new(expr.clone())),
    }
}

pub(crate) fn evaluate_constant_truthiness(
    expr: &Expr,
    scopes: &ClassValueScopeStack,
) -> Option<bool> {
    match expr {
        Expr::Paren(ParenExpr { expr, .. }) => evaluate_constant_truthiness(expr, scopes),
        Expr::Lit(Lit::Bool(value)) => Some(value.value),
        Expr::Lit(Lit::Null(_)) => Some(false),
        Expr::Lit(Lit::Str(value)) => Some(!value.value.is_empty()),
        Expr::Array(_) | Expr::Object(_) => Some(true),
        Expr::Ident(ident) if ident.sym == "undefined" => Some(false),
        Expr::Ident(ident) => scopes.resolve(ident),
        Expr::Unary(UnaryExpr {
            op: UnaryOp::Bang,
            arg,
            ..
        }) => evaluate_constant_truthiness(arg, scopes).map(|value| !value),
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalAnd,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(false) => Some(false),
            Some(true) => evaluate_constant_truthiness(right, scopes),
            None => None,
        },
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalOr,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(true) => Some(true),
            Some(false) => evaluate_constant_truthiness(right, scopes),
            None => None,
        },
        Expr::Cond(CondExpr {
            test, cons, alt, ..
        }) => match evaluate_constant_truthiness(test, scopes) {
            Some(true) => evaluate_constant_truthiness(cons, scopes),
            Some(false) => evaluate_constant_truthiness(alt, scopes),
            None => None,
        },
        _ => None,
    }
}

pub(crate) fn static_object_key(key: &PropName) -> Option<String> {
    match key {
        PropName::Str(value) => Some(value.value.to_string_lossy().into_owned()),
        PropName::Ident(ident) => Some(ident.sym.to_string()),
        _ => None,
    }
}
