#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

use swc_core::{
    common::{sync::Lrc, FileName, SourceMap, DUMMY_SP},
    ecma::{
        ast::{
            Expr, Ident, IdentName, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue,
            JSXClosingElement, JSXElement, JSXElementChild, JSXElementName, JSXExpr,
            JSXExprContainer, JSXOpeningElement, Module, Str,
        },
        codegen::{text_writer::JsWriter, Config as CodegenConfig, Emitter},
        parser::{parse_file_as_expr, parse_file_as_module, Syntax, TsSyntax},
        visit::{VisitMut, VisitMutWith},
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
pub fn transform(
    source: String,
    options: Option<TransformOptions>,
) -> TransformResult {
    transform_impl(source, options)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(js_name = transform)]
pub fn transform(source: String, options: JsValue) -> Result<JsValue, JsValue> {
    let options = parse_wasm_transform_options(options)?;
    let result = transform_impl(source, options);
    serde_wasm_bindgen::to_value(&result)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize transform result: {error}")))
}

#[derive(Clone, Deserialize)]
struct TailwindConfig {
    #[serde(default = "default_theme")]
    theme: ThemeConfig,
}

#[derive(Clone, Deserialize)]
struct ThemeConfig {
    #[serde(default = "default_surface")]
    colors: ThemeColors,
    #[serde(default = "default_radius")]
    radius: ThemeRadius,
    #[serde(default = "default_spacing")]
    spacing: ThemeSpacing,
}

#[derive(Clone, Deserialize)]
struct ThemeColors {
    #[serde(default = "default_surface_value")]
    surface: String,
}

#[derive(Clone, Deserialize)]
struct ThemeRadius {
    #[serde(default = "default_radius_md")]
    md: String,
}

#[derive(Clone, Deserialize)]
struct ThemeSpacing {
    #[serde(rename = "4", default = "default_spacing_4")]
    four: String,
}

#[derive(Clone, Deserialize)]
struct TailwindDefaultsDocument {
    theme: ThemeDefaultsDocument,
}

#[derive(Clone, Deserialize)]
struct ThemeDefaultsDocument {
    colors: ThemeColorsDefaultsDocument,
    radius: ThemeRadiusDefaultsDocument,
    spacing: ThemeSpacingDefaultsDocument,
}

#[derive(Clone, Deserialize)]
struct ThemeColorsDefaultsDocument {
    surface: String,
}

#[derive(Clone, Deserialize)]
struct ThemeRadiusDefaultsDocument {
    md: String,
}

#[derive(Clone, Deserialize)]
struct ThemeSpacingDefaultsDocument {
    #[serde(rename = "4")]
    four: String,
}

const DEFAULT_CONFIG_JSON: &str = include_str!("../../config/src/defaults.json");
static DEFAULT_CONFIG: OnceLock<TailwindConfig> = OnceLock::new();

#[derive(Clone)]
struct PropEntry {
    name: &'static str,
    value: String,
}

#[derive(Clone)]
struct HelperEntry {
    tag: &'static str,
    props: Vec<PropEntry>,
}

#[derive(Default)]
struct StyleIr {
    props: Vec<PropEntry>,
    helpers: Vec<HelperEntry>,
}

struct TailwindTransformer {
    changed: bool,
    config: TailwindConfig,
    diagnostics: Vec<Diagnostic>,
}

struct LoweredClassName {
    props: Vec<PropEntry>,
    helpers: Vec<HelperEntry>,
    preserved_attrs: Vec<JSXAttrOrSpread>,
}

fn transform_impl(source: String, options: Option<TransformOptions>) -> TransformResult {
    let config = parse_config(options.as_ref().and_then(|value| value.config_json.as_deref()));
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
        };
    }

    let mut transformer = TailwindTransformer {
        changed: false,
        config,
        diagnostics: Vec::new(),
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
    }
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

    String::from_utf8(output).map_err(|error| format!("Generated output was not valid UTF-8: {error}"))
}

