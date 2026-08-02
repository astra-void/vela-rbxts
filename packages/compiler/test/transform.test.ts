import { implementationKind, transform } from "@vela-rbxts/compiler";
import { expect, expectTypeOf, test } from "vitest";
import { defaultConfig, defineConfig } from "../../config/src/index";

function buildColorPalette(entries: Record<string, string>) {
	return entries;
}

// Preflight would put its own background props on every element, which hides
// what a token-resolution test is actually asserting.
const withoutPreflight = {
	configJson: JSON.stringify(defineConfig({ preflight: false })),
};

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
		preflight: true,
		theme: {
			colors: {
				primary: "Color3.fromRGB(99, 102, 241)",
			},
			radius: {
				DEFAULT: "new UDim(0, 4)",
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
		"<frame BackgroundColor3={Color3.fromRGB(40, 48, 66)} BorderSizePixel={0}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(4, 5, 6)} BorderSizePixel={0}/>",
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
		`<frame BackgroundColor3={${defaultSlate700}} BorderSizePixel={0}/>`,
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(100, 116, 139)} BorderSizePixel={0}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(37, 99, 235)} BorderSizePixel={0}/>",
	);
	expect(result.code).toContain(
		"<frame BackgroundColor3={Color3.fromRGB(251, 113, 133)} BorderSizePixel={0}/>",
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
		"<frame BackgroundColor3={Color3.fromRGB(78, 90, 123)} BorderSizePixel={0}/>",
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
	expect(result.code).toContain(
		"<frame BackgroundTransparency={1} BorderSizePixel={0}/>",
	);
});

test("lowers border utilities to UIStroke helpers", () => {
	const result = transform(
		'<frame><frame className="border border-slate-700" /><frame className="border-2 border-blue-600" /><frame className="border-4 border-transparent" /><frame className="rounded-md border border-rose-500 px-4" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{1\}[^>]*Color=\{Color3\.fromRGB\(49, 65, 88\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{2\}[^>]*Color=\{Color3\.fromRGB\(21, 93, 252\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{4\}[^>]*Transparency=\{1\}[^>]*\/>/i,
	);
	expect(result.code).toContain("uicorner");
	expect(result.code).toContain("uistroke");
});

test("reports unsupported border forms with a targeted diagnostic", () => {
	const result = transform(
		'<frame className="border-dashed border-x border-8 border-[3px] border-opacity-50" />',
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-dashed",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-x",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-8",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-arbitrary-value",
				token: "border-[3px]",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-border-value",
				token: "border-opacity-50",
			}),
		]),
	);
	expect(result.code).not.toMatch(/<uistroke\b/i);
});

test("border static and runtime classifiers stay in parity", () => {
	const THICKNESS_KEYS = ["0", "1", "2", "4"] as const;
	const UNSUPPORTED_FORMS = [
		"dashed",
		"solid",
		"dotted",
		"double",
		"x",
		"y",
		"t",
		"r",
		"b",
		"l",
		"x-2",
		"opacity-50",
		"[3px]",
		"500/50",
		"8",
	] as const;

	for (const key of THICKNESS_KEYS) {
		const result = transform(`<frame className="border-${key}" />`);
		expect(result.diagnostics).toEqual([]);
		expect(result.code).toMatch(
			new RegExp(`<uistroke\\b[^>]*Thickness=\\{${key}\\}`, "i"),
		);
	}

	for (const form of UNSUPPORTED_FORMS) {
		const result = transform(`<frame className="border-${form}" />`);
		expect(
			result.diagnostics.some((diagnostic: { code: string }) =>
				["unsupported-border-value", "unsupported-arbitrary-value"].includes(
					diagnostic.code,
				),
			),
		).toBe(true);
		expect(result.code).not.toMatch(/<uistroke\b/i);
	}

	const runtime = transform(
		'<frame className={["border", active && "border-blue-600"]} />',
	);
	expect(runtime.needsRuntimeHost).toBe(true);
	expect(runtime.code).toContain(
		`key === "${THICKNESS_KEYS.join('" || key === "')}"`,
	);
	for (const keyword of ["dashed", "solid", "dotted", "double"]) {
		expect(runtime.code).toContain(`key === "${keyword}"`);
	}
	expect(runtime.code).toContain('startsWith(key, "opacity-")');
});

