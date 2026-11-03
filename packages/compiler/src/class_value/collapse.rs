use crate::class_value::scope::ClassValueScopeStack;
use crate::class_value::tokenize_class_name;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        ArrayLit, BinExpr, BinaryOp, Bool, CondExpr, Expr, ExprOrSpread, KeyValueProp, Lit,
        ObjectLit, ParenExpr, Prop, PropName, PropOrSpread, Str, Tpl, UnaryExpr, UnaryOp,
    },
};

/// One of the class value's undecided tests, and the value a branch needs it to
/// have. The tests reach the runtime host as `__velaTests`, so a condition names
/// its own by index rather than carrying the expression again.
#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct BranchCondition {
    pub(crate) test: usize,
    pub(crate) expected: bool,
}

/// A class list the compiler could read but not decide: which tokens the branch
/// names is known here, and whether they apply is not.
#[derive(Clone)]
pub(crate) struct ClassValueBranch {
    pub(crate) conditions: Vec<BranchCondition>,
    pub(crate) tokens: Vec<String>,
}

#[derive(Clone)]
pub(crate) enum ClassValueSegment {
    Static(String),
    Branch(ClassValueBranch),
}

/// A `className` expression read as far as it goes: the tokens it always names,
/// the ones it names under a test, and whatever is left that only the runtime
/// can resolve. Segments stay in source order, because a token written later
/// overwrites one written earlier.
#[derive(Clone, Default)]
pub(crate) struct ClassValueCollapse {
    pub(crate) segments: Vec<ClassValueSegment>,
    pub(crate) tests: Vec<Expr>,
    pub(crate) dynamic_expr: Option<Box<Expr>>,
}

impl ClassValueCollapse {
    pub(crate) fn static_tokens(&self) -> Vec<&str> {
        self.segments
            .iter()
            .filter_map(|segment| match segment {
                ClassValueSegment::Static(token) => Some(token.as_str()),
                ClassValueSegment::Branch(_) => None,
            })
            .collect()
    }

    pub(crate) fn branches(&self) -> impl Iterator<Item = &ClassValueBranch> {
        self.segments.iter().filter_map(|segment| match segment {
            ClassValueSegment::Branch(branch) => Some(branch),
            ClassValueSegment::Static(_) => None,
        })
    }

    pub(crate) fn has_branches(&self) -> bool {
        self.branches().next().is_some()
    }
}

/// The tokens a branch is resolved against: every static token of the class
/// value, with the branch's own inserted where it was written, so a token
/// written after it still wins.
pub(crate) fn branch_context_tokens(
    segments: &[ClassValueSegment],
    branch_index: usize,
) -> Vec<String> {
    let mut tokens = Vec::new();

    for (index, segment) in segments.iter().enumerate() {
        match segment {
            ClassValueSegment::Static(token) => tokens.push(token.clone()),
            ClassValueSegment::Branch(branch) if index == branch_index => {
                tokens.extend(branch.tokens.iter().cloned())
            }
            ClassValueSegment::Branch(_) => {}
        }
    }

    tokens
}

pub(crate) fn collapse_class_value_expr(
    expr: &Expr,
    scopes: &ClassValueScopeStack,
) -> ClassValueCollapse {
    collapse_with(expr, scopes, true)
}

/// The same reading with every undecided branch left whole, for a class value
/// whose branches turned out to name more than a rule can carry.
pub(crate) fn collapse_class_value_expr_without_branches(
    expr: &Expr,
    scopes: &ClassValueScopeStack,
) -> ClassValueCollapse {
    collapse_with(expr, scopes, false)
}

fn collapse_with(expr: &Expr, scopes: &ClassValueScopeStack, branches: bool) -> ClassValueCollapse {
    let mut reducer = Reducer {
        scopes,
        tests: Vec::new(),
        branches,
    };
    let reduction = reducer.reduce(expr);

    ClassValueCollapse {
        segments: reduction.segments,
        tests: reducer.tests,
        dynamic_expr: reduction.dynamic,
    }
}

struct Reducer<'a> {
    scopes: &'a ClassValueScopeStack,
    tests: Vec<Expr>,
    /// Whether an undecided test may be read as a branch at all.
    branches: bool,
}

