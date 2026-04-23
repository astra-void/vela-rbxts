#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::OnceLock};

use swc_core::{
    common::{DUMMY_SP, FileName, SourceMap, sync::Lrc},
    ecma::{
        ast::{
            ArrayLit, BinExpr, BinaryOp, BlockStmt, Bool, CondExpr, Expr, ExprOrSpread, Ident,
            IdentName, ImportDecl, ImportNamedSpecifier, ImportSpecifier, JSXAttr, JSXAttrName,
            JSXAttrOrSpread, JSXAttrValue, JSXClosingElement, JSXElement, JSXElementChild,
            JSXElementName, JSXExpr, JSXExprContainer, JSXOpeningElement, KeyValueProp, Lit,
            Module, ModuleDecl, ModuleItem, ObjectLit, ParenExpr, Pat, Prop, PropName,
            PropOrSpread, Str, UnaryExpr, UnaryOp, VarDecl, VarDeclKind,
        },
        codegen::{Config as CodegenConfig, Emitter, text_writer::JsWriter},
        parser::{Syntax, TsSyntax, parse_file_as_expr, parse_file_as_module},
        visit::{Visit, VisitMut, VisitMutWith, VisitWith},
    },
};

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Diagnostic {
    pub level: String,
    pub code: String,
    pub message: String,
    pub token: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TransformOptions {
    pub config_json: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TransformResult {
    pub code: String,
    pub diagnostics: Vec<Diagnostic>,
    pub changed: bool,
    pub ir: Vec<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorOptions {
    pub config_json: Option<String>,
    pub file_name: Option<String>,
    pub project_root: Option<String>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CompletionRequest {
    pub source: String,
    pub position: u32,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HoverRequest {
    pub source: String,
    pub position: u32,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DiagnosticsRequest {
    pub source: String,
    pub options: Option<EditorOptions>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EditorRange {
    pub start: u32,
    pub end: u32,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct CompletionItem {
    pub label: String,
    pub insert_text: String,
    pub kind: String,
    pub category: String,
    pub documentation: String,
    pub replacement: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionResponse {
    pub is_in_class_name_context: bool,
    pub items: Vec<CompletionItem>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HoverContent {
    pub display: String,
    pub documentation: String,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HoverResponse {
    pub contents: Option<HoverContent>,
    pub range: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EditorDiagnostic {
    pub level: String,
    pub code: String,
    pub message: String,
    pub token: Option<String>,
    pub range: Option<EditorRange>,
}

#[cfg_attr(not(target_arch = "wasm32"), napi(object))]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DiagnosticsResponse {
    pub diagnostics: Vec<EditorDiagnostic>,
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "implementationKind")]
pub fn implementation_kind() -> String {
    "native".to_owned()
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = implementationKind)]
pub fn implementation_kind() -> String {
    "wasm".to_owned()
}

#[cfg(not(target_arch = "wasm32"))]
#[napi]
pub fn transform(source: String, options: Option<TransformOptions>) -> TransformResult {
    transform_impl(source, options)
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getCompletions")]
pub fn get_completions(request: CompletionRequest) -> CompletionResponse {
    get_completions_impl(request)
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getHover")]
pub fn get_hover(request: HoverRequest) -> HoverResponse {
    get_hover_impl(request)
}

#[cfg(not(target_arch = "wasm32"))]
#[napi(js_name = "getDiagnostics")]
pub fn get_diagnostics(request: DiagnosticsRequest) -> DiagnosticsResponse {
    get_diagnostics_impl(request)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = transform)]
pub fn transform(source: String, options: JsValue) -> Result<JsValue, JsValue> {
    let options = parse_wasm_transform_options(options)?;
    let result = transform_impl(source, options);
    serde_wasm_bindgen::to_value(&result).map_err(|error| {
        JsValue::from_str(&format!("Failed to serialize transform result: {error}"))
    })
}

#[derive(Clone, Deserialize, Serialize, Default)]
struct TailwindConfig {
    #[serde(default)]
    theme: ThemeConfig,
}

#[derive(Clone, Deserialize, Serialize, Default)]
struct ThemeConfig {
    #[serde(default)]
    colors: ThemeColors,
    #[serde(default)]
    radius: ThemeScale,
    #[serde(default)]
    spacing: ThemeScale,
}

const DEFAULT_CONFIG_JSON: &str = include_str!("../../config/src/defaults.json");
static DEFAULT_CONFIG: OnceLock<TailwindConfig> = OnceLock::new();

type ThemeScale = BTreeMap<String, String>;
type ThemeColors = BTreeMap<String, ColorValue>;

#[derive(Clone, Deserialize, Serialize)]
#[serde(untagged)]
enum ColorValue {
    Literal(String),
    Palette(ColorScale),
}

type ColorScale = BTreeMap<String, String>;

#[derive(Clone, Deserialize, Default)]
struct TailwindConfigInput {
    theme: Option<ThemeConfigInput>,
}

#[derive(Clone, Deserialize, Default)]
struct ThemeConfigInput {
    colors: Option<ColorInputMap>,
    radius: Option<ThemeScale>,
    spacing: Option<ThemeScale>,
    extend: Option<ThemeConfigExtendInput>,
}

#[derive(Clone, Deserialize, Default)]
struct ThemeConfigExtendInput {
    colors: Option<ColorInputMap>,
    radius: Option<ThemeScale>,
    spacing: Option<ThemeScale>,
}

type ColorInputMap = BTreeMap<String, ColorValue>;

#[derive(Clone, Debug, Serialize)]
struct PropEntry {
    name: &'static str,
    value: String,
}

#[derive(Clone, Debug, Serialize)]
struct HelperEntry {
    tag: &'static str,
    props: Vec<PropEntry>,
}

#[derive(Clone, Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct StyleIr {
    base: StyleEffectBundle,
    runtime_rules: Vec<RuntimeRule>,
    runtime_class_value: bool,
}

#[derive(Clone, Debug, Serialize, Default)]
struct StyleEffectBundle {
    props: Vec<PropEntry>,
    helpers: Vec<HelperEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum RuntimeCondition {
    All {
        conditions: Vec<RuntimeCondition>,
    },
    Width {
        alias: String,
        #[serde(rename = "minWidth")]
        min_width: u32,
        #[serde(rename = "maxWidth", skip_serializing_if = "Option::is_none")]
        max_width: Option<u32>,
    },
    Orientation {
        value: String,
    },
    Input {
        value: String,
    },
}

#[derive(Clone, Debug, Serialize)]
struct RuntimeRule {
    condition: RuntimeCondition,
    effects: StyleEffectBundle,
}

#[derive(Clone)]
struct SizeAxisValue {
    scale: String,
    offset: String,
}

impl SizeAxisValue {
    fn offset(offset: impl Into<String>) -> Self {
        Self {
            scale: "0".to_owned(),
            offset: offset.into(),
        }
    }

    fn scale(scale: impl Into<String>) -> Self {
        Self {
            scale: scale.into(),
            offset: "0".to_owned(),
        }
    }

    fn zero() -> Self {
        Self::offset("0")
    }
}

impl StyleIr {
    fn set_prop(&mut self, name: &'static str, value: String) {
        self.base.props.retain(|prop| prop.name != name);
        self.base.props.push(PropEntry { name, value });
    }

    fn remove_prop(&mut self, name: &'static str) {
        self.base.props.retain(|prop| prop.name != name);
    }

    fn set_helper_prop(&mut self, tag: &'static str, name: &'static str, value: String) {
        if let Some(helper) = self
            .base
            .helpers
            .iter_mut()
            .find(|helper| helper.tag == tag)
        {
            helper.props.retain(|prop| prop.name != name);
            helper.props.push(PropEntry { name, value });
            return;
        }

        self.base.helpers.push(HelperEntry {
            tag,
            props: vec![PropEntry { name, value }],
        });
    }
}

#[derive(Clone)]
enum ColorResolution {
    Expression(String),
    Transparent,
}

#[derive(Clone, Copy)]
struct ColorFamilySpec {
    theme_family: &'static str,
    color_prop: &'static str,
    transparency_prop: Option<&'static str>,
}

const BACKGROUND_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "background color",
    color_prop: "BackgroundColor3",
    transparency_prop: Some("BackgroundTransparency"),
};

const TEXT_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "text color",
    color_prop: "TextColor3",
    transparency_prop: Some("TextTransparency"),
};

const IMAGE_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "image color",
    color_prop: "ImageColor3",
    transparency_prop: Some("ImageTransparency"),
};

const PLACEHOLDER_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "placeholder color",
    color_prop: "PlaceholderColor3",
    transparency_prop: None,
};

struct TailwindTransformer {
    changed: bool,
    config: TailwindConfig,
    diagnostics: Vec<Diagnostic>,
    ir: Vec<StyleIr>,
    runtime_import_needed: bool,
    class_value_scopes: ClassValueScopeStack,
}

struct LoweredClassName {
    style_ir: StyleIr,
    preserved_attrs: Vec<JSXAttrOrSpread>,
    runtime_class_name: Option<JSXAttr>,
    needs_runtime_host: bool,
}

#[derive(Clone, Default)]
struct ClassValueCollapse {
    static_tokens: Vec<String>,
    dynamic_expr: Option<Box<Expr>>,
}

impl ClassValueCollapse {
    fn static_only(tokens: Vec<String>) -> Self {
        Self {
            static_tokens: tokens,
            dynamic_expr: None,
        }
    }

    fn dynamic(expr: Box<Expr>) -> Self {
        Self {
            static_tokens: Vec::new(),
            dynamic_expr: Some(expr),
        }
    }

    fn is_dynamic(&self) -> bool {
        self.dynamic_expr.is_some()
    }

    fn into_expr(self) -> Box<Expr> {
        match self.dynamic_expr {
            Some(expr) => expr,
            None if self.static_tokens.is_empty() => Box::new(Expr::Lit(Lit::Bool(Bool {
                span: DUMMY_SP,
                value: false,
            }))),
            None => Box::new(Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: self.static_tokens.join(" ").into(),
                raw: None,
            }))),
        }
    }
}

#[derive(Default)]
struct ClassValueScopeStack {
    scopes: Vec<std::collections::BTreeMap<String, bool>>,
}

impl ClassValueScopeStack {
    fn push(&mut self) {
        self.scopes.push(std::collections::BTreeMap::new());
    }

    fn pop(&mut self) {
        self.scopes.pop();
    }

    fn insert(&mut self, name: String, value: bool) {
        if let Some(scope) = self.scopes.last_mut() {
            scope.insert(name, value);
        }
    }

    fn resolve(&self, ident: &Ident) -> Option<bool> {
        let name = ident.sym.to_string();

        for scope in self.scopes.iter().rev() {
            if let Some(value) = scope.get(&name) {
                return Some(*value);
            }
        }

        None
    }
}

fn apply_color_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spec: ColorFamilySpec,
    color_key: &str,
    token: &str,
) {
    let Some(resolution) = resolve_color_value(config, diagnostics, spec, color_key, token) else {
        return;
    };

    match resolution {
        ColorResolution::Expression(value) => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(transparency_prop);
            }

            style.set_prop(spec.color_prop, value);
        }
        ColorResolution::Transparent => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(spec.color_prop);
                style.set_prop(transparency_prop, "1".to_owned());
                return;
            }

            diagnostics.push(unsupported_color_keyword_diagnostic(
                spec.theme_family,
                color_key,
                token,
            ));
        }
    }
}