test("warns on unknown background color keys unless config defines them", () => {
	const result = transform(
		'<frame className="bg-surface" />',
		withoutPreflight,
	);

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
	const result = transform(
		'<frame className="bg-current bg-inherit" />',
		withoutPreflight,
	);

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
	expect(result.code).toContain(
		"<textlabel TextTransparency={1} BorderSizePixel={0} BackgroundTransparency={1}/>",
	);
	expect(result.code).toContain(
		"<imagelabel ImageTransparency={1} BorderSizePixel={0} BackgroundTransparency={1}/>",
	);
	expect(result.code).toContain(
		"<textbox PlaceholderColor3={Color3.fromRGB(251, 113, 133)} BorderSizePixel={0} BackgroundTransparency={1}/>",
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
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 0)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 4)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 6)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 8)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 12)}/></textbutton>",
	);
	expect(result.code).toContain(
		"<imagebutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0, 16)}/></imagebutton>",
	);
	expect(result.code).toContain(
		"<textbutton BorderSizePixel={0} BackgroundTransparency={1}><uicorner CornerRadius={new UDim(0.5, 0)}/></textbutton>",
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
	expect(result.code).toContain("VelaRuntimeHost");
	expect(result.code).toContain("__velaRules");
	expect(result.code).toContain("const __velaStringLen = string.len;");
	expect(result.code).toContain("const __velaStringSub = string.sub;");
	expect(result.code).toContain("__velaStringLen(value)");
	expect(result.code).toContain("__velaStringSub(value");
	expect(result.code).toContain("value.size()");
	expect(result.code).not.toContain("string.len(value)");
	expect(result.code).not.toContain("string.sub(value");
	expect(result.code).not.toMatch(/string\.len\s*\(/);
	expect(result.code).not.toMatch(/string\.sub\s*\(/);
	expect(result.code).not.toMatch(/\btable\s*[.:]\s*getn\b/);
	expect(result.code).not.toContain("value.length");
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
		/<frame\b[^>]*><uilistlayout\b[^>]*Padding=\{new UDim\(0, 16\)\}[^>]*\/><\/frame>/i,
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
	expect(result.code).toMatch(/Size=\{new UDim2\(1, 0, 0, 16\)\}/);
});

test("lets height spacing utilities override only the height axis after full size", () => {
	const result = transform('<frame className="size-full h-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{new UDim2\(1, 0, 0, 16\)\}/);
});

test("lets fractional height override only the height axis after size", () => {
	const result = transform('<frame className="size-4 h-1/2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Size=\{new UDim2\(0, 16, 0\.5, 0\)\}/);
});

test("keeps each size axis separate across variant rules", () => {
	const result = transform('<frame className="w-32 md:h-32 md:w-64" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);

	const style = JSON.parse(result.ir[0]);
	expect(style.base.props).toContainEqual({
		name: "Size",
		value: "UDim2.fromOffset(128, 0)",
	});
	expect(
		style.runtimeRules.map(
			(rule: { effects: { props: unknown[] } }) => rule.effects.props,
		),
	).toEqual([
		[{ name: "SizeY", value: "new UDim(0, 128)" }],
		[{ name: "SizeX", value: "new UDim(0, 256)" }],
	]);
});

test("splits both axes of a variant size utility", () => {
	const result = transform('<frame className="md:size-8" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);

	const style = JSON.parse(result.ir[0]);
	expect(style.runtimeRules[0].effects.props).toEqual([
		{ name: "SizeX", value: "new UDim(0, 32)" },
		{ name: "SizeY", value: "new UDim(0, 32)" },
	]);
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

test("lowers fit size modes to AutomaticSize instead of misleading sizing", () => {
	const result = transform('<frame className="w-fit h-fit" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/AutomaticSize=\{Enum\.AutomaticSize\.XY\}/);
	expect(result.code).not.toMatch(/ Size=/);
});

test("lowers square fit size mode to AutomaticSize instead of misleading sizing", () => {
	const result = transform('<frame className="size-fit" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/AutomaticSize=\{Enum\.AutomaticSize\.XY\}/);
	expect(result.code).not.toMatch(/ Size=/);
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

test("removes className even when only diagnosed utilities remain", () => {
	const result = transform('<frame className="bg-card rounded-card" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "bg-card",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unknown-theme-key",
				token: "rounded-card",
			}),
		]),
	);
});

test("keeps static-only className fully compile-time without runtime helper injection", () => {
	const result = transform(
		'<frame className="rounded-md bg-slate-700 px-4 py-3" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
	expect(result.code).not.toContain("__vela__");
});

test("rewrites dynamic array className through the inline runtime helper", () => {
	const result = transform(
		'<frame className={["bg-blue-600", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("VelaRuntimeHost");
	expect(result.code).toContain('className={active && "rounded-md"}');
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
	expect(result.code).not.toContain("../__vela__/runtime-host");
});

test("rewrites dynamic object-map className through the inline runtime helper", () => {
	const result = transform(
		'<frame className={{ "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("VelaRuntimeHost");
	expect(result.code).toContain('"px-4": roomy');
	expect(result.code).toContain('"px-2": !roomy');
});

test("rewrites dynamic border className through the inline runtime helper", () => {
	const result = transform(
		'<frame className={["border", active && "border-blue-600"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("VelaRuntimeHost");
	expect(result.code).toContain("uistroke");
	expect(result.code).toContain("Thickness");
	expect(result.code).toContain("Color3.fromRGB(21, 93, 252)");
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
});

test("rewrites dynamic border object maps through the inline runtime helper", () => {
	const result = transform(
		'<frame className={{ "border-2": thick, "border-transparent": hidden }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("VelaRuntimeHost");
	expect(result.code).toContain("uistroke");
	expect(result.code).toContain("Thickness");
	expect(result.code).toContain("Transparency");
	expect(result.code).toContain("className={{");
	expect(result.code).toContain('"border-2": thick');
	expect(result.code).toContain('"border-transparent": hidden');
});

test("rewrites runtime-aware variants through the inline runtime rule path", () => {
	const result = transform(
		'<frame className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaRules");
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).not.toContain(
		'className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600"',
	);
	expect(result.code).toContain("uistroke");
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
	expect(result.code).toContain("const VelaRuntimeHost =");
	expect(result.code).toContain("<VelaRuntimeHost");
	expect(result.code).toContain("__velaTag");
	expect(result.code).toContain("__velaRules");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(result.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("__rbxtsTailwindRules");
	expect(result.code).not.toContain("__rbxtsTailwindTag");
	expect(result.code).not.toContain("__rbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("rbxts-tailwind");
	expect(result.code).not.toContain("rbxtsTailwind");
	expect(result.code).not.toContain("createTailwindRuntimeHost");
	expect(result.code).not.toContain("TailwindRuntimeHost");
	expect(result.code).not.toContain("@vela-rbxts/types");
	expect(result.code).not.toContain("@vela-rbxts/config");
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
	expect(result.code).not.toContain("VelaRuntimeHost");
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
	expect(result.code).not.toContain("VelaRuntimeHost");
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
	expect(result.code).not.toContain("VelaRuntimeHost");
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
	expect(result.code).not.toContain("VelaRuntimeHost");
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
	expect(result.code).toContain("VelaRuntimeHost");
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
	expect(result.code).toContain("VelaRuntimeHost");
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
	expect(enabledResult.code).toContain("VelaRuntimeHost");
	expect(enabledResult.code).toContain("__velaRules");
	expect(enabledResult.code).not.toContain("className=");
	expect(enabledResult.code).toContain("uicorner");

	const disabledResult = transform(
		'const enabled = false; <frame className={["rounded-md", enabled && "md:px-4"]} />',
	);

	expect(disabledResult.changed).toBe(true);
	expect(disabledResult.diagnostics).toEqual([]);
	expect(disabledResult.code).not.toContain("__createVelaRuntimeHost");
	expect(disabledResult.code).not.toContain("VelaRuntimeHost");
	expect(disabledResult.code).not.toContain("__velaRules");
	expect(disabledResult.code).not.toContain("className=");
	expect(disabledResult.code).toContain("uicorner");
});

test("lifts variant-prefixed literal utilities into runtime rules", () => {
	const result = transform(
		'<frame className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain('import __VelaReact from "@rbxts/react";');
	expect(result.code).toContain("const VelaRuntimeHost =");
	expect(result.code).toContain("<VelaRuntimeHost");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).not.toContain("@vela-rbxts/runtime");
	expect(result.code).not.toContain("vela-rbxts/runtime");
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(result.code).toContain("__velaRules");
	expect(result.code).not.toContain(
		'className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600"',
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
								tag: "uistroke",
							}),
						]),
					}),
				}),
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "input",
						value: "touch",
					}),
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uistroke",
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
								name: "SizeX",
								value: "new UDim(0, 320)",
							}),
						]),
					}),
				}),
			]),
			runtimeClassValue: false,
		}),
	);
});

