import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type Variant = "with-vela" | "without-vela";

type RojoNode = { $path?: string; [child: string]: unknown };

const REPO_ROOT = path.resolve(__dirname, "../..");
const BENCH_TSCONFIG = "tsconfig.rbxtsc-build.json";

function flag(name: string, fallback: string): string {
	const args = process.argv.slice(2);
	const index = args.indexOf(`--${name}`);

	return index >= 0 && args[index + 1] !== undefined
		? args[index + 1]
		: fallback;
}

/// The bench builds elsewhere, so Rojo paths go absolute and the client folder follows its outDir.
function rewriteRojoTree(
	node: RojoNode,
	projectDir: string,
	outDir: string,
): RojoNode {
	const rewritten: RojoNode = {};

	for (const [key, value] of Object.entries(node)) {
		if (key === "$path" && typeof value === "string") {
			rewritten.$path = value.startsWith("out")
				? path.join(outDir, path.relative("out", value))
				: path.resolve(projectDir, value);
		} else if (value !== null && typeof value === "object") {
			rewritten[key] = rewriteRojoTree(value as RojoNode, projectDir, outDir);
		} else {
			rewritten[key] = value;
		}
	}

	return rewritten;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

function main() {
	const harness = flag("harness", "rbxts-harness");
	const runs = Number(flag("runs", "5"));
	const harnessDir = path.join(REPO_ROOT, "apps", harness);
	const workDir = path.join(
		REPO_ROOT,
		"artifacts",
		"bench",
		`.work-${harness}`,
	);
	const resultsPath = path.join(
		REPO_ROOT,
		"artifacts",
		"bench",
		`rbxtsc-build-${harness}.json`,
	);
	const rbxtsc = path.join(
		path.dirname(
			createRequire(path.join(harnessDir, "package.json")).resolve(
				"roblox-ts/package.json",
			),
		),
		"out/CLI/cli.js",
	);
	const tsconfigPath = path.join(harnessDir, BENCH_TSCONFIG);
	const rojoProject = JSON.parse(
		fs.readFileSync(path.join(harnessDir, "default.project.json"), "utf8"),
	) as { name: string; tree: RojoNode };

	// rbxtsc resolves node_modules from the tsconfig's directory, so the bench config sits beside the real one.
	function build(variant: Variant): number {
		const outDir = path.join(workDir, variant, "out");
		const rojoPath = path.join(workDir, variant, "bench.project.json");
		fs.rmSync(path.join(workDir, variant), { recursive: true, force: true });
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(
			rojoPath,
			JSON.stringify({
				name: rojoProject.name,
				tree: rewriteRojoTree(rojoProject.tree, harnessDir, outDir),
			}),
		);
		fs.writeFileSync(
			tsconfigPath,
			JSON.stringify({
				extends: "./tsconfig.json",
				compilerOptions: {
					outDir,
					tsBuildInfoFile: path.join(outDir, "tsconfig.tsbuildinfo"),
					...(variant === "without-vela" ? { plugins: [] } : {}),
				},
			}),
		);

		const started = process.hrtime.bigint();
		const result = spawnSync(
			process.execPath,
			[rbxtsc, "-p", BENCH_TSCONFIG, "--rojo", rojoPath],
			{ cwd: harnessDir, encoding: "utf8" },
		);
		const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

		if (result.status !== 0) {
			throw new Error(
				`rbxtsc (${variant}) exited with ${result.status}:\n${result.stdout}${result.stderr}`,
			);
		}

		return elapsed;
	}

	const samples: Record<Variant, number[]> = {
		"with-vela": [],
		"without-vela": [],
	};

	try {
		// One untimed pass each, so the first timed run does not pay cold disk caches.
		build("without-vela");
		build("with-vela");

		for (let run = 0; run < runs; run += 1) {
			samples["without-vela"].push(build("without-vela"));
			samples["with-vela"].push(build("with-vela"));
		}
	} finally {
		fs.rmSync(tsconfigPath, { force: true });
	}

	const withVela = median(samples["with-vela"]);
	const withoutVela = median(samples["without-vela"]);
	const results = {
		harness,
		runs,
		node: process.version,
		platform: `${process.platform}-${process.arch}`,
		date: new Date().toISOString(),
		medianMs: { withVela, withoutVela },
		overheadMs: withVela - withoutVela,
		overheadRatio: withVela / withoutVela,
		samplesMs: samples,
	};

	fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
	fs.writeFileSync(resultsPath, `${JSON.stringify(results, null, "\t")}\n`);
	fs.rmSync(workDir, { recursive: true, force: true });

	console.log(
		`${harness}: with vela ${withVela.toFixed(0)} ms, without ${withoutVela.toFixed(0)} ms, overhead ${results.overheadMs.toFixed(0)} ms (${((results.overheadRatio - 1) * 100).toFixed(1)}%)`,
	);
	console.log(`wrote ${path.relative(REPO_ROOT, resultsPath)}`);
}

main();
