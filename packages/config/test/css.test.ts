import { expect, test } from "vitest";

import { parseVelaCss } from "../src/css";
import { defineConfig } from "../src/index";

test("reads theme tokens into an extending config input", () => {
	const parsed = parseVelaCss(`
		@theme {
			--color-brand-500: #3b82f6;
			--color-brand: rgb(30 64 175);
			--spacing-4: 16px;
			--radius-pill: 50%;
			--font-display: rbxasset://fonts/families/Gotham.json;
			--breakpoint-tv: 1920px;
		}
	`);

	expect(parsed.diagnostics).toEqual([]);
	expect(parsed.input.theme?.extend).toEqual({
		colors: {
			brand: {
				500: "Color3.fromRGB(59, 130, 246)",
				DEFAULT: "Color3.fromRGB(30, 64, 175)",
			},
		},
		spacing: { "4": "new UDim(0, 16)" },
		radius: { pill: "new UDim(0.5, 0)" },
		fontFamily: { display: "rbxasset://fonts/families/Gotham.json" },
		screens: { tv: 1920 },
	});

	const config = defineConfig(parsed.input);
	expect(config.theme.colors.brand).toEqual({
		500: "Color3.fromRGB(59, 130, 246)",
		DEFAULT: "Color3.fromRGB(30, 64, 175)",
	});
	expect(config.theme.colors.slate).toBeDefined();
});

test("lowers class rules into plugin utilities the compiler already reads", () => {
	const parsed = parseVelaCss(`
		.btn { @apply bg-blue-500 rounded-md; @apply px-4; }
		.panel { BackgroundTransparency: 0.5; ZIndex: 2; }
	`);

	expect(parsed.diagnostics).toEqual([]);
	expect(parsed.input.plugins).toEqual({
		utilities: {
			btn: "bg-blue-500 rounded-md px-4",
			panel: { BackgroundTransparency: "0.5", ZIndex: "2" },
		},
	});
	expect(defineConfig(parsed.input).plugins.utilities.btn).toBe(
		"bg-blue-500 rounded-md px-4",
	);
});

test("registers an attribute-backed variant", () => {
	const parsed = parseVelaCss(`@custom-variant selected (Selected = true);`);

	expect(parsed.diagnostics).toEqual([]);
	expect(parsed.input.plugins).toEqual({
		variants: { selected: { attribute: "Selected", equals: true } },
	});
});

test("collects imports without resolving them", () => {
	const parsed = parseVelaCss(
		`@import "./buttons.css";\n@theme { --spacing-2: 8px; }`,
	);

	expect(parsed.imports.map((entry) => entry.specifier)).toEqual([
		"./buttons.css",
	]);
	expect(parsed.diagnostics).toEqual([]);
});

test("rejects everything the cascade would be needed for", () => {
	const parsed = parseVelaCss(`
		.card > .title { @apply text-lg; }
		.btn:hover { @apply bg-blue-600; }
		@media (min-width: 700px) { .btn { @apply px-8; } }
		.mixed { @apply px-4; ZIndex: 2; }
		.raw { display: flex; }
	`);

	const messages = parsed.diagnostics.map((diagnostic) => diagnostic.message);
	expect(messages).toHaveLength(5);
	expect(messages[0]).toMatch(/no cascade/);
	expect(messages[1]).toMatch(/no cascade/);
	expect(messages[2]).toMatch(/"@media" is not supported/);
	expect(messages[3]).toMatch(/mixes "@apply"/);
	expect(messages[4]).toMatch(/"display" is a CSS property/);
	expect(parsed.input.plugins).toBeUndefined();
});

test("points a diagnostic at the offending source range", () => {
	const source = `@theme { --shadow-md: 4px; }`;
	const parsed = parseVelaCss(source);
	const diagnostic = parsed.diagnostics[0];

	expect(diagnostic?.message).toMatch(/not a vela token/);
	expect(source.slice(diagnostic?.start, diagnostic?.end).trim()).toBe(
		"--shadow-md: 4px",
	);
});

test("keeps the rem scale out of the dialect", () => {
	const parsed = parseVelaCss(`@theme { --rem-base: 16; }`);

	expect(parsed.diagnostics[0]?.message).toMatch(/vela\.config\.ts/);
});
