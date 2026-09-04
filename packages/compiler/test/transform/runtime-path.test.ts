import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { runtimeSource } from "./helpers";

test("rewrites dynamic array className through the runtime helper", () => {
	const result = transform(
		'<frame className={["bg-blue-600", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	// The branch names classes this pass can read, so it is resolved here and
	// the host is handed the test rather than the class list.
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*active \? true : false\s*\]\}/,
	);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			runtimeRules: [
				expect.objectContaining({
					condition: { kind: "test", index: 0, expected: true },
					effects: expect.objectContaining({
						helpers: [expect.objectContaining({ tag: "uicorner" })],
					}),
				}),
			],
		}),
	);
	expect(result.code).toContain(
		'import { createVelaRuntimeHost } from "@rbxts/vela-runtime";',
	);
	expect(result.code).not.toContain("../__vela__/runtime-host");
});

// The runtime host once implemented a strict subset of the static lowering:
// layout direction, alignment and automatic sizing were dropped, so a component
// whose classes come from a recipe silently lost its layout. These assert the
// dynamic path knows the families at all.
test("resolves layout direction and alignment through the runtime helper", () => {
	const result = transform(
		'<frame className={["flex-row items-center justify-between", wide && "gap-2"]} />',
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("Enum.FillDirection.Horizontal");
	expect(runtimeSource).toContain("Enum.FillDirection.Vertical");
	expect(runtimeSource).toContain("Enum.HorizontalAlignment.Center");
	expect(runtimeSource).toContain("Enum.VerticalAlignment.Center");
	expect(runtimeSource).toContain("Enum.UIFlexAlignment.SpaceBetween");
});

test("resolves automatic sizing through the runtime helper", () => {
	const result = transform(
		'<frame className={["h-9 w-fit", tall && "size-auto"]} />',
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("Enum.AutomaticSize.X");
	expect(runtimeSource).toContain("Enum.AutomaticSize.Y");
	expect(runtimeSource).toContain("Enum.AutomaticSize.XY");
});

test("resolves directional radius utilities through the runtime helper", () => {
	const result = transform("<frame className={recipe} />");

	expect(result.needsRuntimeHost).toBe(true);
	for (const prefix of [
		"rounded-tl-",
		"rounded-tr-",
		"rounded-bl-",
		"rounded-br-",
		"rounded-t-",
		"rounded-r-",
		"rounded-b-",
		"rounded-l-",
	]) {
		expect(runtimeSource).toContain(`"${prefix}"`);
	}
	// The corners a class value leaves open are squared off by the runtime, so
	// what the static path fills in is never emitted twice.
	expect(runtimeSource).toContain("TopLeftRadius");
	expect(runtimeSource).toContain("TopRightRadius");
	expect(runtimeSource).toContain("BottomLeftRadius");
	expect(runtimeSource).toContain("BottomRightRadius");
});

test("rewrites dynamic object-map className through the runtime helper", () => {
	const result = transform(
		'<frame className={{ "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	// Each key names its own classes and its value only decides them, so the
	// values travel as tests and the keys are resolved here.
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*roomy \? true : false,\s*!roomy \? true : false\s*\]\}/,
	);
	expect(
		JSON.parse(result.ir[0]).runtimeRules.map(
			(rule: { condition: unknown }) => rule.condition,
		),
	).toEqual([
		{ kind: "test", index: 0, expected: true },
		{ kind: "test", index: 1, expected: true },
	]);
});

