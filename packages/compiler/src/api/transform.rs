use crate::api::{TransformOptions, TransformResult};

pub(crate) fn transform_impl(source: String, options: Option<TransformOptions>) -> TransformResult {
    crate::transform::transform_impl(source, options)
}
