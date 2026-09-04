import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig, plugin } from "../../../config/src/index";
import { hostConfig, runtimeSource, withStateVariants } from "./helpers";

const rules = (code: string) =>
	JSON.parse(
		/__velaRules=\{(\[[\s\S]*?\])\}/.exec(code.replace(/\s+/g, " "))?.[1] ??
			"null",
	);

test("lowers a registered variant into an attribute rule", () => {
	const result = transform(
		`export const A = () => <frame className="open:bg-slate-700 disabled:opacity-50" />;`,
		withStateVariants,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.ir[0]).toContain(
		'{"kind":"attribute","name":"State","value":"open"}',
	);
	expect(result.ir[0]).toContain(
		'{"kind":"attribute","name":"Disabled","value":true}',
	);
	// The runtime reads the attribute off the instance and subscribes to it.
	expect(runtimeSource).toContain("GetAttributeChangedSignal");
});

// v0.13's whole point: a custom variant is a runtime condition, not a reason to
// stop resolving the utility behind it at compile time.
test("resolves the utility behind a custom variant statically", () => {
	const result = transform(
		`export const A = () => <frame className="open:rounded-lg" />;`,
		withStateVariants,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("className=");
	expect(result.ir[0]).toContain('"CornerRadius"');
	expect(result.ir[0]).toContain('"new UDim(0, 8)"');
});

test("reads an inline attribute variant with each value shape", () => {
	const cases: Array<[string, string]> = [
		["attr-[State=open]:bg-blue-600", '"name":"State","value":"open"'],
		["attr-[Disabled=true]:opacity-50", '"name":"Disabled","value":true'],
		["attr-[Level=3]:opacity-50", '"name":"Level","value":3.0'],
		// The first `=` separates, so the rest compares as written.
		["attr-[State=a=b]:opacity-50", '"name":"State","value":"a=b"'],
	];

	for (const [token, expected] of cases) {
		const result = transform(
			`export const A = () => <frame className="${token}" />;`,
			withStateVariants,
		);

		expect(result.diagnostics).toEqual([]);
		expect(result.ir[0]).toContain(expected);
	}
});

test("composes an attribute variant with the variants around it", () => {
	const hovered = transform(
		`export const A = () => <frame className="hover:attr-[State=open]:bg-blue-600" />;`,
		withStateVariants,
	);
	expect(hovered.diagnostics).toEqual([]);
	expect(hovered.ir[0]).toContain(
		'"kind":"all","conditions":[{"kind":"hover"},{"kind":"attribute","name":"State","value":"open"}]',
	);

	const responsive = transform(
		`export const B = () => <textbutton className="md:attr-[Selected=true]:ring-2" />;`,
		withStateVariants,
	);
	expect(responsive.diagnostics).toEqual([]);
	expect(responsive.ir[0]).toContain('"kind":"width","alias":"md"');
	expect(responsive.ir[0]).toContain(
		'{"kind":"attribute","name":"Selected","value":true}',
	);
});

// A colon inside the brackets is part of the value, not a variant separator.
test("keeps a colon inside an attribute value out of the variant split", () => {
	const result = transform(
		`export const A = () => <frame className="attr-[State=a:b]:opacity-50" />;`,
		withStateVariants,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.ir[0]).toContain('"name":"State","value":"a:b"');
});

test("reports each malformed attribute variant as itself", () => {
	const cases: Array<[string, string]> = [
		["attr-[", "malformed-attribute-variant"],
		["attr-[State]:p-4", "malformed-attribute-variant"],
		["attr-[=open]:p-4", "malformed-attribute-variant"],
		["attr-[State=]:p-4", "malformed-attribute-variant"],
		["attr-[State=open:p-4", "malformed-attribute-variant"],
		["attr-[State=open]", "malformed-attribute-variant"],
	];

	for (const [token, code] of cases) {
		const result = transform(
			`export const A = () => <frame className="${token}" />;`,
			withStateVariants,
		);

		expect(result.diagnostics.map((entry) => entry.code)).toEqual([code]);
		// Nothing behind a variant that cannot be read is lowered.
		expect(result.ir[0]).not.toContain("PaddingTop");
	}
});

test("an unreadable variant leaves its utility unlowered", () => {
	const result = transform(
		`export const A = () => <frame className="checked:p-4" />;`,
		withStateVariants,
	);

	expect(result.diagnostics.map((entry) => entry.code)).toEqual([
		"unknown-variant",
	]);
	expect(result.ir[0]).not.toContain("PaddingTop");
});

test("a config cannot register a variant vela reads as something else", () => {
	const result = transform(
		`export const A = () => <frame className="hover:p-4" />;`,
		{
			configJson: JSON.stringify({
				plugins: {
					variants: {
						hover: { attribute: "State", equals: "open" },
						"max-md": { attribute: "State", equals: "open" },
					},
				},
			}),
		},
	);

	expect(
		result.diagnostics.filter(
			(entry) => entry.code === "invalid-custom-variant",
		),
	).toHaveLength(2);
	// The built-in `hover:` still means what it always meant.
	expect(result.ir[0]).toContain('"kind":"hover"');
});

// The variants and the breakpoints are only read while parsing a class value,
// so a file that hands the host none should not carry either.
test("the registrations reach the runtime only where a class value is parsed", () => {
	const dynamic = transform("<frame className={cls} />", withStateVariants);
	expect(hostConfig(dynamic.code).plugins.variants).toEqual({
		open: { attribute: "State", equals: "open" },
		disabled: { attribute: "Disabled", equals: true },
		tier: { attribute: "Tier", equals: 2 },
	});
	expect(hostConfig(dynamic.code).theme.screens).toEqual({ tablet: 900 });

	const staticOnly = transform(
		'<frame className="open:bg-blue-600" />',
		withStateVariants,
	);
	expect(hostConfig(staticOnly.code).plugins).toEqual({ utilities: {} });
	expect(hostConfig(staticOnly.code).theme.screens).toEqual({});
});

// A plain element must not gain a subscription just because v0.13 exists.
test("an element with no attribute rule carries no attribute condition", () => {
	const result = transform(
		'<frame className="bg-slate-700 p-4" />',
		withStateVariants,
	);

	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("attribute");
	expect(rules(result.code)).toBeNull();
});

test("a custom variant composes with a known branch", () => {
	const result = transform(
		`export const A = () => <frame className={active ? "open:text-lg" : "text-sm"} />;`,
		{
			configJson: JSON.stringify(
				defineConfig({
					preflight: false,
					plugins: [
						plugin(({ addVariant }) => {
							addVariant("open", { attribute: "State", equals: "open" });
						}),
					],
				}),
			),
		},
	);

	expect(result.diagnostics).toEqual([]);
	// Both branches resolved here; only which of them applies is left to the host.
	expect(result.code).not.toContain("className=");
	expect(result.code).toContain('"kind": "test"');
	expect(result.code).toContain('"kind": "attribute"');
});
