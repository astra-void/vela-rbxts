import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import {
	emitted,
	hostConfig,
	hostRules,
	ruleCorners,
	runtimeSource,
	withPluginUtilities,
} from "./helpers";

test("applies theme.extend while top-level theme scales replace the family", () => {
	const config = defineConfig({
		theme: {
			colors: {
				primary: "Color3.fromRGB(99, 102, 241)",
			},
			extend: {
				colors: {
					secondary: "Color3.fromRGB(16, 185, 129)",
				},
				radius: {
					lg: "new UDim(0, 12)",
					xl: "new UDim(0, 16)",
				},
				spacing: {
					"6": "new UDim(0, 16)",
				},
			},
		},
	});

	expect(config).toEqual({
		preflight: true,
		framework: "react",
		theme: {
			colors: {
				primary: "Color3.fromRGB(99, 102, 241)",
			},
			radius: {
				DEFAULT: "new UDim(0, 4)",
				none: "new UDim(0, 0)",
				xs: "new UDim(0, 2)",
				sm: "new UDim(0, 4)",
				md: "new UDim(0, 6)",
				lg: "new UDim(0, 12)",
				xl: "new UDim(0, 16)",
				"2xl": "new UDim(0, 16)",
				"3xl": "new UDim(0, 24)",
				"4xl": "new UDim(0, 32)",
				full: "new UDim(0.5, 0)",
			},
			spacing: {
				"4": "new UDim(0, 16)",
				"6": "new UDim(0, 16)",
			},
			fontFamily: {
				sans: "rbxasset://fonts/families/SourceSansPro.json",
				serif: "rbxasset://fonts/families/Merriweather.json",
				mono: "rbxasset://fonts/families/RobotoMono.json",
			},
			rem: {
				base: 16,
				min: 8,
				max: 64,
				baseResolution: { x: 1920, y: 1020 },
				pinnedUnder: ["surfacegui", "billboardgui"],
			},
		},
		plugins: { utilities: {} },
	});

	const source =
		'<frame className="bg-primary rounded-md rounded-lg px-6 py-6 pt-6" />';
	const result = transform(source, { configJson: JSON.stringify(config) });

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.diagnostics).toEqual([]);
	expect(result.code.includes("className=")).toBe(false);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(99, 102, 241\)\}/,
	);
	expect(result.code).toMatch(
		/<uicorner\b[^>]*CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 12\), \d+\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(/<uipadding\b[^>]*\/>/i);
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).not.toContain("theme.");
});

test("resolves built-in radius presets out of the box", () => {
	const result = transform(
		'<frame><textbutton className="rounded-none" /><imagebutton className="rounded-sm" /><textbutton className="rounded-md" /><imagebutton className="rounded-lg" /><textbutton className="rounded-xl" /><imagebutton className="rounded-2xl" /><textbutton className="rounded-full" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 0)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 4), 0)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 6), 1)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 8), 2)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 12), 3)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={__VelaRem.scale(new UDim(0, 16), 4)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0.5, 0)}/></textbutton>",
	);
});

