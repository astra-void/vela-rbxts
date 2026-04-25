const VSCODE_TARGETS = Object.freeze({
	"win32-x64": {
		lspFolder: "win32-x64-msvc",
		packageName: "@vela-rbxts/lsp-win32-x64-msvc",
	},
	"darwin-arm64": {
		lspFolder: "darwin-arm64",
		packageName: "@vela-rbxts/lsp-darwin-arm64",
	},
	"darwin-x64": {
		lspFolder: "darwin-x64",
		packageName: "@vela-rbxts/lsp-darwin-x64",
	},
	"linux-x64": {
		lspFolder: "linux-x64-gnu",
		packageName: "@vela-rbxts/lsp-linux-x64-gnu",
	},
	"linux-arm64": {
		lspFolder: "linux-arm64-gnu",
		packageName: "@vela-rbxts/lsp-linux-arm64-gnu",
	},
	"alpine-x64": {
		lspFolder: "linux-x64-musl",
		packageName: "@vela-rbxts/lsp-linux-x64-musl",
	},
});

const SUPPORTED_VSCODE_TARGETS = Object.freeze(Object.keys(VSCODE_TARGETS));

function detectLinuxRuntimeKind() {
	if (typeof process.report?.getReport !== "function") {
		return "musl";
	}

	const report = process.report.getReport();
	return report?.header?.glibcVersionRuntime ? "gnu" : "musl";
}

function resolveDefaultVsCodeTarget() {
	if (process.platform === "win32" && process.arch === "x64") {
		return "win32-x64";
	}

	if (process.platform === "darwin" && process.arch === "arm64") {
		return "darwin-arm64";
	}

	if (process.platform === "darwin" && process.arch === "x64") {
		return "darwin-x64";
	}

	if (process.platform === "linux" && process.arch === "arm64") {
		return "linux-arm64";
	}

	if (process.platform === "linux" && process.arch === "x64") {
		return detectLinuxRuntimeKind() === "musl" ? "alpine-x64" : "linux-x64";
	}

	return undefined;
}

module.exports = {
	VSCODE_TARGETS,
	SUPPORTED_VSCODE_TARGETS,
	resolveDefaultVsCodeTarget,
};
