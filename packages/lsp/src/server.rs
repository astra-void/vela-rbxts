use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tokio::sync::RwLock;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::{
    CodeAction, CodeActionKind, CodeActionOptions, CodeActionOrCommand, CodeActionParams,
    CodeActionProviderCapability, CodeActionResponse, Color, ColorInformation, ColorPresentation,
    ColorPresentationParams, ColorProviderCapability, CompletionItem, CompletionItemKind,
    CompletionList, CompletionOptions, CompletionParams, CompletionResponse, CompletionTextEdit,
    Diagnostic, DiagnosticSeverity, DidChangeTextDocumentParams, DidChangeWatchedFilesParams,
    DidCloseTextDocumentParams, DidOpenTextDocumentParams, DocumentColorParams, DocumentHighlight,
    DocumentHighlightKind, DocumentHighlightParams, Hover, HoverContents, HoverParams,
    HoverProviderCapability, InitializeParams, InitializeResult, InitializedParams, MarkupContent,
    MarkupKind, NumberOrString, OneOf, Position, PositionEncodingKind, Range, ServerCapabilities,
    ServerInfo, TextDocumentSyncCapability, TextDocumentSyncKind, TextEdit, Url, WorkspaceEdit,
};
use tower_lsp::{Client, LanguageServer};
use vela_rbxts_compiler::{
    ClassTokenSpan, CompletionRequest, DiagnosticsRequest, DocumentColor as CompilerDocumentColor,
    DocumentColorsRequest, EditorDiagnostic as CompilerDiagnostic, EditorOptions, HoverRequest,
    SortClassNamesRequest, get_class_tokens, get_completions, get_diagnostics, get_document_colors,
    get_hover,
};

use crate::documents::Document;
use crate::quickfix::rank_suggestions;
use crate::state::{ConfigEntry, ServerState};

const SOURCE_NAME: &str = "vela-rbxts";
const DIAGNOSTICS_DEBOUNCE: Duration = Duration::from_millis(200);
const MAX_REPLACEMENT_SUGGESTIONS: usize = 3;

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InitializationOptions {
    #[serde(default)]
    workspace_root: Option<String>,
    #[serde(default)]
    configs: Vec<ConfigPayload>,
}

#[derive(Debug, Default, Deserialize)]
pub(crate) struct SetConfigsParams {
    #[serde(default)]
    configs: Vec<ConfigPayload>,
}

#[derive(Debug, Deserialize)]
struct ConfigPayload {
    dir: String,
    json: String,
}

