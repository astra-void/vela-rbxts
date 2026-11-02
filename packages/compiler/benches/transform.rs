use std::hint::black_box;

use criterion::{BenchmarkId, Criterion, Throughput, criterion_group, criterion_main};
use vela_rbxts_compiler::{
    CompletionRequest, DiagnosticsRequest, HoverRequest, SortClassNamesRequest, TransformOptions,
    get_completions, get_diagnostics, get_hover, sort_class_names, transform,
};

const DEFAULTS_JSON: &str = include_str!("../../config/src/defaults.json");
const RBXTS_HARNESS: &str = include_str!("../../../apps/rbxts-harness/src/client/App.tsx");
const VIDE_HARNESS: &str = include_str!("../../../apps/vide-harness/src/client/App.tsx");
const PLAYGROUND: &str = include_str!("../../../apps/playground/src/client/App.tsx");

const STATIC_CLASS: &str = "bg-slate-700 rounded-md p-2 w-10 h-8";
const VARIANT_CLASS: &str = "bg-blue-500 hover:bg-blue-600 md:w-20 dark:bg-slate-900 text-sm";
const DYNAMIC_CLASS: &str = "bg-slate-800 px-4";
// Later classes win the same property, so the overridden-class pass has work on every one.
const OVERRIDDEN_CLASS: &str = "p-2 p-4 bg-red-500 bg-blue-500 rounded-sm rounded-lg";

fn options(config_json: Option<&str>) -> Option<TransformOptions> {
    Some(TransformOptions {
        config_json: config_json.map(str::to_owned),
        source_map: None,
    })
}

fn vide_config_json() -> String {
    let mut config: serde_json::Value =
        serde_json::from_str(DEFAULTS_JSON).expect("defaults.json is valid JSON");
    config["framework"] = serde_json::Value::from("vide");
    config.to_string()
}

/// Static, variant and dynamic elements alternate so both emit paths scale with `count`.
fn synthetic_source(count: usize, with_overrides: bool) -> String {
    let mut source = String::from(
        "import React from \"@rbxts/react\";\n\nexport const Synthetic = (props: { active: boolean }) => (\n\t<frame className=\"flex-col gap-2\">\n",
    );

    for index in 0..count {
        let line = match index % 4 {
            0 => format!("\t\t<frame className=\"{STATIC_CLASS}\" />\n"),
            1 => format!("\t\t<textbutton Text=\"{index}\" className=\"{VARIANT_CLASS}\" />\n"),
            2 => format!(
                "\t\t<frame className={{[\"{DYNAMIC_CLASS}\", props.active && \"rounded-lg\"]}} />\n"
            ),
            _ if with_overrides => format!("\t\t<frame className=\"{OVERRIDDEN_CLASS}\" />\n"),
            _ => format!("\t\t<frame className=\"{STATIC_CLASS}\" />\n"),
        };
        source.push_str(&line);
    }

    source.push_str("\t</frame>\n);\n");
    source
}

fn transform_corpus(c: &mut Criterion) {
    let vide_config = vide_config_json();
    let corpus = [
        ("rbxts-harness", RBXTS_HARNESS, DEFAULTS_JSON),
        ("vide-harness", VIDE_HARNESS, vide_config.as_str()),
        ("playground", PLAYGROUND, DEFAULTS_JSON),
    ];
    let mut group = c.benchmark_group("transform/corpus");

    for (name, source, config_json) in corpus {
        group.throughput(Throughput::Bytes(source.len() as u64));
        group.bench_function(name, |b| {
            b.iter(|| transform(black_box(source.to_owned()), options(Some(config_json))))
        });
    }

    group.finish();
}

fn transform_synthetic(c: &mut Criterion) {
    let mut group = c.benchmark_group("transform/synthetic");

    for count in [10, 100, 1000] {
        let source = synthetic_source(count, false);
        group.throughput(Throughput::Bytes(source.len() as u64));
        group.bench_with_input(BenchmarkId::from_parameter(count), &source, |b, source| {
            b.iter(|| transform(black_box(source.clone()), options(Some(DEFAULTS_JSON))))
        });
    }

    group.finish();
}

/// The host passes `configJson` on every file, so this is the parse each file pays.
fn transform_config(c: &mut Criterion) {
    let source = "<frame className=\"bg-slate-700 rounded-md p-2\" />";
    let mut group = c.benchmark_group("transform/config");

    group.bench_function("none", |b| {
        b.iter(|| transform(black_box(source.to_owned()), options(None)))
    });
    group.bench_function("defaults", |b| {
        b.iter(|| transform(black_box(source.to_owned()), options(Some(DEFAULTS_JSON))))
    });

    group.finish();
}

/// Inside the first variant class list: mid-token for completions, on a token for hover.
fn editor_positions(source: &str) -> (u32, u32) {
    let anchor = format!("className=\"{VARIANT_CLASS}");
    let class_start = source
        .find(&anchor)
        .expect("synthetic source has a variant")
        + "className=\"".len();
    (
        (class_start + "bg-blue-500 hover:bg-".len()) as u32,
        (class_start + "bg-blue-500 hover:bg-bl".len()) as u32,
    )
}

fn editor(c: &mut Criterion) {
    let source = synthetic_source(1000, true);
    let (completion_position, hover_position) = editor_positions(&source);
    let mut group = c.benchmark_group("editor");
    group.throughput(Throughput::Bytes(source.len() as u64));

    group.bench_function("completions", |b| {
        b.iter(|| {
            get_completions(CompletionRequest {
                source: black_box(source.clone()),
                position: completion_position,
                options: None,
            })
        })
    });
    group.bench_function("hover", |b| {
        b.iter(|| {
            get_hover(HoverRequest {
                source: black_box(source.clone()),
                position: hover_position,
                options: None,
            })
        })
    });
    group.bench_function("diagnostics", |b| {
        b.iter(|| {
            get_diagnostics(DiagnosticsRequest {
                source: black_box(source.clone()),
                options: None,
            })
        })
    });
    group.bench_function("sort", |b| {
        b.iter(|| {
            sort_class_names(SortClassNamesRequest {
                source: black_box(source.clone()),
                options: None,
            })
        })
    });

    group.finish();
}

/// Sanity checks that run once, so a bench that silently measures a no-op fails `--test`.
fn assert_inputs() {
    let source = synthetic_source(8, true);
    let result = transform(source.clone(), options(Some(DEFAULTS_JSON)));
    assert!(result.changed, "synthetic source should transform");
    assert!(
        result.needs_runtime_host,
        "dynamic classes need the runtime host"
    );

    let (completion_position, hover_position) = editor_positions(&source);
    let completions = get_completions(CompletionRequest {
        source: source.clone(),
        position: completion_position,
        options: None,
    });
    assert!(
        !completions.items.is_empty(),
        "completions should land in a class"
    );
    let hover = get_hover(HoverRequest {
        source: source.clone(),
        position: hover_position,
        options: None,
    });
    assert!(hover.contents.is_some(), "hover should land on a class");

    let diagnostics = get_diagnostics(DiagnosticsRequest {
        source,
        options: None,
    });
    assert!(
        diagnostics
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "overridden-class"),
        "the overridden-class pass should report the repeated properties"
    );
}

fn inputs(_: &mut Criterion) {
    assert_inputs();
}

criterion_group!(
    benches,
    inputs,
    transform_corpus,
    transform_synthetic,
    transform_config,
    editor
);
criterion_main!(benches);
