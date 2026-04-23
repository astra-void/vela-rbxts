use std::path::PathBuf;
use std::sync::Arc;

use tokio::sync::RwLock;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::{
    CompletionItem, CompletionItemKind, CompletionOptions, CompletionParams, CompletionResponse,
    CompletionTextEdit, Diagnostic, DiagnosticSeverity, DidChangeTextDocumentParams,
    DidCloseTextDocumentParams, DidOpenTextDocumentParams, Hover, HoverContents, HoverParams,
    HoverProviderCapability, InitializeParams, InitializeResult, InitializedParams, MarkupContent,
    MarkupKind, NumberOrString, Position, Range, ServerCapabilities, ServerInfo,
    TextDocumentSyncCapability, TextDocumentSyncKind, TextEdit, Url,
};
use tower_lsp::{Client, LanguageServer};
use vela_rbxts_compiler::{
    DiagnosticsRequest, EditorDiagnostic as CompilerDiagnostic, HoverRequest, get_completions,
    get_diagnostics, get_hover,
};

use crate::documents::Document;
use crate::state::ServerState;

const SOURCE_NAME: &str = "vela-rbxts";

// Thin stdio LSP adapter over the compiler/editor APIs.
pub struct RbxtsLanguageServer {
    client: Client,
    state: Arc<RwLock<ServerState>>,
}

impl RbxtsLanguageServer {
    pub fn new(client: Client) -> Self {
        Self {
            client,
            state: Arc::new(RwLock::new(ServerState::new())),
        }
    }

    async fn project_root(&self) -> Option<PathBuf> {
        self.state.read().await.project_root.clone()
    }

    async fn snapshot_document(&self, uri: &Url) -> Option<Document> {
        self.state.read().await.document_cloned(uri)
    }

    async fn compiler_editor_options(
        &self,
        document: &Document,
    ) -> vela_rbxts_compiler::EditorOptions {
        let project_root = self.project_root().await;
        document.editor_options(project_root.as_deref())
    }

    async fn publish_document_diagnostics(&self, document: &Document) {
        let options = self.compiler_editor_options(document).await;
        let response = get_diagnostics(DiagnosticsRequest {
            source: document.text.clone(),
            options: Some(options),
        });

        let diagnostics = response
            .diagnostics
            .into_iter()
            .map(|diagnostic| compiler_diagnostic_to_lsp(document, diagnostic))
            .collect();

        self.client
            .publish_diagnostics(document.uri.clone(), diagnostics, document.version)
            .await;
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for RbxtsLanguageServer {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        let root_uri = params.root_uri.or_else(|| {
            params
                .workspace_folders
                .and_then(|folders| folders.into_iter().next().map(|folder| folder.uri))
        });

        let project_root = root_uri.and_then(|uri| uri.to_file_path().ok());
        {
            let mut state = self.state.write().await;
            state.set_project_root(project_root);
        }

        self.client
            .log_message(
                tower_lsp::lsp_types::MessageType::INFO,
                "vela-rbxts LSP initialized",
            )
            .await;

        Ok(InitializeResult {
            server_info: Some(ServerInfo {
                name: "vela-rbxts-lsp".to_owned(),
                version: Some(env!("CARGO_PKG_VERSION").to_owned()),
            }),
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::FULL,
                )),
                completion_provider: Some(CompletionOptions {
                    resolve_provider: Some(false),
                    trigger_characters: Some(vec!["-".to_owned(), ":".to_owned()]),
                    ..Default::default()
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                ..Default::default()
            },
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(
                tower_lsp::lsp_types::MessageType::INFO,
                "vela-rbxts LSP ready",
            )
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let document = {
            let mut state = self.state.write().await;
            state.upsert_document(
                params.text_document.uri,
                params.text_document.text,
                Some(params.text_document.version),
            )
        };

        self.publish_document_diagnostics(&document).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let Some(change) = params.content_changes.into_iter().last() else {
            return;
        };

        let uri = params.text_document.uri;
        let version = Some(params.text_document.version);
        let text = change.text;

        let document = {
            let mut state = self.state.write().await;
            if let Some(document) = state.update_document(&uri, text.clone(), version) {
                document
            } else {
                state.upsert_document(uri, text, version)
            }
        };

        self.publish_document_diagnostics(&document).await;
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        {
            let mut state = self.state.write().await;
            state.remove_document(&params.text_document.uri);
        }

        self.client
            .publish_diagnostics(params.text_document.uri, Vec::new(), None)
            .await;
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = params.text_document_position.text_document.uri;
        let position = params.text_document_position.position;
        let Some(document) = self.snapshot_document(&uri).await else {
            return Ok(None);
        };

        let Some(offset) = document.position_to_offset(position) else {
            return Ok(None);
        };

        let response = get_completions(vela_rbxts_compiler::CompletionRequest {
            source: document.text.clone(),
            position: offset,
            options: Some(self.compiler_editor_options(&document).await),
        });

        if !response.is_in_class_name_context {
            return Ok(None);
        }

        let items = response
            .items
            .into_iter()
            .map(|item| compiler_completion_item_to_lsp(&document, item))
            .collect();

        Ok(Some(CompletionResponse::Array(items)))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;
        let Some(document) = self.snapshot_document(&uri).await else {
            return Ok(None);
        };

        let Some(offset) = document.position_to_offset(position) else {
            return Ok(None);
        };

        let response = get_hover(HoverRequest {
            source: document.text.clone(),
            position: offset,
            options: Some(self.compiler_editor_options(&document).await),
        });

        let Some(contents) = response.contents else {
            return Ok(None);
        };

        let hover_range = response
            .range
            .and_then(|range| document.range_to_lsp_range(range.start, range.end))
            .or_else(|| {
                document
                    .offset_to_position(offset)
                    .map(|position| Range::new(position, position))
            });

        Ok(Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: format!("{}\n\n{}", contents.display, contents.documentation),
            }),
            range: hover_range,
        }))
    }
}