/// What one expression came to. `dynamic` empty means the expression is fully
/// known, which is what a test may be wrapped around; anything else can only
/// stand at the top level, where the leftover travels as `className`.
#[derive(Default)]
struct Reduction {
    segments: Vec<ClassValueSegment>,
    dynamic: Option<Box<Expr>>,
}

impl Reduction {
    fn tokens(tokens: Vec<String>) -> Self {
        Self {
            segments: tokens.into_iter().map(ClassValueSegment::Static).collect(),
            dynamic: None,
        }
    }

    fn dynamic(expr: Box<Expr>) -> Self {
        Self {
            segments: Vec::new(),
            dynamic: Some(expr),
        }
    }

    fn is_known(&self) -> bool {
        self.dynamic.is_none()
    }

    fn is_empty(&self) -> bool {
        self.segments.is_empty() && self.dynamic.is_none()
    }

    /// Puts every segment behind one more test. A branch already under a test
    /// keeps it, so a nested conditional reads as the conjunction it is.
    fn gate(self, condition: BranchCondition) -> Self {
        let mut segments: Vec<ClassValueSegment> = Vec::new();

        for segment in self.segments {
            match segment {
                ClassValueSegment::Static(token) => match segments.last_mut() {
                    // Adjacent tokens under the same test are one branch, which
                    // keeps the emitted rule list as short as the source.
                    Some(ClassValueSegment::Branch(branch))
                        if branch.conditions == vec![condition] =>
                    {
                        branch.tokens.push(token)
                    }
                    _ => segments.push(ClassValueSegment::Branch(ClassValueBranch {
                        conditions: vec![condition],
                        tokens: vec![token],
                    })),
                },
                ClassValueSegment::Branch(mut branch) => {
                    branch.conditions.insert(0, condition);
                    segments.push(ClassValueSegment::Branch(branch));
                }
            }
        }

        Self {
            segments,
            dynamic: None,
        }
    }

    /// Renders the reduction back to an expression, for a parent that could not
    /// use it and falls back to handing the whole thing to the runtime.
    fn into_expr(self, original: &Expr) -> Box<Expr> {
        let mut tokens = Vec::new();
        for segment in &self.segments {
            match segment {
                ClassValueSegment::Static(token) => tokens.push(token.as_str()),
                // A branch cannot be written back as a class value, so the
                // expression it was read from stands in for the whole thing.
                ClassValueSegment::Branch(_) => return Box::new(original.clone()),
            }
        }

        let literal = || {
            Box::new(Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: tokens.join(" ").into(),
                raw: None,
            })))
        };

        match self.dynamic {
            None if tokens.is_empty() => Box::new(Expr::Lit(Lit::Bool(Bool {
                span: DUMMY_SP,
                value: false,
            }))),
            None => literal(),
            Some(expr) if tokens.is_empty() => expr,
            Some(expr) => Box::new(Expr::Array(ArrayLit {
                span: DUMMY_SP,
                elems: vec![
                    Some(ExprOrSpread {
                        spread: None,
                        expr: literal(),
                    }),
                    Some(ExprOrSpread { spread: None, expr }),
                ],
            })),
        }
    }
}

