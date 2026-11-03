export const OPEN_CLOUD_ORIGIN = "https://apis.roblox.com";

export type TaskState =
	| "STATE_UNSPECIFIED"
	| "QUEUED"
	| "PROCESSING"
	| "CANCELLED"
	| "COMPLETE"
	| "FAILED";

export type LuauTask = {
	path: string;
	state: TaskState;
	error?: { code?: string; message?: string };
	output?: { results?: unknown[] };
};

export type SpecStatus = "pass" | "fail" | "skip";

export type SpecResult = {
	name: string;
	status: SpecStatus;
	error?: string;
	reason?: string;
	ms?: number;
	detail?: unknown;
};

export type SpecReport =
	| {
			ok: true;
			id?: string;
			kind: string;
			framework: string;
			passed: number;
			failed: number;
			skipped: number;
			specs: SpecResult[];
			elapsedMs?: number;
	  }
	| { ok: false; id?: string; framework?: string; error: string };

export type SpecRequest = { id: string; kind: "spec"; specs?: string[] };

export type Verdict = {
	ok: boolean;
	problems: string[];
	report?: SpecReport;
};

const TASK_STATES = new Set<string>([
	"STATE_UNSPECIFIED",
	"QUEUED",
	"PROCESSING",
	"CANCELLED",
	"COMPLETE",
	"FAILED",
]);
const SETTLED_STATES = new Set<TaskState>(["CANCELLED", "COMPLETE", "FAILED"]);
const REQUEST_LINE = /^local REQUEST = .*$/m;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertId(label: string, value: string): string {
	if (!/^\d+$/.test(value)) {
		throw new Error(`${label} must be a numeric id, got "${value}"`);
	}

	return value;
}

export function assertTimeout(value: string): string {
	if (!/^\d+(\.\d+)?s$/.test(value)) {
		throw new Error(
			`timeout must be a duration such as "300s", got "${value}"`,
		);
	}

	return value;
}

export function placeVersionUrl(universeId: string, placeId: string): string {
	return `${OPEN_CLOUD_ORIGIN}/universes/v1/${assertId("universe", universeId)}/places/${assertId("place", placeId)}/versions?versionType=Saved`;
}

export function taskCreateUrl(
	universeId: string,
	placeId: string,
	versionNumber: number,
): string {
	return `${OPEN_CLOUD_ORIGIN}/cloud/v2/universes/${assertId("universe", universeId)}/places/${assertId("place", placeId)}/versions/${versionNumber}/luau-execution-session-tasks`;
}

export function taskUrl(taskPath: string): string {
	if (
		!/^universes\/\d+\/places\/\d+\/(versions\/\d+\/)?luau-execution-sessions\/[\w-]+\/tasks\/[\w-]+$/.test(
			taskPath,
		)
	) {
		throw new Error(`unexpected task path "${taskPath}"`);
	}

	return `${OPEN_CLOUD_ORIGIN}/cloud/v2/${taskPath}`;
}

export function taskLogsUrl(taskPath: string, pageToken?: string): string {
	const url = new URL(`${taskUrl(taskPath)}/logs`);
	url.searchParams.set("maxPageSize", "10000");
	if (pageToken !== undefined) {
		url.searchParams.set("pageToken", pageToken);
	}

	return url.toString();
}

export function parseVersionNumber(body: unknown): number {
	const version = isRecord(body) ? body.versionNumber : undefined;
	if (typeof version !== "number" || !Number.isInteger(version)) {
		throw new Error(
			`place upload returned no versionNumber: ${JSON.stringify(body)}`,
		);
	}

	return version;
}

export function parseTask(body: unknown): LuauTask {
	if (
		!isRecord(body) ||
		typeof body.path !== "string" ||
		typeof body.state !== "string" ||
		!TASK_STATES.has(body.state)
	) {
		throw new Error(`unexpected task response: ${JSON.stringify(body)}`);
	}

	return {
		path: body.path,
		state: body.state as TaskState,
		error: isRecord(body.error)
			? {
					code:
						typeof body.error.code === "string" ? body.error.code : undefined,
					message:
						typeof body.error.message === "string"
							? body.error.message
							: undefined,
				}
			: undefined,
		output: isRecord(body.output)
			? {
					results: Array.isArray(body.output.results)
						? body.output.results
						: undefined,
				}
			: undefined,
	};
}

export function isSettled(task: LuauTask): boolean {
	return SETTLED_STATES.has(task.state);
}

