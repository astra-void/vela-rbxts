pub(crate) mod boundary;
pub(crate) mod branch;
pub(crate) mod conflicts;
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
    common::{BytePos, FileName, LineCol, SourceFile, SourceMap, Spanned, sync::Lrc},
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

// Columns count UTF-16 units on both sides, which is how TypeScript reports a character.
fn mapping_quads(fm: &SourceFile, raw: &[(BytePos, LineCol)]) -> Vec<u32> {
    let original: &str = &fm.src;
    let content_start = if original.starts_with('\u{feff}') {
        '\u{feff}'.len_utf8()
    } else {
        0
    };
    let mut line_starts = vec![content_start];
    let mut chars = original.char_indices().peekable();
    while let Some((offset, ch)) = chars.next() {
        match ch {
            '\r' => {
                if let Some(&(_, '\n')) = chars.peek() {
                    chars.next();
                    line_starts.push(offset + 2);
                } else {
                    line_starts.push(offset + 1);
                }
            }
            '\n' | '\u{2028}' | '\u{2029}' => line_starts.push(offset + ch.len_utf8()),
            _ => {}
        }
    }

    let mut quads: Vec<[u32; 4]> = raw
        .iter()
        .filter_map(|(pos, generated)| {
            if pos.is_dummy() || *pos < fm.start_pos || *pos > fm.end_pos {
                return None;
            }
            let offset = (pos.0 - fm.start_pos.0) as usize;
            if offset < content_start || !original.is_char_boundary(offset) {
                return None;
            }
            let line = line_starts.partition_point(|start| *start <= offset) - 1;
            let column = original[line_starts[line]..offset].encode_utf16().count();

            Some([generated.line, generated.col, line as u32, column as u32])
        })
        .collect();
    quads.sort_unstable();
    quads.dedup();

    quads.into_iter().flatten().collect()
}

