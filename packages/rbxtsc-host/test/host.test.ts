import { transform } from "@rbxts-tailwind/compiler";
import { beforeEach, expect, test, vi } from "vitest";
import {
	createRbxtscTransformerBridge,
	isTransformableHostFile,
	transformSourceForHost,
} from "../src/index";

vi.mock("@rbxts-tailwind/compiler", () => ({
	transform: vi.fn(() => ({
		code: "<frame BackgroundColor3={theme.colors.surface} />",
		diagnostics: [
			{
				level: "warning",
				code: "unknown-utility",
				message: "Unknown utility class",
				token: "bg-missing",
			},
		],
		changed: true,
	})),
}));

const sourceFile = {
	fileName: "src/client/App.tsx",
	sourceText: '<frame className="rounded-md px-4 bg-surface" />',
};

beforeEach(() => {
	vi.clearAllMocks();
});

test("treats a TSX file with className JSX as transformable", () => {
	expect(isTransformableHostFile(sourceFile)).toBe(true);
});

test("skips non-TSX and irrelevant files", () => {
	expect(
		isTransformableHostFile({
			fileName: "src/client/App.ts",
			sourceText: sourceFile.sourceText,
		}),
	).toBe(false);
	expect(
		isTransformableHostFile({
			fileName: "src/client/Plain.tsx",
			sourceText: "export const value = 1;",
		}),
	).toBe(false);
});

test("returns a skipped result without invoking the compiler", () => {
	const result = transformSourceForHost({
		fileName: "src/client/Plain.tsx",
		sourceText: "export const value = 1;",
	});

	expect(transform).not.toHaveBeenCalled();
	expect(result).toEqual(
		expect.objectContaining({
			sourceText: "export const value = 1;",
			changed: false,
			skipped: true,
			eligibility: {
				eligible: false,
				reason: "missing-class-name",
			},
		}),
	);
});

test("calls the compiler and returns transformed host source", () => {
	const result = transformSourceForHost(sourceFile);

	expect(transform).toHaveBeenCalledTimes(1);
	expect(transform).toHaveBeenCalledWith(sourceFile.sourceText, undefined);
	expect(result.skipped).toBe(false);
	expect(result.changed).toBe(true);
	expect(result.sourceText).toBe(
		"<frame BackgroundColor3={theme.colors.surface} />",
	);
});

test("carries compiler diagnostics through the host diagnostic boundary", () => {
	const result = transformSourceForHost(sourceFile);

	expect(result.diagnostics).toEqual([
		expect.objectContaining({
			source: "compiler",
			level: "warning",
			code: "unknown-utility",
			message: "Unknown utility class",
			token: "bg-missing",
			compilerDiagnostic: expect.objectContaining({
				code: "unknown-utility",
			}),
		}),
	]);
});

test("bridge exposes selection and transform entrypoints", () => {
	const bridge = createRbxtscTransformerBridge();

	expect(bridge.name).toBe("@rbxts-tailwind/rbxtsc-host");
	expect(bridge.shouldTransformFile(sourceFile)).toBe(true);
	expect(bridge.getFileEligibility(sourceFile)).toEqual({
		eligible: true,
		reason: "eligible",
	});
	expect(bridge.transformFile(sourceFile).sourceText).toContain(
		"BackgroundColor3",
	);
});

test("does not expose semantic utility resolution functions from the host", async () => {
	const hostExports = await import("../src/index");

	expect(hostExports).not.toHaveProperty("resolveUtility");
	expect(hostExports).not.toHaveProperty("resolveClassName");
	expect(hostExports).not.toHaveProperty("lowerClassName");
	expect(hostExports).not.toHaveProperty("parseClassName");
});