impl ConfigPayload {
    fn into_entry(self) -> ConfigEntry {
        ConfigEntry {
            dir: PathBuf::from(self.dir),
            json: self.json,
        }
    }
}

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

    async fn document_with_options(&self, uri: &Url) -> Option<(Document, EditorOptions)> {
        let state = self.state.read().await;
        let document = state.document_cloned(uri)?;
        let options = state.editor_options(&document);
        Some((document, options))
    }

    async fn publish_now(&self, document: &Document) {
        let options = self.state.read().await.editor_options(document);
        publish_diagnostics(&self.client, document, options).await;
    }

    // Coalesces rapid edits: only the most recent document version survives the
    // debounce window and reaches the compiler.
    fn schedule_diagnostics(&self, uri: Url, version: i32) {
        let client = self.client.clone();
        let state = self.state.clone();

        tokio::spawn(async move {
            tokio::time::sleep(DIAGNOSTICS_DEBOUNCE).await;

            let (document, options) = {
                let guard = state.read().await;
                let Some(document) = guard.document_cloned(&uri) else {
                    return;
                };
                if document.version != Some(version) {
                    return;
                }
                let options = guard.editor_options(&document);
                (document, options)
            };

            publish_diagnostics(&client, &document, options).await;
        });
    }

    async fn refresh_all_diagnostics(&self) {
        let documents = self.state.read().await.open_documents();
        for document in &documents {
            self.publish_now(document).await;
        }
    }

    // A notification rather than a request: the editor pushes configs whenever it
    // notices one change, and tower-lsp drops a notification that lands on a
    // request handler without a word.
    pub(crate) async fn set_configs(&self, params: SetConfigsParams) {
        let entries = params
            .configs
            .into_iter()
            .map(ConfigPayload::into_entry)
            .collect();
        {
            let mut state = self.state.write().await;
            state.set_configs(entries);
        }
        self.refresh_all_diagnostics().await;
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for RbxtsLanguageServer {
    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {
        let options: InitializationOptions = params
            .initialization_options
            .and_then(|value| serde_json::from_value(value).ok())
            .unwrap_or_default();

        let root_uri = params.root_uri.or_else(|| {
            params
                .workspace_folders
                .and_then(|folders| folders.into_iter().next().map(|folder| folder.uri))
        });
        let project_root = root_uri
            .and_then(|uri| uri.to_file_path().ok())
            .or_else(|| options.workspace_root.as_ref().map(PathBuf::from));

        {
            let mut state = self.state.write().await;
            state.set_project_root(project_root);
            state.set_configs(
                options
                    .configs
                    .into_iter()
                    .map(ConfigPayload::into_entry)
                    .collect(),
            );
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
                position_encoding: Some(PositionEncodingKind::UTF16),
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::INCREMENTAL,
                )),
                completion_provider: Some(CompletionOptions {
                    resolve_provider: Some(false),
                    trigger_characters: Some(
                        ["-", ":", "\"", "'", " "]
                            .into_iter()
                            .map(str::to_owned)
                            .collect(),
                    ),
                    ..Default::default()
                }),
                color_provider: Some(ColorProviderCapability::Simple(true)),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                // The kinds have to be advertised, or a client never offers the
                // source action in its menu or runs it on save.
                code_action_provider: Some(CodeActionProviderCapability::Options(
                    CodeActionOptions {
                        code_action_kinds: Some(vec![CodeActionKind::QUICKFIX, sort_action_kind()]),
                        ..Default::default()
                    },
                )),
                document_highlight_provider: Some(OneOf::Left(true)),
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

        self.publish_now(&document).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let uri = params.text_document.uri;
        let version = params.text_document.version;
        let changes = params.content_changes;
        if changes.is_empty() {
            return;
        }

        let applied = {
            let mut state = self.state.write().await;
            if state.apply_document_changes(&uri, &changes, Some(version)) {
                true
            } else if let Some(full) = changes.iter().rev().find(|change| change.range.is_none()) {
                // No document to patch (missed did_open); only full text can seed one.
                state.upsert_document(uri.clone(), full.text.clone(), Some(version));
                true
            } else {
                false
            }
        };

        if applied {
            self.schedule_diagnostics(uri, version);
        }
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

    async fn did_change_watched_files(&self, _: DidChangeWatchedFilesParams) {
        // The editor watches `vela.config.ts`. The authoritative config payload
        // arrives via `vela-rbxts/setConfigs`, but refresh here too so diagnostics
        // never lag behind a config edit.
        self.refresh_all_diagnostics().await;
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
        let uri = params.text_document_position.text_document.uri;
        let position = params.text_document_position.position;
        let Some((document, options)) = self.document_with_options(&uri).await else {
            return Ok(None);
        };

        let response = get_completions(CompletionRequest {
            source: document.text.clone(),
            position: document.position_to_offset(position),
            options: Some(options),
        });

        if !response.is_in_class_name_context {
            return Ok(None);
        }

        let items = response
            .items
            .into_iter()
            .map(|item| compiler_completion_item_to_lsp(&document, item))
            .collect();

        // Re-requested on every keystroke so the compiler's matcher, which is
        // looser than the client's word filter, stays in charge of the list.
        Ok(Some(CompletionResponse::List(CompletionList {
            is_incomplete: true,
            items,
        })))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;
        let Some((document, options)) = self.document_with_options(&uri).await else {
            return Ok(None);
        };

        let offset = document.position_to_offset(position);
        let response = get_hover(HoverRequest {
            source: document.text.clone(),
            position: offset,
            options: Some(options),
        });

        let Some(contents) = response.contents else {
            return Ok(None);
        };

        let hover_range = response
            .range
            .map(|range| document.range_to_lsp_range(range.start, range.end))
            .unwrap_or_else(|| {
                let position = document.offset_to_position(offset);
                Range::new(position, position)
            });

        Ok(Some(Hover {
            contents: HoverContents::Markup(MarkupContent {
                kind: MarkupKind::Markdown,
                value: hover_markdown(contents.display, &contents.documentation),
            }),
            range: Some(hover_range),
        }))
    }

    async fn code_action(&self, params: CodeActionParams) -> Result<Option<CodeActionResponse>> {
        let wants_quickfix =
            action_kind_allowed(params.context.only.as_ref(), &CodeActionKind::QUICKFIX);
        let wants_sort = action_kind_allowed(params.context.only.as_ref(), &sort_action_kind());
        if !wants_quickfix && !wants_sort {
            return Ok(None);
        }

        let uri = params.text_document.uri;
        let Some((document, options)) = self.document_with_options(&uri).await else {
            return Ok(None);
        };

        let mut actions: CodeActionResponse = Vec::new();

        if wants_sort && let Some(action) = sort_action(&uri, &document, &options) {
            actions.push(CodeActionOrCommand::CodeAction(action));
        }

        for diagnostic in params.context.diagnostics.iter().filter(|_| wants_quickfix) {
            if diagnostic.source.as_deref() != Some(SOURCE_NAME) {
                continue;
            }

            let Some(token) = diagnostic_token(diagnostic) else {
                continue;
            };

            // Asked at the utility rather than at the token start: a position
            // inside the variant chain completes variants alone, and a
            // replacement needs the utilities too.
            let (variant_prefix, _) = split_variant_prefix(&token);
            let completions = get_completions(CompletionRequest {
                source: document.text.clone(),
                position: document.position_to_offset(diagnostic.range.start)
                    + variant_prefix.encode_utf16().count() as u32,
                options: Some(options.clone()),
            });
            let labels: Vec<String> = completions
                .items
                .into_iter()
                .map(|item| item.label)
                .collect();
            let code = match &diagnostic.code {
                Some(NumberOrString::String(code)) => Some(code.as_str()),
                _ => None,
            };
            let suggestions =
                replacement_suggestions(code, &token, &labels, MAX_REPLACEMENT_SUGGESTIONS);

            for (index, suggestion) in suggestions.into_iter().enumerate() {
                actions.push(CodeActionOrCommand::CodeAction(replace_action(
                    &uri,
                    diagnostic,
                    &suggestion,
                    index == 0,
                )));
            }

            actions.push(CodeActionOrCommand::CodeAction(remove_action(
                &uri, diagnostic, &token,
            )));
        }

        if actions.is_empty() {
            return Ok(None);
        }

        Ok(Some(actions))
    }

    async fn document_highlight(
        &self,
        params: DocumentHighlightParams,
    ) -> Result<Option<Vec<DocumentHighlight>>> {
        let uri = params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;
        let Some(document) = self.state.read().await.document_cloned(&uri) else {
            return Ok(None);
        };

        let offset = document.position_to_offset(position);
        let tokens = get_class_tokens(&document.text);

        Ok(same_token_highlights(&document, &tokens, offset))
    }

    async fn document_color(&self, params: DocumentColorParams) -> Result<Vec<ColorInformation>> {
        let uri = params.text_document.uri;
        let Some((document, options)) = self.document_with_options(&uri).await else {
            return Ok(Vec::new());
        };

        let response = get_document_colors(DocumentColorsRequest {
            source: document.text.clone(),
            options: Some(options),
        });

        Ok(response
            .colors
            .into_iter()
            .map(|color| compiler_document_color_to_lsp(&document, color))
            .collect())
    }

    async fn color_presentation(
        &self,
        params: ColorPresentationParams,
    ) -> Result<Vec<ColorPresentation>> {
        let uri = params.text_document.uri;
        let Some((document, options)) = self.document_with_options(&uri).await else {
            return Ok(Vec::new());
        };

        let response = get_document_colors(DocumentColorsRequest {
            source: document.text.clone(),
            options: Some(options.clone()),
        });

        let Some(color) = response.colors.into_iter().find(|color| {
            document.range_to_lsp_range(color.range.start, color.range.end) == params.range
        }) else {
            return Ok(Vec::new());
        };

        let completions = get_completions(CompletionRequest {
            source: document.text.clone(),
            position: color.range.start,
            options: Some(options),
        });

        Ok(theme_color_presentations(
            &color,
            &params.color,
            params.range,
            completions.items,
        ))
    }
}

async fn publish_diagnostics(client: &Client, document: &Document, options: EditorOptions) {
    let response = get_diagnostics(DiagnosticsRequest {
        source: document.text.clone(),
        options: Some(options),
    });

    let diagnostics = response
        .diagnostics
        .into_iter()
        .map(|diagnostic| compiler_diagnostic_to_lsp(document, diagnostic))
        .collect();

    client
        .publish_diagnostics(document.uri.clone(), diagnostics, document.version)
        .await;
}

fn action_kind_allowed(only: Option<&Vec<CodeActionKind>>, kind: &CodeActionKind) -> bool {
    only.is_none_or(|kinds| {
        kinds.iter().any(|requested| {
            let requested = requested.as_str();
            requested.is_empty()
                || kind.as_str() == requested
                || kind
                    .as_str()
                    .strip_prefix(requested)
                    .is_some_and(|rest| rest.starts_with('.'))
        })
    })
}

fn hover_markdown(display: String, documentation: &str) -> String {
    let mut value = display;
    if !documentation.trim().is_empty() {
        value.push_str("\n\n");
        value.push_str(documentation);
    }
    value
}

fn same_token_highlights(
    document: &Document,
    tokens: &[ClassTokenSpan],
    offset: u32,
) -> Option<Vec<DocumentHighlight>> {
    let current = tokens
        .iter()
        .find(|token| offset >= token.range.start && offset <= token.range.end)?;

    Some(
        tokens
            .iter()
            .filter(|token| token.text == current.text)
            .map(|token| DocumentHighlight {
                range: document.range_to_lsp_range(token.range.start, token.range.end),
                kind: Some(DocumentHighlightKind::TEXT),
            })
            .collect(),
    )
}

const MAX_COLOR_PRESENTATIONS: usize = 3;

/// Maps the picked RGB back onto theme tokens of the same utility family, so
/// the color picker swaps between theme colors instead of producing free-hand
/// values the compiler cannot lower. The current token stays available; the
/// nearest candidates lead once the user actually moves the picker.
fn theme_color_presentations(
    color: &CompilerDocumentColor,
    picked: &Color,
    range: Range,
    items: Vec<vela_rbxts_compiler::CompletionItem>,
) -> Vec<ColorPresentation> {
    let (variant_prefix, utility) = split_variant_prefix(&color.token);
    let family = utility.split('-').next().unwrap_or_default();
    let picked_rgb = (
        unit_to_byte(f64::from(picked.red)),
        unit_to_byte(f64::from(picked.green)),
        unit_to_byte(f64::from(picked.blue)),
    );
    let current_rgb = (
        unit_to_byte(color.red),
        unit_to_byte(color.green),
        unit_to_byte(color.blue),
    );

    let mut candidates: Vec<(u32, String)> = items
        .into_iter()
        .filter_map(|item| {
            let hex = item.color?;
            let rest = item.label.strip_prefix(family)?;
            if !rest.starts_with('-') || item.label == utility {
                return None;
            }
            let rgb = parse_hex_color(&hex)?;
            Some((
                color_distance(rgb, picked_rgb),
                format!("{variant_prefix}{}", item.label),
            ))
        })
        .collect();
    candidates.sort();
    candidates.truncate(MAX_COLOR_PRESENTATIONS);

    let current = ColorPresentation {
        label: color.presentation.clone(),
        ..Default::default()
    };
    let theme_edits = candidates
        .into_iter()
        .map(|(_, label)| presentation_edit(label, range));

    let mut presentations = Vec::new();
    if picked_rgb == current_rgb {
        presentations.push(current);
        presentations.extend(theme_edits);
    } else {
        presentations.extend(theme_edits);
        presentations.push(current);
    }
    presentations
}

fn presentation_edit(label: String, range: Range) -> ColorPresentation {
    ColorPresentation {
        text_edit: Some(TextEdit {
            range,
            new_text: label.clone(),
        }),
        label,
        ..Default::default()
    }
}

fn unit_to_byte(value: f64) -> u8 {
    (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn parse_hex_color(hex: &str) -> Option<(u8, u8, u8)> {
    let hex = hex.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let value = u32::from_str_radix(hex, 16).ok()?;
    Some(((value >> 16) as u8, (value >> 8) as u8, value as u8))
}

fn color_distance(a: (u8, u8, u8), b: (u8, u8, u8)) -> u32 {
    let dr = i32::from(a.0) - i32::from(b.0);
    let dg = i32::from(a.1) - i32::from(b.1);
    let db = i32::from(a.2) - i32::from(b.2);
    (dr * dr + dg * dg + db * db) as u32
}

/// Splits `md:hover:px-4` into its variant prefix (`md:hover:`) and utility
/// (`px-4`). Colons inside brackets belong to arbitrary values and do not split.
fn split_variant_prefix(token: &str) -> (&str, &str) {
    let mut depth = 0usize;
    let mut split = 0;
    for (index, ch) in token.char_indices() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            ':' if depth == 0 => split = index + 1,
            _ => {}
        }
    }
    token.split_at(split)
}

/// Diagnostics about a prefix rather than about the utility behind it. Their
/// quickfix repairs or drops the offending segment; everything else is fixed by
/// replacing the utility.
const VARIANT_DIAGNOSTIC_CODES: [&str; 3] = [
    "unknown-variant",
    "unknown-breakpoint",
    "malformed-attribute-variant",
];

/// Splits a variant prefix into its segments. Colons inside brackets belong to
/// an arbitrary value, so `attr-[State=a:b]:` is one segment.
fn variant_segments(prefix: &str) -> Vec<&str> {
    let mut segments = Vec::new();
    let mut depth = 0usize;
    let mut start = 0usize;

    for (index, ch) in prefix.char_indices() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            ':' if depth == 0 => {
                if index > start {
                    segments.push(&prefix[start..index]);
                }
                start = index + 1;
            }
            _ => {}
        }
    }

    segments
}

