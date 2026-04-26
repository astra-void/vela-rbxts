import { implementationKind, transform } from "@vela-rbxts/compiler";
import { expect, expectTypeOf, test } from "vitest";
import { defaultConfig, defineConfig } from "../../config/src/index";

function buildColorPalette(entries: Record<string, string>) {
	return entries;
}

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
				none: "new UDim(0, 0)",
				xs: "new UDim(0, 2)",
				sm: "new UDim(0, 4)",
				md: "new UDim(0, 6)",
				lg: "new UDim(0, 12)",
				xl: "new UDim(0, 16)",
				"2xl": "new UDim(0, 16)",
				"3xl": "new UDim(0, 24)",
				"4xl": "new UDim(0, 32)",
				full: "new UDim(0.5, 0)",
			},
			spacing: {
				"4": "new UDim(0, 16)",
				"6": "new UDim(0, 16)",
			},
		},
	});

	const source =
		'<frame className="bg-primary rounded-md rounded-lg px-6 py-6 pt-6" />';
	const result = transform(source, { configJson: JSON.stringify(config) });

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.diagnostics).toEqual([]);
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

test("resolves normalized shade tokens from config colors", () => {
	const config = defineConfig({
		theme: {
			colors: {
				surface: "Color3.fromRGB(40, 48, 66)",
				slate: {
					50: "Color3.fromRGB(1, 2, 3)",
					500: "Color3.fromRGB(4, 5, 6)",
					700: "Color3.fromRGB(4, 5, 6)",
				},
			},
		},
	});

	expect(config.theme.colors.surface).toBe("Color3.fromRGB(40, 48, 66)");
	expect(config.theme.colors.slate).toEqual(
		expect.objectContaining({
			50: "Color3.fromRGB(1, 2, 3)",
			500: "Color3.fromRGB(4, 5, 6)",
			700: "Color3.fromRGB(4, 5, 6)",
		}),
	);

	const result = transform(
		'<frame><frame className="bg-surface" /><frame className="bg-slate-700" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(40, 48, 66)}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(4, 5, 6)}/>",
	);
});

test("merges extend colors without inventing fake singleton shades", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					slate: buildColorPalette({
						500: "Color3.fromRGB(100, 116, 139)",
					}),
					blue: buildColorPalette({
						600: "Color3.fromRGB(37, 99, 235)",
					}),
					rose: buildColorPalette({
						400: "Color3.fromRGB(251, 113, 133)",
					}),
				},
			},
		},
	});

	const result = transform(
		'<frame><frame className="bg-slate-500" /><frame className="bg-slate-700" /><frame className="bg-blue-600" /><frame className="bg-rose-400" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	const defaultSlate700 = (
		defaultConfig.theme.colors.slate as Record<string, string>
	)["700"];
	expect(result.code).toContain(
		`<frame BackgroundColor3={${defaultSlate700}}/>`,
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(100, 116, 139)}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(37, 99, 235)}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(251, 113, 133)}/>",
	);
});

test("rejects unshaded palette access and invalid singleton shade access", () => {
	const config = defineConfig({
		theme: {
			colors: {
				brand: buildColorPalette({
					500: "Color3.fromRGB(12, 34, 56)",
					700: "Color3.fromRGB(78, 90, 123)",
				}),
				surface: "Color3.fromRGB(40, 48, 66)",
			},
		},
	});

	const result = transform(
		'<frame><frame className="bg-brand" /><frame className="bg-brand-700" /><frame className="bg-surface-700" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "color-missing-shade",
				token: "bg-brand",
			}),
			expect.objectContaining({
				level: "warning",
				code: "color-invalid-shade",
				token: "bg-surface-700",
			}),
		]),
	);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(78, 90, 123)}/>",
	);
	expect(result.code).not.toContain("Color3.fromRGB(12, 34, 56)");
});

