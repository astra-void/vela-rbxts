import path from "node:path";

export const VELA_DIR = ".vela";
export const DEFAULT_SRC_DIR = "src";
export const DEFAULT_OUT_DIR = path.join(VELA_DIR, "src");
export const MANIFEST_FILE = path.join(VELA_DIR, "build-manifest.json");
// Outside the generated tree, which rbxtsc copies into out/ file by file.
export const MAPS_DIR = path.join(VELA_DIR, "maps");

export type CliCommand = "build" | "watch" | "remap" | "rbxtsc";

export type CliOptions = {
	command: CliCommand;
	projectRoot: string;
	srcDir: string;
	outDir: string;
	clean: boolean;
	quiet: boolean;
	/** What `vela rbxtsc` hands to rbxtsc untouched. */
	forwardedArgs?: string[];
};

export type ParsedCliArgs =
	| { kind: "run"; options: CliOptions }
	| { kind: "help" }
	| { kind: "version" }
	| { kind: "error"; message: string };

const VALUE_FLAGS = new Set(["--project", "-p", "--src", "--out"]);

export function parseCliArgs(
	argv: readonly string[],
	cwd: string,
): ParsedCliArgs {
	let command: CliCommand | undefined;
	let projectArgument: string | undefined;
	let srcArgument: string | undefined;
	let outArgument: string | undefined;
	let clean = false;
	let quiet = false;
	let forwardedArgs: string[] | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];

		if (argument === "--help" || argument === "-h") {
			return { kind: "help" };
		}

		if (argument === "--version" || argument === "-v") {
			return { kind: "version" };
		}

		if (argument === "--clean") {
			clean = true;
			continue;
		}

		if (argument === "--quiet" || argument === "-q") {
			quiet = true;
			continue;
		}

		if (argument.startsWith("-")) {
			const separator = argument.indexOf("=");
			const flag = separator < 0 ? argument : argument.slice(0, separator);

			if (!VALUE_FLAGS.has(flag)) {
				return { kind: "error", message: `Unknown option "${argument}".` };
			}

			let value: string | undefined;
			if (separator < 0) {
				index += 1;
				value = argv[index];
			} else {
				value = argument.slice(separator + 1);
			}

			if (value === undefined || value === "") {
				return { kind: "error", message: `Option "${flag}" needs a value.` };
			}

			if (flag === "--project" || flag === "-p") {
				projectArgument = value;
			} else if (flag === "--src") {
				srcArgument = value;
			} else {
				outArgument = value;
			}

			continue;
		}

		if (command !== undefined) {
			return { kind: "error", message: `Unexpected argument "${argument}".` };
		}

		// rbxtsc has a `-p` of its own, so nothing after the command is vela's.
		if (argument === "rbxtsc") {
			command = argument;
			forwardedArgs = argv.slice(index + 1);
			break;
		}

		if (argument !== "build" && argument !== "watch" && argument !== "remap") {
			return { kind: "error", message: `Unknown command "${argument}".` };
		}

		command = argument;
	}

	if (command === undefined) {
		return { kind: "help" };
	}

	const projectRoot = path.resolve(cwd, projectArgument ?? ".");
	const srcDir = path.resolve(projectRoot, srcArgument ?? DEFAULT_SRC_DIR);
	const outDir = path.resolve(projectRoot, outArgument ?? DEFAULT_OUT_DIR);
	const conflict = describePathConflict(projectRoot, srcDir, outDir);

	if (conflict) {
		return { kind: "error", message: conflict };
	}

	return {
		kind: "run",
		options: {
			command,
			projectRoot,
			srcDir,
			outDir,
			clean,
			quiet,
			...(forwardedArgs === undefined ? {} : { forwardedArgs }),
		},
	};
}

function describePathConflict(
	projectRoot: string,
	srcDir: string,
	outDir: string,
): string | undefined {
	if (srcDir === outDir) {
		return "--out must differ from --src: the generated tree would overwrite your sources.";
	}

	if (contains(outDir, srcDir)) {
		return `--out (${outDir}) contains --src (${srcDir}).`;
	}

	if (contains(srcDir, outDir)) {
		return `--src (${srcDir}) contains --out (${outDir}).`;
	}

	if (outDir === projectRoot) {
		return "--out must not be the project root.";
	}

	return undefined;
}

function contains(parent: string, child: string): boolean {
	const relative = path.relative(parent, child);
	return (
		relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
	);
}
