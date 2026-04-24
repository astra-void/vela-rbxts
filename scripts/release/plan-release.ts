import {
	collectReleaseUnits,
	getFlagValue,
	parseDryRunFlag,
	parseReleaseTag,
} from "./release-config";

function parseArgs(rawArgs: readonly string[]) {
	const tag = parseReleaseTag(getFlagValue(rawArgs, "--tag"));
	const releaseTag = getFlagValue(rawArgs, "--release-tag")?.trim();
	if (releaseTag && !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(releaseTag)) {
		throw new Error(
			`Invalid --release-tag "${releaseTag}". Expected format: vX.Y.Z or vX.Y.Z-prerelease.`,
		);
	}
	const dryRun = parseDryRunFlag(rawArgs);
	return { tag, dryRun, releaseTag };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const releaseUnits = await collectReleaseUnits();

	for (const unit of releaseUnits) {
		if (!unit.name || !unit.version) {
			throw new Error(`Missing package name/version in ${unit.path}.`);
		}
	}

	if (args.releaseTag) {
		const expectedVersion = args.releaseTag.slice(1);
		const versionMismatches = releaseUnits.filter((unit) => {
			if (unit.publishToNpm) {
				return unit.version !== expectedVersion;
			}

			// Keep VS Code extension aligned with the release tag as well.
			if (unit.kind === "vscode-extension") {
				return unit.version !== expectedVersion;
			}

			return false;
		});

		if (versionMismatches.length > 0) {
			const details = versionMismatches
				.map(
					(unit) =>
						`${unit.name} at ${unit.path} has ${unit.version}, expected ${expectedVersion}`,
				)
				.join("\n");
			throw new Error(
				`Release tag/version mismatch for --release-tag ${args.releaseTag}.\n${details}`,
			);
		}
	} else {
		console.warn(
			"Warning: --release-tag was not provided; release tag/version consistency check was skipped.",
		);
	}

	console.log(
		`Release plan (tag=${args.tag}, dryRun=${args.dryRun}, releaseTag=${args.releaseTag ?? "<none>"})`,
	);
	console.log("-".repeat(90));
	for (const unit of releaseUnits) {
		console.log(
			`${unit.name}\t${unit.version}\t${unit.path}\t${unit.kind}${
				unit.publishToNpm ? "" : " (non-npm)"
			}`,
		);
	}
	console.log("-".repeat(90));
	console.log(`Total release units: ${releaseUnits.length}`);
	console.log(
		`NPM publish units: ${releaseUnits.filter((unit) => unit.publishToNpm).length}`,
	);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`release:plan failed: ${message}`);
	process.exit(1);
});
