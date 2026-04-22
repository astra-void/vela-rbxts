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
			colors: mergeThemeScale(
				defaultConfig.theme.colors,
				extend?.colors,
				input.theme?.colors,
			),
			radius: mergeThemeScale(
				defaultConfig.theme.radius,
				extend?.radius,
				input.theme?.radius,
			),
			spacing: mergeThemeScale(
				defaultConfig.theme.spacing,
				extend?.spacing,
				input.theme?.spacing,
			),
		},
	};
}

function mergeThemeScale(
	base: ThemeScale,
	extend: ThemeScale | undefined,
	override: ThemeScale | undefined,
): ThemeScale {
	return {
		...base,
		...extend,
		...override,
	};
}
