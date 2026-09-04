const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { peakLocalRegisters } = require("./luau-local-registers.cjs");

const transformerModule = require("vela-rbxts/transformer");
const transformer =
	typeof transformerModule === "function"
		? transformerModule
		: transformerModule.default;

const projectRoot = path.join(__dirname, "..");

// A clean build so the transformer runs on every file and its diagnostics all
// land in this invocation's output.
fs.rmSync(path.join(projectRoot, "out"), { recursive: true, force: true });
const rbxtscCli = path.join(
	path.dirname(require.resolve("roblox-ts/package.json")),
	"out",
	"CLI",
	"cli.js",
);
const build = spawnSync(process.execPath, [rbxtscCli, "-p", "tsconfig.json"], {
	cwd: projectRoot,
	encoding: "utf8",
});
const buildOutput = `${build.stdout ?? ""}${build.stderr ?? ""}`;

if (build.status !== 0) {
	console.error(buildOutput);
	console.error("rbxtsc build failed");
	process.exit(1);
}

const appLuauPath = path.join(projectRoot, "out", "client", "App.luau");
const source = fs.readFileSync(appLuauPath, "utf8");

// The runtime is one ModuleScript the whole place shares, so what it lowers to
// is checked where it lives rather than in every file that reaches it.
const runtimeLuauPath = path.join(
	projectRoot,
	"node_modules",
	"@rbxts",
	"vela-runtime",
	"out",
	"init.luau",
);
const runtimeSource = fs.readFileSync(runtimeLuauPath, "utf8");

// The React host and the framework-neutral core it is built on. Which of the
// two a given behavior lands in is an implementation detail, so what the
// runtime must do is asserted against the pair; what it must not do, and the
// register budget, are asserted against each. The core is a folder of modules,
// and each of those is its own script with its own register file.
const runtimeCoreOut = path.join(
	projectRoot,
	"node_modules",
	"@rbxts",
	"vela-runtime-core",
	"out",
);
const runtimeCoreModules = fs
	.readdirSync(runtimeCoreOut)
	.filter((entry) => entry.endsWith(".luau"))
	.sort()
	.map((entry) => [
		`the runtime core's ${entry}`,
		fs.readFileSync(path.join(runtimeCoreOut, entry), "utf8"),
	]);
const runtimeModules = [
	runtimeSource,
	...runtimeCoreModules.map(([, text]) => text),
].join("\n");

// The default theme rides along with the core as its own module, so no
// emitted file has to carry a palette it did not change.
const runtimeDefaults = fs.readFileSync(
	path.join(runtimeCoreOut, "config-defaults.json"),
	"utf8",
);

const requiredDiagnostics = [
	'Tailwind "tracking" utilities have no Roblox equivalent, so "tracking-wide" is ignored.',
	'Unknown variant "checked" in "checked:px-4"',
	'Arbitrary value "[oops]" is not supported yet',
	'Color opacity modifier "/50" is not supported',
	'Unsupported utility family "blorb" in className literal.',
];

// Bare `rounded` must resolve to the default radius, not a theme-key error.
const forbiddenDiagnostics = ['"DEFAULT"', "unknown-theme-key"];

