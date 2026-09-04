pub(crate) mod colors;
pub(crate) mod completions;
pub(crate) mod diagnostics;
pub(crate) mod hover;
pub(crate) mod inlay;
pub(crate) mod sort;

use crate::api::EditorRange;
pub(crate) use crate::class_token::{ClassToken, tokenize_class_name_with_ranges, utf16_len};
pub(crate) use crate::config::resolve::parse_editor_config;
use crate::transform::jsx::is_component_element;
use crate::transform::module::{
    is_class_name_attr, is_supported_host_element, is_supported_host_tag,
};
use swc_core::{
    common::{FileName, SourceMap, sync::Lrc},
    ecma::{
        ast::{
            ArrowExpr, BinaryOp, BlockStmt, BlockStmtOrExpr, Expr, Function, JSXAttrOrSpread,
            JSXAttrValue, JSXElement, JSXElementName, JSXExpr, Lit, Prop, PropName, PropOrSpread,
            ReturnStmt,
        },
        parser::{Syntax, TsSyntax, parse_file_as_module},
        visit::{Visit, VisitWith},
    },
};

#[derive(Clone)]
pub(crate) struct ClassNameContext {
    /// `None` when the class name sits on a component rather than a host element.
    pub(crate) element_tag: Option<String>,
    pub(crate) value: String,
    pub(crate) value_range: EditorRange,
    /// Set when the value runs into a `${...}` on that side with no space
    /// between, so the token at that edge is only part of a class.
    pub(crate) open_start: bool,
    pub(crate) open_end: bool,
}

impl ClassNameContext {
    /// An interpolation splices into the class its neighbouring token starts or
    /// ends, so what that token really is only settles at runtime: `w-[` out of
    /// `w-[${width}]` is half a utility, not an unknown one.
    pub(crate) fn splices_into(&self, token: &ClassToken) -> bool {
        (self.open_start && token.range.start == self.value_range.start)
            || (self.open_end && token.range.end == self.value_range.end)
    }
}

/// Returns the element's class name context: `Some(Some(tag))` for a supported
/// host element, `Some(None)` for a component, and `None` when the transformer
/// would not lower the class name at all.
fn lowered_element_tag(name: &JSXElementName) -> Option<Option<String>> {
    if is_supported_host_element(name) {
        return match name {
            JSXElementName::Ident(ident) => Some(Some(ident.sym.to_string())),
            _ => None,
        };
    }

    if is_component_element(name) {
        return Some(None);
    }

    None
}

pub(crate) struct ClassNameCollector<'a> {
    source: &'a str,
    source_base: u32,
    /// The source file drops a leading BOM before it hands out spans, while the
    /// offsets travel back over a document that still has it.
    bom: usize,
    contexts: Vec<ClassNameContext>,
}