export function parseLogs(body: unknown): {
	messages: string[];
	nextPageToken?: string;
} {
	if (!isRecord(body)) {
		throw new Error(`unexpected logs response: ${JSON.stringify(body)}`);
	}

	const entries = Array.isArray(body.luauExecutionSessionTaskLogs)
		? body.luauExecutionSessionTaskLogs
		: [];
	const messages = entries.flatMap((entry) =>
		isRecord(entry) && Array.isArray(entry.messages)
			? entry.messages.filter(
					(message): message is string => typeof message === "string",
				)
			: [],
	);
	const token = body.nextPageToken;

	return {
		messages,
		nextPageToken:
			typeof token === "string" && token !== "" ? token : undefined,
	};
}

/// A double-quoted Luau literal; Luau has no `\uXXXX`, only `\u{X}`.
export function luauString(value: string): string {
	let literal = '"';
	for (const character of value) {
		const code = character.codePointAt(0) as number;
		if (character === '"' || character === "\\") {
			literal += `\\${character}`;
		} else if (character === "\n") {
			literal += "\\n";
		} else if (code < 0x20 || code > 0x7e) {
			literal += `\\u{${code.toString(16)}}`;
		} else {
			literal += character;
		}
	}

	return `${literal}"`;
}

export function buildTaskScript(entry: string, request: SpecRequest): string {
	if (!REQUEST_LINE.test(entry)) {
		throw new Error("the Luau entry has no `local REQUEST = ...` line");
	}

	return entry.replace(
		REQUEST_LINE,
		() => `local REQUEST = ${luauString(JSON.stringify(request))}`,
	);
}

function parseSpec(value: unknown): SpecResult | undefined {
	if (
		!isRecord(value) ||
		typeof value.name !== "string" ||
		(value.status !== "pass" &&
			value.status !== "fail" &&
			value.status !== "skip")
	) {
		return undefined;
	}

	return {
		name: value.name,
		status: value.status,
		error: typeof value.error === "string" ? value.error : undefined,
		reason: typeof value.reason === "string" ? value.reason : undefined,
		ms: typeof value.ms === "number" ? value.ms : undefined,
		detail: value.detail,
	};
}

export function parseReport(raw: unknown): SpecReport {
	const body = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
	if (!isRecord(body) || typeof body.ok !== "boolean") {
		throw new Error(`unexpected report: ${JSON.stringify(body)}`);
	}

	const id = typeof body.id === "string" ? body.id : undefined;
	const framework =
		typeof body.framework === "string" ? body.framework : undefined;
	if (!body.ok) {
		return { ok: false, id, framework, error: String(body.error) };
	}

	const specs = Array.isArray(body.specs) ? body.specs.map(parseSpec) : [];
	if (specs.some((spec) => spec === undefined)) {
		throw new Error(`malformed spec entry in ${JSON.stringify(body.specs)}`);
	}
	const results = specs as SpecResult[];
	const count = (status: SpecStatus) =>
		results.filter((spec) => spec.status === status).length;

	return {
		ok: true,
		id,
		kind: String(body.kind),
		framework: framework ?? "unknown",
		passed: count("pass"),
		failed: count("fail"),
		skipped: count("skip"),
		specs: results,
		elapsedMs: typeof body.elapsedMs === "number" ? body.elapsedMs : undefined,
	};
}

export function evaluateTask(task: LuauTask, requestId: string): Verdict {
	if (task.state === "FAILED") {
		return {
			ok: false,
			problems: [
				`task failed (${task.error?.code ?? "no code"}): ${task.error?.message ?? "no message"}`,
			],
		};
	}
	if (task.state !== "COMPLETE") {
		return { ok: false, problems: [`task ended in state ${task.state}`] };
	}

	const raw = task.output?.results?.[0];
	if (typeof raw !== "string") {
		return {
			ok: false,
			problems: [
				`task returned no report: ${JSON.stringify(task.output?.results)}`,
			],
		};
	}

	let report: SpecReport;
	try {
		report = parseReport(raw);
	} catch (error) {
		return {
			ok: false,
			problems: [error instanceof Error ? error.message : String(error)],
		};
	}

	const problems: string[] = [];
	if (report.id !== requestId) {
		problems.push(
			`report answers request ${report.id ?? "(none)"}, not ${requestId}`,
		);
	}
	if (!report.ok) {
		problems.push(`runner error: ${report.error}`);
		return { ok: false, problems, report };
	}
	if (report.kind !== "spec") {
		problems.push(`report kind is ${report.kind}, not spec`);
	}
	for (const spec of report.specs) {
		if (spec.status === "fail") {
			problems.push(`${spec.name}: ${spec.error ?? "failed"}`);
		}
	}
	// A run where everything skipped proves nothing.
	if (report.passed === 0) {
		problems.push("no spec passed");
	}

	return { ok: problems.length === 0, problems, report };
}

