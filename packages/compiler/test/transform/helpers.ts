import { readdirSync, readFileSync } from "node:fs";

import { defineConfig, plugin } from "../../../config/src/index";

// The runtime host ships as its own package, so what it resolves is asserted
// against its source rather than against a copy inlined into the emit. Most of
// what resolves a class value lives in the framework-neutral core the host is
// built on, and which of the two holds a given branch is not what these
// assertions are about — so the core is read whole, module by module.
const coreDirectory = new URL("../../../runtime-core/src/", import.meta.url);
export const runtimeSource = [
	readFileSync(
		new URL("../../../runtime/src/index.ts", import.meta.url),
		"utf8",
	),
	...readdirSync(coreDirectory)
		.filter((entry) => entry.endsWith(".ts"))
		.map((entry) => readFileSync(new URL(entry, coreDirectory), "utf8")),
].join("\n");

// Preflight would put its own background props on every element, which hides
// what a token-resolution test is actually asserting.
export const withoutPreflight = {
	configJson: JSON.stringify(defineConfig({ preflight: false })),
};

// What the compiler inlines sits above the file's own code and names Roblox
// properties of its own, so an assertion about what an element emitted has to
// read the declaration rather than the whole emit.
export const emitted = (code: string) =>
	code.trimEnd().split("\n").at(-1) ?? "";

/// The config travels as the host factory's first argument, so it ends at the
/// only closing brace the emitter leaves at column zero.
export const hostConfig = (code: string) =>
	JSON.parse(
		/createVelaRuntimeHost\((\{[\s\S]*?\n\})[,)]/.exec(code)?.[1] ?? "null",
	);

/// The rules travel as one array in `__velaRules`, the only bracket the emitter
/// closes at column zero.
export const hostRules = (code: string) =>
	JSON.parse(/__velaRules=\{(\[[\s\S]*?\n\])\}/.exec(code)?.[1] ?? "null");

/// What one rule leaves on the shared `uicorner`, keyed by property, so a test
/// reads the corners rather than the shape they were serialized in.
export const ruleCorners = (rule: {
	effects: {
		helpers: { tag: string; props: { name: string; value: string }[] }[];
	};
}) =>
	Object.fromEntries(
		(
			rule.effects.helpers.find((helper) => helper.tag === "uicorner")?.props ??
			[]
		).map((prop) => [prop.name, prop.value]),
	);

export const withPluginUtilities = {
	configJson: JSON.stringify(
		defineConfig({
			preflight: false,
			plugins: [
				plugin(({ addUtilities, theme }) => {
					addUtilities({
						btn: "bg-blue-600 rounded-lg px-4 hover:bg-blue-700",
						panel: {
							BackgroundColor3: theme("colors.slate.800"),
							BorderSizePixel: "0",
						},
						stack: "flex-col btn",
					});
				}),
			],
		}),
	),
};
