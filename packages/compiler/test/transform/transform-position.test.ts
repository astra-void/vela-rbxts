import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { runtimeSource } from "./helpers";

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
	expect(result.code).toMatch(
		/CornerRadius=\{__VelaRem\.scale\(new UDim\(0, 6\), \d+\)\}/,
	);
	expect(result.code).toMatch(/ZIndex=\{20\}/);
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
});

test("carries z-index utilities through the runtime variant path", () => {
	const result = transform('<frame className="z-10 md:z-20" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("__velaRules");
	expect(runtimeSource).toContain("const __velaStringLen = string.len;");
	expect(runtimeSource).toContain("const __velaStringSub = string.sub;");
	expect(runtimeSource).toContain("__velaStringLen(value)");
	expect(runtimeSource).toContain("__velaStringSub(value");
	expect(runtimeSource).toContain("value.size()");
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
	const result = transform('<frame className="z-auto -z-10 z-[1.5] z-999" />');

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
				token: "z-[1.5]",
			}),
			expect.objectContaining({
				level: "warning",
				code: "unsupported-z-index-value",
				token: "z-999",
			}),
		]),
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

test("lowers right/bottom utilities relative to the far edges", () => {
	const result = transform(
		`export const A = () => <frame className="right-4 bottom-2" />;`,
		null,
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(1, -16, 1, -8\), \d+\)\}/,
	);
});

test("lowers negative and fractional right utilities", () => {
	const negative = transform(
		`export const A = () => <frame className="-right-4" />;`,
		null,
	);
	expect(negative.diagnostics).toEqual([]);
	expect(negative.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(1, 16, 0, 0\), \d+\)\}/,
	);

	const fractional = transform(
		`export const B = () => <frame className="bottom-1/2" />;`,
		null,
	);
	expect(fractional.diagnostics).toEqual([]);
	expect(fractional.code).toMatch(/Position=\{UDim2\.fromScale\(0, 0\.5\)\}/);
});

test("lowers pixel translates into Position offsets", () => {
	const result = transform(
		`export const A = () => <frame className="translate-x-4 -translate-y-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(UDim2\.fromOffset\(16, -8\), \d+\)\}/,
	);

	const combined = transform(
		`export const B = () => <frame className="left-1/2 translate-x-4" />;`,
		null,
	);
	expect(combined.code).toMatch(
		/Position=\{__VelaRem\.scale\(new UDim2\(0\.5, 16, 0, 0\), \d+\)\}/,
	);
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
	expect(result.code).toMatch(
		/Position=\{__VelaRem\.scale\(UDim2\.fromOffset\(0, 16\), \d+\)\}/,
	);
});

test("keeps negative positions negative behind a variant prefix", () => {
	const left = transform(
		`export const A = () => <frame className="md:-left-4" />;`,
		null,
	);

	// One axis at a time, so the rule leaves the axis it never named alone.
	expect(left.diagnostics).toEqual([]);
	expect(ruleProps(left)).toEqual([
		{ name: "PositionX", value: "new UDim(0, -16)" },
	]);

	const top = transform(
		`export const B = () => <frame className="md:-top-4" />;`,
		null,
	);

	expect(top.diagnostics).toEqual([]);
	expect(ruleProps(top)).toEqual([
		{ name: "PositionY", value: "new UDim(0, -16)" },
	]);

	const inset = transform(
		`export const C = () => <frame className="md:-inset-4" />;`,
		null,
	);

	expect(inset.diagnostics).toEqual([]);
	expect(ruleProps(inset)).toEqual([
		{ name: "PositionX", value: "new UDim(0, -16)" },
		{ name: "PositionY", value: "new UDim(0, -16)" },
	]);
});

const ruleProps = (result: { ir: string[] }) =>
	JSON.parse(result.ir[0]).runtimeRules[0].effects.props;
