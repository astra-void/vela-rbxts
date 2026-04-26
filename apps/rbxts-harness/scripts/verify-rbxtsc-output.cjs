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
	"__createVelaRuntimeHost",
	"React.createElement(VelaRuntimeHost",
	"__velaRules",
	"__velaTag",
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
	"__vela__",
	"runtime-host",
	'"node_modules", "@vela-rbxts"',
	" as never",
];

const requiredPatterns = [
	{
		description: "runtime helper is inlined into the Luau output",
		pattern: /__createVelaRuntimeHost/,
	},
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
	{
		description: "runtime helper uses Luau string len",
		pattern: /string[:.]len\s*\(/,
	},
];

const forbiddenPatterns = [
	{
		description: "legacy className array literal should not remain",
		pattern: /className\s*=\s*\{\s*"bg-blue-600"\s*,/,
	},
	{
		description: "runtime helper must not call string size method",
		pattern: /[:.]size\s*\(/,
	},
];

const failures = [];

if (typeof transformer !== "function") {
	failures.push("vela-rbxts/transformer does not export a program transformer");
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
