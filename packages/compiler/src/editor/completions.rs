use crate::api::{CompletionItem, CompletionRequest, CompletionResponse};
use crate::config::model::TailwindConfig;
use crate::editor::{
    class_name_context_at_position, current_prefix, current_token_replacement,
    tokenize_class_name_with_ranges,
};
use crate::semantic::{
    utility::{
        PaddingKind, UtilityKind, Z_INDEX_VALUES, color_completion_keys,
        is_utility_allowed_on_host, radius_completion_keys, size_completion_keys,
        spacing_completion_keys,
    },
    variant::RUNTIME_VARIANTS,
};

struct CompletionSpec {
    item: CompletionItem,
    utility_kind: UtilityKind,
}

pub(crate) fn get_completions_impl(request: CompletionRequest) -> CompletionResponse {
    let config = crate::editor::parse_editor_config(request.options.as_ref());
    let Some(context) = class_name_context_at_position(&request.source, request.position) else {
        return CompletionResponse {
            is_in_class_name_context: false,
            items: Vec::new(),
        };
    };

    let tokens = tokenize_class_name_with_ranges(&context.value, context.value_range.start);
    let replacement = current_token_replacement(&tokens, request.position);
    let prefix = current_prefix(&tokens, &replacement, request.position);
    let items = completion_candidates(&config, &context.element_tag)
        .into_iter()
        .filter(|item| item.label.starts_with(&prefix))
        .map(|mut item| {
            item.replacement = Some(replacement.clone());
            item
        })
        .collect();

    CompletionResponse {
        is_in_class_name_context: true,
        items,
    }
}

fn completion_candidates(config: &TailwindConfig, element_tag: &str) -> Vec<CompletionItem> {
    let mut items = Vec::new();

    for variant in RUNTIME_VARIANTS {
        push_completion(
            &mut items,
            &format!("{variant}:"),
            "variant",
            "runtime variant",
            &format!(
                "Apply the following vela-rbxts utility when the {variant} condition matches."
            ),
        );
    }

    for base in base_utility_candidates(config) {
        if is_utility_allowed_on_host(element_tag, &base.utility_kind) {
            push_completion_item(&mut items, base.item.clone());
        }

        for variant in RUNTIME_VARIANTS {
            let label = format!("{variant}:{}", base.item.label);
            if is_utility_allowed_on_host(element_tag, &base.utility_kind) {
                push_completion(
                    &mut items,
                    &label,
                    &base.item.category,
                    &base.item.kind,
                    &format!(
                        "Runtime variant of {}. {}",
                        base.item.label, base.item.documentation
                    ),
                );
            }
        }
    }

    items
}

fn base_utility_candidates(config: &TailwindConfig) -> Vec<CompletionSpec> {
    let mut items = Vec::new();

    for (prefix, prop, category, utility_kind) in [
        (
            "bg",
            "BackgroundColor3",
            "color",
            UtilityKind::BackgroundColor,
        ),
        ("text", "TextColor3", "color", UtilityKind::TextColor),
        ("image", "ImageColor3", "color", UtilityKind::ImageColor),
        (
            "placeholder",
            "PlaceholderColor3",
            "color",
            UtilityKind::PlaceholderColor,
        ),
    ] {
        for color_key in color_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{color_key}"),
                    insert_text: format!("{prefix}-{color_key}"),
                    kind: "utility".to_owned(),
                    category: category.to_owned(),
                    documentation: format!("Set Roblox {prop} from theme color `{color_key}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("{prefix}-transparent"),
                insert_text: format!("{prefix}-transparent"),
                kind: "utility".to_owned(),
                category: category.to_owned(),
                documentation: format!("Use the transparent keyword for Roblox {prop}."),
                replacement: None,
            },
            utility_kind,
        });
    }

    for key in radius_completion_keys(config) {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("rounded-{key}"),
                insert_text: format!("rounded-{key}"),
                kind: "utility".to_owned(),
                category: "radius".to_owned(),
                documentation: format!("Set UICorner.CornerRadius from theme radius `{key}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::Radius,
        });
    }

    for key in Z_INDEX_VALUES {
        items.push(CompletionSpec {
            item: CompletionItem {
                label: format!("z-{key}"),
                insert_text: format!("z-{key}"),
                kind: "utility".to_owned(),
                category: "stacking".to_owned(),
                documentation: format!("Set Roblox ZIndex to `{key}`."),
                replacement: None,
            },
            utility_kind: UtilityKind::ZIndex,
        });
    }

    let spacing_keys = spacing_completion_keys(config);
    for (prefix, utility_kind) in [
        ("p", UtilityKind::Padding(PaddingKind::All)),
        ("px", UtilityKind::Padding(PaddingKind::X)),
        ("py", UtilityKind::Padding(PaddingKind::Y)),
        ("pt", UtilityKind::Padding(PaddingKind::Top)),
        ("pr", UtilityKind::Padding(PaddingKind::Right)),
        ("pb", UtilityKind::Padding(PaddingKind::Bottom)),
        ("pl", UtilityKind::Padding(PaddingKind::Left)),
        ("gap", UtilityKind::Gap),
    ] {
        for key in &spacing_keys {
            let target = if prefix == "gap" {
                "UIListLayout.Padding"
            } else {
                "UIPadding"
            };
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "spacing".to_owned(),
                    documentation: format!("Set Roblox {target} from spacing `{key}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    for (prefix, utility_kind) in [
        ("w", UtilityKind::Width),
        ("h", UtilityKind::Height),
        ("size", UtilityKind::Size),
    ] {
        for key in size_completion_keys(config) {
            items.push(CompletionSpec {
                item: CompletionItem {
                    label: format!("{prefix}-{key}"),
                    insert_text: format!("{prefix}-{key}"),
                    kind: "utility".to_owned(),
                    category: "size".to_owned(),
                    documentation: format!("Set Roblox Size using `{prefix}-{key}`."),
                    replacement: None,
                },
                utility_kind: utility_kind.clone(),
            });
        }
    }

    items
}

fn push_completion(
    items: &mut Vec<CompletionItem>,
    label: &str,
    category: &str,
    kind: &str,
    documentation: &str,
) {
    push_completion_item(
        items,
        CompletionItem {
            label: label.to_owned(),
            insert_text: label.to_owned(),
            kind: kind.to_owned(),
            category: category.to_owned(),
            documentation: documentation.to_owned(),
            replacement: None,
        },
    );
}

fn push_completion_item(items: &mut Vec<CompletionItem>, item: CompletionItem) {
    if !items.iter().any(|existing| existing.label == item.label) {
        items.push(item);
    }
}