fn resolve_color_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spec: ColorFamilySpec,
    color_key: &str,
    token: &str,
) -> Option<ColorResolution> {
    if matches!(color_key, "current" | "inherit") {
        diagnostics.push(unsupported_color_keyword_diagnostic(
            spec.theme_family,
            color_key,
            token,
        ));
        return None;
    }

    if color_key == "transparent" {
        return Some(ColorResolution::Transparent);
    }

    match split_color_key(color_key) {
        ColorKey::Semantic(color_name) => match config.theme.colors.get(color_name) {
            Some(ColorValue::Literal(value)) => Some(ColorResolution::Expression(value.clone())),
            Some(ColorValue::Palette(_)) => {
                diagnostics.push(color_requires_shade_diagnostic(
                    spec.theme_family,
                    color_name,
                    token,
                ));
                None
            }
            None => {
                diagnostics.push(unknown_theme_key_diagnostic(
                    spec.theme_family,
                    color_key,
                    token,
                ));
                None
            }
        },
        ColorKey::Shaded { color_name, shade } => match config.theme.colors.get(color_name) {
            Some(ColorValue::Literal(_)) => {
                diagnostics.push(color_does_not_accept_shade_diagnostic(
                    spec.theme_family,
                    color_name,
                    shade,
                    token,
                ));
                None
            }
            Some(ColorValue::Palette(scale)) => match scale.get(shade) {
                Some(value) => Some(ColorResolution::Expression(value.clone())),
                None => {
                    diagnostics.push(color_missing_shade_diagnostic(
                        spec.theme_family,
                        color_name,
                        shade,
                        token,
                    ));
                    None
                }
            },
            None => {
                diagnostics.push(unknown_theme_key_diagnostic(
                    spec.theme_family,
                    color_key,
                    token,
                ));
                None
            }
        },
    }
}

enum ColorKey<'a> {
    Semantic(&'a str),
    Shaded { color_name: &'a str, shade: &'a str },
}

fn split_color_key(key: &str) -> ColorKey<'_> {
    let Some((name, shade)) = key.rsplit_once('-') else {
        return ColorKey::Semantic(key);
    };

    if is_shade_token(shade) {
        return ColorKey::Shaded {
            color_name: name,
            shade,
        };
    }

    ColorKey::Semantic(key)
}

fn is_shade_token(value: &str) -> bool {
    matches!(
        value,
        "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950"
    )
}