export function formatVerdict(label: string, verdict: Verdict): string {
	const lines: string[] = [];
	const report = verdict.report;
	if (report?.ok) {
		lines.push(
			`${label} (${report.framework}): ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`,
		);
		for (const spec of report.specs) {
			const timing = spec.ms === undefined ? "" : ` (${Math.round(spec.ms)}ms)`;
			const note =
				spec.status === "fail"
					? `: ${spec.error ?? ""}`
					: spec.status === "skip"
						? `: ${spec.reason ?? ""}`
						: "";
			lines.push(`  ${spec.status.toUpperCase()} ${spec.name}${timing}${note}`);
		}
	} else {
		lines.push(`${label}: no spec results`);
	}
	for (const problem of verdict.problems) {
		lines.push(`  problem: ${problem}`);
	}

	return lines.join("\n");
}

function cell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function summaryMarkdown(label: string, verdict: Verdict): string {
	const lines = [`### ${label}: ${verdict.ok ? "passed" : "failed"}`, ""];
	if (verdict.report?.ok) {
		lines.push("| Spec | Status | Note |", "| --- | --- | --- |");
		for (const spec of verdict.report.specs) {
			lines.push(
				`| ${cell(spec.name)} | ${spec.status} | ${cell(spec.error ?? spec.reason ?? "")} |`,
			);
		}
		lines.push("");
	}
	for (const problem of verdict.problems) {
		lines.push(`- ${cell(problem)}`);
	}

	return `${lines.join("\n")}\n`;
}

export type Transport = {
	fetch: typeof fetch;
	wait: (ms: number) => Promise<void>;
	now: () => number;
};

const MAX_ATTEMPTS = 4;

function retryDelay(attempt: number, retryAfter: string | null): number {
	const seconds = retryAfter === null ? Number.NaN : Number(retryAfter);

	return Number.isFinite(seconds) && seconds >= 0
		? seconds * 1000
		: 2 ** attempt * 1000;
}

export function createClient(apiKey: string, transport: Transport) {
	async function send(
		url: string,
		init: { method: string; headers?: Record<string, string>; body?: BodyInit },
	): Promise<unknown> {
		for (let attempt = 1; ; attempt += 1) {
			const response = await transport.fetch(url, {
				...init,
				headers: { ...init.headers, "x-api-key": apiKey },
			});
			if (response.ok) {
				return response.json();
			}

			const retryable = response.status === 429 || response.status >= 500;
			if (!retryable || attempt >= MAX_ATTEMPTS) {
				const text = (await response.text()).slice(0, 500);
				throw new Error(
					`${init.method} ${url.split("?")[0]} returned ${response.status}: ${text}`,
				);
			}
			await transport.wait(
				retryDelay(attempt, response.headers.get("retry-after")),
			);
		}
	}

	return {
		async uploadPlace(
			universeId: string,
			placeId: string,
			place: Uint8Array,
		): Promise<number> {
			return parseVersionNumber(
				await send(placeVersionUrl(universeId, placeId), {
					method: "POST",
					headers: { "content-type": "application/octet-stream" },
					body: new Uint8Array(place),
				}),
			);
		},

		async createTask(
			universeId: string,
			placeId: string,
			versionNumber: number,
			script: string,
			timeout: string,
		): Promise<LuauTask> {
			return parseTask(
				await send(taskCreateUrl(universeId, placeId, versionNumber), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ script, timeout: assertTimeout(timeout) }),
				}),
			);
		},

		async waitForTask(
			taskPath: string,
			options: { intervalMs: number; deadlineMs: number },
		): Promise<LuauTask> {
			const started = transport.now();
			for (;;) {
				const task = parseTask(
					await send(taskUrl(taskPath), { method: "GET" }),
				);
				if (isSettled(task)) {
					return task;
				}
				if (transport.now() - started > options.deadlineMs) {
					throw new Error(
						`task ${taskPath} still ${task.state} after ${options.deadlineMs}ms`,
					);
				}
				await transport.wait(options.intervalMs);
			}
		},

		async listLogs(taskPath: string): Promise<string[]> {
			const messages: string[] = [];
			let pageToken: string | undefined;
			do {
				const page = parseLogs(
					await send(taskLogsUrl(taskPath, pageToken), { method: "GET" }),
				);
				messages.push(...page.messages);
				pageToken = page.nextPageToken;
			} while (pageToken !== undefined);

			return messages;
		},
	};
}
