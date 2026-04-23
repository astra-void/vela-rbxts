import { expect, test } from "vitest";

import defaultsInput from "../src/defaults.json" with { type: "json" };
import { defaultConfig, defineConfig, resolveThemeColors } from "../src/index";

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
