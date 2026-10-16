import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { emitted, hostRules, runtimeSource, withoutPreflight } from "./helpers";

const withVide = {
	configJson: JSON.stringify(
		defineConfig({ framework: "vide", preflight: false }),
	),
};

test("lowers backdrop-blur to a UIBlur strength", () => {
	const cases = [
		["backdrop-blur", "Light"],
		["backdrop-blur-xs", "Light"],
		["backdrop-blur-sm", "Light"],
		["backdrop-blur-md", "Medium"],
		["backdrop-blur-lg", "Medium"],
		["backdrop-blur-xl", "Heavy"],
		["backdrop-blur-2xl", "Heavy"],
		["backdrop-blur-3xl", "Heavy"],
	] as const;

	for (const [token, strength] of cases) {
		const result = transform(
			`<frame className="${token}" />`,
			withoutPreflight,
		);

		expect(result.diagnostics).toEqual([]);
		expect(emitted(result.code)).toContain(
			`<__VelaHelper.uiblur Strength={Enum.UIBlurStrength.${strength}}/>`,
		);
	}
});

test("backdrop-blur-none disables the UIBlur", () => {
	const result = transform(
		'<frame className="backdrop-blur-none" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaHelper.uiblur Enabled={false}/>",
	);
});

test("reports a backdrop-blur size UIBlur has no strength for", () => {
	const result = transform(
		'<frame className="backdrop-blur-4xl" />',
		withoutPreflight,
	);

	expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		"unsupported-backdrop-blur-value",
	]);
	expect(emitted(result.code)).not.toContain("uiblur");
});

test("the other backdrop filters still have no Roblox equivalent", () => {
	const result = transform(
		'<frame className="backdrop-brightness-50" />',
		withoutPreflight,
	);

	expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
		"no-roblox-equivalent",
	]);
});

test("names helpers @rbxts/react cannot map through the runtime", () => {
	const result = transform(
		'<frame className="shadow-sm rounded-md backdrop-blur" />',
		withoutPreflight,
	);

	expect(result.code).toMatch(
		/import \{[^}]*\b__VelaHelper\b[^}]*\} from "@rbxts\/vela-runtime";/,
	);
	expect(emitted(result.code)).toContain("<__VelaHelper.uishadow ");
	expect(emitted(result.code)).toContain("<__VelaHelper.uiblur ");
	expect(emitted(result.code)).toContain("<uicorner ");
	expect(runtimeSource).toContain("export namespace __VelaHelper");
	expect(runtimeSource).toContain('return "UIBlur";');
});

test("a file with no unlisted helper imports no class names", () => {
	const result = transform(
		'<frame className="rounded-md" />',
		withoutPreflight,
	);

	expect(result.code).not.toContain("__VelaHelper");
});

test("Vide writes the lowercase helper tags it maps itself", () => {
	const result = transform(
		'<frame className="shadow-sm backdrop-blur" />',
		withVide,
	);

	expect(result.code).not.toContain("__VelaHelper");
	expect(emitted(result.code)).toContain("<uishadow ");
	expect(emitted(result.code)).toContain(
		"<uiblur Strength={Enum.UIBlurStrength.Light}/>",
	);
});

test("opacity fades the UIBlur with everything else the element draws", () => {
	const result = transform(
		'<frame className="backdrop-blur-md opacity-50" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).toContain(
		"<__VelaHelper.uiblur Strength={Enum.UIBlurStrength.Medium} Transparency={0.5}/>",
	);
	expect(runtimeSource).toContain('helper.tag !== "uiblur"');
});

test("a variant backdrop-blur resolves on the runtime host", () => {
	const result = transform(
		'<frame className="hover:backdrop-blur-lg" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(hostRules(result.code)).toEqual([
		{
			condition: { kind: "hover" },
			effects: {
				props: [],
				helpers: [
					{
						tag: "uiblur",
						props: [{ name: "Strength", value: "Enum.UIBlurStrength.Medium" }],
					},
				],
			},
		},
	]);
	expect(runtimeSource).toContain('"backdrop-blur-"');
	expect(runtimeSource).toContain("Enum.UIBlurStrength.Heavy");
});

