use swc_core::{
    common::{BytePos, FileName, SourceMap, Span, sync::Lrc},
    ecma::{
        ast::{Expr, Lit, Str},
        parser::{Syntax, TsSyntax, parse_file_as_expr, parse_file_as_module},
        visit::{VisitMut, VisitMutWith},
    },
};

// A fragment's own source map starts where the file's does, so its spans are moved past any real file rather than dropped, which would change the emit's layout.
const FRAGMENT_POS_BASE: u32 = 1 << 30;

struct MoveOutOfFileRange;

impl VisitMut for MoveOutOfFileRange {
    fn visit_mut_span(&mut self, span: &mut Span) {
        if !span.is_dummy() {
            *span = Span::new(
                span.lo + BytePos(FRAGMENT_POS_BASE),
                span.hi + BytePos(FRAGMENT_POS_BASE),
            );
        }
    }
}

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
        Ok(mut module) if recovered_errors.is_empty() => {
            module.visit_mut_with(&mut MoveOutOfFileRange);
            module.body
        }
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
        Ok(mut expr) if recovered_errors.is_empty() => {
            expr.visit_mut_with(&mut MoveOutOfFileRange);
            expr
        }
        _ => Box::new(Expr::Lit(Lit::Str(Str {
            span: swc_core::common::DUMMY_SP,
            value: value.into(),
            raw: None,
        }))),
    }
}
