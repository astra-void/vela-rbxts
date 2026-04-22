#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::OnceLock};

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
    #[serde(default)]
    theme: ThemeConfig,
}

#[derive(Clone, Deserialize, Default)]
struct ThemeConfig {
    #[serde(default)]
    colors: ThemeScale,
    #[serde(default)]
    radius: ThemeScale,
    #[serde(default)]
    spacing: ThemeScale,
}

const DEFAULT_CONFIG_JSON: &str = include_str!("../../config/src/defaults.json");
static DEFAULT_CONFIG: OnceLock<TailwindConfig> = OnceLock::new();

type ThemeScale = BTreeMap<String, String>;

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

impl StyleIr {
    fn set_prop(&mut self, name: &'static str, value: String) {
        self.props.retain(|prop| prop.name != name);
        self.props.push(PropEntry { name, value });
    }

    fn set_helper_prop(&mut self, tag: &'static str, name: &'static str, value: String) {
        if let Some(helper) = self.helpers.iter_mut().find(|helper| helper.tag == tag) {
            helper.props.retain(|prop| prop.name != name);
            helper.props.push(PropEntry { name, value });
            return;
        }

        self.helpers.push(HelperEntry {
            tag,
            props: vec![PropEntry { name, value }],
        });
    }
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

        if !is_supported_host_element(&element.opening.name) {
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
            return Some(LoweredClassName {
                props: Vec::new(),
                helpers: Vec::new(),
                preserved_attrs: attrs
                    .iter()
                    .filter(|attr| {
                        !matches!(
                            attr,
                            JSXAttrOrSpread::JSXAttr(attr) if is_class_name_attr(&attr.name)
                        )
                    })
                    .cloned()
                    .collect(),
            });
        }
    };

    let style = resolve_class_tokens(tokenize_class_name(&class_name), config, diagnostics);
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
        if let Some(color_key) = token.strip_prefix("bg-") {
            if let Some(value) = config.theme.colors.get(color_key) {
                style.set_prop("BackgroundColor3", value.clone());
            } else {
                diagnostics.push(unknown_theme_key_diagnostic(
                    "background color",
                    color_key,
                    token,
                ));
            }
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

        diagnostics.push(unsupported_utility_family_diagnostic(token));
    }

    style
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

    Some(format!(
        "new UDim(0, {})",
        format_spacing_offset(offset_px)
    ))
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
        .and_then(|value| serde_json::from_str::<TailwindConfig>(value).ok())
        .unwrap_or_else(default_config)
}

fn default_config() -> TailwindConfig {
    default_config_ref().clone()
}

fn default_config_ref() -> &'static TailwindConfig {
    DEFAULT_CONFIG.get_or_init(|| {
        serde_json::from_str(DEFAULT_CONFIG_JSON)
            .expect("packages/config/src/defaults.json must be valid TailwindConfig-compatible JSON")
    })
}

fn unsupported_utility_family_diagnostic(token: &str) -> Diagnostic {
    let family = token.split_once('-').map(|(family, _)| family).unwrap_or(token);

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
