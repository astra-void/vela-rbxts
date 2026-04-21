import { expect, expectTypeOf, test } from "vitest";

import {
	implementationKind,
	transform,
} from "@rbxts-tailwind/compiler";

test("transforms frame className literal into props and helper children", () => {
	const source = '<frame className="rounded-md px-4 bg-surface" />';
	const result = transform(source);

	expect(result.changed).toBe(true);
	expect(result.diagnostics.length).toBe(0);
	expect(result.code.includes("className=")).toBe(false);
	expect(result.code).toMatch(
		/BackgroundColor3=\{Color3\.fromRGB\(40, 48, 66\)\}/,
	);
	expect(result.code).toMatch(
		/<uicorner\b[^>]*CornerRadius=\{new UDim\(0, 8\)\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uipadding\b[^>]*PaddingLeft=\{new UDim\(0, 12\)\}[^>]*PaddingRight=\{new UDim\(0, 12\)\}[^>]*\/>/i,
	);
	expect(result.code).not.toContain("theme.");
});

test("keeps the public transform options compiler-centric", () => {
	expectTypeOf<Parameters<typeof transform>[1]>().toEqualTypeOf<
		| {
		configJson?: string;
	}
		| null
		| undefined
	>();
});

test("loads the native compiler binding", () => {
	expect(implementationKind()).toBe("native");
});
