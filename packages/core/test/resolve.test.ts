import { expect, test } from "vitest";

import { resolveClassTokens, tokenizeClassName } from "../dist/index.js";

test("resolves rounded-md px-4 bg-surface into StyleIR", () => {
	const tokens = tokenizeClassName("rounded-md px-4 bg-surface");
	const result = resolveClassTokens(tokens);

	expect(result).toEqual({
		props: [{ name: "BackgroundColor3", value: "theme.colors.surface" }],
		helpers: [
			{
				tag: "uicorner",
				props: [{ name: "CornerRadius", value: "theme.radius.md" }],
			},
			{
				tag: "uipadding",
				props: [
					{ name: "PaddingLeft", value: "theme.spacing[4]" },
					{ name: "PaddingRight", value: "theme.spacing[4]" },
				],
			},
		],
		diagnostics: [],
	});
});
