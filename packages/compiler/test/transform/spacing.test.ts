import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { runtimeSource } from "./helpers";

test("resolves valid numeric spacing fallback tokens", () => {
	const result = transform('<frame className="px-2 pt-1.5 pl-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
});

test("resolves padding shorthand numeric spacing fallback tokens", () => {
	const result = transform('<frame className="p-2" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
});

test("resolves fractional padding shorthand numeric spacing fallback tokens", () => {
	const result = transform('<frame className="p-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
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
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
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
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
});

test("keeps spacing-backed padding and size utilities on the same resolver path", () => {
	const result = transform(
		'<frame className="p-2 px-2 pt-1.5 w-2 h-2 size-2" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingTop=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingBottom=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(8, 8\), \d+\)\}/,
	);
});

test("lowers gap spacing utilities to a UIListLayout helper", () => {
	const result = transform('<frame className="gap-4" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<frame\b[^>]*><uilistlayout\b[^>]*Padding=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}[^>]*\/><\/frame>/i,
	);
});

test("resolves fractional gap numeric spacing fallback tokens", () => {
	const result = transform('<frame className="gap-0.5" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/<uilistlayout\b[^>]*\/>/i);
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 2\), \d+\)\}/,
	);
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
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 99\), \d+\)\}/,
	);
});

test("lowers space utilities into UIListLayout padding with a direction", () => {
	const horizontal = transform(
		`export const A = () => <frame className="space-x-4" />;`,
		null,
	);
	expect(horizontal.diagnostics).toEqual([]);
	expect(horizontal.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(horizontal.code).toMatch(
		/FillDirection=\{Enum\.FillDirection\.Horizontal\}/,
	);

	const vertical = transform(
		`export const B = () => <frame className="space-y-2" />;`,
		null,
	);
	expect(vertical.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
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
	expect(runtimeSource).toContain("prepareMarginWrapper");
	expect(runtimeSource).toContain("renderMarginWrapper");
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
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(UDim2\.fromOffset\(-16, -8\), \d+\)\}/,
	);
	expect(result.code).not.toContain("__velaMargin");
});

test("a side takes the last margin written to it, whichever way it points", () => {
	// Two classes on one side used to land on separate accumulators and both
	// apply, which made the order they were written in stop mattering.
	const repeated = transform(
		`export const A = () => <frame className="-ml-2 -ml-2" />;`,
		null,
	);
	expect(repeated.code).toMatch(/UDim2\.fromOffset\(-8, 0\)/);

	const negativeLast = transform(
		`export const A = () => <frame className="ml-4 -ml-2" />;`,
		null,
	);
	expect(negativeLast.code).toMatch(/UDim2\.fromOffset\(-8, 0\)/);
	expect(negativeLast.code).not.toContain("__velaMargin");

	const positiveLast = transform(
		`export const A = () => <frame className="-ml-2 ml-4" />;`,
		null,
	);
	expect(positiveLast.code).toMatch(/"left": 16\.0/);
	expect(positiveLast.code).not.toContain("fromOffset");
});

test("a negative zero margin closes the side rather than vanishing", () => {
	const result = transform(
		`export const A = () => <frame className="ml-4 -ml-0" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__velaMargin");
	expect(result.code).not.toContain("-0.0");
});

test("an all-zero margin stays on the static path", () => {
	for (const className of ["m-0", "mb-0", "-ml-0", "-mt-0", "mx-0 my-0"]) {
		const result = transform(
			`export const A = () => <frame className="${className}" />;`,
			null,
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.code).not.toContain("VelaRuntimeHost");
		expect(JSON.parse(result.ir[0]).margin).toBeUndefined();
	}
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