test("rewrites dynamic border className through the runtime helper", () => {
	const result = transform(
		'<frame className={["border", active && "border-blue-600"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("uistroke");
	expect(runtimeSource).toContain("Thickness");
	expect(result.code).toContain("Color3.fromRGB(21, 93, 252)");
	expect(result.code).toContain(
		'import { createVelaRuntimeHost } from "@rbxts/vela-runtime";',
	);
});

test("resolves text colors on the runtime path", () => {
	const result = transform(
		'<textlabel className={["text-slate-100", muted && "text-slate-400"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	// The `text-` branch has to reach TextColor3, not fall through to nothing:
	// a dropped text color leaves the label on Roblox's near-black default,
	// which is invisible on any dark surface.
	expect(runtimeSource).toContain('startsWith(token, "text-")');
	expect(runtimeSource).toMatch(/"TextColor3",\s*"TextTransparency"/);
});

test("resolves size and alignment text utilities on the runtime path", () => {
	const result = transform(
		'<textlabel className={[size, "text-left text-lg"]} />',
	);

	expect(result.needsRuntimeHost).toBe(true);
	// These share the `text-` prefix with colors and are classified ahead of
	// them, exactly as the static path does. Leaving them unresolved put every
	// label on Roblox's 8px default.
	expect(runtimeSource).toContain('propEffect("TextSize"');
	expect(runtimeSource).toContain('propEffect("TextXAlignment"');
	expect(runtimeSource).toContain("Enum.TextXAlignment.Left");
});

// The runtime host implemented a strict subset of the static lowering for a
// long time, and a family missing there is silent: a component whose classes
// come from a recipe simply renders without them. These pin the whole surface.
test("the runtime host knows every utility family the static path lowers", () => {
	transform("<frame className={recipe} />");

	const FAMILY_PREFIXES = [
		"bg-",
		"text-",
		"image-",
		"placeholder-",
		"border-",
		"rounded-",
		"z-",
		"p-",
		"px-",
		"py-",
		"pt-",
		"pr-",
		"pb-",
		"pl-",
		"gap-",
		"m-",
		"mx-",
		"my-",
		"mt-",
		"mr-",
		"mb-",
		"ml-",
		"min-w-",
		"max-w-",
		"min-h-",
		"max-h-",
		"w-",
		"h-",
		"size-",
		"overflow-",
		"rotate-",
		"scale-",
		"opacity-",
		"aspect-",
		"flex-",
		"justify-",
		"items-",
		"from-",
		"via-",
		"to-",
		"top-",
		"left-",
		"right-",
		"bottom-",
		"inset-",
		"origin-",
		"content-",
		"self-",
		"order-",
		"leading-",
		"grid-cols-",
		"grid-rows-",
		"auto-rows-",
		"auto-cols-",
		"basis-",
		"translate-x-",
		"translate-y-",
		"object-",
		"pointer-events-",
		"space-x-",
		"space-y-",
		"whitespace-",
		"overscroll-",
		"scrollbar-",
		"scroll-",
		"canvas-",
		"ring-",
		"outline-",
		"divide-",
		"shadow-",
		"font-",
		"align-",
		"duration-",
		"ease-",
		"delay-",
		"animate-",
	] as const;

	for (const prefix of FAMILY_PREFIXES) {
		expect(runtimeSource).toContain(`"${prefix}"`);
	}

	const RESOLVED_PROPS = [
		"ZIndex",
		"Rotation",
		"Interactable",
		"ClipsDescendants",
		"LayoutOrder",
		"LineHeight",
		"ScaleType",
		"TextYAlignment",
		"ImageColor3",
		"PlaceholderColor3",
		"ElasticBehavior",
		"ScrollingDirection",
		"ScrollBarThickness",
		"ScrollBarImageColor3",
		"AutomaticCanvasSize",
		"GroupTransparency",
		"TextTruncate",
		"AnchorPoint",
		"Visible",
	] as const;

	for (const prop of RESOLVED_PROPS) {
		expect(runtimeSource).toContain(prop);
	}

	const RESOLVED_HELPERS = [
		"uicorner",
		"uipadding",
		"uistroke",
		"uilistlayout",
		"uigridlayout",
		"uiflexitem",
		"uiscale",
		"uiaspectratioconstraint",
		"uisizeconstraint",
		"uigradient",
		"uishadow",
	] as const;

	for (const helper of RESOLVED_HELPERS) {
		expect(runtimeSource).toContain(`"${helper}"`);
	}
});

test("composes the runtime families that only meet at the end", () => {
	transform("<frame className={recipe} />");

	// Position, AnchorPoint, the size constraints, a grid track and the gradient
	// stops are all built from more than one token, so the dynamic path needs
	// the same deferred composition the static `PendingAxes::flush` does.
	expect(runtimeSource).toContain("function applyComposedResolution(");
	expect(runtimeSource).toContain("function applyComposedTransform(");
	expect(runtimeSource).toContain("function applyComposedSizeConstraints(");
	expect(runtimeSource).toContain("function applyComposedGrid(");
	expect(runtimeSource).toContain("function applyComposedGradient(");
	expect(runtimeSource).toContain("MinSize");
	expect(runtimeSource).toContain("MaxSize");
	expect(runtimeSource).toContain("CellSize");
	expect(runtimeSource).toContain("CellPadding");
	expect(runtimeSource).toContain("ColorSequence");
});

test("drops runtime utilities the host element cannot carry", () => {
	transform("<frame className={recipe} />");

	// `TextColor3` on a Frame is a hard Roblox error rather than a no-op, so the
	// dynamic path filters by host tag the way `is_utility_allowed_on_host` does.
	expect(runtimeSource).toContain("function isPropAllowedOnTag(");
	expect(runtimeSource).toContain('tag === "textlabel"');
	expect(runtimeSource).toContain('tag === "imagelabel"');
	expect(runtimeSource).toContain('tag === "scrollingframe"');
	expect(runtimeSource).toContain('tag === "textbox"');
});

test("resolves color opacity modifiers and arbitrary hex on the runtime path", () => {
	transform("<frame className={recipe} />");

	expect(runtimeSource).toContain("function splitColorOpacity(");
	expect(runtimeSource).toContain("function opacityToTransparency(");
	expect(runtimeSource).toContain("function parseArbitraryColor(");
});

test("rewrites dynamic border object maps through the runtime helper", () => {
	const result = transform(
		'<frame className={{ "border-2": thick, "border-transparent": hidden }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("uistroke");
	expect(runtimeSource).toContain("Thickness");
	expect(runtimeSource).toContain("Transparency");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*thick \? true : false,\s*hidden \? true : false\s*\]\}/,
	);
	expect(JSON.parse(result.ir[0]).runtimeRules).toEqual([
		expect.objectContaining({
			condition: { kind: "test", index: 0, expected: true },
			effects: expect.objectContaining({
				helpers: [expect.objectContaining({ tag: "uistroke" })],
			}),
		}),
		expect.objectContaining({
			condition: { kind: "test", index: 1, expected: true },
			effects: expect.objectContaining({
				helpers: [expect.objectContaining({ tag: "uistroke" })],
			}),
		}),
	]);
});

