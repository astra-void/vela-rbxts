use crate::api::{InlayHint, InlayHintsRequest, InlayHintsResponse};
use crate::editor::{collect_class_name_contexts, tokenize_class_name_with_ranges};
use crate::ir::model::{PropEntry, StyleIr};
use crate::transform::runtime::resolve_class_tokens;

/// The Roblox class a helper tag names. The tags are the lowercase JSX ones the
/// emit writes; a hint reads better with the name the API uses.
fn helper_class_name(tag: &str) -> &'static str {
    match tag {
        "uiaspectratioconstraint" => "UIAspectRatioConstraint",
        "uicorner" => "UICorner",
        "uiflexitem" => "UIFlexItem",
        "uigradient" => "UIGradient",
        "uigridlayout" => "UIGridLayout",
        "uilistlayout" => "UIListLayout",
        "uipadding" => "UIPadding",
        "uiscale" => "UIScale",
        "uishadow" => "UIShadow",
        "uisizeconstraint" => "UISizeConstraint",
        "uistroke" => "UIStroke",
        _ => "UI helper",
    }
}

/// How long a hint may get before it stops being a summary. A `p-4` is one
/// word; a plugin utility that expands to a dozen classes is not, and the whole
/// point of the hint is that it fits on the line.
const MAX_HINT_LENGTH: usize = 64;

/// What each class in the file lowers to, as one hint per token. This is the
/// compiler's own lowering, read back: the editor has no second semantic
/// model of its own, so a hint can never disagree with the emit.
pub(crate) fn get_inlay_hints_impl(request: InlayHintsRequest) -> InlayHintsResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let mut hints = Vec::new();

    for context in collect_class_name_contexts(&request.source) {
        for token in tokenize_class_name_with_ranges(&context.value, context.value_range.start) {
            if context.splices_into(&token) {
                continue;
            }

            let mut diagnostics = Vec::new();
            let style = resolve_class_tokens(
                vec![token.text.as_str()],
                &config,
                context.element_tag.as_deref(),
                &mut diagnostics,
            );

            // A token that reported anything is already flagged where it is
            // written; a hint beside the squiggle would only be noise.
            if !diagnostics.is_empty() {
                continue;
            }

            let Some(summary) = summarize(&style) else {
                continue;
            };

            hints.push(InlayHint {
                position: token.range.end,
                label: truncate(&summary),
                tooltip: summary,
                token: token.text.clone(),
            });
        }
    }

    InlayHintsResponse { hints }
}

fn truncate(label: &str) -> String {
    if label.chars().count() <= MAX_HINT_LENGTH {
        return label.to_owned();
    }

    let kept: String = label.chars().take(MAX_HINT_LENGTH - 1).collect();
    format!("{kept}\u{2026}")
}

/// The Roblox properties and helper instances one class came to, named rather
/// than valued: the value is what hover is for, and a hint that spelled out
/// every expression would be unreadable.
fn summarize(style: &StyleIr) -> Option<String> {
    let mut parts = Vec::new();

    push_bundle(&mut parts, &style.base.props, &style.base.helpers);

    for rule in &style.runtime_rules {
        push_bundle(&mut parts, &rule.effects.props, &rule.effects.helpers);
    }

    if style.transition.is_some() {
        parts.push("TweenService".to_owned());
    }
    if style.animation.is_some() {
        parts.push("animation".to_owned());
    }
    if style.text.is_some() {
        parts.push("Text".to_owned());
    }
    if style.margin.is_some() {
        parts.push("margin box".to_owned());
    }
    if style.divide.is_some() {
        parts.push("divider frames".to_owned());
    }
    if style.opacity_alpha.is_some() {
        parts.push("inherited opacity".to_owned());
    }

    parts.dedup();

    if parts.is_empty() {
        return None;
    }

    Some(parts.join(", "))
}

fn push_bundle(
    parts: &mut Vec<String>,
    props: &[PropEntry],
    helpers: &[crate::ir::model::HelperEntry],
) {
    if !props.is_empty() {
        let names: Vec<&str> = props.iter().map(|prop| prop.name.as_ref()).collect();
        parts.push(fold_names(&names));
    }

    for helper in helpers {
        let names: Vec<&str> = helper.props.iter().map(|prop| prop.name.as_ref()).collect();
        let class = helper_class_name(helper.tag);

        if names.is_empty() {
            parts.push(class.to_owned());
        } else {
            parts.push(format!("{class}.{}", fold_names(&names)));
        }
    }
}

/// `PaddingTop`, `PaddingRight`, … as `PaddingTop/Right/Bottom/Left`. Sides of
/// one property read as one thing, which is what the hint is trying to say.
fn fold_names(names: &[&str]) -> String {
    let Some(first) = names.first() else {
        return String::new();
    };

    if names.len() == 1 {
        return (*first).to_owned();
    }

    let prefix = common_prefix(names);
    if prefix.len() < 3 {
        return names.join(", ");
    }

    let mut folded = (*first).to_owned();
    for name in &names[1..] {
        folded.push('/');
        folded.push_str(&name[prefix.len()..]);
    }

    folded
}

fn common_prefix<'a>(names: &[&'a str]) -> &'a str {
    let Some(first) = names.first().copied() else {
        return "";
    };

    let mut length = first.len();
    for name in &names[1..] {
        length = length.min(
            first
                .char_indices()
                .zip(name.char_indices())
                .take_while(|((_, left), (_, right))| left == right)
                .map(|((index, ch), _)| index + ch.len_utf8())
                .last()
                .unwrap_or(0),
        );
    }

    // A whole name is not a prefix of the group; folding there would leave an
    // empty tail.
    if names.iter().any(|name| name.len() == length) {
        return "";
    }

    &first[..length]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::EditorOptions;

    fn hints(source: &str) -> Vec<(String, String)> {
        get_inlay_hints_impl(InlayHintsRequest {
            source: source.to_owned(),
            options: None::<EditorOptions>,
        })
        .hints
        .into_iter()
        .map(|hint| (hint.token, hint.label))
        .collect()
    }

    #[test]
    fn summarizes_what_each_utility_lowers_to() {
        let hints = hints("const a = <frame className=\"p-4 bg-blue-600 rounded-lg\" />;");

        assert_eq!(
            hints,
            vec![
                (
                    "p-4".to_owned(),
                    "UIPadding.PaddingTop/Right/Bottom/Left".to_owned()
                ),
                ("bg-blue-600".to_owned(), "BackgroundColor3".to_owned()),
                ("rounded-lg".to_owned(), "UICorner.CornerRadius".to_owned()),
            ]
        );
    }

    #[test]
    fn summarizes_a_variant_by_what_its_rule_writes() {
        let hints = hints("const a = <frame className=\"hover:bg-blue-600\" />;");

        assert_eq!(
            hints
                .iter()
                .map(|(_, label)| label.as_str())
                .collect::<Vec<_>>(),
            vec!["BackgroundColor3"]
        );
    }

    #[test]
    fn says_nothing_about_a_token_that_is_already_flagged() {
        assert!(hints("const a = <frame className=\"blorb-2\" />;").is_empty());
    }
}
