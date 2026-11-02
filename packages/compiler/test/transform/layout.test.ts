import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { emitted, runtimeSource } from "./helpers";

const withVide = {
	configJson: JSON.stringify(defineConfig({ framework: "vide" })),
};

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
	expect(result.code).toMatch(
		/Padding=\{__VelaRem\.scale\(new UDim\(0, 16\), \d+\)\}/,
	);
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

test("lowers justify-stretch onto the horizontal flex axis", () => {
	const result = transform(
		'<frame className="flex-col justify-stretch items-stretch" />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/HorizontalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);
	expect(result.code).toMatch(/VerticalFlex=\{Enum\.UIFlexAlignment\.Fill\}/);
});

test("carries flex utilities through the runtime variant path with enum parsing", () => {
	const result = transform('<frame className="flex-row md:flex-col" />');

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain('startsWith(value, "Enum.")');

	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			// A rule overwrites this layout, so the base one joins the
			// resolution rather than arriving as a second instance.
			base: expect.objectContaining({ helpers: [] }),
			runtimeRules: expect.arrayContaining([
				expect.objectContaining({
					condition: { kind: "all", conditions: [] },
					effects: expect.objectContaining({
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
				}),
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
	expect(result.code).toMatch(
		/CellPadding=\{__VelaRem\.scale\(UDim2\.fromOffset\(8, 8\), \d+\)\}/,
	);

	const rows = transform(
		`export const B = () => <frame className="grid-rows-2" />;`,
		null,
	);
	expect(rows.code).toMatch(/FillDirection=\{Enum\.FillDirection\.Vertical\}/);
	expect(rows.code).toMatch(/FillDirectionMaxCells=\{2\}/);
});

test("sizes grid cells so tracks divide the container instead of collapsing", () => {
	// UIGridLayout overrides each child's own Size with CellSize, so a grid that
	// names no cell size pins every cell to Roblox's 100x100 default and wide
	// content spills over its neighbours.
	const columns = transform(
		`export const A = () => <frame className="grid grid-cols-2 gap-2.5" />;`,
		null,
	);

	expect(columns.diagnostics).toEqual([]);
	// Two tracks, each giving back its share of the single 10px gap.
	expect(columns.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0\.5, -5, 0, 100\), \d+\)\}/,
	);

	const gapless = transform(
		`export const B = () => <frame className="grid grid-cols-3" />;`,
		null,
	);

	expect(gapless.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0\.3333333333, 0, 0, 100\), \d+\)\}/,
	);

	// `grid-rows-*` fills vertically, so it divides the other axis.
	const rows = transform(
		`export const C = () => <frame className="grid grid-rows-4 gap-2" />;`,
		null,
	);

	expect(rows.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0, 100, 0\.25, -6\), \d+\)\}/,
	);
});

test("names the grid cross axis with auto-rows/auto-cols", () => {
	// `grid-cols-N` only sizes the axis it fills; UIGridLayout still needs a
	// number for the other one, so Tailwind's auto-track utilities supply it.
	const rows = transform(
		`export const A = () => <frame className="grid grid-cols-2 gap-2.5 auto-rows-37.5" />;`,
		null,
	);

	expect(rows.diagnostics).toEqual([]);
	expect(rows.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0\.5, -5, 0, 150\), \d+\)\}/,
	);

	const columns = transform(
		`export const B = () => <frame className="grid grid-rows-3 auto-cols-20" />;`,
		null,
	);

	expect(columns.code).toMatch(
		/CellSize=\{__VelaRem\.scale\(new UDim2\(0, 80, 0\.3333333333, 0\), \d+\)\}/,
	);
});

