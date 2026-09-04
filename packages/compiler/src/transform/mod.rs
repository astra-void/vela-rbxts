pub(crate) mod boundary;
pub(crate) mod branch;
pub(crate) mod context;
pub(crate) mod emit;
pub(crate) mod jsx;
pub(crate) mod module;
pub(crate) mod opacity;
pub(crate) mod rem;
pub(crate) mod runtime;
pub(crate) mod runtime_host;
pub(crate) mod target;

use crate::api::{Diagnostic, EditorRange, TransformOptions, TransformResult};
use crate::config::resolve::parse_config_with_diagnostic;
use crate::transform::context::VelaTransformer;
use swc_core::{
    common::{BytePos, FileName, SourceMap, Spanned, sync::Lrc},
    ecma::{
        parser::{Syntax, TsSyntax, error::Error as ParseError, parse_file_as_module},
        visit::VisitMutWith,
    },
};

fn parse_error_diagnostic(cm: &SourceMap, file_start: BytePos, error: &ParseError) -> Diagnostic {
    let span = error.span();
    let location = cm.lookup_char_pos(span.lo());

    Diagnostic {
        level: "error".to_owned(),
        code: "tsx-parse-failed".to_owned(),
        message: format!(
            "Failed to parse TSX input at line {}, column {}: {}",
            location.line,
            location.col_display + 1,
            error.kind().msg()
        ),
        token: None,
        range: Some(EditorRange {
            start: span.lo().0.saturating_sub(file_start.0),
            end: span.hi().0.saturating_sub(file_start.0),
        }),
    }
}

