import { implementationKind, transform } from "@rbxts-tailwind/compiler";
import { expect, expectTypeOf, test } from "vitest";
import { defaultConfig, defineConfig } from "../../config/src/index.ts";

test("resolves theme-driven utility families and keeps last matching utility", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					primary: "Color3.fromRGB(99, 102, 241)",
				},
				radius: {
					lg: "new UDim(0, 12)",
				},
			},
		},
	});

	const source =
		'<frame className="rounded-md rounded-lg px-4 py-4 pt-4 bg-surface bg-primary" />';
	const result = transform(source, { configJson: JSON.stringify(config) });

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code.includes("className=")).toBe(false);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(99, 102, 241\)\}/,
	);
	expect(result.code).toMatch(
		/<uicorner\b[^>]*CornerRadius=\{new UDim\(0, 12\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(/<uipadding\b[^>]*\/>/i);
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 12\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 12\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 12\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 12\)\}/);
	expect(result.code).not.toContain("theme.");
});

test("warns on unsupported utility families and missing theme keys", () => {
	const result = transform('<frame className="shadow-md bg-card rounded-xl" />');

	expect(result.changed).toBe(false);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-utility-family",
				token: "shadow-md",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "bg-card",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "rounded-xl",
			}),
		]),
	);
});

test("keeps the public transform options compiler-centric", () => {
	expectTypeOf<Parameters<typeof transform>[1]>().toEqualTypeOf<
		| {
				configJson?: string;
		  }
		| null
		| undefined
	>();
});

test("loads the native compiler binding", () => {
	expect(implementationKind()).toBe("native");
});

test("retains the default config shape for compatibility", () => {
	expect(defaultConfig).toEqual({
		theme: {
			colors: {
				surface: "Color3.fromRGB(40, 48, 66)",
			},
			radius: {
				md: "new UDim(0, 8)",
			},
			spacing: {
				"4": "new UDim(0, 12)",
			},
		},
	});
});
