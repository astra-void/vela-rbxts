use std::path::{Path, PathBuf};

use tower_lsp_server::ls_types::{Position, Range, TextDocumentContentChangeEvent, Uri};

use crate::translate::{Utf16Index, file_uri_to_path};
use vela_rbxts_compiler::EditorOptions;

#[derive(Clone, Debug)]
pub struct Document {
    pub uri: Uri,
    pub version: Option<i32>,
    pub text: String,
    pub file_path: Option<PathBuf>,
    index: Utf16Index,
}

impl Document {
    pub fn new(uri: Uri, text: String, version: Option<i32>) -> Self {
        let file_path = file_uri_to_path(&uri);
        let index = Utf16Index::new(&text);

        Self {
            uri,
            version,
            text,
            file_path,
            index,
        }
    }

    pub fn apply_content_changes(
        &mut self,
        changes: &[TextDocumentContentChangeEvent],
        version: Option<i32>,
    ) {
        for change in changes {
            match change.range {
                Some(range) => {
                    let start = self.index.position_to_byte(&self.text, range.start);
                    let end = self
                        .index
                        .position_to_byte(&self.text, range.end)
                        .max(start);
                    self.text.replace_range(start..end, &change.text);
                }
                None => {
                    self.text.clear();
                    self.text.push_str(&change.text);
                }
            }
            self.index = Utf16Index::new(&self.text);
        }
        self.version = version;
    }

    pub fn position_to_offset(&self, position: Position) -> u32 {
        self.index.position_to_offset(position)
    }

    pub fn offset_to_position(&self, offset: u32) -> Position {
        self.index.offset_to_position(offset)
    }

    pub fn range_to_lsp_range(&self, start: u32, end: u32) -> Range {
        self.index.range_to_lsp_range(start, end)
    }

    pub fn editor_options(
        &self,
        project_root: Option<&Path>,
        config_json: Option<String>,
    ) -> EditorOptions {
        EditorOptions {
            config_json,
            file_name: self
                .file_path
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
            project_root: project_root.map(|path| path.to_string_lossy().into_owned()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn document(text: &str) -> Document {
        Document::new(
            "file:///ws/App.tsx".parse::<Uri>().unwrap(),
            text.to_owned(),
            Some(1),
        )
    }

    fn ranged_change(range: Range, text: &str) -> TextDocumentContentChangeEvent {
        TextDocumentContentChangeEvent {
            range: Some(range),
            range_length: None,
            text: text.to_owned(),
        }
    }

    #[test]
    fn applies_incremental_changes() {
        let mut document = document("className=\"bg-red-500\"");

        document.apply_content_changes(
            &[ranged_change(
                Range::new(Position::new(0, 14), Position::new(0, 17)),
                "blue",
            )],
            Some(2),
        );

        assert_eq!(document.text, "className=\"bg-blue-500\"");
        assert_eq!(document.version, Some(2));
    }

    #[test]
    fn applies_sequential_changes_in_one_batch() {
        let mut document = document("ab\ncd");

        document.apply_content_changes(
            &[
                ranged_change(Range::new(Position::new(1, 0), Position::new(1, 2)), "xyz"),
                ranged_change(Range::new(Position::new(0, 0), Position::new(0, 1)), ""),
            ],
            Some(2),
        );

        assert_eq!(document.text, "b\nxyz");
    }

    #[test]
    fn applies_multiline_and_multibyte_changes() {
        let mut document = document("a🙂b\r\ncd");

        // Delete from after the emoji (utf16 col 3) through the start of line 1.
        document.apply_content_changes(
            &[ranged_change(
                Range::new(Position::new(0, 3), Position::new(1, 0)),
                "-",
            )],
            Some(2),
        );

        assert_eq!(document.text, "a🙂-cd");
    }

    #[test]
    fn replaces_the_full_text_when_no_range_is_given() {
        let mut document = document("old");

        document.apply_content_changes(
            &[TextDocumentContentChangeEvent {
                range: None,
                range_length: None,
                text: "new".to_owned(),
            }],
            Some(3),
        );

        assert_eq!(document.text, "new");
        assert_eq!(document.version, Some(3));
    }
}
