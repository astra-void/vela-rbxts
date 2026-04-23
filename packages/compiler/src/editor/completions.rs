use crate::api::{CompletionItem, CompletionRequest, CompletionResponse};
use crate::config::model::TailwindConfig;
use crate::editor::{
    class_name_context_at_position, current_prefix, current_token_replacement,
    tokenize_class_name_with_ranges,
};
use crate::semantic::variant::RUNTIME_VARIANTS;
use crate::utilities::{
    color::color_completion_keys, radius::radius_completion_keys, size::size_completion_keys,
    spacing::spacing_completion_keys,
};

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
        if crate::editor::is_utility_allowed_on_host(element_tag, &base.label) {
            push_completion_item(&mut items, base.clone());
        }

        for variant in RUNTIME_VARIANTS {
            let label = format!("{variant}:{}", base.label);
            if crate::editor::is_utility_allowed_on_host(element_tag, &label) {
                push_completion(
                    &mut items,
                    &label,
                    &base.category,
                    &base.kind,
                    &format!("Runtime variant of {}. {}", base.label, base.documentation),
                );
            }
        }
    }

    items
}

fn base_utility_candidates(config: &TailwindConfig) -> Vec<CompletionItem> {
    let mut items = Vec::new();

    for (prefix, prop, category) in [
        ("bg", "BackgroundColor3", "color"),
        ("text", "TextColor3", "color"),
        ("image", "ImageColor3", "color"),
        ("placeholder", "PlaceholderColor3", "color"),
    ] {
        for color_key in color_completion_keys(config) {
            push_completion(
                &mut items,
                &format!("{prefix}-{color_key}"),
                category,
                "utility",
                &format!("Set Roblox {prop} from theme color `{color_key}`."),
            );
        }
        push_completion(
            &mut items,
            &format!("{prefix}-transparent"),
            category,
            "utility",
            &format!("Use the transparent keyword for Roblox {prop}."),
        );
    }

    for key in radius_completion_keys(config) {
        push_completion(
            &mut items,
            &format!("rounded-{key}"),
            "radius",
            "utility",
            &format!("Set UICorner.CornerRadius from theme radius `{key}`."),
        );
    }

    for key in crate::transform::runtime::Z_INDEX_VALUES {
        push_completion(
            &mut items,
            &format!("z-{key}"),
            "stacking",
            "utility",
            &format!("Set Roblox ZIndex to `{key}`."),
        );
    }

    let spacing_keys = spacing_completion_keys(config);
    for prefix in ["p", "px", "py", "pt", "pr", "pb", "pl", "gap"] {
        for key in &spacing_keys {
            let target = if prefix == "gap" {
                "UIListLayout.Padding"
            } else {
                "UIPadding"
            };
            push_completion(
                &mut items,
                &format!("{prefix}-{key}"),
                "spacing",
                "utility",
                &format!("Set Roblox {target} from spacing `{key}`."),
            );
        }
    }

    for prefix in ["w", "h", "size"] {
        for key in size_completion_keys(config) {
            push_completion(
                &mut items,
                &format!("{prefix}-{key}"),
                "size",
                "utility",
                &format!("Set Roblox Size using `{prefix}-{key}`."),
            );
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
