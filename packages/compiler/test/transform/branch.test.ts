import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";

// A branch whose tokens are all written out is one this pass can read; only
// which of them apply is left for render time. Resolving it here is what lets
// the whole utility set through, rather than the subset the runtime parses.
const ruleConditions = (result: { ir: string[] }) =>
	JSON.parse(result.ir[0]).runtimeRules.map(
		(rule: { condition: unknown }) => rule.condition,
	);

test("resolves a static-only utility written inside a branch", () => {
	const result = transform(
		'export const A = ({ big }: { big: boolean }) => <textlabel className={big ? "text-lg" : "text-sm"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	// `text-{size}` has no runtime resolution at all, so before the branch was
	// read here it left no TextSize on either side.
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: true },
			effects: expect.objectContaining({
				props: [{ name: "TextSize", value: "18" }],
			}),
		}),
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: false },
			effects: expect.objectContaining({
				props: [{ name: "TextSize", value: "14" }],
			}),
		}),
	]);
});

test("resolves a branch among the tokens written around it", () => {
	const result = transform(
		'export const A = ({ tall }: { tall: boolean }) => <frame className={["w-40", tall && "h-10"]} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// Both axes are known here, so they still meet in one `Size` rather than the
	// branch overwriting the width the base opened.
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: true },
			effects: expect.objectContaining({
				props: [{ name: "Size", value: "UDim2.fromOffset(160, 40)" }],
			}),
		}),
	]);
});

test("evaluates a test once however many branches hang on it", () => {
	const result = transform(
		'export const A = ({ a, b }: { a: boolean; b: boolean }) => <frame className={a ? "bg-red-500" : b ? "bg-green-500" : "bg-blue-500"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*a \? true : false,\s*b \? true : false\s*\]\}/,
	);
	expect(ruleConditions(result)).toEqual([
		{ kind: "test", index: 0, expected: true },
		{
			kind: "all",
			conditions: [
				{ kind: "test", index: 0, expected: false },
				{ kind: "test", index: 1, expected: true },
			],
		},
		{
			kind: "all",
			conditions: [
				{ kind: "test", index: 0, expected: false },
				{ kind: "test", index: 1, expected: false },
			],
		},
	]);
});

test("meets a variant inside a branch with the branch's own test", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={on ? "hover:bg-blue-500" : "bg-slate-900"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// A hover outranks the branch's unconditioned class, so it is applied last.
	expect(ruleConditions(result)).toEqual([
		{ kind: "test", index: 0, expected: false },
		{
			kind: "all",
			conditions: [
				{ kind: "test", index: 0, expected: true },
				{ kind: "hover" },
			],
		},
	]);
});

test("keeps the undecided left side of `||` on the runtime path", () => {
	const result = transform(
		'export const A = ({ extra }: { extra?: string }) => <frame className={extra || "bg-blue-500"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// A truthy `extra` is the class value itself and can name anything, so it
	// travels on; the literal behind it is what the test decides.
	expect(result.code).toContain("className={extra}");
	expect(ruleConditions(result)).toEqual([
		{ kind: "test", index: 0, expected: false },
	]);
});

test("hands a whole class value back when a branch reaches past a rule", () => {
	const result = transform(
		'export const A = ({ loud }: { loud: boolean }) => <textlabel className={loud ? "uppercase" : "bg-slate-900"} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// A text transform is read off the host's own props rather than off the
	// resolution, so no rule can carry it and the runtime resolves the lot.
	expect(result.code).toContain(
		'className={loud ? "uppercase" : "bg-slate-900"}',
	);
	expect(result.code).not.toContain("__velaTests=");
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([]);
});

// A bare `opacity-*` fades the element's subtree as well as the element, and the
// subtree is wrapped from the tokens that always apply — a branch is not among
// them. Lowered as a rule it painted the element's own transparency and the
// subtree never learned about the alpha at all.
test("hands a whole class value back when a branch names an opacity", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={["size-8", on && "opacity-50"]}><textlabel Text="x" /></frame>;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// The tokens written around the branch stay static; only the branch itself
	// goes back, and the host resolves it and fades the subtree from there.
	expect(result.code).toContain('className={on && "opacity-50"}');
	expect(result.code).not.toContain("__velaTests=");
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([]);
});

// A CanvasGroup composites its own subtree, so `GroupTransparency` on the
// instance is the whole fade and a rule can carry it.
test("keeps a canvasgroup's branch opacity on the rule path", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <canvasgroup className={["size-8", on && "opacity-50"]} />;',
		null,
	);

	expect(result.code).not.toContain("className={");
	expect(JSON.parse(result.ir[0]).runtimeRules[0].effects.props).toEqual([
		{ name: "GroupTransparency", value: "0.5" },
	]);
});

// The fade is written outside the branch, so the branch is no reason to stop
// reading it — the tokens around it are as static as they ever were.
test("fades a subtree from an opacity written beside a branch", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={["size-8 opacity-50", on && "bg-red-500"]}><textlabel Text="x" /></frame>;',
		null,
	);

	expect(result.code).toContain("TextTransparency");
	expect(result.code).toContain("__velaTests=");
});

test("reports an unknown utility written inside a branch", () => {
	const result = transform(
		'export const A = ({ on }: { on: boolean }) => <frame className={on ? "bg-blu-500" : "bg-slate-900"} />;',
		null,
	);

	expect(result.diagnostics).toHaveLength(1);
	expect(result.diagnostics[0].code).toBe("unknown-theme-key");
	expect(result.diagnostics[0].token).toBe("bg-blu-500");
});

test("keeps one helper instance when a branch overwrites the base's", () => {
	const result = transform(
		'export const A = ({ roomy }: { roomy: boolean }) => <frame className={["p-4", roomy && "p-8"]} />;',
		null,
	);

	expect(result.diagnostics).toEqual([]);
	// The host renders what the resolution came to alongside the children it
	// was handed, so a padding both name has to meet in one of the two.
	expect(result.code).not.toContain("<uipadding");
	expect(ruleConditions(result)).toEqual([
		{ kind: "all", conditions: [] },
		{ kind: "test", index: 0, expected: true },
	]);
});

// The scope used to keep only whether a `const` was truthy, so a string one
// read as a class value lowered to nothing at all.
test("a const string used as the class value lowers its classes", () => {
	const result = transform(
		'const item = "w-6 bg-slate-500"; export function A() { return <frame className={item} />; }',
	);

	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toContain(
		"BackgroundColor3={Color3.fromRGB(98, 116, 142)}",
	);
	expect(result.code).toContain("UDim2.fromOffset(24, 0)");
});
