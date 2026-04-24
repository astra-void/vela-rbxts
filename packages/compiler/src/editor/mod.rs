pub(crate) mod completions;
pub(crate) mod colors;
pub(crate) mod diagnostics;
pub(crate) mod hover;

use crate::api::{EditorOptions, EditorRange};
use crate::transform::module::{is_class_name_attr, is_supported_host_element};
use swc_core::{
    common::{FileName, SourceMap, sync::Lrc},
    ecma::{
        ast::{JSXAttrOrSpread, JSXAttrValue, JSXElement, JSXElementName},
        parser::{Syntax, TsSyntax, parse_file_as_module},
        visit::{Visit, VisitWith},
    },
};

#[derive(Clone)]
pub(crate) struct ClassNameContext {
    pub(crate) element_tag: String,
    pub(crate) value: String,
    pub(crate) value_range: EditorRange,
}

#[derive(Clone)]
pub(crate) struct ClassToken {
    pub(crate) text: String,
    pub(crate) range: EditorRange,
}

pub(crate) struct ClassNameCollector<'a> {
    source: &'a str,
    source_base: u32,
    contexts: Vec<ClassNameContext>,
}

impl Visit for ClassNameCollector<'_> {
    fn visit_jsx_element(&mut self, element: &JSXElement) {
        if let JSXElementName::Ident(ident) = &element.opening.name {
            let element_tag = ident.sym.to_string();
            if is_supported_host_element(&element.opening.name) {
                for attr in &element.opening.attrs {
                    let JSXAttrOrSpread::JSXAttr(attr) = attr else {
                        continue;
                    };

                    if !is_class_name_attr(&attr.name) {
                        continue;
                    }

                    let Some(JSXAttrValue::Str(value)) = &attr.value else {
                        continue;
                    };

                    let (lo, hi) = span_range(value.span, self.source_base);
                    let value_range = literal_content_range(self.source, lo, hi);
                    self.contexts.push(ClassNameContext {
                        element_tag: element_tag.clone(),
                        value: value.value.to_string_lossy().into_owned(),
                        value_range,
                    });
                }
            }
        }

        element.visit_children_with(self);
    }
}

pub(crate) fn parse_editor_config(
    options: Option<&EditorOptions>,
) -> crate::config::model::TailwindConfig {
    crate::config::resolve::parse_editor_config(options)
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

pub(crate) fn collect_class_name_contexts(source: &str) -> Vec<ClassNameContext> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(
        FileName::Custom("input.tsx".into()).into(),
        source.to_owned(),
    );
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
        return Vec::new();
    };

    if !recovered_errors.is_empty() {
        return Vec::new();
    }

    let mut collector = ClassNameCollector {
        source,
        source_base: fm.start_pos.0,
        contexts: Vec::new(),
    };
    module.visit_with(&mut collector);
    collector.contexts
}

pub(crate) fn span_range(span: swc_core::common::Span, source_base: u32) -> (usize, usize) {
    let start = span.lo.0.saturating_sub(source_base) as usize;
    let end = span.hi.0.saturating_sub(source_base) as usize;
    (start, end)
}

pub(crate) fn literal_content_range(source: &str, lo: usize, hi: usize) -> EditorRange {
    let hi = hi.min(source.len());
    let lo = lo.min(hi);
    let snippet = &source[lo..hi];
    let quote = snippet
        .char_indices()
        .find(|(_, ch)| matches!(ch, '"' | '\''));

    if let Some((quote_index, quote_char)) = quote {
        let content_start = lo + quote_index + quote_char.len_utf8();
        let content_end = snippet
            .char_indices()
            .rev()
            .find(|(_, ch)| *ch == quote_char)
            .map(|(index, _)| lo + index)
            .filter(|end| *end >= content_start)
            .unwrap_or(hi);

        return EditorRange {
            start: byte_to_utf16_position(source, content_start),
            end: byte_to_utf16_position(source, content_end),
        };
    }

    EditorRange {
        start: byte_to_utf16_position(source, lo),
        end: byte_to_utf16_position(source, hi),
    }
}

pub(crate) fn byte_to_utf16_position(source: &str, byte_index: usize) -> u32 {
    source
        .get(..byte_index.min(source.len()))
        .unwrap_or_default()
        .encode_utf16()
        .count() as u32
}

pub(crate) fn utf16_len(value: &str) -> u32 {
    value.encode_utf16().count() as u32
}

pub(crate) fn tokenize_class_name_with_ranges(input: &str, source_offset: u32) -> Vec<ClassToken> {
    let mut tokens = Vec::new();
    let mut token_start: Option<usize> = None;

    for (index, ch) in input.char_indices() {
        if ch.is_whitespace() {
            if let Some(start) = token_start.take() {
                tokens.push(ClassToken {
                    text: input[start..index].to_owned(),
                    range: EditorRange {
                        start: source_offset + utf16_len(&input[..start]),
                        end: source_offset + utf16_len(&input[..index]),
                    },
                });
            }
            continue;
        }

        if token_start.is_none() {
            token_start = Some(index);
        }
    }

    if let Some(start) = token_start {
        tokens.push(ClassToken {
            text: input[start..].to_owned(),
            range: EditorRange {
                start: source_offset + utf16_len(&input[..start]),
                end: source_offset + utf16_len(input),
            },
        });
    }

    tokens
}

pub(crate) fn current_token_replacement(tokens: &[ClassToken], position: u32) -> EditorRange {
    tokens
        .iter()
        .find(|token| position >= token.range.start && position <= token.range.end)
        .map(|token| token.range.clone())
        .unwrap_or(EditorRange {
            start: position,
            end: position,
        })
}

pub(crate) fn current_prefix(
    tokens: &[ClassToken],
    replacement: &EditorRange,
    position: u32,
) -> String {
    let Some(token) = tokens
        .iter()
        .find(|token| token.range.start == replacement.start && token.range.end == replacement.end)
    else {
        return String::new();
    };

    let wanted_len = position.saturating_sub(token.range.start);
    let mut current_len = 0;
    let mut end_index = 0;
    for (index, ch) in token.text.char_indices() {
        let next_len = current_len + ch.len_utf16() as u32;
        if next_len > wanted_len {
            break;
        }
        current_len = next_len;
        end_index = index + ch.len_utf8();
    }

    token.text[..end_index].trim_start().to_owned()
}

pub(crate) fn token_at_position(tokens: &[ClassToken], position: u32) -> Option<ClassToken> {
    tokens
        .iter()
        .find(|token| position >= token.range.start && position <= token.range.end)
        .cloned()
}