impl Reducer<'_> {
    fn reduce(&mut self, expr: &Expr) -> Reduction {
        match expr {
            Expr::Paren(ParenExpr { expr, .. }) => self.reduce(expr),
            Expr::Lit(Lit::Str(value)) => {
                Reduction::tokens(owned_tokens(&value.value.to_string_lossy()))
            }
            Expr::Tpl(template) => match no_substitution_template(template) {
                Some(value) => Reduction::tokens(owned_tokens(&value)),
                None => Reduction::dynamic(Box::new(expr.clone())),
            },
            Expr::Lit(Lit::Bool(_)) | Expr::Lit(Lit::Null(_)) => Reduction::default(),
            Expr::Ident(ident) if ident.sym == "undefined" => Reduction::default(),
            Expr::Ident(ident) if self.scopes.resolve(ident).is_some() => {
                match self.scopes.resolve_text(ident) {
                    Some(text) => Reduction::tokens(owned_tokens(text)),
                    None => Reduction::default(),
                }
            }
            Expr::Unary(UnaryExpr {
                op: UnaryOp::Bang,
                arg,
                ..
            }) => {
                if evaluate_constant_truthiness(arg, self.scopes).is_some() {
                    Reduction::default()
                } else {
                    Reduction::dynamic(Box::new(expr.clone()))
                }
            }
            Expr::Bin(BinExpr {
                op: BinaryOp::LogicalAnd,
                left,
                right,
                ..
            }) => match evaluate_constant_truthiness(left, self.scopes) {
                Some(true) => self.reduce(right),
                Some(false) => Reduction::default(),
                // A falsy `left` is the whole value and names no class, so what
                // the expression comes to is `right` behind that test.
                None => match self.gated(right, left, true) {
                    Some(reduction) => reduction,
                    None => {
                        let left_expr = self.aside(left);
                        let right_expr = self.aside(right);
                        Reduction::dynamic(Box::new(Expr::Bin(BinExpr {
                            span: DUMMY_SP,
                            op: BinaryOp::LogicalAnd,
                            left: left_expr,
                            right: right_expr,
                        })))
                    }
                },
            },
            Expr::Bin(BinExpr {
                op: BinaryOp::LogicalOr,
                left,
                right,
                ..
            }) => match evaluate_constant_truthiness(left, self.scopes) {
                Some(true) => Reduction::default(),
                Some(false) => self.reduce(right),
                // A truthy `left` is the class value itself, and it can be a
                // string this pass never sees, so it travels on as the leftover
                // — where being falsy already keeps it from naming anything.
                None => match self.gated(right, left, false) {
                    Some(mut reduction) => {
                        reduction.dynamic = Some(left.clone());
                        reduction
                    }
                    None => {
                        let right_expr = self.aside(right);
                        Reduction::dynamic(Box::new(Expr::Bin(BinExpr {
                            span: DUMMY_SP,
                            op: BinaryOp::LogicalOr,
                            left: left.clone(),
                            right: right_expr,
                        })))
                    }
                },
            },
            Expr::Cond(CondExpr {
                test, cons, alt, ..
            }) => match evaluate_constant_truthiness(test, self.scopes) {
                Some(true) => self.reduce(cons),
                Some(false) => self.reduce(alt),
                None => {
                    let restore = self.tests.len();
                    let index = self.push_test(test);
                    let consequent = self.reduce(cons);
                    let alternate = self.reduce(alt);

                    if self.branches && consequent.is_known() && alternate.is_known() {
                        let mut segments = consequent
                            .gate(BranchCondition {
                                test: index,
                                expected: true,
                            })
                            .segments;
                        segments.extend(
                            alternate
                                .gate(BranchCondition {
                                    test: index,
                                    expected: false,
                                })
                                .segments,
                        );

                        return Reduction {
                            segments,
                            dynamic: None,
                        };
                    }

                    self.tests.truncate(restore);
                    Reduction::dynamic(Box::new(Expr::Cond(CondExpr {
                        span: DUMMY_SP,
                        test: test.clone(),
                        cons: consequent.into_expr(cons),
                        alt: alternate.into_expr(alt),
                    })))
                }
            },
            Expr::Array(ArrayLit { elems, .. }) => {
                let mut reduction = Reduction::default();
                let mut dynamic_elems = Vec::new();

                for elem in elems.iter().flatten() {
                    if elem.spread.is_some() {
                        dynamic_elems.push((*elem.expr).clone());
                        continue;
                    }

                    let element = self.reduce(&elem.expr);
                    reduction.segments.extend(element.segments);
                    if let Some(expr) = element.dynamic {
                        dynamic_elems.push(*expr);
                    }
                }

                reduction.dynamic = join_dynamic(dynamic_elems);
                reduction
            }
            Expr::Object(ObjectLit { props, .. }) => {
                let mut reduction = Reduction::default();
                let mut dynamic_props = Vec::new();

                for prop in props {
                    match prop {
                        PropOrSpread::Prop(prop) => match &**prop {
                            Prop::KeyValue(KeyValueProp { key, value }) => {
                                let Some(class_key) = static_object_key(key) else {
                                    dynamic_props.push(PropOrSpread::Prop(prop.clone()));
                                    continue;
                                };

                                let tokens = owned_tokens(&class_key);
                                if let Some(truthy) =
                                    evaluate_constant_truthiness(value, self.scopes)
                                {
                                    if truthy {
                                        reduction.segments.extend(
                                            tokens.into_iter().map(ClassValueSegment::Static),
                                        );
                                    }
                                    continue;
                                }

                                if tokens.is_empty() {
                                    continue;
                                }

                                if !self.branches {
                                    dynamic_props.push(PropOrSpread::Prop(prop.clone()));
                                    continue;
                                }

                                // The key names the classes and the value only
                                // decides them, so the value is the test.
                                let index = self.push_test(value);
                                reduction.segments.push(ClassValueSegment::Branch(
                                    ClassValueBranch {
                                        conditions: vec![BranchCondition {
                                            test: index,
                                            expected: true,
                                        }],
                                        tokens,
                                    },
                                ));
                            }
                            _ => dynamic_props.push(PropOrSpread::Prop(prop.clone())),
                        },
                        PropOrSpread::Spread(spread) => {
                            dynamic_props.push(PropOrSpread::Spread(spread.clone()))
                        }
                    }
                }

                if !dynamic_props.is_empty() {
                    reduction.dynamic = Some(Box::new(Expr::Object(ObjectLit {
                        span: DUMMY_SP,
                        props: dynamic_props,
                    })));
                }

                reduction
            }
            _ => Reduction::dynamic(Box::new(expr.clone())),
        }
    }

    /// Reduces `value` behind `test`. `None` when what it comes to is not
    /// something a test can be wrapped around, and the caller falls back.
    fn gated(&mut self, value: &Expr, test: &Expr, expected: bool) -> Option<Reduction> {
        if !self.branches {
            return None;
        }

        let restore = self.tests.len();
        let index = self.push_test(test);
        let reduction = self.reduce(value);

        if reduction.is_empty() {
            self.tests.truncate(restore);
            return Some(Reduction::default());
        }

        if !reduction.is_known() {
            self.tests.truncate(restore);
            return None;
        }

        Some(reduction.gate(BranchCondition {
            test: index,
            expected,
        }))
    }

    /// Folds a sub-expression for a fallback that hands the whole class value
    /// back to the runtime, so the tests it names stay out of the emit.
    fn aside(&self, expr: &Expr) -> Box<Expr> {
        let mut reducer = Reducer {
            scopes: self.scopes,
            tests: Vec::new(),
            branches: false,
        };

        reducer.reduce(expr).into_expr(expr)
    }

    fn push_test(&mut self, test: &Expr) -> usize {
        self.tests.push(test.clone());
        self.tests.len() - 1
    }
}

