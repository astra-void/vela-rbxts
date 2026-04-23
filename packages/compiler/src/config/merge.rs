use crate::config::model::{ColorInputMap, ColorValue, TailwindConfig, ThemeColors, ThemeScale};

pub(crate) fn merge_color_registry(base: &ThemeColors, extend: Option<&ColorInputMap>) -> ThemeColors {
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

pub(crate) fn normalize_color_registry(colors: &ColorInputMap) -> ThemeColors {
    colors
        .iter()
        .filter_map(|(name, value)| normalize_color_value(value).map(|scale| (name.clone(), scale)))
        .collect()
}

pub(crate) fn normalize_color_value(value: &ColorValue) -> Option<ColorValue> {
    match value {
        ColorValue::Literal(color) => Some(ColorValue::Literal(color.clone())),
        ColorValue::Palette(scale) if scale.is_empty() => None,
        ColorValue::Palette(scale) => Some(ColorValue::Palette(scale.clone())),
    }
}

pub(crate) fn merge_color_values(base: ColorValue, value: &ColorValue) -> Option<ColorValue> {
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

pub(crate) fn resolve_theme_scale(
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

pub(crate) fn resolve_color_input(
    base: &ThemeColors,
    extend: Option<&ColorInputMap>,
    override_colors: Option<&ColorInputMap>,
) -> ThemeColors {
    let merged_defaults = merge_color_registry(base, extend);

    override_colors
        .map(normalize_color_registry)
        .unwrap_or(merged_defaults)
}

pub(crate) fn resolve_config_input(input: crate::config::model::TailwindConfigInput, base: &TailwindConfig) -> TailwindConfig {
    let Some(theme) = input.theme else {
        return base.clone();
    };

    let extend = theme.extend.unwrap_or_default();

    TailwindConfig {
        theme: crate::config::model::ThemeConfig {
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
