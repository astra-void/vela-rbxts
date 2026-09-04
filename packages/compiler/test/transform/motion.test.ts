import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig, plugin } from "../../../config/src/index";
import { runtimeSource } from "./helpers";

test("attaches a transition config to the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 md:bg-blue-600 transition duration-300 ease-out" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain("__velaTransition={");
	expect(result.code).toMatch(/"time": 0\.3/);
	expect(result.code).toMatch(/"style": "Quad"/);
	expect(result.code).toMatch(/"direction": "Out"/);
});

test("duration alone enables the transition and defaults the easing", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 duration-500" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toContain("__velaTransition={");
	expect(result.code).toMatch(/"time": 0\.5/);
	expect(result.code).toMatch(/"direction": "Out"/);
});

test("transition-none disables the transition", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 transition duration-300 transition-none" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).not.toContain("__velaTransition={");
});

test("warns when transition utilities cannot ever fire", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 transition" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({ code: "transition-without-runtime" }),
	]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaTransition={");
});

test("keeps transitions on dynamic class values in the runtime host", () => {
	const result = transform(
		`export const A = (props: { active: boolean }) => (
			<frame className={["transition duration-300", props.active && "bg-blue-600"]} />
		);`,
		null,
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(runtimeSource).toContain("createVelaRuntimeHost");
	expect(runtimeSource).toContain("TweenService");
});

test("rejects invalid transition values with diagnostics", () => {
	const result = transform(
		`export const A = () => <frame className="md:bg-blue-600 duration-fast ease-bounce transition-weird" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "duration-fast",
		}),
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "ease-bounce",
		}),
		expect.objectContaining({
			code: "unsupported-transition-value",
			token: "transition-weird",
		}),
	]);
});

test("promotes animate presets to the runtime host", () => {
	const result = transform(
		`export const A = () => <frame className="bg-blue-600 animate-spin" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/__velaAnimation=\{"spin"\}/);
	expect(runtimeSource).toContain("startPresetAnimation");
});

test("animate-none cancels an earlier preset", () => {
	const result = transform(
		`export const A = () => <frame className="animate-pulse animate-none" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(false);
	expect(result.code).not.toContain("__velaAnimation=");
});

test("rejects unsupported animate presets", () => {
	const result = transform(
		`export const A = () => <frame className="animate-ping" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			code: "unsupported-animation-value",
			token: "animate-ping",
		}),
	]);
});

test("renders the runtime host through forwardRef for slotting compatibility", () => {
	transform(
		`export const A = () => <frame className="bg-blue-600 animate-spin" />;`,
		null,
	);

	expect(runtimeSource).toMatch(/forwardRef\(\s*\(props: VelaRuntimeHostProps/);
	expect(runtimeSource).toContain("assignForwardedRef");
});

test("warns and strips motion utilities on component elements", () => {
	const animated = transform(
		`export const A = () => <Box className="animate-spin" />;`,
		null,
	);
	expect(animated.diagnostics).toEqual([
		expect.objectContaining({ code: "motion-on-component" }),
	]);
	expect(animated.code).not.toContain("__velaAnimation=");

	const transitioned = transform(
		`export const B = () => <Box className="md:bg-blue-600 transition" />;`,
		null,
	);
	expect(transitioned.diagnostics).toEqual([
		expect.objectContaining({ code: "motion-on-component" }),
	]);
	expect(transitioned.code).not.toContain("__velaTransition={");
	expect(runtimeSource).toContain("__velaRules");
});

test("imports the configured motion driver instead of tweening itself", () => {
	const result = transform(
		'<frame className="bg-slate-700 transition hover:bg-blue-600" />',
		{
			configJson: JSON.stringify(
				defineConfig({
					plugins: [
						plugin(({ setMotionDriver }) =>
							setMotionDriver({
								module: "@rbxts/vela-spring",
								export: "springDriver",
							}),
						),
					],
				}),
			),
		},
	);

	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toContain(
		'import { springDriver as __VelaMotionDriverSource } from "@rbxts/vela-spring";',
	);
	expect(result.code).toContain(", __VelaMotionDriverSource)");
	// The built-in path stays in the module: a driver that only implements one
	// method leaves the other to TweenService.
	expect(runtimeSource).toContain("__VelaTweenService.Create(instance, info");
});

test("a motion driver with no export name is imported as the default", () => {
	const result = transform('<frame className="animate-spin" />', {
		configJson: JSON.stringify(
			defineConfig({
				plugins: { motion: { module: "client/motion" }, utilities: {} },
			}),
		),
	});

	expect(result.code).toContain(
		'import __VelaMotionDriverSource from "client/motion";',
	);
});

test("falls back to the built-in driver when no plugin sets one", () => {
	const result = transform('<frame className="animate-spin" />');

	expect(result.code).toContain("createVelaRuntimeHost(");
	expect(result.code).not.toContain("__VelaMotionDriverSource");
});

// A helper is an instance of its own, so a variant that repaints one is a style
// change the motion system can carry like any other.
test("tweens the helper instances a variant repaints", () => {
	const result = transform(
		`export const A = () => <textbutton className="rounded-md hover:rounded-xl transition duration-200" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"property": "all"/);
	expect(result.code).toMatch(/"time": 0\.2/);
	// The base UICorner joins the rules so the host renders one instance the
	// tween can move, rather than a child beside a resolved helper.
	expect(result.code).toMatch(/"tag": "uicorner"/);
	expect(runtimeSource).toContain("transitionCoversProp");
});

test("narrows a colour transition onto the stroke a border variant repaints", () => {
	const result = transform(
		`export const A = () => <textbutton className="border-2 border-slate-500 hover:border-blue-500 transition-colors" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"property": "colors"/);
	expect(result.code).toMatch(/"tag": "uistroke"/);
});

test("transition-shadow reaches the UIShadow helper", () => {
	const result = transform(
		`export const A = () => <frame className="shadow-sm hover:shadow-lg transition-shadow" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.code).toMatch(/"property": "shadow"/);
	expect(result.code).toMatch(/"tag": "uishadow"/);
});

// The seam a custom driver replaces has to see the helper work too, or a
// project with its own driver silently loses it.
test("the motion driver is told which helper a tween belongs to", () => {
	expect(runtimeSource).toContain("VelaMotionTarget");
	expect(runtimeSource).toContain("helper?: string");
	expect(runtimeSource).toContain("driver.transition(instance, goal, spec,");
});
