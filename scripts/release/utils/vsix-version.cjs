"use strict";

const MARKETPLACE_VSIX_VERSION_RE =
	/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const STRICT_VSIX_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const MIN_VSIX_BUILD_NUMBER = 1;
const MAX_VSIX_BUILD_NUMBER = 999;

function normalizeMarketplaceVsixVersion(rawVersion) {
	const normalized = String(rawVersion ?? "").trim().replace(/^v/, "");
	const match = normalized.match(MARKETPLACE_VSIX_VERSION_RE);

	if (!match) {
		throw new Error(
			`Invalid VSIX version source "${String(rawVersion)}". VS Code Marketplace requires major.minor.patch in the packaged extension manifest.`,
		);
	}

	const version = `${parseInt(match[1], 10)}.${parseInt(match[2], 10)}.${parseInt(match[3], 10)}`;
	if (!STRICT_VSIX_VERSION_RE.test(version)) {
		throw new Error(
			`Invalid VSIX version source "${String(rawVersion)}". VS Code Marketplace requires major.minor.patch in the packaged extension manifest.`,
		);
	}

	return version;
}

function parseVsixBuildNumber(rawBuildNumber) {
	const normalized = String(rawBuildNumber ?? "").trim();
	if (!normalized) {
		return MIN_VSIX_BUILD_NUMBER;
	}

	if (!/^\d+$/.test(normalized)) {
		throw new Error(
			`Invalid VSIX_BUILD_NUMBER "${String(rawBuildNumber)}". Expected an integer between ${MIN_VSIX_BUILD_NUMBER} and ${MAX_VSIX_BUILD_NUMBER}.`,
		);
	}

	const buildNumber = parseInt(normalized, 10);
	if (buildNumber < MIN_VSIX_BUILD_NUMBER || buildNumber > MAX_VSIX_BUILD_NUMBER) {
		throw new Error(
			`Invalid VSIX_BUILD_NUMBER "${String(rawBuildNumber)}". Expected an integer between ${MIN_VSIX_BUILD_NUMBER} and ${MAX_VSIX_BUILD_NUMBER}.`,
		);
	}

	return buildNumber;
}

// `YYYY.M.DDNNN`, where the patch packs the UTC day with a same-day build
// counter. UTC keeps a release reproducible regardless of who triggers it.
function resolveDateVsixVersion({ now, buildNumber } = {}) {
	const timestamp = now instanceof Date ? now : new Date();
	if (Number.isNaN(timestamp.getTime())) {
		throw new Error("Unable to determine the VSIX release date.");
	}

	const resolvedBuildNumber = parseVsixBuildNumber(buildNumber);
	const patch =
		timestamp.getUTCDate() * (MAX_VSIX_BUILD_NUMBER + 1) + resolvedBuildNumber;

	return `${timestamp.getUTCFullYear()}.${timestamp.getUTCMonth() + 1}.${patch}`;
}

function parseDateVsixVersion(rawVersion) {
	const match = String(rawVersion ?? "").trim().match(STRICT_VSIX_VERSION_RE);
	if (!match) {
		return undefined;
	}

	const patch = parseInt(match[3], 10);
	const day = Math.floor(patch / (MAX_VSIX_BUILD_NUMBER + 1));
	const buildNumber = patch % (MAX_VSIX_BUILD_NUMBER + 1);
	if (day < 1 || day > 31 || buildNumber < MIN_VSIX_BUILD_NUMBER) {
		return undefined;
	}

	return {
		year: parseInt(match[1], 10),
		month: parseInt(match[2], 10),
		day,
		buildNumber,
	};
}

// Marketplace versions can never be reused, so the counter has to start above
// every build already published for the same UTC date — including ones this
// repository never produced.
function nextFreeVsixBuildNumber({ publishedVersions, now } = {}) {
	const timestamp = now instanceof Date ? now : new Date();
	if (Number.isNaN(timestamp.getTime())) {
		throw new Error("Unable to determine the VSIX release date.");
	}

	let highest = 0;
	for (const publishedVersion of publishedVersions ?? []) {
		const parsed = parseDateVsixVersion(publishedVersion);
		if (
			parsed &&
			parsed.year === timestamp.getUTCFullYear() &&
			parsed.month === timestamp.getUTCMonth() + 1 &&
			parsed.day === timestamp.getUTCDate() &&
			parsed.buildNumber > highest
		) {
			highest = parsed.buildNumber;
		}
	}

	const buildNumber = highest + 1;
	if (buildNumber > MAX_VSIX_BUILD_NUMBER) {
		throw new Error(
			`No VSIX build number is left for this UTC date; ${MAX_VSIX_BUILD_NUMBER} are already published.`,
		);
	}

	return buildNumber;
}

function resolveMarketplaceVsixVersion({
	overrideVersion,
	now,
	buildNumber,
} = {}) {
	const explicitVersion = String(overrideVersion ?? "").trim().replace(/^v/, "");
	if (explicitVersion) {
		const match = explicitVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
		if (!match) {
			throw new Error(
				`Invalid VSIX_VERSION "${overrideVersion}". VS Code Marketplace requires major.minor.patch in the packaged extension manifest.`,
			);
		}

		return `${parseInt(match[1], 10)}.${parseInt(match[2], 10)}.${parseInt(match[3], 10)}`;
	}

	return resolveDateVsixVersion({ now, buildNumber });
}

module.exports = {
	MARKETPLACE_VSIX_VERSION_RE,
	MAX_VSIX_BUILD_NUMBER,
	MIN_VSIX_BUILD_NUMBER,
	STRICT_VSIX_VERSION_RE,
	nextFreeVsixBuildNumber,
	normalizeMarketplaceVsixVersion,
	parseDateVsixVersion,
	parseVsixBuildNumber,
	resolveDateVsixVersion,
	resolveMarketplaceVsixVersion,
};
