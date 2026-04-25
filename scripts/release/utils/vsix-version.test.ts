import { createRequire } from "node:module";

import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const {
	normalizeMarketplaceVsixVersion,
	resolveMarketplaceVsixVersion,
} = require("./vsix-version.cjs") as {
	normalizeMarketplaceVsixVersion: (rawVersion: string) => string;
	resolveMarketplaceVsixVersion: (input?: {
		sourceVersion?: string;
		releaseTag?: string;
		overrideVersion?: string;
	}) => string;
};

describe("marketplace vsix version normalization", () => {
	test.each([
		["0.1.0", "0.1.0"],
		["v0.1.0", "0.1.0"],
		["0.1.0-next.0", "0.1.0"],
		["v0.1.0-next.0", "0.1.0"],
		["0.1.0-beta.3", "0.1.0"],
	])("normalizes %s to %s", (rawVersion, expectedVersion) => {
		expect(normalizeMarketplaceVsixVersion(rawVersion)).toBe(expectedVersion);
	});

	test.each(["0.1", "foo", "v0.1.0+build.1"])(
		"rejects invalid VSIX version source %s",
		(rawVersion) => {
			expect(() => normalizeMarketplaceVsixVersion(rawVersion)).toThrow(
				/major\.minor\.patch/,
			);
		},
	);

	test("uses the explicit Marketplace override without normalizing prerelease suffixes", () => {
		expect(
			resolveMarketplaceVsixVersion({
				sourceVersion: "0.1.0-next.0",
				overrideVersion: "0.1.1",
			}),
		).toBe("0.1.1");
	});

	test("falls back to RELEASE_TAG when no source version is available", () => {
		expect(
			resolveMarketplaceVsixVersion({
				releaseTag: "v0.1.0-next.0",
			}),
		).toBe("0.1.0");
	});

	test("rejects invalid Marketplace overrides", () => {
		expect(() =>
			resolveMarketplaceVsixVersion({
				sourceVersion: "0.1.0-next.0",
				overrideVersion: "0.1.1-next.0",
			}),
		).toThrow(/major\.minor\.patch/);
	});
});
