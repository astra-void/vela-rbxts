use std::{
    cmp::Reverse,
    collections::HashMap,
    path::{Path, PathBuf},
};

use tower_lsp::lsp_types::{TextDocumentContentChangeEvent, Url};
use vela_rbxts_compiler::EditorOptions;

use crate::documents::Document;

#[derive(Clone, Debug)]
pub struct ConfigEntry {
    pub dir: PathBuf,
    pub json: String,
}

#[derive(Debug, Default)]
pub struct ServerState {
    project_root: Option<PathBuf>,
    configs: Vec<ConfigEntry>,
    documents: HashMap<Url, Document>,
    inlay_hints_enabled: bool,
}

impl ServerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        self.project_root = project_root;
    }

    pub fn set_inlay_hints_enabled(&mut self, enabled: bool) {
        self.inlay_hints_enabled = enabled;
    }

    pub fn inlay_hints_enabled(&self) -> bool {
        self.inlay_hints_enabled
    }

    pub fn set_configs(&mut self, mut configs: Vec<ConfigEntry>) {
        configs.sort_by_key(|entry| Reverse(entry.dir.components().count()));
        self.configs = configs;
    }

    /// Returns the resolved config JSON for the `vela.config.ts` nearest to the
    /// given source file, walking up the directory tree. `None` falls back to the
    /// compiler's default theme.
    pub fn config_json_for(&self, file_path: Option<&Path>) -> Option<String> {
        let file_path = file_path?;
        self.configs
            .iter()
            .find(|entry| file_path.starts_with(&entry.dir))
            .map(|entry| entry.json.clone())
    }

    pub fn editor_options(&self, document: &Document) -> EditorOptions {
        let config_json = self.config_json_for(document.file_path.as_deref());
        document.editor_options(self.project_root.as_deref(), config_json)
    }

    pub fn upsert_document(&mut self, uri: Url, text: String, version: Option<i32>) -> Document {
        let document = Document::new(uri.clone(), text, version);
        self.documents.insert(uri, document.clone());
        document
    }

    pub fn apply_document_changes(
        &mut self,
        uri: &Url,
        changes: &[TextDocumentContentChangeEvent],
        version: Option<i32>,
    ) -> bool {
        let Some(document) = self.documents.get_mut(uri) else {
            return false;
        };
        document.apply_content_changes(changes, version);
        true
    }

    pub fn remove_document(&mut self, uri: &Url) -> Option<Document> {
        self.documents.remove(uri)
    }

    #[cfg(test)]
    pub fn document(&self, uri: &Url) -> Option<&Document> {
        self.documents.get(uri)
    }

    pub fn document_cloned(&self, uri: &Url) -> Option<Document> {
        self.documents.get(uri).cloned()
    }

    pub fn open_documents(&self) -> Vec<Document> {
        self.documents.values().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_updates_and_removes_documents() {
        let uri = Url::parse("file:///workspace/App.tsx").unwrap();
        let mut state = ServerState::new();

        let inserted = state.upsert_document(uri.clone(), "className=\"bg-\"".to_owned(), Some(1));
        assert_eq!(inserted.version, Some(1));
        assert_eq!(state.document(&uri).unwrap().text, "className=\"bg-\"");

        assert!(state.apply_document_changes(
            &uri,
            &[TextDocumentContentChangeEvent {
                range: None,
                range_length: None,
                text: "className=\"rounded-\"".to_owned(),
            }],
            Some(2),
        ));
        assert_eq!(state.document(&uri).unwrap().version, Some(2));
        assert_eq!(state.document(&uri).unwrap().text, "className=\"rounded-\"");

        assert!(state.remove_document(&uri).is_some());
        assert!(state.document(&uri).is_none());
    }

    #[test]
    fn picks_the_nearest_config_for_a_source_file() {
        let mut state = ServerState::new();
        state.set_configs(vec![
            ConfigEntry {
                dir: PathBuf::from("/ws"),
                json: "ROOT".to_owned(),
            },
            ConfigEntry {
                dir: PathBuf::from("/ws/packages/ui"),
                json: "UI".to_owned(),
            },
        ]);

        assert_eq!(
            state.config_json_for(Some(Path::new("/ws/packages/ui/src/App.tsx"))),
            Some("UI".to_owned())
        );
        assert_eq!(
            state.config_json_for(Some(Path::new("/ws/apps/game/App.tsx"))),
            Some("ROOT".to_owned())
        );
        assert_eq!(
            state.config_json_for(Some(Path::new("/other/App.tsx"))),
            None
        );
        assert_eq!(state.config_json_for(None), None);
    }
}
