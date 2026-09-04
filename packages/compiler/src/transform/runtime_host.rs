use crate::config::model::{MotionDriverConfig, RemConfig, TailwindConfig};
use crate::swc::parse::parse_module_items;
use crate::transform::rem::REM_NAMESPACE;
use swc_core::ecma::ast::ModuleItem;

/// The runtimes ship under the `@rbxts` scope because roblox-ts only resolves a
/// package whose scope directory is one of the project's `typeRoots`, and that
/// is the one every roblox-ts project already lists. A consumer installs one
/// through `vela-rbxts` and maps nothing new.
pub(crate) const REACT_RUNTIME_MODULE: &str = "@rbxts/vela-runtime";
pub(crate) const VIDE_RUNTIME_MODULE: &str = "@rbxts/vela-runtime-vide";

/// What a transformed module reaches for. A file can need any combination: a
/// host to resolve class values, a rem scaler for statically lowered offsets,
/// the opacity namespace for a fade that left the static path, and the boundary
/// namespace for what only a component root can read.
pub(crate) struct RuntimeNeeds<'a> {
    pub(crate) host: bool,
    /// Whether any host in this file is handed a class value to parse, which is
    /// the only thing the config's theme scales are read for.
    pub(crate) resolves_class_values: bool,
    pub(crate) rem: Option<&'a RemConfig>,
    pub(crate) opacity: bool,
    pub(crate) boundary: bool,
}

impl RuntimeNeeds<'_> {
    fn is_empty(&self) -> bool {
        !self.host && self.rem.is_none() && !self.opacity && !self.boundary
    }
}

/// Both host runtimes expose the same three entry points, so the preamble is
/// shared and only the specifier it imports from differs.
pub(crate) fn create_runtime_module_items(
    config: &TailwindConfig,
    needs: &RuntimeNeeds<'_>,
    runtime_module: &str,
) -> Vec<ModuleItem> {
    if needs.is_empty() {
        return Vec::new();
    }

    let mut source = String::new();
    let mut values = Vec::new();
    let mut types = Vec::new();
    let mut statements = String::new();

    if needs.host {
        let (motion_import, motion_argument) = motion_driver_source(config.plugins.motion.as_ref());
        source.push_str(&motion_import);

        values.push("createVelaRuntimeHost");
        types.push("VelaRuntimeHostComponent");
        statements.push_str(&format!(
            "const VelaRuntimeHost = createVelaRuntimeHost({config_json}{motion_argument}) as unknown as VelaRuntimeHostComponent;\n",
            config_json = host_config_json(config, needs.resolves_class_values),
        ));
    }

    // The scaler holds the slot table the emit numbers from zero in every
    // module, so it is built per file even though the curve behind it is shared.
    if let Some(rem) = needs.rem {
        values.push("createVelaRemScaler");
        statements.push_str(&format!(
            "const {REM_NAMESPACE} = createVelaRemScaler({});\n",
            serde_json::to_string(&runtime_rem_config(rem))
                .expect("rem config must serialize to JSON"),
        ));
    }

    if needs.opacity {
        values.push(crate::swc::builders::OPACITY_NAMESPACE);
    }

    if needs.boundary {
        values.push(crate::swc::builders::BOUNDARY_NAMESPACE);
    }

    source.push_str(&format!(
        "import {{ {} }} from \"{runtime_module}\";\n",
        values.join(", ")
    ));

    if !types.is_empty() {
        source.push_str(&format!(
            "import type {{ {} }} from \"{runtime_module}\";\n",
            types.join(", ")
        ));
    }

    source.push_str(&statements);

    let items = parse_module_items(&source);

    assert!(!items.is_empty(), "the runtime preamble must parse");

    items
}

/// Where a pin lands is answered at compile time: the emit opens the scope and
/// tells the runtime it is in one, so the list of containers never travels.
fn runtime_rem_config(rem: &RemConfig) -> RemConfig {
    RemConfig {
        pinned_under: Vec::new(),
        ..rem.clone()
    }
}