/// Builds replacement texts for a diagnosed token, keeping the variants the
/// user already typed: utility suggestions are ranked against the utility part
/// alone, and a diagnostic about a prefix gets that prefix repaired or dropped
/// instead of fuzzy-matching the whole token.
fn replacement_suggestions(
    code: Option<&str>,
    token: &str,
    labels: &[String],
    max: usize,
) -> Vec<String> {
    let (variant_prefix, utility) = split_variant_prefix(token);
    let (variant_labels, utility_labels): (Vec<String>, Vec<String>) = labels
        .iter()
        .cloned()
        .partition(|label| label.ends_with(':'));

    if !code.is_some_and(|code| VARIANT_DIAGNOSTIC_CODES.contains(&code)) {
        return rank_suggestions(utility, &utility_labels, max)
            .into_iter()
            .map(|suggestion| format!("{variant_prefix}{suggestion}"))
            .collect();
    }

    let known: Vec<String> = variant_labels
        .iter()
        .map(|label| label.trim_end_matches(':').to_owned())
        .collect();
    let segments = variant_segments(variant_prefix);

    let mut suggestions = Vec::new();

    let repaired: Option<Vec<String>> = segments
        .iter()
        .map(|segment| {
            if known.iter().any(|variant| variant == segment) {
                Some((*segment).to_owned())
            } else {
                rank_suggestions(segment, &known, 1).into_iter().next()
            }
        })
        .collect();
    if let Some(repaired) = repaired {
        suggestions.push(format!("{}:{utility}", repaired.join(":")));
    }

    let kept: Vec<&str> = segments
        .iter()
        .copied()
        .filter(|segment| known.iter().any(|variant| variant == segment))
        .collect();
    let dropped = if kept.is_empty() {
        utility.to_owned()
    } else {
        format!("{}:{utility}", kept.join(":"))
    };
    if !suggestions.contains(&dropped) {
        suggestions.push(dropped);
    }

    suggestions.truncate(max);
    suggestions
}

