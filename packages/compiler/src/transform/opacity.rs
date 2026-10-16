use crate::class_value::collapse::ClassValueCollapse;
use crate::config::model::TailwindConfig;
use crate::ir::model::{HelperEntry, PropEntry, StyleIr};
use crate::semantic::plugin::{ExpandedToken, expand_class_token};
use crate::semantic::utility::resolve_opacity_value;

/// Every channel a host paints itself. CSS fades an element whole; Roblox splits
/// that across one transparency property per channel, so `opacity-*` has to name
/// all of them.
pub(crate) fn opacity_transparency_props(element_tag: Option<&str>) -> &'static [&'static str] {
    match element_tag {
        // A CanvasGroup composites its whole subtree, so this one property
        // already means what CSS `opacity` means.
        Some("canvasgroup") => &["GroupTransparency"],
        Some("textlabel" | "textbutton" | "textbox") => {
            &["BackgroundTransparency", "TextTransparency"]
        }
        Some("imagelabel" | "imagebutton") => &["BackgroundTransparency", "ImageTransparency"],
        _ => &["BackgroundTransparency"],
    }
}

/// Helpers that paint alongside the instance and carry a transparency of their
/// own. A border that stayed solid over a faded fill would read as a bug.
const TRANSPARENT_HELPERS: [&str; 5] = [
    "uistroke",
    "uishadow",
    "uiinsetshadow",
    "uitextshadow",
    "uiblur",
];

/// The alpha an `opacity-*` in this class list leaves behind, or `None` when it
/// names none. Only static tokens count: a variant is decided at render time,
/// and a subtree cannot be composed against a value that is not there yet.
pub(crate) fn static_opacity_alpha<T, I>(tokens: I, config: &TailwindConfig) -> Option<f64>
where
    I: IntoIterator<Item = T>,
    T: AsRef<str>,
{
    let mut alpha = None;

    for token in tokens {
        for expanded in expand_class_token(token.as_ref(), config) {
            let ExpandedToken::Class { token, .. } = expanded else {
                continue;
            };
            let Some(percent) = token.strip_prefix("opacity-") else {
                continue;
            };
            let Some(transparency) = resolve_opacity_value(percent) else {
                continue;
            };
            if let Ok(transparency) = transparency.parse::<f64>() {
                alpha = Some(1.0 - transparency);
            }
        }
    }

    alpha
}

/// Whether a branch in this class value asks for a fade the branch path cannot
/// deliver. A bare `opacity-*` fades the element's subtree as well as the
/// element, and the subtree is wrapped from the tokens that always apply — a
/// branch is not among them, so the whole class value goes to the runtime,
/// which resolves it and hands its subtree one alpha.
///
/// A CanvasGroup is the exception: it composites its own subtree, so
/// `GroupTransparency` on the instance is the whole fade and a rule can carry it.
pub(crate) fn branch_opacity_needs_runtime(
    collapse: &ClassValueCollapse,
    element_tag: Option<&str>,
    config: &TailwindConfig,
) -> bool {
    if element_tag == Some("canvasgroup") {
        return false;
    }

    collapse
        .branches()
        .any(|branch| static_opacity_alpha(&branch.tokens, config).is_some())
}

/// Roblox has no inherited transparency. CSS fades a subtree by compositing it
/// once and multiplying alpha over the result; the closest thing that stays a
/// property is to hand every instance below the class the running product.
///
/// Overlapping siblings are where the two part ways: a real composite fades
/// them together, and this fades each of them, so the overlap darkens.
pub(crate) fn compose_inherited_opacity(
    style: &mut StyleIr,
    element_tag: Option<&str>,
    alpha: f64,
    declared_props: &[String],
    compose_runtime_rules: bool,
) {
    let names = opacity_transparency_props(element_tag);

    for name in names {
        if declared_props.iter().any(|declared| declared == name) {
            continue;
        }

        let current = style
            .base
            .props
            .iter()
            .find(|prop| prop.name == *name)
            .and_then(|prop| prop.value.parse::<f64>().ok())
            .unwrap_or(0.0);
        style.set_prop(*name, format_transparency(compose(current, alpha)));
    }

    for helper in &mut style.base.helpers {
        compose_helper_transparency(helper, alpha);
    }

    if !compose_runtime_rules {
        return;
    }

    // A variant bundle overlays the base at render time, so whatever transparency
    // it restates has to carry the product too, or hovering snaps back to opaque.
    for rule in &mut style.runtime_rules {
        for prop in &mut rule.effects.props {
            if !names.contains(&prop.name.as_ref()) {
                continue;
            }
            if let Ok(current) = prop.value.parse::<f64>() {
                prop.value = format_transparency(compose(current, alpha));
            }
        }

        for helper in &mut rule.effects.helpers {
            compose_helper_transparency(helper, alpha);
        }
    }
}

