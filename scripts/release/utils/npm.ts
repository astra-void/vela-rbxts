import { dirname, join } from "node:path";

import { runCommandCapture } from "./exec";

export function resolveNpmCommand() {
	const commandName = process.platform === "win32" ? "npm.cmd" : "npm";
	const localCommand = join(dirname(process.execPath), commandName);
	return localCommand;
}

export async function packageVersionExistsOnNpm(
	packageName: string,
	version: string,
) {
	const npmCommand = resolveNpmCommand();
	try {
		runCommandCapture(npmCommand, ["view", `${packageName}@${version}`, "version", "--json"]);
		return true;
	} catch {
		return false;
	}
}
