import { expect, test } from "vitest";

import * as core from "../dist/index.js";

test("declares compiler as the semantic owner", () => {
	expect(core.semanticOwnership).toEqual({
		ownerPackage: "@rbxts-tailwind/compiler",
		runtime: "rust-swc-napi",
		notes:
			"This package defines semantic contracts only. Utility tokenization/resolution is compiler-owned.",
	});
});

test("does not expose a duplicate executable resolver API", () => {
	expect("tokenizeClassName" in core).toBe(false);
	expect("resolveClassTokens" in core).toBe(false);
});
