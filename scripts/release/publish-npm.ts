import { getFlagValue, parseDryRunFlag, parseReleaseTag } from "./release-config";
import {
	PACK_MANIFEST_PATH,
	readTarballPackageManifest,
	type PackManifest,
	VERIFY_REPORT_PATH,
} from "./utils/artifacts";
import { runCommand } from "./utils/exec";
import { exists, readJsonFile } from "./utils/fs";
import { packageVersionExistsOnNpm, resolveNpmCommand } from "./utils/npm";
import {
	type ArtifactPublishCandidate,
	assertNoDuplicateArtifactCoordinates,
	assertPublishPlanCoverage,
	computeOrderedPublishCandidates,
	formatArtifactCoordinate,
	resolvePublishDecisions,
} from "./utils/publish-plan";

async function main() {
	const rawArgs = process.argv.slice(2);
	const tag = parseReleaseTag(getFlagValue(rawArgs, "--tag"));
	const dryRun = parseDryRunFlag(rawArgs);

	if (!exists(PACK_MANIFEST_PATH)) {
		throw new Error(
			`Missing pack manifest at ${PACK_MANIFEST_PATH}. Run release:pack first.`,
		);
	}
	if (!exists(VERIFY_REPORT_PATH)) {
		throw new Error(
			`Missing verification report at ${VERIFY_REPORT_PATH}. Run release:verify before publishing.`,
		);
	}

	const packManifest = await readJsonFile<PackManifest>(PACK_MANIFEST_PATH);
	assertNoDuplicateArtifactCoordinates(packManifest.artifacts);

	if (packManifest.artifacts.length === 0) {
		throw new Error("Pack manifest has no artifacts to publish.");
	}

	console.log(`Total artifacts in pack manifest: ${packManifest.artifacts.length}`);

	const publishCandidates: ArtifactPublishCandidate[] = [];
	for (const artifact of packManifest.artifacts) {
		const tarManifest = await readTarballPackageManifest(artifact.tarballPath);
		if (tarManifest.name !== artifact.packageName) {
			throw new Error(
				`Tarball package name mismatch for ${artifact.tarballFileName}. Expected ${artifact.packageName}, got ${String(tarManifest.name)}.`,
			);
		}
		if (tarManifest.version !== artifact.version) {
			throw new Error(
				`Tarball package version mismatch for ${artifact.tarballFileName}. Expected ${artifact.version}, got ${String(tarManifest.version)}.`,
			);
		}

		publishCandidates.push({ artifact, manifest: tarManifest });
	}

	const orderedArtifacts = computeOrderedPublishCandidates(publishCandidates);
	assertPublishPlanCoverage(publishCandidates, orderedArtifacts);

	console.log(`Total publish candidates: ${publishCandidates.length}`);

	console.log(`Publish plan (tag=${tag}, dryRun=${dryRun}):`);
	for (const artifact of orderedArtifacts) {
		console.log(
			`- ${artifact.artifact.packageName}@${artifact.artifact.version} -> ${artifact.artifact.tarballPath}`,
		);
	}

	const decisions = await resolvePublishDecisions(
		orderedArtifacts,
		packageVersionExistsOnNpm,
	);

	const npmCommand = resolveNpmCommand();
	const publishedPackages: string[] = [];
	const skippedPackages: string[] = [];
	const failedPackages: string[] = [];

	for (const decision of decisions) {
		const coordinate = formatArtifactCoordinate(decision.artifact);
		if (decision.action === "skip") {
			console.log(`skipped already published ${coordinate}`);
			skippedPackages.push(coordinate);
			continue;
		}

		if (dryRun) {
			console.log(`would publish ${coordinate}`);
			publishedPackages.push(coordinate);
			continue;
		}

		const publishArgs = [
			"publish",
			decision.artifact.tarballPath,
			"--tag",
			tag,
			"--access",
			"public",
		];
		if (process.env.CI) {
			publishArgs.push("--provenance");
		}

		try {
			runCommand(npmCommand, publishArgs);
			console.log(`published ${coordinate}`);
			publishedPackages.push(coordinate);
		} catch (error) {
			failedPackages.push(coordinate);
			const reason = error instanceof Error ? error.message : String(error);
			console.error(`failed ${coordinate}: ${reason}`);
		}
	}

	console.log("Publish summary:");
	console.log(`- published count: ${publishedPackages.length}`);
	console.log(`- skipped already-published count: ${skippedPackages.length}`);
	console.log(`- failed count: ${failedPackages.length}`);
	console.log(`- published packages: ${publishedPackages.length > 0 ? publishedPackages.join(", ") : "(none)"}`);
	console.log(`- skipped packages: ${skippedPackages.length > 0 ? skippedPackages.join(", ") : "(none)"}`);

	if (failedPackages.length > 0) {
		throw new Error(`Failed to publish ${failedPackages.length} packages: ${failedPackages.join(", ")}`);
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:publish:npm failed: ${message}`);
	process.exit(1);
});
