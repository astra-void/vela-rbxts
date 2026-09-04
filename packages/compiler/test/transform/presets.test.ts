import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig, definePreset, plugin } from "../../../config/src/index";

const gameUiPreset = () =>
	definePreset({
		theme: {
			extend: {
				colors: { brand: "Color3.fromRGB(255, 136, 0)" },
				screens: { tablet: 900 },
			},
		},
		plugins: [
			plugin(({ addUtilities, addVariant }) => {
				addUtilities({ card: "bg-slate-800 rounded-lg" });
				addVariant("open", { attribute: "State", equals: "open" });
			}),
		],
	});

test("a preset's theme, utilities and variants all reach the compiler", () => {
	const options = {
		configJson: JSON.stringify(
			defineConfig({ preflight: false, presets: [gameUiPreset()] }),
		),
	};

	const themed = transform('<frame className="bg-brand" />', options);
	expect(themed.diagnostics).toEqual([]);
	expect(themed.ir[0]).toContain("Color3.fromRGB(255, 136, 0)");

	const utility = transform('<frame className="card" />', options);
	expect(utility.diagnostics).toEqual([]);
	expect(utility.ir[0]).toContain("CornerRadius");

	const variant = transform('<frame className="open:bg-brand" />', options);
	expect(variant.diagnostics).toEqual([]);
	expect(variant.ir[0]).toContain(
		'{"kind":"attribute","name":"State","value":"open"}',
	);

	const screen = transform('<frame className="tablet:px-4" />', options);
	expect(screen.diagnostics).toEqual([]);
	expect(screen.ir[0]).toContain('"alias":"tablet","minWidth":900');
});

test("a local config outranks the preset it pulled in", () => {
	const options = {
		configJson: JSON.stringify(
			defineConfig({
				preflight: false,
				presets: [gameUiPreset()],
				theme: {
					extend: { colors: { brand: "Color3.fromRGB(1, 2, 3)" } },
				},
				plugins: [
					plugin(({ addUtilities }) => {
						addUtilities({ card: "bg-slate-900" });
					}),
				],
			}),
		),
	};

	const themed = transform('<frame className="bg-brand" />', options);
	expect(themed.ir[0]).toContain("Color3.fromRGB(1, 2, 3)");

	const utility = transform('<frame className="card" />', options);
	expect(utility.ir[0]).not.toContain("CornerRadius");
});

// A JSON config cannot import a package, but it can still inline a preset, and
// the compiler folds those the same way.
test("a JSON config folds inline presets in order", () => {
	const options = {
		configJson: JSON.stringify({
			preflight: false,
			presets: [
				{ theme: { extend: { colors: { brand: "Color3.fromRGB(1, 1, 1)" } } } },
				{ theme: { extend: { colors: { brand: "Color3.fromRGB(2, 2, 2)" } } } },
			],
			theme: { extend: { colors: { accent: "Color3.fromRGB(3, 3, 3)" } } },
		}),
	};

	expect(transform('<frame className="bg-brand" />', options).ir[0]).toContain(
		"Color3.fromRGB(2, 2, 2)",
	);
	expect(transform('<frame className="bg-accent" />', options).ir[0]).toContain(
		"Color3.fromRGB(3, 3, 3)",
	);
});

test("preset plugins run before the project's own", () => {
	const options = {
		configJson: JSON.stringify(
			defineConfig({
				preflight: false,
				presets: [
					definePreset({
						plugins: [
							plugin(({ addVariant }) => {
								addVariant("open", { attribute: "State", equals: "open" });
							}),
						],
					}),
				],
				plugins: [
					plugin(({ addVariant }) => {
						addVariant("open", { attribute: "Panel", equals: "open" });
					}),
				],
			}),
		),
	};

	expect(transform('<frame className="open:px-4" />', options).ir[0]).toContain(
		'{"kind":"attribute","name":"Panel","value":"open"}',
	);
});
