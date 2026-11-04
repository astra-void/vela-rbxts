use std::borrow::Cow;
use std::path::PathBuf;

use tower_lsp_server::ls_types::{Position, Range, Uri};

#[cfg(test)]
use vela_rbxts_compiler::{
    CompletionRequest, DocumentColorsRequest, EditorOptions, EditorRange, HoverRequest,
    get_completions, get_document_colors, get_hover,
};

#[derive(Clone, Debug)]
struct LineSpan {
    start_utf16: u32,
    start_byte: usize,
    /// Line end before its terminator (`\n`, `\r\n`, or `\r`).
    content_end_utf16: u32,
    content_end_byte: usize,
}

/// Maps between LSP UTF-16 positions, compiler UTF-16 offsets, and byte offsets.
/// Out-of-range positions clamp to the nearest valid location, matching the LSP
/// spec's "defaults back to the line length" behavior.
#[derive(Clone, Debug)]
pub struct Utf16Index {
    lines: Vec<LineSpan>,
    text_len_utf16: u32,
    text_len_bytes: usize,
}

impl Utf16Index {
    pub fn new(source: &str) -> Self {
        let mut lines = Vec::new();
        let mut start_utf16 = 0u32;
        let mut start_byte = 0usize;
        let mut utf16 = 0u32;
        let mut byte = 0usize;
        let bytes = source.as_bytes();

        while byte < source.len() {
            let ch = source[byte..].chars().next().expect("valid UTF-8");
            match ch {
                '\r' | '\n' => {
                    let content_end_utf16 = utf16;
                    let content_end_byte = byte;
                    utf16 += 1;
                    byte += 1;
                    if ch == '\r' && bytes.get(byte) == Some(&b'\n') {
                        utf16 += 1;
                        byte += 1;
                    }
                    lines.push(LineSpan {
                        start_utf16,
                        start_byte,
                        content_end_utf16,
                        content_end_byte,
                    });
                    start_utf16 = utf16;
                    start_byte = byte;
                }
                _ => {
                    utf16 += ch.len_utf16() as u32;
                    byte += ch.len_utf8();
                }
            }
        }

        lines.push(LineSpan {
            start_utf16,
            start_byte,
            content_end_utf16: utf16,
            content_end_byte: byte,
        });

        Self {
            lines,
            text_len_utf16: utf16,
            text_len_bytes: byte,
        }
    }

    fn line(&self, line: u32) -> Option<&LineSpan> {
        usize::try_from(line)
            .ok()
            .and_then(|index| self.lines.get(index))
    }

    pub fn position_to_offset(&self, position: Position) -> u32 {
        let Some(line) = self.line(position.line) else {
            return self.text_len_utf16;
        };

        line.start_utf16
            .saturating_add(position.character)
            .min(line.content_end_utf16)
    }

    pub fn position_to_byte(&self, source: &str, position: Position) -> usize {
        let Some(line) = self.line(position.line) else {
            return self.text_len_bytes;
        };

        let mut remaining = position.character;
        let mut byte = line.start_byte;
        for ch in source[line.start_byte..line.content_end_byte].chars() {
            let units = ch.len_utf16() as u32;
            if remaining < units {
                break;
            }
            remaining -= units;
            byte += ch.len_utf8();
        }

        byte
    }

    pub fn offset_to_position(&self, offset: u32) -> Position {
        let offset = offset.min(self.text_len_utf16);
        let line_index = self
            .lines
            .partition_point(|line| line.start_utf16 <= offset)
            .saturating_sub(1);
        let line = &self.lines[line_index];
        let clamped = offset.min(line.content_end_utf16);

        Position::new(line_index as u32, clamped - line.start_utf16)
    }

    pub fn range_to_lsp_range(&self, start: u32, end: u32) -> Range {
        Range::new(self.offset_to_position(start), self.offset_to_position(end))
    }
}

pub fn file_uri_to_path(uri: &Uri) -> Option<PathBuf> {
    if !uri.scheme().as_str().eq_ignore_ascii_case("file") {
        return None;
    }
    uri.to_file_path().map(Cow::into_owned)
}

