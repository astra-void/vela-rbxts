import path from "node:path";

import * as vscode from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	Trace,
	TransportKind,
} from "vscode-languageclient/node";

const EXTENSION_ID = "vela-rbxts-lsp";
const OUTPUT_CHANNEL_NAME = "vela-rbxts-lsp";
const CONFIG_WATCH_GLOB = "**/rbxtw.config.ts";

let client: LanguageClient | undefined;
let lifecycleTask: Promise<void> = Promise.resolve();
let outputChannel: vscode.OutputChannel | undefined;
let traceOutputChannel: vscode.OutputChannel | undefined;

type TraceSetting = "off" | "messages" | "verbose";

interface ResolvedServerCommand {
	command: string;
	args: string[];
	workspaceRoot: string;
}

export async function activate(
	context: vscode.ExtensionContext,
): Promise<void> {
	outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
	traceOutputChannel = vscode.window.createOutputChannel(
		`${OUTPUT_CHANNEL_NAME} Trace`,
	);
	context.subscriptions.push(outputChannel, traceOutputChannel);

	const watcher = vscode.workspace.createFileSystemWatcher(CONFIG_WATCH_GLOB);
	context.subscriptions.push(watcher);

	context.subscriptions.push(
		watcher.onDidChange((uri) => {
			log(`Detected config change: ${uri.fsPath}`);
		}),
		watcher.onDidCreate((uri) => {
			log(`Detected config create: ${uri.fsPath}`);
		}),
		watcher.onDidDelete((uri) => {
			log(`Detected config delete: ${uri.fsPath}`);
		}),
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (!event.affectsConfiguration("velaRbxts.lsp")) {
				return;
			}

			void runLifecycleTask(async () => {
				log("velaRbxts.lsp settings changed. Restarting the language client.");
				await syncClientState(context, watcher);
			});
		}),
	);

	await runLifecycleTask(() => syncClientState(context, watcher));
}

export async function deactivate(): Promise<void> {
	await runLifecycleTask(async () => {
		await stopClient();
	});
}

async function syncClientState(
	context: vscode.ExtensionContext,
	watcher: vscode.FileSystemWatcher,
): Promise<void> {
	if (!isLspEnabled()) {
		log(
			"velaRbxts.lsp.enabled is false. Skipping standalone Rust LSP startup.",
		);
		await stopClient();
		return;
	}

	await stopClient();
	await startClient(context, watcher);
}

async function startClient(
	context: vscode.ExtensionContext,
	watcher: vscode.FileSystemWatcher,
): Promise<void> {
	const resolvedServerCommand = await resolveServerCommand(context);
	if (!resolvedServerCommand) {
		void vscode.window.showErrorMessage(
			"vela-rbxts could not start the Rust LSP. Check the vela-rbxts output channel for details.",
		);
		return;
	}

	const { args, command, workspaceRoot } = resolvedServerCommand;
	const clientOutputChannel =
		outputChannel ?? vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
	const clientTraceOutputChannel =
		traceOutputChannel ??
		vscode.window.createOutputChannel(`${OUTPUT_CHANNEL_NAME} Trace`);
	outputChannel = clientOutputChannel;
	traceOutputChannel = clientTraceOutputChannel;
	const serverOptions: ServerOptions = {
		run: {
			command,
			args,
			transport: TransportKind.stdio,
			options: {
				cwd: workspaceRoot,
			},
		},
		debug: {
			command,
			args,
			transport: TransportKind.stdio,
			options: {
				cwd: workspaceRoot,
				env: {
					...process.env,
					RUST_LOG: "debug",
				},
			},
		},
	};
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: "file", language: "typescript" },
			{ scheme: "file", language: "typescriptreact" },
		],
		synchronize: {
			fileEvents: watcher,
		},
		initializationOptions: {
			extensionVersion: String(
				context.extension.packageJSON.version ?? "0.0.0",
			),
			workspaceRoot,
		},
		outputChannel: clientOutputChannel,
		outputChannelName: OUTPUT_CHANNEL_NAME,
		traceOutputChannel: clientTraceOutputChannel,
	};

	client = new LanguageClient(
		EXTENSION_ID,
		OUTPUT_CHANNEL_NAME,
		serverOptions,
		clientOptions,
	);

	try {
		log(`Starting standalone Rust LSP using command: ${command}`);
		await client.start();
		await client.setTrace(toClientTrace(getTraceSetting()));
		log("Standalone Rust LSP started.");
	} catch (error) {
		log(`Failed to start standalone Rust LSP: ${formatError(error)}`);
		await stopClient();
		void vscode.window.showErrorMessage(
			"vela-rbxts failed to start the Rust LSP. Check the vela-rbxts output channel for details.",
		);
	}
}

async function stopClient(): Promise<void> {
	if (!client) {
		return;
	}

	const currentClient = client;
	client = undefined;
	await currentClient.stop();
}

