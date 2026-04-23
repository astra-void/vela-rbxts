use std::{collections::HashMap, path::PathBuf};

use tower_lsp::lsp_types::Url;

use crate::documents::Document;

#[derive(Debug, Default)]
pub struct ServerState {
    pub project_root: Option<PathBuf>,
    documents: HashMap<Url, Document>,
}

impl ServerState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        self.project_root = project_root;
    }

    pub fn upsert_document(&mut self, uri: Url, text: String, version: Option<i32>) -> Document {
        let document = Document::new(uri.clone(), text, version);
        self.documents.insert(uri, document.clone());
        document
    }

    pub fn update_document(
        &mut self,
        uri: &Url,
        text: String,
        version: Option<i32>,
    ) -> Option<Document> {
        let document = self.documents.get_mut(uri)?;
        document.update(text, version);
        Some(document.clone())
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

        let updated = state
            .update_document(&uri, "className=\"rounded-\"".to_owned(), Some(2))
            .unwrap();
        assert_eq!(updated.version, Some(2));
        assert_eq!(state.document(&uri).unwrap().text, "className=\"rounded-\"");

        assert!(state.remove_document(&uri).is_some());
        assert!(state.document(&uri).is_none());
    }
}
