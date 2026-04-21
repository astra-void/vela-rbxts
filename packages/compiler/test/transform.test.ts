import { expect, expectTypeOf, test } from "vitest";

import {
	implementationKind,
	transform,
} from "../index.js";

test("transforms frame className literal into props and helper children", () => {
	const source = '<frame className="rounded-md px-4 bg-surface" />';
	const result = transform(source);

	expect(result.changed).toBe(true);
	expect(result.diagnostics.length).toBe(0);
	expect(result.code.includes("className=")).toBe(false);
	expect(result.code).toMatch(/BackgroundColor3=\{theme\.colors\.surface\}/);
	expect(result.code).toMatch(
		/<uicorner\b[^>]*CornerRadius=\{theme\.radius\.md\}[^>]*\/>/i,
	);
	expect(result.code).toMatch(
		/<uipadding\b[^>]*PaddingLeft=\{theme\.spacing\[4\]\}[^>]*PaddingRight=\{theme\.spacing\[4\]\}[^>]*\/>/i,
	);
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