async function resolveServerCommand(
	context: vscode.ExtensionContext,
): Promise<ResolvedServerCommand | undefined> {
	const workspaceRoot = getWorkspaceRoot(context);
	const configuredServerPath = vscode.workspace
		.getConfiguration("velaRbxts.lsp")
		.get<string>("serverPath", "")
		.trim();

	if (configuredServerPath.length > 0) {
		const resolvedPath = path.isAbsolute(configuredServerPath)
			? configuredServerPath
			: path.resolve(workspaceRoot, configuredServerPath);
		log(
			`Resolved LSP server path from velaRbxts.lsp.serverPath: ${resolvedPath}`,
		);
		return {
			command: resolvedPath,
			args: [],
			workspaceRoot,
		};
	}

	const bundledServerCommand = resolveBundledServerCommand(workspaceRoot);
	if (bundledServerCommand) {
		log(
			`Using bundled @vela-rbxts/lsp wrapper package: ${bundledServerCommand.command} ${bundledServerCommand.args.join(" ")}`.trim(),
		);
		return bundledServerCommand;
	}

	log(
		"No bundled @vela-rbxts/lsp server was resolved. Configure velaRbxts.lsp.serverPath or ensure @vela-rbxts/lsp and a matching platform binary package are installed.",
	);
	return undefined;
}

function resolveBundledServerCommand(
	workspaceRoot: string,
): ResolvedServerCommand | undefined {
	const runtimeBinaryPackageName = resolveBinaryPackageName();
	if (!runtimeBinaryPackageName) {
		return undefined;
	}

	if (!isBinaryPackageInstalled(runtimeBinaryPackageName)) {
		log(
			`Bundled @vela-rbxts/lsp is available, but ${runtimeBinaryPackageName} is not installed.`,
		);
		return undefined;
	}

	try {
		const launcherPath = require.resolve("@vela-rbxts/lsp");
		return {
			command: process.execPath,
			args: [launcherPath],
			workspaceRoot,
		};
	} catch {
		return undefined;
	}
}

function resolveBinaryPackageName(): string | undefined {
	if (process.platform === "darwin") {
		if (process.arch === "arm64") {
			return "@vela-rbxts/lsp-darwin-arm64";
		}

		if (process.arch === "x64") {
			return "@vela-rbxts/lsp-darwin-x64";
		}

		return undefined;
	}

	if (process.platform === "linux") {
		const runtimeKind = detectLinuxRuntimeKind();

		if (process.arch === "arm64") {
			return runtimeKind === "gnu"
				? "@vela-rbxts/lsp-linux-arm64-gnu"
				: "@vela-rbxts/lsp-linux-arm64-musl";
		}

		if (process.arch === "x64") {
			return runtimeKind === "gnu"
				? "@vela-rbxts/lsp-linux-x64-gnu"
				: "@vela-rbxts/lsp-linux-x64-musl";
		}

		return undefined;
	}

	if (process.platform === "win32") {
		if (process.arch === "arm64") {
			return "@vela-rbxts/lsp-win32-arm64-msvc";
		}

		if (process.arch === "x64") {
			return "@vela-rbxts/lsp-win32-x64-msvc";
		}

		return undefined;
	}

	return undefined;
}

function isBinaryPackageInstalled(packageName: string | undefined): boolean {
	if (!packageName) {
		return false;
	}

	try {
		require.resolve(`${packageName}/package.json`);
		return true;
	} catch {
		return false;
	}
}

function detectLinuxRuntimeKind(): "gnu" | "musl" {
	const glibcVersionRuntime = (() => {
		if (typeof process.report?.getReport !== "function") {
			return undefined;
		}

		const report = process.report.getReport() as {
			header?: {
				glibcVersionRuntime?: string;
			};
		};

		return report.header?.glibcVersionRuntime;
	})();

	return glibcVersionRuntime ? "gnu" : "musl";
}

function getWorkspaceRoot(context: vscode.ExtensionContext): string {
	return (
		vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ??
		getRepoRootUri(context).fsPath
	);
}

function getRepoRootUri(context: vscode.ExtensionContext): vscode.Uri {
	return vscode.Uri.joinPath(context.extensionUri, "..", "..");
}

function isLspEnabled(): boolean {
	return vscode.workspace
		.getConfiguration("velaRbxts.lsp")
		.get<boolean>("enabled", true);
}

function getTraceSetting(): TraceSetting {
	return vscode.workspace
		.getConfiguration("velaRbxts.lsp")
		.get<TraceSetting>("trace.server", "off");
}

function toClientTrace(traceSetting: TraceSetting): Trace {
	switch (traceSetting) {
		case "messages":
			return Trace.Messages;
		case "verbose":
			return Trace.Verbose;
		default:
			return Trace.Off;
	}
}

function log(message: string): void {
	const timestamp = new Date().toISOString();
	console.log(`[${OUTPUT_CHANNEL_NAME}] ${message}`);
	outputChannel?.appendLine(`[${timestamp}] ${message}`);
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.stack ?? error.message;
	}

	return String(error);
}

function runLifecycleTask(task: () => Promise<void>): Promise<void> {
	lifecycleTask = lifecycleTask.then(task, task);
	return lifecycleTask;
}
