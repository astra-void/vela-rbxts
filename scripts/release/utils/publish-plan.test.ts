import { describe, expect, test } from "vitest";

import type { PackedArtifact } from "./artifacts";
import {
	assertPublishPlanCoverage,
	computeOrderedPublishCandidates,
	resolvePublishDecisions,
	type ArtifactPublishCandidate,
} from "./publish-plan";
import type { PackageJson } from "./package-json";

const VERSION = "0.1.0-next.0";

function createArtifact(packageName: string, tarballFileName: string): PackedArtifact {
	return {
		packageName,
		version: VERSION,
		tarballFileName,
		tarballPath: `/tmp/${tarballFileName}`,
		sourceDir: "/tmp/source",
		kind: "workspace",
	};
}

function createCandidate(
	artifact: PackedArtifact,
	manifest: Pick<PackageJson, "dependencies" | "peerDependencies" | "optionalDependencies">,
): ArtifactPublishCandidate {
	return {
		artifact,
		manifest: {
			name: artifact.packageName,
			version: artifact.version,
			...manifest,
		},
	};
}

describe("publish plan artifact-first coverage", () => {
	test("keeps generated compiler and lsp binaries in candidates and ordering", async () => {
		const workspace = createArtifact("@vela-rbxts/config", "vela-rbxts-config.tgz");
		const compilerRoot = createArtifact("@vela-rbxts/compiler", "vela-rbxts-compiler.tgz");
		const compilerBinary = createArtifact(
			"@vela-rbxts/compiler-darwin-arm64",
			"vela-rbxts-compiler-darwin-arm64.tgz",
		);
		const lspRoot = createArtifact("@vela-rbxts/lsp", "vela-rbxts-lsp.tgz");
		const lspBinary = createArtifact(
			"@vela-rbxts/lsp-darwin-arm64",
			"vela-rbxts-lsp-darwin-arm64.tgz",
		);

		const candidates: ArtifactPublishCandidate[] = [
			createCandidate(workspace, {}),
			createCandidate(compilerRoot, {
				optionalDependencies: {
					[compilerBinary.packageName]: VERSION,
				},
			}),
			createCandidate(compilerBinary, {}),
			createCandidate(lspRoot, {
				dependencies: {
					[workspace.packageName]: VERSION,
				},
				peerDependencies: {
					[compilerRoot.packageName]: VERSION,
				},
				optionalDependencies: {
					[lspBinary.packageName]: VERSION,
				},
			}),
			createCandidate(lspBinary, {}),
		];

		const ordered = computeOrderedPublishCandidates(candidates);
		assertPublishPlanCoverage(candidates, ordered);

		const orderedNames = ordered.map((candidate) => candidate.artifact.packageName);
		expect(new Set(orderedNames)).toEqual(
			new Set(candidates.map((candidate) => candidate.artifact.packageName)),
		);
		expect(orderedNames).toContain(compilerBinary.packageName);
		expect(orderedNames).toContain(lspBinary.packageName);
		expect(orderedNames.indexOf(compilerBinary.packageName)).toBeLessThan(
			orderedNames.indexOf(compilerRoot.packageName),
		);
		expect(orderedNames.indexOf(lspBinary.packageName)).toBeLessThan(
			orderedNames.indexOf(lspRoot.packageName),
		);

		const decisions = await resolvePublishDecisions(
			ordered,
			async (packageName, version) =>
				version === VERSION &&
				(packageName === compilerRoot.packageName || packageName === lspRoot.packageName),
		);

		const skipped = decisions
			.filter((decision) => decision.action === "skip")
			.map((decision) => decision.artifact.packageName);
		const publishable = decisions
			.filter((decision) => decision.action === "publish")
			.map((decision) => decision.artifact.packageName);

		expect(skipped).toEqual(expect.arrayContaining([compilerRoot.packageName, lspRoot.packageName]));
		expect(publishable).toEqual(
			expect.arrayContaining([
				workspace.packageName,
				compilerBinary.packageName,
				lspBinary.packageName,
			]),
		);
	});
});
