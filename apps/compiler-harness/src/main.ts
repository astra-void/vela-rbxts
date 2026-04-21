import "./styles.css";

type Diagnostic = {
	level: string;
	code: string;
	message: string;
	token?: string;
};

type TransformResponse =
	| {
			code: string;
			diagnostics: Diagnostic[];
			changed: boolean;
			implementationKind: string;
	  }
	| {
			error: string;
	  };

const defaultSource = `<frame className="rounded-md px-4 bg-surface" />`;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
	throw new Error("Missing #app root.");
}

app.innerHTML = `
	<main class="shell">
		<header class="topbar">
			<div>
				<h1>compiler-harness</h1>
				<p>@rbxts-tailwind/compiler preview</p>
			</div>
			<div class="status-strip" aria-live="polite">
				<span class="status-pill" data-status="idle" id="request-state">idle</span>
				<span class="metric"><b id="changed-state">-</b><span>changed</span></span>
				<span class="metric"><b id="diagnostic-count">0</b><span>diagnostics</span></span>
				<span class="metric"><b id="implementation-kind">-</b><span>impl</span></span>
			</div>
		</header>

		<section class="workspace" aria-label="Compiler workspace">
			<div class="panel input-panel">
				<div class="panel-header">
					<h2>Input TSX</h2>
				</div>
				<textarea id="source-input" spellcheck="false" aria-label="TSX source"></textarea>
				<div class="panel-header config-header">
					<h2>Config JSON</h2>
					<span>optional</span>
				</div>
				<textarea id="config-input" spellcheck="false" aria-label="Compiler config JSON"></textarea>
			</div>

			<div class="panel output-panel">
				<div class="panel-header">
					<h2>Output</h2>
				</div>
				<pre id="output-code" aria-label="Transformed output"><code></code></pre>
			</div>
		</section>

		<section class="diagnostics-panel" aria-label="Compiler diagnostics">
			<div class="panel-header">
				<h2>Diagnostics</h2>
			</div>
			<div id="diagnostics-list" class="diagnostics-list"></div>
		</section>
	</main>
`;

const sourceInput = getElement<HTMLTextAreaElement>("source-input");
const configInput = getElement<HTMLTextAreaElement>("config-input");
const outputCode = getElement<HTMLElement>("output-code").querySelector("code");
const requestState = getElement<HTMLElement>("request-state");
const changedState = getElement<HTMLElement>("changed-state");
const diagnosticCount = getElement<HTMLElement>("diagnostic-count");
const implementationKind = getElement<HTMLElement>("implementation-kind");
const diagnosticsList = getElement<HTMLElement>("diagnostics-list");

if (!(outputCode instanceof HTMLElement)) {
	throw new Error("Missing output code element.");
}

const outputElement = outputCode;

let debounceTimer: number | undefined;
let activeRequest: AbortController | undefined;

sourceInput.value = defaultSource;
configInput.value = "";

sourceInput.addEventListener("input", scheduleTransform);
configInput.addEventListener("input", scheduleTransform);

scheduleTransform();

function scheduleTransform(): void {
	window.clearTimeout(debounceTimer);
	debounceTimer = window.setTimeout(runTransform, 180);
}

async function runTransform(): Promise<void> {
	activeRequest?.abort();
	activeRequest = new AbortController();

	setRequestState("running", "running");

	try {
		const body = {
			source: sourceInput.value,
			configJson: normalizeConfigJson(configInput.value),
		};
		const response = await fetch("/api/transform", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: activeRequest.signal,
		});
		const payload = (await response.json()) as TransformResponse;

		if (!response.ok || "error" in payload) {
			throw new Error("error" in payload ? payload.error : response.statusText);
		}

		renderResult(payload);
		setRequestState("ok", "ready");
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			return;
		}

		const message =
			error instanceof Error
				? error.message
				: "Unknown transform request error.";
		renderError(message);
		setRequestState("error", "error");
	}
}

function normalizeConfigJson(value: string): string | undefined {
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

function renderResult(
	result: Exclude<TransformResponse, { error: string }>,
): void {
	outputElement.textContent = result.code;
	changedState.textContent = result.changed ? "yes" : "no";
	diagnosticCount.textContent = String(result.diagnostics.length);
	implementationKind.textContent = result.implementationKind;

	renderDiagnostics(result.diagnostics);
}

function renderError(message: string): void {
	outputElement.textContent = "";
	changedState.textContent = "-";
	diagnosticCount.textContent = "1";
	implementationKind.textContent = "-";

	renderDiagnostics([
		{
			level: "error",
			code: "harness-request-failed",
			message,
		},
	]);
}

function renderDiagnostics(diagnostics: Diagnostic[]): void {
	if (diagnostics.length === 0) {
		diagnosticsList.innerHTML = `<p class="empty-state">No diagnostics.</p>`;
		return;
	}

	diagnosticsList.replaceChildren(
		...diagnostics.map((diagnostic) => {
			const item = document.createElement("article");
			item.className = `diagnostic diagnostic-${diagnostic.level}`;

			const title = document.createElement("div");
			title.className = "diagnostic-title";

			const level = document.createElement("span");
			level.className = "diagnostic-level";
			level.textContent = diagnostic.level;

			const code = document.createElement("code");
			code.textContent = diagnostic.code;

			title.append(level, code);

			const message = document.createElement("p");
			message.textContent = diagnostic.message;

			item.append(title, message);

			if (diagnostic.token) {
				const token = document.createElement("code");
				token.className = "diagnostic-token";
				token.textContent = diagnostic.token;
				item.append(token);
			}

			return item;
		}),
	);
}

function setRequestState(
	state: "idle" | "running" | "ok" | "error",
	label: string,
): void {
	requestState.dataset.status = state;
	requestState.textContent = label;
}

function getElement<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);

	if (!element) {
		throw new Error(`Missing #${id} element.`);
	}

	return element as T;
}
