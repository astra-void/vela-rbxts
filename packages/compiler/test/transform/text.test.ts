import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { runtimeSource } from "./helpers";

test("lowers leading utilities into LineHeight on text hosts", () => {
	const result = transform(
		`export const A = () => <textlabel className="leading-tight" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/LineHeight=\{1\.25\}/);

	const invalid = transform(
		`export const B = () => <textlabel className="leading-7" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-line-height-value" }),
	]);
});

test("merges italic with font weight into a single FontFace", () => {
	const merged = transform(
		`export const A = () => <textlabel className="italic font-bold" />;`,
		null,
	);
	expect(merged.diagnostics).toEqual([]);
	expect(merged.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Bold, Enum\.FontStyle\.Italic\)\}/,
	);

	const italicOnly = transform(
		`export const B = () => <textlabel className="italic" />;`,
		null,
	);
	expect(italicOnly.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Regular, Enum\.FontStyle\.Italic\)\}/,
	);

	const weightOnly = transform(
		`export const C = () => <textlabel className="font-bold" />;`,
		null,
	);
	expect(weightOnly.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/SourceSansPro\.json", Enum\.FontWeight\.Bold\)\}/,
	);
});

test("a variant font utility keeps the family and weight the base set", () => {
	const result = transform(
		`export const A = () => <textlabel className="font-mono font-bold dark:italic" />;`,
	);

	expect(result.diagnostics).toEqual([]);
	const [rule] = JSON.parse(result.ir[0]).runtimeRules;
	expect(rule.effects.props).toEqual([
		{ name: "FontStyle", value: "Enum.FontStyle.Italic" },
	]);
	expect(runtimeSource).toContain('if (name === "FontStyle") {');
});

test("merges the font family with weight and style into a single FontFace", () => {
	const mono = transform(
		`export const A = () => <textlabel className="font-mono" />;`,
		null,
	);
	expect(mono.diagnostics).toEqual([]);
	expect(mono.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/RobotoMono\.json", Enum\.FontWeight\.Regular\)\}/,
	);

	const merged = transform(
		`export const B = () => <textlabel className="font-serif font-bold italic" />;`,
		null,
	);
	expect(merged.diagnostics).toEqual([]);
	expect(merged.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/Merriweather\.json", Enum\.FontWeight\.Bold, Enum\.FontStyle\.Italic\)\}/,
	);

	const custom = transform(
		`export const C = () => <textlabel className="font-display" />;`,
		{
			configJson: JSON.stringify(
				defineConfig({
					theme: {
						extend: {
							fontFamily: {
								display: "rbxasset://fonts/families/GothamSSm.json",
							},
						},
					},
				}),
			),
		},
	);
	expect(custom.diagnostics).toEqual([]);
	expect(custom.code).toMatch(
		/FontFace=\{new Font\("rbxasset:\/\/fonts\/families\/GothamSSm\.json", Enum\.FontWeight\.Regular\)\}/,
	);

	const unknown = transform(
		`export const D = () => <textlabel className="font-handwriting" />;`,
		null,
	);
	expect(unknown.diagnostics).toEqual([
		expect.objectContaining({
			code: "unknown-theme-key",
			token: "font-handwriting",
		}),
	]);
});

test("lowers whitespace utilities into TextWrapped", () => {
	const result = transform(
		`export const A = () => <textlabel className="whitespace-nowrap" />;`,
		null,
	);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/TextWrapped=\{false\}/);

	const invalid = transform(
		`export const B = () => <textlabel className="whitespace-pre" />;`,
		null,
	);
	expect(invalid.diagnostics).toEqual([
		expect.objectContaining({ code: "unsupported-whitespace-value" }),
	]);
});

test("transforms a literal Text at compile time without a runtime host", () => {
	const upper = transform(
		`export const A = () => <textlabel Text="hello world" className="uppercase" />;`,
		null,
	);
	expect(upper.diagnostics).toEqual([]);
	expect(upper.needsRuntimeHost).toBe(false);
	expect(upper.code).toContain('Text="HELLO WORLD"');

	const capitalized = transform(
		`export const B = () => <textlabel Text="hello brave world" className="capitalize" />;`,
		null,
	);
	expect(capitalized.code).toContain('Text="Hello Brave World"');
});

test("wraps a literal Text in escaped RichText markup for decorations", () => {
	const result = transform(
		`export const A = () => <textlabel Text="a < b & c" className="underline" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toContain('Text="<u>a &lt; b &amp; c</u>"');
	expect(result.code).toMatch(/RichText=\{true\}/);

	const strike = transform(
		`export const B = () => <textlabel Text="done" className="line-through uppercase" />;`,
		null,
	);
	expect(strike.code).toContain('Text="<s>DONE</s>"');
});

test("backs off decorations on consumer-managed RichText", () => {
	const result = transform(
		`export const A = () => <textlabel RichText Text="<b>hi</b>" className="underline uppercase" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "decoration-on-richtext" }),
	]);
	expect(result.code).not.toContain("<u>");
	// The transform still applies, but the markup stays unescaped and unwrapped.
	expect(result.code).toContain('Text="<B>HI</B>"');
});

test("defers dynamic Text to the runtime pipeline", () => {
	const result = transform(
		`export const A = (props: { label: string }) => (
			<textlabel Text={props.label} className="uppercase underline" />
		);`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaText={");
	expect(result.code).toMatch(/"transform": "upper"/);
	expect(result.code).toMatch(/"decoration": "underline"/);
	expect(runtimeSource).toContain("applyTextConfig");
});

test("normal-case and no-underline cancel earlier text utilities", () => {
	const result = transform(
		`export const A = () => <textlabel Text="hi" className="uppercase underline normal-case no-underline" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).toContain('Text="hi"');
	expect(result.code).not.toContain("__velaText");
});
