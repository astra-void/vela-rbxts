import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { emitted, runtimeSource, withoutPreflight } from "./helpers";

test("lowers opacity utilities to BackgroundTransparency", () => {
	const result = transform(
		'<frame className="opacity-25" />',
		withoutPreflight,
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.75\}/);
});

test("lowers opacity on a canvas group to GroupTransparency", () => {
	const result = transform('<canvasgroup className="opacity-25" />');

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/GroupTransparency=\{0\.75\}/);
	expect(result.code).not.toMatch(/BackgroundTransparency=\{0\.75\}/);

	transform('<canvasgroup className="md:opacity-25" />');
	expect(runtimeSource).toContain("__velaRules");
	expect(runtimeSource).toContain("GroupTransparency");
});

test("fades the text an opacity utility sits on", () => {
	const result = transform(
		'<textlabel className="opacity-25" Text="hi" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/TextTransparency=\{0\.75\}/);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.75\}/);
});

test("composes an opacity into the children written under it", () => {
	const result = transform(
		'<frame className="opacity-50"><textlabel Text="hi" /><frame className="bg-slate-700" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The label carries no class of its own and is still inside the fade.
	expect(result.code).toMatch(/TextTransparency=\{0\.5\}/);
	// Alpha multiplies, so a half-transparent background under a half-opacity
	// parent lands at a quarter — not at the parent's own value.
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.5\}/);
});

