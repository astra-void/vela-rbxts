import type { PackedArtifact } from "./artifacts";
import type { PackageJson } from "./package-json";
import { computeDependencySafeOrder } from "./package-order";

export type ArtifactPublishCandidate = {
	artifact: PackedArtifact;
	manifest: PackageJson;
};

export type ArtifactPublishDecision = {
	artifact: PackedArtifact;
	action: "publish" | "skip";
};

export function formatArtifactCoordinate(artifact: Pick<PackedArtifact, "packageName" | "version">) {
	return `${artifact.packageName}@${artifact.version}`;
}

export function assertNoDuplicateArtifactCoordinates(
	artifacts: readonly Pick<PackedArtifact, "packageName" | "version">[],
) {
	const seenPackageNames = new Set<string>();
	const seenCoordinates = new Set<string>();

	for (const artifact of artifacts) {
		const coordinate = formatArtifactCoordinate(artifact);
		if (seenPackageNames.has(artifact.packageName)) {
			throw new Error(
				`Duplicate package name in pack manifest: ${artifact.packageName}. Expected exactly one tarball per package.`,
			);
		}
		if (seenCoordinates.has(coordinate)) {
			throw new Error(
				`Duplicate package/version in pack manifest: ${coordinate}. Expected each package version exactly once.`,
			);
		}

		seenPackageNames.add(artifact.packageName);
		seenCoordinates.add(coordinate);
	}
}

export function computeOrderedPublishCandidates(
	candidates: readonly ArtifactPublishCandidate[],
) {
	assertNoDuplicateArtifactCoordinates(candidates.map((candidate) => candidate.artifact));

	const manifestsByPackage = new Map<string, PackageJson>();
	for (const candidate of candidates) {
		manifestsByPackage.set(candidate.artifact.packageName, candidate.manifest);
	}

	const orderedPackageNames = computeDependencySafeOrder(
		manifestsByPackage,
		candidates.map((candidate) => candidate.artifact.packageName),
	);
	const candidatesByPackage = new Map(
		candidates.map((candidate) => [candidate.artifact.packageName, candidate]),
	);

	return orderedPackageNames.map((packageName) => {
		const candidate = candidatesByPackage.get(packageName);
		if (!candidate) {
			throw new Error(
				`Publish plan references unknown package ${packageName}.`,
			);
		}
		return candidate;
	});
}

export function assertPublishPlanCoverage(
	sourceCandidates: readonly ArtifactPublishCandidate[],
	orderedCandidates: readonly ArtifactPublishCandidate[],
) {
	const sourceCoordinates = sourceCandidates.map((candidate) =>
		formatArtifactCoordinate(candidate.artifact),
	);
	const sourceSet = new Set(sourceCoordinates);
	const orderedCounts = new Map<string, number>();

	for (const candidate of orderedCandidates) {
		const coordinate = formatArtifactCoordinate(candidate.artifact);
		orderedCounts.set(coordinate, (orderedCounts.get(coordinate) ?? 0) + 1);
	}

	const missing = [...sourceSet].filter((coordinate) => !orderedCounts.has(coordinate));
	const duplicates = [...orderedCounts.entries()]
		.filter(([, count]) => count > 1)
		.map(([coordinate]) => coordinate);
	const unexpected = [...orderedCounts.keys()].filter(
		(coordinate) => !sourceSet.has(coordinate),
	);

	if (missing.length > 0 || duplicates.length > 0 || unexpected.length > 0) {
		throw new Error(
			[
				"Invalid publish plan coverage.",
				missing.length > 0
					? `Missing from plan: ${missing.join(", ")}`
					: undefined,
				duplicates.length > 0
					? `Duplicate entries in plan: ${duplicates.join(", ")}`
					: undefined,
				unexpected.length > 0
					? `Unexpected plan entries: ${unexpected.join(", ")}`
					: undefined,
			]
				.filter(Boolean)
				.join(" "),
		);
	}
}

export async function resolvePublishDecisions(
	orderedCandidates: readonly ArtifactPublishCandidate[],
	doesVersionExist: (packageName: string, version: string) => Promise<boolean>,
): Promise<ArtifactPublishDecision[]> {
	const decisions: ArtifactPublishDecision[] = [];

	for (const candidate of orderedCandidates) {
		const existsOnNpm = await doesVersionExist(
			candidate.artifact.packageName,
			candidate.artifact.version,
		);
		decisions.push({
			artifact: candidate.artifact,
			action: existsOnNpm ? "skip" : "publish",
		});
	}

	return decisions;
}