pub(crate) fn transform_impl(source: String, options: Option<TransformOptions>) -> TransformResult {
    let (config, config_diagnostics) = parse_config_with_diagnostic(
        options
            .as_ref()
            .and_then(|value| value.config_json.as_deref()),
    );
    let wants_mappings = options
        .as_ref()
        .and_then(|value| value.source_map)
        .unwrap_or(false);
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
                mappings: None,
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
            mappings: None,
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
        helper_namespace_needed: false,
        rem: Default::default(),
        class_value_scopes: crate::class_value::scope::ClassValueScopeStack::default(),
        opacity_alpha: 1.0,
        rem_pinned: false,
    };
    module.visit_mut_with(&mut transformer);

    let mut raw_mappings = Vec::new();
    let emitted = emit::emit_module(&cm, &module, wants_mappings.then_some(&mut raw_mappings));
    let mappings = match &emitted {
        Ok(_) if wants_mappings => Some(mapping_quads(&fm, &raw_mappings)),
        _ => None,
    };
    let emitted_code = emitted.unwrap_or_else(|error| {
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
        mappings,
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
                source_map: None,
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
                source_map: None,
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
                source_map: None,
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
                source_map: None,
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
                source_map: None,
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
                source_map: None,
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
                source_map: None,
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
                source_map: None,
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

    fn with_mappings(source: &str) -> crate::api::TransformResult {
        transform_impl(
            source.to_owned(),
            Some(TransformOptions {
                config_json: None,
                source_map: Some(true),
            }),
        )
    }

    fn generated_position(code: &str, needle: &str) -> (u32, u32) {
        code.lines()
            .enumerate()
            .find_map(|(line, text)| {
                text.find(needle)
                    .map(|byte| (line as u32, text[..byte].encode_utf16().count() as u32))
            })
            .unwrap_or_else(|| panic!("`{needle}` must be in the output: {code}"))
    }

    /// What a reader of the map does: the last mapping at or before a position.
    fn original_position(mappings: &[u32], (line, column): (u32, u32)) -> (u32, u32) {
        mappings
            .as_chunks::<4>()
            .0
            .iter()
            .take_while(|quad| (quad[0], quad[1]) <= (line, column))
            .last()
            .map(|quad| (quad[2], quad[3]))
            .expect("a mapping must precede the position")
    }

    #[test]
    fn mappings_lead_a_literal_back_past_the_preamble() {
        let source = "import React from \"@rbxts/react\";\n\nexport function Panel() {\n\treturn <frame className=\"hover:bg-red-500\" />;\n}\nconst greeting = \"안녕하세요\"; const n: number = \"nope\";\n";
        let result = with_mappings(source);
        let mappings = result.mappings.expect("mappings were asked for");
        let generated = generated_position(&result.code, "\"nope\"");
        let original_line = source.lines().nth(5).expect("line 6 exists");
        let original_column = original_line[..original_line.find("\"nope\"").unwrap()]
            .encode_utf16()
            .count() as u32;

        assert!(
            generated.0 > 5,
            "the preamble must have moved the literal down: {}",
            result.code
        );
        assert_eq!(
            original_position(&mappings, generated),
            (5, original_column)
        );
    }

    #[test]
    fn mappings_are_only_produced_on_request() {
        let source = "const ui = <frame className=\"p-2\" />;".to_owned();

        assert!(transform_impl(source.clone(), None).mappings.is_none());
        assert!(
            transform_impl(
                source.clone(),
                Some(TransformOptions {
                    config_json: None,
                    source_map: Some(false),
                }),
            )
            .mappings
            .is_none()
        );
        assert_eq!(
            transform_impl(source.clone(), None).code,
            with_mappings(&source).code,
            "recording mappings must not change the emit"
        );
    }

    #[test]
    fn mappings_skip_a_byte_order_mark() {
        let result = with_mappings("\u{feff}const ui = <frame className=\"p-2\" />;\n");
        let mappings = result.mappings.expect("mappings were asked for");
        let generated = generated_position(&result.code, "const ui");

        assert_eq!(original_position(&mappings, generated), (0, 0));
    }

    #[test]
    fn lowered_props_map_to_the_class_name_they_came_from() {
        let source = "const ui = (\n\t<frame\n\t\tclassName=\"bg-red-500\"\n\t/>\n);\n";
        let result = with_mappings(source);
        let mappings = result.mappings.expect("mappings were asked for");
        let generated = generated_position(&result.code, "BackgroundColor3");

        assert_eq!(original_position(&mappings, generated), (2, 2));
    }

    fn vide_transform(source: &str) -> crate::api::TransformResult {
        transform_impl(
            source.to_owned(),
            Some(TransformOptions {
                config_json: Some(vide_config_json()),
                source_map: None,
            }),
        )
    }

    #[test]
    fn a_marker_lowers_to_a_tag_on_the_static_react_path() {
        let result = transform_impl(
            "const ui = <frame className=\"group/card bg-red-500 peer\" />;".to_owned(),
            None,
        );

        assert!(
            result.code.contains("Tag=\"VelaGroup/card VelaPeer\""),
            "{}",
            result.code
        );
        assert!(!result.code.contains("VelaRuntimeHost"), "{}", result.code);
        assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    }

    #[test]
    fn a_marker_merges_into_a_literal_tag_and_promotes_an_expression() {
        let literal = transform_impl(
            "const ui = <frame Tag=\"Card VelaGroup\" className=\"group\" />;".to_owned(),
            None,
        );
        assert!(
            literal.code.contains("Tag=\"Card VelaGroup\""),
            "{}",
            literal.code
        );
        assert!(
            !literal.code.contains("VelaRuntimeHost"),
            "{}",
            literal.code
        );

        let expression = transform_impl(
            "const ui = <frame Tag={tags} className=\"group\" />;".to_owned(),
            None,
        );
        let code: String = expression.code.split_whitespace().collect();
        assert!(
            code.contains("__velaMarkers={[\"VelaGroup\"]}") && code.contains("Tag={tags}"),
            "{}",
            expression.code
        );
    }

    #[test]
    fn a_relational_variant_sends_the_element_to_the_runtime_host() {
        let ir = element_ir("group-hover/card:bg-red-500 peer-focus:bg-blue-500");

        assert!(
            ir.contains(
                r#""condition":{"kind":"group","name":"card","condition":{"kind":"hover"}}"#
            ),
            "{ir}"
        );
        assert!(
            ir.contains(r#""condition":{"kind":"peer","condition":{"kind":"focus"}}"#),
            "{ir}"
        );

        let result = transform_impl(
            "const ui = <textlabel className=\"group-hover:text-blue-400\" />;".to_owned(),
            None,
        );
        assert!(result.code.contains("VelaRuntimeHost"), "{}", result.code);
    }

    #[test]
    fn the_vide_host_places_markers_itself() {
        let result = vide_transform("const ui = <frame className=\"group\" />;");
        let code: String = result.code.split_whitespace().collect();

        assert!(
            code.contains("<VelaRuntimeHost")
                && code.contains("__velaMarkers={[\"VelaGroup\"]}")
                && !result.code.contains(" Tag="),
            "{}",
            result.code
        );
    }

    #[test]
    fn a_marker_that_cannot_tag_anything_is_reported() {
        let conditional = transform_impl(
            "const ui = <frame className=\"hover:group\" />;".to_owned(),
            None,
        );
        assert!(
            conditional
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "conditional-marker"),
            "{:?}",
            conditional.diagnostics
        );
        assert!(
            !conditional.code.contains("VelaGroup"),
            "{}",
            conditional.code
        );

        let component =
            transform_impl("const ui = <Card className=\"peer/x\" />;".to_owned(), None);
        assert!(
            component
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "marker-on-component"),
            "{:?}",
            component.diagnostics
        );

        let unsupported = transform_impl(
            "const ui = <frame className=\"group-md:bg-red-500\" />;".to_owned(),
            None,
        );
        assert!(
            unsupported
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "unsupported-relational-variant"),
            "{:?}",
            unsupported.diagnostics
        );
    }

    #[test]
    fn a_marker_in_a_branch_leaves_the_class_value_to_the_runtime() {
        let result = transform_impl(
            "const ui = <frame className={open ? \"group bg-red-500\" : \"bg-red-500\"} />;"
                .to_owned(),
            None,
        );

        assert!(
            result.code.contains("VelaRuntimeHost") && result.code.contains("className={open"),
            "{}",
            result.code
        );
    }
}