test("rewrites runtime-aware variants through the inline runtime rule path", () => {
	const result = transform(
		'<frame className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("__velaRules");
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain(
		'className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600"',
	);
	expect(runtimeSource).toContain("uistroke");
});

test("rewrites dynamic ClassValue expressions through the runtime wrapper", () => {
	const result = transform(
		'<frame className={["bg-slate-500", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain('import __VelaReact from "@rbxts/react";');
	expect(result.code).toContain("const VelaRuntimeHost =");
	expect(result.code).toContain("<VelaRuntimeHost");
	expect(runtimeSource).toContain("__velaTag");
	expect(runtimeSource).toContain("__velaRules");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).toContain(
		'import { createVelaRuntimeHost } from "@rbxts/vela-runtime";',
	);
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(result.code).not.toContain("RbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("__rbxtsTailwindRules");
	expect(result.code).not.toContain("__rbxtsTailwindTag");
	expect(result.code).not.toContain("__rbxtsTailwindRuntimeHost");
	expect(result.code).not.toContain("rbxts-tailwind");
	expect(result.code).not.toContain("rbxtsTailwind");
	expect(result.code).not.toContain("createTailwindRuntimeHost");
	expect(result.code).not.toContain("TailwindRuntimeHost");
	expect(result.code).not.toContain("@vela-rbxts/types");
	expect(result.code).not.toContain("@vela-rbxts/config");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toContain("unsupported-classname-expression");
	expect(result.ir).toHaveLength(1);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "BackgroundColor3",
					}),
				]),
				helpers: [],
			}),
			runtimeRules: [
				expect.objectContaining({
					condition: { kind: "test", index: 0, expected: true },
				}),
			],
			runtimeClassValue: true,
		}),
	);
});

test("folds a fully static array className without injecting the runtime wrapper", () => {
	const result = transform(
		'<frame className={["bg-slate-500", true && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(runtimeSource).toContain("uicorner");
	expect(result.ir).toHaveLength(1);
	expect(JSON.parse(result.ir[0])).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				props: expect.arrayContaining([
					expect.objectContaining({
						name: "BackgroundColor3",
					}),
				]),
				helpers: expect.arrayContaining([
					expect.objectContaining({
						tag: "uicorner",
					}),
				]),
			}),
			runtimeRules: [],
			runtimeClassValue: false,
		}),
	);
});

