import defaultConfigSource from "./defaults.json" with { type: "json" };

export type ThemeScale = Record<string, string>;

export type ThemeConfig = {
	colors: ThemeScale;
	radius: ThemeScale;
	spacing: ThemeScale;
};

export type TailwindConfig = {
	theme: ThemeConfig;
};

export type TailwindConfigInput = {
	theme?: {
		colors?: ThemeScale;
		radius?: ThemeScale;
		spacing?: ThemeScale;
		extend?: {
			colors?: ThemeScale;
			radius?: ThemeScale;
			spacing?: ThemeScale;
		};
	};
};

const validatedDefaultConfig = defaultConfigSource satisfies TailwindConfig;

export const defaultConfig: TailwindConfig = validatedDefaultConfig;

export function defineConfig(input: TailwindConfigInput = {}): TailwindConfig {
	const extend = input.theme?.extend;

	return {
		theme: {
			colors: resolveThemeScale(
				defaultConfig.theme.colors,
				extend?.colors,
				input.theme?.colors,
			),
			radius: resolveThemeScale(
				defaultConfig.theme.radius,
				extend?.radius,
				input.theme?.radius,
			),
			spacing: resolveThemeScale(
				defaultConfig.theme.spacing,
				extend?.spacing,
				input.theme?.spacing,
			),
		},
	};
}

function resolveThemeScale(
	base: ThemeScale,
	extend: ThemeScale | undefined,
	override: ThemeScale | undefined,
): ThemeScale {
	// Tailwind-style rule for v0.1:
	// - `theme.extend.*` augments the built-in defaults.
	// - top-level `theme.*` replaces the final scale for that family.
	const mergedDefaults = {
		...base,
		...extend,
	};

	return override ?? mergedDefaults;
}