#[cfg(test)]
pub fn editor_range_to_lsp_range(index: &Utf16Index, range: &EditorRange) -> Range {
    index.range_to_lsp_range(range.start, range.end)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16_len(value: &str) -> u32 {
        value.encode_utf16().count() as u32
    }

    #[test]
    fn translates_single_line_positions_roundtrip() {
        let source = r#"className="rounded-md bg-slate-700 px-4 py-3 w-80 h-27 gap-4 bg-""#;
        let index = Utf16Index::new(source);

        let token_start = source.find("bg-slate-700").unwrap() as u32;
        let token_end = token_start + utf16_len("bg-slate-700");
        let trailing_start = source.rfind("bg-").unwrap() as u32;
        let trailing_end = trailing_start + utf16_len("bg-");

        assert_eq!(
            index.position_to_offset(Position::new(0, token_start)),
            token_start
        );
        assert_eq!(
            index.offset_to_position(token_start),
            Position::new(0, token_start)
        );
        assert_eq!(
            index.range_to_lsp_range(token_start, token_end),
            Range::new(Position::new(0, token_start), Position::new(0, token_end))
        );
        assert_eq!(
            index.position_to_offset(Position::new(0, trailing_start)),
            trailing_start
        );
        assert_eq!(
            index.offset_to_position(trailing_end),
            Position::new(0, trailing_end)
        );
    }

    #[test]
    fn translates_multiline_lf_positions_roundtrip() {
        let source = "export const App = () => (\n  <frame className=\"rounded-md bg-slate-700 px-4 py-3 w-80 h-27 gap-4 bg-\" />\n);";
        let index = Utf16Index::new(source);

        let token_start = source.find("bg-slate-700").unwrap() as u32;
        let token_end = token_start + utf16_len("bg-slate-700");
        let trailing_start = source.rfind("bg-").unwrap() as u32;
        let trailing_end = trailing_start + utf16_len("bg-");
        let line = source.lines().nth(1).unwrap();
        let line_token_start = line.find("bg-slate-700").unwrap() as u32;
        let line_trailing_start = line.rfind("bg-").unwrap() as u32;

        assert_eq!(
            index.position_to_offset(Position::new(1, line_token_start)),
            token_start
        );
        assert_eq!(
            index.offset_to_position(token_start),
            Position::new(1, line_token_start)
        );
        assert_eq!(
            index.position_to_offset(Position::new(1, line_trailing_start)),
            trailing_start
        );
        assert_eq!(
            index.offset_to_position(trailing_end),
            Position::new(1, line_trailing_start + utf16_len("bg-"))
        );
        assert_eq!(
            index.range_to_lsp_range(token_start, token_end),
            Range::new(
                Position::new(1, line_token_start),
                Position::new(1, line_token_start + utf16_len("bg-slate-700"))
            )
        );
    }

    #[test]
    fn translates_multiline_crlf_positions_roundtrip() {
        let source = "export const App = () => (\r\n  <frame className=\"rounded-md bg-slate-700 px-4 py-3 w-80 h-27 gap-4 bg-\" />\r\n);";
        let index = Utf16Index::new(source);

        let token_start = source.find("bg-slate-700").unwrap() as u32;
        let token_end = token_start + utf16_len("bg-slate-700");
        let trailing_start = source.rfind("bg-").unwrap() as u32;
        let trailing_end = trailing_start + utf16_len("bg-");
        let line = source.lines().nth(1).unwrap();
        let line_token_start = line.find("bg-slate-700").unwrap() as u32;
        let line_trailing_start = line.rfind("bg-").unwrap() as u32;

        assert_eq!(
            index.position_to_offset(Position::new(1, line_token_start)),
            token_start
        );
        assert_eq!(
            index.offset_to_position(token_start),
            Position::new(1, line_token_start)
        );
        assert_eq!(
            index.position_to_offset(Position::new(1, line_trailing_start)),
            trailing_start
        );
        assert_eq!(
            index.offset_to_position(trailing_end),
            Position::new(1, line_trailing_start + utf16_len("bg-"))
        );
        assert_eq!(
            index.range_to_lsp_range(token_start, token_end),
            Range::new(
                Position::new(1, line_token_start),
                Position::new(1, line_token_start + utf16_len("bg-slate-700"))
            )
        );
    }

    #[test]
    fn clamps_out_of_range_positions() {
        let source = "abc\r\ndef";
        let index = Utf16Index::new(source);

        // Character beyond the line content clamps to the line end, before the terminator.
        assert_eq!(index.position_to_offset(Position::new(0, 99)), 3);
        // Line beyond the document clamps to the document end.
        assert_eq!(index.position_to_offset(Position::new(9, 0)), 8);
        // Offset beyond the document clamps to the last position.
        assert_eq!(index.offset_to_position(99), Position::new(1, 3));
        // Offset inside a `\r\n` terminator clamps to the line content end.
        assert_eq!(index.offset_to_position(4), Position::new(0, 3));
    }

    #[test]
    fn maps_positions_to_byte_offsets() {
        let source = "let a = \"🙂x\";\nlet b = 1;";
        let index = Utf16Index::new(source);
        let emoji_byte = source.find('🙂').unwrap();

        assert_eq!(
            index.position_to_byte(source, Position::new(0, 9)),
            emoji_byte
        );
        // The emoji is one UTF-16 surrogate pair (2 units) and four bytes.
        assert_eq!(
            index.position_to_byte(source, Position::new(0, 11)),
            emoji_byte + '🙂'.len_utf8()
        );
        // A position splitting the surrogate pair clamps to the character start.
        assert_eq!(
            index.position_to_byte(source, Position::new(0, 10)),
            emoji_byte
        );
        assert_eq!(
            index.position_to_byte(source, Position::new(1, 0)),
            source.find("let b").unwrap()
        );
        assert_eq!(
            index.position_to_byte(source, Position::new(0, 99)),
            source.find('\n').unwrap()
        );
        assert_eq!(
            index.position_to_byte(source, Position::new(9, 0)),
            source.len()
        );
    }

    #[test]
    fn converts_editor_ranges_to_lsp_ranges() {
        let source = "export const App = () => (\n  <frame className=\"rounded-md bg-slate-700 px-4 py-3 w-80 h-27 gap-4 bg-\" />\n);";
        let index = Utf16Index::new(source);
        let start = source.find("bg-slate-700").unwrap() as u32;
        let line = source.lines().nth(1).unwrap();
        let line_start = line.find("bg-slate-700").unwrap() as u32;
        let range = EditorRange {
            start,
            end: start + utf16_len("bg-slate-700"),
        };

        assert_eq!(
            editor_range_to_lsp_range(&index, &range),
            Range::new(
                Position::new(1, line_start),
                Position::new(1, line_start + utf16_len("bg-slate-700"))
            )
        );
    }

    #[test]
    fn maps_multiline_positions_to_compiler_hover_and_completion() {
        let source = "export const App = () => (\n  <frame className=\"rounded-md bg-slate-700 px-4 py-3 w-80 h-27 gap-4 bg-\" />\n);";
        let index = Utf16Index::new(source);
        let line = source.lines().nth(1).unwrap();
        let hover_column = line.find("bg-slate-700").unwrap() as u32 + 2;
        let completion_column = line.rfind("bg-").unwrap() as u32 + 3;
        let options = Some(EditorOptions {
            config_json: None,
            file_name: Some("App.tsx".to_owned()),
            project_root: None,
            class_functions: None,
        });

        let hover_offset = index.position_to_offset(Position::new(1, hover_column));
        let hover = get_hover(HoverRequest {
            source: source.to_owned(),
            position: hover_offset,
            options: options.clone(),
        });
        let hover_contents = hover.contents.expect("expected hover contents");
        assert!(hover_contents.display.contains("BackgroundColor3"));
        assert!(!hover_contents.display.contains("UICorner.CornerRadius"));

        let completion_offset = index.position_to_offset(Position::new(1, completion_column));
        let completion = get_completions(CompletionRequest {
            source: source.to_owned(),
            position: completion_offset,
            options,
        });
        assert!(completion.is_in_class_name_context);
        assert!(
            completion
                .items
                .iter()
                .any(|item| item.label == "bg-slate-500"),
            "expected background color completions, got {:?}",
            completion
                .items
                .iter()
                .map(|item| item.label.as_str())
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn maps_multiline_positions_to_compiler_colors() {
        let source = "export const App = () => (<>\n  <frame className=\"rounded-md md:bg-slate-700 px-4 py-3\" />\n  <textlabel className=\"text-blue-500\" />\n</>);";
        let index = Utf16Index::new(source);
        let line_one = source.lines().nth(1).unwrap();
        let line_two = source.lines().nth(2).unwrap();
        let options = Some(EditorOptions {
            config_json: None,
            file_name: Some("App.tsx".to_owned()),
            project_root: None,
            class_functions: None,
        });

        let response = get_document_colors(DocumentColorsRequest {
            source: source.to_owned(),
            options,
        });

        let variant_color = response
            .colors
            .iter()
            .find(|color| color.token == "md:bg-slate-700")
            .expect("expected md:bg-slate-700 color");
        let text_color = response
            .colors
            .iter()
            .find(|color| color.token == "text-blue-500")
            .expect("expected text-blue-500 color");

        assert_eq!(
            editor_range_to_lsp_range(&index, &variant_color.range),
            Range::new(
                Position::new(1, line_one.find("md:bg-slate-700").unwrap() as u32),
                Position::new(
                    1,
                    line_one.find("md:bg-slate-700").unwrap() as u32
                        + "md:bg-slate-700".encode_utf16().count() as u32,
                ),
            )
        );
        assert_eq!(
            editor_range_to_lsp_range(&index, &text_color.range),
            Range::new(
                Position::new(2, line_two.find("text-blue-500").unwrap() as u32),
                Position::new(
                    2,
                    line_two.find("text-blue-500").unwrap() as u32
                        + "text-blue-500".encode_utf16().count() as u32,
                ),
            )
        );
    }

    #[test]
    fn resolves_file_uris_to_paths() {
        let uri = "file:///Users/returnf4lse/My%20Project/src/App.tsx"
            .parse::<Uri>()
            .unwrap();
        let path = file_uri_to_path(&uri).unwrap();

        assert!(path.ends_with("My Project/src/App.tsx"));
    }

    #[test]
    fn leaves_unsaved_documents_without_a_path() {
        let uri = "untitled:Untitled-1".parse::<Uri>().unwrap();

        assert_eq!(file_uri_to_path(&uri), None);
    }
}