test("resolves directional radius presets onto one UICorner", () => {
	const result = transform(
		'<frame className="rounded-md rounded-l-lg rounded-tr-full" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toMatch(/\sCornerRadius=/);
	expect(result.code).toMatch(
		/TopLeftRadius=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/BottomLeftRadius=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(/TopRightRadius=\{new UDim\(0\.5, 0\)\}/);
	expect(result.code).toMatch(
		/BottomRightRadius=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
});

test("defaults untouched corners to zero for a directional-only radius", () => {
	const result = transform('<frame className="rounded-r-[10px]" />');

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toMatch(/\sCornerRadius=/);
	expect(result.code).toMatch(/TopRightRadius=/);
	expect(result.code).toMatch(/BottomRightRadius=/);
	expect(result.code).toMatch(/TopLeftRadius=\{new UDim\(0, 0\)\}/);
	expect(result.code).toMatch(/BottomLeftRadius=\{new UDim\(0, 0\)\}/);
});

test("preserves an all-corner baseline under a directional variant", () => {
	const result = transform(
		'<frame className="rounded-md hover:rounded-r-[10px]" />',
	);

	expect(result.diagnostics).toEqual([]);
	// A rule writes the same `uicorner`, so the baseline is hoisted beside it
	// rather than emitted as a child of its own.
	const [baseline, hover] = hostRules(result.code);
	expect(ruleCorners(baseline)).toEqual({ CornerRadius: "new UDim(0, 6)" });
	expect(ruleCorners(hover)).toEqual({
		TopRightRadius: "new UDim(0, 10)",
		BottomRightRadius: "new UDim(0, 10)",
	});
});

// The corners a directional utility leaves alone are squared off by whoever
// applies last. Filling them here would pin them to zero and leave the variant
// nothing to repaint, so a hoisted baseline travels with only what it named.
test("lets a variant shorthand repaint the corners a directional base left open", () => {
	const result = transform(
		'<frame className="rounded-l-lg hover:rounded-md" />',
	);

	expect(result.diagnostics).toEqual([]);
	const [baseline, hover] = hostRules(result.code);
	expect(ruleCorners(baseline)).toEqual({
		TopLeftRadius: "new UDim(0, 8)",
		BottomLeftRadius: "new UDim(0, 8)",
	});
	expect(ruleCorners(hover)).toEqual({ CornerRadius: "new UDim(0, 6)" });
});

test("squares the untouched corners when no rule writes the same helper", () => {
	const result = transform(
		'<frame className="rounded-l-lg hover:bg-red-500" />',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/TopRightRadius=\{\(new UDim\(0, 0\) as never\)\}/,
	);
	expect(result.code).toMatch(
		/BottomRightRadius=\{\(new UDim\(0, 0\) as never\)\}/,
	);
});

test("warns on unknown radius keys without falling back to numeric radius resolution", () => {
	const result = transform('<frame className="rounded-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "rounded-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/CornerRadius=/);
});

test("prunes the resolver's tables from a host that resolves no class value", () => {
	const result = transform(
		'<frame className="bg-slate-700 hover:bg-blue-600" />',
		withPluginUtilities,
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).not.toContain("className=");
	// The variant is already a rule, so nothing in this file is ever parsed
	// in-game. The scales travel empty *and* replaced, so the runtime uses the
	// empty tables rather than falling back on the defaults it carries.
	expect(hostConfig(result.code)).toEqual({
		preflight: false,
		theme: {
			colors: {},
			radius: {},
			spacing: {},
			fontFamily: {},
			rem: expect.objectContaining({ base: 16 }),
			replaced: ["colors", "radius", "spacing", "fontFamily"],
		},
		plugins: { utilities: {} },
	});
	expect(result.code).toContain("Color3.fromRGB(21, 93, 252)");
});

// The runtime carries the defaults, so an untouched scale travels as nothing at
// all — but it must be left mergeable rather than marked replaced.
test("leaves the resolver's tables to the defaults when a class value reaches the host", () => {
	const result = transform("<frame className={variant} />");

	expect(result.needsRuntimeHost).toBe(true);
	expect(hostConfig(result.code).theme.colors).toEqual({});
	expect(hostConfig(result.code).theme.replaced).toBeUndefined();
});

// A spread can carry a `className` this pass never reads, so the tables have to
// stay readable through it.
test("leaves the resolver's tables mergeable when a spread may carry a class value", () => {
	const result = transform('<frame {...rest} className="hover:bg-blue-600" />');

	expect(result.needsRuntimeHost).toBe(true);
	expect(hostConfig(result.code).theme.replaced).toBeUndefined();
});

// Only what the project changed travels; `extend` adds a family, and a
// top-level scale replaces the whole table, which no set of additions can say.
test("a theme extension travels as the entries it added", () => {
	const result = transform("<frame className={variant} />", {
		configJson: JSON.stringify(
			defineConfig({
				theme: { extend: { colors: { brand: "Color3.fromRGB(1, 2, 3)" } } },
			}),
		),
	});

	const theme = hostConfig(result.code).theme;
	expect(theme.colors).toEqual({ brand: "Color3.fromRGB(1, 2, 3)" });
	expect(theme.replaced).toBeUndefined();
});

test("a replaced theme scale travels whole so the defaults do not come back", () => {
	const result = transform("<frame className={variant} />", {
		configJson: JSON.stringify(
			defineConfig({ theme: { colors: { brand: "Color3.fromRGB(9, 9, 9)" } } }),
		),
	});

	const theme = hostConfig(result.code).theme;
	expect(theme.colors).toEqual({ brand: "Color3.fromRGB(9, 9, 9)" });
	expect(theme.replaced).toEqual(["colors"]);
});

// Overriding one shade keeps the family whole, so the shades around it survive
// the family-level merge the runtime does.
test("overriding one shade carries the rest of its family with it", () => {
	const result = transform("<frame className={variant} />", {
		configJson: JSON.stringify(
			defineConfig({
				theme: {
					extend: { colors: { blue: { "500": "Color3.fromRGB(1, 2, 3)" } } },
				},
			}),
		),
	});

	const blue = hostConfig(result.code).theme.colors.blue;
	expect(blue["500"]).toBe("Color3.fromRGB(1, 2, 3)");
	expect(blue["600"]).toEqual(expect.any(String));
	expect(Object.keys(hostConfig(result.code).theme.colors)).toEqual(["blue"]);
});

test("preflight neutralizes the Roblox host defaults by default", () => {
	const result = transform(
		`export const A = () => <frame className="w-full" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{1\}/);
	expect(result.code).toMatch(/BorderSizePixel=\{0\}/);

	const painted = transform(
		`export const B = () => <frame className="bg-slate-700" />;`,
		null,
	);

	expect(emitted(painted.code)).not.toMatch(/BackgroundTransparency/);

	const off = transform(
		`export const C = () => <frame className="w-full" />;`,
		{
			configJson: JSON.stringify(defineConfig({ preflight: false })),
		},
	);

	expect(emitted(off.code)).not.toMatch(
		/BackgroundTransparency|BorderSizePixel/,
	);
});

test("preflight lets a runtime-resolved background reopen the neutralized base", () => {
	const result = transform(
		`export const A = ({ on }: { on: boolean }) => <frame className={on ? "bg-slate-700" : "w-full"} />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("withPreflightBackground");
	expect(result.code).toMatch(/"preflight":\s*true/);
});
