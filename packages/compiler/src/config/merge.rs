use crate::config::model::{
    ColorInputMap, ColorValue, PluginConfig, RemConfig, RemConfigInput, TailwindConfig,
    TailwindConfigInput, ThemeColors, ThemeScale, ThemeScreens,
};

/// How deep presets may nest before the structure is treated as a mistake.
const MAX_PRESET_DEPTH: usize = 10;

fn merge_plugin_config(base: &PluginConfig, input: Option<PluginConfig>) -> PluginConfig {
    let Some(input) = input else {
        return base.clone();
    };

    let mut merged = base.clone();
    merged.utilities.extend(input.utilities);
    merged.variants.extend(input.variants);

    if input.motion.is_some() {
        merged.motion = input.motion;
    }

    merged
}

pub(crate) fn merge_color_registry(
    base: &ThemeColors,
    extend: Option<&ColorInputMap>,
) -> ThemeColors {
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

/// Screens follow the same rule as the other theme axes: a top-level table
/// replaces the scale, `extend` adds to what was inherited.
pub(crate) fn resolve_screens(
    base: &ThemeScreens,
    extend: Option<&ThemeScreens>,
    override_screens: Option<&ThemeScreens>,
) -> ThemeScreens {
    if let Some(override_screens) = override_screens {
        return override_screens.clone();
    }

    let mut merged = base.clone();

    if let Some(extend) = extend {
        merged.extend(extend.clone());
    }

    merged
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

/// `rem` is a record of related fields rather than a keyed scale, so a partial
/// override merges field by field instead of replacing the family.
pub(crate) fn resolve_rem_config(
    base: &RemConfig,
    extend: Option<&RemConfigInput>,
    override_rem: Option<&RemConfigInput>,
) -> RemConfig {
    let mut merged = base.clone();

    for input in [extend, override_rem].into_iter().flatten() {
        merged.base = input.base.unwrap_or(merged.base);
        merged.min = input.min.unwrap_or(merged.min);
        merged.max = input.max.unwrap_or(merged.max);

        if let Some(resolution) = input.base_resolution {
            merged.base_resolution.x = resolution.x.unwrap_or(merged.base_resolution.x);
            merged.base_resolution.y = resolution.y.unwrap_or(merged.base_resolution.y);
        }

        // A list that merged would have no way to say "none".
        if let Some(pinned) = input.pinned_under.as_ref() {
            merged.pinned_under = pinned.iter().map(|tag| tag.to_lowercase()).collect();
        }
    }

    // Luau's `math.clamp` errors when the bounds cross, and this config is
    // handed to the runtime verbatim, so an inverted clamp collapses onto `min`
    // here rather than at the first viewport read.
    merged.max = merged.max.max(merged.min);

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

pub(crate) fn resolve_config_input(
    input: TailwindConfigInput,
    base: &TailwindConfig,
) -> TailwindConfig {
    resolve_config_input_at(input, base, 0)
}

/// Folds every preset into the base, in the order they were written, before the
/// config that names them resolves against the result. Merging at the input
/// level rather than over finished configs is what keeps `theme.extend` in a
/// project extending what a preset replaced.
fn resolve_config_input_at(
    mut input: TailwindConfigInput,
    base: &TailwindConfig,
    depth: usize,
) -> TailwindConfig {
    let mut resolved_base = base.clone();

    // A structure this deep is recursive rather than deliberate, so the rest is
    // dropped instead of expanded forever.
    if let Some(presets) = input.presets.take()
        && depth < MAX_PRESET_DEPTH
    {
        for preset in presets {
            resolved_base = resolve_config_input_at(preset, &resolved_base, depth + 1);
        }
    }

    resolve_own_input(input, &resolved_base)
}

fn resolve_own_input(input: TailwindConfigInput, base: &TailwindConfig) -> TailwindConfig {
    let preflight = input.preflight.unwrap_or(base.preflight);
    let framework = input.framework.unwrap_or(base.framework);
    let plugins = merge_plugin_config(&base.plugins, input.plugins);

    let Some(theme) = input.theme else {
        return TailwindConfig {
            preflight,
            framework,
            plugins,
            ..base.clone()
        };
    };

    let extend = theme.extend.unwrap_or_default();

    TailwindConfig {
        preflight,
        framework,
        plugins,
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
            font_family: resolve_theme_scale(
                &base.theme.font_family,
                extend.font_family.as_ref(),
                theme.font_family.as_ref(),
            ),
            screens: resolve_screens(
                &base.theme.screens,
                extend.screens.as_ref(),
                theme.screens.as_ref(),
            ),
            rem: resolve_rem_config(&base.theme.rem, extend.rem.as_ref(), theme.rem.as_ref()),
            // Decided at emit time, against the defaults the runtime carries.
            replaced: Vec::new(),
        },
    }
}