test("multiplies a nested opacity instead of overwriting it", () => {
	const result = transform(
		'<frame className="opacity-50"><frame className="opacity-50 bg-slate-700" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.75\}/);
});

test("stops composing under a canvas group, which composites its own subtree", () => {
	const result = transform(
		'<frame className="opacity-50"><canvasgroup><frame className="bg-slate-700" /></canvasgroup></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/GroupTransparency=\{0\.5\}/);
	// The frame inside the group keeps its own painted background untouched.
	expect(result.code).toMatch(
		/<frame BackgroundColor3=\{Color3\.fromRGB\(49, 65, 88\)\} BorderSizePixel=\{0\}\/>/,
	);
});

test("composes an opacity through a conditional and a map", () => {
	const result = transform(
		'<frame className="opacity-50">{items.map((item) => <textlabel Text={item} />)}</frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/TextTransparency=\{0\.5\}/);
});

test("carries an opacity into a variant that restates the transparency", () => {
	const result = transform(
		'<frame className="opacity-50"><frame className="bg-slate-700 hover:bg-blue-600/50" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The variant overlays the base at render time, so it carries the product
	// too — 0.5 alpha of its own under 0.5 from the parent.
	expect(result.code).toContain('"value": "0.75"');
});

type Rule = {
	condition: { kind: string; conditions?: unknown[] };
	effects: {
		props: { name: string; value: string }[];
		helpers: { tag: string }[];
	};
};

// The rules that fire beside it can repaint any channel, and only the runtime
// knows which of them did, so it is the one that multiplies the alpha in.
test("a variant opacity leaves the product to the runtime, helpers included", () => {
	const result = transform(
		'<frame className="bg-red-500/50 ring-2 hover:opacity-50" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	const ir = JSON.parse(result.ir[0]);
	const [resting, hover] = ir.runtimeRules as Rule[];
	expect(resting.condition).toEqual({ kind: "all", conditions: [] });
	expect(resting.effects.props).toEqual([
		{ name: "BackgroundTransparency", value: "0.5" },
	]);
	expect(resting.effects.helpers.map((helper) => helper.tag)).toEqual([
		"uistroke",
	]);
	expect(ir.base.helpers).toEqual([]);
	expect(hover.condition.kind).toBe("hover");
	expect(hover.effects).toEqual({
		props: [{ name: "ChannelAlpha", value: "0.5" }],
		helpers: [],
	});
	expect(runtimeSource).toContain('name === "ChannelAlpha"');
});

test("a variant opacity replaces the element's own rather than multiplying it", () => {
	const result = transform(
		'<frame className="opacity-50 hover:opacity-75" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	const ir = JSON.parse(result.ir[0]);
	expect(ir.base.props).toContainEqual({
		name: "BackgroundTransparency",
		value: "0.5",
	});
	const [resting, hover] = ir.runtimeRules as Rule[];
	expect(resting.effects.props).toEqual([
		{ name: "ChannelAlpha", value: "0.5" },
	]);
	expect(hover.effects.props).toEqual([
		{ name: "ChannelAlpha", value: "0.75" },
	]);
});

test("the runtime composes an element's own opacity once every token resolved", () => {
	expect(runtimeSource).toContain('propEffect("OpacityAlpha", 1 - value)');
	expect(runtimeSource).toContain(
		"resolution.opacityAlpha ?? resolution.channelAlpha",
	);
	expect(runtimeSource).toContain(
		"composeOwnOpacity(resolution, tag, ownAlpha, preflight);",
	);
});

test("an opacity leaves a background preflight neutralized transparent", () => {
	for (const className of [
		"opacity-50",
		"ring-2 hover:opacity-50",
		"border-2 opacity-50 hover:opacity-25",
	]) {
		const ir = JSON.parse(
			transform(`<frame className="${className}" />`).ir[0],
		);
		expect(ir.base.props).toContainEqual({
			name: "BackgroundTransparency",
			value: "1",
		});
		for (const rule of ir.runtimeRules as Rule[]) {
			expect(rule.effects.props.map((prop) => prop.name)).not.toContain(
				"BackgroundTransparency",
			);
		}
	}
});

test("a variant background over a neutralized base fades with the element", () => {
	const ir = JSON.parse(
		transform('<frame className="opacity-50 hover:bg-red-500" />').ir[0],
	);
	const hover = (ir.runtimeRules as Rule[]).find(
		(rule) => rule.condition.kind === "hover",
	);

	expect(hover?.effects.props).toContainEqual({
		name: "BackgroundTransparency",
		value: "0.5",
	});
});

test("an opacity still fades a background the author painted", () => {
	const result = transform(
		'<frame BackgroundColor3={color} className="opacity-50" />',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\.5\}/);
});

test("a solid color takes back an earlier one's opacity modifier", () => {
	const result = transform(
		'<textlabel className="bg-red-500/50 text-red-500/50 bg-blue-500 text-blue-500" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/BackgroundTransparency=\{0\}/);
	expect(result.code).toMatch(/TextTransparency=\{0\}/);
});

test("hands a dynamic class value the inherited opacity to compose itself", () => {
	const result = transform(
		'<frame className="opacity-50"><frame className={classes} /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__velaOpacity={0.5}");
});

test("the runtime host composes the opacity handed to it", () => {
	expect(runtimeSource).toContain("__velaOpacity");
	expect(runtimeSource).toContain("function composeInheritedOpacity(");
	expect(runtimeSource).toContain("function transparencyProps(");
});

// A rendered element carries the Roblox class name — roblox-ts lowers
// `<textlabel />` to `"TextLabel"` — while every table the runtime resolves
// against is keyed by the JSX tag. Comparing the two as they come matches
// nothing, and the fade silently reaches no channel at all.
test("the fade reads an element's tag as a class name", () => {
	expect(runtimeSource).toContain("(elementType as string).lower()");
});

test("hands the children an opacity cannot reach to the runtime", () => {
	const result = transform(
		'<frame className="opacity-50">{props.children}<Button /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}>{props.children}</__VelaOpacity.Provider>",
	);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}><Button/></__VelaOpacity.Provider>",
	);
});

test("an opacity on a component element crosses as an alpha, not a background", () => {
	const result = transform('<Label className="opacity-50 w-20" />');

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}>",
	);
	// The tag is unknown here, so a background is the wrong channel to guess at:
	// the label's own text is what the fade has to reach.
	expect(emitted(result.code)).not.toContain("BackgroundTransparency");
	expect(emitted(result.code)).toContain("Size=");
});

test("a component's own opacity multiplies with the one it inherits", () => {
	const result = transform(
		'<frame className="opacity-50"><Label className="opacity-50" /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.25}>",
	);
});

test("a component root reads what its caller provided", () => {
	const result = transform(
		'export const Label = () => <textlabel className="text-sm" Text="hi" />;',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain("<__VelaBoundary.Consume>");
	expect(result.code).toMatch(
		/import \{[^}]*__VelaBoundary[^}]*\} from "@rbxts\/vela-runtime";/,
	);
	// The host is a great deal more than a fade needs.
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("createVelaRuntimeHost");
});

// A caller can hand a faded subtree a fragment of its own, and a fragment reads
// no context to fade itself with.
test("the fade carries through a fragment", () => {
	const applyToElement =
		/function applyToElement\([\s\S]*?\n\t\}\n/.exec(runtimeSource)?.[0] ?? "";

	expect(applyToElement).toMatch(
		/elementType !== \(__VelaReact\.Fragment as unknown\)[\s\S]*?children: applyAlpha\(children, alpha\)/,
	);
});

// A default export has no name for the component rule to read, and it is a
// component all the same.
test("a component the file exports unnamed reads what its caller provided", () => {
	const result = transform(
		'export default () => <textlabel className="text-sm" Text="hi" />;',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain("<__VelaBoundary.Consume>");
	expect(result.code).toMatch(
		/import \{[^}]*__VelaBoundary[^}]*\} from "@rbxts\/vela-runtime";/,
	);
});

test("a component root that resolves at runtime needs no consumer of its own", () => {
	const result = transform(
		'export const Label = () => <textlabel className="text-sm hover:text-lg" Text="hi" />;',
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).not.toContain("__VelaBoundary.Consume");
	expect(result.needsRuntimeHost).toBe(true);
});

test("a callback inside a component is not a component root", () => {
	const result = transform(
		"export const List = () => <frame>{items.map((item) => <textlabel Text={item} />)}</frame>;",
	);

	expect(result.diagnostics).toEqual([]);
	expect(
		emitted(result.code).match(/__VelaBoundary\.Consume>/g) ?? [],
	).toHaveLength(2);
});

test("a fade that only resolves at runtime is left whole to the runtime", () => {
	const result = transform(
		'<frame className={active && "opacity-50"}><textlabel Text="hi" /><Label /></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	// The host resolves the whole class list and hands its subtree one alpha.
	// Fading part of it here would have applied that part twice.
	expect(emitted(result.code)).not.toContain("TextTransparency");
	expect(emitted(result.code)).not.toContain("__VelaOpacity.Provider");
	expect(runtimeSource).toContain("resolution.opacityAlpha");
	expect(runtimeSource).toContain("provide(childAlpha, userChildren)");
});

test("the fade ends at a canvasgroup on both paths", () => {
	const result = transform(
		'<frame className="opacity-50"><canvasgroup className="bg-slate-700"><Label /></canvasgroup></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The group composites its own subtree, so nothing below it repeats the
	// multiplication — no provider is handed down past it.
	expect(emitted(result.code)).not.toContain("__VelaOpacity.Provider");
	expect(emitted(result.code)).toContain("GroupTransparency={0.5}");
	expect(runtimeSource).toContain("__VelaOpacity.stop(userChildren)");
});

test("a component's children are faded once, by the provider", () => {
	const result = transform(
		'<frame className="opacity-50"><Card><textlabel Text="hi" /></Card></frame>',
	);

	expect(result.diagnostics).toEqual([]);
	// The card renders them out of sight, so the provider is what reaches them;
	// fading them here as well would land the same alpha twice.
	expect(emitted(result.code)).not.toContain("TextTransparency");
	expect(emitted(result.code)).toContain(
		"<__VelaOpacity.Provider value={0.5}>",
	);
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
