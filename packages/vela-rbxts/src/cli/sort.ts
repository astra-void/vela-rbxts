import fs from "node:fs";
import path from "node:path";
import { sortSourceForHost } from "@vela-rbxts/rbxtsc-host";

import { isFile, listFilesRecursive, toSystemPath } from "./files.js";
import type { CliOptions } from "./options.js";

export function runSort(options: CliOptions): number {
	const roots = options.paths?.length ? options.paths : [options.srcDir];
	const unsorted: string[] = [];
	let failed = false;

	for (const filePath of collectFiles(roots)) {
		const relativePath = path.relative(options.projectRoot, filePath);
		let result: ReturnType<typeof sortSourceForHost>;

		try {
			result = sortSourceForHost(
				{ fileName: filePath, sourceText: fs.readFileSync(filePath, "utf8") },
				{ classFunctions: options.classFunctions ?? [] },
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			process.stderr.write(`vela: error: ${relativePath}: ${message}\n`);
			failed = true;
			continue;
		}

		if (!result.changed) {
			continue;
		}

		unsorted.push(relativePath);
		if (options.check) {
			process.stdout.write(`${relativePath}\n`);
		} else {
			fs.writeFileSync(filePath, result.sourceText);
			if (!options.quiet) {
				process.stdout.write(`sorted ${relativePath}\n`);
			}
		}
	}

	if (options.check && unsorted.length > 0) {
		process.stderr.write(
			`vela: ${countFiles(unsorted.length)} ${unsorted.length === 1 ? "needs" : "need"} sorting. Run "vela sort" to fix.\n`,
		);
		return 1;
	}

	if (!options.quiet && !options.check) {
		process.stdout.write(`vela: sorted ${countFiles(unsorted.length)}.\n`);
	}

	return failed ? 1 : 0;
}

function collectFiles(roots: readonly string[]): string[] {
	const files = new Set<string>();

	for (const root of roots) {
		if (isFile(root)) {
			files.add(root);
			continue;
		}
		for (const relativePath of listFilesRecursive(root)) {
			files.add(toSystemPath(root, relativePath));
		}
	}

	return [...files];
}

function countFiles(count: number): string {
	return count === 1 ? "1 file" : `${count} files`;
}