pub(crate) fn transform_impl(source: String, options: Option<TransformOptions>) -> TransformResult {
    let (config, config_diagnostics) = parse_config_with_diagnostic(
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

    let mut diagnostics: Vec<Diagnostic> = config_diagnostics;

    let mut module = match parsed_module {
        Ok(module) => module,
        Err(error) => {
            diagnostics.push(parse_error_diagnostic(&cm, fm.start_pos, &error));
            return TransformResult {
                code: source,
                diagnostics,
                changed: false,
                ir: Vec::new(),
                needs_runtime_host: false,
            };
        }
    };

    if !recovered_errors.is_empty() {
        diagnostics.extend(
            recovered_errors
                .iter()
                .map(|error| parse_error_diagnostic(&cm, fm.start_pos, error)),
        );
        return TransformResult {
            code: source,
            diagnostics,
            changed: false,
            ir: Vec::new(),
            needs_runtime_host: false,
        };
    }

    let target = crate::transform::target::target_for(config.framework);
    let mut transformer = VelaTransformer {
        changed: false,
        config,
        target,
        diagnostics,
        ir: Vec::new(),
        runtime_host_needed: false,
        resolves_class_values: false,
        opacity_helper_needed: false,
        boundary_helper_needed: false,
        rem: Default::default(),
        class_value_scopes: crate::class_value::scope::ClassValueScopeStack::default(),
        opacity_alpha: 1.0,
        rem_pinned: false,
    };
    module.visit_mut_with(&mut transformer);

    let emitted_code = emit::emit_module(&cm, &module).unwrap_or_else(|error| {
        transformer.diagnostics.push(Diagnostic {
            level: "error".to_owned(),
            code: "tsx-emit-failed".to_owned(),
            message: error,
            token: None,
            range: None,
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
        needs_runtime_host: transformer.runtime_host_needed,
    }
}

#[cfg(test)]
mod tests {
    use super::transform_impl;
    use crate::api::TransformOptions;

    #[test]
    fn invalid_config_json_reports_a_diagnostic_and_uses_defaults() {
        let source = "const ui = <frame className=\"bg-slate-500\" />;".to_owned();
        let result = transform_impl(
            source,
            Some(TransformOptions {
                config_json: Some("{ not json".to_owned()),
            }),
        );

        let diagnostic = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.code == "invalid-config-json")
            .expect("malformed configJson must be reported");
        assert_eq!(diagnostic.level, "error");
        assert!(result.changed, "compilation still proceeds with defaults");
    }

    #[test]
    fn parse_failure_reports_line_and_column() {
        let result = transform_impl("const broken = <frame\n  className=;".to_owned(), None);

        let diagnostic = result
            .diagnostics
            .iter()
            .find(|diagnostic| diagnostic.code == "tsx-parse-failed")
            .expect("broken TSX must be reported");
        assert!(
            diagnostic.message.contains("line 2"),
            "message should locate the error: {}",
            diagnostic.message
        );
        assert!(diagnostic.range.is_some(), "range should anchor the error");
    }

    fn element_ir(class_name: &str) -> String {
        let result = transform_impl(
            format!("const ui = <frame className=\"{class_name}\" />;"),
            None,
        );
        result
            .ir
            .into_iter()
            .next()
            .expect("the element must produce a style IR")
    }

    fn source_ir(source: &str) -> String {
        let result = transform_impl(source.to_owned(), None);
        result
            .ir
            .into_iter()
            .next()
            .expect("the element must produce a style IR")
    }

    fn no_preflight_ir(class_name: &str) -> String {
        let mut config = crate::config::defaults::default_config();
        config.preflight = false;

        let result = transform_impl(
            format!("const ui = <frame className=\"{class_name}\" />;"),
            Some(TransformOptions {
                config_json: Some(
                    serde_json::to_string(&config).expect("config must serialize to JSON"),
                ),
            }),
        );
        result
            .ir
            .into_iter()
            .next()
            .expect("the element must produce a style IR")
    }

    fn base_props(ir: &str) -> &str {
        ir.split_once("\"runtimeRules\"")
            .map_or(ir, |(base, _)| base)
    }

    #[test]
    fn preflight_neutralizes_the_roblox_host_defaults() {
        let ir = element_ir("w-full");

        assert!(
            ir.contains("\"BackgroundTransparency\",\"value\":\"1\""),
            "an unpainted element must not fall back to the default gray box: {ir}"
        );
        assert!(
            ir.contains("\"BorderSizePixel\",\"value\":\"0\""),
            "the default 1px border must go with it: {ir}"
        );
    }

    #[test]
    fn preflight_leaves_a_painted_background_opaque() {
        let ir = element_ir("bg-slate-700");

        assert!(
            !ir.contains("BackgroundTransparency"),
            "a bg-* utility already means opaque, so preflight has nothing to neutralize: {ir}"
        );
    }

    #[test]
    fn preflight_carries_a_variant_background_over_the_neutralized_base() {
        let ir = element_ir("hover:bg-blue-600");
        let (base, rules) = ir
            .split_once("\"runtimeRules\"")
            .expect("the hover variant must survive as a runtime rule");

        assert!(
            base.contains("\"BackgroundTransparency\",\"value\":\"1\""),
            "the base stays neutralized: {ir}"
        );
        assert!(
            rules.contains("\"BackgroundTransparency\",\"value\":\"0\""),
            "the variant must reopen the background it paints: {ir}"
        );
    }

    #[test]
    fn preflight_defers_to_a_declared_prop() {
        let ir =
            source_ir("const ui = <frame BackgroundTransparency={0.25} className=\"w-full\" />;");

        assert!(
            !base_props(&ir).contains("BackgroundTransparency"),
            "an explicitly declared prop outranks the neutralization: {ir}"
        );
    }

    #[test]
    fn preflight_can_be_turned_off() {
        let ir = no_preflight_ir("w-full");

        assert!(
            !ir.contains("BackgroundTransparency") && !ir.contains("BorderSizePixel"),
            "`preflight: false` must leave the engine defaults alone: {ir}"
        );
    }

    #[test]
    fn a_variant_color_clears_the_base_opacity_modifier() {
        let ir = element_ir("bg-blue-600/50 hover:bg-blue-600");
        let rules = ir
            .split_once("\"runtimeRules\"")
            .expect("the hover variant must survive as a runtime rule")
            .1;

        assert!(
            rules.contains("BackgroundTransparency"),
            "the variant must state the opaque value to override the base /50: {ir}"
        );
    }

    #[test]
    fn the_runtime_host_is_imported_and_typed_from_the_host_tag() {
        let result = transform_impl(
            "const ui = <frame className=\"bg-slate-700 hover:bg-blue-600\" />;".to_owned(),
            None,
        );

        assert!(
            result.needs_runtime_host,
            "a hover variant must promote the element to the runtime host"
        );
        // The runtime is one ModuleScript the whole game shares. Carried inline
        // it cost every consumer a copy of itself, and Luau caps a function at
        // 200 local registers — a component with enough parts of its own stopped
        // compiling.
        assert!(
            result.code.contains("from \"@rbxts/vela-runtime\""),
            "the runtime must arrive as an import, not as a copy: {}",
            result.code
        );
        assert!(
            !result.code.contains("namespace __VelaToken"),
            "no part of the runtime should be inlined: {}",
            result.code
        );
        assert!(
            result
                .code
                .contains("as unknown as VelaRuntimeHostComponent"),
            "the host instance must be cast to that component type"
        );
    }

    /// The preamble declares a binding and the lowered element reaches for it.
    /// Both names come off the target now, and a target that disagreed with
    /// itself would fail at the consumer's build rather than here.
    #[test]
    fn the_host_binding_the_preamble_declares_is_the_one_elements_are_retagged_to() {
        let host = crate::transform::target::react_target().host_element_name();
        let result = transform_impl(
            "const ui = <frame className=\"hover:bg-red-500\" />;".to_owned(),
            None,
        );

        assert!(
            result.code.contains(&format!("const {host} =")),
            "the preamble must declare `{host}`: {}",
            result.code
        );
        assert!(
            result.code.contains(&format!("<{host} ")),
            "the lowered element must be retagged to `{host}`: {}",
            result.code
        );
    }

    fn vide_config_json() -> String {
        let mut config = crate::config::defaults::default_config();
        config.framework = crate::config::model::Framework::Vide;
        serde_json::to_string(&config).expect("config must serialize to JSON")
    }

    /// The one emit shape the two targets cannot share. A React host is handed
    /// the boolean because a re-render brings the next one; a Vide component
    /// body runs once, so a test that arrived evaluated would pin its rule to
    /// whatever happened to be true at creation.
    #[test]
    fn the_vide_target_defers_branch_tests_and_react_does_not() {
        let source = "const ui = <frame className={active ? \"bg-red-500\" : \"bg-blue-500\"} />;"
            .to_owned();

        let react = transform_impl(source.clone(), None);
        let vide = transform_impl(
            source,
            Some(TransformOptions {
                config_json: Some(vide_config_json()),
            }),
        );

        let flatten = |code: &str| code.split_whitespace().collect::<Vec<_>>().join(" ");

        assert!(
            flatten(&react.code).contains("__velaTests={[ active ? true : false ]}"),
            "react must hand the host the evaluated test: {}",
            react.code
        );
        assert!(
            flatten(&vide.code).contains("__velaTests={[ ()=>active ? true : false ]}"),
            "vide must hand the host a thunk: {}",
            vide.code
        );
    }

    /// A Vide source is read through a thunk, so a class value that depends on
    /// one is written as an arrow. Left unopened it would take the whole class
    /// list to the runtime; opened, it lowers exactly like a plain one and the
    /// tests it hangs on go back deferred.
    #[test]
    fn the_vide_target_collapses_a_deferred_class_value() {
        let source =
            "const ui = <frame className={() => active() ? \"bg-red-500\" : \"bg-blue-500\"} />;"
                .to_owned();
        let result = transform_impl(
            source,
            Some(TransformOptions {
                config_json: Some(vide_config_json()),
            }),
        );
        let flat = result.code.split_whitespace().collect::<Vec<_>>().join(" ");

        assert!(
            flat.contains("__velaTests={[ ()=>active() ? true : false ]}"),
            "the arrow's test must reach the host deferred: {}",
            result.code
        );
        assert!(
            !flat.contains("className="),
            "nothing should be left for the runtime to parse: {}",
            result.code
        );
        assert!(
            flat.contains("\"kind\": \"test\""),
            "the branches must lower to rules: {}",
            result.code
        );
    }

    /// What the collapser could not read still has to go back as a thunk. Read
    /// once, it would hold whatever its sources said at creation.
    #[test]
    fn a_deferred_class_value_leaves_its_remainder_deferred() {
        let source = "const ui = <frame className={() => \"p-2 \" + label()} />;".to_owned();
        let result = transform_impl(
            source,
            Some(TransformOptions {
                config_json: Some(vide_config_json()),
            }),
        );

        assert!(
            result.code.contains("className={()=>\"p-2 \" + label()}"),
            "the remainder must stay deferred: {}",
            result.code
        );
    }

    /// A margin is the one effect a target that builds bottom-up cannot apply
    /// after the fact, because the box it needs goes above an element that is
    /// already parented. No rule can carry one either, so the branch takes the
    /// whole class value to the runtime — and the host is told to expect it.
    #[test]
    fn a_margin_only_a_branch_names_is_hinted_to_the_vide_host() {
        let source =
            "const ui = <frame className={() => on() ? \"m-4 p-2\" : \"p-2\"} />;".to_owned();

        let react = transform_impl(source.clone(), None);
        let vide = transform_impl(
            source,
            Some(TransformOptions {
                config_json: Some(vide_config_json()),
            }),
        );

        assert!(
            vide.code.contains("__velaMarginBox={true}"),
            "the vide host must be told a margin is coming: {}",
            vide.code
        );
        // React renders the wrapper on the render that resolves the margin, and
        // a prop no host reads would land on the instance.
        assert!(
            !react.code.contains("__velaMarginBox"),
            "react must not be handed the hint: {}",
            react.code
        );
    }

    /// The hint is for what the runtime still has to resolve. A margin this
    /// pass read outright travels as the margin itself.
    #[test]
    fn a_statically_known_margin_is_not_hinted() {
        let result = transform_impl(
            "const ui = <frame className=\"m-4 p-2\" />;".to_owned(),
            Some(TransformOptions {
                config_json: Some(vide_config_json()),
            }),
        );

        assert!(
            result.code.contains("__velaMargin={"),
            "the margin itself must travel: {}",
            result.code
        );
        assert!(
            !result.code.contains("__velaMarginBox"),
            "nothing is left to expect: {}",
            result.code
        );
    }

    /// React has no deferred class value, so the arrow is a value like any
    /// other and opening it would change what the element renders.
    #[test]
    fn the_react_target_leaves_an_arrow_class_value_alone() {
        let source =
            "const ui = <frame className={() => active() ? \"bg-red-500\" : \"bg-blue-500\"} />;"
                .to_owned();
        let result = transform_impl(source, None);

        assert!(
            result.code.contains("className={()=>active()"),
            "react must hand the arrow over untouched: {}",
            result.code
        );
    }

    /// A Vide place must never resolve the React runtime, which is the whole
    /// reason the two ship as separate packages.
    #[test]
    fn each_target_imports_only_its_own_runtime() {
        let source = "const ui = <frame className=\"hover:bg-red-500\" />;".to_owned();

        let react = transform_impl(source.clone(), None);
        let vide = transform_impl(
            source,
            Some(TransformOptions {
                config_json: Some(vide_config_json()),
            }),
        );

        assert!(react.code.contains("from \"@rbxts/vela-runtime\""));
        assert!(!react.code.contains("vela-runtime-vide"));
        assert!(vide.code.contains("from \"@rbxts/vela-runtime-vide\""));
    }

    #[test]
    fn a_variant_color_leaves_opacity_alone_when_the_base_never_set_it() {
        let ir = element_ir("bg-blue-600 hover:bg-rose-500");

        assert!(
            !ir.contains("BackgroundTransparency"),
            "nothing set a transparency, so none should be emitted: {ir}"
        );
    }
}
