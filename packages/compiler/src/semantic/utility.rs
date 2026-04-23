use crate::api::Diagnostic;
use crate::config::model::{ColorValue, TailwindConfig};
use crate::diagnostics::compiler::{
    color_does_not_accept_shade_diagnostic, color_missing_shade_diagnostic,
    color_requires_shade_diagnostic, unknown_theme_key_diagnostic,
    unsupported_arbitrary_z_index_diagnostic, unsupported_color_keyword_diagnostic,
    unsupported_size_mode_diagnostic, unsupported_size_spacing_value_diagnostic,
    unsupported_z_index_auto_diagnostic, unsupported_z_index_value_diagnostic,
};
use crate::ir::model::SizeAxisValue;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum PaddingKind {
    All,
    X,
    Y,
    Top,
    Right,
    Bottom,
    Left,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum UtilityKind {
    BackgroundColor,
    TextColor,
    ImageColor,
    PlaceholderColor,
    Radius,
    ZIndex,
    Padding(PaddingKind),
    Gap,
    Width,
    Height,
    Size,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ColorFamilySpec {
    pub(crate) theme_family: &'static str,
    pub(crate) color_prop: &'static str,
    pub(crate) transparency_prop: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ColorResolution {
    Expression(String),
    Transparent,
}

pub(crate) const BACKGROUND_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "background color",
    color_prop: "BackgroundColor3",
    transparency_prop: Some("BackgroundTransparency"),
};

pub(crate) const TEXT_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "text color",
    color_prop: "TextColor3",
    transparency_prop: Some("TextTransparency"),
};

pub(crate) const IMAGE_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "image color",
    color_prop: "ImageColor3",
    transparency_prop: Some("ImageTransparency"),
};

pub(crate) const PLACEHOLDER_COLOR_FAMILY: ColorFamilySpec = ColorFamilySpec {
    theme_family: "placeholder color",
    color_prop: "PlaceholderColor3",
    transparency_prop: None,
};