/// The theme is only ever read while parsing a class value the host was handed,
/// and most files hand it none — a variant, a branch or a text transform
/// reaches the host through props resolved here. Such a file drops the tables
/// entirely; the rest send only what they changed. `rem` and `preflight` stay
/// either way: the host reads those whatever it renders.
fn host_config_json(config: &TailwindConfig, resolves_class_values: bool) -> String {
    let mut config = config.clone();
    config.theme.rem = runtime_rem_config(&config.theme.rem);

    // Where the driver is imported from is answered above, at compile time. The
    // runtime is handed the driver itself and never reads the specifier, and
    // which runtime this is has likewise already been decided by the import.
    config.plugins.motion = None;
    config.framework = crate::config::model::Framework::default();

    if resolves_class_values {
        keep_theme_changes(&mut config.theme);
    } else {
        prune_resolver_tables(&mut config);
    }

    serde_json::to_string(&config).expect("runtime config must serialize to JSON")
}

const THEME_TABLES: [&str; 5] = ["colors", "radius", "spacing", "fontFamily", "screens"];

/// The runtime carries the defaults, so a table only has to say how it differs
/// from them — which for most projects is not at all. A table that dropped a
/// default entry cannot say that as an addition, so it travels whole and is
/// named in `replaced` for the runtime to take as given.
fn keep_theme_changes(theme: &mut crate::config::model::ThemeConfig) {
    let defaults = &crate::config::defaults::default_config_ref().theme;
    let kept = [
        keep_changes(&mut theme.colors, &defaults.colors),
        keep_changes(&mut theme.radius, &defaults.radius),
        keep_changes(&mut theme.spacing, &defaults.spacing),
        keep_changes(&mut theme.font_family, &defaults.font_family),
        keep_changes(&mut theme.screens, &defaults.screens),
    ];

    theme.replaced = THEME_TABLES
        .iter()
        .zip(kept)
        .filter(|(_, merges)| !merges)
        .map(|(name, _)| (*name).to_owned())
        .collect();
}

/// Drops every entry the defaults already carry. `false` when the table is
/// missing one of them, which no set of additions can express.
fn keep_changes<V: PartialEq>(
    table: &mut std::collections::BTreeMap<String, V>,
    defaults: &std::collections::BTreeMap<String, V>,
) -> bool {
    if defaults.keys().any(|key| !table.contains_key(key)) {
        return false;
    }

    table.retain(|key, value| defaults.get(key) != Some(value));

    true
}

/// The theme scales, the breakpoints and the plugin registrations are only ever
/// read while parsing a class value, and a file that hands the host none needs
/// any of them. They travel emptied *and* replaced, so the runtime takes the
/// empty tables as given rather than falling back on its defaults.
fn prune_resolver_tables(config: &mut TailwindConfig) {
    config.theme.colors.clear();
    config.theme.radius.clear();
    config.theme.spacing.clear();
    config.theme.font_family.clear();
    config.theme.screens.clear();
    config.plugins.utilities.clear();
    config.plugins.variants.clear();
    config.theme.replaced = THEME_TABLES.iter().map(|name| (*name).to_owned()).collect();
}

/// The import that brings a configured motion driver in, and the argument that
/// hands it to the runtime. Without one the argument is empty, so every method
/// falls back to the built-in TweenService path.
fn motion_driver_source(motion: Option<&MotionDriverConfig>) -> (String, String) {
    let Some(motion) = motion else {
        return (String::new(), String::new());
    };

    let module = escape_module_specifier(&motion.module);
    let import = match &motion.export_name {
        Some(name) => {
            format!("import {{ {name} as __VelaMotionDriverSource }} from \"{module}\";\n")
        }
        None => format!("import __VelaMotionDriverSource from \"{module}\";\n"),
    };

    (import, ", __VelaMotionDriverSource".to_owned())
}