impl ClassNameCollector<'_> {
    fn span_bytes(&self, span: swc_core::common::Span) -> (usize, usize) {
        let (lo, hi) = span_range(span, self.source_base);
        (lo + self.bom, hi + self.bom)
    }

    fn push_literal(&mut self, element_tag: &Option<String>, span: swc_core::common::Span) {
        let (lo, hi) = self.span_bytes(span);
        let (start, end) = literal_content_bytes(self.source, lo, hi);
        self.push_bytes(element_tag, start, end);
    }

    fn push_raw(&mut self, element_tag: &Option<String>, span: swc_core::common::Span) {
        let (lo, hi) = self.span_bytes(span);
        self.push_bytes(
            element_tag,
            lo.min(self.source.len()),
            hi.min(self.source.len()),
        );
    }

    fn push_bytes(&mut self, element_tag: &Option<String>, start: usize, end: usize) {
        let Some(value) = self.source.get(start..end) else {
            return;
        };

        self.contexts.push(ClassNameContext {
            element_tag: element_tag.clone(),
            value: value.to_owned(),
            value_range: EditorRange {
                start: byte_to_utf16_position(self.source, start),
                end: byte_to_utf16_position(self.source, end),
            },
            open_start: false,
            open_end: false,
        });
    }

    fn push_quasi(
        &mut self,
        element_tag: &Option<String>,
        span: swc_core::common::Span,
        edges: (bool, bool),
    ) {
        let pushed = self.contexts.len();
        self.push_raw(element_tag, span);
        if let Some(context) = self.contexts.get_mut(pushed) {
            (context.open_start, context.open_end) = edges;
        }
    }

    /// Walks the shapes `className={...}` takes in practice — template literals,
    /// conditionals, and `cn()`/`clsx()`-style helpers — so every statically
    /// visible class string reaches the editor features.
    fn collect_expr(&mut self, element_tag: &Option<String>, expr: &Expr) {
        match expr {
            Expr::Paren(paren) => self.collect_expr(element_tag, &paren.expr),
            Expr::TsAs(cast) => self.collect_expr(element_tag, &cast.expr),
            Expr::TsSatisfies(cast) => self.collect_expr(element_tag, &cast.expr),
            Expr::TsConstAssertion(cast) => self.collect_expr(element_tag, &cast.expr),
            Expr::TsTypeAssertion(cast) => self.collect_expr(element_tag, &cast.expr),
            Expr::TsNonNull(non_null) => self.collect_expr(element_tag, &non_null.expr),
            Expr::Lit(Lit::Str(value)) => self.push_literal(element_tag, value.span),
            // Interleaved so the contexts stay in source order, which is the
            // order the sort hands its edits back in.
            Expr::Tpl(tpl) => {
                for (index, quasi) in tpl.quasis.iter().enumerate() {
                    let following = tpl.exprs.get(index);
                    self.push_quasi(element_tag, quasi.span, (index > 0, following.is_some()));
                    if let Some(expr) = following {
                        self.collect_expr(element_tag, expr);
                    }
                }
            }
            Expr::Cond(cond) => {
                self.collect_expr(element_tag, &cond.cons);
                self.collect_expr(element_tag, &cond.alt);
            }
            Expr::Bin(bin)
                if matches!(
                    bin.op,
                    BinaryOp::LogicalAnd
                        | BinaryOp::LogicalOr
                        | BinaryOp::NullishCoalescing
                        | BinaryOp::Add
                ) =>
            {
                self.collect_expr(element_tag, &bin.left);
                self.collect_expr(element_tag, &bin.right);
            }
            Expr::Array(array) => {
                for element in array.elems.iter().flatten() {
                    self.collect_expr(element_tag, &element.expr);
                }
            }
            Expr::Object(object) => {
                for prop in &object.props {
                    let prop = match prop {
                        PropOrSpread::Spread(spread) => {
                            self.collect_expr(element_tag, &spread.expr);
                            continue;
                        }
                        PropOrSpread::Prop(prop) => prop,
                    };
                    let Prop::KeyValue(entry) = &**prop else {
                        continue;
                    };
                    match &entry.key {
                        PropName::Str(key) => self.push_literal(element_tag, key.span),
                        PropName::Ident(key) => self.push_raw(element_tag, key.span),
                        PropName::Computed(key) => self.collect_expr(element_tag, &key.expr),
                        _ => {}
                    }
                }
            }
            Expr::Call(call) => {
                for arg in &call.args {
                    self.collect_expr(element_tag, &arg.expr);
                }
            }
            // A deferred class value is written as a function, so what it
            // returns is the class name the editor features are asked about.
            Expr::Arrow(arrow) => match &*arrow.body {
                BlockStmtOrExpr::Expr(body) => self.collect_expr(element_tag, body),
                BlockStmtOrExpr::BlockStmt(body) => self.collect_returns(element_tag, body),
            },
            Expr::Fn(function) => {
                if let Some(body) = &function.function.body {
                    self.collect_returns(element_tag, body);
                }
            }
            _ => {}
        }
    }

    fn collect_returns(&mut self, element_tag: &Option<String>, body: &BlockStmt) {
        let mut returns = ReturnCollector {
            collector: self,
            element_tag,
        };
        body.visit_with(&mut returns);
    }
}

