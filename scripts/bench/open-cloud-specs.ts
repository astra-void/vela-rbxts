import fs from "node:fs";
import path from "node:path";
import {
	assertId,
	assertTimeout,
	buildTaskScript,
	createClient,
	evaluateTask,
	formatVerdict,
	type SpecRequest,
	summaryMarkdown,
} from "./open-cloud";

const REPO_ROOT = path.resolve(__dirname, "../..");
const ENTRY_PATH = path.join(__dirname, "open-cloud-entry.luau");
const POLL_INTERVAL_MS = 3000;
// Queue time comes on top of the task's own timeout.
const POLL_MARGIN_MS = 5 * 60 * 1000;

function flag(name: string, fallback: string): string {
	const args = process.argv.slice(2);
	const index = args.indexOf(`--${name}`);

	return index >= 0 && args[index + 1] !== undefined
		? args[index + 1]
		: fallback;
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (value === undefined || value === "") {
		throw new Error(`${name} is not set`);
	}

	return value;
}

function list(value: string): string[] {
	return value
		.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry !== "");
}

async function main() {
	const apiKey = requireEnv("ROBLOX_API_KEY");
	const universeId = assertId(
		"ROBLOX_UNIVERSE_ID",
		requireEnv("ROBLOX_UNIVERSE_ID"),
	);
	const placeId = assertId("ROBLOX_PLACE_ID", requireEnv("ROBLOX_PLACE_ID"));
	const harnesses = list(flag("harness", "rbxts-harness,vide-harness"));
	const specs = list(flag("specs", ""));
	const timeout = assertTimeout(flag("timeout", "300s"));
	const entry = fs.readFileSync(ENTRY_PATH, "utf8");
	const client = createClient(apiKey, {
		fetch,
		wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		now: Date.now,
	});
	const resultsDir = path.join(REPO_ROOT, "artifacts", "bench");
	fs.mkdirSync(resultsDir, { recursive: true });
	let failed = false;

	for (const harness of harnesses) {
		const placePath = path.join(
			REPO_ROOT,
			"apps",
			harness,
			"out",
			"bench.rbxl",
		);
		if (!fs.existsSync(placePath)) {
			throw new Error(
				`${placePath} is missing: run pnpm --filter ${harness} run bench:place first`,
			);
		}

		const version = await client.uploadPlace(
			universeId,
			placeId,
			fs.readFileSync(placePath),
		);
		console.log(`${harness}: uploaded as place version ${version}`);

		const request: SpecRequest = {
			id: `${harness}-${version}`,
			kind: "spec",
			...(specs.length > 0 ? { specs } : {}),
		};
		const created = await client.createTask(
			universeId,
			placeId,
			version,
			buildTaskScript(entry, request),
			timeout,
		);
		console.log(`${harness}: task ${created.path}`);

		const task = await client.waitForTask(created.path, {
			intervalMs: POLL_INTERVAL_MS,
			deadlineMs: Number.parseFloat(timeout) * 1000 + POLL_MARGIN_MS,
		});
		let logs: string[] = [];
		try {
			logs = await client.listLogs(task.path);
		} catch (error) {
			console.warn(
				`${harness}: could not read logs: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		for (const line of logs) {
			console.log(`${harness} | ${line}`);
		}

		const verdict = evaluateTask(task, request.id);
		console.log(formatVerdict(harness, verdict));
		fs.writeFileSync(
			path.join(resultsDir, `open-cloud-${harness}.json`),
			`${JSON.stringify({ harness, version, task, verdict, logs }, null, 2)}\n`,
		);
		if (process.env.GITHUB_STEP_SUMMARY) {
			fs.appendFileSync(
				process.env.GITHUB_STEP_SUMMARY,
				summaryMarkdown(harness, verdict),
			);
		}
		failed ||= !verdict.ok;
	}

	if (failed) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
