import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import type { CliOptions } from "./options.js";
import { createSourceMapIndex, pipeRemapped } from "./remap.js";

/** The project's own roblox-ts, never one vela happens to resolve. */
export function resolveRbxtscBin(projectRoot: string): string | undefined {
	try {
		const require = createRequire(path.join(projectRoot, "package.json"));
		const manifestPath = require.resolve("roblox-ts/package.json");
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
			bin?: string | Record<string, string>;
		};
		const bin =
			typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.rbxtsc;

		return bin === undefined
			? undefined
			: path.resolve(path.dirname(manifestPath), bin);
	} catch {
		return undefined;
	}
}

const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

export function runRbxtsc(options: CliOptions): Promise<number> {
	const bin = resolveRbxtscBin(options.projectRoot);
	if (bin === undefined) {
		process.stderr.write(
			`vela: error: roblox-ts is not installed in ${options.projectRoot}.\n`,
		);
		return Promise.resolve(1);
	}

	const env = { ...process.env };
	// A pipe is not a terminal, so rbxtsc would drop the colors it prints there.
	if (
		process.stdout.isTTY &&
		env.FORCE_COLOR === undefined &&
		env.NO_COLOR === undefined
	) {
		env.FORCE_COLOR = "1";
	}

	// rbxtsc resolves its own `-p` and prints its paths against the project root.
	const child = spawn(
		process.execPath,
		[bin, ...(options.forwardedArgs ?? [])],
		{ cwd: options.projectRoot, env, stdio: ["inherit", "pipe", "pipe"] },
	);
	const index = createSourceMapIndex({ ...options, cwd: options.projectRoot });
	const streams = Promise.all([
		pipeRemapped(child.stdout, process.stdout, index),
		pipeRemapped(child.stderr, process.stderr, index),
	]);
	const forward = (signal: NodeJS.Signals) => {
		child.kill(signal);
	};
	for (const signal of FORWARDED_SIGNALS) {
		process.on(signal, forward);
	}

	return new Promise((resolve) => {
		const finish = (code: number) => {
			for (const signal of FORWARDED_SIGNALS) {
				process.off(signal, forward);
			}
			resolve(code);
		};

		child.on("error", (error) => {
			process.stderr.write(`vela: error: ${error.message}\n`);
			finish(1);
		});
		child.on("close", (code, signal) => {
			streams.then(() => {
				if (signal !== null) {
					finish(128 + (os.constants.signals[signal] ?? 0));
					return;
				}
				finish(code ?? 1);
			});
		});
	});
}
