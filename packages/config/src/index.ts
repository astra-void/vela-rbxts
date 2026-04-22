import defaultConfigSource from "./defaults.json" with { type: "json" };

export type ThemeConfig = {
	colors: {
		surface: string;
	};
	radius: {
		md: string;
	};
	spacing: {
		"4": string;
	};
};

export type TailwindConfig = {
	theme: ThemeConfig;
};

export type TailwindConfigInput = {
	theme?: {
		colors?: Partial<ThemeConfig["colors"]>;
		radius?: Partial<ThemeConfig["radius"]>;
		spacing?: Partial<ThemeConfig["spacing"]>;
	};
};

const validatedDefaultConfig = defaultConfigSource satisfies TailwindConfig;

export const defaultConfig: TailwindConfig = validatedDefaultConfig;

export function defineConfig(input: TailwindConfigInput = {}): TailwindConfig {
	return {
		theme: {
			colors: {
				surface:
					input.theme?.colors?.surface ?? defaultConfig.theme.colors.surface,
			},
			radius: {
				md: input.theme?.radius?.md ?? defaultConfig.theme.radius.md,
			},
			spacing: {
				"4": input.theme?.spacing?.["4"] ?? defaultConfig.theme.spacing["4"],
			},
		},
	};
}
