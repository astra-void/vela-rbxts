export const ROOT_PACKAGE_NAME = "@vela-rbxts/lsp";
export const ROOT_BINARY_NAME = "vela-rbxts-lsp";

export const BINARY_PACKAGE_CONFIGS = [
	{
		directory: "darwin-arm64",
		name: "@vela-rbxts/lsp-darwin-arm64",
		os: "darwin",
		cpu: "arm64",
		target: "aarch64-apple-darwin",
	},
	{
		directory: "darwin-x64",
		name: "@vela-rbxts/lsp-darwin-x64",
		os: "darwin",
		cpu: "x64",
		target: "x86_64-apple-darwin",
	},
	{
		directory: "linux-arm64-gnu",
		name: "@vela-rbxts/lsp-linux-arm64-gnu",
		os: "linux",
		cpu: "arm64",
		target: "aarch64-unknown-linux-gnu",
	},
	{
		directory: "linux-x64-gnu",
		name: "@vela-rbxts/lsp-linux-x64-gnu",
		os: "linux",
		cpu: "x64",
		target: "x86_64-unknown-linux-gnu",
	},
	{
		directory: "linux-x64-musl",
		name: "@vela-rbxts/lsp-linux-x64-musl",
		os: "linux",
		cpu: "x64",
		target: "x86_64-unknown-linux-musl",
	},
	{
		directory: "win32-x64-msvc",
		name: "@vela-rbxts/lsp-win32-x64-msvc",
		os: "win32",
		cpu: "x64",
		target: "x86_64-pc-windows-msvc",
	},
];

export function getBinaryPackageName(platform, arch, runtimeKind = "gnu") {
	const platformPackages = {
		darwin: {
			arm64: "@vela-rbxts/lsp-darwin-arm64",
			x64: "@vela-rbxts/lsp-darwin-x64",
		},
		linux: {
			arm64: {
				gnu: "@vela-rbxts/lsp-linux-arm64-gnu",
			},
			x64: {
				gnu: "@vela-rbxts/lsp-linux-x64-gnu",
				musl: "@vela-rbxts/lsp-linux-x64-musl",
			},
		},
		win32: {
			x64: "@vela-rbxts/lsp-win32-x64-msvc",
		},
	};

	const platformEntries = platformPackages[platform];
	if (!platformEntries) {
		return undefined;
	}

	const entry = platformEntries[arch];
	if (!entry) {
		return undefined;
	}

	if (typeof entry === "string") {
		return entry;
	}

	return entry[runtimeKind];
}

export function getBinaryFileName(os) {
	return os === "win32" ? `${ROOT_BINARY_NAME}.exe` : ROOT_BINARY_NAME;
}

export function buildWrapperPackageJson({ version, repository }) {
	const optionalDependencies = Object.fromEntries(
		BINARY_PACKAGE_CONFIGS.map((config) => [config.name, version]),
	);

	return {
		name: ROOT_PACKAGE_NAME,
		version,
		private: false,
		type: "commonjs",
		description: "Wrapper package for the prebuilt vela-rbxts Rust LSP binary.",
		main: "./bin/vela-rbxts-lsp.js",
		bin: {
			"vela-rbxts-lsp": "./bin/vela-rbxts-lsp.js",
		},
		publishConfig: {
			access: "public",
		},
		repository,
		files: ["bin/vela-rbxts-lsp.js", "README.md"],
		optionalDependencies,
		exports: {
			".": "./bin/vela-rbxts-lsp.js",
			"./package.json": "./package.json",
		},
	};
}

export function buildBinaryPackageJson(config, { version, repository }) {
	const binaryFileName = getBinaryFileName(config.os);

	return {
		name: config.name,
		version,
		description: `Prebuilt vela-rbxts LSP binary for ${config.target}.`,
		os: [config.os],
		cpu: [config.cpu],
		main: `./bin/${binaryFileName}`,
		bin: {
			"vela-rbxts-lsp": `./bin/${binaryFileName}`,
		},
		publishConfig: {
			access: "public",
		},
		repository,
		files: [`bin/${binaryFileName}`],
		exports: {
			".": `./bin/${binaryFileName}`,
			"./package.json": "./package.json",
		},
	};
}

export function buildWrapperReadme() {
	return [
		"# `@vela-rbxts/lsp`",
		"",
		"Wrapper package for the standalone vela-rbxts Rust LSP.",
		"",
		"This package starts the matching prebuilt binary package for the current",
		"platform and connects it over stdio.",
		"",
		"For monorepo development, run the server from source with:",
		"",
		"```sh",
		"cargo run --manifest-path packages/lsp/Cargo.toml",
		"```",
		"",
		"The release flow stages this wrapper under `packages/lsp/.npm/publish` and",
		"publishes the platform binary packages separately.",
		"",
	].join("\n");
}

export function buildBinaryReadme(config) {
	return [
		`# \`${config.name}\``,
		"",
		`This is the **${config.target}** binary for \`${ROOT_PACKAGE_NAME}\`.`,
		"",
	].join("\n");
}