const requiredFragments = [
	"CornerRadius = __VelaRem.scale(UDim.new(0, 4), ",
	// A directional radius squares off the corners it does not name, and a
	// variant that repaints them needs those corners left open, not zeroed.
	"TopLeftRadius = __VelaRem.scale(UDim.new(0, 8), ",
	"BottomLeftRadius = __VelaRem.scale(UDim.new(0, 8), ",
	"TopRightRadius = UDim.new(0, 0)",
	"BottomRightRadius = UDim.new(0, 0)",
	"TopRightRadius = __VelaRem.scale(UDim.new(0, 10), ",
	"Color3.fromRGB(255, 0, 0)",
	"BackgroundTransparency = 0.5",
	'kind = "hover"',
	'kind = "active"',
	'kind = "color-scheme"',
	'kind = "focus"',
	"Position = __VelaRem.scale(UDim2.new(1, -16, 1, -8), ",
	"SortOrder = Enum.SortOrder.LayoutOrder",
	"FillDirectionMaxCells = 3",
	"CellPadding = __VelaRem.scale(UDim2.fromOffset(8, 8), ",
	"AnchorPoint = Vector2.new(0.5, 0.5)",
	"Position = UDim2.fromScale(0.5, 0.5)",
	"Size = UDim2.fromScale(0.5, 0)",
	"AnchorPoint = Vector2.new(0.5, 0)",
	"Interactable = false",
	"Padding = __VelaRem.scale(UDim.new(0, 8), ",
	"FillDirection = Enum.FillDirection.Vertical",
	"ApplyStrokeMode = Enum.ApplyStrokeMode.Border",
	"ScaleType = Enum.ScaleType.Crop",
	"LayoutOrder = 2",
	"ItemLineAlignment = Enum.ItemLineAlignment.Center",
	"VerticalFlex = Enum.UIFlexAlignment.SpaceBetween",
	"LineHeight = 1.25",
	"Enum.FontWeight.Bold",
	'Font.new("rbxasset://fonts/families/RobotoMono.json", Enum.FontWeight.Regular)',
	"GroupTransparency = 0.5",
	"ScrollingDirection = Enum.ScrollingDirection.Y",
	"ScrollBarThickness = __VelaRem.scale(8, ",
	"ScrollBarImageColor3 = Color3.fromRGB(98, 116, 142)",
	"AutomaticCanvasSize = Enum.AutomaticSize.Y",
	"Transparency = NumberSequence.new(0.5, 0)",
	"Enum.FontStyle.Italic",
	"BackgroundColor3 = Color3.fromRGB(49, 65, 88)",
	"Size = __VelaRem.scale(UDim2.fromOffset(320, 108), ",
	"CornerRadius = __VelaRem.scale(UDim.new(0, 6), ",
	"uistroke",
	"Thickness = __VelaRem.scale(1, ",
	"Thickness = __VelaRem.scale(2, ",
	"Color = Color3.fromRGB(98, 116, 142)",
	"Color3.fromRGB(21, 93, 252)",
	"PaddingLeft = __VelaRem.scale(UDim.new(0, 16), ",
	"PaddingRight = __VelaRem.scale(UDim.new(0, 16), ",
	"PaddingTop = __VelaRem.scale(UDim.new(0, 12), ",
	"PaddingBottom = __VelaRem.scale(UDim.new(0, 12), ",
	"Padding = __VelaRem.scale(UDim.new(0, 16), ",
	"Size = __VelaRem.scale(UDim2.new(0, 120, 0.5, 0), ",
	"PaddingTop = __VelaRem.scale(UDim.new(0, 7), ",
	"CornerRadius = __VelaRem.scale(UDim.new(0, 10), ",
	"TextSize = __VelaRem.scaleText(13, ",
	// Offsets follow the viewport: a statically lowered element takes the rem
	// binding, and a runtime host is named the props it should scale itself.
	"local __VelaRem = createVelaRemScaler(",
	'__velaRem = { "Size" }',
	"LineHeight = 1.6",
	"ZIndex = 15",
	// Plugin utilities: the class list expands statically and the property map
	// lands verbatim.
	"BackgroundColor3 = (Color3.fromRGB(29, 41, 61))",
	"BackgroundColor3 = Color3.fromRGB(69, 85, 108)",
	"LayoutOrder = 7",
	// The configured motion driver is imported here and handed to the runtime,
	// so the specifier never has to resolve from inside the package.
	"harnessMotionDriver",
	'TS.import(script, script.Parent, "motion").harnessMotionDriver',
	// The plugin table is only read while parsing a class value, and it is
	// pruned out of a file that hands the host none. This one still has
	// `surfaceClass(active)`, so it survives here.
	'["harness-card"] = "bg-slate-800 rounded-lg p-2 hover:bg-slate-700"',
	"React.createElement(VelaRuntimeHost",
	"__velaRules",
	"__velaTag",
	"__velaTransition",
	'property = "colors"',
	'__velaAnimation = "spin"',
	'Text = "<u>STATIC &amp; &lt;STYLED&gt;</u>"',
	"RichText = true",
	"__velaText",
	'transform = "capitalize"',
	'decoration = "strike"',
	"__velaMargin",
	"__velaDivide",
	'axis = "y"',
	// A SurfaceGui draws at the pixel space its part gives it, so the offsets
	// under one stay literal and the pin travels to the component below.
	"React.createElement(__VelaBoundary.Pin",
	"Size = UDim2.fromOffset(32, 32)",
];