test("lowers rotate utilities to the Roblox Rotation prop", () => {
	const result = transform('<frame className="rotate-45" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Rotation=\{45\}/);
});

test("lowers negative rotate utilities to a negative Rotation prop", () => {
	const result = transform('<frame className="-rotate-90" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/Rotation=\{-90\}/);
});

test("warns on unsupported rotate values", () => {
	const result = transform('<frame className="rotate-17" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/Rotation=/);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-rotation-value",
				token: "rotate-17",
			}),
		]),
	);
});

test("lowers opacity utilities to BackgroundTransparency", () => {
	const result = transform('<frame className="opacity-25" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.75\}/);
});

test("warns on out-of-range opacity values", () => {
	const result = transform(
		'<frame className="opacity-150" />',
		withoutPreflight,
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/BackgroundTransparency=/);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-opacity-value",
				token: "opacity-150",
			}),
		]),
	);
});

test("lowers aspect utilities to a UIAspectRatioConstraint helper", () => {
	const result = transform(
		'<frame><frame className="aspect-square" /><frame className="aspect-video" /><frame className="aspect-[4/3]" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<uiaspectratioconstraint\b[^>]*AspectRatio=\{1\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uiaspectratioconstraint\b[^>]*AspectRatio=\{1\.7777777778\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uiaspectratioconstraint\b[^>]*AspectRatio=\{1\.3333333333\}[^>]*\/>/i,
	);
});

test("warns on unsupported aspect values", () => {
	const result = transform('<frame className="aspect-auto" />');

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toMatch(/<uiaspectratioconstraint\b/i);
	expect(result.diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				level: "warning",
				code: "unsupported-aspect-value",
				token: "aspect-auto",
			}),
		]),
	);
});

test("lowers flex and alignment utilities onto a shared UIListLayout helper", () => {
	const result = transform(
		'<frame className="flex-row justify-center items-end gap-4" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Horizontal\}/,
	);
	expect(result.code).toMatch(
		/HorizontalAlignment=\{Enum\.HorizontalAlignment\.Center\}/,
	);
	expect(result.code).toMatch(
		/VerticalAlignment=\{Enum\.VerticalAlignment\.Bottom\}/,
	);
	expect(result.code).toMatch(/Padding=\{new UDim\(0, 16\)\}/);
	expect(result.code.match(/<uilistlayout\b/gi) ?? []).toHaveLength(1);
});

test("treats bare flex as a horizontal UIListLayout", () => {
	const result = transform('<frame className="flex" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<uilistlayout\b[^>]*FillDirection=\{Enum\.FillDirection\.Horizontal\}[^>]*\/>/i,
	);
});

test("sorts UIListLayout children by LayoutOrder so order-* applies", () => {
	const flex = transform(
		`export const A = () => (
			<frame className="flex">
				<textbutton className="order-2" />
				<textlabel className="order-1" />
			</frame>
		);`,
		null,
	);

	expect(flex.diagnostics).toEqual([]);
	expect(flex.code).toMatch(
		/<uilistlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);

	const gap = transform('<frame className="gap-4" />');

	expect(gap.code).toMatch(
		/<uilistlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);

	const space = transform('<frame className="space-y-2" />');

	expect(space.code).toMatch(
		/<uilistlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);
});

test("warns on unsupported flex directions while lowering flex distribution", () => {
	const result = transform(
		'<frame className="flex-row-reverse justify-between items-stretch" />',
	);

	expect(result.changed).toBe(true);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/HorizontalFlex=\{Enum\.UIFlexAlignment\.SpaceBetween\}/,
	);
	expect(result.code).toMatch(/VerticalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);
	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-flex-direction",
			token: "flex-row-reverse",
		}),
	]);
});

