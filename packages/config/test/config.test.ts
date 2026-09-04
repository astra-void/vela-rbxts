import { expect, test } from "vitest";

import defaultsInput from "../src/defaults.json" with { type: "json" };
import {
	defaultConfig,
	defineConfig,
	definePreset,
	plugin,
	resolveThemeColors,
	type VelaPreset,
} from "../src/index";

function expectPalette(value: unknown, entries: Record<string, string>) {
	expect(value).toEqual(entries);
}

test("keeps defaults authoring-shaped and uses a Tailwind-style palette", () => {
	expect(defaultsInput.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(248, 250, 252)",
			500: "Color3.fromRGB(98, 116, 142)",
			950: "Color3.fromRGB(2, 6, 24)",
		}),
	);
	expect(defaultConfig.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(248, 250, 252)",
			500: "Color3.fromRGB(98, 116, 142)",
			950: "Color3.fromRGB(2, 6, 24)",
		}),
	);
	expect(defaultConfig.theme.colors.surface).toBeUndefined();
});

test("preserves single literal color input as a singleton", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: "Color3.fromRGB(1, 2, 3)",
			},
		},
	});

	expect(Object.keys(config.theme.colors)).toEqual(["brand"]);
	expect(config.theme.colors.brand).toBe("Color3.fromRGB(1, 2, 3)");
});

test("preserves explicit shade input as a palette", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: {
					700: "Color3.fromRGB(7, 8, 9)",
				},
			},
		},
	});

	expectPalette(config.theme.colors.brand, {
		700: "Color3.fromRGB(7, 8, 9)",
	});
});

test("extend colors merge into existing families at shade depth", () => {
	const colors = resolveThemeColors(
		{
			slate: {
				50: "Color3.fromRGB(1, 1, 1)",
				100: "Color3.fromRGB(2, 2, 2)",
				200: "Color3.fromRGB(2, 2, 2)",
				300: "Color3.fromRGB(2, 2, 2)",
				400: "Color3.fromRGB(2, 2, 2)",
				500: "Color3.fromRGB(2, 2, 2)",
				600: "Color3.fromRGB(2, 2, 2)",
				700: "Color3.fromRGB(3, 3, 3)",
				800: "Color3.fromRGB(2, 2, 2)",
				900: "Color3.fromRGB(2, 2, 2)",
				950: "Color3.fromRGB(2, 2, 2)",
			},
		},
		{
			slate: {
				500: "Color3.fromRGB(9, 9, 9)",
			},
		},
		undefined,
	);

	expect(colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(1, 1, 1)",
			500: "Color3.fromRGB(9, 9, 9)",
			700: "Color3.fromRGB(3, 3, 3)",
		}),
	);
});

test("extend colors preserve singleton inputs and shade palettes", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					surface: "Color3.fromRGB(7, 7, 7)",
					slate: {
						700: "Color3.fromRGB(7, 7, 7)",
					},
				},
			},
		},
	});

	expect(config.theme.colors.surface).toBe("Color3.fromRGB(7, 7, 7)");
	expect(config.theme.colors.slate).toEqual(
		expect.objectContaining({
			700: "Color3.fromRGB(7, 7, 7)",
		}),
	);
});

test("top-level colors replace the final family set", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: "Color3.fromRGB(1, 2, 3)",
			},
			extend: {
				colors: {
					accent: "Color3.fromRGB(4, 5, 6)",
				},
			},
		},
	});

	expect(Object.keys(config.theme.colors)).toEqual(["brand"]);
	expect(config.theme.colors.brand).toBe("Color3.fromRGB(1, 2, 3)");
});

test("plugins register utilities against the resolved theme", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: { brand: "Color3.fromRGB(1, 2, 3)" },
			},
		},
		plugins: [
			plugin(({ addUtilities, theme }) => {
				addUtilities({
					".btn": "bg-brand rounded-lg px-4",
					panel: { BackgroundColor3: theme("colors.brand") },
				});
			}),
		],
	});

	expect(config.plugins.utilities).toEqual({
		btn: "bg-brand rounded-lg px-4",
		panel: { BackgroundColor3: "Color3.fromRGB(1, 2, 3)" },
	});
});

test("a later plugin overrides an earlier utility of the same name", () => {
	const config = defineConfig({
		plugins: [
			plugin(({ addUtilities }) => addUtilities({ btn: "px-2" })),
			plugin(({ addUtilities }) => addUtilities({ btn: "px-4" })),
		],
	});

	expect(config.plugins.utilities.btn).toBe("px-4");
});

