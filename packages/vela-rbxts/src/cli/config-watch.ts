import fs from "node:fs";
import path from "node:path";
import { projectConfigDependencies } from "@vela-rbxts/rbxtsc-host";

import type { CliOptions } from "./options.js";

const CONFIG_FILE_NAMES = new Set(["vela.config.ts", "vela.config.json"]);

export const POLL_INTERVAL_MS = 400;

// A stylesheet anywhere under the root or the sources may become the entry or
// an import of it, so any CSS edit there counts as a config change.
export function isConfigFileName(fileName: string): boolean {
	return CONFIG_FILE_NAMES.has(fileName) || fileName.endsWith(".css");
}

export type ConfigWatcher = {
	/// Re-reads which files the config was folded from and follows them.
	sync(): void;
	close(): void;
};

/** Directories, not files: a save that replaces the file would orphan a file watcher. */
export function watchProjectConfig(
	options: CliOptions,
	onChange: () => void,
	warn: (message: string) => void = () => {},
): ConfigWatcher {
	const watchers = new Map<string, { close(): void }>();
	let dependencies = new Set<string>();

	function changed(directory: string, name: string): void {
		if (
			dependencies.has(path.join(directory, name)) ||
			(directory === options.projectRoot && isConfigFileName(name))
		) {
			onChange();
		}
	}

	function watchDirectory(directory: string): void {
		if (watchers.has(directory)) {
			return;
		}

		try {
			const watcher = fs.watch(directory, (_event, fileName) => {
				if (fileName !== null) {
					changed(directory, fileName.toString());
				}
			});
			watchers.set(directory, watcher);
		} catch {
			warn(
				`File watching is unavailable for ${directory}; polling every ${POLL_INTERVAL_MS}ms instead.`,
			);
			watchers.set(
				directory,
				pollDirectory(directory, (name) => changed(directory, name)),
			);
		}
	}

	function sync(): void {
		// Only the directory of this path is read: it stands for the source tree.
		dependencies = new Set(
			projectConfigDependencies(path.join(options.srcDir, "index.tsx")),
		);

		const directories = new Set([options.projectRoot]);
		for (const dependency of dependencies) {
			if (!isInside(options.srcDir, dependency)) {
				directories.add(path.dirname(dependency));
			}
		}

		for (const [directory, watcher] of watchers) {
			if (!directories.has(directory)) {
				watcher.close();
				watchers.delete(directory);
			}
		}

		for (const directory of directories) {
			watchDirectory(directory);
		}
	}

	sync();

	return {
		sync,
		close() {
			for (const watcher of watchers.values()) {
				watcher.close();
			}
			watchers.clear();
		},
	};
}

function pollDirectory(
	directory: string,
	onEntry: (name: string) => void,
): { close(): void } {
	let snapshot = takeSnapshot(directory);

	const interval = setInterval(() => {
		const next = takeSnapshot(directory);

		for (const [name, stamp] of next) {
			if (snapshot.get(name) !== stamp) {
				onEntry(name);
			}
		}

		for (const name of snapshot.keys()) {
			if (!next.has(name)) {
				onEntry(name);
			}
		}

		snapshot = next;
	}, POLL_INTERVAL_MS);

	return { close: () => clearInterval(interval) };
}

function takeSnapshot(directory: string): Map<string, string> {
	const snapshot = new Map<string, string>();
	let names: string[];

	try {
		names = fs.readdirSync(directory);
	} catch {
		return snapshot;
	}

	for (const name of names) {
		try {
			const stats = fs.statSync(path.join(directory, name));
			if (stats.isFile()) {
				snapshot.set(name, `${stats.mtimeMs}:${stats.size}`);
			}
		} catch {}
	}

	return snapshot;
}

function isInside(directory: string, filePath: string): boolean {
	const relative = path.relative(directory, filePath);

	return (
		relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
	);
}