test("carries flex utilities through the runtime variant path with enum parsing", () => {
	const result = transform('<frame className="flex-row md:flex-col" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain('startsWith(value, "Enum.")');

	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				helpers: expect.arrayContaining([
					expect.objectContaining({
						tag: "uilistlayout",
						props: expect.arrayContaining([
							expect.objectContaining({
								name: "FillDirection",
								value: "Enum.FillDirection.Horizontal",
							}),
						]),
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
								tag: "uilistlayout",
								props: expect.arrayContaining([
									expect.objectContaining({
										name: "FillDirection",
										value: "Enum.FillDirection.Vertical",
									}),
								]),
							}),
						]),
					}),
				}),
			]),
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

test("lowers className on components into props and helper children", () => {
	const result = transform(
		`export const A = () => <Box className="bg-slate-700 rounded-md" />;`,
		null,
	);

	expect(result.code).toContain(
		"BackgroundColor3={Color3.fromRGB(49, 65, 88)}",
	);
	expect(result.code).toContain("<uicorner CornerRadius={new UDim(0, 6)}/>");
	expect(result.code).not.toContain("className");
	expect(result.diagnostics).toEqual([]);
});

test("lowers className on member expression components", () => {
	const result = transform(
		`export const A = () => <Switch.Root className="bg-slate-700" />;`,
		null,
	);

	expect(result.code).toContain(
		"<Switch.Root BackgroundColor3={Color3.fromRGB(49, 65, 88)}/>",
	);
});

test("prepends component helper children before existing children", () => {
	const result = transform(
		`export const A = () => <Box className="rounded-md"><textlabel Text="hi"/></Box>;`,
		null,
	);

	expect(result.code).toContain(
		`<uicorner CornerRadius={new UDim(0, 6)}/><textlabel Text="hi"/>`,
	);
});

test("routes runtime variants on components through the runtime host", () => {
	const result = transform(
		`export const A = () => <Box className="sm:bg-slate-700" />;`,
		null,
	);

	expect(result.code).toContain("<VelaRuntimeHost");
	expect(result.code).toContain("__velaTag={Box}");
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
});

test("the runtime host re-reads the viewport so breakpoints stay live", () => {
	const result = transform(
		`export const A = () => <frame className="md:px-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	// ViewportSize is 1x1 until the first frame renders, so a mount-time read
	// alone pins every breakpoint to a width no rule can match.
	expect(result.code).toContain(
		'camera.GetPropertyChangedSignal("ViewportSize").Connect(updateEnvironment)',
	);
});

test("routes dynamic className on components through the runtime host", () => {
	const result = transform(
		`export const A = ({ on }: { on: boolean }) => <Box className={on ? "bg-slate-700" : "bg-slate-900"} />;`,
		null,
	);

	expect(result.code).toContain("__velaTag={Box}");
	expect(result.code).toContain(
		`className={on ? "bg-slate-700" : "bg-slate-900"}`,
	);
});

test("forwards member expression components to the runtime host", () => {
	const result = transform(
		`export const A = () => <Switch.Root className="sm:bg-slate-700"><Switch.Thumb/></Switch.Root>;`,
		null,
	);

	expect(result.code).toContain("__velaTag={Switch.Root}");
	expect(result.code).toContain("</VelaRuntimeHost>");
});

test("renames the closing tag when swapping in the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="sm:bg-slate-700"><textlabel Text="x"/></frame>;`,
		null,
	);

	expect(result.code).toContain("</VelaRuntimeHost>");
	expect(result.code).not.toContain("</frame>");
});

test("resolves a bare palette name through its DEFAULT shade", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate" />;`,
		null,
	);

	expect(result.code).toContain("Color3.fromRGB(98, 116, 142)");
	expect(result.code).not.toContain("className");
	expect(result.diagnostics).toEqual([]);
});

test("still requires a shade when the palette has no DEFAULT", () => {
	const config = defineConfig({
		theme: {
			extend: { colors: { brand: { 700: "Color3.fromRGB(1, 2, 3)" } } },
		},
	});
	const result = transform(
		`export const A = () => <frame className="bg-brand" />;`,
		{ configJson: JSON.stringify(config) },
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "color-missing-shade" }),
	]);
});

test("warns about className on unsupported host elements", () => {
	const result = transform(
		`export const A = () => <screengui className="bg-slate-700" />;`,
		null,
	);

	expect(result.code).toContain(`className="bg-slate-700"`);
	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "classname-on-unsupported-host" }),
	]);
});

test("anchors diagnostics to the offending className token", () => {
	const source = [
		`// a comment that mentions tracking-wide first`,
		`const unrelated = "tracking-wide in a string";`,
		`export const A = () => <frame className="bg-slate-700 tracking-wide" />;`,
	].join("\n");
	const result = transform(source, null);
	const [diagnostic] = result.diagnostics;

	expect(diagnostic.code).toBe("no-roblox-equivalent");
	expect(diagnostic.range).toBeDefined();
	const { start, end } = diagnostic.range as { start: number; end: number };
	expect(source.slice(start, end)).toBe("tracking-wide");
	expect(start).toBeGreaterThan(source.indexOf("className"));
});

test("lowers right/bottom utilities relative to the far edges", () => {
	const result = transform(
		`export const A = () => <frame className="right-4 bottom-2" />;`,
		null,
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/Position=\{new UDim2\(1, -16, 1, -8\)\}/);
});