pub(crate) const Z_INDEX_VALUES: [&str; 6] = ["0", "10", "20", "30", "40", "50"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ParsedUtility {
    pub(crate) raw: String,
    pub(crate) family: String,
    pub(crate) payload: Option<String>,
    pub(crate) kind: UtilityKind,
}

pub(crate) fn color_completion_keys(config: &TailwindConfig) -> Vec<String> {
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

pub(crate) fn radius_completion_keys(config: &TailwindConfig) -> Vec<String> {
    config.theme.radius.keys().cloned().collect()
}

pub(crate) fn spacing_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = config.theme.spacing.keys().cloned().collect::<Vec<_>>();
    for key in [
        "0", "0.5", "1", "1.5", "2", "3", "4", "6", "8", "12", "16", "20", "24", "32", "40", "64",
        "80",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

pub(crate) fn size_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = spacing_completion_keys(config);
    for key in [
        "px", "full", "fit", "1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5", "1/6",
        "5/6", "1/12", "5/12", "11/12",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

impl UtilityKind {
    pub(crate) fn needs_config_lookup(&self) -> bool {
        matches!(
            self,
            UtilityKind::BackgroundColor
                | UtilityKind::TextColor
                | UtilityKind::ImageColor
                | UtilityKind::PlaceholderColor
                | UtilityKind::Radius
                | UtilityKind::Padding(_)
                | UtilityKind::Gap
                | UtilityKind::Width
                | UtilityKind::Height
                | UtilityKind::Size
        )
    }

    pub(crate) fn is_supported(&self) -> bool {
        !matches!(self, UtilityKind::Unknown)
    }
}

pub(crate) fn is_utility_allowed_on_host(element_tag: &str, kind: &UtilityKind) -> bool {
    match kind {
        UtilityKind::TextColor => matches!(element_tag, "textlabel" | "textbutton" | "textbox"),
        UtilityKind::ImageColor => matches!(element_tag, "imagelabel" | "imagebutton"),
        UtilityKind::PlaceholderColor => element_tag == "textbox",
        _ => true,
    }
}

pub(crate) fn parse_utility(token: &str) -> ParsedUtility {
    if token.starts_with("-z-") {
        return ParsedUtility {
            raw: token.to_owned(),
            family: "z".to_owned(),
            payload: token.strip_prefix("-z-").map(|value| value.to_owned()),
            kind: UtilityKind::ZIndex,
        };
    }

    for (prefix, kind) in [
        ("bg-", UtilityKind::BackgroundColor),
        ("text-", UtilityKind::TextColor),
        ("image-", UtilityKind::ImageColor),
        ("placeholder-", UtilityKind::PlaceholderColor),
        ("rounded-", UtilityKind::Radius),
        ("z-", UtilityKind::ZIndex),
        ("p-", UtilityKind::Padding(PaddingKind::All)),
        ("px-", UtilityKind::Padding(PaddingKind::X)),
        ("py-", UtilityKind::Padding(PaddingKind::Y)),
        ("pt-", UtilityKind::Padding(PaddingKind::Top)),
        ("pr-", UtilityKind::Padding(PaddingKind::Right)),
        ("pb-", UtilityKind::Padding(PaddingKind::Bottom)),
        ("pl-", UtilityKind::Padding(PaddingKind::Left)),
        ("gap-", UtilityKind::Gap),
        ("w-", UtilityKind::Width),
        ("h-", UtilityKind::Height),
        ("size-", UtilityKind::Size),
    ] {
        if let Some(payload) = token.strip_prefix(prefix) {
            return ParsedUtility {
                raw: token.to_owned(),
                family: prefix.trim_end_matches('-').to_owned(),
                payload: Some(payload.to_owned()),
                kind,
            };
        }
    }

    ParsedUtility {
        raw: token.to_owned(),
        family: token
            .split_once('-')
            .map(|(family, _)| family)
            .unwrap_or(token)
            .to_owned(),
        payload: token.split_once('-').map(|(_, payload)| payload.to_owned()),
        kind: UtilityKind::Unknown,
    }
}

pub(crate) fn resolve_color_value(
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

pub(crate) fn resolve_radius_value(config: &TailwindConfig, key: &str) -> Option<String> {
    config.theme.radius.get(key).cloned()
}

pub(crate) fn resolve_spacing_value(config: &TailwindConfig, key: &str) -> Option<String> {
    config
        .theme
        .spacing
        .get(key)
        .cloned()
        .or_else(|| resolve_numeric_spacing_value(key))
}

pub(crate) fn resolve_size_axis_value(
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

pub(crate) fn resolve_size_spacing_offset(
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

pub(crate) fn resolve_size_fraction_scale(key: &str) -> Option<String> {
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

pub(crate) fn resolve_z_index_value(
    z_key: &str,
    token: &str,
    diagnostics: &mut Vec<Diagnostic>,
) -> Option<String> {
    if z_key == "auto" {
        diagnostics.push(unsupported_z_index_auto_diagnostic(token));
        return None;
    }

    if z_key.starts_with('[') && z_key.ends_with(']') {
        diagnostics.push(unsupported_arbitrary_z_index_diagnostic(token));
        return None;
    }

    if Z_INDEX_VALUES.contains(&z_key) {
        return Some(z_key.to_owned());
    }

    if z_key.parse::<i32>().is_ok() {
        diagnostics.push(unsupported_z_index_value_diagnostic(z_key, token));
        return None;
    }

    diagnostics.push(unsupported_z_index_value_diagnostic(z_key, token));
    None
}

pub(crate) enum ColorKey<'a> {
    Semantic(&'a str),
    Shaded { color_name: &'a str, shade: &'a str },
}

pub(crate) fn split_color_key(key: &str) -> ColorKey<'_> {
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

pub(crate) fn is_shade_token(value: &str) -> bool {
    matches!(
        value,
        "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950"
    )
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

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::model::TailwindConfig;

    #[test]
    fn host_allowlist_matches_utility_family() {
        assert!(is_utility_allowed_on_host(
            "textbox",
            &UtilityKind::PlaceholderColor
        ));
        assert!(!is_utility_allowed_on_host(
            "frame",
            &UtilityKind::TextColor
        ));
        assert!(is_utility_allowed_on_host(
            "frame",
            &UtilityKind::BackgroundColor
        ));
    }

    #[test]
    fn resolves_shared_semantic_values() {
        let config = TailwindConfig::default();

        let mut diagnostics = Vec::new();
        assert_eq!(
            resolve_z_index_value("10", "z-10", &mut diagnostics),
            Some("10".to_owned())
        );
        assert_eq!(diagnostics.len(), 0);

        assert_eq!(
            resolve_spacing_value(&config, "4"),
            Some("new UDim(0, 16)".to_owned())
        );
    }

    #[test]
    fn flags_size_fit_as_semantic_warning() {
        let config = TailwindConfig::default();
        let mut diagnostics = Vec::new();

        assert!(resolve_size_axis_value(&config, &mut diagnostics, "fit", "size-fit").is_none());
        assert!(matches!(
            diagnostics.as_slice(),
            [diag] if diag.code == "unsupported-size-mode"
        ));
    }
}