test("rejects utility names and values a class token cannot carry", () => {
	const register = (utilities: Record<string, unknown>) =>
		defineConfig({
			plugins: [
				plugin(({ addUtilities }) =>
					addUtilities(utilities as Record<string, string>),
				),
			],
		});

	expect(() => register({ "hover:btn": "px-4" })).toThrow(/not a usable class/);
	expect(() => register({ btn: "  " })).toThrow(/empty class list/);
	expect(() => register({ btn: { "Background Color3": "x" } })).toThrow(
		/not a Roblox property name/,
	);
	expect(() => register({ btn: { BackgroundColor3: 3 } })).toThrow(
		/non-string value/,
	);
});

test("theme() reports a key the theme does not hold", () => {
	expect(() =>
		defineConfig({
			plugins: [
				plugin(({ addUtilities, theme }) =>
					addUtilities({ btn: { BackgroundColor3: theme("colors.nope") } }),
				),
			],
		}),
	).toThrow(/not a key of the resolved theme/);

	const config = defineConfig({
		plugins: [
			plugin(({ addUtilities, theme }) =>
				addUtilities({
					btn: {
						BackgroundColor3: theme("colors.nope", "Color3.fromRGB(0, 0, 0)"),
						TextColor3: theme("colors.slate.500"),
					},
				}),
			),
		],
	});

	expect(config.plugins.utilities.btn).toEqual({
		BackgroundColor3: "Color3.fromRGB(0, 0, 0)",
		TextColor3: "Color3.fromRGB(98, 116, 142)",
	});
});

test("a JSON config states its plugin utilities already resolved", () => {
	const config = defineConfig({
		plugins: { utilities: { btn: "px-4" } },
	});

	expect(config.plugins.utilities).toEqual({ btn: "px-4" });
});

test("a plugin can replace the motion driver", () => {
	const config = defineConfig({
		plugins: [
			plugin(({ setMotionDriver }) =>
				setMotionDriver({
					module: "@rbxts/vela-spring",
					export: "springDriver",
				}),
			),
		],
	});

	expect(config.plugins.motion).toEqual({
		module: "@rbxts/vela-spring",
		export: "springDriver",
	});
});

test("the motion driver module has to resolve from every module", () => {
	const setDriver = (driver: { module: string; export?: string }) =>
		defineConfig({
			plugins: [plugin(({ setMotionDriver }) => setMotionDriver(driver))],
		});

	expect(() => setDriver({ module: "./motion" })).toThrow(
		/relative path cannot resolve/,
	);
	expect(() => setDriver({ module: "  " })).toThrow(/no module/);
	expect(() => setDriver({ module: "m", export: "not an identifier" })).toThrow(
		/not an identifier/,
	);
	expect(setDriver({ module: "m" }).plugins.motion).toEqual({ module: "m" });
});

test("a partial rem override merges field by field", () => {
	const config = defineConfig({
		theme: {
			rem: { min: 12, baseResolution: { y: 1080 } },
		},
	});

	expect(config.theme.rem).toEqual({
		base: 16,
		min: 12,
		max: 64,
		baseResolution: { x: 1920, y: 1080 },
		pinnedUnder: ["surfacegui", "billboardgui"],
	});
});

// A `SurfaceGui` draws at the pixel space its part gives it, so the viewport
// the curve follows says nothing about it. A list that merged could never say
// "none", so naming one replaces the defaults rather than adding to them.
test("pinned containers replace the defaults and are matched in lowercase", () => {
	expect(
		defineConfig({ theme: { rem: { pinnedUnder: ["SurfaceGui"] } } }).theme.rem
			.pinnedUnder,
	).toEqual(["surfacegui"]);

	expect(
		defineConfig({ theme: { rem: { pinnedUnder: [] } } }).theme.rem.pinnedUnder,
	).toEqual([]);
});

test("pinning min to max takes the scaling out of every offset", () => {
	const config = defineConfig({
		theme: {
			extend: { rem: { min: 16, max: 16 } },
		},
	});

	expect(config.theme.rem.min).toBe(config.theme.rem.max);
	expect(config.theme.rem.base).toBe(16);
});

test("an inverted rem clamp collapses onto min", () => {
	const config = defineConfig({
		theme: { rem: { min: 32, max: 16 } },
	});

	expect(config.theme.rem.min).toBe(32);
	expect(config.theme.rem.max).toBe(32);
});

test("resolves presets before the config that names them", () => {
	const base = definePreset({
		theme: {
			extend: {
				colors: { brand: "Color3.fromRGB(1, 1, 1)" },
				screens: { phone: 480 },
			},
		},
	});
	const overlay = definePreset({
		theme: { extend: { colors: { brand: "Color3.fromRGB(2, 2, 2)" } } },
	});

	const config = defineConfig({
		presets: [base, overlay],
		theme: { extend: { colors: { accent: "Color3.fromRGB(3, 3, 3)" } } },
	});

	// Later presets win over earlier ones...
	expect(config.theme.colors.brand).toBe("Color3.fromRGB(2, 2, 2)");
	// ...and everything a preset added is still there.
	expect(config.theme.colors.accent).toBe("Color3.fromRGB(3, 3, 3)");
	expect(config.theme.screens.phone).toBe(480);
	expect(config.theme.screens.md).toBe(768);
});

