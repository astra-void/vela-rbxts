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
	"BackgroundColor3 = Color3.fromRGB(49, 65, 88)",
	"Size = UDim2.fromOffset(320, 108)",
	"CornerRadius = UDim.new(0, 6)",
	"PaddingLeft = UDim.new(0, 16)",
	"PaddingRight = UDim.new(0, 16)",
	"PaddingTop = UDim.new(0, 12)",
	"PaddingBottom = UDim.new(0, 12)",
	"Padding = UDim.new(0, 16)",
	'TS.import(script, game:GetService("ReplicatedStorage"), "node_modules", "@vela-rbxts", "runtime")',
	"React.createElement(RbxtsTailwindRuntimeHost",
];

const forbiddenFragments = [
	'TS.import(script, script.Parent, "rbxts-tailwind-runtime-host")',
	'React.createElement("RbxtsTailwindRuntimeHost"',
	"__rbxtsTailwindRuntimeHost",
	"rbxts-tailwind/runtime-host",
	'className = { "bg-blue-600", active and "rounded-md" }',
];

const requiredPatterns = [
	{
		description: "runtime className keeps dynamic rounded-md condition",
		pattern: /className\s*=\s*[^\n]*rounded-md/,
	},
	{
		description: "runtime className map keeps px-4 key",
		pattern: /\["px-4"\]\s*=/,
	},
	{
		description: "runtime className map keeps px-2 key",
		pattern: /\["px-2"\]\s*=/,
	},
];

const forbiddenPatterns = [
	{
		description: "legacy className array literal should not remain",
		pattern: /className\s*=\s*\{\s*"bg-blue-600"\s*,/,
	},
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

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