test("lowers negative and fractional right utilities", () => {
	const negative = transform(
		`export const A = () => <frame className="-right-4" />;`,
		null,
	);
	expect(negative.diagnostics).toEqual([]);
	expect(negative.code).toMatch(/Position=\{new UDim2\(1, 16, 0, 0\)\}/);

	const fractional = transform(
		`export const B = () => <frame className="bottom-1/2" />;`,
		null,
	);
	expect(fractional.diagnostics).toEqual([]);
	expect(fractional.code).toMatch(/Position=\{UDim2\.fromScale\(0, 0\.5\)\}/);
});

test("lowers order utilities into LayoutOrder", () => {
	const result = transform(
		`export const A = () => (
			<frame>
				<frame className="order-2" />
				<frame className="order-first" />
				<frame className="-order-3" />
				<frame className="order-none" />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/LayoutOrder=\{2\}/);
	expect(result.code).toMatch(/LayoutOrder=\{-9999\}/);
	expect(result.code).toMatch(/LayoutOrder=\{-3\}/);
	expect(result.code).toMatch(/LayoutOrder=\{0\}/);
});

test("rejects non-integer order values with a diagnostic", () => {
	const result = transform(
		`export const A = () => <frame className="order-firstish" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-layout-order-value" }),
	]);
});

test("lowers content utilities into UIListLayout cross-axis packing", () => {
	const flex = transform(
		`export const A = () => <frame className="content-between" />;`,
		null,
	);
	expect(flex.diagnostics).toEqual([]);
	expect(flex.code).toMatch(
		/VerticalFlex=\{Enum\.UIFlexAlignment\.SpaceBetween\}/,
	);

	const stretch = transform(
		`export const B = () => <frame className="content-stretch" />;`,
		null,
	);
	expect(stretch.code).toMatch(/VerticalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);

	const aligned = transform(
		`export const C = () => <frame className="content-center" />;`,
		null,
	);
	expect(aligned.code).toMatch(
		/VerticalAlignment=\{Enum\.VerticalAlignment\.Center\}/,
	);
});

test("lowers self utilities into UIFlexItem.ItemLineAlignment", () => {
	const result = transform(
		`export const A = () => <frame className="self-center" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/<uiflexitem\b[^>]*ItemLineAlignment=\{Enum\.ItemLineAlignment\.Center\}[^>]*\/>/i,
	);

	const invalid = transform(
		`export const B = () => <frame className="self-baseline" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-alignment-value" }),
	]);
});

test("lowers leading utilities into LineHeight on text hosts", () => {
	const result = transform(
		`export const A = () => <textlabel className="leading-tight" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/LineHeight=\{1\.25\}/);

	const invalid = transform(
		`export const B = () => <textlabel className="leading-7" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-line-height-value" }),
	]);
});

test("merges italic with font weight into a single FontFace", () => {
	const merged = transform(
		`export const A = () => <textlabel className="italic font-bold" />;`,
		null,
	);
	expect(merged.diagnostics).toEqual([]);
	expect(merged.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Bold, Enum\.FontStyle\.Italic\)\}/,
	);

	const italicOnly = transform(
		`export const B = () => <textlabel className="italic" />;`,
		null,
	);
	expect(italicOnly.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Regular, Enum\.FontStyle\.Italic\)\}/,
	);

	const weightOnly = transform(
		`export const C = () => <textlabel className="font-bold" />;`,
		null,
	);
	expect(weightOnly.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Bold\)\}/,
	);
});

test("reports unlowered grid subtokens as known Tailwind without an equivalent", () => {
	const result = transform(
		`export const A = () => <frame className="grid-flow-row" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "no-roblox-equivalent" }),
	]);
});

test("lowers grid utilities into UIGridLayout", () => {
	const result = transform(
		`export const A = () => <frame className="grid grid-cols-3 gap-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/<uigridlayout\b[^>]*SortOrder=\{Enum\.SortOrder\.LayoutOrder\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Horizontal\}/,
	);
	expect(result.code).toMatch(/FillDirectionMaxCells=\{3\}/);
	expect(result.code).toMatch(/CellPadding=\{UDim2\.fromOffset\(8, 8\)\}/);

	const rows = transform(
		`export const B = () => <frame className="grid-rows-2" />;`,
		null,
	);
	expect(rows.code).toMatch(/FillDirection=\{Enum\.FillDirection\.Vertical\}/);
	expect(rows.code).toMatch(/FillDirectionMaxCells=\{2\}/);
});

test("keeps gap on UIListLayout when no grid is present", () => {
	const result = transform(
		`export const A = () => <frame className="flex gap-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("uigridlayout");
	expect(result.code).not.toContain("CellPadding");
});

test("rejects out-of-range grid cell counts", () => {
	const result = transform(
		`export const A = () => <frame className="grid-cols-0 grid-rows-13" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-grid-value" }),
		expect.objectContaining({ code: "unsupported-grid-value" }),
	]);
});

test("lowers basis utilities like the width axis", () => {
	const fractional = transform(
		`export const A = () => <frame className="basis-1/2" />;`,
		null,
	);
	expect(fractional.diagnostics).toEqual([]);
	expect(fractional.code).toMatch(/Size=\{UDim2\.fromScale\(0\.5, 0\)\}/);

	const auto = transform(
		`export const B = () => <frame className="basis-auto" />;`,
		null,
	);
	expect(auto.code).toMatch(/AutomaticSize=\{Enum\.AutomaticSize\.X\}/);
});

