import { createRequire } from "node:module";

import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const {
	STRICT_VSIX_VERSION_RE,
	nextFreeVsixBuildNumber,
	normalizeMarketplaceVsixVersion,
	resolveDateVsixVersion,
	resolveMarketplaceVsixVersion,
} = require("./vsix-version.cjs") as {
	STRICT_VSIX_VERSION_RE: RegExp;
	nextFreeVsixBuildNumber: (input?: {
		publishedVersions?: readonly string[];
		now?: Date;
	}) => number;
	normalizeMarketplaceVsixVersion: (rawVersion: string) => string;
	resolveDateVsixVersion: (input?: {
		now?: Date;
		buildNumber?: string | number;
	}) => string;
	resolveMarketplaceVsixVersion: (input?: {
		overrideVersion?: string;
		now?: Date;
		buildNumber?: string | number;
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
				overrideVersion: "0.1.1",
			}),
		).toBe("0.1.1");
	});

	test("strips v prefix and normalizes leading zeros from explicit Marketplace override", () => {
		expect(
			resolveMarketplaceVsixVersion({
				overrideVersion: "v2026.04.28001",
			}),
		).toBe("2026.4.28001");
	});

	test("normalizes leading zeros from explicit Marketplace override without v prefix", () => {
		expect(
			resolveMarketplaceVsixVersion({
				overrideVersion: "2026.04.28001",
			}),
		).toBe("2026.4.28001");
	});

	test("rejects invalid Marketplace overrides", () => {
		expect(() =>
			resolveMarketplaceVsixVersion({
				overrideVersion: "0.1.1-next.0",
			}),
		).toThrow(/major\.minor\.patch/);
	});
});

describe("date-based vsix versions", () => {
	const july20 = new Date("2026-07-20T09:30:00Z");

	test("packs the UTC day and build counter into the patch", () => {
		expect(resolveDateVsixVersion({ now: july20 })).toBe("2026.7.20001");
		expect(resolveDateVsixVersion({ now: july20, buildNumber: 2 })).toBe(
			"2026.7.20002",
		);
	});

	test("accepts the build counter as a string, as the environment supplies it", () => {
		expect(resolveDateVsixVersion({ now: july20, buildNumber: "12" })).toBe(
			"2026.7.20012",
		);
	});

	test("keeps single-digit days below the same month's later days", () => {
		const july7 = new Date("2026-07-07T00:00:00Z");
		expect(resolveDateVsixVersion({ now: july7 })).toBe("2026.7.7001");
		expect(
			Number(resolveDateVsixVersion({ now: july7 }).split(".")[2]),
		).toBeLessThan(Number(resolveDateVsixVersion({ now: july20 }).split(".")[2]));
	});

	test("uses UTC rather than the local day", () => {
		expect(resolveDateVsixVersion({ now: new Date("2026-07-20T23:30:00Z") })).toBe(
			"2026.7.20001",
		);
	});

	test("produces a version the Marketplace manifest accepts", () => {
		expect(resolveDateVsixVersion({ now: july20 })).toMatch(
			STRICT_VSIX_VERSION_RE,
		);
	});

	test("is what resolveMarketplaceVsixVersion returns without an override", () => {
		expect(resolveMarketplaceVsixVersion({ now: july20 })).toBe("2026.7.20001");
	});

	test.each(["0", "1000", "-1", "1.5", "abc"])(
		"rejects out-of-range build counter %s",
		(buildNumber) => {
			expect(() => resolveDateVsixVersion({ now: july20, buildNumber })).toThrow(
				/VSIX_BUILD_NUMBER/,
			);
		},
	);
});

describe("next free vsix build number", () => {
	const august2 = new Date("2026-08-02T11:30:00Z");

	test("starts at 1 when nothing is published for the date", () => {
		expect(nextFreeVsixBuildNumber({ publishedVersions: [], now: august2 })).toBe(1);
	});

	test("clears every build already published for the same UTC date", () => {
		expect(
			nextFreeVsixBuildNumber({
				publishedVersions: ["2026.8.2001", "2026.8.2002"],
				now: august2,
			}),
		).toBe(3);
	});

	test("clears a gap rather than filling it, since the Marketplace orders by version", () => {
		expect(
			nextFreeVsixBuildNumber({
				publishedVersions: ["2026.8.2001", "2026.8.2004"],
				now: august2,
			}),
		).toBe(5);
	});

	test("ignores other dates, including the same day in another month", () => {
		expect(
			nextFreeVsixBuildNumber({
				publishedVersions: ["2026.7.31003", "2026.7.2009", "2025.8.2007", "2026.8.1005"],
				now: august2,
			}),
		).toBe(1);
	});

	test("ignores versions that are not date versions", () => {
		expect(
			nextFreeVsixBuildNumber({
				publishedVersions: ["0.1.0", "not-a-version", "2026.8.2001"],
				now: august2,
			}),
		).toBe(2);
	});

	test("round-trips the version it feeds", () => {
		const published = ["2026.8.2001"];
		const buildNumber = nextFreeVsixBuildNumber({ publishedVersions: published, now: august2 });
		expect(resolveDateVsixVersion({ now: august2, buildNumber })).toBe("2026.8.2002");
	});

	test("refuses to wrap past the last build number of the date", () => {
		expect(() =>
			nextFreeVsixBuildNumber({ publishedVersions: ["2026.8.2999"], now: august2 }),
		).toThrow(/build number/);
	});
});