fn diagnostic_token(diagnostic: &Diagnostic) -> Option<String> {
    diagnostic
        .data
        .as_ref()
        .and_then(|data| data.get("token"))
        .and_then(|token| token.as_str())
        .map(|token| token.to_owned())
}

fn replace_action(
    uri: &Url,
    diagnostic: &Diagnostic,
    suggestion: &str,
    preferred: bool,
) -> CodeAction {
    CodeAction {
        title: format!("Replace with `{suggestion}`"),
        kind: Some(CodeActionKind::QUICKFIX),
        diagnostics: Some(vec![diagnostic.clone()]),
        edit: Some(document_edit(
            uri,
            vec![TextEdit {
                range: diagnostic.range,
                new_text: suggestion.to_owned(),
            }],
        )),
        is_preferred: Some(preferred),
        ..Default::default()
    }
}

fn remove_action(uri: &Url, diagnostic: &Diagnostic, token: &str) -> CodeAction {
    CodeAction {
        title: format!("Remove `{token}`"),
        kind: Some(CodeActionKind::QUICKFIX),
        diagnostics: Some(vec![diagnostic.clone()]),
        edit: Some(document_edit(
            uri,
            vec![TextEdit {
                range: diagnostic.range,
                new_text: String::new(),
            }],
        )),
        ..Default::default()
    }
}