test("resolves normalized default background colors and transparent keywords", () => {
	const result = transform(
		'<frame><frame className="bg-slate-700" /><frame className="bg-transparent" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	const defaultSlate700 = (
		defaultConfig.theme.colors.slate as Record<string, string>
	)["700"];
	expect(
		result.code.split(`BackgroundColor3={${defaultSlate700}}`),
	).toHaveLength(2);
	expect(result.code).toContain("<frame BackgroundTransparency={1}/>");
});

test("warns on unknown background color keys unless config defines them", () => {
	const result = transform('<frame className="bg-surface" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "bg-surface",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Background(Color3|Transparency)=/);
});

test("does not pretend to support unsupported color keywords", () => {
	const result = transform('<frame className="bg-current bg-inherit" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-color-key",
				token: "bg-current",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-color-key",
				token: "bg-inherit",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Background(Color3|Transparency)=/);
});

test("shares the color resolver across text image and placeholder utilities", () => {
	const config = defineConfig({
		theme: {
			extend: {
				colors: {
					slate: {
						500: "Color3.fromRGB(100, 116, 139)",
					},
					blue: {
						600: "Color3.fromRGB(37, 99, 235)",
					},
					rose: {
						400: "Color3.fromRGB(251, 113, 133)",
					},
				},
			},
		},
	});

	const result = transform(
		'<frame><textlabel className="text-slate-500 text-transparent" /><imagelabel className="image-blue-600 image-transparent" /><textbox className="placeholder-rose-400" /></frame>',
		{
			configJson: JSON.stringify(config),
		},
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain("<textlabel TextTransparency={1}/>");
	expect(result.code).toContain("<imagelabel ImageTransparency={1}/>");
	expect(result.code).toContain(
		"<textbox PlaceholderColor3={Color3.fromRGB(251, 113, 133)}/>",
	);
	expect(result.code).not.toContain("TextColor3=");
	expect(result.code).not.toContain("ImageColor3=");
});

test("resolves built-in radius presets out of the box", () => {
	const result = transform(
		'<frame><textbutton className="rounded-none" /><imagebutton className="rounded-sm" /><textbutton className="rounded-md" /><imagebutton className="rounded-lg" /><textbutton className="rounded-xl" /><imagebutton className="rounded-2xl" /><textbutton className="rounded-full" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain(
		"<textbutton><uicorner CornerRadius={new UDim(0, 0)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton><uicorner CornerRadius={new UDim(0, 4)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton><uicorner CornerRadius={new UDim(0, 6)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton><uicorner CornerRadius={new UDim(0, 8)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton><uicorner CornerRadius={new UDim(0, 12)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton><uicorner CornerRadius={new UDim(0, 16)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton><uicorner CornerRadius={new UDim(0.5, 0)}/></textbutton>",
	);
});

test("lowers supported z-index utilities to Roblox ZIndex", () => {
	const result = transform('<frame className="z-10" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/ZIndex=\{10\}/);
});

test("lets later z-index utilities win within the same className", () => {
	const result = transform('<frame className="z-10 z-30" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/ZIndex=\{30\}/);
	expect(result.code).not.toMatch(/ZIndex=\{10\}/);
});

test("mixes z-index lowering with existing direct prop utilities", () => {
	const result = transform('<frame className="rounded-md z-20 px-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/CornerRadius=\{new UDim\(0, 6\)\}/);
	expect(result.code).toMatch(/ZIndex=\{20\}/);
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 16\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 16\)\}/);
});

test("carries z-index utilities through the runtime variant path", () => {
	const result = transform('<frame className="z-10 md:z-20" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).toContain("__rbxtsTailwindRules");
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain("ZIndex={(10 as never)}");

	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "ZIndex",
						value: "10",
					}),
				]),
			}),
			runtimeRules: expect.arrayContaining([
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "width",
						alias: "md",
					}),
					effects: expect.objectContaining({
						props: expect.arrayContaining([
							expect.objectContaining({
								name: "ZIndex",
								value: "20",
							}),
						]),
					}),
				}),
			]),
		}),
	);
});

