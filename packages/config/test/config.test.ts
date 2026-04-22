import { expect, test } from "vitest";

import defaultsInput from "../src/defaults.json" with { type: "json" };
import {
	defaultConfig,
	defineConfig,
	resolveThemeColors,
	SHADES,
} from "../src/index";

function expectNormalizedScale(
	scale: Record<string | number, string>,
	value: string,
) {
	expect(scale).toEqual(
		Object.fromEntries(SHADES.map((shade) => [shade, value])),
	);
}

test("keeps defaults authoring-shaped and normalizes them in code", () => {
	expect(defaultsInput.theme.colors.surface).toBe("Color3.fromRGB(40, 48, 66)");
	expectNormalizedScale(
		defaultConfig.theme.colors.surface,
		"Color3.fromRGB(40, 48, 66)",
	);
});

test("normalizes single literal color input", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: "Color3.fromRGB(1, 2, 3)",
			},
		},
	});

	expect(Object.keys(config.theme.colors)).toEqual(["brand"]);
	expectNormalizedScale(config.theme.colors.brand, "Color3.fromRGB(1, 2, 3)");
});

test("normalizes partial shade input from the seed shade", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: {
					700: "Color3.fromRGB(7, 8, 9)",
				},
			},
		},
	});

	expectNormalizedScale(config.theme.colors.brand, "Color3.fromRGB(7, 8, 9)");
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

	expect(colors.slate[50]).toBe("Color3.fromRGB(1, 1, 1)");
	expect(colors.slate[500]).toBe("Color3.fromRGB(9, 9, 9)");
	expect(colors.slate[700]).toBe("Color3.fromRGB(3, 3, 3)");
});

test("extend colors merge default families at shade depth", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					surface: {
						700: "Color3.fromRGB(7, 7, 7)",
					},
				},
			},
		},
	});

	expect(config.theme.colors.surface[500]).toBe("Color3.fromRGB(40, 48, 66)");
	expect(config.theme.colors.surface[700]).toBe("Color3.fromRGB(7, 7, 7)");
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
	expectNormalizedScale(config.theme.colors.brand, "Color3.fromRGB(1, 2, 3)");
});
