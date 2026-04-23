pub(crate) mod context;
pub(crate) mod emit;
pub(crate) mod jsx;
pub(crate) mod module;
pub(crate) mod runtime;

use crate::api::{Diagnostic, TransformOptions, TransformResult};
use crate::config::resolve::parse_config;
use crate::transform::context::TailwindTransformer;
use swc_core::{
    common::{FileName, SourceMap, sync::Lrc},
    ecma::{
        parser::{Syntax, TsSyntax, parse_file_as_module},
        visit::VisitMutWith,
    },
};

pub(crate) fn transform_impl(source: String, options: Option<TransformOptions>) -> TransformResult {
    let config = parse_config(
        options
            .as_ref()
            .and_then(|value| value.config_json.as_deref()),
    );
    let cm: Lrc<SourceMap> = Default::default();
    let fm = cm.new_source_file(FileName::Custom("input.tsx".into()).into(), source.clone());
    let mut recovered_errors = Vec::new();
    let parsed_module = parse_file_as_module(
        &fm,
        Syntax::Typescript(TsSyntax {
            decorators: true,
            tsx: true,
            ..Default::default()
        }),
        Default::default(),
        None,
        &mut recovered_errors,
    );

    let mut module = match parsed_module {
        Ok(module) => module,
        Err(error) => {
            return TransformResult {
                code: source,
                diagnostics: vec![Diagnostic {
                    level: "error".to_owned(),
                    code: "tsx-parse-failed".to_owned(),
                    message: format!("Failed to parse TSX input: {error:?}"),
                    token: None,
                }],
                changed: false,
                ir: Vec::new(),
            };
        }
    };

    if !recovered_errors.is_empty() {
        return TransformResult {
            code: source,
            diagnostics: vec![Diagnostic {
                level: "error".to_owned(),
                code: "tsx-parse-failed".to_owned(),
                message: format!("Recovered parse errors in TSX input: {recovered_errors:?}"),
                token: None,
            }],
            changed: false,
            ir: Vec::new(),
        };
    }

    let mut transformer = TailwindTransformer {
        changed: false,
        config,
        diagnostics: Vec::new(),
        ir: Vec::new(),
        runtime_import_needed: false,
        class_value_scopes: crate::class_value::scope::ClassValueScopeStack::default(),
    };
    module.visit_mut_with(&mut transformer);

    let emitted_code = emit::emit_module(&cm, &module).unwrap_or_else(|error| {
        transformer.diagnostics.push(Diagnostic {
            level: "error".to_owned(),
            code: "tsx-emit-failed".to_owned(),
            message: error,
            token: None,
        });
        source
    });

    TransformResult {
        code: emitted_code,
        diagnostics: transformer.diagnostics,
        changed: transformer.changed,
        ir: transformer
            .ir
            .into_iter()
            .map(|style| serde_json::to_string(&style).expect("style IR must serialize to JSON"))
            .collect(),
    }
}
