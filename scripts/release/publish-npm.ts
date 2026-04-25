import {
	collectReleaseUnits,
	getFlagValue,
	parseDryRunFlag,
	parseReleaseTag,
} from "./release-config";
import {
	PACK_MANIFEST_PATH,
	type PackManifest,
	VERIFY_REPORT_PATH,
} from "./utils/artifacts";
import { runCommand } from "./utils/exec";
import { exists, readJsonFile } from "./utils/fs";
import { packageVersionExistsOnNpm, resolveNpmCommand } from "./utils/npm";
import type { PackageJson } from "./utils/package-json";
import { computeDependencySafeOrder } from "./utils/package-order";

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

	const releaseUnits = await collectReleaseUnits();
	const npmUnitNames = new Set(
		releaseUnits.filter((unit) => unit.publishToNpm).map((unit) => unit.name),
	);
	const packManifest = await readJsonFile<PackManifest>(PACK_MANIFEST_PATH);
	const manifestsByPackage = new Map<string, PackageJson>();
	for (const artifact of packManifest.artifacts) {
		manifestsByPackage.set(artifact.packageName, {
			name: artifact.packageName,
			version: artifact.version,
		});
	}

	const publishableArtifacts = packManifest.artifacts.filter((artifact) =>
		npmUnitNames.has(artifact.packageName),
	);
	const orderedPackageNames = computeDependencySafeOrder(
		manifestsByPackage,
		publishableArtifacts.map((artifact) => artifact.packageName),
	);
	const orderedArtifacts = orderedPackageNames
		.map((packageName) =>
			publishableArtifacts.find(
				(artifact) => artifact.packageName === packageName,
			),
		)
		.filter((artifact): artifact is (typeof publishableArtifacts)[number] =>
			Boolean(artifact),
		);

	console.log(`Publish plan (tag=${tag}, dryRun=${dryRun}):`);
	for (const artifact of orderedArtifacts) {
		console.log(
			`- ${artifact.packageName}@${artifact.version} -> ${artifact.tarballPath}`,
		);
	}

	const npmCommand = resolveNpmCommand();
	for (const artifact of orderedArtifacts) {
		const existsOnNpm = await packageVersionExistsOnNpm(
			artifact.packageName,
			artifact.version,
		);
		if (existsOnNpm) {
			console.log(
				`Skipping ${artifact.packageName}@${artifact.version} (already published).`,
			);
			continue;
		}

		const publishArgs = [
			"publish",
			artifact.tarballPath,
			"--tag",
			tag,
			"--access",
			"public",
		];
		if (dryRun) {
			publishArgs.push("--dry-run");
		}
		if (!dryRun && process.env.CI) {
			publishArgs.push("--provenance");
		}

		runCommand(npmCommand, publishArgs);
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:publish:npm failed: ${message}`);
	process.exit(1);
});