test("folds a locally constant identifier before lowering the className", () => {
	const result = transform(
		'const active = true; <frame className={["bg-slate-500", active && "rounded-md"]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(runtimeSource).toContain("uicorner");
});

test("folds a constant object map down to the surviving static key", () => {
	const result = transform(
		'const roomy = false; <frame className={{ "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/PaddingLeft=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
	expect(result.code).toMatch(
		/PaddingRight=\{__VelaRem\.scale\(new UDim\(0, 8\), \d+\)\}/,
	);
});

test("folds a constant ternary to a static utility class", () => {
	const result = transform(
		'const wide = false; <frame className={wide ? "w-80" : "w-40"} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("createVelaRuntimeHost");
	expect(result.code).not.toContain("VelaRuntimeHost");
	expect(result.code).not.toContain("className=");
	expect(result.code).toMatch(
		/Size=\{__VelaRem\.scale\(UDim2\.fromOffset\(160, 0\), \d+\)\}/,
	);
});

test("keeps the runtime wrapper when a dynamic remainder survives constant folding", () => {
	const result = transform(
		'const active = true; <frame className={["bg-slate-500", active && dynamicToken]} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(result.code).toContain("className={dynamicToken}");
	expect(result.code).not.toContain("active && dynamicToken");
	expect(runtimeSource).toContain("BackgroundColor3");
});

test("keeps dynamic object-map className values on the runtime wrapper", () => {
	const result = transform(
		'let roomy = false; <frame className={{ "bg-slate-500": true, "px-4": roomy, "px-2": !roomy }} />',
	);

	expect(result.changed).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("BackgroundColor3");
	expect(result.code).not.toContain("className=");
	expect(result.code).not.toContain('"bg-slate-500": true');
	// The constant key folds into the base; the two undecided ones stay tests.
	expect(result.code).toMatch(
		/__velaTests=\{\[\s*roomy \? true : false,\s*!roomy \? true : false\s*\]\}/,
	);
	expect(JSON.parse(result.ir[0]).base.props).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: "BackgroundColor3" }),
		]),
	);
});

test("keeps variant-prefixed literals on the runtime rule path when they survive folding", () => {
	const enabledResult = transform(
		'const enabled = true; <frame className={["rounded-md", enabled && "md:px-4"]} />',
	);

	expect(enabledResult.changed).toBe(true);
	expect(enabledResult.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("VelaRuntimeHost");
	expect(runtimeSource).toContain("__velaRules");
	expect(enabledResult.code).not.toContain("className=");
	expect(runtimeSource).toContain("uicorner");

	const disabledResult = transform(
		'const enabled = false; <frame className={["rounded-md", enabled && "md:px-4"]} />',
	);

	expect(disabledResult.changed).toBe(true);
	expect(disabledResult.diagnostics).toEqual([]);
	expect(disabledResult.code).not.toContain("createVelaRuntimeHost");
	expect(disabledResult.code).not.toContain("VelaRuntimeHost");
	expect(disabledResult.code).not.toContain("__velaRules");
	expect(disabledResult.code).not.toContain("className=");
	expect(runtimeSource).toContain("uicorner");
});

test("lifts variant-prefixed literal utilities into runtime rules", () => {
	const result = transform(
		'<frame className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600" />',
	);

	expect(result.changed).toBe(true);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.diagnostics).toEqual([]);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain('import __VelaReact from "@rbxts/react";');
	expect(result.code).toContain("const VelaRuntimeHost =");
	expect(result.code).toContain("<VelaRuntimeHost");
	// Intentional regression checks for the removed runtime package import path.
	expect(result.code).not.toContain("../__vela__/runtime-host");
	expect(runtimeSource).toContain("__velaRules");
	expect(result.code).not.toContain(
		'className="rounded-md md:border-2 portrait:w-80 touch:border-blue-600"',
	);
	expect(result.ir).toHaveLength(1);

	const style = JSON.parse(result.ir[0]);
	expect(style).toEqual(
		expect.objectContaining({
			base: expect.objectContaining({
				helpers: expect.arrayContaining([
					expect.objectContaining({
						tag: "uicorner",
					}),
				]),
			}),
			runtimeRules: expect.arrayContaining([
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "width",
						alias: "md",
					}),
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uistroke",
							}),
						]),
					}),
				}),
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "input",
						value: "touch",
					}),
					effects: expect.objectContaining({
						helpers: expect.arrayContaining([
							expect.objectContaining({
								tag: "uistroke",
							}),
						]),
					}),
				}),
				expect.objectContaining({
					condition: expect.objectContaining({
						kind: "orientation",
						value: "portrait",
					}),
					effects: expect.objectContaining({
						props: expect.arrayContaining([
							expect.objectContaining({
								name: "SizeX",
								value: "new UDim(0, 320)",
							}),
						]),
					}),
				}),
			]),
			runtimeClassValue: false,
		}),
	);
});