fn compiler_completion_item_to_lsp(
    document: &Document,
    item: vela_rbxts_compiler::CompletionItem,
) -> CompletionItem {
    let label = item.label;
    let category = item.category;
    let documentation = item.documentation;
    let insert_text = item.insert_text;
    let replacement = item.replacement;

    let text_edit = replacement.as_ref().and_then(|range| {
        document
            .range_to_lsp_range(range.start, range.end)
            .map(|range| {
                CompletionTextEdit::Edit(TextEdit {
                    range,
                    new_text: insert_text.clone(),
                })
            })
    });

    CompletionItem {
        label: label.clone(),
        kind: Some(map_completion_kind(&category)),
        detail: Some(category.clone()),
        documentation: Some(tower_lsp::lsp_types::Documentation::MarkupContent(
            MarkupContent {
                kind: MarkupKind::Markdown,
                value: documentation,
            },
        )),
        sort_text: Some(match category.as_str() {
            "variant" => format!("0-{}", label),
            _ => format!("1-{}", label),
        }),
        filter_text: Some(label),
        insert_text: Some(insert_text),
        text_edit,
        ..Default::default()
    }
}

fn map_completion_kind(category: &str) -> CompletionItemKind {
    match category {
        "variant" => CompletionItemKind::KEYWORD,
        "radius" | "spacing" | "size" | "color" | "stacking" | "utility" => {
            CompletionItemKind::PROPERTY
        }
        _ => CompletionItemKind::TEXT,
    }
}

fn compiler_diagnostic_to_lsp(document: &Document, diagnostic: CompilerDiagnostic) -> Diagnostic {
    let range = diagnostic
        .range
        .as_ref()
        .and_then(|range| document.range_to_lsp_range(range.start, range.end))
        .unwrap_or_else(|| {
            let position = Position::new(0, 0);
            Range::new(position, position)
        });

    Diagnostic {
        range,
        severity: Some(match diagnostic.level.as_str() {
            "error" => DiagnosticSeverity::ERROR,
            "hint" => DiagnosticSeverity::HINT,
            "info" => DiagnosticSeverity::INFORMATION,
            _ => DiagnosticSeverity::WARNING,
        }),
        code: Some(NumberOrString::String(diagnostic.code)),
        source: Some(SOURCE_NAME.to_owned()),
        message: diagnostic.message,
        ..Default::default()
    }
}