/// The class name a deferred value resolves to is what its body returns.
/// A nested function returns to its own caller, so its returns are not it.
struct ReturnCollector<'a, 'b> {
    collector: &'a mut ClassNameCollector<'b>,
    element_tag: &'a Option<String>,
}

impl Visit for ReturnCollector<'_, '_> {
    fn visit_function(&mut self, _: &Function) {}

    fn visit_arrow_expr(&mut self, _: &ArrowExpr) {}

    fn visit_return_stmt(&mut self, statement: &ReturnStmt) {
        if let Some(argument) = statement.arg.as_deref() {
            self.collector.collect_expr(self.element_tag, argument);
        }
    }
}

impl Visit for ClassNameCollector<'_> {
    fn visit_jsx_element(&mut self, element: &JSXElement) {
        if let Some(element_tag) = lowered_element_tag(&element.opening.name) {
            for attr in &element.opening.attrs {
                let JSXAttrOrSpread::JSXAttr(attr) = attr else {
                    continue;
                };

                if !is_class_name_attr(&attr.name) {
                    continue;
                }

                match &attr.value {
                    Some(JSXAttrValue::Str(value)) => {
                        self.push_literal(&element_tag, value.span);
                    }
                    Some(JSXAttrValue::JSXExprContainer(container)) => {
                        if let JSXExpr::Expr(expr) = &container.expr {
                            self.collect_expr(&element_tag, expr);
                        }
                    }
                    _ => {}
                }
            }
        }

        element.visit_children_with(self);
    }
}

/// With rem scaling active an emitted offset is only what renders at
/// `baseResolution`, so descriptions lead with the rem value instead.
pub(crate) fn rem_offset_label(
    config: &crate::config::model::TailwindConfig,
    offset_px: f64,
) -> Option<String> {
    let rem = &config.theme.rem;
    if rem.is_static() || rem.base <= 0.0 || offset_px == 0.0 || !offset_px.is_finite() {
        return None;
    }

    let rems = (offset_px / rem.base * 1e4).round() / 1e4;
    Some(format!(
        "`{}rem` ({}px at the base viewport)",
        crate::semantic::utility::format_number(rems),
        crate::semantic::utility::format_number(offset_px)
    ))
}

pub(crate) fn offset_value_text(
    config: &crate::config::model::TailwindConfig,
    offset: &str,
) -> String {
    offset
        .parse::<f64>()
        .ok()
        .and_then(|px| rem_offset_label(config, px))
        .unwrap_or_else(|| format!("`{offset}`"))
}

pub(crate) fn px_length_text(
    config: &crate::config::model::TailwindConfig,
    length: &str,
) -> String {
    length
        .parse::<f64>()
        .ok()
        .and_then(|px| rem_offset_label(config, px))
        .unwrap_or_else(|| format!("{length}px"))
}

pub(crate) fn class_name_context_at_position(
    source: &str,
    position: u32,
) -> Option<ClassNameContext> {
    collect_class_name_contexts(source)
        .into_iter()
        .find(|context| {
            position >= context.value_range.start && position <= context.value_range.end
        })
}

pub(crate) fn collect_class_tokens(source: &str) -> Vec<ClassToken> {
    collect_class_name_contexts(source)
        .into_iter()
        .flat_map(|context| {
            tokenize_class_name_with_ranges(&context.value, context.value_range.start)
        })
        .collect()
}

