"use strict";

const MARKETPLACE_VSIX_VERSION_RE =
	/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;
const STRICT_VSIX_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

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

function resolveMarketplaceVsixVersion({
	sourceVersion,
	releaseTag,
	overrideVersion,
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

	const versionSource = String(sourceVersion ?? "").trim() || String(releaseTag ?? "").trim();
	if (!versionSource) {
		throw new Error(
			"Unable to determine VSIX Marketplace version. Provide a package version, RELEASE_TAG, or VSIX_VERSION override.",
		);
	}

	return normalizeMarketplaceVsixVersion(versionSource);
}

module.exports = {
	MARKETPLACE_VSIX_VERSION_RE,
	STRICT_VSIX_VERSION_RE,
	normalizeMarketplaceVsixVersion,
	resolveMarketplaceVsixVersion,
};
