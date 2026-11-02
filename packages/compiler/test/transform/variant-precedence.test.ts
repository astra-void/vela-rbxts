import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";

import { defineConfig } from "../../../config/src/index";
import { runtimeSource, withoutPreflight } from "./helpers";

const withVide = {
	configJson: JSON.stringify(
		defineConfig({ framework: "vide", preflight: false }),
	),
};

const irOf = (result: { ir: string[] }) => JSON.parse(result.ir[0]);

test("forwards variant classes no rule can carry to the runtime host", () => {
	for (const classes of [
		"hover:mt-4",
		"md:divide-y",
		"dark:underline",
		"hover:uppercase",
		"hover:duration-300",
		"md:animate-spin",
	]) {
		const result = transform(
			`export const A = () => <textlabel className="${classes}" />;`,
			withoutPreflight,
		);

		expect(result.diagnostics, classes).toEqual([]);
		expect(result.code, classes).toContain(`className={"${classes}"}`);
		expect(irOf(result).runtimeClasses, classes).toEqual([classes]);
	}
});

test("forwards the base classes of a forwarded family with it", () => {
	const result = transform(
		`export const A = () => <frame className="mt-2 hover:mt-4 -ml-2 p-2 divide-red-500" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	// The runtime composes the margin from every class that names one, so none
	// of it ships statically where a variant could not take it back.
	expect(result.code).toContain('className={"mt-2 hover:mt-4 -ml-2"}');
	expect(result.code).not.toContain("__velaMargin=");
	expect(result.code).not.toContain("Position=");
	expect(irOf(result).runtimeClasses).toEqual(["mt-2", "hover:mt-4", "-ml-2"]);
});

test("joins forwarded classes to what a class value leaves for the runtime", () => {
	const result = transform(
		'export const A = ({ extra }: { extra: string }) => <frame className={["hover:underline", extra]} />;',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/className=\{\[\s*"hover:underline",\s*extra\s*\]\}/,
	);
});

test("tells the vide host a forwarded margin needs its box", () => {
	const margin = transform(
		`export const A = () => <frame className="p-2 md:m-4" />;`,
		withVide,
	);
	expect(margin.code).toContain("__velaMarginBox={true}");

	// A negative margin only moves the element.
	const shift = transform(
		`export const B = () => <frame className="md:-mt-4" />;`,
		withVide,
	);
	expect(shift.code).not.toContain("__velaMarginBox");
});

test("reports motion under a variant on a component instead of dropping it", () => {
	const result = transform(
		`export const A = () => <Card className="bg-red-500 hover:duration-300" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "motion-on-component",
			token: "hover:duration-300",
		}),
	]);
	expect(result.code).not.toContain("className=");
});

