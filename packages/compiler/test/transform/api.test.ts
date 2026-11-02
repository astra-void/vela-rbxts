import { implementationKind, type transform } from "@vela-rbxts/compiler";
import { expect, expectTypeOf, test } from "vitest";
import { defaultConfig } from "../../../config/src/index";

test("keeps the public transform options compiler-centric", () => {
	expectTypeOf<Parameters<typeof transform>[1]>().toEqualTypeOf<
		| {
				configJson?: string;
				sourceMap?: boolean;
		  }
		| null
		| undefined
	>();
});

test("loads the native compiler binding", () => {
	expect(implementationKind()).toBe("native");
});

test("retains the default config shape for compatibility", () => {
	expect(defaultConfig.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(248, 250, 252)",
			500: "Color3.fromRGB(98, 116, 142)",
			700: "Color3.fromRGB(49, 65, 88)",
			950: "Color3.fromRGB(2, 6, 24)",
		}),
	);
	expect(defaultConfig.theme.colors.surface).toBeUndefined();
	expect(defaultConfig.theme.radius).toEqual({
		DEFAULT: "new UDim(0, 4)",
		none: "new UDim(0, 0)",
		xs: "new UDim(0, 2)",
		sm: "new UDim(0, 4)",
		md: "new UDim(0, 6)",
		lg: "new UDim(0, 8)",
		xl: "new UDim(0, 12)",
		"2xl": "new UDim(0, 16)",
		"3xl": "new UDim(0, 24)",
		"4xl": "new UDim(0, 32)",
		full: "new UDim(0.5, 0)",
	});
	expect(defaultConfig.theme.spacing).toEqual({
		"4": "new UDim(0, 16)",
	});
});