test("lowers pixel translates into Position offsets", () => {
	const result = transform(
		`export const A = () => <frame className="translate-x-4 -translate-y-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/Position=\{UDim2\.fromOffset\(16, -8\)\}/);

	const combined = transform(
		`export const B = () => <frame className="left-1/2 translate-x-4" />;`,
		null,
	);
	expect(combined.code).toMatch(/Position=\{new UDim2\(0\.5, 16, 0, 0\)\}/);
});

test("lowers fractional translates into AnchorPoint", () => {
	const centered = transform(
		`export const A = () => <frame className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />;`,
		null,
	);

	expect(centered.diagnostics).toEqual([]);
	expect(centered.code).toMatch(/AnchorPoint=\{new Vector2\(0\.5, 0\.5\)\}/);
	expect(centered.code).toMatch(/Position=\{UDim2\.fromScale\(0\.5, 0\.5\)\}/);

	const positive = transform(
		`export const B = () => <frame className="translate-x-full" />;`,
		null,
	);
	expect(positive.code).toMatch(/AnchorPoint=\{new Vector2\(-1, 0\)\}/);
});

test("parses top utilities as position instead of a gradient stop", () => {
	const result = transform(
		`export const A = () => <frame className="top-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/Position=\{UDim2\.fromOffset\(0, 16\)\}/);
});

test("lowers object fit utilities into ScaleType on image hosts", () => {
	const result = transform(
		`export const A = () => <imagelabel className="object-cover" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/ScaleType=\{Enum\.ScaleType\.Crop\}/);

	const tile = transform(
		`export const B = () => <imagebutton className="object-tile" />;`,
		null,
	);
	expect(tile.code).toMatch(/ScaleType=\{Enum\.ScaleType\.Tile\}/);

	const invalid = transform(
		`export const C = () => <imagelabel className="object-left" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-object-fit-value" }),
	]);
});

test("lowers pointer events into Interactable", () => {
	const result = transform(
		`export const A = () => <frame className="pointer-events-none" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/Interactable=\{false\}/);

	const auto = transform(
		`export const B = () => <frame className="pointer-events-auto" />;`,
		null,
	);
	expect(auto.code).toMatch(/Interactable=\{true\}/);
});

test("lowers space utilities into UIListLayout padding with a direction", () => {
	const horizontal = transform(
		`export const A = () => <frame className="space-x-4" />;`,
		null,
	);
	expect(horizontal.diagnostics).toEqual([]);
	expect(horizontal.code).toMatch(/Padding=\{new UDim\(0, 16\)\}/);
	expect(horizontal.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Horizontal\}/,
	);

	const vertical = transform(
		`export const B = () => <frame className="space-y-2" />;`,
		null,
	);
	expect(vertical.code).toMatch(/Padding=\{new UDim\(0, 8\)\}/);
	expect(vertical.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Vertical\}/,
	);

	const reverse = transform(
		`export const C = () => <frame className="space-x-reverse" />;`,
		null,
	);
	expect(reverse.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-space-value" }),
	]);
});

test("lowers whitespace utilities into TextWrapped", () => {
	const result = transform(
		`export const A = () => <textlabel className="whitespace-nowrap" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/TextWrapped=\{false\}/);

	const invalid = transform(
		`export const B = () => <textlabel className="whitespace-pre" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-whitespace-value" }),
	]);
});

test("lowers overscroll utilities into ElasticBehavior on scrolling frames", () => {
	const result = transform(
		`export const A = () => <scrollingframe className="overscroll-none" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/ElasticBehavior=\{Enum\.ElasticBehavior\.Never\}/,
	);

	const contain = transform(
		`export const B = () => <scrollingframe className="overscroll-contain" />;`,
		null,
	);
	expect(contain.code).toMatch(
		/ElasticBehavior=\{Enum\.ElasticBehavior\.WhenScrollable\}/,
	);
});

