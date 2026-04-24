import { spawnSync, type SpawnSyncOptions } from "node:child_process";

export type ExecOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	stdio?: SpawnSyncOptions["stdio"];
	allowFailure?: boolean;
};

export function formatCommand(command: string, args: readonly string[]) {
	return `${command} ${args.join(" ")}`.trim();
}

export function runCommand(
	command: string,
	args: readonly string[],
	options: ExecOptions = {},
) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		stdio: options.stdio ?? "inherit",
		shell: process.platform === "win32",
	});

	if (result.error) {
		throw result.error;
	}

	if (!options.allowFailure && result.status !== 0) {
		throw new Error(
			`Command failed (${result.status ?? 1}): ${formatCommand(command, args)}`,
		);
	}

	return result;
}

export function runCommandCapture(
	command: string,
	args: readonly string[],
	options: Omit<ExecOptions, "stdio"> = {},
) {
	const result = runCommand(command, args, {
		...options,
		stdio: "pipe",
		allowFailure: true,
	});

	const stdout = result.stdout?.toString("utf8") ?? "";
	const stderr = result.stderr?.toString("utf8") ?? "";

	if (result.status !== 0) {
		throw new Error(
			[
				`Command failed (${result.status ?? 1}): ${formatCommand(command, args)}`,
				stderr.trim(),
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	return {
		stdout,
		stderr,
	};
}
