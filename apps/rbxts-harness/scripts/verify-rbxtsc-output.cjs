const fs = require("node:fs");
const path = require("node:path");

const appLuauPath = path.join(__dirname, "..", "out", "client", "App.luau");
const source = fs.readFileSync(appLuauPath, "utf8");

const requiredFragments = [
	"BackgroundColor3 = theme.colors.surface",
	'React.createElement("uicorner"',
	"CornerRadius = theme.radius.md",
	'React.createElement("uipadding"',
	"PaddingLeft = theme.spacing[4]",
	"PaddingRight = theme.spacing[4]",
];

const failures = [];

if (source.includes("className")) {
	failures.push("emitted Luau still contains className");
}

for (const fragment of requiredFragments) {
	if (!source.includes(fragment)) {
		failures.push(`emitted Luau is missing ${fragment}`);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
