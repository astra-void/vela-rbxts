const fs = require("node:fs");
const path = require("node:path");

const transformerModule = require("vela-rbxts/transformer");
const transformer =
	typeof transformerModule === "function"
		? transformerModule
		: transformerModule.default;

const appLuauPath = path.join(__dirname, "..", "out", "client", "App.luau");
const source = fs.readFileSync(appLuauPath, "utf8");

const requiredFragments = [
	"BackgroundColor3 = Color3.fromRGB(",
	"Size = UDim2.fromOffset(320, 108)",
	'React.createElement("uicorner"',
	"CornerRadius = UDim.new(0, 6)",
	'React.createElement("uipadding"',
	"PaddingLeft = UDim.new(0, 16)",
	"PaddingRight = UDim.new(0, 16)",
	"PaddingTop = UDim.new(0, 12)",
	"PaddingBottom = UDim.new(0, 12)",
	'React.createElement("uilistlayout"',
	"Padding = UDim.new(0, 16)",
	'TS.import(script, game:GetService("ReplicatedStorage"), "node_modules", "@vela-rbxts", "runtime")',
	"React.createElement(RbxtsTailwindRuntimeHost",
];

const forbiddenFragments = [
	'TS.import(script, script.Parent, "rbxts-tailwind-runtime-host")',
	'React.createElement("RbxtsTailwindRuntimeHost"',
	"__rbxtsTailwindRuntimeHost",
	"rbxts-tailwind/runtime-host",
];

const failures = [];

if (typeof transformer !== "function") {
	failures.push("vela-rbxts/transformer does not export a program transformer");
}

if (source.includes("local theme")) {
	failures.push("emitted Luau still declares a local theme object");
}

for (const fragment of requiredFragments) {
	if (!source.includes(fragment)) {
		failures.push(`emitted Luau is missing ${fragment}`);
	}
}

for (const fragment of forbiddenFragments) {
	if (source.includes(fragment)) {
		failures.push(`emitted Luau still contains forbidden fragment ${fragment}`);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
