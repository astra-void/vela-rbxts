import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { runtimeSource } from "./helpers";

test("lowers border utilities to UIStroke helpers", () => {
	const result = transform(
		'<frame><frame className="border border-slate-700" /><frame className="border-2 border-blue-600" /><frame className="border-4 border-transparent" /><frame className="rounded-md border border-rose-500 px-4" /></frame>',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{__VelaRem\.scale\(1, \d+\)\}[^>]*Color=\{Color3\.fromRGB\(49, 65, 88\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{__VelaRem\.scale\(2, \d+\)\}[^>]*Color=\{Color3\.fromRGB\(21, 93, 252\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uistroke\b[^>]*Thickness=\{__VelaRem\.scale\(4, \d+\)\}[^>]*Transparency=\{1\}[^>]*\/>/i,
	);
	expect(runtimeSource).toContain("uicorner");
	expect(runtimeSource).toContain("uistroke");
});

test("reports unsupported border forms with a targeted diagnostic", () => {
	const result = transform(
		'<frame className="border-dashed border-x border-8 border-[3em] border-opacity-50" />',
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
				token: "border-[3em]",
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
		"[3em]",
		"500/50",
		"8",
	] as const;

	for (const key of THICKNESS_KEYS) {
		const result = transform(`<frame className="border-${key}" />`);
		const thickness = key === "0" ? key : `__VelaRem\\.scale\\(${key}, \\d+\\)`;
		expect(result.diagnostics).toEqual([]);
		expect(result.code).toMatch(
			new RegExp(`<uistroke\\b[^>]*Thickness=\\{${thickness}\\}`, "i"),
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
	expect(runtimeSource).toContain(
		`key === "${THICKNESS_KEYS.join('" || key === "')}"`,
	);
	for (const keyword of ["dashed", "solid", "dotted", "double"]) {
		expect(runtimeSource).toContain(`key === "${keyword}"`);
	}
	expect(runtimeSource).toContain('startsWith(key, "opacity-")');
});

test("lowers ring and outline utilities into the shared UIStroke", () => {
	const ring = transform(
		`export const A = () => <frame className="ring ring-rose-500" />;`,
		null,
	);
	expect(ring.diagnostics).toEqual([]);
	expect(ring.code).toMatch(/Thickness=\{__VelaRem\.scale\(3, \d+\)\}/);
	expect(ring.code).toMatch(
		/ApplyStrokeMode=\{Enum\.ApplyStrokeMode\.Border\}/,
	);
	expect(ring.code).toMatch(/<uistroke\b[^>]*Color=\{Color3\.fromRGB\(/i);

	const outline = transform(
		`export const B = () => <frame className="outline-4" />;`,
		null,
	);
	expect(outline.code).toMatch(/Thickness=\{__VelaRem\.scale\(4, \d+\)\}/);

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
	expect(runtimeSource).toContain("interleaveDivideSeparators");
});

test("divide separators step over helper elements lowered as children", () => {
	const result = transform(
		`export const A = () => (
			<frame className="flex-col divide-y-2 divide-slate-500 rounded-md">
				<frame />
				<frame />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// rounded-md lowers a uicorner into the same children list, so counting
	// raw positions puts a separator above the first real child.
	expect(result.code).toContain("<uicorner");
	expect(runtimeSource).toMatch(/if \(isModifierChild\(child\)\) \{/);
	expect(runtimeSource).toMatch(
		/function isModifierChild[\s\S]*?!LAYOUT_TAGS\.has\(elementType\.lower\(\)\)/,
	);
});

test("bare divide-x defaults to a one pixel separator", () => {
	const result = transform(
		`export const A = () => <frame className="flex divide-x" />;`,
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