fn compose_helper_transparency(helper: &mut HelperEntry, alpha: f64) {
    if !TRANSPARENT_HELPERS.contains(&helper.tag) {
        return;
    }

    if let Some(prop) = helper
        .props
        .iter_mut()
        .find(|prop| prop.name == "Transparency")
    {
        if let Ok(current) = prop.value.parse::<f64>() {
            prop.value = format_transparency(compose(current, alpha));
        }
        return;
    }

    helper.props.push(PropEntry {
        name: "Transparency".into(),
        value: format_transparency(compose(0.0, alpha)),
    });
}

fn compose(transparency: f64, alpha: f64) -> f64 {
    1.0 - (1.0 - transparency) * alpha
}

fn format_transparency(value: f64) -> String {
    let scale = 1_000_000.0;
    ((value.clamp(0.0, 1.0) * scale).round() / scale).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::defaults::default_config;

    fn transparency(style: &StyleIr, name: &str) -> Option<String> {
        style
            .base
            .props
            .iter()
            .find(|prop| prop.name == name)
            .map(|prop| prop.value.clone())
    }

    #[test]
    fn opacity_reads_off_the_static_tokens_only() {
        let config = default_config();

        assert_eq!(static_opacity_alpha(["opacity-50"], &config), Some(0.5));
        assert_eq!(
            static_opacity_alpha(["bg-red-500", "opacity-25"], &config),
            Some(0.25)
        );
        assert_eq!(static_opacity_alpha(["hover:opacity-50"], &config), None);
        assert_eq!(static_opacity_alpha(["opacity-full"], &config), None);
    }

    #[test]
    fn a_composed_opacity_multiplies_alpha_rather_than_transparency() {
        let mut style = StyleIr::default();
        style.set_prop("BackgroundTransparency", "0.5".to_owned());

        compose_inherited_opacity(&mut style, Some("frame"), 0.5, &[], true);

        assert_eq!(
            transparency(&style, "BackgroundTransparency").as_deref(),
            Some("0.75")
        );
    }

    #[test]
    fn a_composed_opacity_fades_every_channel_the_host_paints() {
        let mut style = StyleIr::default();

        compose_inherited_opacity(&mut style, Some("textlabel"), 0.5, &[], true);

        assert_eq!(
            transparency(&style, "TextTransparency").as_deref(),
            Some("0.5")
        );
        assert_eq!(
            transparency(&style, "BackgroundTransparency").as_deref(),
            Some("0.5")
        );
    }

    #[test]
    fn a_composed_opacity_leaves_an_author_declared_transparency_alone() {
        let mut style = StyleIr::default();

        compose_inherited_opacity(
            &mut style,
            Some("frame"),
            0.5,
            &["BackgroundTransparency".to_owned()],
            true,
        );

        assert_eq!(transparency(&style, "BackgroundTransparency"), None);
    }

    #[test]
    fn an_invisible_instance_stays_invisible() {
        let mut style = StyleIr::default();
        style.set_prop("BackgroundTransparency", "1".to_owned());

        compose_inherited_opacity(&mut style, Some("frame"), 0.5, &[], true);

        assert_eq!(
            transparency(&style, "BackgroundTransparency").as_deref(),
            Some("1")
        );
    }

    #[test]
    fn a_composed_opacity_fades_the_stroke_that_paints_with_it() {
        let mut style = StyleIr::default();
        style.set_helper_prop("uistroke", "Thickness", "1".to_owned());

        compose_inherited_opacity(&mut style, Some("frame"), 0.5, &[], true);

        let stroke = style
            .base
            .helpers
            .iter()
            .find(|helper| helper.tag == "uistroke")
            .expect("the stroke helper must survive");
        assert!(
            stroke
                .props
                .iter()
                .any(|prop| prop.name == "Transparency" && prop.value == "0.5"),
            "the stroke must fade with the instance it outlines"
        );
    }
}
