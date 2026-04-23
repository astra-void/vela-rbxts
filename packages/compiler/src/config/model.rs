use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Deserialize, Serialize, Default)]
pub(crate) struct TailwindConfig {
    #[serde(default)]
    pub(crate) theme: ThemeConfig,
}

#[derive(Clone, Deserialize, Serialize, Default)]
pub(crate) struct ThemeConfig {
    #[serde(default)]
    pub(crate) colors: ThemeColors,
    #[serde(default)]
    pub(crate) radius: ThemeScale,
    #[serde(default)]
    pub(crate) spacing: ThemeScale,
}

pub(crate) type ThemeScale = BTreeMap<String, String>;
pub(crate) type ThemeColors = BTreeMap<String, ColorValue>;

#[derive(Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub(crate) enum ColorValue {
    Literal(String),
    Palette(ColorScale),
}

pub(crate) type ColorScale = BTreeMap<String, String>;

#[derive(Clone, Deserialize, Default)]
pub(crate) struct TailwindConfigInput {
    pub(crate) theme: Option<ThemeConfigInput>,
}

#[derive(Clone, Deserialize, Default)]
pub(crate) struct ThemeConfigInput {
    pub(crate) colors: Option<ColorInputMap>,
    pub(crate) radius: Option<ThemeScale>,
    pub(crate) spacing: Option<ThemeScale>,
    pub(crate) extend: Option<ThemeConfigExtendInput>,
}

#[derive(Clone, Deserialize, Default)]
pub(crate) struct ThemeConfigExtendInput {
    pub(crate) colors: Option<ColorInputMap>,
    pub(crate) radius: Option<ThemeScale>,
    pub(crate) spacing: Option<ThemeScale>,
}

pub(crate) type ColorInputMap = BTreeMap<String, ColorValue>;
