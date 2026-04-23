import { expect, test } from "vitest";

import * as core from "../dist/index.js";

test("declares compiler as the semantic owner", () => {
	expect(core.semanticOwnership).toEqual({
		ownerPackage: "@vela-rbxts/compiler",
		runtime: "rust-swc-napi",
		notes:
			"This package defines semantic contracts only. Utility tokenization/resolution is compiler-owned.",
	});
});

test("keeps the shared supported host surface explicit", () => {
	expect(core.SUPPORTED_HOST_ELEMENT_TAGS).toEqual([
		"frame",
		"scrollingframe",
		"canvasgroup",
		"textlabel",
		"textbutton",
		"textbox",
		"imagelabel",
		"imagebutton",
	]);
});

test("does not expose a duplicate executable resolver API", () => {
	expect("tokenizeClassName" in core).toBe(false);
	expect("resolveClassTokens" in core).toBe(false);
});
