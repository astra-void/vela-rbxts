use crate::api::TransformOptions;
use wasm_bindgen::prelude::*;

pub(crate) fn transform_wasm(source: String, options: JsValue) -> Result<JsValue, JsValue> {
    let options = parse_wasm_transform_options(options)?;
    let result = crate::transform::transform_impl(source, options);
    serde_wasm_bindgen::to_value(&result).map_err(|error| {
        JsValue::from_str(&format!("Failed to serialize transform result: {error}"))
    })
}

fn parse_wasm_transform_options(options: JsValue) -> Result<Option<TransformOptions>, JsValue> {
    if options.is_null() || options.is_undefined() {
        return Ok(None);
    }

    serde_wasm_bindgen::from_value(options)
        .map(Some)
        .map_err(|error| {
            JsValue::from_str(&format!(
                "Failed to deserialize transform options from wasm input: {error}"
            ))
        })
}