fn unsupported_color_keyword_diagnostic(theme_family: &str, key: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-color-key".to_owned(),
        message: format!(
            "Unsupported color keyword \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

fn color_requires_shade_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-missing-shade".to_owned(),
        message: format!(
            "Color palette \"{key}\" for {theme_family} utility requires an explicit shade such as \"{key}-500\" in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

fn color_does_not_accept_shade_diagnostic(
    theme_family: &str,
    key: &str,
    shade: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-invalid-shade".to_owned(),
        message: format!(
            "Color \"{key}\" for {theme_family} utility is a singleton semantic color and does not accept shade \"{shade}\" in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

fn color_missing_shade_diagnostic(
    theme_family: &str,
    key: &str,
    shade: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "color-invalid-shade".to_owned(),
        message: format!(
            "Color palette \"{key}\" for {theme_family} utility does not define shade \"{shade}\" in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

fn transform_impl(source: String, options: Option<TransformOptions>) -> TransformResult {
    let config = parse_config(
        options
            .as_ref()
            .and_then(|value| value.config_json.as_deref()),
    );
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Custom("input.tsx".into()).into(), source.clone());
    let mut recovered_errors = Vec::new();
    let parsed_module = parse_file_as_module(
        &fm,
        Syntax::Typescript(TsSyntax {
            decorators: true,
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    );

    let mut module = match parsed_module {
        Ok(module) => module,
        Err(error) => {
            return TransformResult {
                code: source,
                diagnostics: vec![Diagnostic {
                    level: "error".to_owned(),
                    code: "tsx-parse-failed".to_owned(),
                    message: format!("Failed to parse TSX input: {error:?}"),
                    token: None,
                }],
                changed: false,
                ir: Vec::new(),
            };
        }
    };

    if !recovered_errors.is_empty() {
        return TransformResult {
            code: source,
            diagnostics: vec![Diagnostic {
                level: "error".to_owned(),
                code: "tsx-parse-failed".to_owned(),
                message: format!("Recovered parse errors in TSX input: {recovered_errors:?}"),
                token: None,
            }],
            changed: false,
            ir: Vec::new(),
        };
    }

    let mut transformer = TailwindTransformer {
        changed: false,
        config,
        diagnostics: Vec::new(),
        ir: Vec::new(),
        runtime_import_needed: false,
        class_value_scopes: ClassValueScopeStack::default(),
    };
    module.visit_mut_with(&mut transformer);

    let emitted_code = emit_module(&cm, &module).unwrap_or_else(|error| {
        transformer.diagnostics.push(Diagnostic {
            level: "error".to_owned(),
            code: "tsx-emit-failed".to_owned(),
            message: error,
            token: None,
        });
        source
    });

    TransformResult {
        code: emitted_code,
        diagnostics: transformer.diagnostics,
        changed: transformer.changed,
        ir: transformer
            .ir
            .into_iter()
            .map(|style| serde_json::to_string(&style).expect("style IR must serialize to JSON"))
            .collect(),
    }
}

#[derive(Clone)]
struct ClassNameContext {
    element_tag: String,
    value: String,
    value_range: EditorRange,
}

#[derive(Clone)]
struct ClassToken {
    text: String,
    range: EditorRange,
}

struct ClassNameCollector<'a> {
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

fn get_completions_impl(request: CompletionRequest) -> CompletionResponse {
    let config = parse_editor_config(request.options.as_ref());
    let Some(context) = class_name_context_at_position(&request.source, request.position) else {
        return CompletionResponse {
            is_in_class_name_context: false,
            items: Vec::new(),
        };
    };

    let tokens = tokenize_class_name_with_ranges(&context.value, context.value_range.start);
    let replacement = current_token_replacement(&tokens, request.position);
    let prefix = current_prefix(&tokens, &replacement, request.position);
    let items = completion_candidates(&config, &context.element_tag)
        .into_iter()
        .filter(|item| item.label.starts_with(&prefix))
        .map(|mut item| {
            item.replacement = Some(replacement.clone());
            item
        })
        .collect();

    CompletionResponse {
        is_in_class_name_context: true,
        items,
    }
}

fn get_hover_impl(request: HoverRequest) -> HoverResponse {
    let config = parse_editor_config(request.options.as_ref());
    let Some(context) = class_name_context_at_position(&request.source, request.position) else {
        return HoverResponse {
            contents: None,
            range: None,
        };
    };

    let Some(token) = token_at_position(
        &tokenize_class_name_with_ranges(&context.value, context.value_range.start),
        request.position,
    ) else {
        return HoverResponse {
            contents: None,
            range: None,
        };
    };

    let Some(contents) = describe_token(&token.text, &config, &context.element_tag) else {
        return HoverResponse {
            contents: None,
            range: None,
        };
    };

    HoverResponse {
        contents: Some(contents),
        range: Some(token.range),
    }
}

fn get_diagnostics_impl(request: DiagnosticsRequest) -> DiagnosticsResponse {
    let config = parse_editor_config(request.options.as_ref());
    let contexts = collect_class_name_contexts(&request.source);
    let mut diagnostics = Vec::new();

    for context in contexts {
        for token in tokenize_class_name_with_ranges(&context.value, context.value_range.start) {
            if token.text.ends_with('-') {
                continue;
            }

            if let Some(diagnostic) = host_utility_diagnostic(&context.element_tag, &token) {
                diagnostics.push(diagnostic);
            }

            let mut compiler_diagnostics = Vec::new();
            resolve_class_tokens(
                vec![token.text.as_str()],
                &config,
                &mut compiler_diagnostics,
            );

            // Filter out unknown-theme-key diagnostics for very short incomplete fragments.
            // Only suppress diagnostics for tokens that look clearly incomplete (≤ 3 chars value),
            // to avoid noisy warnings on in-progress typing like 'bg-s', 'bg-sl', or 'bg-sla'.
            // Allow longer unknowns like 'bg-card' (4+ chars) to produce diagnostics.
            let filtered = compiler_diagnostics.into_iter().filter(|diag| {
                // Keep all non-unknown-theme-key diagnostics.
                if diag.code != "unknown-theme-key" {
                    return true;
                }

                let token_text = &token.text;

                // Only suppress unknown-theme-key for very short incomplete fragments.
                if let Some(pos) = token_text.find('-') {
                    let rest = &token_text[pos + 1..];
                    // Suppress if the value part is very short (likely incomplete typing).
                    // This catches 'bg-s', 'bg-sl', 'bg-sla' but allows 'bg-card'.
                    if rest.len() <= 3 {
                        return false;
                    }
                }

                true
            });

            diagnostics.extend(filtered.map(|diagnostic| {
                EditorDiagnostic {
                    level: diagnostic.level,
                    code: diagnostic.code,
                    message: diagnostic.message,
                    token: diagnostic.token,
                    range: Some(token.range.clone()),
                }
            }));
        }
    }

    DiagnosticsResponse { diagnostics }
}

fn parse_editor_config(options: Option<&EditorOptions>) -> TailwindConfig {
    parse_config(options.and_then(|value| value.config_json.as_deref()))
}

fn class_name_context_at_position(source: &str, position: u32) -> Option<ClassNameContext> {
    collect_class_name_contexts(source)
        .into_iter()
        .find(|context| {
            position >= context.value_range.start && position <= context.value_range.end
        })
}

fn collect_class_name_contexts(source: &str) -> Vec<ClassNameContext> {
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

fn span_range(span: swc_core::common::Span, source_base: u32) -> (usize, usize) {
    let start = span.lo.0.saturating_sub(source_base) as usize;
    let end = span.hi.0.saturating_sub(source_base) as usize;
    (start, end)
}

fn literal_content_range(source: &str, lo: usize, hi: usize) -> EditorRange {
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

fn byte_to_utf16_position(source: &str, byte_index: usize) -> u32 {
    source
        .get(..byte_index.min(source.len()))
        .unwrap_or_default()
        .encode_utf16()
        .count() as u32
}

fn utf16_len(value: &str) -> u32 {
    value.encode_utf16().count() as u32
}

fn tokenize_class_name_with_ranges(input: &str, source_offset: u32) -> Vec<ClassToken> {
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

fn current_token_replacement(tokens: &[ClassToken], position: u32) -> EditorRange {
    tokens
        .iter()
        .find(|token| position >= token.range.start && position <= token.range.end)
        .map(|token| token.range.clone())
        .unwrap_or(EditorRange {
            start: position,
            end: position,
        })
}

fn current_prefix(tokens: &[ClassToken], replacement: &EditorRange, position: u32) -> String {
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

fn token_at_position(tokens: &[ClassToken], position: u32) -> Option<ClassToken> {
    tokens
        .iter()
        .find(|token| position >= token.range.start && position <= token.range.end)
        .cloned()
}

fn completion_candidates(config: &TailwindConfig, element_tag: &str) -> Vec<CompletionItem> {
    let mut items = Vec::new();

    for variant in RUNTIME_VARIANTS {
        push_completion(
            &mut items,
            &format!("{variant}:"),
            "variant",
            "runtime variant",
            &format!(
                "Apply the following vela-rbxts utility when the {variant} condition matches."
            ),
        );
    }

    for base in base_utility_candidates(config) {
        if is_utility_allowed_on_host(element_tag, &base.label) {
            push_completion_item(&mut items, base.clone());
        }

        for variant in RUNTIME_VARIANTS {
            let label = format!("{variant}:{}", base.label);
            if is_utility_allowed_on_host(element_tag, &label) {
                push_completion(
                    &mut items,
                    &label,
                    &base.category,
                    &base.kind,
                    &format!("Runtime variant of {}. {}", base.label, base.documentation),
                );
            }
        }
    }

    items
}

fn base_utility_candidates(config: &TailwindConfig) -> Vec<CompletionItem> {
    let mut items = Vec::new();

    for (prefix, prop, category) in [
        ("bg", "BackgroundColor3", "color"),
        ("text", "TextColor3", "color"),
        ("image", "ImageColor3", "color"),
        ("placeholder", "PlaceholderColor3", "color"),
    ] {
        for color_key in color_completion_keys(config) {
            push_completion(
                &mut items,
                &format!("{prefix}-{color_key}"),
                category,
                "utility",
                &format!("Set Roblox {prop} from theme color `{color_key}`."),
            );
        }
        push_completion(
            &mut items,
            &format!("{prefix}-transparent"),
            category,
            "utility",
            &format!("Use the transparent keyword for Roblox {prop}."),
        );
    }

    for key in config.theme.radius.keys() {
        push_completion(
            &mut items,
            &format!("rounded-{key}"),
            "radius",
            "utility",
            &format!("Set UICorner.CornerRadius from theme radius `{key}`."),
        );
    }

    let spacing_keys = spacing_completion_keys(config);
    for prefix in ["p", "px", "py", "pt", "pr", "pb", "pl", "gap"] {
        for key in &spacing_keys {
            let target = if prefix == "gap" {
                "UIListLayout.Padding"
            } else {
                "UIPadding"
            };
            push_completion(
                &mut items,
                &format!("{prefix}-{key}"),
                "spacing",
                "utility",
                &format!("Set Roblox {target} from spacing `{key}`."),
            );
        }
    }

    for prefix in ["w", "h", "size"] {
        for key in size_completion_keys(config) {
            push_completion(
                &mut items,
                &format!("{prefix}-{key}"),
                "size",
                "utility",
                &format!("Set Roblox Size using `{prefix}-{key}`."),
            );
        }
    }

    items
}

const RUNTIME_VARIANTS: [&str; 8] = [
    "sm",
    "md",
    "lg",
    "portrait",
    "landscape",
    "touch",
    "mouse",
    "gamepad",
];

fn color_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = Vec::new();
    for (name, color) in &config.theme.colors {
        match color {
            ColorValue::Literal(_) => {
                push_unique(&mut keys, name.clone());
            }
            ColorValue::Palette(scale) => {
                for shade in scale.keys() {
                    push_unique(&mut keys, format!("{name}-{shade}"));
                }
            }
        }
    }
    keys
}

fn spacing_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = config.theme.spacing.keys().cloned().collect::<Vec<_>>();
    for key in [
        "0", "0.5", "1", "1.5", "2", "3", "4", "6", "8", "12", "16", "20", "24", "32", "40", "64",
        "80",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

fn size_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = spacing_completion_keys(config);
    for key in [
        "px", "full", "fit", "1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5", "1/6",
        "5/6", "1/12", "5/12", "11/12",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

fn push_completion(
    items: &mut Vec<CompletionItem>,
    label: &str,
    category: &str,
    kind: &str,
    documentation: &str,
) {
    push_completion_item(
        items,
        CompletionItem {
            label: label.to_owned(),
            insert_text: label.to_owned(),
            kind: kind.to_owned(),
            category: category.to_owned(),
            documentation: documentation.to_owned(),
            replacement: None,
        },
    );
}

fn push_completion_item(items: &mut Vec<CompletionItem>, item: CompletionItem) {
    if !items.iter().any(|existing| existing.label == item.label) {
        items.push(item);
    }
}

fn describe_token(token: &str, config: &TailwindConfig, element_tag: &str) -> Option<HoverContent> {
    let (variants, base_token) = split_variant_prefixes(token)?;
    let variant_prefix = if variants.is_empty() {
        String::new()
    } else {
        format!("Runtime variant `{}`. ", variants.join(":"))
    };

    if !is_utility_allowed_on_host(element_tag, token) {
        return Some(HoverContent {
            display: format!("`{token}`"),
            documentation: format!(
                "{variant_prefix}This utility is not valid on Roblox `{element_tag}` elements."
            ),
        });
    }

    if let Some(color_key) = base_token.strip_prefix("bg-") {
        return describe_color_token(
            token,
            color_key,
            config,
            BACKGROUND_COLOR_FAMILY,
            "BackgroundColor3",
            variant_prefix,
        );
    }
    if let Some(color_key) = base_token.strip_prefix("text-") {
        return describe_color_token(
            token,
            color_key,
            config,
            TEXT_COLOR_FAMILY,
            "TextColor3",
            variant_prefix,
        );
    }
    if let Some(color_key) = base_token.strip_prefix("image-") {
        return describe_color_token(
            token,
            color_key,
            config,
            IMAGE_COLOR_FAMILY,
            "ImageColor3",
            variant_prefix,
        );
    }
    if let Some(color_key) = base_token.strip_prefix("placeholder-") {
        return describe_color_token(
            token,
            color_key,
            config,
            PLACEHOLDER_COLOR_FAMILY,
            "PlaceholderColor3",
            variant_prefix,
        );
    }
    if let Some(radius_key) = base_token.strip_prefix("rounded-") {
        let value = config.theme.radius.get(radius_key)?;
        return Some(HoverContent {
            display: format!("`{token}` -> UICorner.CornerRadius"),
            documentation: format!("{variant_prefix}Sets `UICorner.CornerRadius` to `{value}`."),
        });
    }

    for (prefix, target) in [
        ("p-", "UIPadding"),
        ("px-", "UIPadding.PaddingLeft / PaddingRight"),
        ("py-", "UIPadding.PaddingTop / PaddingBottom"),
        ("pt-", "UIPadding.PaddingTop"),
        ("pr-", "UIPadding.PaddingRight"),
        ("pb-", "UIPadding.PaddingBottom"),
        ("pl-", "UIPadding.PaddingLeft"),
        ("gap-", "UIListLayout.Padding"),
    ] {
        if let Some(spacing_key) = base_token.strip_prefix(prefix) {
            let value = resolve_spacing_value(config, spacing_key)?;
            return Some(HoverContent {
                display: format!("`{token}` -> {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` to `{value}`."),
            });
        }
    }

    for (prefix, target) in [("w-", "Size.X"), ("h-", "Size.Y"), ("size-", "Size")] {
        if let Some(size_key) = base_token.strip_prefix(prefix) {
            if size_key == "fit" {
                return Some(HoverContent {
                    display: format!("`{token}` -> recognized, not lowered"),
                    documentation: format!(
                        "{variant_prefix}`fit` needs Roblox automatic sizing semantics and is not lowered to `Size`."
                    ),
                });
            }

            let mut diagnostics = Vec::new();
            let value = resolve_size_axis_value(config, &mut diagnostics, size_key, base_token)?;
            let resolved = if value.scale == "0" {
                format!("offset {}", value.offset)
            } else if value.offset == "0" {
                format!("scale {}", value.scale)
            } else {
                format!("scale {} plus offset {}", value.scale, value.offset)
            };

            return Some(HoverContent {
                display: format!("`{token}` -> Roblox {target}"),
                documentation: format!("{variant_prefix}Sets `{target}` using {resolved}."),
            });
        }
    }

    None
}

fn describe_color_token(
    token: &str,
    color_key: &str,
    config: &TailwindConfig,
    spec: ColorFamilySpec,
    prop: &str,
    variant_prefix: String,
) -> Option<HoverContent> {
    let mut diagnostics = Vec::new();
    let resolution = resolve_color_value(config, &mut diagnostics, spec, color_key, token)?;
    let documentation = match resolution {
        ColorResolution::Expression(value) => {
            format!("{variant_prefix}Sets `{prop}` to `{value}`.")
        }
        ColorResolution::Transparent => {
            format!("{variant_prefix}Sets the matching Roblox transparency prop for `{prop}`.")
        }
    };

    Some(HoverContent {
        display: format!("`{token}` -> {prop}"),
        documentation,
    })
}

fn split_variant_prefixes(token: &str) -> Option<(Vec<String>, &str)> {
    let mut variants = Vec::new();
    let mut remainder = token;

    while let Some((prefix, next)) = remainder.split_once(':') {
        if parse_runtime_prefix(prefix).is_none() {
            return None;
        }
        variants.push(prefix.to_owned());
        remainder = next;
    }

    Some((variants, remainder))
}

fn host_utility_diagnostic(element_tag: &str, token: &ClassToken) -> Option<EditorDiagnostic> {
    if is_utility_allowed_on_host(element_tag, &token.text) {
        return None;
    }

    Some(EditorDiagnostic {
        level: "warning".to_owned(),
        code: "unsupported-host-utility".to_owned(),
        message: format!(
            "Utility \"{}\" is not valid on Roblox `{element_tag}` elements.",
            token.text
        ),
        token: Some(token.text.clone()),
        range: Some(token.range.clone()),
    })
}

fn is_utility_allowed_on_host(element_tag: &str, token: &str) -> bool {
    let Some((_, base_token)) = split_variant_prefixes(token) else {
        return true;
    };

    if base_token.starts_with("text-") {
        return matches!(element_tag, "textlabel" | "textbutton" | "textbox");
    }

    if base_token.starts_with("image-") {
        return matches!(element_tag, "imagelabel" | "imagebutton");
    }

    if base_token.starts_with("placeholder-") {
        return element_tag == "textbox";
    }

    true
}

fn emit_module(cm: &Lrc<SourceMap>, module: &Module) -> Result<String, String> {
    let mut output = Vec::new();
    {
        let mut emitter = Emitter {
            cfg: CodegenConfig::default(),
            cm: cm.clone(),
            comments: None,
            wr: JsWriter::new(cm.clone(), "\n", &mut output, None),
        };

        emitter
            .emit_module(module)
            .map_err(|error| format!("Failed to emit JS/TSX: {error:?}"))?;
    }

    String::from_utf8(output)
        .map_err(|error| format!("Generated output was not valid UTF-8: {error}"))
}

fn collapse_class_value_expr(
    expr: &Expr,
    scopes: &ClassValueScopeStack,
) -> ClassValueCollapse {
    match expr {
        Expr::Paren(ParenExpr { expr, .. }) => collapse_class_value_expr(expr, scopes),
        Expr::Lit(Lit::Str(value)) => ClassValueCollapse::static_only(
            tokenize_class_name(&value.value.to_string_lossy())
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
        Expr::Lit(Lit::Bool(_)) | Expr::Lit(Lit::Null(_)) => ClassValueCollapse::default(),
        Expr::Ident(ident) if ident.sym == "undefined" => ClassValueCollapse::default(),
        Expr::Ident(ident) if scopes.resolve(ident).is_some() => ClassValueCollapse::default(),
        Expr::Unary(UnaryExpr {
            op: UnaryOp::Bang,
            arg,
            ..
        }) => {
            if evaluate_constant_truthiness(arg, scopes).is_some() {
                ClassValueCollapse::default()
            } else {
                ClassValueCollapse::dynamic(Box::new(expr.clone()))
            }
        }
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalAnd,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(true) => collapse_class_value_expr(right, scopes),
            Some(false) => ClassValueCollapse::default(),
            None => ClassValueCollapse::dynamic(Box::new(Expr::Bin(BinExpr {
                span: DUMMY_SP,
                op: BinaryOp::LogicalAnd,
                left: collapse_class_value_expr(left, scopes).into_expr(),
                right: collapse_class_value_expr(right, scopes).into_expr(),
            }))),
        },
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalOr,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(true) => ClassValueCollapse::default(),
            Some(false) => collapse_class_value_expr(right, scopes),
            None => ClassValueCollapse::dynamic(Box::new(Expr::Bin(BinExpr {
                span: DUMMY_SP,
                op: BinaryOp::LogicalOr,
                left: collapse_class_value_expr(left, scopes).into_expr(),
                right: collapse_class_value_expr(right, scopes).into_expr(),
            }))),
        },
        Expr::Cond(CondExpr {
            test,
            cons,
            alt,
            ..
        }) => match evaluate_constant_truthiness(test, scopes) {
            Some(true) => collapse_class_value_expr(cons, scopes),
            Some(false) => collapse_class_value_expr(alt, scopes),
            None => ClassValueCollapse::dynamic(Box::new(Expr::Cond(CondExpr {
                span: DUMMY_SP,
                test: test.clone(),
                cons: collapse_class_value_expr(cons, scopes).into_expr(),
                alt: collapse_class_value_expr(alt, scopes).into_expr(),
            }))),
        },
        Expr::Array(ArrayLit { elems, .. }) => {
            let mut static_tokens = Vec::new();
            let mut dynamic_elems = Vec::new();

            for elem in elems.iter().flatten() {
                if elem.spread.is_some() {
                    dynamic_elems.push(elem.clone());
                    continue;
                }

                let collapse = collapse_class_value_expr(&elem.expr, scopes);
                static_tokens.extend(collapse.static_tokens);

                if let Some(dynamic_expr) = collapse.dynamic_expr {
                    dynamic_elems.push(ExprOrSpread {
                        spread: None,
                        expr: dynamic_expr,
                    });
                }
            }

            if dynamic_elems.is_empty() {
                ClassValueCollapse::static_only(static_tokens)
            } else {
                let dynamic_expr = if dynamic_elems.len() == 1 {
                    dynamic_elems
                        .into_iter()
                        .next()
                        .expect("at least one dynamic array element")
                        .expr
                } else {
                    Box::new(Expr::Array(ArrayLit {
                        span: DUMMY_SP,
                        elems: dynamic_elems.into_iter().map(Some).collect(),
                    }))
                };

                ClassValueCollapse {
                    static_tokens,
                    dynamic_expr: Some(dynamic_expr),
                }
            }
        }
        Expr::Object(ObjectLit { props, .. }) => {
            let mut static_tokens = Vec::new();
            let mut dynamic_props = Vec::new();

            for prop in props {
                match prop {
                    PropOrSpread::Prop(prop) => match &**prop {
                        Prop::KeyValue(KeyValueProp { key, value }) => {
                            let Some(class_key) = static_object_key(key) else {
                                dynamic_props.push(PropOrSpread::Prop(prop.clone()));
                                continue;
                            };

                            if let Some(truthy) = evaluate_constant_truthiness(value, scopes) {
                                if truthy {
                                    static_tokens.extend(
                                        tokenize_class_name(&class_key)
                                            .into_iter()
                                            .map(str::to_owned),
                                    );
                                }
                                continue;
                            }

                            let reduced_value = collapse_class_value_expr(value, scopes);
                            if let Some(dynamic_expr) = reduced_value.dynamic_expr {
                                dynamic_props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(
                                    KeyValueProp {
                                        key: key.clone(),
                                        value: dynamic_expr,
                                    },
                                ))));
                            }
                        }
                        _ => dynamic_props.push(PropOrSpread::Prop(prop.clone())),
                    },
                    PropOrSpread::Spread(spread) => {
                        dynamic_props.push(PropOrSpread::Spread(spread.clone()))
                    }
                }
            }

            if dynamic_props.is_empty() {
                ClassValueCollapse::static_only(static_tokens)
            } else {
                ClassValueCollapse {
                    static_tokens,
                    dynamic_expr: Some(Box::new(Expr::Object(ObjectLit {
                        span: DUMMY_SP,
                        props: dynamic_props,
                    }))),
                }
            }
        }
        _ => ClassValueCollapse::dynamic(Box::new(expr.clone())),
    }
}

fn evaluate_constant_truthiness(expr: &Expr, scopes: &ClassValueScopeStack) -> Option<bool> {
    match expr {
        Expr::Paren(ParenExpr { expr, .. }) => evaluate_constant_truthiness(expr, scopes),
        Expr::Lit(Lit::Bool(value)) => Some(value.value),
        Expr::Lit(Lit::Null(_)) => Some(false),
        Expr::Lit(Lit::Str(value)) => Some(!value.value.is_empty()),
        Expr::Array(_) | Expr::Object(_) => Some(true),
        Expr::Ident(ident) if ident.sym == "undefined" => Some(false),
        Expr::Ident(ident) => scopes.resolve(ident),
        Expr::Unary(UnaryExpr {
            op: UnaryOp::Bang,
            arg,
            ..
        }) => evaluate_constant_truthiness(arg, scopes).map(|value| !value),
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalAnd,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(false) => Some(false),
            Some(true) => evaluate_constant_truthiness(right, scopes),
            None => None,
        },
        Expr::Bin(BinExpr {
            op: BinaryOp::LogicalOr,
            left,
            right,
            ..
        }) => match evaluate_constant_truthiness(left, scopes) {
            Some(true) => Some(true),
            Some(false) => evaluate_constant_truthiness(right, scopes),
            None => None,
        },
        Expr::Cond(CondExpr {
            test, cons, alt, ..
        }) => match evaluate_constant_truthiness(test, scopes) {
            Some(true) => evaluate_constant_truthiness(cons, scopes),
            Some(false) => evaluate_constant_truthiness(alt, scopes),
            None => None,
        },
        _ => None,
    }
}

fn static_object_key(key: &PropName) -> Option<String> {
    match key {
        PropName::Str(value) => Some(value.value.to_string_lossy().into_owned()),
        PropName::Ident(ident) => Some(ident.sym.to_string()),
        _ => None,
    }
}

impl VisitMut for TailwindTransformer {
    fn visit_mut_module(&mut self, module: &mut Module) {
        self.class_value_scopes.push();
        module.visit_mut_children_with(self);
        self.class_value_scopes.pop();

        if self.runtime_import_needed {
            let mut runtime_items = create_runtime_host_module_items(&self.config);
            runtime_items.append(&mut module.body);
            module.body = runtime_items;
        }
    }

    fn visit_mut_block_stmt(&mut self, block: &mut BlockStmt) {
        self.class_value_scopes.push();
        block.visit_mut_children_with(self);
        self.class_value_scopes.pop();
    }

    fn visit_mut_var_decl(&mut self, var_decl: &mut VarDecl) {
        for declarator in &mut var_decl.decls {
            declarator.visit_mut_with(self);

            if var_decl.kind != VarDeclKind::Const {
                continue;
            }

            let Some(init) = declarator.init.as_deref() else {
                continue;
            };

            let Some(value) = evaluate_constant_truthiness(init, &self.class_value_scopes) else {
                continue;
            };

            let Pat::Ident(binding) = &declarator.name else {
                continue;
            };

            self.class_value_scopes
                .insert(binding.id.sym.to_string(), value);
        }
    }

    fn visit_mut_jsx_element(&mut self, element: &mut JSXElement) {
        element.visit_mut_children_with(self);

        if !is_supported_host_element(&element.opening.name) {
            return;
        }

        let Some(lowered) =
            lower_class_name(
                &element.opening.attrs,
                &self.config,
                &self.class_value_scopes,
                &mut self.diagnostics,
            )
        else {
            return;
        };

        self.changed = true;
        self.ir.push(lowered.style_ir.clone());

        let mut attrs = lowered.preserved_attrs;
        if let Some(runtime_class_name) = lowered.runtime_class_name {
            attrs.push(JSXAttrOrSpread::JSXAttr(runtime_class_name));
        }

        let helper_children = lowered
            .style_ir
            .base
            .helpers
            .into_iter()
            .map(create_helper_child)
            .collect::<Vec<_>>();

        if lowered.needs_runtime_host {
            self.runtime_import_needed = true;
            attrs.extend(
                lowered
                    .style_ir
                    .base
                    .props
                    .into_iter()
                    .map(create_prop_attr),
            );
            if !lowered.style_ir.runtime_rules.is_empty() {
                attrs.push(create_prop_attr(PropEntry {
                    name: "__rbxtsTailwindRules",
                    value: serde_json::to_string(&lowered.style_ir.runtime_rules)
                        .expect("runtime rules must serialize to JSON"),
                }));
            }
            attrs.push(create_prop_attr(PropEntry {
                name: "__rbxtsTailwindTag",
                value: format!("\"{}\"", element_tag_name(&element.opening.name)),
            }));
            element.opening.name = JSXElementName::Ident(Ident::new_no_ctxt(
                "RbxtsTailwindRuntimeHost".into(),
                DUMMY_SP,
            ));
        } else {
            attrs.extend(
                lowered
                    .style_ir
                    .base
                    .props
                    .into_iter()
                    .map(create_prop_attr),
            );
        }

        element.opening.attrs = attrs;

        if element.opening.self_closing && helper_children.is_empty() {
            return;
        }

        if element.opening.self_closing {
            element.opening.self_closing = false;
            element.closing = Some(JSXClosingElement {
                span: DUMMY_SP,
                name: element.opening.name.clone(),
            });
            element.children = helper_children;
            return;
        }

        if helper_children.is_empty() {
            return;
        }

        let existing_children = std::mem::take(&mut element.children);
        element.children = helper_children
            .into_iter()
            .chain(existing_children)
            .collect();
    }
}

fn lower_class_name(
    attrs: &[JSXAttrOrSpread],
    config: &TailwindConfig,
    scopes: &ClassValueScopeStack,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<LoweredClassName> {
    let class_name_attr = attrs.iter().find_map(|attr| match attr {
        JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name) => Some(attr),
        _ => None,
    })?;

    let preserved_attrs = attrs
        .iter()
        .filter(|attr| {
            !matches!(
                attr,
                JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name)
            )
        })
        .cloned()
        .collect();

    match &class_name_attr.value {
        Some(JSXAttrValue::Str(value)) => {
            let class_name = value.value.to_string_lossy().into_owned();
            let style = resolve_class_tokens(
                tokenize_class_name(&class_name).into_iter().map(str::to_owned),
                config,
                diagnostics,
            );
            let needs_runtime_host = !style.runtime_rules.is_empty() || style.runtime_class_value;

            Some(LoweredClassName {
                style_ir: style,
                preserved_attrs,
                runtime_class_name: None,
                needs_runtime_host,
            })
        }
        Some(JSXAttrValue::JSXExprContainer(container)) => {
            let JSXExpr::Expr(expr) = &container.expr else {
                return Some(LoweredClassName {
                    style_ir: StyleIr {
                        base: StyleEffectBundle::default(),
                        runtime_rules: Vec::new(),
                        runtime_class_value: true,
                    },
                    preserved_attrs,
                    runtime_class_name: Some(class_name_attr.clone()),
                    needs_runtime_host: true,
                });
            };

            let collapse = collapse_class_value_expr(expr, scopes);
            let runtime_class_value = collapse.is_dynamic();
            let style = resolve_class_tokens(
                collapse.static_tokens.clone(),
                config,
                diagnostics,
            );
            let needs_runtime_host = !style.runtime_rules.is_empty() || runtime_class_value;
            let runtime_class_name = collapse.dynamic_expr.map(|expr| {
                let mut runtime_attr = class_name_attr.clone();
                runtime_attr.value = Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                    span: container.span,
                    expr: JSXExpr::Expr(expr),
                }));
                runtime_attr
            });

            Some(LoweredClassName {
                style_ir: StyleIr {
                    runtime_class_value,
                    ..style
                },
                preserved_attrs,
                runtime_class_name,
                needs_runtime_host,
            })
        }
        _ => Some(LoweredClassName {
            style_ir: StyleIr {
                base: StyleEffectBundle::default(),
                runtime_rules: Vec::new(),
                runtime_class_value: true,
            },
            preserved_attrs,
            runtime_class_name: Some(class_name_attr.clone()),
            needs_runtime_host: true,
        }),
    }
}

fn resolve_class_tokens<T, I>(
    tokens: I,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr
where
    I: IntoIterator<Item = T>,
    T: AsRef<str>,
{
    let mut style = StyleIr::default();
    let mut pending_size_width: Option<SizeAxisValue> = None;
    let mut pending_size_height: Option<SizeAxisValue> = None;

    for token in tokens {
        let token = token.as_ref();
        if let Some((condition, runtime_token)) = parse_runtime_variant_token(token) {
            let runtime_style = resolve_class_tokens(vec![runtime_token], config, diagnostics);
            if !runtime_style.base.props.is_empty() || !runtime_style.base.helpers.is_empty() {
                style.runtime_rules.push(RuntimeRule {
                    condition,
                    effects: runtime_style.base,
                });
            }
            continue;
        }

        if let Some(color_key) = token.strip_prefix("bg-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                BACKGROUND_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(color_key) = token.strip_prefix("text-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                TEXT_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(color_key) = token.strip_prefix("image-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                IMAGE_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(color_key) = token.strip_prefix("placeholder-") {
            apply_color_utility(
                &mut style,
                config,
                diagnostics,
                PLACEHOLDER_COLOR_FAMILY,
                color_key,
                token,
            );
            continue;
        }

        if let Some(radius_key) = token.strip_prefix("rounded-") {
            if let Some(value) = config.theme.radius.get(radius_key) {
                style.set_helper_prop("uicorner", "CornerRadius", value.clone());
            } else {
                diagnostics.push(unknown_theme_key_diagnostic("radius", radius_key, token));
            }
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("p-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                    style.set_helper_prop("uipadding", "PaddingRight", value.clone());
                    style.set_helper_prop("uipadding", "PaddingBottom", value.clone());
                    style.set_helper_prop("uipadding", "PaddingLeft", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("px-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingLeft", value.clone());
                    style.set_helper_prop("uipadding", "PaddingRight", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("py-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingTop", value.clone());
                    style.set_helper_prop("uipadding", "PaddingBottom", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pt-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingTop", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pr-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingRight", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pb-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingBottom", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("pl-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uipadding", "PaddingLeft", value);
                },
            );
            continue;
        }

        if let Some(spacing_key) = token.strip_prefix("gap-") {
            apply_spacing_utility(
                &mut style,
                config,
                diagnostics,
                spacing_key,
                token,
                |style, value| {
                    style.set_helper_prop("uilistlayout", "Padding", value);
                },
            );
            continue;
        }

        if let Some(size_key) = token.strip_prefix("w-") {
            pending_size_width = resolve_size_axis_value(config, diagnostics, size_key, token);
            continue;
        }

        if let Some(size_key) = token.strip_prefix("h-") {
            pending_size_height = resolve_size_axis_value(config, diagnostics, size_key, token);
            continue;
        }

        if let Some(size_key) = token.strip_prefix("size-") {
            let value = resolve_size_axis_value(config, diagnostics, size_key, token);
            pending_size_width = value.clone();
            pending_size_height = value;
            continue;
        }

        diagnostics.push(unsupported_utility_family_diagnostic(token));
    }

    if pending_size_width.is_some() || pending_size_height.is_some() {
        style.set_prop(
            "Size",
            format_size_prop(pending_size_width, pending_size_height),
        );
    }

    style
}

fn parse_runtime_variant_token(token: &str) -> Option<(RuntimeCondition, &str)> {
    let mut prefixes = Vec::new();
    let mut remainder = token;

    while let Some((prefix, next)) = remainder.split_once(':') {
        let condition = parse_runtime_prefix(prefix)?;
        prefixes.push(condition);
        remainder = next;
    }

    if prefixes.is_empty() {
        return None;
    }

    let condition = if prefixes.len() == 1 {
        prefixes.into_iter().next().unwrap()
    } else {
        RuntimeCondition::All {
            conditions: prefixes,
        }
    };

    Some((condition, remainder))
}

fn parse_runtime_prefix(prefix: &str) -> Option<RuntimeCondition> {
    match prefix {
        "sm" => Some(RuntimeCondition::Width {
            alias: "sm".to_owned(),
            min_width: 640,
            max_width: None,
        }),
        "md" => Some(RuntimeCondition::Width {
            alias: "md".to_owned(),
            min_width: 768,
            max_width: None,
        }),
        "lg" => Some(RuntimeCondition::Width {
            alias: "lg".to_owned(),
            min_width: 1024,
            max_width: None,
        }),
        "portrait" => Some(RuntimeCondition::Orientation {
            value: "portrait".to_owned(),
        }),
        "landscape" => Some(RuntimeCondition::Orientation {
            value: "landscape".to_owned(),
        }),
        "touch" => Some(RuntimeCondition::Input {
            value: "touch".to_owned(),
        }),
        "mouse" => Some(RuntimeCondition::Input {
            value: "mouse".to_owned(),
        }),
        "gamepad" => Some(RuntimeCondition::Input {
            value: "gamepad".to_owned(),
        }),
        _ => None,
    }
}

fn apply_spacing_utility(
    style: &mut StyleIr,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
    apply: impl FnOnce(&mut StyleIr, String),
) {
    if let Some(value) = resolve_spacing_value(config, spacing_key) {
        apply(style, value);
        return;
    }

    diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
}

fn resolve_size_axis_value(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    size_key: &str,
    token: &str,
) -> Option<SizeAxisValue> {
    if size_key == "px" {
        return Some(SizeAxisValue::offset("1"));
    }

    if size_key == "full" {
        return Some(SizeAxisValue::scale("1"));
    }

    if size_key == "fit" {
        diagnostics.push(unsupported_size_mode_diagnostic(size_key, token));
        return None;
    }

    if let Some(fraction) = resolve_size_fraction_scale(size_key) {
        return Some(SizeAxisValue::scale(fraction));
    }

    resolve_size_spacing_offset(config, diagnostics, size_key, token).map(SizeAxisValue::offset)
}

fn resolve_size_spacing_offset(
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
    spacing_key: &str,
    token: &str,
) -> Option<String> {
    let Some(value) = resolve_spacing_value(config, spacing_key) else {
        diagnostics.push(unknown_theme_key_diagnostic("spacing", spacing_key, token));
        return None;
    };

    if let Some(offset) = spacing_value_to_offset(&value) {
        return Some(offset);
    }

    diagnostics.push(unsupported_size_spacing_value_diagnostic(&value, token));
    None
}

fn resolve_size_fraction_scale(key: &str) -> Option<String> {
    let (numerator, denominator) = key.split_once('/')?;
    let numerator = numerator.parse::<u32>().ok()?;
    let denominator = denominator.parse::<u32>().ok()?;

    let is_supported = match denominator {
        2 => numerator == 1,
        3 => matches!(numerator, 1 | 2),
        4 => matches!(numerator, 1 | 3),
        5 => matches!(numerator, 1 | 2 | 3 | 4),
        6 => matches!(numerator, 1 | 5),
        12 => (1..=11).contains(&numerator),
        _ => false,
    };

    if !is_supported {
        return None;
    }

    Some(format_fraction_scale(numerator, denominator))
}

fn format_size_prop(width: Option<SizeAxisValue>, height: Option<SizeAxisValue>) -> String {
    let width = width.unwrap_or_else(SizeAxisValue::zero);
    let height = height.unwrap_or_else(SizeAxisValue::zero);

    if width.scale == "0" && height.scale == "0" {
        return format!("UDim2.fromOffset({}, {})", width.offset, height.offset);
    }

    if width.offset == "0" && height.offset == "0" {
        return format!("UDim2.fromScale({}, {})", width.scale, height.scale);
    }

    format!(
        "UDim2.new({}, {}, {}, {})",
        width.scale, width.offset, height.scale, height.offset
    )
}

fn resolve_spacing_value(config: &TailwindConfig, key: &str) -> Option<String> {
    config
        .theme
        .spacing
        .get(key)
        .cloned()
        .or_else(|| resolve_numeric_spacing_value(key))
}

fn resolve_numeric_spacing_value(key: &str) -> Option<String> {
    if matches!(key.as_bytes().first(), Some(b'-') | Some(b'+')) {
        return None;
    }

    let numeric_key = key.parse::<f64>().ok()?;
    if !numeric_key.is_finite() || numeric_key < 0.0 {
        return None;
    }

    let half_step_units = numeric_key * 2.0;
    if !half_step_units.is_finite() || !is_whole_number(half_step_units) {
        return None;
    }

    let offset_px = numeric_key * 4.0;
    if !offset_px.is_finite() {
        return None;
    }

    Some(format!("new UDim(0, {})", format_spacing_offset(offset_px)))
}

fn spacing_value_to_offset(value: &str) -> Option<String> {
    let args = value.trim().strip_prefix("new UDim(")?.strip_suffix(')')?;

    let mut parts = args.split(',');
    let scale = parts.next()?.trim().parse::<f64>().ok()?;
    let offset = parts.next()?.trim().parse::<f64>().ok()?;
    if parts.next().is_some() || !scale.is_finite() || !offset.is_finite() {
        return None;
    }

    if scale.abs() >= 1e-9 {
        return None;
    }

    Some(format_spacing_offset(offset))
}

fn is_whole_number(value: f64) -> bool {
    let rounded = value.round();
    (value - rounded).abs() < 1e-9
}

fn format_spacing_offset(value: f64) -> String {
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    value.to_string()
}

fn format_fraction_scale(numerator: u32, denominator: u32) -> String {
    let value = numerator as f64 / denominator as f64;
    let rounded = value.round();
    if (value - rounded).abs() < 1e-9 {
        return format!("{rounded:.0}");
    }

    format!("{value:.10}")
        .trim_end_matches('0')
        .trim_end_matches('.')
        .to_owned()
}

fn create_prop_attr(prop: PropEntry) -> JSXAttrOrSpread {
    JSXAttrOrSpread::JSXAttr(JSXAttr {
        span: DUMMY_SP,
        name: JSXAttrName::Ident(IdentName::new(prop.name.into(), DUMMY_SP)),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            span: DUMMY_SP,
            expr: JSXExpr::Expr(parse_expression(&prop.value)),
        })),
    })
}

fn create_runtime_host_module_items(config: &TailwindConfig) -> Vec<ModuleItem> {
    let config_json = serde_json::to_string(config).expect("runtime config must serialize to JSON");
    parse_module_items(&format!(
        r#"import {{ createTailwindRuntimeHost }} from "@vela-rbxts/runtime";
const RbxtsTailwindRuntimeHost = createTailwindRuntimeHost({config_json});"#
    ))
}

fn create_runtime_import_declaration() -> ModuleDecl {
    ModuleDecl::Import(ImportDecl {
        span: DUMMY_SP,
        specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
            span: DUMMY_SP,
            local: Ident::new_no_ctxt("createTailwindRuntimeHost".into(), DUMMY_SP),
            imported: None,
            is_type_only: false,
        })],
        src: Box::new(Str {
            span: DUMMY_SP,
            value: "@vela-rbxts/runtime".into(),
            raw: None,
        }),
        type_only: false,
        with: None,
        phase: Default::default(),
    })
}

fn parse_module_items(source: &str) -> Vec<ModuleItem> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Anon.into(), source.to_owned());
    let mut recovered_errors = Vec::new();

    match parse_file_as_module(
        &fm,
        Syntax::Typescript(TsSyntax {
            decorators: true,
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    ) {
        Ok(module) if recovered_errors.is_empty() => module.body,
        _ => vec![ModuleItem::ModuleDecl(create_runtime_import_declaration())],
    }
}

fn element_tag_name(name: &JSXElementName) -> String {
    match name {
        JSXElementName::Ident(ident) => ident.sym.to_string(),
        _ => "frame".to_owned(),
    }
}

fn create_helper_child(helper: HelperEntry) -> JSXElementChild {
    JSXElementChild::JSXElement(Box::new(JSXElement {
        span: DUMMY_SP,
        opening: JSXOpeningElement {
            name: JSXElementName::Ident(Ident::new_no_ctxt(helper.tag.into(), DUMMY_SP)),
            span: DUMMY_SP,
            attrs: helper.props.into_iter().map(create_prop_attr).collect(),
            self_closing: true,
            type_args: None,
        },
        children: vec![],
        closing: None,
    }))
}

fn parse_expression(value: &str) -> Box<Expr> {
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Anon.into(), value.to_owned());
    let mut recovered_errors = Vec::new();

    match parse_file_as_expr(
        &fm,
        Syntax::Typescript(TsSyntax {
            tsx: false,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    ) {
        Ok(expr) if recovered_errors.is_empty() => expr,
        _ => Box::new(Expr::Lit(swc_core::ecma::ast::Lit::Str(Str {
            span: DUMMY_SP,
            value: value.into(),
            raw: None,
        }))),
    }
}

fn tokenize_class_name(input: &str) -> Vec<&str> {
    input
        .split_whitespace()
        .filter(|token| !token.is_empty())
        .collect()
}

fn is_class_name_attr(name: &JSXAttrName) -> bool {
    matches!(name, JSXAttrName::Ident(ident) if ident.sym == "className")
}

fn is_supported_host_element(name: &JSXElementName) -> bool {
    matches!(
        name,
        JSXElementName::Ident(ident)
            if matches!(
                ident.sym.as_ref(),
                "frame"
                    | "scrollingframe"
                    | "canvasgroup"
                    | "textlabel"
                    | "textbutton"
                    | "textbox"
                    | "imagelabel"
                    | "imagebutton"
            )
    )
}

fn parse_config(config_json: Option<&str>) -> TailwindConfig {
    config_json
        .and_then(parse_config_json)
        .unwrap_or_else(default_config)
}

fn parse_config_json(value: &str) -> Option<TailwindConfig> {
    serde_json::from_str::<TailwindConfig>(value)
        .ok()
        .or_else(|| {
            serde_json::from_str::<TailwindConfigInput>(value)
                .ok()
                .map(|input| resolve_config_input(input, default_config_ref()))
        })
}

fn default_config() -> TailwindConfig {
    default_config_ref().clone()
}

fn default_config_ref() -> &'static TailwindConfig {
    DEFAULT_CONFIG.get_or_init(|| {
        serde_json::from_str::<TailwindConfig>(DEFAULT_CONFIG_JSON)
            .or_else(|_| {
                serde_json::from_str::<TailwindConfigInput>(DEFAULT_CONFIG_JSON)
                    .map(|input| resolve_config_input(input, &TailwindConfig::default()))
            })
            .expect(
                "packages/config/src/defaults.json must be valid TailwindConfig-compatible JSON",
            )
    })
}

fn resolve_config_input(input: TailwindConfigInput, base: &TailwindConfig) -> TailwindConfig {
    let Some(theme) = input.theme else {
        return base.clone();
    };

    let extend = theme.extend.unwrap_or_default();

    TailwindConfig {
        theme: ThemeConfig {
            colors: resolve_color_input(
                &base.theme.colors,
                extend.colors.as_ref(),
                theme.colors.as_ref(),
            ),
            radius: resolve_theme_scale(
                &base.theme.radius,
                extend.radius.as_ref(),
                theme.radius.as_ref(),
            ),
            spacing: resolve_theme_scale(
                &base.theme.spacing,
                extend.spacing.as_ref(),
                theme.spacing.as_ref(),
            ),
        },
    }
}

fn resolve_color_input(
    base: &ThemeColors,
    extend: Option<&ColorInputMap>,
    override_colors: Option<&ColorInputMap>,
) -> ThemeColors {
    let merged_defaults = merge_color_registry(base, extend);

    override_colors
        .map(normalize_color_registry)
        .unwrap_or(merged_defaults)
}

fn merge_color_registry(base: &ThemeColors, extend: Option<&ColorInputMap>) -> ThemeColors {
    let mut merged = base.clone();

    let Some(extend) = extend else {
        return merged;
    };

    for (name, value) in extend {
        let next = if let Some(base_value) = merged.get(name).cloned() {
            merge_color_values(base_value, value)
        } else {
            normalize_color_value(value)
        };

        if let Some(color) = next {
            merged.insert(name.clone(), color);
        }
    }

    merged
}

fn normalize_color_registry(colors: &ColorInputMap) -> ThemeColors {
    colors
        .iter()
        .filter_map(|(name, value)| normalize_color_value(value).map(|scale| (name.clone(), scale)))
        .collect()
}

fn normalize_color_value(value: &ColorValue) -> Option<ColorValue> {
    match value {
        ColorValue::Literal(color) => Some(ColorValue::Literal(color.clone())),
        ColorValue::Palette(scale) if scale.is_empty() => None,
        ColorValue::Palette(scale) => Some(ColorValue::Palette(scale.clone())),
    }
}

fn merge_color_values(base: ColorValue, value: &ColorValue) -> Option<ColorValue> {
    match (base, value) {
        (ColorValue::Literal(_), ColorValue::Literal(color)) => {
            Some(ColorValue::Literal(color.clone()))
        }
        (ColorValue::Literal(_), ColorValue::Palette(scale)) => {
            Some(ColorValue::Palette(scale.clone()))
        }
        (ColorValue::Palette(_), ColorValue::Literal(color)) => {
            Some(ColorValue::Literal(color.clone()))
        }
        (ColorValue::Palette(mut base_scale), ColorValue::Palette(scale)) => {
            for (shade, color) in scale {
                base_scale.insert(shade.clone(), color.clone());
            }

            Some(ColorValue::Palette(base_scale))
        }
    }
}

fn resolve_theme_scale(
    base: &ThemeScale,
    extend: Option<&ThemeScale>,
    override_scale: Option<&ThemeScale>,
) -> ThemeScale {
    if let Some(override_scale) = override_scale {
        return override_scale.clone();
    }

    let mut merged = base.clone();

    if let Some(extend) = extend {
        merged.extend(extend.clone());
    }

    merged
}

fn unsupported_utility_family_diagnostic(token: &str) -> Diagnostic {
    let family = token
        .split_once('-')
        .map(|(family, _)| family)
        .unwrap_or(token);

    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-utility-family".to_owned(),
        message: format!("Unsupported utility family \"{family}\" in className literal."),
        token: Some(token.to_owned()),
    }
}

fn unknown_theme_key_diagnostic(theme_family: &str, key: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unknown-theme-key".to_owned(),
        message: format!(
            "Unknown theme key \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

fn unsupported_size_spacing_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-size-spacing-value".to_owned(),
        message: format!(
            "Spacing value \"{value}\" for size utility must be an offset-only UDim expression."
        ),
        token: Some(token.to_owned()),
    }
}

fn unsupported_size_mode_diagnostic(mode: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-size-mode".to_owned(),
        message: format!(
            "Size mode \"{mode}\" needs Roblox automatic sizing semantics and is not lowered to Size."
        ),
        token: Some(token.to_owned()),
    }
}

#[cfg(target_arch = "wasm32")]
fn parse_wasm_transform_options(options: JsValue) -> Result<Option<TransformOptions>, JsValue> {
    if options.is_null() || options.is_undefined() {
        return Ok(None);
    }

    serde_wasm_bindgen::from_value(options)
        .map(Some)
        .map_err(|error| {
            JsValue::from_str(&format!(
                "Failed to deserialize transform options from wasm input: {error}"
            ))
        })
}
