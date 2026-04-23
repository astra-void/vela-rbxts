use swc_core::{
    common::{FileName, SourceMap, sync::Lrc},
    ecma::{
        ast::{Expr, Lit, Str},
        parser::{Syntax, TsSyntax, parse_file_as_expr, parse_file_as_module},
    },
};

pub(crate) fn parse_module_items(source: &str) -> Vec<swc_core::ecma::ast::ModuleItem> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Anon.into(), source.to_owned());
    let mut recovered_errors = Vec::new();

    match parse_file_as_module(
        &fm,
        Syntax::Typescript(TsSyntax {
            decorators: true,
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    ) {
        Ok(module) if recovered_errors.is_empty() => module.body,
        _ => Vec::new(),
    }
}

pub(crate) fn parse_expression(value: &str) -> Box<Expr> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Anon.into(), value.to_owned());
    let mut recovered_errors = Vec::new();

    match parse_file_as_expr(
        &fm,
        Syntax::Typescript(TsSyntax {
            tsx: false,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    ) {
        Ok(expr) if recovered_errors.is_empty() => expr,
        _ => Box::new(Expr::Lit(Lit::Str(Str {
            span: swc_core::common::DUMMY_SP,
            value: value.into(),
            raw: None,
        }))),
    }
}
