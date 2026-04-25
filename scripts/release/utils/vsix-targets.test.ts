import { createRequire } from "node:module";

import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const {
	SUPPORTED_VSCODE_TARGETS,
	VSCODE_TARGETS,
} = require("../../../packages/vscode-extension/scripts/vsix-targets.cjs") as {
	SUPPORTED_VSCODE_TARGETS: string[];
	VSCODE_TARGETS: Record<string, { lspFolder: string; packageName: string }>;
};

describe("vscode extension target map", () => {
	test("covers all expected VS Code targets", () => {
		expect(new Set(SUPPORTED_VSCODE_TARGETS)).toEqual(
			new Set([
				"win32-x64",
				"darwin-arm64",
				"darwin-x64",
				"linux-x64",
				"linux-arm64",
				"alpine-x64",
			]),
		);
	});

	test("maps windows x64 to msvc binary package", () => {
		expect(VSCODE_TARGETS["win32-x64"]).toEqual({
			lspFolder: "win32-x64-msvc",
			packageName: "@vela-rbxts/lsp-win32-x64-msvc",
		});
	});

	test("contains exactly one binary package per target mapping", () => {
		const packageNames = SUPPORTED_VSCODE_TARGETS.map(
			(target) => VSCODE_TARGETS[target]?.packageName,
		);
		expect(packageNames.every((name) => typeof name === "string")).toBe(true);
		expect(new Set(packageNames).size).toBe(SUPPORTED_VSCODE_TARGETS.length);
	});
});
