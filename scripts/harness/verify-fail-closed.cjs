const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const FIXTURE = "broken-config";
const VALID_CONFIG = `import { defineConfig } from "vela-rbxts";

export default defineConfig({
	theme: { extend: { colors: { surface: "Color3.fromRGB(30, 30, 40)" } } },
});
`;

// Builds the harness's broken-config fixture through the real rbxtsc and
// checks that a Vela failure fails the process, not just its output: with the
// committed config, after the config breaks under an incremental build, and
// with the native compiler missing. The same fixture with a valid config must
// build, so a failure is known to come from Vela.
function verifyFailClosed(projectRoot) {
	const fixtureRoot = path.join(projectRoot, "fixtures", FIXTURE);
	const configPath = path.join(fixtureRoot, "vela.config.ts");
	const outDir = path.join(fixtureRoot, "out");
	const luauPath = path.join(outDir, "client", "App.luau");
	const rbxtscCli = path.join(
		path.dirname(require.resolve("roblox-ts/package.json", { paths: [projectRoot] })),
		"out",
		"CLI",
		"cli.js",
	);
	const failures = [];

	const build = (label, env = {}) => {
		const result = spawnSync(
			process.execPath,
			[
				rbxtscCli,
				"-p",
				`tsconfig.${FIXTURE}.json`,
				"--rojo",
				path.join("fixtures", FIXTURE, "default.project.json"),
			],
			{ cwd: projectRoot, encoding: "utf8", env: { ...process.env, ...env } },
		);
		return { label, status: result.status, output: `${result.stdout}${result.stderr}` };
	};
	const expectFailure = (result, code) => {
		if (result.status === 0) {
			failures.push(`${result.label}: rbxtsc exited 0 instead of failing`);
		}
		if (!result.output.includes(code)) {
			failures.push(`${result.label}: the output does not name ${code}:\n${result.output}`);
		}
	};
	const readLuau = () => (fs.existsSync(luauPath) ? fs.readFileSync(luauPath, "utf8") : undefined);

	const brokenConfig = fs.readFileSync(configPath, "utf8");
	try {
		fs.rmSync(outDir, { recursive: true, force: true });
		expectFailure(build("a broken config"), "compiler-invocation-failed");
		if (readLuau() !== undefined) {
			failures.push("a broken config: App.luau was emitted anyway");
		}

		fs.writeFileSync(configPath, VALID_CONFIG);
		fs.rmSync(outDir, { recursive: true, force: true });
		const valid = build("a valid config");
		const lowered = readLuau();
		if (valid.status !== 0) {
			failures.push(`a valid config: rbxtsc exited ${valid.status}:\n${valid.output}`);
		} else if (lowered === undefined || lowered.includes("className")) {
			failures.push("a valid config: App.luau is missing or still carries className");
		}

		fs.writeFileSync(configPath, brokenConfig);
		expectFailure(build("a config that broke since the last incremental build"), "config-resolution-failed");

		fs.writeFileSync(configPath, VALID_CONFIG);
		fs.rmSync(outDir, { recursive: true, force: true });
		expectFailure(
			build("a missing native compiler", {
				NAPI_RS_NATIVE_LIBRARY_PATH: path.join(fixtureRoot, "missing.node"),
			}),
			"compiler-unavailable",
		);
		if (readLuau()?.includes("className")) {
			failures.push("a missing native compiler: App.luau carries the raw className");
		}
	} finally {
		fs.writeFileSync(configPath, brokenConfig);
		fs.rmSync(outDir, { recursive: true, force: true });
	}

	return failures;
}

/// Keys written twice in one Luau table constructor, which is what a JSX prop
/// written by hand and by a class becomes: the later one wins silently.
function duplicateTableKeys(luau) {
	const duplicates = [];
	const scopes = [new Set()];

	for (const line of luau.split("\n")) {
		const trimmed = line.trim();
		const key = /^([A-Za-z_][A-Za-z0-9_]*) = /.exec(trimmed);
		if (key && !trimmed.startsWith("local ")) {
			const scope = scopes[scopes.length - 1];
			if (scope.has(key[1])) {
				duplicates.push(trimmed);
			}
			scope.add(key[1]);
		}

		for (const char of trimmed) {
			if (char === "{") {
				scopes.push(new Set());
			} else if (char === "}" && scopes.length > 1) {
				scopes.pop();
			}
		}
	}

	return duplicates;
}

module.exports = { duplicateTableKeys, verifyFailClosed };
