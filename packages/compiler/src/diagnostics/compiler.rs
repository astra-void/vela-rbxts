use crate::api::Diagnostic;

pub(crate) fn unsupported_utility_family_diagnostic(token: &str) -> Diagnostic {
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

pub(crate) fn unsupported_z_index_auto_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-z-index-auto".to_owned(),
        message: "Roblox `ZIndex` does not support Tailwind `auto`.".to_owned(),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn negative_z_index_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-negative-z-index".to_owned(),
        message: "Negative z-index is not supported on Roblox `ZIndex`.".to_owned(),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_arbitrary_z_index_diagnostic(token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-arbitrary-z-index".to_owned(),
        message: "Arbitrary z-index values are not supported yet on Roblox `ZIndex`.".to_owned(),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_z_index_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-z-index-value".to_owned(),
        message: format!(
            "Tailwind `z-{value}` is not supported yet; supported values are z-0, z-10, z-20, z-30, z-40, and z-50."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unknown_theme_key_diagnostic(
    theme_family: &str,
    key: &str,
    token: &str,
) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unknown-theme-key".to_owned(),
        message: format!(
            "Unknown theme key \"{key}\" for {theme_family} utility in className literal."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_size_spacing_value_diagnostic(value: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-size-spacing-value".to_owned(),
        message: format!(
            "Spacing value \"{value}\" for size utility must be an offset-only UDim expression."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_size_mode_diagnostic(mode: &str, token: &str) -> Diagnostic {
    Diagnostic {
        level: "warning".to_owned(),
        code: "unsupported-size-mode".to_owned(),
        message: format!(
            "Size mode \"{mode}\" needs Roblox automatic sizing semantics and is not lowered to Size."
        ),
        token: Some(token.to_owned()),
    }
}

pub(crate) fn unsupported_color_keyword_diagnostic(
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

pub(crate) fn color_requires_shade_diagnostic(
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

pub(crate) fn color_does_not_accept_shade_diagnostic(
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

pub(crate) fn color_missing_shade_diagnostic(
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