pub(crate) fn collect_class_name_contexts(source: &str) -> Vec<ClassNameContext> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(
        FileName::Custom("input.tsx".into()).into(),
        source.to_owned(),
    );
    // Recovered errors are kept: a half-typed file elsewhere in the module must
    // not blank out the editor features for the JSX that does parse.
    let mut recovered_errors = Vec::new();
    let Ok(module) = parse_file_as_module(
        &fm,
        Syntax::Typescript(TsSyntax {
            decorators: true,
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    ) else {
        return lexical_class_name_contexts(source);
    };

    let mut collector = ClassNameCollector {
        source,
        source_base: fm.start_pos.0,
        bom: bom_len(source),
        contexts: Vec::new(),
    };
    module.visit_with(&mut collector);
    collector.contexts
}

/// Last-resort scan for when the file does not parse at all. It cannot tell a
/// host element from a component reliably, so it reports every `className`
/// value it finds and leaves the tag to the caller's best effort.
fn lexical_class_name_contexts(source: &str) -> Vec<ClassNameContext> {
    const ATTR: &str = "className";
    let bytes = source.as_bytes();
    let mut contexts = Vec::new();
    let mut cursor = 0;

    while let Some(found) = source[cursor..].find(ATTR) {
        let start = cursor + found;
        cursor = start + ATTR.len();

        let preceded_by_ident = start
            .checked_sub(1)
            .is_some_and(|index| is_ident_byte(bytes[index]));
        if preceded_by_ident {
            continue;
        }

        let mut index = skip_spaces(bytes, cursor);
        if bytes.get(index) != Some(&b'=') {
            continue;
        }
        index = skip_spaces(bytes, index + 1);

        let element_tag = lexical_element_tag(source, start);
        match bytes.get(index) {
            Some(b'`') => {
                cursor = push_template_contexts(&mut contexts, source, &element_tag, index);
            }
            Some(&quote @ (b'"' | b'\'')) => {
                let (content, next) = quoted_content(source, index, quote);
                push_lexical_context(&mut contexts, source, &element_tag, content);
                cursor = next;
            }
            Some(b'{') => {
                let mut depth = 0usize;
                while index < bytes.len() {
                    match bytes[index] {
                        b'{' => depth += 1,
                        b'}' => {
                            depth -= 1;
                            if depth == 0 {
                                index += 1;
                                break;
                            }
                        }
                        b'`' => {
                            index =
                                push_template_contexts(&mut contexts, source, &element_tag, index);
                            continue;
                        }
                        quote @ (b'"' | b'\'') => {
                            let (content, next) = quoted_content(source, index, quote);
                            push_lexical_context(&mut contexts, source, &element_tag, content);
                            index = next;
                            continue;
                        }
                        _ => {}
                    }
                    index += 1;
                }
                cursor = index;
            }
            _ => {}
        }
    }

    contexts
}

fn push_lexical_context(
    contexts: &mut Vec<ClassNameContext>,
    source: &str,
    element_tag: &Option<String>,
    content: (usize, usize),
) {
    push_lexical_quasi(contexts, source, element_tag, content, (false, false));
}

fn push_lexical_quasi(
    contexts: &mut Vec<ClassNameContext>,
    source: &str,
    element_tag: &Option<String>,
    content: (usize, usize),
    edges: (bool, bool),
) {
    let (start, end) = content;
    if source.get(start..end).is_none() {
        return;
    }

    contexts.push(ClassNameContext {
        element_tag: element_tag.clone(),
        value: source[start..end].to_owned(),
        value_range: EditorRange {
            start: byte_to_utf16_position(source, start),
            end: byte_to_utf16_position(source, end),
        },
        open_start: edges.0,
        open_end: edges.1,
    });
}

/// The template opened at `open`, as one context per quasi, plus the index just
/// past its closing backtick. An interpolation is not class text: reading one as
/// class text is what would report `${flag}` as an unknown utility.
fn push_template_contexts(
    contexts: &mut Vec<ClassNameContext>,
    source: &str,
    element_tag: &Option<String>,
    open: usize,
) -> usize {
    let bytes = source.as_bytes();
    let mut quasi_start = open + 1;
    let mut index = quasi_start;
    let mut open_start = false;

    while index < bytes.len() {
        match bytes[index] {
            b'\\' => index += 1,
            b'\n' => break,
            b'`' => {
                let content = (quasi_start, index);
                push_lexical_quasi(contexts, source, element_tag, content, (open_start, false));
                return index + 1;
            }
            b'$' if bytes.get(index + 1) == Some(&b'{') => {
                let content = (quasi_start, index);
                push_lexical_quasi(contexts, source, element_tag, content, (open_start, true));
                index = push_interpolation_contexts(contexts, source, element_tag, index + 1);
                quasi_start = index;
                open_start = true;
                continue;
            }
            _ => {}
        }
        index += 1;
    }

    let end = index.min(bytes.len());
    let content = (quasi_start.min(end), end);
    push_lexical_quasi(contexts, source, element_tag, content, (open_start, false));
    end
}

/// Walks `${ ... }` from its opening brace, keeping the strings written inside
/// it: a class value chosen there is still one the editor answers for.
fn push_interpolation_contexts(
    contexts: &mut Vec<ClassNameContext>,
    source: &str,
    element_tag: &Option<String>,
    open: usize,
) -> usize {
    let bytes = source.as_bytes();
    let mut depth = 0usize;
    let mut index = open;

    while index < bytes.len() {
        match bytes[index] {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return index + 1;
                }
            }
            b'\n' => return index,
            b'`' => {
                index = push_template_contexts(contexts, source, element_tag, index);
                continue;
            }
            quote @ (b'"' | b'\'') => {
                let (content, next) = quoted_content(source, index, quote);
                push_lexical_context(contexts, source, element_tag, content);
                index = next;
                continue;
            }
            _ => {}
        }
        index += 1;
    }

    index
}