impl VisitMut for TailwindTransformer {
    fn visit_mut_jsx_element(&mut self, element: &mut JSXElement) {
        element.visit_mut_children_with(self);

        if !is_frame_name(&element.opening.name) {
            return;
        }

        let Some(lowered) = lower_class_name(
            &element.opening.attrs,
            &self.config,
            &mut self.diagnostics,
        ) else {
            return;
        };

        self.changed = true;
        element.opening.attrs = lowered
            .preserved_attrs
            .into_iter()
            .chain(lowered.props.into_iter().map(create_prop_attr))
            .collect();

        let helper_children = lowered
            .helpers
            .into_iter()
            .map(create_helper_child)
            .collect::<Vec<_>>();

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
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<LoweredClassName> {
    let class_name_attr = attrs.iter().find_map(|attr| match attr {
        JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name) => Some(attr),
        _ => None,
    })?;

    let class_name = match &class_name_attr.value {
        Some(JSXAttrValue::Str(value)) => value.value.to_string_lossy().into_owned(),
        _ => {
            diagnostics.push(Diagnostic {
                level: "warning".to_owned(),
                code: "unsupported-classname-expression".to_owned(),
                message: "Only className string literals are supported in this compiler slice."
                    .to_owned(),
                token: None,
            });
            return None;
        }
    };

    let style = resolve_class_tokens(tokenize_class_name(&class_name), config, diagnostics);
    if style.props.is_empty() && style.helpers.is_empty() {
        return None;
    }

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

    Some(LoweredClassName {
        props: style.props,
        helpers: style.helpers,
        preserved_attrs,
    })
}

fn resolve_class_tokens(
    tokens: Vec<&str>,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr {
    let mut style = StyleIr::default();

    for token in tokens {
        match token {
            "rounded-md" => style.helpers.push(HelperEntry {
                tag: "uicorner",
                props: vec![PropEntry {
                    name: "CornerRadius",
                    value: config.theme.radius.md.clone(),
                }],
            }),
            "px-4" => style.helpers.push(HelperEntry {
                tag: "uipadding",
                props: vec![
                    PropEntry {
                        name: "PaddingLeft",
                        value: config.theme.spacing.four.clone(),
                    },
                    PropEntry {
                        name: "PaddingRight",
                        value: config.theme.spacing.four.clone(),
                    },
                ],
            }),
            "bg-surface" => style.props.push(PropEntry {
                name: "BackgroundColor3",
                value: config.theme.colors.surface.clone(),
            }),
            other => diagnostics.push(Diagnostic {
                level: "warning".to_owned(),
                code: "unsupported-utility".to_owned(),
                message: format!("Unsupported utility \"{other}\" in className literal."),
                token: Some(other.to_owned()),
            }),
        }
    }

    style
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
    input.split_whitespace().filter(|token| !token.is_empty()).collect()
}

fn is_class_name_attr(name: &JSXAttrName) -> bool {
    matches!(name, JSXAttrName::Ident(ident) if ident.sym == "className")
}

fn is_frame_name(name: &JSXElementName) -> bool {
    matches!(name, JSXElementName::Ident(ident) if ident.sym == "frame")
}

fn parse_config(config_json: Option<&str>) -> TailwindConfig {
    config_json
        .and_then(|value| serde_json::from_str::<TailwindConfig>(value).ok())
        .unwrap_or_else(default_config)
}

fn default_config() -> TailwindConfig {
    default_config_ref().clone()
}

fn default_theme() -> ThemeConfig {
    default_config_ref().theme.clone()
}

fn default_surface() -> ThemeColors {
    default_config_ref().theme.colors.clone()
}

fn default_radius() -> ThemeRadius {
    default_config_ref().theme.radius.clone()
}

fn default_spacing() -> ThemeSpacing {
    default_config_ref().theme.spacing.clone()
}

fn default_surface_value() -> String {
    default_config_ref().theme.colors.surface.clone()
}

fn default_radius_md() -> String {
    default_config_ref().theme.radius.md.clone()
}

fn default_spacing_4() -> String {
    default_config_ref().theme.spacing.four.clone()
}

fn default_config_ref() -> &'static TailwindConfig {
    DEFAULT_CONFIG.get_or_init(|| {
        let document: TailwindDefaultsDocument = serde_json::from_str(DEFAULT_CONFIG_JSON)
            .expect(
                "packages/config/src/defaults.json must be valid TailwindConfig-compatible JSON",
            );

        TailwindConfig {
            theme: ThemeConfig {
                colors: ThemeColors {
                    surface: document.theme.colors.surface,
                },
                radius: ThemeRadius {
                    md: document.theme.radius.md,
                },
                spacing: ThemeSpacing {
                    four: document.theme.spacing.four,
                },
            },
        }
    })
}

#[cfg(target_arch = "wasm32")]
fn parse_wasm_transform_options(options: JsValue) -> Result<Option<TransformOptions>, JsValue> {
    if options.is_null() || options.is_undefined() {
        return Ok(None);
    }

    serde_wasm_bindgen::from_value(options).map(Some).map_err(|error| {
        JsValue::from_str(&format!(
            "Failed to deserialize transform options from wasm input: {error}"
        ))
    })
}
