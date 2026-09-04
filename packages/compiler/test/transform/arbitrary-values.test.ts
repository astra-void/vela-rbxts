import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { withoutPreflight } from "./helpers";

test("resolves arbitrary length values", () => {
	const result = transform(
		`export const A = () => <frame className="w-[120px] h-[50%] p-[7px] rounded-[10px] top-[60%] left-[-8px] gap-[3px] border-[3px]" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(new UDim2\(0, 120, 0\.5, 0\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 7\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 10\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(0, -8, 0\.6, 0\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 3\), \d+\)\}/,
	);
	expect(result.code).toMatch(/Thickness=\{__VelaRem\.scale\(3, \d+\)\}/);

	const typography = transform(
		`export const B = () => <textlabel className="text-[13px] leading-[1.6] rotate-[17deg] z-[15]" />;`,
		withoutPreflight,
	);
	expect(typography.diagnostics).toEqual([]);
	expect(typography.code).toMatch(
		/TextSize=\{__VelaRem\.scaleText\(13, \d+\)\}/,
	);
	expect(typography.code).toMatch(/LineHeight=\{1\.6\}/);
	expect(typography.code).toMatch(/Rotation=\{17\}/);
	expect(typography.code).toMatch(/ZIndex=\{15\}/);

	// A unit the family cannot read is still reported instead of guessed at.
	const invalid = transform(
		`export const C = () => <frame className="w-[3em]" />;`,
		withoutPreflight,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-arbitrary-value" }),
	]);
});

test("resolves arbitrary rem values against the theme's rem base", () => {
	const result = transform(
		`export const A = () => <frame className="w-[2rem] p-[0.5rem] rounded-[0.25rem] left-[-1rem] border-[0.125rem]" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(32, 0\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 4\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(UDim2\.fromOffset\(-16, 0\), \d+\)\}/,
	);
	expect(result.code).toMatch(/Thickness=\{__VelaRem\.scale\(2, \d+\)\}/);

	const typography = transform(
		`export const B = () => <textlabel className="text-[1.5rem] ring-[0.25rem]" />;`,
		withoutPreflight,
	);
	expect(typography.diagnostics).toEqual([]);
	expect(typography.code).toMatch(
		/TextSize=\{__VelaRem\.scaleText\(24, \d+\)\}/,
	);
	expect(typography.code).toMatch(/Thickness=\{__VelaRem\.scale\(4, \d+\)\}/);

	// A base the config moved moves what a rem payload is worth with it.
	const rebased = transform(
		`export const C = () => <frame className="w-[2rem]" />;`,
		{
			configJson: JSON.stringify(
				defineConfig({ preflight: false, theme: { rem: { base: 20 } } }),
			),
		},
	);
	expect(rebased.diagnostics).toEqual([]);
	expect(rebased.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(40, 0\), \d+\)\}/,
	);
});

test("resolves directional arbitrary radius values", () => {
	const result = transform(
		`export const A = () => <frame className="rounded-l-[10%] rounded-tr-[0.625rem]" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toMatch(/\sCornerRadius=/);
	expect(result.code).toMatch(/TopLeftRadius=\{new UDim\(0\.1, 0\)\}/);
	expect(result.code).toMatch(/BottomLeftRadius=\{new UDim\(0\.1, 0\)\}/);
	expect(result.code).toMatch(
		/TopRightRadius=\{__VelaRem\.scale\(new UDim\(0, 10\), \d+\)\}/,
	);
	expect(result.code).toMatch(/BottomRightRadius=\{new UDim\(0, 0\)\}/);
});

test("supports percent, pixel, and rem values on every directional radius", () => {
	const directions = [
		["t", ["TopLeftRadius", "TopRightRadius"]],
		["r", ["TopRightRadius", "BottomRightRadius"]],
		["b", ["BottomLeftRadius", "BottomRightRadius"]],
		["l", ["TopLeftRadius", "BottomLeftRadius"]],
		["tl", ["TopLeftRadius"]],
		["tr", ["TopRightRadius"]],
		["bl", ["BottomLeftRadius"]],
		["br", ["BottomRightRadius"]],
	] as const;
	const values = [
		["10%", /new UDim\(0\.1, 0\)/],
		["7px", /__VelaRem\.scale\(new UDim\(0, 7\), \d+\)/],
		["0.625rem", /__VelaRem\.scale\(new UDim\(0, 10\), \d+\)/],
	] as const;

	for (const [direction, props] of directions) {
		for (const [value, emittedValue] of values) {
			const result = transform(
				`export const A = () => <frame className="rounded-${direction}-[${value}]" />;`,
				withoutPreflight,
			);

			expect(result.diagnostics).toEqual([]);
			expect(result.code).not.toMatch(/\sCornerRadius=/);
			for (const prop of props) {
				expect(result.code).toMatch(
					new RegExp(`${prop}=\\{${emittedValue.source}\\}`),
				);
			}
			for (const prop of [
				"TopLeftRadius",
				"TopRightRadius",
				"BottomLeftRadius",
				"BottomRightRadius",
			]) {
				expect(result.code).toMatch(new RegExp(`${prop}=`));
			}
		}
	}
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

	const border = transform(
		`export const B = () => <frame className="border-2 border-slate-500/25" />;`,
		null,
	);
	expect(border.diagnostics).toEqual([]);
	expect(border.code).toMatch(/Transparency=\{0\.75\}/);

	const gradient = transform(
		`export const C = () => <frame className="bg-gradient-to-r from-blue-600/50 to-rose-500" />;`,
		null,
	);
	expect(gradient.diagnostics).toEqual([]);
	expect(gradient.code).toContain("Transparency={new NumberSequence(0.5, 0)}");

	const divide = transform(
		`export const D = () => <frame className="divide-y divide-slate-500/10"><frame /><frame /></frame>;`,
		null,
	);
	expect(divide.diagnostics).toEqual([]);
	expect(divide.code).toMatch(/"transparency":\s*0\.9/);

	// A family with no transparency channel of its own still reports the modifier.
	const unsupported = transform(
		`export const E = () => <textbox className="placeholder-white/50" />;`,
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
