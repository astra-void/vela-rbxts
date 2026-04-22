import defaultConfigSource from "./defaults.json" with { type: "json" };

export const SHADES = [
	50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
] as const;
export type Shade = (typeof SHADES)[number];

export type ThemeScale = Record<string, string>;

export type NormalizedColorScale = Record<Shade, string>;

export type ThemeColors = Record<string, NormalizedColorScale>;

export type ColorScaleInput = string | Partial<NormalizedColorScale>;

export type ColorInputMap = Record<string, ColorScaleInput>;

export type ThemeConfig = {
	colors: ThemeColors;
	radius: ThemeScale;
	spacing: ThemeScale;
};

export type TailwindConfig = {
	theme: ThemeConfig;
};

export type ThemeConfigInput = {
	colors?: ColorInputMap;
	radius?: ThemeScale;
	spacing?: ThemeScale;
	extend?: {
		colors?: ColorInputMap;
		radius?: ThemeScale;
		spacing?: ThemeScale;
	};
};

export type TailwindConfigInput = {
	theme?: ThemeConfigInput;
};

const defaultConfigInput = defaultConfigSource satisfies TailwindConfigInput;

const emptyConfig: TailwindConfig = {
	theme: {
		colors: {},
		radius: {},
		spacing: {},
	},
};

export const defaultConfig: TailwindConfig = resolveConfig(
	defaultConfigInput,
	emptyConfig,
);

export function defineConfig(input: TailwindConfigInput = {}): TailwindConfig {
	return resolveConfig(input, defaultConfig);
}

function resolveConfig(
	input: TailwindConfigInput,
	base: TailwindConfig,
): TailwindConfig {
	const extend = input.theme?.extend;

	return {
		theme: {
			colors: resolveThemeColors(
				base.theme.colors,
				extend?.colors,
				input.theme?.colors,
			),
			radius: resolveThemeScale(
				base.theme.radius,
				extend?.radius,
				input.theme?.radius,
			),
			spacing: resolveThemeScale(
				base.theme.spacing,
				extend?.spacing,
				input.theme?.spacing,
			),
		},
	};
}

export function resolveThemeColors(
	base: ThemeColors,
	extend: ColorInputMap | undefined,
	override: ColorInputMap | undefined,
): ThemeColors {
	// Tailwind-style rule for v0.1:
	// - `theme.extend.*` augments the built-in defaults.
	// - top-level `theme.*` replaces the final scale for that family.
	const mergedDefaults = mergeColorRegistry(base, extend);

	return override ? normalizeColorRegistry(override) : mergedDefaults;
}

export function mergeColorRegistry(
	base: ThemeColors,
	extend: ColorInputMap | undefined,
): ThemeColors {
	const merged: ThemeColors = { ...base };

	if (!extend) {
		return merged;
	}

	for (const [name, value] of Object.entries(extend)) {
		const baseScale = merged[name];
		if (!baseScale) {
			merged[name] = normalizeColorScale(value);
			continue;
		}

		merged[name] = {
			...baseScale,
			...toExplicitColorScale(value),
		};
	}

	return merged;
}

export function normalizeColorRegistry(
	colors: ColorInputMap | undefined,
): ThemeColors {
	const normalized: ThemeColors = {};

	if (!colors) {
		return normalized;
	}

	for (const [name, value] of Object.entries(colors)) {
		normalized[name] = normalizeColorScale(value);
	}

	return normalized;
}

export function normalizeColorScale(
	value: ColorScaleInput,
): NormalizedColorScale {
	const source = typeof value === "string" ? { 500: value } : value;
	const seed = resolveSeedColorValue(source);
	const normalized = {} as NormalizedColorScale;

	for (const shade of SHADES) {
		normalized[shade] = source[shade] ?? seed;
	}

	return normalized;
}

function toExplicitColorScale(
	value: ColorScaleInput,
): Partial<NormalizedColorScale> {
	const source = typeof value === "string" ? { 500: value } : value;

	resolveSeedColorValue(source);

	return source;
}

function resolveSeedColorValue(source: Partial<NormalizedColorScale>): string {
	if (typeof source[500] === "string") {
		return source[500];
	}

	for (const shade of SHADES) {
		const value = source[shade];
		if (typeof value === "string") {
			return value;
		}
	}

	throw new Error(
		"Color scale normalization requires at least one shade value.",
	);
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