test("lowers ring and outline utilities into the shared UIStroke", () => {
	const ring = transform(
		`export const A = () => <frame className="ring ring-rose-500" />;`,
		null,
	);
	expect(ring.diagnostics).toEqual([]);
	expect(ring.code).toMatch(/Thickness=\{3\}/);
	expect(ring.code).toMatch(
		/ApplyStrokeMode=\{Enum\.ApplyStrokeMode\.Border\}/,
	);
	expect(ring.code).toMatch(/<uistroke\b[^>]*Color=\{Color3\.fromRGB\(/i);

	const outline = transform(
		`export const B = () => <frame className="outline-4" />;`,
		null,
	);
	expect(outline.code).toMatch(/Thickness=\{4\}/);

	const none = transform(
		`export const C = () => <frame className="outline-none" />;`,
		null,
	);
	expect(none.code).toMatch(/Thickness=\{0\}/);

	const invalid = transform(
		`export const D = () => <frame className="ring-offset-2 outline-dashed" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-stroke-value" }),
		expect.objectContaining({ code: "unsupported-stroke-value" }),
	]);
});

test("centers elements with mx-auto and my-auto", () => {
	const both = transform(
		`export const A = () => <frame className="mx-auto my-auto" />;`,
		null,
	);
	expect(both.diagnostics).toEqual([]);
	expect(both.code).toMatch(/AnchorPoint=\{new Vector2\(0\.5, 0\.5\)\}/);
	expect(both.code).toMatch(/Position=\{UDim2\.fromScale\(0\.5, 0\.5\)\}/);

	const horizontal = transform(
		`export const B = () => <frame className="mx-auto" />;`,
		null,
	);
	expect(horizontal.code).toMatch(/AnchorPoint=\{new Vector2\(0\.5, 0\)\}/);
	expect(horizontal.code).toMatch(/Position=\{UDim2\.fromScale\(0\.5, 0\)\}/);

	const logical = transform(
		`export const C = () => <frame className="ms-4" />;`,
		null,
	);
	expect(logical.diagnostics).toEqual([
		expect.objectContaining({ code: "no-roblox-equivalent" }),
	]);
});

test("attaches a transition config to the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 md:bg-blue-600 transition duration-300 ease-out" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaTransition={");
	expect(result.code).toMatch(/"time": 0\.3/);
	expect(result.code).toMatch(/"style": "Quad"/);
	expect(result.code).toMatch(/"direction": "Out"/);
});

test("duration alone enables the transition and defaults the easing", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 duration-500" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__velaTransition={");
	expect(result.code).toMatch(/"time": 0\.5/);
	expect(result.code).toMatch(/"direction": "Out"/);
});

test("transition-none disables the transition", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 transition duration-300 transition-none" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__velaTransition={");
});

test("warns when transition utilities cannot ever fire", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 transition" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "transition-without-runtime" }),
	]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaTransition={");
});

test("keeps transitions on dynamic class values in the runtime host", () => {
	const result = transform(
		`export const A = (props: { active: boolean }) => (
			<frame className={["transition duration-300", props.active && "bg-blue-600"]} />
		);`,
		null,
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__createVelaRuntimeHost");
	expect(result.code).toContain("TweenService");
});

test("rejects invalid transition values with diagnostics", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 duration-fast ease-bounce transition-weird" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "duration-fast",
		}),
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "ease-bounce",
		}),
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "transition-weird",
		}),
	]);
});

test("promotes animate presets to the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="bg-blue-600 animate-spin" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/__velaAnimation=\{"spin"\}/);
	expect(result.code).toContain("startPresetAnimation");
});

test("animate-none cancels an earlier preset", () => {
	const result = transform(
		`export const A = () => <frame className="animate-pulse animate-none" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaAnimation=");
});

test("rejects unsupported animate presets", () => {
	const result = transform(
		`export const A = () => <frame className="animate-ping" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-animation-value",
			token: "animate-ping",
		}),
	]);
});

test("renders the runtime host through forwardRef for slotting compatibility", () => {
	const result = transform(
		`export const A = () => <frame className="bg-blue-600 animate-spin" />;`,
		null,
	);

	expect(result.code).toContain("forwardRef((props: VelaRuntimeHostProps");
	expect(result.code).toContain("assignForwardedRef");
});

test("warns and strips motion utilities on component elements", () => {
	const animated = transform(
		`export const A = () => <Box className="animate-spin" />;`,
		null,
	);
	expect(animated.diagnostics).toEqual([
		expect.objectContaining({ code: "motion-on-component" }),
	]);
	expect(animated.code).not.toContain("__velaAnimation=");

	const transitioned = transform(
		`export const B = () => <Box className="md:bg-blue-600 transition" />;`,
		null,
	);
	expect(transitioned.diagnostics).toEqual([
		expect.objectContaining({ code: "motion-on-component" }),
	]);
	expect(transitioned.code).not.toContain("__velaTransition={");
	expect(transitioned.code).toContain("__velaRules");
});

test("transforms a literal Text at compile time without a runtime host", () => {
	const upper = transform(
		`export const A = () => <textlabel Text="hello world" className="uppercase" />;`,
		null,
	);
	expect(upper.diagnostics).toEqual([]);
	expect(upper.needsRuntimeHost).toBe(false);
	expect(upper.code).toContain('Text="HELLO WORLD"');

	const capitalized = transform(
		`export const B = () => <textlabel Text="hello brave world" className="capitalize" />;`,
		null,
	);
	expect(capitalized.code).toContain('Text="Hello Brave World"');
});

test("wraps a literal Text in escaped RichText markup for decorations", () => {
	const result = transform(
		`export const A = () => <textlabel Text="a < b & c" className="underline" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toContain('Text="<u>a &lt; b &amp; c</u>"');
	expect(result.code).toMatch(/RichText=\{true\}/);

	const strike = transform(
		`export const B = () => <textlabel Text="done" className="line-through uppercase" />;`,
		null,
	);
	expect(strike.code).toContain('Text="<s>DONE</s>"');
});

test("backs off decorations on consumer-managed RichText", () => {
	const result = transform(
		`export const A = () => <textlabel RichText Text="<b>hi</b>" className="underline uppercase" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "decoration-on-richtext" }),
	]);
	expect(result.code).not.toContain("<u>");
	// The transform still applies, but the markup stays unescaped and unwrapped.
	expect(result.code).toContain('Text="<B>HI</B>"');
});

test("defers dynamic Text to the runtime pipeline", () => {
	const result = transform(
		`export const A = (props: { label: string }) => (
			<textlabel Text={props.label} className="uppercase underline" />
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaText={");
	expect(result.code).toMatch(/"transform": "upper"/);
	expect(result.code).toMatch(/"decoration": "underline"/);
	expect(result.code).toContain("applyTextConfig");
});

test("normal-case and no-underline cancel earlier text utilities", () => {
	const result = transform(
		`export const A = () => <textlabel Text="hi" className="uppercase underline normal-case no-underline" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toContain('Text="hi"');
	expect(result.code).not.toContain("__velaText");
});

test("promotes margined elements to the runtime host with a margin spec", () => {
	const result = transform(
		`export const A = () => <frame className="m-4 w-40 h-20 bg-slate-700" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaMargin={");
	expect(result.code).toMatch(/"top": 16\.0/);
	expect(result.code).toMatch(/"left": 16\.0/);
	expect(result.code).toContain("prepareMarginWrapper");
	expect(result.code).toContain("renderMarginWrapper");
});

test("merges per-side margins with last-wins semantics", () => {
	const result = transform(
		`export const A = () => <frame className="mx-2 mt-4 mx-6" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"top": 16\.0/);
	expect(result.code).toMatch(/"left": 24\.0/);
	expect(result.code).toMatch(/"right": 24\.0/);
	expect(result.code).toMatch(/"bottom": 0\.0/);
});

test("negative top and left margins shift Position instead of wrapping", () => {
	const result = transform(
		`export const A = () => <frame className="-mt-2 -ml-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toMatch(/Position=\{UDim2\.fromOffset\(-16, -8\)\}/);
	expect(result.code).not.toContain("__velaMargin");
});

test("rejects inexpressible negative margins and margin auto", () => {
	const negative = transform(
		`export const A = () => <frame className="-mb-2 -m-4" />;`,
		null,
	);
	expect(negative.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-negative-margin",
			token: "-mb-2",
		}),
		expect.objectContaining({
			code: "unsupported-negative-margin",
			token: "-m-4",
		}),
	]);

	const auto = transform(
		`export const B = () => <frame className="m-auto" />;`,
		null,
	);
	expect(auto.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-margin-value" }),
	]);
});

test("keeps margins working on component elements", () => {
	const result = transform(
		`export const A = () => <Box className="m-4" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaMargin={");
	expect(result.code).toContain("__velaTag={Box}");
});

test("promotes divided containers to the runtime host with a divide spec", () => {
	const result = transform(
		`export const A = () => (
			<frame className="flex-col divide-y-2 divide-slate-500">
				<frame />
				<frame />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaDivide={");
	expect(result.code).toMatch(/"axis": "y"/);
	expect(result.code).toMatch(/"thickness": 2\.0/);
	expect(result.code).toMatch(/"color": "Color3\.fromRGB\(/);
	expect(result.code).toContain("interleaveDivideSeparators");
});

test("divide separators step over helper elements lowered as children", () => {
	const result = transform(
		`export const A = () => (
			<frame className="flex-col divide-y-2 divide-slate-500">
				<frame />
				<frame />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// flex-col lowers a uilistlayout into the same children list, so counting
	// raw positions puts a separator above the first real child.
	expect(result.code).toContain("<uilistlayout");
	expect(result.code).toMatch(/if \(isModifierChild\(child\)\) \{/);
	expect(result.code).toMatch(/if \(seenContentChild\) \{/);
	expect(result.code).toMatch(
		/function isModifierChild[\s\S]*?startsWith\(elementType\.lower\(\), "ui"\)/,
	);
});

test("bare divide-x defaults to a one pixel separator", () => {
	const result = transform(
		`export const A = () => <frame className="divide-x" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"axis": "x"/);
	expect(result.code).toMatch(/"thickness": 1\.0/);
	expect(result.code).not.toMatch(/"color":/);
});

test("divide color without an axis paints nothing", () => {
	const result = transform(
		`export const A = () => <frame className="divide-rose-500" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaDivide");
});

test("rejects unsupported divide thickness values", () => {
	const result = transform(
		`export const A = () => <frame className="divide-x-3" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-divide-value",
			token: "divide-x-3",
		}),
	]);
});

test("lowers hover variants into runtime rules", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 hover:bg-blue-600 transition" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/"kind": "hover"/);
	expect(result.code).toContain("attachHoverTracking");
	expect(result.code).toContain("MouseEnter");
});

test("resolves arbitrary hex colors", () => {
	const result = transform(
		`export const A = () => <frame className="bg-[#ff0000] border-[#0f0]" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(255, 0, 0\)\}/,
	);
	expect(result.code).toMatch(/Color=\{Color3\.fromRGB\(0, 255, 0\)\}/);

	const invalid = transform(
		`export const B = () => <frame className="bg-[oops]" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-arbitrary-value" }),
	]);
});

test("applies color opacity modifiers as transparency", () => {
	const result = transform(
		`export const A = () => <frame className="bg-blue-600/50 ring-rose-500/25" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.5\}/);
	expect(result.code).toMatch(/Transparency=\{0\.75\}/);

	const unsupported = transform(
		`export const B = () => <frame className="from-blue-600/50" />;`,
		null,
	);
	expect(unsupported.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-opacity-modifier" }),
	]);

	const notAModifier = transform(
		`export const C = () => <frame className="bg-blue-600/300" />;`,
		null,
	);
	expect(notAModifier.diagnostics).toEqual([
		expect.objectContaining({ code: "unknown-theme-key" }),
	]);
});

test("preflight neutralizes the Roblox host defaults by default", () => {
	const result = transform(
		`export const A = () => <frame className="w-full" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{1\}/);
	expect(result.code).toMatch(/BorderSizePixel=\{0\}/);

	const painted = transform(
		`export const B = () => <frame className="bg-slate-700" />;`,
		null,
	);

	expect(painted.code).not.toMatch(/BackgroundTransparency/);

	const off = transform(
		`export const C = () => <frame className="w-full" />;`,
		{
			configJson: JSON.stringify(defineConfig({ preflight: false })),
		},
	);

	expect(off.code).not.toMatch(/BackgroundTransparency|BorderSizePixel/);
});

test("preflight lets a runtime-resolved background reopen the neutralized base", () => {
	const result = transform(
		`export const A = ({ on }: { on: boolean }) => <frame className={on ? "bg-slate-700" : "w-full"} />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("withPreflightBackground");
	expect(result.code).toMatch(/"preflight":\s*true/);
});
