import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { runtimeSource } from "./helpers";

test("lowers className on components into props and helper children", () => {
	const result = transform(
		`export const A = () => <Box className="bg-slate-700 rounded-md" />;`,
		null,
	);

	expect(result.code).toContain(
		"BackgroundColor3={Color3.fromRGB(49, 65, 88)}",
	);
	expect(result.code).toContain(
		"<uicorner CornerRadius={__VelaRem.scale(new UDim(0, 6), 0)}/>",
	);
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
		`<uicorner CornerRadius={__VelaRem.scale(new UDim(0, 6), 0)}/><textlabel Text="hi"/>`,
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
	// alone pins every breakpoint to a width no rule can match. The read is
	// debounced, so what the signal reaches is the settling call rather than
	// the environment update itself, and the host hears it through the store.
	expect(runtimeSource).toMatch(
		/watchViewport\(debounceViewport\(refreshEnvironment\)\.call\)/,
	);
	expect(runtimeSource).toMatch(
		/camera\s*\.GetPropertyChangedSignal\("ViewportSize"\)\s*\.Connect\(onChange\)/,
	);
	expect(runtimeSource).toMatch(
		/__VelaEnvCore\.subscribeEnvironment\(setEnvironment\)/,
	);
});

test("routes dynamic className on components through the runtime host", () => {
	const result = transform(
		`export const A = ({ on }: { on: boolean }) => <Box className={on ? "bg-slate-700" : "bg-slate-900"} />;`,
		null,
	);

	expect(result.code).toContain("__velaTag={Box}");
	// The eventual host element is unknown, but the tokens are not, so both
	// branches lower here the way they would on a host element.
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(/__velaTests=\{\[\s*on \? true : false\s*\]\}/);
	expect(
		JSON.parse(result.ir[0]).runtimeRules.map(
			(rule: { condition: unknown }) => rule.condition,
		),
	).toEqual([
		{ kind: "test", index: 0, expected: true },
		{ kind: "test", index: 0, expected: false },
	]);
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
