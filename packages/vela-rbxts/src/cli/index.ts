#!/usr/bin/env node
import { createRequire } from "node:module";

import { DEFAULT_OUT_DIR, DEFAULT_SRC_DIR, parseCliArgs } from "./options.js";
import { runRbxtsc } from "./rbxtsc.js";
import { runRemap } from "./remap.js";
import { runBuild, runWatch } from "./run.js";
import { runSort } from "./sort.js";

const HELP_TEXT = `vela — lower Tailwind-style className usage ahead of rbxtsc.

Usage
  vela build [options]    Transform the source tree once.
  vela watch [options]    Transform, then re-transform on change.
  vela remap [options]    Rewrite rbxtsc output on stdin to point at --src.
  vela sort [paths...] [options]
                          Sort the classes in each class list, as the editor's
                          sort action does. Default path: --src.
  vela [options] rbxtsc [args...]
                          Run the project's rbxtsc with its output remapped.
                          Everything after "rbxtsc" is passed to it.

Options
  -p, --project <dir>     Project root. Default: the current directory.
      --src <dir>         Source tree to read. Default: ${DEFAULT_SRC_DIR}
      --out <dir>         Generated tree to write. Default: ${DEFAULT_OUT_DIR}
      --clean             Delete the generated tree before building.
      --check             sort: list unsorted files and exit 1, writing nothing.
      --class-functions <names>
                          sort: comma-separated helpers whose arguments are
                          class lists, as the editor's classFunctions.
  -q, --quiet             Print diagnostics only.
  -h, --help              Show this message.
  -v, --version           Print the vela-rbxts version.

Point rbxtsc at the generated tree by setting compilerOptions.rootDir and
include to the --out directory, and remove the vela-rbxts/transformer plugin.
`;

function readVersion(): string {
	try {
		const manifest = createRequire(import.meta.url)("../../package.json") as {
			version?: string;
		};
		return manifest.version ?? "unknown";
	} catch {
		return "unknown";
	}
}

async function main(): Promise<number> {
	const parsed = parseCliArgs(process.argv.slice(2), process.cwd());

	if (parsed.kind === "help") {
		process.stdout.write(HELP_TEXT);
		return 0;
	}

	if (parsed.kind === "version") {
		process.stdout.write(`${readVersion()}\n`);
		return 0;
	}

	if (parsed.kind === "error") {
		process.stderr.write(`vela: error: ${parsed.message}\n\n${HELP_TEXT}`);
		return 2;
	}

	const options = parsed.options;

	switch (options.command) {
		case "watch":
			return runWatch(options);
		case "remap":
			return runRemap(options);
		case "rbxtsc":
			return runRbxtsc(options);
		case "sort":
			return runSort(options);
		default:
			return runBuild(options);
	}
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error: unknown) => {
		const message = error instanceof Error ? error.stack : String(error);
		process.stderr.write(`vela: error: ${message}\n`);
		process.exitCode = 1;
	},
);
