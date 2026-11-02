import { transform } from "@vela-rbxts/compiler";
import { describe, expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { emitted } from "./helpers";

const targets = {
	react: null,
	vide: { configJson: JSON.stringify(defineConfig({ framework: "vide" })) },
};

const lower = (element: string, target: keyof typeof targets = "react") =>
	transform(`export const A = () => ${element};`, targets[target]);

const codes = (result: ReturnType<typeof transform>) =>
	result.diagnostics.map((diagnostic) => diagnostic.code);

const attributeCount = (code: string, name: string) =>
	code.split(` ${name}={`).length - 1;

describe.each(
	Object.keys(targets) as (keyof typeof targets)[],
)("on the %s target", (target) => {
	test.each([
		[
			`<frame className="bg-slate-700" BackgroundColor3={dynamicColor} />`,
			"BackgroundColor3",
			"bg-slate-700",
		],
		[
			`<frame BackgroundColor3={dynamicColor} className="bg-slate-700" />`,
			"BackgroundColor3",
			"bg-slate-700",
		],
		[
			`<frame className="bg-slate-700/50 rounded-lg" BackgroundTransparency={() => 0.25} />`,
			"BackgroundTransparency",
			"bg-slate-700/50",
		],
		[
			`<textlabel className="text-white" TextColor3={computedTextColor} />`,
			"TextColor3",
			"text-white",
		],
		[`<frame className="w-full" Size={size} />`, "Size", "w-full"],
		[
			`<frame className="left-4 top-2" Position={position} />`,
			"Position",
			"left-4",
		],
		[
			`<frame className="origin-center" AnchorPoint={anchor} />`,
			"AnchorPoint",
			"origin-center",
		],
		[
			`<textlabel className="text-lg" TextSize={size} />`,
			"TextSize",
			"text-lg",
		],
		[
			`<textlabel className="font-bold" FontFace={font} />`,
			"FontFace",
			"font-bold",
		],
		[
			`<textlabel className="text-white/50" TextTransparency={fade} />`,
			"TextTransparency",
			"text-white/50",
		],
		[
			`<imagelabel className="image-white/50" ImageTransparency={fade} />`,
			"ImageTransparency",
			"image-white/50",
		],
		[`<frame className="z-10" ZIndex={layer} />`, "ZIndex", "z-10"],
	])("keeps the declared prop over the class: %s", (element, prop, token) => {
		const result = lower(element, target);
		const code = emitted(result.code);

		expect(attributeCount(code, prop)).toBe(1);
		expect(result.diagnostics).toContainEqual(
			expect.objectContaining({
				level: "warning",
				code: "explicit-prop-overrides-class",
				token,
				message: expect.stringContaining(
					`\`${token}\` generates ${prop}, but this element already declares ${prop}.`,
				),
			}),
		);
	});

	test("keeps a reactive binding the class would have replaced", () => {
		const code = emitted(
			lower(
				`<frame className="bg-slate-700" BackgroundColor3={() => color()} />`,
				target,
			).code,
		);

		expect(code).toContain("BackgroundColor3={()=>color()}");
		expect(code).not.toContain("Color3.fromRGB(49, 65, 88)");
	});

	test("reports nothing when the class lowers to a different prop", () => {
		const result = lower(
			`<frame className="rounded-lg" BackgroundTransparency={0.25} />`,
			target,
		);

		expect(codes(result)).not.toContain("explicit-prop-overrides-class");
		expect(emitted(result.code)).toContain("BackgroundTransparency={0.25}");
		expect(emitted(result.code)).toContain("<uicorner");
	});

	test("takes a declared prop out of a variant too, and the element stays static", () => {
		const result = lower(
			`<textbutton className="bg-slate-700 hover:bg-slate-600" BackgroundColor3={color} />`,
			target,
		);

		expect(result.needsRuntimeHost).toBe(false);
		expect(emitted(result.code)).toContain(
			"<textbutton BackgroundColor3={color}",
		);
		expect(
			result.diagnostics.filter(
				(diagnostic) => diagnostic.code === "explicit-prop-overrides-class",
			),
		).toHaveLength(2);
	});

	test("keeps the rest of a variant that only partly names a declared prop", () => {
		const result = lower(
			`<textbutton className="hover:bg-slate-600 hover:text-white" BackgroundColor3={color} />`,
			target,
		);

		expect(result.needsRuntimeHost).toBe(true);
		expect(result.code).toContain('"TextColor3"');
		expect(result.code).not.toContain("Color3.fromRGB(69, 85, 108)");
	});

	test("drops a branch that only names a declared prop", () => {
		const result = lower(
			`<frame className={open ? "bg-slate-700" : "bg-slate-800"} BackgroundColor3={color} />`,
			target,
		);

		expect(result.needsRuntimeHost).toBe(false);
		expect(emitted(result.code)).toContain("<frame BackgroundColor3={color}");
	});

	test("tells the runtime host which props a render-time class value must leave alone", () => {
		const result = lower(
			`<frame className={props.className} BackgroundColor3={color} Event={{ Activated: onActivated }} />`,
			target,
		);

		expect(result.needsRuntimeHost).toBe(true);
		expect(result.code).toMatch(/__velaOwn=\{\[\s*"BackgroundColor3"\s*\]\}/);
	});

	test("lets a spread written after the className override what it lowers to", () => {
		const code = emitted(
			lower(`<frame className="bg-slate-700" {...props} />`, target).code,
		);

		expect(code).toContain(
			"<frame BorderSizePixel={0} BackgroundColor3={Color3.fromRGB(49, 65, 88)} {...props}/>",
		);
	});

	test("keeps a className written after a spread winning over it", () => {
		const code = emitted(
			lower(`<frame {...props} className="bg-slate-700" />`, target).code,
		);

		expect(code).toContain(
			"<frame BorderSizePixel={0} {...props} BackgroundColor3={Color3.fromRGB(49, 65, 88)}/>",
		);
	});

	test("lets a spread paint over preflight's defaults", () => {
		const code = emitted(
			lower(`<frame {...props} className="rounded-lg" />`, target).code,
		);

		expect(code).toContain(
			"<frame BorderSizePixel={0} BackgroundTransparency={1} {...props}>",
		);
	});

	test("evaluates a spread once and keeps its handlers", () => {
		const { code } = lower(
			`<textbutton className="bg-slate-700" {...makeProps()} Event={{ Activated: onActivated }} />`,
			target,
		);

		expect(code.split("makeProps()").length - 1).toBe(1);
		expect(code).toMatch(/Activated: onActivated/);
	});

	test("keeps a declared prop over a component's class", () => {
		const result = lower(
			`<Card className="bg-slate-700 rounded-lg" BackgroundColor3={customColor} />`,
			target,
		);
		const code = emitted(result.code);

		expect(attributeCount(code, "BackgroundColor3")).toBe(1);
		expect(code).toContain("BackgroundColor3={customColor}");
		expect(code).toContain("<uicorner");
		expect(codes(result)).toContain("explicit-prop-overrides-class");
	});

	test("does not add a second UICorner beside a written one", () => {
		for (const element of [
			`<frame className="rounded-lg"><uicorner CornerRadius={new UDim(0, 12)} /></frame>`,
			`<frame className="rounded-lg"><textlabel /><uicorner CornerRadius={new UDim(0, 12)} /></frame>`,
			`<frame className="rounded-lg"><><uicorner CornerRadius={new UDim(0, 12)} /></></frame>`,
		]) {
			const result = lower(element, target);
			const code = emitted(result.code);

			expect(code.split("<uicorner").length - 1).toBe(1);
			expect(code).toContain("CornerRadius={new UDim(0, 12)}");
			expect(result.diagnostics).toContainEqual(
				expect.objectContaining({
					code: "explicit-helper-overrides-class",
					token: "rounded-lg",
				}),
			);
		}
	});

	test("keeps the class's helpers that are not written", () => {
		const result = lower(
			`<frame className="rounded-lg p-2 border-2"><uicorner /></frame>`,
			target,
		);
		const code = emitted(result.code);

		expect(code.split("<uicorner").length - 1).toBe(1);
		expect(code).toContain("<uipadding");
		expect(code).toContain("<uistroke");
	});

	test("warns but keeps the class's helper beside a conditional one", () => {
		const result = lower(
			`<frame className="rounded-lg">{open && <uicorner CornerRadius={new UDim(0, 12)} />}</frame>`,
			target,
		);

		expect(emitted(result.code).split("<uicorner").length - 1).toBe(2);
		expect(codes(result)).toContain("possible-duplicate-helper");
	});

	test("keeps a helper a variant changes, since the runtime host keys rules on it", () => {
		const result = lower(
			`<frame className="rounded-lg hover:rounded-xl"><uicorner /></frame>`,
			target,
		);

		expect(result.needsRuntimeHost).toBe(true);
		expect(codes(result)).toContain("possible-duplicate-helper");
	});

	test("leaves a written helper of a different class alone", () => {
		const result = lower(
			`<frame className="rounded-lg"><uistroke Thickness={2} /></frame>`,
			target,
		);

		expect(codes(result)).toEqual([]);
		expect(emitted(result.code)).toContain("<uicorner");
	});

	test("keeps a shadow layer beside a written UIShadow", () => {
		const result = lower(
			`<frame className="shadow-lg"><uishadow /></frame>`,
			target,
		);

		expect(codes(result)).toEqual([]);
	});
});

test("anchors a conflict to the class that raised it", () => {
	const source = `export const A = () => <frame className="rounded-lg bg-slate-700" BackgroundColor3={c} />;`;
	const diagnostic = transform(source, null).diagnostics.find(
		(entry) => entry.code === "explicit-prop-overrides-class",
	);
	const start = source.indexOf("bg-slate-700");

	expect(diagnostic?.range).toEqual({
		start,
		end: start + "bg-slate-700".length,
	});
});
