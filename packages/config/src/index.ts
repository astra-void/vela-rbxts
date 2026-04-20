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

export const defaultConfig: TailwindConfig = {
	theme: {
		colors: {
			surface: "theme.colors.surface",
		},
		radius: {
			md: "theme.radius.md",
		},
		spacing: {
			"4": "theme.spacing[4]",
		},
	},
};

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