/// Content byte range of the string opened at `open`, plus the index just past
/// it. An unterminated string ends at the newline so mid-edit values still work.
fn quoted_content(source: &str, open: usize, quote: u8) -> ((usize, usize), usize) {
    let bytes = source.as_bytes();
    let start = open + 1;
    let mut index = start;

    while index < bytes.len() {
        match bytes[index] {
            b'\\' => index += 1,
            b'\n' => return ((start, index), index),
            byte if byte == quote => return ((start, index), index + 1),
            _ => {}
        }
        index += 1;
    }

    ((start, bytes.len()), bytes.len())
}

fn lexical_element_tag(source: &str, attr_start: usize) -> Option<String> {
    let bytes = source.as_bytes();
    let open = source[..attr_start].rfind('<')?;
    let name_start = open + 1;
    let name_end = bytes[name_start..]
        .iter()
        .position(|byte| !is_ident_byte(*byte))
        .map_or(bytes.len(), |offset| name_start + offset);

    // Anything else is a component, whose host element is only known at runtime.
    source
        .get(name_start..name_end)
        .filter(|name| is_supported_host_tag(name))
        .map(str::to_owned)
}

fn is_ident_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

fn skip_spaces(bytes: &[u8], mut index: usize) -> usize {
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    index
}

fn bom_len(source: &str) -> usize {
    if source.starts_with('\u{feff}') {
        '\u{feff}'.len_utf8()
    } else {
        0
    }
}

pub(crate) fn span_range(span: swc_core::common::Span, source_base: u32) -> (usize, usize) {
    let start = span.lo.0.saturating_sub(source_base) as usize;
    let end = span.hi.0.saturating_sub(source_base) as usize;
    (start, end)
}

/// Byte range of a quoted literal's contents, excluding the quotes.
pub(crate) fn literal_content_bytes(source: &str, lo: usize, hi: usize) -> (usize, usize) {
    let hi = hi.min(source.len());
    let lo = lo.min(hi);
    let snippet = &source[lo..hi];
    let quote = snippet
        .char_indices()
        .find(|(_, ch)| matches!(ch, '"' | '\''));

    let Some((quote_index, quote_char)) = quote else {
        return (lo, hi);
    };

    let content_start = lo + quote_index + quote_char.len_utf8();
    let content_end = snippet
        .char_indices()
        .rev()
        .find(|(_, ch)| *ch == quote_char)
        .map(|(index, _)| lo + index)
        .filter(|end| *end >= content_start)
        .unwrap_or(hi);

    (content_start, content_end)
}

pub(crate) fn byte_to_utf16_position(source: &str, byte_index: usize) -> u32 {
    source
        .get(..byte_index.min(source.len()))
        .unwrap_or_default()
        .encode_utf16()
        .count() as u32
}

pub(crate) fn token_at_position(tokens: &[ClassToken], position: u32) -> Option<ClassToken> {
    tokens
        .iter()
        .find(|token| position >= token.range.start && position <= token.range.end)
        .cloned()
}