test("an inset and a text shadow are UIShadows of their own beside a drop shadow", () => {
	const result = transform(
		'<textlabel className="shadow-md inset-shadow-xs text-shadow-lg" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	const code = emitted(result.code);
	expect(code.match(/<__VelaHelper\.uishadow /g)).toHaveLength(3);
	expect(code).toMatch(
		/<__VelaHelper\.uishadow Inset=\{true\} BlurRadius=\{[^}]*new UDim\(0, 1\)[^}]*\}/,
	);
	expect(code).toMatch(
		/<__VelaHelper\.uishadow Mode=\{Enum\.ApplyShadowMode\.Text\} BlurRadius=\{[^}]*new UDim\(0, 8\)/,
	);
});

test("shadow-inner is the inset-shadow-sm layer", () => {
	const inner = transform(
		'<frame className="shadow-inner" />',
		withoutPreflight,
	);
	const sm = transform(
		'<frame className="inset-shadow-sm" />',
		withoutPreflight,
	);

	expect(inner.diagnostics).toEqual([]);
	expect(emitted(inner.code)).toBe(emitted(sm.code));
	expect(emitted(inner.code)).toContain("Inset={true}");
});

test("a shadow layer's color and none reach only that layer", () => {
	const result = transform(
		'<textlabel className="shadow-sm text-shadow-sky-500/50 inset-shadow-none" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	const code = emitted(result.code);
	expect(code).toContain(
		"<__VelaHelper.uishadow Mode={Enum.ApplyShadowMode.Text} Color={Color3.fromRGB(",
	);
	expect(code).toMatch(
		/Mode=\{Enum\.ApplyShadowMode\.Text\}[^>]*Transparency=\{0\.5\}/,
	);
	expect(code).toContain(
		"<__VelaHelper.uishadow Inset={true} Enabled={false}/>",
	);
});

test("inset-* and text-* keep their own meaning next to the shadow prefixes", () => {
	const result = transform(
		'<textlabel className="inset-4 text-sm text-red-500" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(emitted(result.code)).not.toContain("uishadow");
});

test("Vide writes every shadow layer as a plain uishadow", () => {
	const result = transform(
		'<textlabel className="inset-shadow-xs text-shadow-sm" />',
		withVide,
	);

	expect(result.code).not.toContain("__VelaHelper");
	expect(emitted(result.code).match(/<uishadow /g)).toHaveLength(2);
});

test("a variant shadow layer resolves on the runtime host with its mode", () => {
	const result = transform(
		'<textlabel className="hover:text-shadow-md" />',
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	const [rule] = hostRules(result.code);
	expect(rule.effects.helpers[0].tag).toBe("uitextshadow");
	expect(rule.effects.helpers[0].props[0]).toEqual({
		name: "Mode",
		value: "Enum.ApplyShadowMode.Text",
	});
	expect(runtimeSource).toContain('"inset-shadow-"');
	expect(runtimeSource).toContain('"text-shadow-"');
	expect(runtimeSource).toContain("Enum.ApplyShadowMode.Text");
	expect(runtimeSource).toContain("export function isShadowHelper");
});

test("opacity fades every shadow layer", () => {
	const result = transform(
		'<textlabel className="inset-shadow-sm text-shadow-sm opacity-50" />',
		withoutPreflight,
	);

	const code = emitted(result.code);
	expect(code).toMatch(/Inset=\{true\}[^>]*Transparency=\{0\.975\}/);
	expect(code).toMatch(
		/Mode=\{Enum\.ApplyShadowMode\.Text\}[^>]*Transparency=\{0\.9\}/,
	);
});