test("carries a component's variant opacity as an alpha rule", () => {
	const result = transform(
		`export const A = () => <Card className="opacity-50 hover:opacity-75" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	// The base alpha is a rule too, so the variant's replaces it rather than
	// multiplying it.
	expect(irOf(result).runtimeRules).toEqual([
		{
			condition: { kind: "all", conditions: [] },
			effects: { props: [{ name: "OpacityAlpha", value: "0.5" }], helpers: [] },
		},
		{
			condition: { kind: "hover" },
			effects: {
				props: [{ name: "OpacityAlpha", value: "0.75" }],
				helpers: [],
			},
		},
	]);
	expect(result.code).not.toContain("__velaOpacity");
});

test("hands a hosted component the alpha it inherited", () => {
	const result = transform(
		`export const A = () => <frame className="opacity-50"><Card className="hover:bg-red-500" /></frame>;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__velaOpacity={0.5}");
});

test("keeps a grid's gap off the UIListLayout", () => {
	const result = transform(
		`export const A = () => <frame className="grid grid-cols-3 gap-4" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("CellPadding=");
	expect(result.code).not.toContain("uilistlayout");
});

test("leaves a gap CellPadding cannot carry on the list layout, as the runtime does", () => {
	const result = transform(
		`export const A = () => <frame className="grid grid-cols-3 gap-[10%]" />;`,
		withoutPreflight,
	);

	expect(result.code).not.toContain("CellPadding=");
	expect(result.code).toContain("Padding={new UDim(0.1, 0)}");

	const variant = transform(
		`export const B = () => <frame className="grid grid-cols-3 gap-4 md:gap-[10%]" />;`,
		withoutPreflight,
	);
	// The runtime drops the variant's list padding once it holds the base's gap.
	const [always] = irOf(variant).runtimeRules;
	expect(always.effects.props).toEqual(
		expect.arrayContaining([{ name: "GapOffset", value: "16" }]),
	);
	expect(
		always.effects.helpers.map((helper: { tag: string }) => helper.tag),
	).toEqual(["uigridlayout"]);
});

test("composes a variant gap into the grid the base declared", () => {
	const result = transform(
		`export const A = () => <frame className="grid grid-cols-3 md:gap-4" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	const [always, md] = irOf(result).runtimeRules;
	// The runtime recomposes the cells from the base's track count and the gap
	// that applies, and drops the list padding the gap wrote beside the grid.
	expect(always.condition).toEqual({ kind: "all", conditions: [] });
	expect(always.effects.props).toEqual([
		{ name: "GridCells", value: "3" },
		{ name: "GridCellsHorizontal", value: "true" },
	]);
	expect(
		always.effects.helpers.map((helper: { tag: string }) => helper.tag),
	).toEqual(["uigridlayout"]);
	expect(md.condition).toEqual(
		expect.objectContaining({ kind: "width", minWidth: 768 }),
	);
	expect(md.effects.props).toEqual([{ name: "GapOffset", value: "16" }]);
	expect(runtimeSource).toContain("dropGridListPadding");
});

test("leaves the grid inputs out where no grid can apply", () => {
	const result = transform(
		`export const A = () => <frame className="flex md:gap-4" />;`,
		withoutPreflight,
	);

	expect(irOf(result).runtimeRules.at(-1).effects).toEqual({
		props: [],
		helpers: [
			{
				tag: "uilistlayout",
				props: [{ name: "Padding", value: "new UDim(0, 16)" }],
			},
		],
	});
});

test("ranks rules the way Tailwind's stylesheet does, whatever the source order", () => {
	const conditions = (classes: string) =>
		irOf(
			transform(
				`export const A = () => <frame className="${classes}" />;`,
				withoutPreflight,
			),
		).runtimeRules.map(
			(rule: { condition: { kind: string; alias?: string } }) =>
				rule.condition.alias ?? rule.condition.kind,
		);

	expect(conditions("lg:bg-red-500 md:bg-blue-500 sm:bg-green-500")).toEqual([
		"sm",
		"md",
		"lg",
	]);
	expect(conditions("md:bg-red-500 hover:bg-blue-500")).toEqual([
		"hover",
		"md",
	]);
	// Tailwind registers orientation, dark and the pointer variants after the
	// breakpoints.
	expect(
		conditions("touch:bg-green-500 dark:bg-blue-500 md:bg-red-500"),
	).toEqual(["md", "color-scheme", "input"]);
	expect(conditions("portrait:bg-blue-500 xl:bg-red-500")).toEqual([
		"xl",
		"orientation",
	]);
	// Equal ranks keep the order they were written in.
	expect(conditions("focus:bg-red-500 hover:bg-blue-500")).toEqual([
		"focus",
		"hover",
	]);
	expect(runtimeSource).toContain("conditionPrecedence");
});

test("hands a variant's size per axis so it can take back what the base sized", () => {
	const result = transform(
		`export const A = () => <frame className="w-3/5 h-10 xl:w-fit" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	const [always, xl] = irOf(result).runtimeRules;
	expect(always.effects.props).toEqual([
		{ name: "SizeX", value: "new UDim(0.6, 0)" },
		{ name: "SizeY", value: "new UDim(0, 40)" },
	]);
	expect(xl.effects.props).toEqual([{ name: "AutoX", value: "true" }]);
	expect(result.code).not.toContain("Size={");
});

test("hands the base translate to the runtime once a rule moves the element", () => {
	const result = transform(
		`export const A = () => <frame className="-translate-x-1/2 left-1/2 hover:translate-x-4" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	// A static AnchorPoint would outlive the translate the variant replaces.
	expect(result.code).not.toContain("AnchorPoint=");
	expect(irOf(result).base.props).toContainEqual({
		name: "Position",
		value: "UDim2.fromScale(0.5, 0)",
	});
	const [always, hover] = irOf(result).runtimeRules;
	expect(always.effects.props).toEqual([
		{ name: "TranslateX", value: "new UDim(-0.5, 0)" },
	]);
	expect(hover.effects.props).toEqual([
		{ name: "TranslateX", value: "new UDim(0, 16)" },
	]);

	const shifted = transform(
		`export const B = () => <frame className="-translate-x-4 hover:left-4" />;`,
		withoutPreflight,
	);
	expect(shifted.code).not.toContain("Position=");
	expect(irOf(shifted).runtimeRules[0].effects.props).toEqual([
		{ name: "TranslateX", value: "new UDim(0, -16)" },
	]);
});

test("forwards a negative margin once a rule replaces the position it shifts", () => {
	const result = transform(
		`export const A = () => <frame className="-ml-2 left-4 hover:left-8" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(irOf(result).runtimeClasses).toEqual(["-ml-2"]);
	expect(irOf(result).base.props).toContainEqual({
		name: "Position",
		value: "UDim2.fromOffset(16, 0)",
	});
});