fn join_dynamic(mut parts: Vec<Expr>) -> Option<Box<Expr>> {
    match parts.len() {
        0 => None,
        1 => parts.pop().map(Box::new),
        _ => Some(Box::new(Expr::Array(ArrayLit {
            span: DUMMY_SP,
            elems: parts
                .into_iter()
                .map(|expr| {
                    Some(ExprOrSpread {
                        spread: None,
                        expr: Box::new(expr),
                    })
                })
                .collect(),
        }))),
    }
}

fn owned_tokens(value: &str) -> Vec<String> {
    tokenize_class_name(value)
        .into_iter()
        .map(str::to_owned)
        .collect()
}

/// A template with nothing to substitute is a string literal wearing backticks.
pub(crate) fn constant_text(expr: &Expr) -> Option<String> {
    match expr {
        Expr::Paren(ParenExpr { expr, .. }) => constant_text(expr),
        Expr::Lit(Lit::Str(value)) => Some(value.value.to_string_lossy().into_owned()),
        Expr::Tpl(template) => no_substitution_template(template),
        _ => None,
    }
}

fn no_substitution_template(template: &Tpl) -> Option<String> {
    if !template.exprs.is_empty() {
        return None;
    }

    let quasi = template.quasis.first()?;
    quasi
        .cooked
        .as_ref()
        .map(|value| value.to_string_lossy().into_owned())
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
        Expr::Tpl(template) => no_substitution_template(template).map(|value| !value.is_empty()),
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
