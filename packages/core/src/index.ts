import { defaultConfig, type TailwindConfig } from "@rbxts-tailwind/config";
import type { Diagnostic, StyleIR } from "@rbxts-tailwind/ir";

export type ResolveClassTokensOptions = {
	config?: TailwindConfig;
};

export function tokenizeClassName(input: string): string[] {
	return input
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}

export function resolveClassTokens(
	tokens: string[],
	options: ResolveClassTokensOptions = {},
): StyleIR {
	const config = options.config ?? defaultConfig;
	const props: StyleIR["props"] = [];
	const helpers: StyleIR["helpers"] = [];
	const diagnostics: Diagnostic[] = [];

	for (const token of tokens) {
		switch (token) {
			case "rounded-md": {
				helpers.push({
					tag: "uicorner",
					props: [{ name: "CornerRadius", value: config.theme.radius.md }],
				});
				break;
			}
			case "px-4": {
				helpers.push({
					tag: "uipadding",
					props: [
						{ name: "PaddingLeft", value: config.theme.spacing["4"] },
						{ name: "PaddingRight", value: config.theme.spacing["4"] },
					],
				});
				break;
			}
			case "bg-surface": {
				props.push({
					name: "BackgroundColor3",
					value: config.theme.colors.surface,
				});
				break;
			}
			default: {
				diagnostics.push({
					level: "warning",
					code: "unsupported-utility",
					message: `Unsupported utility "${token}" in className literal.`,
					token,
				});
			}
		}
	}

	return { props, helpers, diagnostics };
}