test("keeps gap on UIListLayout when no grid is present", () => {
	const result = transform(
		`export const A = () => <frame className="flex gap-2" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).not.toContain("uigridlayout");
	expect(emitted(result.code)).not.toContain("CellPadding");
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

test("ranks divided children by the LayoutOrder each one declares", () => {
	const result = transform(
		`export const A = () => (
			<frame className="flex-col divide-y">
				<frame LayoutOrder={3} />
				<frame className="order-first" />
				<frame className="order-last" />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// The parent ranks what it can read off each element, so a static order-*
	// has to arrive as a plain prop.
	expect(result.code).toMatch(/LayoutOrder=\{3\}/);
	expect(result.code).toMatch(/LayoutOrder=\{-9999\}/);
	expect(result.code).toMatch(/LayoutOrder=\{9999\}/);
	expect(runtimeSource).toMatch(/export function planDivideOrder/);
	expect(runtimeSource).toMatch(/__velaLayoutOrder: order/);
	expect(runtimeSource).toMatch(
		/hostProps\.LayoutOrder = props\.__velaLayoutOrder/,
	);
});

test("divide-x-0 and divide-y-0 insert no separators", () => {
	for (const token of ["divide-x-0", "divide-y-0", "divide-y divide-y-0"]) {
		const result = transform(
			`export const A = () => <frame className="flex-col ${token}"><frame /><frame /></frame>;`,
			null,
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.code).not.toContain("__velaDivide");
		expect(result.needsRuntimeHost).toBe(false);
	}
	expect(runtimeSource).toMatch(
		/if \(thickness === 0\) \{\s*return undefined;/,
	);
});

test("fades divide separators with the subtree they sit in", () => {
	const own = transform(
		`export const A = () => <frame className="flex-col divide-y divide-slate-500/50 opacity-50"><frame /><frame /></frame>;`,
		null,
	);
	expect(own.diagnostics).toEqual([]);
	expect(own.code).toMatch(/"transparency": 0\.75/);

	const inherited = transform(
		`export const A = () => (
			<frame className="opacity-50">
				<frame className="flex-col divide-y"><frame /><frame /></frame>
			</frame>
		);`,
		null,
	);
	expect(inherited.diagnostics).toEqual([]);
	expect(inherited.code).toMatch(/"transparency": 0\.5/);

	// GroupTransparency already composites the separators with everything else.
	const group = transform(
		`export const A = () => <canvasgroup className="flex-col divide-y opacity-50"><frame /><frame /></canvasgroup>;`,
		null,
	);
	expect(group.diagnostics).toEqual([]);
	expect(group.code).not.toMatch(/"transparency"/);
});

test("keeps value children under a fade divisible", () => {
	const result = transform(
		`export function A(props: { children?: unknown }) {
			return <frame className="flex-col divide-y opacity-50">{props.children}</frame>;
		}`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/<__VelaOpacity\.Provider value=\{0\.5\}>\{props\.children\}<\/__VelaOpacity\.Provider>/,
	);
	// One provider would read as one child; the host splits it per child.
	expect(runtimeSource).toMatch(
		/element\.type === \(__VelaOpacity\.Provider as unknown\)/,
	);
});

test("warns when divide has no list layout to place its separators", () => {
	const bare = transform(
		`export const A = () => <frame className="divide-y"><frame /><frame /></frame>;`,
		null,
	);
	expect(bare.diagnostics).toEqual([
		expect.objectContaining({
			code: "divide-without-list-layout",
			token: "divide-y",
		}),
	]);

	const grid = transform(
		`export const A = () => <frame className="grid grid-cols-2 divide-x"><frame /><frame /></frame>;`,
		null,
	);
	expect(grid.diagnostics).toEqual([
		expect.objectContaining({ code: "divide-with-grid", token: "divide-x" }),
	]);

	for (const layout of ["flex", "space-y-2"]) {
		const listed = transform(
			`export const A = () => <frame className="${layout} divide-y"><frame /><frame /></frame>;`,
			null,
		);
		expect(listed.diagnostics).toEqual([]);
	}

	const written = transform(
		`export const A = () => <frame className="divide-y"><uilistlayout /><frame /><frame /></frame>;`,
		null,
	);
	expect(written.diagnostics).toEqual([]);
});

test("warns when a divided child's order is only decided at render time", () => {
	const source = `export const A = (props: { late: boolean }) => (
		<frame className="flex-col divide-y">
			<frame className="md:order-2" />
			<frame className={props.late ? "order-last" : "order-1"} />
			<frame className="order-3" />
		</frame>
	);`;
	const result = transform(source, null);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "divide-unreadable-order",
			token: "md:order-2",
		}),
		expect.objectContaining({
			code: "divide-unreadable-order",
			token: "order-last",
		}),
	]);

	// Vide reads the built instances and follows every later write.
	const vide = transform(source, withVide);
	expect(
		vide.diagnostics.filter(
			(diagnostic) => diagnostic.code === "divide-unreadable-order",
		),
	).toEqual([]);
});

test("warns when a divided child's order stays inside a runtime class value", () => {
	const source = `export const A = (props: { x: string }) => (
		<frame className="flex flex-col divide-y">
			<frame className={\`order-2 \${props.x}\`} />
			<frame className={clsx("order-first", props.x)} />
			<frame className={\`p-2 \${props.x}\`} />
		</frame>
	);`;
	const result = transform(source, null);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "divide-unreadable-order",
			token: "order-2",
		}),
		expect.objectContaining({
			code: "divide-unreadable-order",
			token: "order-first",
		}),
	]);
});

test("isolate renders a frame as a CanvasGroup so opacity fades it as one layer", () => {
	const result = transform(
		`export const A = () => (
			<frame className="isolate opacity-50 size-10">
				<frame className="bg-red-500 size-6" />
				<frame className="bg-blue-500 size-6" />
			</frame>
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/<canvasgroup\b[^>]*GroupTransparency=\{0\.5\}/);
	expect(result.code).toMatch(/<\/canvasgroup>/);
	// The children are composited with the group rather than faded one by one.
	expect(result.code).not.toMatch(/<frame\b[^>]*Transparency=\{0\.5\}/);

	const runtime = transform(
		`export const A = () => <frame className="isolate opacity-50 hover:bg-red-500" />;`,
		null,
	);
	expect(runtime.code).toContain('__velaTag={"canvasgroup"}');
});

test("isolate has to be static, unconditional and on a frame", () => {
	const conditional = transform(
		`export const A = (props: { on: boolean }) => <frame className={props.on ? "isolate" : ""} />;`,
		null,
	);
	expect(conditional.diagnostics).toEqual([
		expect.objectContaining({ code: "isolate-not-static", token: "isolate" }),
	]);
	expect(conditional.code).not.toContain("canvasgroup");

	const runtime = transform(
		"export const A = (props: { x: string }) => <frame className={`isolate ${props.x}`} />;",
		null,
	);
	expect(runtime.diagnostics).toEqual([
		expect.objectContaining({ code: "isolate-not-static", token: "isolate" }),
	]);
	expect(runtime.code).not.toContain("canvasgroup");

	const variant = transform(
		`export const A = () => <frame className="hover:isolate" />;`,
		null,
	);
	expect(variant.diagnostics).toEqual([
		expect.objectContaining({
			code: "isolate-not-static",
			token: "hover:isolate",
		}),
	]);
	expect(variant.code).not.toContain("canvasgroup");

	const text = transform(
		`export const A = () => <textlabel className="isolate" />;`,
		null,
	);
	expect(text.diagnostics).toEqual([
		expect.objectContaining({ code: "isolate-needs-frame" }),
	]);
});
