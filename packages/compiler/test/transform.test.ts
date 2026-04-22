import { implementationKind, transform } from "@rbxts-tailwind/compiler";
import { expect, expectTypeOf, test } from "vitest";
import { defaultConfig, defineConfig } from "../../config/src/index";

test("applies theme.extend while top-level theme scales replace the family", () => {
	const config = defineConfig({
		theme: {
			colors: {
				primary: "Color3.fromRGB(99, 102, 241)",
			},
			extend: {
				colors: {
					secondary: "Color3.fromRGB(16, 185, 129)",
				},
				radius: {
					lg: "new UDim(0, 12)",
					xl: "new UDim(0, 16)",
				},
				spacing: {
					"6": "new UDim(0, 16)",
				},
			},
		},
	});

	expect(config).toEqual({
		theme: {
			colors: {
				primary: "Color3.fromRGB(99, 102, 241)",
			},
			radius: {
				md: "new UDim(0, 8)",
				lg: "new UDim(0, 12)",
				xl: "new UDim(0, 16)",
			},
			spacing: {
				"4": "new UDim(0, 16)",
				"6": "new UDim(0, 16)",
			},
		},
	});

	const source =
		'<frame className="bg-primary bg-secondary rounded-md rounded-lg px-6 py-6 pt-6" />';
	const result = transform(source, { configJson: JSON.stringify(config) });

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "bg-secondary",
			}),
		]),
	);
	expect(result.code.includes("className=")).toBe(false);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(99, 102, 241\)\}/,
	);
	expect(result.code).toMatch(
		/<uicorner\b[^>]*CornerRadius=\{new UDim\(0, 12\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(/<uipadding\b[^>]*\/>/i);
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 16\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 16\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 16\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 16\)\}/);
	expect(result.code).not.toContain("theme.");
});

test("lowers className on multiple supported Roblox host elements", () => {
	const result = transform(
		'<frame><textlabel className="bg-surface" /><textbutton className="rounded-md" /><canvasgroup className="px-2 py-3 pt-1.5 pl-0.5" /><scrollingframe className="bg-surface" /><imagebutton className="rounded-md" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<textlabel\b[^>]*BackgroundColor3=\{Color3\.fromRGB\(40, 48, 66\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<scrollingframe\b[^>]*BackgroundColor3=\{Color3\.fromRGB\(40, 48, 66\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<textbutton\b[^>]*><uicorner\b[^>]*CornerRadius=\{new UDim\(0, 8\)\}[^>]*\/><\/textbutton>/i,
	);
	expect(result.code).toMatch(
		/<imagebutton\b[^>]*><uicorner\b[^>]*CornerRadius=\{new UDim\(0, 8\)\}[^>]*\/><\/imagebutton>/i,
	);
	expect(result.code).toMatch(/<uipadding\b[^>]*\/>/i);
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 2\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 6\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 12\)\}/);
});

test("prefers explicit spacing config over numeric fallback", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const result = transform('<frame className="px-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 99\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 99\)\}/);
});

test("warns for unknown non-numeric spacing keys", () => {
	const result = transform('<frame className="px-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px-card",
			}),
		]),
	);
});

test("removes className even when only unsupported utilities remain", () => {
	const result = transform('<frame className="shadow-md bg-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
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
		]),
	);
});

test("removes non-literal className values and preserves the warning", () => {
	const result = transform("<frame className={themeClass} />");

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-classname-expression",
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
				"4": "new UDim(0, 16)",
			},
		},
	});
});