// The runtime is imported, not copied, so every consumer reaches the same one.
const requiredRuntimeFragments = [
	"local function createVelaRuntimeHost(config, motionDriver)",
	"local function createVelaRemScaler(config)",
	"VelaColorScheme",
	"attachHoverTracking",
	"attachActiveTracking",
	"attachFocusTracking",
	"MouseEnter",
	"InputBegan",
	"SelectionGained",
	"GetAttributeChangedSignal",
	// Held tween values seed from the merged props. Narrowing this back to
	// resolution.props loses every statically lowered base value, and a
	// variant then has nothing to tween from.
	"for name, value in pairs(hostProps) do",
	"__VelaMotion.setDriver(motionDriver)",
	// A driver's methods carry an implicit `self`, so the call has to stay a
	// method call — detached, every argument lands one place to the left.
	"driver:transition(instance, goal, spec)",
	"driver:animate(instance, animation)",
	"pluginUtilities",
	"TweenService",
	"transitionCoversProp",
	"startPresetAnimation",
	"applyTextConfig",
	"prepareMarginWrapper",
	"renderMarginWrapper",
	"interleaveDivideSeparators",
	// A component was compiled against the viewport in a file of its own, so
	// the pin it was rendered under is read at its root and the bindings it
	// already built are handed back the offsets they were written with.
	"local function usePinned()",
	"local function unpin(node)",
];

// Intentional regression checks for the deleted runtime package and artifact paths.
const forbiddenFragments = [
	'React.createElement("RbxtsTailwindRuntimeHost"',
	"__rbxtsTailwindRuntimeHost",
	"RbxtsTailwindRuntimeHost",
	"__rbxtsTailwindRules",
	"__rbxtsTailwindTag",
	"rbxts-tailwind",
	"rbxtsTailwind",
	"createTailwindRuntimeHost",
	".size(",
	":size(",
	"size()",
	'className = { "bg-blue-600", active and "rounded-md" }',
	"@vela-rbxts/runtime",
	"vela-rbxts/runtime",
	// The default palette is the runtime's, not this file's. It is the same
	// table in every module that would have carried it, and most of what a
	// theme weighs.
	"slate = {",
	"Color3.fromRGB(255, 251, 235)",
	"__vela__",
	"runtime-host",
	'"node_modules", "@vela-rbxts"',
	" as never",
];

