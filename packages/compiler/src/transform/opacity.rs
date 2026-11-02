use crate::class_value::collapse::ClassValueCollapse;
use crate::config::model::TailwindConfig;
use crate::ir::model::{
    HelperEntry, PropEntry, RuntimeCondition, RuntimeRule, StyleEffectBundle, StyleIr,
};
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

    // Separators are children the runtime host inserts, so they fade with the
    // subtree, which a CanvasGroup already composites as a whole.
    if element_tag != Some("canvasgroup")
        && let Some(divide) = style.divide.as_mut()
    {
        divide.transparency = Some(compose(divide.transparency.unwrap_or(0.0), alpha));
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

    restate_unset_channels(style, names, declared_props, alpha);
}

/// A rule's `ChannelAlpha` fades a channel nothing restated from opaque, which
/// would drop this alpha, so the always-on rule restates those channels under it.
/// A channel that stays transparent, as a preflight-neutralized background
/// does, is left for the runtime to leave alone.
fn restate_unset_channels(
    style: &mut StyleIr,
    names: &[&'static str],
    declared_props: &[String],
    alpha: f64,
) {
    let deferred = style.runtime_rules.iter().any(|rule| {
        rule.effects
            .props
            .iter()
            .any(|prop| prop.name == CHANNEL_ALPHA_PROP)
    });
    if !deferred {
        return;
    }

    let missing: Vec<PropEntry> = names
        .iter()
        .filter(|name| !declared_props.iter().any(|declared| declared == **name))
        .filter(|name| {
            style
                .base
                .props
                .iter()
                .find(|prop| prop.name == **name)
                .and_then(|prop| prop.value.parse::<f64>().ok())
                != Some(1.0)
        })
        .map(|name| PropEntry {
            name: (*name).into(),
            value: format_transparency(compose(0.0, alpha)),
        })
        .collect();

    let always_on = matches!(
        style.runtime_rules.first(),
        Some(RuntimeRule {
            condition: RuntimeCondition::All { conditions },
            ..
        }) if conditions.is_empty()
    );
    if !always_on {
        style.runtime_rules.insert(
            0,
            RuntimeRule {
                condition: RuntimeCondition::All {
                    conditions: Vec::new(),
                },
                effects: StyleEffectBundle::default(),
            },
        );
    }

    let resting = &mut style.runtime_rules[0].effects.props;
    for entry in missing {
        if !resting.iter().any(|prop| prop.name == entry.name) {
            resting.push(entry);
        }
    }
}

/// The rule prop the runtime fades the element's own channels and drawing
/// helpers by, once every rule that applies has had its say. Unlike a class
/// token's `OpacityAlpha` it stops at the element: the subtree was already faded
/// where this pass could see it.
pub(crate) const CHANNEL_ALPHA_PROP: &str = "ChannelAlpha";

/// A variant `opacity-*` replaces the element's own alpha while it applies,
/// over whatever else applies with it, and only the runtime knows which rules
/// those are. So each opacity rule names its alpha alone, and an always-on rule
/// carries what the alpha composes over: the channels the base set before any
/// alpha, the drawing helpers it reaches, and the element's own alpha.
pub(crate) fn defer_variant_opacity(
    style: &mut StyleIr,
    element_tag: Option<&str>,
    own_alpha: Option<f64>,
    variant_rules: &[(usize, f64)],
) {
    for (index, alpha) in variant_rules {
        style.runtime_rules[*index].effects = StyleEffectBundle {
            props: vec![channel_alpha_entry(*alpha)],
            helpers: Vec::new(),
        };
    }

    let names = opacity_transparency_props(element_tag);
    let mut props: Vec<PropEntry> = style
        .base
        .props
        .iter()
        .filter(|prop| names.contains(&prop.name.as_ref()))
        .cloned()
        .collect();
    props.extend(own_alpha.map(channel_alpha_entry));

    let (helpers, kept): (Vec<_>, Vec<_>) = std::mem::take(&mut style.base.helpers)
        .into_iter()
        .partition(|helper| TRANSPARENT_HELPERS.contains(&helper.tag));
    style.base.helpers = kept;

    if props.is_empty() && helpers.is_empty() {
        return;
    }

    style.runtime_rules.insert(
        0,
        RuntimeRule {
            condition: RuntimeCondition::All {
                conditions: Vec::new(),
            },
            effects: StyleEffectBundle { props, helpers },
        },
    );
}

/// A component's own alpha as a rule prop, which a variant's replaces while it
/// applies: the runtime hands whichever wins to what the component renders.
pub(crate) fn opacity_alpha_entry(alpha: f64) -> PropEntry {
    PropEntry {
        name: "OpacityAlpha".into(),
        value: format_transparency(alpha),
    }
}

fn channel_alpha_entry(alpha: f64) -> PropEntry {
    PropEntry {
        name: CHANNEL_ALPHA_PROP.into(),
        value: format_transparency(alpha),
    }
}

/// What `transparency` comes to under `alpha`, written the way the IR writes it.
pub(crate) fn composed_transparency(transparency: f64, alpha: f64) -> String {
    format_transparency(compose(transparency, alpha))
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
    fn a_composed_opacity_fades_the_separators_a_divide_inserts() {
        let divide = || crate::ir::model::DivideSpec {
            axis: "y".to_owned(),
            thickness: 1.0,
            color: None,
            transparency: Some(0.5),
        };

        let mut frame = StyleIr {
            divide: Some(divide()),
            ..StyleIr::default()
        };
        compose_inherited_opacity(&mut frame, Some("frame"), 0.5, &[], true);
        assert_eq!(
            frame.divide.and_then(|divide| divide.transparency),
            Some(0.75)
        );

        let mut group = StyleIr {
            divide: Some(divide()),
            ..StyleIr::default()
        };
        compose_inherited_opacity(&mut group, Some("canvasgroup"), 0.5, &[], true);
        assert_eq!(
            group.divide.and_then(|divide| divide.transparency),
            Some(0.5),
            "a CanvasGroup's GroupTransparency already fades what it contains"
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