/// A source action rather than a quickfix: nothing is broken, the classes are
/// just not in canonical order, so it must not surface as a lightbulb fix.
fn sort_action_kind() -> CodeActionKind {
    CodeActionKind::new("source.sortVelaClasses")
}

fn sort_action(
    uri: &Url,
    document: &Document,
    options: &vela_rbxts_compiler::EditorOptions,
) -> Option<CodeAction> {
    let response = vela_rbxts_compiler::sort_class_names(SortClassNamesRequest {
        source: document.text.clone(),
        options: Some(options.clone()),
    });
    if response.edits.is_empty() {
        return None;
    }

    let edits: Vec<TextEdit> = response
        .edits
        .into_iter()
        .map(|edit| TextEdit {
            range: document.range_to_lsp_range(edit.range.start, edit.range.end),
            new_text: edit.text,
        })
        .collect();

    Some(CodeAction {
        title: "Sort vela-rbxts classes".to_owned(),
        kind: Some(sort_action_kind()),
        edit: Some(document_edit(uri, edits)),
        ..Default::default()
    })
}

fn document_edit(uri: &Url, edits: Vec<TextEdit>) -> WorkspaceEdit {
    let mut changes = HashMap::new();
    changes.insert(uri.clone(), edits);
    WorkspaceEdit {
        changes: Some(changes),
        ..Default::default()
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

    let text_edit = item.replacement.as_ref().map(|range| {
        CompletionTextEdit::Edit(TextEdit {
            range: document.range_to_lsp_range(range.start, range.end),
            new_text: insert_text.clone(),
        })
    });

    // VS Code draws the suggest-widget swatch only when the label or a plain
    // string documentation is exactly `#rrggbb`, so color items carry the bare
    // hex as documentation. The hex stays in `detail` for clients that read it
    // from there.
    let (detail, documentation) = match &item.color {
        Some(color) => (
            color.clone(),
            tower_lsp::lsp_types::Documentation::String(color.clone()),
        ),
        None => (
            category.clone(),
            tower_lsp::lsp_types::Documentation::MarkupContent(MarkupContent {
                kind: MarkupKind::Markdown,
                value: documentation,
            }),
        ),
    };

    CompletionItem {
        label: label.clone(),
        kind: Some(map_completion_kind(&category, item.color.is_some())),
        detail: Some(detail),
        documentation: Some(documentation),
        sort_text: item.sort_text,
        filter_text: Some(label),
        insert_text: Some(insert_text),
        text_edit,
        ..Default::default()
    }
}

fn map_completion_kind(category: &str, has_color: bool) -> CompletionItemKind {
    if has_color {
        return CompletionItemKind::COLOR;
    }

    match category {
        "variant" => CompletionItemKind::KEYWORD,
        "color" => CompletionItemKind::COLOR,
        "typography" => CompletionItemKind::TEXT,
        _ => CompletionItemKind::PROPERTY,
    }
}

fn compiler_diagnostic_to_lsp(document: &Document, diagnostic: CompilerDiagnostic) -> Diagnostic {
    let range = diagnostic
        .range
        .as_ref()
        .map(|range| document.range_to_lsp_range(range.start, range.end))
        .unwrap_or_else(|| {
            let position = Position::new(0, 0);
            Range::new(position, position)
        });

    let data = diagnostic
        .token
        .as_ref()
        .map(|token| serde_json::json!({ "token": token }));

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
        data,
        ..Default::default()
    }
}

