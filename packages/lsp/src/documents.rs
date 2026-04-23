use std::path::{Path, PathBuf};

use tower_lsp::lsp_types::{Position, Range, Url};

use crate::translate::{Utf16Index, file_uri_to_path};
use vela_rbxts_compiler::EditorOptions;

#[derive(Clone, Debug)]
pub struct Document {
    pub uri: Url,
    pub version: Option<i32>,
    pub text: String,
    pub file_path: Option<PathBuf>,
    index: Utf16Index,
}

impl Document {
    pub fn new(uri: Url, text: String, version: Option<i32>) -> Self {
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

    pub fn update(&mut self, text: String, version: Option<i32>) {
        self.text = text;
        self.version = version;
        self.index = Utf16Index::new(&self.text);
        self.file_path = file_uri_to_path(&self.uri);
    }

    pub fn position_to_offset(&self, position: Position) -> Option<u32> {
        self.index.position_to_offset(position)
    }

    pub fn offset_to_position(&self, offset: u32) -> Option<Position> {
        self.index.offset_to_position(offset)
    }

    pub fn range_to_lsp_range(&self, start: u32, end: u32) -> Option<Range> {
        self.index.range_to_lsp_range(start, end)
    }

    pub fn editor_options(&self, project_root: Option<&Path>) -> EditorOptions {
        EditorOptions {
            config_json: None,
            file_name: self
                .file_path
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
            project_root: project_root.map(|path| path.to_string_lossy().into_owned()),
        }
    }
}
