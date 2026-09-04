use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct TailwindConfig {
    #[serde(default = "preflight_default")]
    pub(crate) preflight: bool,
    /// Emit-only, like the motion driver's specifier: it decides which runtime
    /// the preamble reaches for, and the runtime itself never reads it. It is
    /// still serialized so a config can round-trip through `configJson`; what
    /// travels to the runtime is reset first.
    #[serde(default, skip_serializing_if = "Framework::is_default")]
    pub(crate) framework: Framework,
    #[serde(default)]
    pub(crate) theme: ThemeConfig,
    #[serde(default)]
    pub(crate) plugins: PluginConfig,
}

/// Which UI library the project's JSX is compiled for. `jsxFactory` is a
/// program-wide setting, so this is a project-wide choice rather than a per-file
/// one.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Framework {
    #[default]
    React,
    Vide,
}

impl Framework {
    fn is_default(&self) -> bool {
        *self == Self::default()
    }
}

impl Default for TailwindConfig {
    fn default() -> Self {
        Self {
            preflight: preflight_default(),
            framework: Framework::default(),
            theme: ThemeConfig::default(),
            plugins: PluginConfig::default(),
        }
    }
}

/// What the config's plugins contributed, already resolved by the JS loader.
/// Sections are namespaced so a later extension point lands beside `utilities`.
#[derive(Clone, Deserialize, Serialize, Default)]
pub(crate) struct PluginConfig {
    #[serde(default)]
    pub(crate) utilities: BTreeMap<String, PluginUtility>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub(crate) variants: BTreeMap<String, VariantDefinition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) motion: Option<MotionDriverConfig>,
}

/// A variant a project registered. It matches while the styled instance carries
/// the named Roblox attribute with this value, so what it reads lives on the
/// element rather than in the environment every element shares.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub(crate) struct VariantDefinition {
    pub(crate) attribute: String,
    pub(crate) equals: AttributeValue,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub(crate) enum AttributeValue {
    Bool(bool),
    Number(f64),
    Text(String),
}

impl AttributeValue {
    /// How the value reads in a diagnostic or a hover, and how `attr-[…]`
    /// writes it.
    pub(crate) fn display(&self) -> String {
        match self {
            Self::Bool(value) => value.to_string(),
            Self::Number(value) => crate::semantic::utility::format_number(*value),
            Self::Text(value) => value.clone(),
        }
    }
}

/// The module a transformed file imports its motion driver from, in place of
/// the built-in `TweenService` one. Compile-time only: the driver reaches the
/// runtime as an argument, so the specifier never travels with the config.
#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct MotionDriverConfig {
    pub(crate) module: String,
    #[serde(rename = "export", default, skip_serializing_if = "Option::is_none")]
    pub(crate) export_name: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub(crate) enum PluginUtility {
    Classes(String),
    Props(BTreeMap<String, String>),
}

fn preflight_default() -> bool {
    true
}

#[derive(Clone, Deserialize, Serialize, Default)]
pub(crate) struct ThemeConfig {
    #[serde(default)]
    pub(crate) colors: ThemeColors,
    #[serde(default)]
    pub(crate) radius: ThemeScale,
    #[serde(default)]
    pub(crate) spacing: ThemeScale,
    #[serde(default, rename = "fontFamily")]
    pub(crate) font_family: ThemeScale,
    /// Viewport widths a responsive variant is named after. `md:` applies from
    /// the width up and `max-md:` strictly below it, so the pair is an exact
    /// complement at every viewport.
    #[serde(default)]
    pub(crate) screens: ThemeScreens,
    #[serde(default)]
    pub(crate) rem: RemConfig,
    /// Emit-only: the theme tables that travel whole rather than as a
    /// difference from the defaults the runtime carries. Always rewritten on
    /// the way out, so whatever a config file put here is ignored.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) replaced: Vec<String>,
}

/// How an offset in a utility turns into pixels. `base` is what one rem is worth
/// at `base_resolution`; every other viewport scales that value and clamps it
/// into `[min, max]`.
#[derive(Clone, Deserialize, Serialize, PartialEq)]
pub(crate) struct RemConfig {
    pub(crate) base: f64,
    pub(crate) min: f64,
    pub(crate) max: f64,
    #[serde(rename = "baseResolution")]
    pub(crate) base_resolution: RemResolution,
    /// The containers whose subtree keeps its literal pixels. Compile-time only:
    /// this pass opens the scope and the runtime is told where it lands, so the
    /// list itself never travels with the config.
    #[serde(default, rename = "pinnedUnder", skip_serializing_if = "Vec::is_empty")]
    pub(crate) pinned_under: Vec<String>,
}