const requiredPatterns = [
	{
		description: "the runtime arrives as an import, not as a copy",
		pattern:
			/TS\.import\([^\n]*"node_modules", "@rbxts", "vela-runtime"\)[\s\S]{0,240}?local VelaRuntimeHost = createVelaRuntimeHost\(/,
	},
	{
		description: "transition config reaches the runtime host element",
		pattern: /__velaTransition\s*=\s*\{[\s\S]{0,160}?0\.3/,
	},
	{
		description: "transition easing direction is serialized",
		pattern: /__velaTransition\s*=\s*\{[\s\S]{0,160}?direction\s*=\s*"Out"/,
	},
	{
		description: "an undecided branch lowers to a rule the test decides",
		pattern:
			/kind = "test",\s*index = 0,\s*expected = true,\s*\},\s*effects = \{[\s\S]{0,200}?tag = "uicorner"/,
	},
	{
		description: "the branch's test is narrowed where it is written",
		pattern: /__velaTests = \{ if props\.active then true else false \}/,
	},
	{
		description: "an object map's values become one test each",
		pattern:
			/__velaTests = \{ if roomy then true else false, if not roomy then true else false \}/,
	},
	{
		description: "an object map's keys are resolved rather than forwarded",
		pattern: /kind = "test",\s*index = 1,\s*expected = true/,
	},
];

const requiredRuntimePatterns = [
	{
		description: "runtime aliases string.len locally",
		pattern: /local __velaStringLen = string\.len/,
	},
	{
		description: "runtime aliases string.sub locally",
		pattern: /local __velaStringSub = string\.sub/,
	},
	{
		description: "runtime calls the string len alias",
		pattern: /__velaStringLen\([^)]*\)/,
	},
	{
		description: "runtime calls the string sub alias",
		pattern: /__velaStringSub\([^)]*\)/,
	},
	{
		description: "runtime lowers array size to the # operator",
		pattern: /function arraySize\(value\)\s*return #value\s*end/,
	},
];

const forbiddenPatterns = [
	{
		description: "legacy className array literal should not remain",
		pattern: /className\s*=\s*\{\s*"bg-blue-600"\s*,/,
	},
];

// Luau has no `string` methods on a value and no `.length`; roblox-ts lowers
// both, and an unlowered one is a runtime error rather than a compile error.
const forbiddenLoweringPatterns = [
	{
		description: "must not call string.len as a method",
		pattern: /string:len\s*\(/,
	},
	{
		description: "must not call string.sub as a method",
		pattern: /string:sub\s*\(/,
	},
	{
		description: "must not call string.len directly",
		pattern: /string\.len\s*\(/,
	},
	{
		description: "must not call string.sub directly",
		pattern: /string\.sub\s*\(/,
	},
	{
		description: "must not use the deprecated table.getn",
		pattern: /table\s*[.:]\s*getn\b/,
	},
	{
		description: "must not call an unlowered size method",
		pattern: /[:.]size\s*\(/,
	},
	{
		description: "must not use emitted length property",
		pattern: /\.length\b/,
	},
];

const failures = [];

if (typeof transformer !== "function") {
	failures.push("vela-rbxts/transformer does not export a program transformer");
}

for (const fragment of requiredDiagnostics) {
	if (!buildOutput.includes(fragment)) {
		failures.push(`rbxtsc output is missing expected diagnostic: ${fragment}`);
	}
}

for (const fragment of forbiddenDiagnostics) {
	if (buildOutput.includes(fragment)) {
		failures.push(
			`rbxtsc output contains forbidden diagnostic text: ${fragment}`,
		);
	}
}

for (const fragment of requiredFragments) {
	if (!source.includes(fragment)) {
		failures.push(`emitted Luau is missing ${fragment}`);
	}
}

for (const check of requiredPatterns) {
	if (!check.pattern.test(source)) {
		failures.push(
			`emitted Luau is missing expected pattern: ${check.description}`,
		);
	}
}

for (const fragment of forbiddenFragments) {
	if (source.includes(fragment)) {
		failures.push(`emitted Luau still contains forbidden fragment ${fragment}`);
	}
}

for (const check of forbiddenPatterns) {
	if (check.pattern.test(source)) {
		failures.push(
			`emitted Luau still contains forbidden pattern: ${check.description}`,
		);
	}
}

for (const fragment of requiredRuntimeFragments) {
	if (!runtimeModules.includes(fragment)) {
		failures.push(`the runtime modules are missing ${fragment}`);
	}
}

for (const fragment of ["slate", "Color3.fromRGB(255, 251, 235)"]) {
	if (!runtimeDefaults.includes(fragment)) {
		failures.push(`the runtime's default theme is missing ${fragment}`);
	}
}

for (const check of requiredRuntimePatterns) {
	if (!check.pattern.test(runtimeModules)) {
		failures.push(
			`the runtime modules are missing expected pattern: ${check.description}`,
		);
	}
}

for (const [label, text] of [
	["emitted Luau", source],
	["the runtime module", runtimeSource],
	...runtimeCoreModules,
]) {
	for (const check of forbiddenLoweringPatterns) {
		if (check.pattern.test(text)) {
			failures.push(`${label} ${check.description}`);
		}
	}
}

// Luau refuses to compile a function that needs more than 200 live locals. The
// runtime no longer shares a register file with the file that reaches it, but
// each still has to fit on its own.
const REGISTER_BUDGET = 120;

for (const [label, text] of [
	["emitted Luau", source],
	["the runtime module", runtimeSource],
	...runtimeCoreModules,
]) {
	const peak = peakLocalRegisters(text);

	if (peak.registers > REGISTER_BUDGET) {
		failures.push(
			`${label} spends ${peak.registers} local registers in ${peak.name} (line ${peak.line}), over the ${REGISTER_BUDGET} budget`,
		);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
