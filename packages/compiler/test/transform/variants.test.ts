import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { runtimeSource } from "./helpers";

test("lowers hover variants into runtime rules", () => {
	const result = transform(
		`export const A = () => <frame className="bg-slate-700 hover:bg-blue-600 transition" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/"kind": "hover"/);
	expect(runtimeSource).toContain("attachHoverTracking");
	expect(runtimeSource).toContain("MouseEnter");
});

test("narrows the tween to the transition property group", () => {
	const colors = transform(
		`export const A = () => <frame className="bg-slate-700 md:bg-blue-600 transition-colors" />;`,
		null,
	);
	expect(colors.diagnostics).toEqual([]);
	expect(colors.code).toMatch(/"property": "colors"/);
	expect(runtimeSource).toContain("transitionCoversProp");

	const all = transform(
		`export const B = () => <frame className="bg-slate-700 md:bg-blue-600 transition" />;`,
		null,
	);
	expect(all.code).toMatch(/"property": "all"/);

	// A shadow lives on a helper instance, and the runtime tweens the helpers it
	// renders, so the filter has a target to narrow to.
	const shadow = transform(
		`export const C = () => <frame className="shadow-sm md:shadow-lg transition-shadow" />;`,
		null,
	);
	expect(shadow.diagnostics).toEqual([]);
	expect(shadow.code).toMatch(/"property": "shadow"/);
});

test("lowers active and focus variants into runtime rules", () => {
	const pressed = transform(
		`export const A = () => <textbutton className="bg-slate-700 active:bg-blue-600" />;`,
		null,
	);
	expect(pressed.diagnostics).toEqual([]);
	expect(pressed.needsRuntimeHost).toBe(true);
	expect(pressed.code).toMatch(/"kind": "active"/);
	expect(runtimeSource).toContain("attachActiveTracking");
	expect(runtimeSource).toContain("InputBegan");

	const focused = transform(
		`export const B = () => <textbox className="border focus:border-blue-600" />;`,
		null,
	);
	expect(focused.diagnostics).toEqual([]);
	expect(focused.code).toMatch(/"kind": "focus"/);
	expect(runtimeSource).toContain("attachFocusTracking");
	// Text boxes take keyboard focus; everything else reads selection focus.
	expect(runtimeSource).toContain("FocusLost");
	expect(runtimeSource).toContain("SelectionGained");
});

test("lowers the dark variant into a color scheme rule", () => {
	const result = transform(
		`export const A = () => <frame className="bg-white dark:bg-slate-900" />;`,
		null,
	);

	expect(result.diagnostics).toEqual([]);
	expect(result.needsRuntimeHost).toBe(true);
	expect(result.code).toMatch(/"kind": "color-scheme"/);
	expect(result.code).toMatch(/"value": "dark"/);
	// Roblox exposes no color scheme, so the app owns it through an attribute.
	expect(runtimeSource).toContain("VelaColorScheme");
	expect(runtimeSource).toContain("GetAttributeChangedSignal");
});
