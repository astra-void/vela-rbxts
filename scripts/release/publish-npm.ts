import { collectReleaseUnits, getFlagValue, parseDryRunFlag, parseReleaseTag, WORKSPACE_PUBLISH_PRIORITY } from "./release-config";
import {
	PACK_MANIFEST_PATH,
	type PackManifest,
	VERIFY_REPORT_PATH,
} from "./utils/artifacts";
import { runCommand } from "./utils/exec";
import { exists, readJsonFile } from "./utils/fs";
import { packageVersionExistsOnNpm, resolveNpmCommand } from "./utils/npm";
import { type PackageJson } from "./utils/package-json";

function sortByPriority(packageName: string, otherName: string) {
	const leftPriority = WORKSPACE_PUBLISH_PRIORITY.indexOf(packageName as (typeof WORKSPACE_PUBLISH_PRIORITY)[number]);
	const rightPriority = WORKSPACE_PUBLISH_PRIORITY.indexOf(otherName as (typeof WORKSPACE_PUBLISH_PRIORITY)[number]);
	const left = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
	const right = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
	if (left !== right) {
		return left - right;
	}
	return packageName.localeCompare(otherName);
}

function computeDependencySafeOrder(
	manifests: Map<string, PackageJson>,
	packageNames: readonly string[],
) {
	const nodes = new Set(packageNames);
	const incoming = new Map<string, Set<string>>();
	const outgoing = new Map<string, Set<string>>();

	for (const node of nodes) {
		incoming.set(node, new Set());
		outgoing.set(node, new Set());
	}

	for (const node of nodes) {
		const manifest = manifests.get(node);
		if (!manifest) {
			continue;
		}

		const deps = {
			...(manifest.dependencies ?? {}),
			...(manifest.optionalDependencies ?? {}),
		};

		for (const depName of Object.keys(deps)) {
			if (!nodes.has(depName)) {
				continue;
			}
			incoming.get(node)?.add(depName);
			outgoing.get(depName)?.add(node);
		}
	}

	const queue = [...nodes]
		.filter((node) => (incoming.get(node)?.size ?? 0) === 0)
		.sort(sortByPriority);
	const ordered: string[] = [];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			continue;
		}
		ordered.push(current);
		for (const dependent of outgoing.get(current) ?? []) {
			const dependentIncoming = incoming.get(dependent);
			if (!dependentIncoming) {
				continue;
			}
			dependentIncoming.delete(current);
			if (dependentIncoming.size === 0) {
				queue.push(dependent);
				queue.sort(sortByPriority);
			}
		}
	}

	if (ordered.length !== nodes.size) {
		throw new Error("Failed to derive dependency-safe publish order (cycle detected).");
	}

	return ordered;
}

async function main() {
	const rawArgs = process.argv.slice(2);
	const tag = parseReleaseTag(getFlagValue(rawArgs, "--tag"));
	const dryRun = parseDryRunFlag(rawArgs);

	if (!exists(PACK_MANIFEST_PATH)) {
		throw new Error(`Missing pack manifest at ${PACK_MANIFEST_PATH}. Run release:pack first.`);
	}
	if (!exists(VERIFY_REPORT_PATH)) {
		throw new Error(
			`Missing verification report at ${VERIFY_REPORT_PATH}. Run release:verify before publishing.`,
		);
	}

	const releaseUnits = await collectReleaseUnits();
	const npmUnitNames = new Set(releaseUnits.filter((unit) => unit.publishToNpm).map((unit) => unit.name));
	const packManifest = await readJsonFile<PackManifest>(PACK_MANIFEST_PATH);
	const manifestsByPackage = new Map<string, PackageJson>();
	for (const artifact of packManifest.artifacts) {
		manifestsByPackage.set(artifact.packageName, {
			name: artifact.packageName,
			version: artifact.version,
		});
	}

	const publishableArtifacts = packManifest.artifacts.filter((artifact) => npmUnitNames.has(artifact.packageName));
	const orderedPackageNames = computeDependencySafeOrder(
		manifestsByPackage,
		publishableArtifacts.map((artifact) => artifact.packageName),
	);
	const orderedArtifacts = orderedPackageNames
		.map((packageName) => publishableArtifacts.find((artifact) => artifact.packageName === packageName))
		.filter((artifact): artifact is (typeof publishableArtifacts)[number] => Boolean(artifact));

	console.log(`Publish plan (tag=${tag}, dryRun=${dryRun}):`);
	for (const artifact of orderedArtifacts) {
		console.log(`- ${artifact.packageName}@${artifact.version} -> ${artifact.tarballPath}`);
	}

	const npmCommand = resolveNpmCommand();
	for (const artifact of orderedArtifacts) {
		const existsOnNpm = await packageVersionExistsOnNpm(artifact.packageName, artifact.version);
		if (existsOnNpm) {
			console.log(`Skipping ${artifact.packageName}@${artifact.version} (already published).`);
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
