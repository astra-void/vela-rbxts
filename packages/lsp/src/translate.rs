use std::path::PathBuf;

use tower_lsp::lsp_types::{Position, Range, Url};

#[cfg(test)]
use vela_rbxts_compiler::EditorRange;

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
                        byte_index += 1;
                    }
                    line_starts_utf16.push(text_len_utf16);
                }
                '\n' => {
                    byte_index += 1;
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

    #[test]
    fn translates_utf16_positions_roundtrip() {
        let source = "a🙂\r\nclassName=\"bg-\"";
        let index = Utf16Index::new(source);

        assert_eq!(index.position_to_offset(Position::new(0, 3)), Some(3));
        assert_eq!(index.offset_to_position(3), Some(Position::new(1, 0)));
        assert_eq!(index.position_to_offset(Position::new(1, 10)), Some(13));
        assert_eq!(index.offset_to_position(13), Some(Position::new(1, 10)));
    }

    #[test]
    fn converts_editor_ranges_to_lsp_ranges() {
        let source = "a🙂\nclassName=\"bg-\"";
        let index = Utf16Index::new(source);
        let range = EditorRange { start: 1, end: 4 };

        assert_eq!(
            editor_range_to_lsp_range(&index, &range),
            Some(Range::new(Position::new(0, 1), Position::new(1, 1)))
        );
    }

    #[test]
    fn resolves_file_uris_to_paths() {
        let uri = Url::parse("file:///Users/returnf4lse/My%20Project/src/App.tsx").unwrap();
        let path = file_uri_to_path(&uri).unwrap();

        assert!(path.ends_with("My Project/src/App.tsx"));
    }
}
