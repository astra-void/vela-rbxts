use crate::config::model::TailwindConfig;
use crate::ir::model::SizeAxisValue;

pub(crate) fn size_completion_keys(config: &TailwindConfig) -> Vec<String> {
    let mut keys = crate::utilities::spacing::spacing_completion_keys(config);
    for key in [
        "px", "full", "fit", "1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5", "1/6",
        "5/6", "1/12", "5/12", "11/12",
    ] {
        push_unique(&mut keys, key.to_owned());
    }
    keys
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

pub(crate) fn format_size_prop(
    width: Option<SizeAxisValue>,
    height: Option<SizeAxisValue>,
) -> String {
    let width = width.unwrap_or_else(SizeAxisValue::zero);
    let height = height.unwrap_or_else(SizeAxisValue::zero);

    if width.scale == "0" && height.scale == "0" {
        return format!("UDim2.fromOffset({}, {})", width.offset, height.offset);
    }

    if width.offset == "0" && height.offset == "0" {
        return format!("UDim2.fromScale({}, {})", width.scale, height.scale);
    }

    format!(
        "UDim2.new({}, {}, {}, {})",
        width.scale, width.offset, height.scale, height.offset
    )
}