test("a local theme always outranks a preset", () => {
	const preset = definePreset({
		theme: { extend: { colors: { brand: "Color3.fromRGB(1, 1, 1)" } } },
	});

	const config = defineConfig({
		presets: [preset],
		theme: { extend: { colors: { brand: "Color3.fromRGB(9, 9, 9)" } } },
	});

	expect(config.theme.colors.brand).toBe("Color3.fromRGB(9, 9, 9)");
});

// A preset replacing a scale is the preset saying "this is the whole set", so
// the project's `extend` adds to what the preset left rather than to the
// built-in defaults.
test("theme.extend extends what a preset replaced", () => {
	const preset = definePreset({
		theme: { radius: { sm: "new UDim(0, 1)" } },
	});

	const config = defineConfig({
		presets: [preset],
		theme: { extend: { radius: { lg: "new UDim(0, 2)" } } },
	});

	expect(config.theme.radius).toEqual({
		sm: "new UDim(0, 1)",
		lg: "new UDim(0, 2)",
	});
});

test("runs preset plugins before the project's own", () => {
	const order: string[] = [];
	const preset = definePreset({
		plugins: [
			plugin(({ addUtilities }) => {
				order.push("preset");
				addUtilities({ box: "p-4" });
			}),
		],
	});

	const config = defineConfig({
		presets: [preset],
		plugins: [
			plugin(({ addUtilities }) => {
				order.push("project");
				addUtilities({ box: "p-8" });
			}),
		],
	});

	expect(order).toEqual(["preset", "project"]);
	expect(config.plugins.utilities.box).toBe("p-8");
});

test("rejects a preset that includes itself", () => {
	const preset: Record<string, unknown> = { theme: {} };
	preset.presets = [preset];

	expect(() => defineConfig({ presets: [preset] })).toThrow(/recursive/);
});

test("rejects a preset that is not a configuration object", () => {
	expect(() =>
		defineConfig({ presets: ["nope" as unknown as VelaPreset] }),
	).toThrow(/not a vela configuration object/);
});

test("registers custom variants through addVariant", () => {
	const config = defineConfig({
		plugins: [
			plugin(({ addVariant }) => {
				addVariant("open", { attribute: "State", equals: "open" });
				addVariant("disabled", { attribute: "Disabled", equals: true });
				addVariant("tier", { attribute: "Tier", equals: 2 });
			}),
		],
	});

	expect(config.plugins.variants).toEqual({
		open: { attribute: "State", equals: "open" },
		disabled: { attribute: "Disabled", equals: true },
		tier: { attribute: "Tier", equals: 2 },
	});
});

test("rejects variant names vela already reads as something else", () => {
	const register = (name: string) =>
		defineConfig({
			plugins: [
				plugin(({ addVariant }) => {
					addVariant(name, { attribute: "State", equals: "open" });
				}),
			],
		});

	expect(() => register("hover")).toThrow(/built-in/);
	expect(() => register("md")).toThrow(/theme.screens/);
	expect(() => register("max-md")).toThrow(/breakpoint range/);
	expect(() => register("attr-x")).toThrow(/attribute variant/);
	expect(() => register("open:closed")).toThrow(/usable class prefix/);
});

test("rejects a variant with no attribute to read", () => {
	expect(() =>
		defineConfig({
			plugins: [
				plugin(({ addVariant }) => {
					addVariant("open", {
						attribute: "not a name",
						equals: "open",
					});
				}),
			],
		}),
	).toThrow(/Roblox attribute name/);
});

test("resolves screens as a theme axis", () => {
	expect(defaultConfig.theme.screens).toEqual({
		sm: 640,
		md: 768,
		lg: 1024,
		xl: 1280,
		"2xl": 1536,
	});

	const extended = defineConfig({
		theme: { extend: { screens: { tablet: 900 } } },
	});
	expect(extended.theme.screens.tablet).toBe(900);
	expect(extended.theme.screens.sm).toBe(640);

	const replaced = defineConfig({
		theme: { screens: { phone: 480, desktop: 1280 } },
	});
	expect(replaced.theme.screens).toEqual({ phone: 480, desktop: 1280 });
});

test("rejects a screen that is not a whole pixel width", () => {
	expect(() => defineConfig({ theme: { screens: { phone: 480.5 } } })).toThrow(
		/whole viewport width/,
	);
});
