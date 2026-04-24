use crate::api::{DocumentColor, DocumentColorsRequest, DocumentColorsResponse};
use crate::editor::{collect_class_name_contexts, tokenize_class_name_with_ranges};
use crate::semantic::analyze::analyze_class_token;
use crate::semantic::utility::{
    BACKGROUND_COLOR_FAMILY, ColorFamilySpec, ColorResolution, IMAGE_COLOR_FAMILY,
    PLACEHOLDER_COLOR_FAMILY, TEXT_COLOR_FAMILY, UtilityKind, is_utility_allowed_on_host,
    resolve_color_value,
};

pub(crate) fn get_document_colors_impl(request: DocumentColorsRequest) -> DocumentColorsResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let mut colors = Vec::new();

    for context in collect_class_name_contexts(&request.source) {
        let tokens = tokenize_class_name_with_ranges(&context.value, context.value_range.start);

        for token in tokens {
            let analysis = analyze_class_token(&token.text);
            let Some(color_family) = color_family_spec(&analysis.utility) else {
                continue;
            };

            if !is_utility_allowed_on_host(&context.element_tag, &analysis.utility) {
                continue;
            }

            let Some(color_key) = analysis.payload() else {
                continue;
            };

            let mut diagnostics = Vec::new();
            let Some(resolution) =
                resolve_color_value(&config, &mut diagnostics, color_family, color_key, &token.text)
            else {
                continue;
            };

            let Some((red, green, blue, alpha)) = resolution_to_rgba(resolution) else {
                continue;
            };

            colors.push(DocumentColor {
                range: token.range.clone(),
                red,
                green,
                blue,
                alpha,
                token: token.text.clone(),
                presentation: token.text.clone(),
            });
        }
    }

    DocumentColorsResponse { colors }
}

fn color_family_spec(kind: &UtilityKind) -> Option<ColorFamilySpec> {
    match kind {
        UtilityKind::BackgroundColor => Some(BACKGROUND_COLOR_FAMILY),
        UtilityKind::TextColor => Some(TEXT_COLOR_FAMILY),
        UtilityKind::ImageColor => Some(IMAGE_COLOR_FAMILY),
        UtilityKind::PlaceholderColor => Some(PLACEHOLDER_COLOR_FAMILY),
        _ => None,
    }
}

fn resolution_to_rgba(resolution: ColorResolution) -> Option<(f64, f64, f64, f64)> {
    match resolution {
        ColorResolution::Transparent => Some((0.0, 0.0, 0.0, 0.0)),
        ColorResolution::Expression(value) => parse_color3_from_rgb(&value).map(|(red, green, blue)| {
            (
                f64::from(red) / 255.0,
                f64::from(green) / 255.0,
                f64::from(blue) / 255.0,
                1.0,
            )
        }),
    }
}

fn parse_color3_from_rgb(value: &str) -> Option<(u8, u8, u8)> {
    let value = value.trim();
    let inner = value.strip_prefix("Color3.fromRGB(")?.strip_suffix(')')?;
    let mut parts = inner.split(',').map(str::trim);
    let red = parts.next()?.parse::<u8>().ok()?;
    let green = parts.next()?.parse::<u8>().ok()?;
    let blue = parts.next()?.parse::<u8>().ok()?;

    if parts.next().is_some() {
        return None;
    }

    Some((red, green, blue))
}
