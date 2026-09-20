import fs from "node:fs";
import path from "node:path";
import { clearProjectConfigCache } from "@vela-rbxts/rbxtsc-host";

import { type Builder, createBuilder } from "./builder.js";
import { listFilesRecursive, toSystemPath } from "./files.js";
import type { CliOptions } from "./options.js";
import { collectSetupWarnings, ensureVelaDirIgnored } from "./project.js";
import { createReporter, type Reporter } from "./reporter.js";

const DEBOUNCE_MS = 60;
const POLL_INTERVAL_MS = 400;
const CONFIG_FILE_NAMES = new Set(["vela.config.ts", "vela.config.json"]);

export function runBuild(options: CliOptions): number {
	const reporter = createReporter(options.quiet);
	const builder = prepare(options, reporter);

	if (builder === undefined) {
		return 1;
	}

	const stats = builder.buildAll();
	reporter.summary(stats);

	return stats.errors > 0 ? 1 : 0;
}

export function runWatch(options: CliOptions): Promise<number> {
	const reporter = createReporter(options.quiet);
	const builder = prepare(options, reporter);

	if (builder === undefined) {
		return Promise.resolve(1);
	}

	reporter.summary(builder.buildAll());
	reporter.info("vela watch: waiting for changes...");

	return watchLoop(options, builder, reporter);
}

function prepare(options: CliOptions, reporter: Reporter): Builder | undefined {
	reporter.header(options);

	for (const warning of collectSetupWarnings(options)) {
		reporter.warn(warning);
	}

	if (!fs.existsSync(options.srcDir)) {
		return undefined;
	}

	ensureVelaDirIgnored(options.projectRoot);

	const builder = createBuilder(options);
	if (options.clean) {
		builder.clean();
	}

	return builder;
}

function watchLoop(
	options: CliOptions,
	builder: Builder,
	reporter: Reporter,
): Promise<number> {
	return new Promise((resolve) => {
		const pending = new Set<string>();
		const closers: Array<() => void> = [];
		let fullRebuild = false;
		let timer: NodeJS.Timeout | undefined;
		let exitCode = 0;

		const flush = () => {
			timer = undefined;
			const changed = [...pending];
			const wasFull = fullRebuild;
			pending.clear();
			fullRebuild = false;

			const stats = wasFull ? builder.buildAll() : builder.rebuild(changed);
			exitCode = stats.errors > 0 ? 1 : 0;
			reporter.summary(stats, "vela watch: ");
		};

		const queue = (relativePath: string | undefined) => {
			const isConfig =
				relativePath !== undefined &&
				relativePath !== "" &&
				CONFIG_FILE_NAMES.has(path.posix.basename(relativePath));

			// A config edit changes how every file lowers, so it takes the whole
			// tree with it rather than just itself.
			if (isConfig) {
				clearProjectConfigCache();
			}

			if (relativePath === undefined || relativePath === "" || isConfig) {
				fullRebuild = true;
			} else {
				pending.add(relativePath);
			}

			if (timer !== undefined) {
				clearTimeout(timer);
			}
			timer = setTimeout(flush, DEBOUNCE_MS);
		};

		closers.push(watchSources(options, reporter, queue));
		closers.push(watchProjectConfig(options, queue));

		const stop = () => {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			for (const close of closers) {
				close();
			}
			resolve(exitCode);
		};

		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
	});
}

function watchSources(
	options: CliOptions,
	reporter: Reporter,
	queue: (relativePath: string | undefined) => void,
): () => void {
	try {
		const watcher = fs.watch(
			options.srcDir,
			{ recursive: true },
			(_event, fileName) => {
				queue(
					fileName === null || fileName === undefined
						? undefined
						: fileName.toString().split(path.sep).join("/"),
				);
			},
		);

		return () => watcher.close();
	} catch {
		reporter.warn(
			`Recursive file watching is unavailable; polling every ${POLL_INTERVAL_MS}ms instead.`,
		);
		return pollSources(options, queue);
	}
}

function pollSources(
	options: CliOptions,
	queue: (relativePath: string) => void,
): () => void {
	let snapshot = takeSnapshot(options.srcDir);

	const interval = setInterval(() => {
		const next = takeSnapshot(options.srcDir);

		for (const [relativePath, stamp] of next) {
			if (snapshot.get(relativePath) !== stamp) {
				queue(relativePath);
			}
		}

		for (const relativePath of snapshot.keys()) {
			if (!next.has(relativePath)) {
				queue(relativePath);
			}
		}

		snapshot = next;
	}, POLL_INTERVAL_MS);

	return () => clearInterval(interval);
}

function takeSnapshot(srcDir: string): Map<string, string> {
	const snapshot = new Map<string, string>();

	for (const relativePath of listFilesRecursive(srcDir)) {
		try {
			const stats = fs.statSync(toSystemPath(srcDir, relativePath));
			snapshot.set(relativePath, `${stats.mtimeMs}:${stats.size}`);
		} catch {}
	}

	return snapshot;
}

function watchProjectConfig(
	options: CliOptions,
	onChange: (fileName: string) => void,
): () => void {
	try {
		const watcher = fs.watch(options.projectRoot, (_event, fileName) => {
			const name = fileName === null ? undefined : fileName.toString();
			if (name !== undefined && CONFIG_FILE_NAMES.has(name)) {
				onChange(name);
			}
		});

		return () => watcher.close();
	} catch {
		return () => undefined;
	}
}
