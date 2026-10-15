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
