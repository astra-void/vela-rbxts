import { transform } from "@vela-rbxts/compiler";
import { expect, test } from "vitest";
import { defineConfig } from "../../../config/src/index";
import { hostConfig, runtimeSource, withoutPreflight } from "./helpers";

const width = (ir: string) =>
	JSON.parse(ir).runtimeRules.map(
		(rule: { condition: unknown }) => rule.condition,
	);

test("lowers the default breakpoint scale, xl and 2xl included", () => {
	for (const [alias, minWidth] of [
		["sm", 640],
		["md", 768],
		["lg", 1024],
		["xl", 1280],
		["2xl", 1536],
	] as const) {
		const result = transform(
			`export const A = () => <frame className="${alias}:px-4" />;`,
			withoutPreflight,
		);

		expect(result.diagnostics).toEqual([]);
		expect(width(result.ir[0])).toEqual([{ kind: "width", alias, minWidth }]);
	}
});

// `min` is inclusive and `max` is not, so the pair covers every viewport once.
test("a max-width variant is the exact complement of its min-width twin", () => {
	const result = transform(
		`export const A = () => <frame className="max-md:hidden" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(width(result.ir[0])).toEqual([
		{ kind: "width", alias: "max-md", minWidth: 0, maxWidth: 768 },
	]);
	// The runtime compares the upper bound strictly, which is what makes the
	// boundary land in exactly one of the two.
	expect(runtimeSource).toContain("environment.width < condition.maxWidth");
});

test("chains a min-width and a max-width into one range", () => {
	const result = transform(
		`export const A = () => <frame className="md:max-lg:flex" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics).toEqual([]);
	expect(width(result.ir[0])).toEqual([
		{
			kind: "all",
			conditions: [
				{ kind: "width", alias: "md", minWidth: 768 },
				{ kind: "width", alias: "max-lg", minWidth: 0, maxWidth: 1024 },
			],
		},
	]);
});

test("reports a range no viewport can satisfy", () => {
	const result = transform(
		`export const A = () => <frame className="md:max-sm:px-4" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics.map((entry) => entry.code)).toEqual([
		"invalid-breakpoint-range",
	]);
	expect(result.diagnostics[0]?.message).toContain("768px");
	expect(result.diagnostics[0]?.message).toContain("640px");
});

test("reports an unknown breakpoint apart from an unknown variant", () => {
	const result = transform(
		`export const A = () => <frame className="max-nope:px-4" />;`,
		withoutPreflight,
	);

	expect(result.diagnostics.map((entry) => entry.code)).toEqual([
		"unknown-breakpoint",
	]);
	expect(result.diagnostics[0]?.message).toContain("theme.screens");
});

test("resolves breakpoints a project configured", () => {
	const options = {
		configJson: JSON.stringify(
			defineConfig({
				preflight: false,
				theme: { screens: { phone: 480, tablet: 768, desktop: 1280 } },
			}),
		),
	};

	const min = transform(
		`export const A = () => <frame className="tablet:flex desktop:w-96" />;`,
		options,
	);
	expect(min.diagnostics).toEqual([]);
	expect(width(min.ir[0])).toEqual([
		{ kind: "width", alias: "tablet", minWidth: 768 },
		{ kind: "width", alias: "desktop", minWidth: 1280 },
	]);

	const max = transform(
		`export const B = () => <frame className="max-tablet:hidden" />;`,
		options,
	);
	expect(max.diagnostics).toEqual([]);
	expect(width(max.ir[0])).toEqual([
		{ kind: "width", alias: "max-tablet", minWidth: 0, maxWidth: 768 },
	]);

	// A replaced scale drops the built-in names with it.
	const dropped = transform(
		`export const C = () => <frame className="md:px-4" />;`,
		options,
	);
	expect(dropped.diagnostics.map((entry) => entry.code)).toEqual([
		"unknown-variant",
	]);
});

// The runtime carries the default scale, so only a project that changed it
// sends anything, and one that replaced it says so.
test("a configured screen scale travels as the difference from the defaults", () => {
	const extended = transform("<frame className={cls} />", {
		configJson: JSON.stringify(
			defineConfig({ theme: { extend: { screens: { tablet: 900 } } } }),
		),
	});
	expect(hostConfig(extended.code).theme.screens).toEqual({ tablet: 900 });
	expect(hostConfig(extended.code).theme.replaced).toBeUndefined();

	const replaced = transform("<frame className={cls} />", {
		configJson: JSON.stringify(
			defineConfig({ theme: { screens: { phone: 480 } } }),
		),
	});
	expect(hostConfig(replaced.code).theme.screens).toEqual({ phone: 480 });
	expect(hostConfig(replaced.code).theme.replaced).toContain("screens");
});