test("warns on unsupported z-index forms", () => {
	const result = transform('<frame className="z-auto -z-10 z-[123] z-999" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/ZIndex=/);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-z-index-auto",
				token: "z-auto",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-negative-z-index",
				token: "-z-10",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-arbitrary-z-index",
				token: "z-[123]",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-z-index-value",
				token: "z-999",
			}),
		]),
	);
});

test("lowers className on multiple supported Roblox host elements", () => {
	const config = defineConfig({
		theme: {
			colors: {
				surface: "Color3.fromRGB(10, 20, 30)",
			},
		},
	});
	const result = transform(
		'<frame><textlabel className="bg-surface" /><textbutton className="rounded-md" /><canvasgroup className="px-2 py-3 pt-1.5 pl-0.5" /><scrollingframe className="bg-surface" /><imagebutton className="rounded-md" /></frame>',
		{ configJson: JSON.stringify(config) },
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<textlabel\b[^>]*BackgroundColor3=\{Color3\.fromRGB\(10, 20, 30\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<scrollingframe\b[^>]*BackgroundColor3=\{Color3\.fromRGB\(10, 20, 30\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<textbutton\b[^>]*><uicorner\b[^>]*CornerRadius=\{new UDim\(0, 6\)\}[^>]*\/><\/textbutton>/i,
	);
	expect(result.code).toMatch(
		/<imagebutton\b[^>]*><uicorner\b[^>]*CornerRadius=\{new UDim\(0, 6\)\}[^>]*\/><\/imagebutton>/i,
	);
	expect(result.code).toMatch(/<uipadding\b[^>]*\/>/i);
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 2\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 6\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 12\)\}/);
});

test("resolves valid numeric spacing fallback tokens", () => {
	const result = transform('<frame className="px-2 pt-1.5 pl-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 2\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 6\)\}/);
});

test("resolves padding shorthand numeric spacing fallback tokens", () => {
	const result = transform('<frame className="p-2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 8\)\}/);
});

test("resolves fractional padding shorthand numeric spacing fallback tokens", () => {
	const result = transform('<frame className="p-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 2\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 2\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 2\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 2\)\}/);
});

test("resolves zero numeric spacing fallback tokens", () => {
	const result = transform('<frame className="pr-0" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 0\)\}/);
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

test("prefers explicit spacing config over padding shorthand numeric fallback", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const result = transform('<frame className="p-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 99\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 99\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 99\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 99\)\}/);
});

test("keeps spacing-backed padding and size utilities on the same resolver path", () => {
	const result = transform(
		'<frame className="p-2 px-2 pt-1.5 w-2 h-2 size-2" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingTop=\{new UDim\(0, 6\)\}/);
	expect(result.code).toMatch(/PaddingBottom=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(8, 8\)\}/);
});

test("lowers gap spacing utilities to a UIListLayout helper", () => {
	const result = transform('<frame className="gap-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<frame><uilistlayout\b[^>]*Padding=\{new UDim\(0, 16\)\}[^>]*\/><\/frame>/i,
	);
});

test("resolves fractional gap numeric spacing fallback tokens", () => {
	const result = transform('<frame className="gap-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/<uilistlayout\b[^>]*\/>/i);
	expect(result.code).toMatch(/Padding=\{new UDim\(0, 2\)\}/);
});

test("prefers explicit spacing config for gap utilities", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const result = transform('<frame className="gap-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/<uilistlayout\b[^>]*\/>/i);
	expect(result.code).toMatch(/Padding=\{new UDim\(0, 99\)\}/);
});

test("lowers width spacing utilities to a direct Size prop", () => {
	const result = transform('<frame className="w-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(16, 0\)\}/);
	expect(result.code).not.toMatch(/<uisize\b/i);
});

test("lowers height spacing utilities to a direct Size prop", () => {
	const result = transform('<frame className="h-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(0, 16\)\}/);
	expect(result.code).not.toMatch(/<uisize\b/i);
});

test("lowers square size spacing utilities to both Size axes", () => {
	const result = transform('<frame className="size-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(16, 16\)\}/);
});

test("lowers square pixel size utilities to both Size axes", () => {
	const result = transform('<frame className="size-px" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(1, 1\)\}/);
});

test("lowers square full size utilities to both Size axes", () => {
	const result = transform('<frame className="size-full" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(1, 1\)\}/);
});

test("lowers square fractional size utilities to both Size axes", () => {
	const result = transform('<frame className="size-1/2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(0\.5, 0\.5\)\}/);
});

test("lets width utilities override only the width axis after size", () => {
	const result = transform('<frame className="size-4 w-8" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(32, 16\)\}/);
});

test("lets height utilities override only the height axis after size", () => {
	const result = transform('<frame className="size-4 h-8" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(16, 32\)\}/);
});

test("resolves width and height numeric spacing fallback tokens", () => {
	const result = transform('<frame className="w-2 h-3" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(8, 12\)\}/);
});

test("lowers pixel width and height utilities to one offset pixel", () => {
	const result = transform('<frame className="w-px h-px" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(1, 1\)\}/);
});

test("lowers full width and height utilities to full scale", () => {
	const result = transform('<frame className="w-full h-full" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(1, 1\)\}/);
});

test("lowers fractional width and height utilities to scale axes", () => {
	const result = transform('<frame className="w-1/2 h-3/4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(0\.5, 0\.75\)\}/);
});

test("lowers twelfth fractional width utilities", () => {
	const result = transform('<frame className="w-5/12" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromScale\(0\.4166666667, 0\)\}/);
});

test("lets full width override only the width axis after size", () => {
	const result = transform('<frame className="size-4 w-full" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.new\(1, 0, 0, 16\)\}/);
});

test("lets height spacing utilities override only the height axis after full size", () => {
	const result = transform('<frame className="size-full h-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.new\(1, 0, 0, 16\)\}/);
});

test("lets fractional height override only the height axis after size", () => {
	const result = transform('<frame className="size-4 h-1/2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.new\(0, 16, 0\.5, 0\)\}/);
});

test("prefers explicit spacing config for size utilities", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
				"3": "new UDim(0, 111)",
			},
		},
	});

	const result = transform('<frame className="size-2 h-3" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(99, 111\)\}/);
});

test("prefers the same explicit spacing override across padding and size utilities", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0, 99)",
			},
		},
	});

	const paddingResult = transform('<frame className="p-2 px-2 pt-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(paddingResult.changed).toBe(true);
	expect(paddingResult.diagnostics).toEqual([]);
	expect(paddingResult.code).toMatch(/PaddingLeft=\{new UDim\(0, 99\)\}/);
	expect(paddingResult.code).toMatch(/PaddingRight=\{new UDim\(0, 99\)\}/);
	expect(paddingResult.code).toMatch(/PaddingTop=\{new UDim\(0, 99\)\}/);
	expect(paddingResult.code).toMatch(/PaddingBottom=\{new UDim\(0, 99\)\}/);

	const sizeResult = transform('<frame className="w-2 h-2 size-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(sizeResult.changed).toBe(true);
	expect(sizeResult.diagnostics).toEqual([]);
	expect(sizeResult.code).toMatch(/Size=\{UDim2\.fromOffset\(99, 99\)\}/);
});

test("warns when size utilities resolve to non-offset spacing values", () => {
	const config = defineConfig({
		theme: {
			spacing: {
				"2": "new UDim(0.5, 0)",
			},
		},
	});

	const result = transform('<frame className="w-2" />', {
		configJson: JSON.stringify(config),
	});

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-size-spacing-value",
				token: "w-2",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects invalid numeric spacing fallback tokens", () => {
	const result = transform('<frame className="px--1 px-2.3 px-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px--1",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px-2.3",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/PaddingLeft=/);
	expect(result.code).not.toMatch(/PaddingRight=/);
});

test("rejects invalid padding shorthand spacing fallback tokens", () => {
	const result = transform('<frame className="p-card p-2.3" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "p-card",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "p-2.3",
			}),
		]),
	);
	expect(result.code).not.toMatch(/PaddingLeft=/);
	expect(result.code).not.toMatch(/PaddingRight=/);
	expect(result.code).not.toMatch(/PaddingTop=/);
	expect(result.code).not.toMatch(/PaddingBottom=/);
});

test("rejects invalid spacing tokens consistently across padding and size utilities", () => {
	const result = transform(
		'<frame className="p-card px-2.3 w-2.3 size-card" />',
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "p-card",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "px-2.3",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "w-2.3",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "size-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Padding=/);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects unknown gap spacing tokens", () => {
	const result = transform('<frame className="gap-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "gap-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/<uilistlayout\b/i);
	expect(result.code).not.toMatch(/Padding=/);
});

test("rejects unknown size spacing tokens", () => {
	const result = transform('<frame className="w-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "w-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects unknown square size spacing tokens", () => {
	const result = transform('<frame className="size-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "size-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects invalid numeric size spacing fallback tokens", () => {
	const result = transform('<frame className="h-2.3" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "h-2.3",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("rejects invalid numeric square size spacing fallback tokens", () => {
	const result = transform('<frame className="size-2.3" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "size-2.3",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("warns on fit size mode instead of generating misleading sizing", () => {
	const result = transform('<frame className="w-fit h-fit" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-size-mode",
				token: "w-fit",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-size-mode",
				token: "h-fit",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("warns on square fit size mode instead of generating misleading sizing", () => {
	const result = transform('<frame className="size-fit" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-size-mode",
				token: "size-fit",
			}),
		]),
	);
	expect(result.code).not.toMatch(/Size=/);
});

test("warns on unknown radius keys without falling back to numeric radius resolution", () => {
	const result = transform('<frame className="rounded-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "rounded-card",
			}),
		]),
	);
	expect(result.code).not.toMatch(/CornerRadius=/);
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

test("rewrites dynamic ClassValue expressions through the runtime wrapper", () => {
	const result = transform(
		'<frame className={["bg-slate-500", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain('import __VelaReact from "@rbxts/react";');
	expect(result.code).toContain("const RbxtsTailwindRuntimeHost =");
	expect(result.code).toContain("<RbxtsTailwindRuntimeHost");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(result.code).toContain("BackgroundColor3");
	expect(result.code).toContain('className={active && "rounded-md"}');
	expect(result.code).not.toContain("unsupported-classname-expression");
	expect(result.ir).toHaveLength(1);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "BackgroundColor3",
					}),
				]),
				helpers: [],
			}),
			runtimeRules: [],
			runtimeClassValue: true,
		}),
	);
});

test("folds a fully static array className without injecting the runtime wrapper", () => {
	const result = transform(
		'<frame className={["bg-slate-500", true && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__createVelaRuntimeHost");
	expect(result.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain("BackgroundColor3");
	expect(result.code).toContain("uicorner");
	expect(result.ir).toHaveLength(1);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "BackgroundColor3",
					}),
				]),
				helpers: expect.arrayContaining([
					expect.objectContaining({
						tag: "uicorner",
					}),
				]),
			}),
			runtimeRules: [],
			runtimeClassValue: false,
		}),
	);
});

test("folds a locally constant identifier before lowering the className", () => {
	const result = transform(
		'const active = true; <frame className={["bg-slate-500", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__createVelaRuntimeHost");
	expect(result.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain("BackgroundColor3");
	expect(result.code).toContain("uicorner");
});

test("folds a constant object map down to the surviving static key", () => {
	const result = transform(
		'const roomy = false; <frame className={{ "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__createVelaRuntimeHost");
	expect(result.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/PaddingLeft=\{new UDim\(0, 8\)\}/);
	expect(result.code).toMatch(/PaddingRight=\{new UDim\(0, 8\)\}/);
});

test("folds a constant ternary to a static utility class", () => {
	const result = transform(
		'const wide = false; <frame className={wide ? "w-80" : "w-40"} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__createVelaRuntimeHost");
	expect(result.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{UDim2\.fromOffset\(160, 0\)\}/);
});

test("keeps the runtime wrapper when a dynamic remainder survives constant folding", () => {
	const result = transform(
		'const active = true; <frame className={["bg-slate-500", active && dynamicToken]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).toContain("className={dynamicToken}");
	expect(result.code).not.toContain("active && dynamicToken");
	expect(result.code).toContain("BackgroundColor3");
});

test("keeps dynamic object-map className values on the runtime wrapper", () => {
	const result = transform(
		'let roomy = false; <frame className={{ "bg-slate-500": true, "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).toContain("BackgroundColor3");
	expect(result.code).toContain("className={{");
	expect(result.code).toContain('"px-4": roomy');
	expect(result.code).toContain('"px-2": !roomy');
	expect(result.code).not.toContain('"bg-slate-500": true');
});

test("keeps variant-prefixed literals on the runtime rule path when they survive folding", () => {
	const enabledResult = transform(
		'const enabled = true; <frame className={["rounded-md", enabled && "md:px-4"]} />',
	);

	expect(enabledResult.changed).toBe(true);
	expect(enabledResult.diagnostics).toEqual([]);
	expect(enabledResult.code).toContain("__createVelaRuntimeHost");
	expect(enabledResult.code).toContain("RbxtsTailwindRuntimeHost");
	expect(enabledResult.code).toContain("__rbxtsTailwindRules");
	expect(enabledResult.code).not.toContain("className=");
	expect(enabledResult.code).toContain("uicorner");

	const disabledResult = transform(
		'const enabled = false; <frame className={["rounded-md", enabled && "md:px-4"]} />',
	);

	expect(disabledResult.changed).toBe(true);
	expect(disabledResult.diagnostics).toEqual([]);
	expect(disabledResult.code).not.toContain("__createVelaRuntimeHost");
	expect(disabledResult.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(disabledResult.code).not.toContain("__rbxtsTailwindRules");
	expect(disabledResult.code).not.toContain("className=");
	expect(disabledResult.code).toContain("uicorner");
});

test("lifts variant-prefixed literal utilities into runtime rules", () => {
	const result = transform(
		'<frame className="rounded-md md:px-4 portrait:w-80" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain('import __VelaReact from "@rbxts/react";');
	expect(result.code).toContain("const RbxtsTailwindRuntimeHost =");
	expect(result.code).toContain("<RbxtsTailwindRuntimeHost");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(result.code).toContain("__rbxtsTailwindRules");
	expect(result.code).not.toContain(
		'className="rounded-md md:px-4 portrait:w-80"',
	);
	expect(result.ir).toHaveLength(1);

	const style = JSON.parse(result.ir[0]);
	expect(style).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				helpers: expect.arrayContaining([
					expect.objectContaining({
						tag: "uicorner",
					}),
				]),
			}),
			runtimeRules: expect.arrayContaining([
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "width",
						alias: "md",
					}),
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uipadding",
							}),
						]),
					}),
				}),
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "orientation",
						value: "portrait",
					}),
					effects: expect.objectContaining({
						props: expect.arrayContaining([
							expect.objectContaining({
								name: "Size",
								value: "UDim2.fromOffset(320, 0)",
							}),
						]),
					}),
				}),
			]),
			runtimeClassValue: false,
		}),
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