impl RemConfig {
    /// A clamp with no room left resolves the same rem on every viewport, and a
    /// pin at `base` resolves it to a ratio of 1, which lets the emit keep its
    /// literal offsets instead of routing them through the runtime. A pin away
    /// from `base` still scales — by a constant — so it stays on the runtime
    /// path, where the host multiplies by the same ratio.
    pub(crate) fn is_static(&self) -> bool {
        self.min >= self.max && self.min == self.base
    }

    /// Whether a subtree under this JSX tag reads its offsets as literal pixels.
    /// A `SurfaceGui` takes its pixel space from the part it is drawn on, so the
    /// viewport the curve follows says nothing about it.
    pub(crate) fn pins_under(&self, tag: &str) -> bool {
        self.pinned_under
            .iter()
            .any(|pinned| pinned.eq_ignore_ascii_case(tag))
    }
}

impl Default for RemConfig {
    fn default() -> Self {
        Self {
            base: 16.0,
            min: 16.0,
            max: 16.0,
            base_resolution: RemResolution::default(),
            pinned_under: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq)]
pub(crate) struct RemResolution {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

impl Default for RemResolution {
    fn default() -> Self {
        Self {
            x: 1920.0,
            y: 1020.0,
        }
    }
}

pub(crate) type ThemeScale = BTreeMap<String, String>;
pub(crate) type ThemeScreens = BTreeMap<String, u32>;
pub(crate) type ThemeColors = BTreeMap<String, ColorValue>;

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub(crate) enum ColorValue {
    Literal(String),
    Palette(ColorScale),
}

pub(crate) type ColorScale = BTreeMap<String, String>;

#[derive(Clone, Deserialize, Default)]
pub(crate) struct TailwindConfigInput {
    /// Shared configuration folded in before this one, in the order written. A
    /// JSON config can only inline them; a package preset needs `vela.config.ts`.
    #[serde(default)]
    pub(crate) presets: Option<Vec<TailwindConfigInput>>,
    pub(crate) preflight: Option<bool>,
    pub(crate) framework: Option<Framework>,
    pub(crate) theme: Option<ThemeConfigInput>,
    pub(crate) plugins: Option<PluginConfig>,
}

#[derive(Clone, Deserialize, Default)]
pub(crate) struct ThemeConfigInput {
    pub(crate) colors: Option<ColorInputMap>,
    pub(crate) radius: Option<ThemeScale>,
    pub(crate) spacing: Option<ThemeScale>,
    #[serde(rename = "fontFamily")]
    pub(crate) font_family: Option<ThemeScale>,
    pub(crate) screens: Option<ThemeScreens>,
    pub(crate) rem: Option<RemConfigInput>,
    pub(crate) extend: Option<ThemeConfigExtendInput>,
}

#[derive(Clone, Deserialize, Default)]
pub(crate) struct ThemeConfigExtendInput {
    pub(crate) colors: Option<ColorInputMap>,
    pub(crate) radius: Option<ThemeScale>,
    pub(crate) spacing: Option<ThemeScale>,
    #[serde(rename = "fontFamily")]
    pub(crate) font_family: Option<ThemeScale>,
    pub(crate) screens: Option<ThemeScreens>,
    pub(crate) rem: Option<RemConfigInput>,
}

#[derive(Clone, Deserialize, Default)]
pub(crate) struct RemConfigInput {
    pub(crate) base: Option<f64>,
    pub(crate) min: Option<f64>,
    pub(crate) max: Option<f64>,
    #[serde(rename = "baseResolution")]
    pub(crate) base_resolution: Option<RemResolutionInput>,
    #[serde(rename = "pinnedUnder")]
    pub(crate) pinned_under: Option<Vec<String>>,
}

#[derive(Clone, Copy, Deserialize, Default)]
pub(crate) struct RemResolutionInput {
    pub(crate) x: Option<f64>,
    pub(crate) y: Option<f64>,
}

pub(crate) type ColorInputMap = BTreeMap<String, ColorValue>;
