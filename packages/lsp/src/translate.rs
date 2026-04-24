use std::path::PathBuf;

use tower_lsp::lsp_types::{Position, Range, Url};

#[cfg(test)]
use vela_rbxts_compiler::{
    CompletionRequest, EditorOptions, EditorRange, HoverRequest, get_completions, get_hover,
};

#[derive(Clone, Debug)]
pub struct Utf16Index {
    line_starts_utf16: Vec<u32>,
    text_len_utf16: u32,
}

impl Utf16Index {
    pub fn new(source: &str) -> Self {
        let mut line_starts_utf16 = vec![0];
        let mut text_len_utf16 = 0u32;
        let bytes = source.as_bytes();
        let mut byte_index = 0usize;

        while byte_index < source.len() {
            let ch = source[byte_index..].chars().next().expect("valid UTF-8");
            match ch {
                '\r' => {
                    byte_index += 1;
                    if bytes.get(byte_index) == Some(&b'\n') {
                        text_len_utf16 += 2;
                        byte_index += 1;
                    } else {
                        text_len_utf16 += 1;
                    }
                    line_starts_utf16.push(text_len_utf16);
                }
                '\n' => {
                    byte_index += 1;
                    text_len_utf16 += 1;
                    line_starts_utf16.push(text_len_utf16);
                }
                _ => {
                    text_len_utf16 += ch.len_utf16() as u32;
                    byte_index += ch.len_utf8();
                }
            }
        }

        Self {
            line_starts_utf16,
            text_len_utf16,
        }
    }

    pub fn position_to_offset(&self, position: Position) -> Option<u32> {
        let line_index = usize::try_from(position.line).ok()?;
        let start = *self.line_starts_utf16.get(line_index)?;
        let end = self
            .line_starts_utf16
            .get(line_index + 1)
            .copied()
            .unwrap_or(self.text_len_utf16);
        let line_len = end.saturating_sub(start);
        if position.character > line_len {
            return None;
        }

        Some(start + position.character)
    }

    pub fn offset_to_position(&self, offset: u32) -> Option<Position> {
        if offset > self.text_len_utf16 {
            return None;
        }

        let line_index = self
            .line_starts_utf16
            .partition_point(|start| *start <= offset)
            .saturating_sub(1);
        let line_start = *self.line_starts_utf16.get(line_index)?;

        Some(Position::new(line_index as u32, offset - line_start))
    }

    pub fn range_to_lsp_range(&self, start: u32, end: u32) -> Option<Range> {
        Some(Range::new(
            self.offset_to_position(start)?,
            self.offset_to_position(end)?,
        ))
    }
}

pub fn file_uri_to_path(uri: &Url) -> Option<PathBuf> {
    uri.to_file_path().ok()
}

#[cfg(test)]
pub fn editor_range_to_lsp_range(index: &Utf16Index, range: &EditorRange) -> Option<Range> {
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
            Some(token_start)
        );
        assert_eq!(
            index.offset_to_position(token_start),
            Some(Position::new(0, token_start))
        );
        assert_eq!(
            index.range_to_lsp_range(token_start, token_end),
            Some(Range::new(
                Position::new(0, token_start),
                Position::new(0, token_end)
            ))
        );
        assert_eq!(
            index.position_to_offset(Position::new(0, trailing_start)),
            Some(trailing_start)
        );
        assert_eq!(
            index.offset_to_position(trailing_end),
            Some(Position::new(0, trailing_end))
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
            Some(token_start)
        );
        assert_eq!(
            index.offset_to_position(token_start),
            Some(Position::new(1, line_token_start))
        );
        assert_eq!(
            index.position_to_offset(Position::new(1, line_trailing_start)),
            Some(trailing_start)
        );
        assert_eq!(
            index.offset_to_position(trailing_end),
            Some(Position::new(1, line_trailing_start + utf16_len("bg-")))
        );
        assert_eq!(
            index.range_to_lsp_range(token_start, token_end),
            Some(Range::new(
                Position::new(1, line_token_start),
                Position::new(1, line_token_start + utf16_len("bg-slate-700"))
            ))
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
            Some(token_start)
        );
        assert_eq!(
            index.offset_to_position(token_start),
            Some(Position::new(1, line_token_start))
        );
        assert_eq!(
            index.position_to_offset(Position::new(1, line_trailing_start)),
            Some(trailing_start)
        );
        assert_eq!(
            index.offset_to_position(trailing_end),
            Some(Position::new(1, line_trailing_start + utf16_len("bg-")))
        );
        assert_eq!(
            index.range_to_lsp_range(token_start, token_end),
            Some(Range::new(
                Position::new(1, line_token_start),
                Position::new(1, line_token_start + utf16_len("bg-slate-700"))
            ))
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
            Some(Range::new(
                Position::new(1, line_start),
                Position::new(1, line_start + utf16_len("bg-slate-700"))
            ))
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
        });

        let hover_offset = index
            .position_to_offset(Position::new(1, hover_column))
            .unwrap();
        let hover = get_hover(HoverRequest {
            source: source.to_owned(),
            position: hover_offset,
            options: options.clone(),
        });
        let hover_contents = hover.contents.expect("expected hover contents");
        assert!(hover_contents.display.contains("BackgroundColor3"));
        assert!(!hover_contents.display.contains("UICorner.CornerRadius"));

        let completion_offset = index
            .position_to_offset(Position::new(1, completion_column))
            .unwrap();
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
    fn resolves_file_uris_to_paths() {
        let uri = Url::parse("file:///Users/returnf4lse/My%20Project/src/App.tsx").unwrap();
        let path = file_uri_to_path(&uri).unwrap();

        assert!(path.ends_with("My Project/src/App.tsx"));
    }
}
