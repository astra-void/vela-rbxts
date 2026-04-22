#[cfg(not(target_arch = "wasm32"))]
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::OnceLock};

use swc_core::{
    common::{sync::Lrc, FileName, SourceMap, DUMMY_SP},
    ecma::{
        ast::{
            Expr, Ident, IdentName, ImportDecl, ImportNamedSpecifier, ImportSpecifier,
            JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXAttrValue, JSXClosingElement,
            JSXElement, JSXElementChild, JSXElementName, JSXExpr, JSXExprContainer,
            JSXOpeningElement, Module, ModuleDecl, ModuleItem, ModuleExportName, Str,
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
    pub ir: Vec<String>,
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
    All { conditions: Vec<RuntimeCondition> },
    Width {
        alias: String,
        #[serde(rename = "minWidth")]
        min_width: u32,
        #[serde(rename = "maxWidth")]
        max_width: Option<u32>,
    },
    Orientation { value: String },
    Input { value: String },
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
        if let Some(helper) = self.base.helpers.iter_mut().find(|helper| helper.tag == tag) {
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
    BuiltinHex(&'static str),
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

static BUILTIN_COLOR_PALETTE: &[(&str, ColorResolution)] = &[
    ("transparent", ColorResolution::Transparent),
    ("black", ColorResolution::BuiltinHex("#000")),
    ("white", ColorResolution::BuiltinHex("#fff")),
    ("slate-50", ColorResolution::BuiltinHex("#f8fafc")),
    ("slate-100", ColorResolution::BuiltinHex("#f1f5f9")),
    ("slate-200", ColorResolution::BuiltinHex("#e2e8f0")),
    ("slate-300", ColorResolution::BuiltinHex("#cbd5e1")),
    ("slate-400", ColorResolution::BuiltinHex("#94a3b8")),
    ("slate-500", ColorResolution::BuiltinHex("#64748b")),
    ("slate-600", ColorResolution::BuiltinHex("#475569")),
    ("slate-700", ColorResolution::BuiltinHex("#334155")),
    ("slate-800", ColorResolution::BuiltinHex("#1e293b")),
    ("slate-900", ColorResolution::BuiltinHex("#0f172a")),
    ("slate-950", ColorResolution::BuiltinHex("#020617")),
    ("gray-50", ColorResolution::BuiltinHex("#f9fafb")),
    ("gray-100", ColorResolution::BuiltinHex("#f3f4f6")),
    ("gray-200", ColorResolution::BuiltinHex("#e5e7eb")),
    ("gray-300", ColorResolution::BuiltinHex("#d1d5db")),
    ("gray-400", ColorResolution::BuiltinHex("#9ca3af")),
    ("gray-500", ColorResolution::BuiltinHex("#6b7280")),
    ("gray-600", ColorResolution::BuiltinHex("#4b5563")),
    ("gray-700", ColorResolution::BuiltinHex("#374151")),
    ("gray-800", ColorResolution::BuiltinHex("#1f2937")),
    ("gray-900", ColorResolution::BuiltinHex("#111827")),
    ("gray-950", ColorResolution::BuiltinHex("#030712")),
    ("zinc-50", ColorResolution::BuiltinHex("#fafafa")),
    ("zinc-100", ColorResolution::BuiltinHex("#f4f4f5")),
    ("zinc-200", ColorResolution::BuiltinHex("#e4e4e7")),
    ("zinc-300", ColorResolution::BuiltinHex("#d4d4d8")),
    ("zinc-400", ColorResolution::BuiltinHex("#a1a1aa")),
    ("zinc-500", ColorResolution::BuiltinHex("#71717a")),
    ("zinc-600", ColorResolution::BuiltinHex("#52525b")),
    ("zinc-700", ColorResolution::BuiltinHex("#3f3f46")),
    ("zinc-800", ColorResolution::BuiltinHex("#27272a")),
    ("zinc-900", ColorResolution::BuiltinHex("#18181b")),
    ("zinc-950", ColorResolution::BuiltinHex("#09090b")),
    ("neutral-50", ColorResolution::BuiltinHex("#fafafa")),
    ("neutral-100", ColorResolution::BuiltinHex("#f5f5f5")),
    ("neutral-200", ColorResolution::BuiltinHex("#e5e5e5")),
    ("neutral-300", ColorResolution::BuiltinHex("#d4d4d4")),
    ("neutral-400", ColorResolution::BuiltinHex("#a3a3a3")),
    ("neutral-500", ColorResolution::BuiltinHex("#737373")),
    ("neutral-600", ColorResolution::BuiltinHex("#525252")),
    ("neutral-700", ColorResolution::BuiltinHex("#404040")),
    ("neutral-800", ColorResolution::BuiltinHex("#262626")),
    ("neutral-900", ColorResolution::BuiltinHex("#171717")),
    ("neutral-950", ColorResolution::BuiltinHex("#0a0a0a")),
    ("stone-50", ColorResolution::BuiltinHex("#fafaf9")),
    ("stone-100", ColorResolution::BuiltinHex("#f5f5f4")),
    ("stone-200", ColorResolution::BuiltinHex("#e7e5e4")),
    ("stone-300", ColorResolution::BuiltinHex("#d6d3d1")),
    ("stone-400", ColorResolution::BuiltinHex("#a8a29e")),
    ("stone-500", ColorResolution::BuiltinHex("#78716c")),
    ("stone-600", ColorResolution::BuiltinHex("#57534e")),
    ("stone-700", ColorResolution::BuiltinHex("#44403c")),
    ("stone-800", ColorResolution::BuiltinHex("#292524")),
    ("stone-900", ColorResolution::BuiltinHex("#1c1917")),
    ("stone-950", ColorResolution::BuiltinHex("#0c0a09")),
    ("red-50", ColorResolution::BuiltinHex("#fef2f2")),
    ("red-100", ColorResolution::BuiltinHex("#fee2e2")),
    ("red-200", ColorResolution::BuiltinHex("#fecaca")),
    ("red-300", ColorResolution::BuiltinHex("#fca5a5")),
    ("red-400", ColorResolution::BuiltinHex("#f87171")),
    ("red-500", ColorResolution::BuiltinHex("#ef4444")),
    ("red-600", ColorResolution::BuiltinHex("#dc2626")),
    ("red-700", ColorResolution::BuiltinHex("#b91c1c")),
    ("red-800", ColorResolution::BuiltinHex("#991b1b")),
    ("red-900", ColorResolution::BuiltinHex("#7f1d1d")),
    ("red-950", ColorResolution::BuiltinHex("#450a0a")),
    ("orange-50", ColorResolution::BuiltinHex("#fff7ed")),
    ("orange-100", ColorResolution::BuiltinHex("#ffedd5")),
    ("orange-200", ColorResolution::BuiltinHex("#fed7aa")),
    ("orange-300", ColorResolution::BuiltinHex("#fdba74")),
    ("orange-400", ColorResolution::BuiltinHex("#fb923c")),
    ("orange-500", ColorResolution::BuiltinHex("#f97316")),
    ("orange-600", ColorResolution::BuiltinHex("#ea580c")),
    ("orange-700", ColorResolution::BuiltinHex("#c2410c")),
    ("orange-800", ColorResolution::BuiltinHex("#9a3412")),
    ("orange-900", ColorResolution::BuiltinHex("#7c2d12")),
    ("orange-950", ColorResolution::BuiltinHex("#431407")),
    ("amber-50", ColorResolution::BuiltinHex("#fffbeb")),
    ("amber-100", ColorResolution::BuiltinHex("#fef3c7")),
    ("amber-200", ColorResolution::BuiltinHex("#fde68a")),
    ("amber-300", ColorResolution::BuiltinHex("#fcd34d")),
    ("amber-400", ColorResolution::BuiltinHex("#fbbf24")),
    ("amber-500", ColorResolution::BuiltinHex("#f59e0b")),
    ("amber-600", ColorResolution::BuiltinHex("#d97706")),
    ("amber-700", ColorResolution::BuiltinHex("#b45309")),
    ("amber-800", ColorResolution::BuiltinHex("#92400e")),
    ("amber-900", ColorResolution::BuiltinHex("#78350f")),
    ("amber-950", ColorResolution::BuiltinHex("#451a03")),
    ("yellow-50", ColorResolution::BuiltinHex("#fefce8")),
    ("yellow-100", ColorResolution::BuiltinHex("#fef9c3")),
    ("yellow-200", ColorResolution::BuiltinHex("#fef08a")),
    ("yellow-300", ColorResolution::BuiltinHex("#fde047")),
    ("yellow-400", ColorResolution::BuiltinHex("#facc15")),
    ("yellow-500", ColorResolution::BuiltinHex("#eab308")),
    ("yellow-600", ColorResolution::BuiltinHex("#ca8a04")),
    ("yellow-700", ColorResolution::BuiltinHex("#a16207")),
    ("yellow-800", ColorResolution::BuiltinHex("#854d0e")),
    ("yellow-900", ColorResolution::BuiltinHex("#713f12")),
    ("yellow-950", ColorResolution::BuiltinHex("#422006")),
    ("lime-50", ColorResolution::BuiltinHex("#f7fee7")),
    ("lime-100", ColorResolution::BuiltinHex("#ecfccb")),
    ("lime-200", ColorResolution::BuiltinHex("#d9f99d")),
    ("lime-300", ColorResolution::BuiltinHex("#bef264")),
    ("lime-400", ColorResolution::BuiltinHex("#a3e635")),
    ("lime-500", ColorResolution::BuiltinHex("#84cc16")),
    ("lime-600", ColorResolution::BuiltinHex("#65a30d")),
    ("lime-700", ColorResolution::BuiltinHex("#4d7c0f")),
    ("lime-800", ColorResolution::BuiltinHex("#3f6212")),
    ("lime-900", ColorResolution::BuiltinHex("#365314")),
    ("lime-950", ColorResolution::BuiltinHex("#1a2e05")),
    ("green-50", ColorResolution::BuiltinHex("#f0fdf4")),
    ("green-100", ColorResolution::BuiltinHex("#dcfce7")),
    ("green-200", ColorResolution::BuiltinHex("#bbf7d0")),
    ("green-300", ColorResolution::BuiltinHex("#86efac")),
    ("green-400", ColorResolution::BuiltinHex("#4ade80")),
    ("green-500", ColorResolution::BuiltinHex("#22c55e")),
    ("green-600", ColorResolution::BuiltinHex("#16a34a")),
    ("green-700", ColorResolution::BuiltinHex("#15803d")),
    ("green-800", ColorResolution::BuiltinHex("#166534")),
    ("green-900", ColorResolution::BuiltinHex("#14532d")),
    ("green-950", ColorResolution::BuiltinHex("#052e16")),
    ("emerald-50", ColorResolution::BuiltinHex("#ecfdf5")),
    ("emerald-100", ColorResolution::BuiltinHex("#d1fae5")),
    ("emerald-200", ColorResolution::BuiltinHex("#a7f3d0")),
    ("emerald-300", ColorResolution::BuiltinHex("#6ee7b7")),
    ("emerald-400", ColorResolution::BuiltinHex("#34d399")),
    ("emerald-500", ColorResolution::BuiltinHex("#10b981")),
    ("emerald-600", ColorResolution::BuiltinHex("#059669")),
    ("emerald-700", ColorResolution::BuiltinHex("#047857")),
    ("emerald-800", ColorResolution::BuiltinHex("#065f46")),
    ("emerald-900", ColorResolution::BuiltinHex("#064e3b")),
    ("emerald-950", ColorResolution::BuiltinHex("#022c22")),
    ("teal-50", ColorResolution::BuiltinHex("#f0fdfa")),
    ("teal-100", ColorResolution::BuiltinHex("#ccfbf1")),
    ("teal-200", ColorResolution::BuiltinHex("#99f6e4")),
    ("teal-300", ColorResolution::BuiltinHex("#5eead4")),
    ("teal-400", ColorResolution::BuiltinHex("#2dd4bf")),
    ("teal-500", ColorResolution::BuiltinHex("#14b8a6")),
    ("teal-600", ColorResolution::BuiltinHex("#0d9488")),
    ("teal-700", ColorResolution::BuiltinHex("#0f766e")),
    ("teal-800", ColorResolution::BuiltinHex("#115e59")),
    ("teal-900", ColorResolution::BuiltinHex("#134e4a")),
    ("teal-950", ColorResolution::BuiltinHex("#042f2e")),
    ("cyan-50", ColorResolution::BuiltinHex("#ecfeff")),
    ("cyan-100", ColorResolution::BuiltinHex("#cffafe")),
    ("cyan-200", ColorResolution::BuiltinHex("#a5f3fc")),
    ("cyan-300", ColorResolution::BuiltinHex("#67e8f9")),
    ("cyan-400", ColorResolution::BuiltinHex("#22d3ee")),
    ("cyan-500", ColorResolution::BuiltinHex("#06b6d4")),
    ("cyan-600", ColorResolution::BuiltinHex("#0891b2")),
    ("cyan-700", ColorResolution::BuiltinHex("#0e7490")),
    ("cyan-800", ColorResolution::BuiltinHex("#155e75")),
    ("cyan-900", ColorResolution::BuiltinHex("#164e63")),
    ("cyan-950", ColorResolution::BuiltinHex("#083344")),
    ("sky-50", ColorResolution::BuiltinHex("#f0f9ff")),
    ("sky-100", ColorResolution::BuiltinHex("#e0f2fe")),
    ("sky-200", ColorResolution::BuiltinHex("#bae6fd")),
    ("sky-300", ColorResolution::BuiltinHex("#7dd3fc")),
    ("sky-400", ColorResolution::BuiltinHex("#38bdf8")),
    ("sky-500", ColorResolution::BuiltinHex("#0ea5e9")),
    ("sky-600", ColorResolution::BuiltinHex("#0284c7")),
    ("sky-700", ColorResolution::BuiltinHex("#0369a1")),
    ("sky-800", ColorResolution::BuiltinHex("#075985")),
    ("sky-900", ColorResolution::BuiltinHex("#0c4a6e")),
    ("sky-950", ColorResolution::BuiltinHex("#082f49")),
    ("blue-50", ColorResolution::BuiltinHex("#eff6ff")),
    ("blue-100", ColorResolution::BuiltinHex("#dbeafe")),
    ("blue-200", ColorResolution::BuiltinHex("#bfdbfe")),
    ("blue-300", ColorResolution::BuiltinHex("#93c5fd")),
    ("blue-400", ColorResolution::BuiltinHex("#60a5fa")),
    ("blue-500", ColorResolution::BuiltinHex("#3b82f6")),
    ("blue-600", ColorResolution::BuiltinHex("#2563eb")),
    ("blue-700", ColorResolution::BuiltinHex("#1d4ed8")),
    ("blue-800", ColorResolution::BuiltinHex("#1e40af")),
    ("blue-900", ColorResolution::BuiltinHex("#1e3a8a")),
    ("blue-950", ColorResolution::BuiltinHex("#172554")),
    ("indigo-50", ColorResolution::BuiltinHex("#eef2ff")),
    ("indigo-100", ColorResolution::BuiltinHex("#e0e7ff")),
    ("indigo-200", ColorResolution::BuiltinHex("#c7d2fe")),
    ("indigo-300", ColorResolution::BuiltinHex("#a5b4fc")),
    ("indigo-400", ColorResolution::BuiltinHex("#818cf8")),
    ("indigo-500", ColorResolution::BuiltinHex("#6366f1")),
    ("indigo-600", ColorResolution::BuiltinHex("#4f46e5")),
    ("indigo-700", ColorResolution::BuiltinHex("#4338ca")),
    ("indigo-800", ColorResolution::BuiltinHex("#3730a3")),
    ("indigo-900", ColorResolution::BuiltinHex("#312e81")),
    ("indigo-950", ColorResolution::BuiltinHex("#1e1b4b")),
    ("violet-50", ColorResolution::BuiltinHex("#f5f3ff")),
    ("violet-100", ColorResolution::BuiltinHex("#ede9fe")),
    ("violet-200", ColorResolution::BuiltinHex("#ddd6fe")),
    ("violet-300", ColorResolution::BuiltinHex("#c4b5fd")),
    ("violet-400", ColorResolution::BuiltinHex("#a78bfa")),
    ("violet-500", ColorResolution::BuiltinHex("#8b5cf6")),
    ("violet-600", ColorResolution::BuiltinHex("#7c3aed")),
    ("violet-700", ColorResolution::BuiltinHex("#6d28d9")),
    ("violet-800", ColorResolution::BuiltinHex("#5b21b6")),
    ("violet-900", ColorResolution::BuiltinHex("#4c1d95")),
    ("violet-950", ColorResolution::BuiltinHex("#2e1065")),
    ("purple-50", ColorResolution::BuiltinHex("#faf5ff")),
    ("purple-100", ColorResolution::BuiltinHex("#f3e8ff")),
    ("purple-200", ColorResolution::BuiltinHex("#e9d5ff")),
    ("purple-300", ColorResolution::BuiltinHex("#d8b4fe")),
    ("purple-400", ColorResolution::BuiltinHex("#c084fc")),
    ("purple-500", ColorResolution::BuiltinHex("#a855f7")),
    ("purple-600", ColorResolution::BuiltinHex("#9333ea")),
    ("purple-700", ColorResolution::BuiltinHex("#7e22ce")),
    ("purple-800", ColorResolution::BuiltinHex("#6b21a8")),
    ("purple-900", ColorResolution::BuiltinHex("#581c87")),
    ("purple-950", ColorResolution::BuiltinHex("#3b0764")),
    ("fuchsia-50", ColorResolution::BuiltinHex("#fdf4ff")),
    ("fuchsia-100", ColorResolution::BuiltinHex("#fae8ff")),
    ("fuchsia-200", ColorResolution::BuiltinHex("#f5d0fe")),
    ("fuchsia-300", ColorResolution::BuiltinHex("#f0abfc")),
    ("fuchsia-400", ColorResolution::BuiltinHex("#e879f9")),
    ("fuchsia-500", ColorResolution::BuiltinHex("#d946ef")),
    ("fuchsia-600", ColorResolution::BuiltinHex("#c026d3")),
    ("fuchsia-700", ColorResolution::BuiltinHex("#a21caf")),
    ("fuchsia-800", ColorResolution::BuiltinHex("#86198f")),
    ("fuchsia-900", ColorResolution::BuiltinHex("#701a75")),
    ("fuchsia-950", ColorResolution::BuiltinHex("#4a044e")),
    ("pink-50", ColorResolution::BuiltinHex("#fdf2f8")),
    ("pink-100", ColorResolution::BuiltinHex("#fce7f3")),
    ("pink-200", ColorResolution::BuiltinHex("#fbcfe8")),
    ("pink-300", ColorResolution::BuiltinHex("#f9a8d4")),
    ("pink-400", ColorResolution::BuiltinHex("#f472b6")),
    ("pink-500", ColorResolution::BuiltinHex("#ec4899")),
    ("pink-600", ColorResolution::BuiltinHex("#db2777")),
    ("pink-700", ColorResolution::BuiltinHex("#be185d")),
    ("pink-800", ColorResolution::BuiltinHex("#9d174d")),
    ("pink-900", ColorResolution::BuiltinHex("#831843")),
    ("pink-950", ColorResolution::BuiltinHex("#500724")),
    ("rose-50", ColorResolution::BuiltinHex("#fff1f2")),
    ("rose-100", ColorResolution::BuiltinHex("#ffe4e6")),
    ("rose-200", ColorResolution::BuiltinHex("#fecdd3")),
    ("rose-300", ColorResolution::BuiltinHex("#fda4af")),
    ("rose-400", ColorResolution::BuiltinHex("#fb7185")),
    ("rose-500", ColorResolution::BuiltinHex("#f43f5e")),
    ("rose-600", ColorResolution::BuiltinHex("#e11d48")),
    ("rose-700", ColorResolution::BuiltinHex("#be123c")),
    ("rose-800", ColorResolution::BuiltinHex("#9f1239")),
    ("rose-900", ColorResolution::BuiltinHex("#881337")),
    ("rose-950", ColorResolution::BuiltinHex("#4c0519")),
];

struct TailwindTransformer {
    changed: bool,
    config: TailwindConfig,
    diagnostics: Vec<Diagnostic>,
    ir: Vec<StyleIr>,
    runtime_import_needed: bool,
}

struct LoweredClassName {
    style_ir: StyleIr,
    preserved_attrs: Vec<JSXAttrOrSpread>,
    runtime_class_name: Option<JSXAttr>,
    needs_runtime_host: bool,
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
        ColorResolution::BuiltinHex(hex) => {
            if let Some(transparency_prop) = spec.transparency_prop {
                style.remove_prop(transparency_prop);
            }

            style.set_prop(spec.color_prop, builtin_color_expression(hex));
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
    if let Some(value) = config.theme.colors.get(color_key) {
        return Some(ColorResolution::Expression(value.clone()));
    }

    if let Some(value) = resolve_builtin_color(color_key) {
        return Some(value);
    }

    if matches!(color_key, "current" | "inherit") {
        diagnostics.push(unsupported_color_keyword_diagnostic(
            spec.theme_family,
            color_key,
            token,
        ));
        return None;
    }

    diagnostics.push(unknown_theme_key_diagnostic(spec.theme_family, color_key, token));
    None
}

fn resolve_builtin_color(key: &str) -> Option<ColorResolution> {
    BUILTIN_COLOR_PALETTE
        .iter()
        .find(|(builtin_key, _)| *builtin_key == key)
        .map(|(_, value)| value.clone())
}

fn unsupported_color_keyword_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-color-key".to_owned(),
        message: format!(
            "Unsupported color keyword \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

fn builtin_color_expression(hex: &str) -> String {
    let hex = hex.strip_prefix('#').unwrap_or(hex);
    let expanded = match hex.len() {
        3 => {
            let mut out = String::with_capacity(6);
            for ch in hex.chars() {
                out.push(ch);
                out.push(ch);
            }
            out
        }
        6 => hex.to_owned(),
        _ => panic!("builtin color hex values must be 3 or 6 digits"),
    };

    let red = u8::from_str_radix(&expanded[0..2], 16).expect("builtin color red channel");
    let green = u8::from_str_radix(&expanded[2..4], 16).expect("builtin color green channel");
    let blue = u8::from_str_radix(&expanded[4..6], 16).expect("builtin color blue channel");

    format!("Color3.fromRGB({red}, {green}, {blue})")
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
            .map(|style| {
                serde_json::to_string(&style).expect("style IR must serialize to JSON")
            })
            .collect(),
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
    fn visit_mut_module(&mut self, module: &mut Module) {
        module.visit_mut_children_with(self);

        if self.runtime_import_needed {
            module.body.insert(
                0,
                ModuleItem::ModuleDecl(create_runtime_import_declaration()),
            );
        }
    }

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
            attrs.extend(lowered.style_ir.base.props.into_iter().map(create_prop_attr));
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
                "__rbxtsTailwindRuntimeHost".into(),
                DUMMY_SP,
            ));
        } else {
            attrs.extend(lowered.style_ir.base.props.into_iter().map(create_prop_attr));
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
            let style = resolve_class_tokens(tokenize_class_name(&class_name), config, diagnostics);
            let needs_runtime_host =
                !style.runtime_rules.is_empty() || style.runtime_class_value;

            Some(LoweredClassName {
                style_ir: style,
                preserved_attrs,
                runtime_class_name: None,
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

fn resolve_class_tokens(
    tokens: Vec<&str>,
    config: &TailwindConfig,
    diagnostics: &mut Vec<Diagnostic>,
) -> StyleIr {
    let mut style = StyleIr::default();
    let mut pending_size_width: Option<SizeAxisValue> = None;
    let mut pending_size_height: Option<SizeAxisValue> = None;

    for token in tokens {
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

    Some(format!(
        "new UDim(0, {})",
        format_spacing_offset(offset_px)
    ))
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

fn create_runtime_import_declaration() -> ModuleDecl {
    ModuleDecl::Import(ImportDecl {
        span: DUMMY_SP,
        specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
            span: DUMMY_SP,
            local: Ident::new_no_ctxt("__rbxtsTailwindRuntimeHost".into(), DUMMY_SP),
            imported: Some(ModuleExportName::Ident(Ident::new_no_ctxt(
                "TailwindRuntimeHost".into(),
                DUMMY_SP,
            ))),
            is_type_only: false,
        })],
        src: Box::new(Str {
            span: DUMMY_SP,
            value: "rbxts-tailwind/runtime-host".into(),
            raw: None,
        }),
        type_only: false,
        with: None,
        phase: Default::default(),
    })
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

    serde_wasm_bindgen::from_value(options).map(Some).map_err(|error| {
        JsValue::from_str(&format!(
            "Failed to deserialize transform options from wasm input: {error}"
        ))
    })
}