fn compiler_document_color_to_lsp(
    document: &Document,
    color: CompilerDocumentColor,
) -> ColorInformation {
    ColorInformation {
        range: document.range_to_lsp_range(color.range.start, color.range.end),
        color: Color {
            red: color.red as f32,
            green: color.green as f32,
            blue: color.blue as f32,
            alpha: color.alpha as f32,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_diagnostic(token: Option<&str>) -> Diagnostic {
        Diagnostic {
            range: Range::new(Position::new(0, 4), Position::new(0, 13)),
            source: Some(SOURCE_NAME.to_owned()),
            code: Some(NumberOrString::String("unknown-theme-key".to_owned())),
            message: "unknown".to_owned(),
            data: token.map(|token| serde_json::json!({ "token": token })),
            ..Default::default()
        }
    }

    #[test]
    fn extracts_the_token_from_diagnostic_data() {
        assert_eq!(
            diagnostic_token(&sample_diagnostic(Some("bg-surfac"))).as_deref(),
            Some("bg-surfac")
        );
        assert_eq!(diagnostic_token(&sample_diagnostic(None)), None);
    }

    fn color_item(label: &str, hex: Option<&str>) -> vela_rbxts_compiler::CompletionItem {
        vela_rbxts_compiler::CompletionItem {
            label: label.to_owned(),
            insert_text: label.to_owned(),
            kind: "utility".to_owned(),
            category: "color".to_owned(),
            documentation: String::new(),
            replacement: None,
            color: hex.map(str::to_owned),
            sort_text: None,
        }
    }

    #[test]
    fn maps_picked_colors_onto_same_family_theme_tokens() {
        let color = CompilerDocumentColor {
            range: vela_rbxts_compiler::EditorRange { start: 18, end: 33 },
            red: 49.0 / 255.0,
            green: 65.0 / 255.0,
            blue: 88.0 / 255.0,
            alpha: 1.0,
            token: "md:bg-slate-700".to_owned(),
            presentation: "md:bg-slate-700".to_owned(),
        };
        let range = Range::new(Position::new(0, 18), Position::new(0, 33));
        let items = vec![
            color_item("bg-slate-500", Some("#62748e")),
            color_item("bg-slate-700", Some("#314158")),
            color_item("bg-rose-500", Some("#f43f5e")),
            color_item("text-slate-500", Some("#62748e")),
            color_item("bg-gradient-to-r", None),
        ];

        // Picker moved onto slate-500: the nearest theme token leads with an edit
        // that keeps the typed variant.
        let picked = Color {
            red: 98.0 / 255.0,
            green: 116.0 / 255.0,
            blue: 142.0 / 255.0,
            alpha: 1.0,
        };
        let presentations = theme_color_presentations(&color, &picked, range, items.clone());
        assert_eq!(presentations[0].label, "md:bg-slate-500");
        assert_eq!(
            presentations[0].text_edit.as_ref().unwrap().new_text,
            "md:bg-slate-500"
        );
        assert!(presentations.iter().any(|p| p.label == "md:bg-slate-700"));
        assert!(presentations.iter().all(|p| !p.label.contains("text-")));

        // An untouched picker keeps the current token first.
        let same = Color {
            red: 49.0 / 255.0,
            green: 65.0 / 255.0,
            blue: 88.0 / 255.0,
            alpha: 1.0,
        };
        let presentations = theme_color_presentations(&color, &same, range, items);
        assert_eq!(presentations[0].label, "md:bg-slate-700");
        assert!(presentations[0].text_edit.is_none());
    }

    #[test]
    fn parses_hex_swatches() {
        assert_eq!(parse_hex_color("#62748e"), Some((0x62, 0x74, 0x8e)));
        assert_eq!(parse_hex_color("62748e"), None);
        assert_eq!(parse_hex_color("#fff"), None);
    }

    #[test]
    fn splits_variant_prefixes_for_quickfixes() {
        assert_eq!(split_variant_prefix("px-4"), ("", "px-4"));
        assert_eq!(split_variant_prefix("md:hover:px-4"), ("md:hover:", "px-4"));
        assert_eq!(split_variant_prefix("bg-[rgb(1:2)]"), ("", "bg-[rgb(1:2)]"));
    }

    #[test]
    fn keeps_typed_variants_in_utility_replacements() {
        let labels = vec![
            "md:".to_owned(),
            "rounded-md".to_owned(),
            "rounded-lg".to_owned(),
        ];

        let suggestions =
            replacement_suggestions(Some("unknown-theme-key"), "md:rounded-mdd", &labels, 3);
        assert_eq!(
            suggestions.first().map(String::as_str),
            Some("md:rounded-md")
        );
        assert!(suggestions.iter().all(|s| s.starts_with("md:")));
    }

    #[test]
    fn repairs_or_drops_unknown_variants() {
        let labels = vec![
            "md:".to_owned(),
            "mouse:".to_owned(),
            "px-4".to_owned(),
            "px-8".to_owned(),
        ];

        // A near-miss variant is repaired; dropping it is offered as well.
        assert_eq!(
            replacement_suggestions(Some("unknown-variant"), "mous:px-4", &labels, 3),
            vec!["mouse:px-4".to_owned(), "px-4".to_owned()]
        );
        // A variant with no close match is dropped, keeping the valid ones.
        assert_eq!(
            replacement_suggestions(Some("unknown-variant"), "md:hover:px-4", &labels, 3),
            vec!["md:px-4".to_owned()]
        );
        // The utility itself is never fuzzy-replaced on a variant diagnostic.
        assert!(
            !replacement_suggestions(Some("unknown-variant"), "hover:px-4", &labels, 3)
                .contains(&"px-8".to_owned())
        );
    }

    #[test]
    fn builds_replace_and_remove_edits_over_the_token_range() {
        let uri = Url::parse("file:///ws/App.tsx").unwrap();
        let diagnostic = sample_diagnostic(Some("bg-surfac"));

        let replace = replace_action(&uri, &diagnostic, "bg-surface", true);
        assert_eq!(replace.kind, Some(CodeActionKind::QUICKFIX));
        assert_eq!(replace.is_preferred, Some(true));
        let edits = &replace.edit.unwrap().changes.unwrap()[&uri];
        assert_eq!(edits[0].new_text, "bg-surface");
        assert_eq!(edits[0].range, diagnostic.range);

        let remove = remove_action(&uri, &diagnostic, "bg-surfac");
        let edits = &remove.edit.unwrap().changes.unwrap()[&uri];
        assert_eq!(edits[0].new_text, "");
        assert_eq!(edits[0].range, diagnostic.range);
    }

    #[test]
    fn filters_actions_by_requested_kind() {
        let quickfix = CodeActionKind::QUICKFIX;

        assert!(action_kind_allowed(None, &quickfix));
        assert!(action_kind_allowed(
            Some(&vec![CodeActionKind::QUICKFIX]),
            &quickfix
        ));
        assert!(action_kind_allowed(
            Some(&vec![CodeActionKind::EMPTY]),
            &quickfix
        ));
        assert!(!action_kind_allowed(
            Some(&vec![CodeActionKind::REFACTOR, CodeActionKind::SOURCE]),
            &quickfix
        ));
        // A requested sub-kind admits actions of that sub-kind, not the parent.
        assert!(action_kind_allowed(
            Some(&vec![CodeActionKind::QUICKFIX]),
            &CodeActionKind::new("quickfix.replace")
        ));
        assert!(!action_kind_allowed(
            Some(&vec![CodeActionKind::new("quickfixes")]),
            &quickfix
        ));
    }

    #[test]
    fn joins_hover_sections_skipping_empty_documentation() {
        assert_eq!(
            hover_markdown("`bg-red-500`".to_owned(), "Sets the color."),
            "`bg-red-500`\n\nSets the color."
        );
        assert_eq!(
            hover_markdown("`bg-red-500`".to_owned(), " "),
            "`bg-red-500`"
        );
    }

    #[test]
    fn highlights_every_occurrence_of_the_same_token() {
        let source = "export const App = () => (<>\n  <frame className=\"bg-slate-700 px-4\" />\n  <frame className=\"px-4 bg-slate-700\" />\n</>);";
        let document = Document::new(
            Url::parse("file:///ws/App.tsx").unwrap(),
            source.to_owned(),
            Some(1),
        );
        let tokens = get_class_tokens(source);
        let line = source.lines().nth(1).unwrap();
        let offset = document.position_to_offset(Position::new(
            1,
            line.find("bg-slate-700").unwrap() as u32 + 2,
        ));

        let highlights = same_token_highlights(&document, &tokens, offset).unwrap();
        assert_eq!(highlights.len(), 2);
        assert!(
            highlights
                .iter()
                .all(|highlight| { highlight.kind == Some(DocumentHighlightKind::TEXT) })
        );
        assert_eq!(highlights[0].range.start.line, 1);
        assert_eq!(highlights[1].range.start.line, 2);

        // Outside any className there is nothing to highlight.
        assert_eq!(
            same_token_highlights(
                &document,
                &tokens,
                document.position_to_offset(Position::new(0, 0))
            ),
            None
        );
    }
}
