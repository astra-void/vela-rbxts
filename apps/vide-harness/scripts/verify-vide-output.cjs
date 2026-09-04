const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");

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

const source = fs.readFileSync(
	path.join(projectRoot, "out", "client", "App.luau"),
	"utf8",
);

const failures = [];
let checked = 0;

function expect(description, condition) {
	checked += 1;
	if (!condition) {
		failures.push(description);
	}
}

// The Vide target picks its own runtime package. A React import reaching a Vide
// place is the failure this whole split exists to prevent.
expect(
	"the emit imports the Vide runtime",
	/"@rbxts", "vela%-runtime%-vide"/.test(source.replace(/%/g, "%")) ||
		source.includes('"@rbxts", "vela-runtime-vide"'),
);
expect(
	"the emit never reaches for React",
	!source.includes("@rbxts/react") && !source.includes('"react"'),
);

// The static path is unchanged from the React target: same lowercase tags, same
// Roblox property names, same injected helper children.
expect(
	"static lowering keeps its literal props",
	/BackgroundColor3 = Color3\.fromRGB\(29, 41, 61\)/.test(source),
);
expect(
	"helper children are injected as lowercase tags",
	/Vide\.jsx\("uicorner"/.test(source) && /Vide\.jsx\("uipadding"/.test(source),
);

// Rem needs no emit change at all: Vide's Derivable accepts the thunk the
// scaler returns where React accepted a binding.
expect(
	"rem-scaled offsets stay a plain call at the prop site",
	/CornerRadius = __VelaRem\.scale\(UDim\.new\(0, 8\), \d+\)/.test(source),
);

// A directional radius names the corners it rounds and squares off the rest,
// so the same UICorner carries all four rather than the shorthand.
const directionalCorners = [
	/TopLeftRadius = __VelaRem\.scale\(UDim\.new\(0, 8\), \d+\)/,
	/BottomLeftRadius = __VelaRem\.scale\(UDim\.new\(0, 8\), \d+\)/,
	/TopRightRadius = UDim\.new\(0, 0\)/,
	/BottomRightRadius = UDim\.new\(0, 0\)/,
];
expect(
	"a directional radius squares the corners it does not name",
	directionalCorners.every((corner) => corner.test(source)),
);

// The collapser opens the thunk a Vide class value is written as, so a
// readable one lowers to branch rules and its tests go back deferred.
expect(
	"a deferred class value collapses to rules with deferred tests",
	/__velaTests = \{ function\(\)/.test(source) && /kind = "test"/.test(source),
);

// What it could not read goes back deferred rather than being read once.
expect(
	"an unreadable remainder stays deferred",
	/className = function\(\)/.test(source),
);

expect(
	"the host is reached as a Vide function component",
	/Vide\.jsx\(VelaRuntimeHost, \{/.test(source),
);

expect(
	"lowered host elements keep their lowercase tags",
	/__velaTag = "frame"/.test(source),
);

// Vide builds a provider's children eagerly, so they have to arrive deferred.
expect(
	"the opacity provider takes its children as a thunk",
	!source.includes("__VelaOpacity.Provider") ||
		/__VelaOpacity\.Provider[\s\S]{0,200}?function\(\)/.test(source),
);

// Emitted for every target, and every one of them names something no instance
// has a member for — the host has to read them off itself.
for (const name of ["__velaText", "__velaTransition", "__velaAnimation"]) {
	expect(
		`${name} reaches the runtime host`,
		new RegExp(`${name} = `).test(source),
	);
}

// A SurfaceGui draws at the pixel space its part gives it. The pin is read
// where a thunk is built, so the children it holds arrive deferred like a
// provider's, and what is lowered under it keeps its literal offsets.
expect(
	"the pin takes its children as a thunk",
	/__VelaBoundary\.Pin, nil, function\(\)/.test(source),
);
expect(
	"an offset under the pin is left literal",
	/__VelaBoundary\.Pin[\s\S]{0,400}?Size = UDim2\.fromOffset\(96, 24\)/.test(
		source,
	),
);

// A component tag is rendered by the host rather than lowered, and its children
// travel with it.
expect(
	"a component tag reaches the host with its children",
	/__velaTag = ChildSlot,\s*\}, Vide\.jsx\(/.test(source),
);

// v0.13. A state variant is a runtime condition like any other, so the utility
// behind one still resolves here and only the condition travels.
expect(
	"a registered state variant lowers to an attribute condition",
	/kind = "attribute",\s*name = "State",\s*value = "open"/.test(source),
);
expect(
	"an inline attribute variant lowers the same way",
	/name = "Selected"/.test(source) && /name = "Tier"/.test(source),
);
expect(
	"a project registration outranks the preset's own",
	source.includes('name = "Selected"') &&
		!source.includes('name = "PresetSelected"'),
);
expect(
	"the utility behind a state variant is resolved at compile time",
	/kind = "attribute",\s*name = "State",\s*value = "open",[\s\S]{0,300}?Color3\.fromRGB\(21, 93, 252\)/.test(
		source,
	),
);

// Responsive ranges, including a breakpoint the preset configured.
expect(
	"a max-width variant carries an upper bound",
	/maxWidth = 768/.test(source),
);
expect(
	"a chained range carries both bounds",
	/minWidth = 768,\s*maxWidth = 1024/.test(source) ||
		/maxWidth = 1024/.test(source),
);
expect(
	"a configured breakpoint resolves by name",
	/alias = "tablet",\s*minWidth = 900/.test(source),
);
expect(
	"a preset's theme and utilities reach the emit",
	source.includes("Color3.fromRGB(255, 136, 0)"),
);

// Helper transitions: the shadow group only means anything because the runtime
// tweens the helper instances it renders.
expect(
	"a shadow transition narrows onto the UIShadow helper",
	/property = "shadow"/.test(source) && /tag = "uishadow"/.test(source),
);
expect(
	"a corner a variant changes travels as a rule the host can tween",
	/tag = "uicorner"/.test(source),
);

// The runtime the emit reaches for has to do the subscribing, and only where a
// rule actually names an attribute.
const videRuntime = fs.readFileSync(
	path.join(
		projectRoot,
		"node_modules",
		"@rbxts",
		"vela-runtime-vide",
		"out",
		"init.luau",
	),
	"utf8",
);
const runtimeCoreOut = path.join(
	projectRoot,
	"node_modules",
	"@rbxts",
	"vela-runtime-core",
	"out",
);
const runtimeModules = [
	videRuntime,
	...fs
		.readdirSync(runtimeCoreOut)
		.filter((entry) => entry.endsWith(".luau"))
		.map((entry) => fs.readFileSync(path.join(runtimeCoreOut, entry), "utf8")),
].join("\n");

for (const fragment of [
	"GetAttributeChangedSignal",
	"function watchAttributes(",
	"function attributeNames(",
	"function parseVariantPrefix(",
	'if property == "shadow" then',
	'return helper == "uishadow"',
]) {
	expect(
		`the vide runtime carries ${fragment}`,
		runtimeModules.includes(fragment),
	);
}

// One signal per attribute the styling names, let go when the element does. A
// blanket `AttributeChanged` would wake the element for attributes nothing
// about its styling reads.
expect(
	"the host subscribes per attribute name",
	/element:GetAttributeChangedSignal\(name\):Connect\(refresh\)/.test(
		runtimeModules,
	),
);
expect(
	"the subscriptions are let go on cleanup",
	/Vide\.cleanup\(function\(\)[\s\S]{0,200}?connection:Disconnect\(\)/.test(
		runtimeModules,
	),
);
expect(
	"the host never listens to every attribute on the instance",
	!/:GetPropertyChangedSignal\("AttributeChanged"\)|\.AttributeChanged:Connect/.test(
		runtimeModules,
	),
);

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`vide-harness: ${failure}`);
	}
	process.exit(1);
}

console.log(`vide-harness: verified ${checked} lowering contracts`);