/// The specifier reaches the emitted module inside a string literal, so a quote
/// or a newline in it would otherwise end the literal early.
fn escape_module_specifier(module: &str) -> String {
    module
        .chars()
        .filter(|value| !value.is_control())
        .map(|value| match value {
            '"' => "\\\"".to_owned(),
            '\\' => "\\\\".to_owned(),
            other => other.to_string(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::semantic::utility::UTILITY_PREFIXES;

    /// Read rather than embedded: the runtime ships as its own package now, and
    /// this is the seam that would otherwise let the two drift apart unnoticed.
    /// The host package is what the preamble names; everything the emit is
    /// resolved against lives in the core both host runtimes are built on.
    const RUNTIME_SOURCE: &str = include_str!("../../../runtime/src/index.ts");

    /// The core ships as a folder of modules, so the guard reads the whole of
    /// it. Naming the files instead would cover a family until the day one
    /// moves to a module this list never learned about.
    fn runtime_core_source() -> String {
        let directory =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../runtime-core/src");
        let mut modules = std::fs::read_dir(directory)
            .expect("the runtime core's sources must be readable")
            .map(|entry| {
                entry
                    .expect("each runtime core source must be readable")
                    .path()
            })
            .filter(|path| path.extension().is_some_and(|extension| extension == "ts"))
            .map(|path| std::fs::read_to_string(path).expect("a runtime core module must read"))
            .collect::<Vec<_>>();

        modules.sort();
        modules.join("\n")
    }

    /// forwardRef alone pins one ref type for every tag, which types every
    /// consumer ref as `unknown`; the generic restatement is what keeps `ref`
    /// following the lowered host tag.
    #[test]
    fn the_runtime_host_types_its_ref_from_the_host_tag() {
        assert!(
            RUNTIME_SOURCE.contains("ref?: __VelaReact.Ref<VelaRefTarget<Tag>>"),
            "the host component type must derive its ref from the tag"
        );
    }

    /// Every name the preamble reaches for has to leave the package. One left
    /// unexported fails at the consumer's `import`, long after this crate ran.
    #[test]
    fn the_runtime_exports_everything_the_preamble_imports() {
        let opacity = format!(
            "export namespace {}",
            crate::swc::builders::OPACITY_NAMESPACE
        );
        let boundary = format!(
            "export namespace {}",
            crate::swc::builders::BOUNDARY_NAMESPACE
        );
        let declarations = [
            "export function createVelaRuntimeHost",
            "export function createVelaRemScaler",
            opacity.as_str(),
            boundary.as_str(),
            "VelaRuntimeHostComponent",
        ];

        for declaration in declarations {
            assert!(
                RUNTIME_SOURCE.contains(declaration),
                "the runtime must export `{declaration}`"
            );
        }
    }

    /// The emit says only how a theme differs from the defaults, so the runtime
    /// has to be reading the same defaults this crate diffs against. A second
    /// copy of them anywhere would drift, and the drift would show up as a
    /// wrong color rather than as a build failure.
    #[test]
    fn the_runtime_reads_the_defaults_this_crate_diffs_against() {
        let runtime_core_source = runtime_core_source();

        assert!(
            runtime_core_source.contains("from \"./config-defaults.json\""),
            "the runtime core must read the shared defaults, not a copy of its own"
        );

        let materialize =
            include_str!("../../../runtime-core/scripts/materialize-config-defaults.cjs");
        assert!(
            materialize.contains("\"config\", \"src\", \"defaults.json\""),
            "the runtime's defaults must be copied from packages/config"
        );
    }

    /// A rule carries its prop values as the source text the static path would
    /// have written, and the runtime parses them back into real values. A
    /// constructor the emit can produce but the parser never learned reaches the
    /// instance as a string, which React rejects at assignment time — the whole
    /// tree dies rather than the one prop.
    #[test]
    fn the_runtime_parses_every_value_constructor_the_emit_can_write() {
        let runtime_core_source = runtime_core_source();
        const CONSTRUCTORS: [&str; 11] = [
            "new UDim(",
            "new UDim2(",
            "UDim2.fromOffset(",
            "UDim2.fromScale(",
            "Color3.fromRGB(",
            "new Vector2(",
            "new ColorSequence(",
            "new ColorSequenceKeypoint(",
            "new NumberSequence(",
            "new NumberSequenceKeypoint(",
            "new Font(",
        ];

        for constructor in CONSTRUCTORS {
            assert!(
                runtime_core_source.contains(&format!("\"{constructor}\"")),
                "runtime core never parses a `{constructor}` prop value"
            );
        }
    }

    /// A family the static path lowers but the runtime host never matches is
    /// silent: a `className` that arrives as a value simply renders without it.
    #[test]
    fn the_runtime_host_matches_every_static_utility_prefix() {
        let runtime_core_source = runtime_core_source();

        for (prefix, _) in UTILITY_PREFIXES {
            assert!(
                runtime_core_source.contains(&format!("\"{prefix}\"")),
                "runtime core never matches the \"{prefix}\" family"
            );
        }
    }
}
