import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
	buildTaskScript,
	createClient,
	evaluateTask,
	formatVerdict,
	type LuauTask,
	luauString,
	parseLogs,
	parseReport,
	parseTask,
	parseVersionNumber,
	placeVersionUrl,
	summaryMarkdown,
	taskCreateUrl,
	taskLogsUrl,
	taskUrl,
} from "./open-cloud";

const TASK_PATH =
	"universes/111/places/222/versions/7/luau-execution-sessions/session-1/tasks/task-1";

function report(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		id: "rbxts-harness-7",
		kind: "spec",
		framework: "react",
		ok: true,
		passed: 2,
		failed: 0,
		skipped: 1,
		specs: [
			{ name: "env store", status: "pass", ms: 120.4, detail: {} },
			{ name: "divide", status: "pass", ms: 30 },
			{
				name: "dark:",
				status: "skip",
				reason: "no LocalPlayer to carry VelaColorScheme",
			},
		],
		elapsedMs: 200,
		...overrides,
	});
}

function completed(results: unknown[]): LuauTask {
	return { path: TASK_PATH, state: "COMPLETE", output: { results } };
}

describe("open cloud urls", () => {
	test("targets the place publishing and versioned task endpoints", () => {
		expect(placeVersionUrl("111", "222")).toBe(
			"https://apis.roblox.com/universes/v1/111/places/222/versions?versionType=Saved",
		);
		expect(taskCreateUrl("111", "222", 7)).toBe(
			"https://apis.roblox.com/cloud/v2/universes/111/places/222/versions/7/luau-execution-session-tasks",
		);
		expect(taskUrl(TASK_PATH)).toBe(
			`https://apis.roblox.com/cloud/v2/${TASK_PATH}`,
		);
		expect(taskLogsUrl(TASK_PATH, "next page")).toBe(
			`https://apis.roblox.com/cloud/v2/${TASK_PATH}/logs?maxPageSize=10000&pageToken=next+page`,
		);
	});

	test("rejects ids and task paths that would leave the expected route", () => {
		expect(() => placeVersionUrl("111/../x", "222")).toThrow(/numeric id/);
		expect(() => taskUrl("universes/111/../../users/1")).toThrow(
			/unexpected task path/,
		);
		expect(taskUrl(TASK_PATH.replace("versions/7/", ""))).toContain(
			"/places/222/luau-execution-sessions/",
		);
	});
});

describe("open cloud responses", () => {
	test("reads the version number a place upload returns", () => {
		expect(parseVersionNumber({ versionNumber: 7 })).toBe(7);
		expect(() => parseVersionNumber({ version: 7 })).toThrow(
			/no versionNumber/,
		);
	});

	test("parses a task and keeps only the documented fields", () => {
		expect(
			parseTask({
				path: TASK_PATH,
				state: "FAILED",
				user: "1",
				error: { code: "SCRIPT_ERROR", message: "boom" },
			}),
		).toEqual({
			path: TASK_PATH,
			state: "FAILED",
			error: { code: "SCRIPT_ERROR", message: "boom" },
			output: undefined,
		});
		expect(() => parseTask({ path: TASK_PATH, state: "DONE" })).toThrow(
			/unexpected task response/,
		);
	});

	test("flattens log pages and stops on an empty token", () => {
		expect(
			parseLogs({
				luauExecutionSessionTaskLogs: [
					{ path: "a", messages: ["one", "two"] },
					{ path: "b", messages: ["three"] },
				],
				nextPageToken: "",
			}),
		).toEqual({ messages: ["one", "two", "three"], nextPageToken: undefined });
		expect(parseLogs({ nextPageToken: "t" })).toEqual({
			messages: [],
			nextPageToken: "t",
		});
	});
});

describe("task script", () => {
	test("escapes a request into a Luau string literal", () => {
		expect(luauString('{"a":"b\\\\c"}\n')).toBe(
			'"{\\"a\\":\\"b\\\\\\\\c\\"}\\n"',
		);
		expect(luauString("dark: é")).toBe('"dark: \\u{e9}"');
	});

	test("swaps the request line of the real entry", () => {
		const entry = fs.readFileSync(
			path.join(__dirname, "open-cloud-entry.luau"),
			"utf8",
		);
		const script = buildTaskScript(entry, {
			id: "run-1",
			kind: "spec",
			specs: ["divide: $& order"],
		});

		expect(script).toContain(
			'local REQUEST = "{\\"id\\":\\"run-1\\",\\"kind\\":\\"spec\\",\\"specs\\":[\\"divide: $& order\\"]}"',
		);
		expect(script.match(/^local REQUEST = /gm)).toHaveLength(1);
		expect(script).toContain("return HttpService:JSONEncode(report)");
		expect(() =>
			buildTaskScript("return 1", { id: "x", kind: "spec" }),
		).toThrow(/no `local REQUEST/);
	});
});

describe("task evaluation", () => {
	test("passes a complete run with skips", () => {
		const verdict = evaluateTask(completed([report()]), "rbxts-harness-7");

		expect(verdict.ok).toBe(true);
		expect(verdict.problems).toEqual([]);
		expect(formatVerdict("rbxts-harness", verdict)).toBe(
			[
				"rbxts-harness (react): 2 passed, 0 failed, 1 skipped",
				"  PASS env store (120ms)",
				"  PASS divide (30ms)",
				"  SKIP dark:: no LocalPlayer to carry VelaColorScheme",
			].join("\n"),
		);
	});

	test("fails on a failing spec and counts from the entries", () => {
		const verdict = evaluateTask(
			completed([
				report({
					passed: 3,
					failed: 0,
					specs: [
						{ name: "divide", status: "fail", error: "rank assignment" },
						{ name: "env store", status: "pass" },
					],
				}),
			]),
			"rbxts-harness-7",
		);

		expect(verdict.ok).toBe(false);
		expect(verdict.problems).toEqual(["divide: rank assignment"]);
		expect(verdict.report).toMatchObject({ passed: 1, failed: 1 });
	});

	test("fails when nothing passed", () => {
		const verdict = evaluateTask(
			completed([
				report({ specs: [{ name: "dark:", status: "skip", reason: "x" }] }),
			]),
			"rbxts-harness-7",
		);

		expect(verdict.problems).toEqual(["no spec passed"]);
	});

	test("fails on a stale report, a runner error or a malformed result", () => {
		expect(
			evaluateTask(completed([report()]), "rbxts-harness-8").problems,
		).toEqual(["report answers request rbxts-harness-7, not rbxts-harness-8"]);
		expect(
			evaluateTask(
				completed([
					JSON.stringify({
						id: "rbxts-harness-7",
						framework: "react",
						ok: false,
						error: "bad request",
					}),
				]),
				"rbxts-harness-7",
			).problems,
		).toEqual(["runner error: bad request"]);
		expect(evaluateTask(completed([]), "x").problems[0]).toMatch(/no report/);
		expect(evaluateTask(completed(["{"]), "x").ok).toBe(false);
		expect(() =>
			parseReport({ ok: true, specs: [{ name: "x", status: "maybe" }] }),
		).toThrow(/malformed spec entry/);
	});

	test("reports a failed or cancelled task", () => {
		expect(
			evaluateTask(
				{
					path: TASK_PATH,
					state: "FAILED",
					error: { code: "DEADLINE_EXCEEDED", message: "too slow" },
				},
				"x",
			).problems,
		).toEqual(["task failed (DEADLINE_EXCEEDED): too slow"]);
		expect(
			evaluateTask({ path: TASK_PATH, state: "CANCELLED" }, "x").problems,
		).toEqual(["task ended in state CANCELLED"]);
	});

	test("writes a markdown summary with escaped cells", () => {
		const verdict = evaluateTask(
			completed([
				report({
					specs: [
						{ name: "a | b", status: "fail", error: "line 1\nline 2" },
						{ name: "c", status: "pass" },
					],
				}),
			]),
			"rbxts-harness-7",
		);

		expect(summaryMarkdown("rbxts-harness", verdict)).toBe(
			[
				"### rbxts-harness: failed",
				"",
				"| Spec | Status | Note |",
				"| --- | --- | --- |",
				"| a \\| b | fail | line 1 line 2 |",
				"| c | pass |  |",
				"",
				"- a \\| b: line 1 line 2",
				"",
			].join("\n"),
		);
	});
});

describe("open cloud client", () => {
	function fakeTransport(
		responses: {
			status: number;
			body: unknown;
			headers?: Record<string, string>;
		}[],
	) {
		const calls: { url: string; init: RequestInit }[] = [];
		const waits: number[] = [];
		let clock = 0;

		return {
			calls,
			waits,
			transport: {
				fetch: (async (url: string, init: RequestInit) => {
					calls.push({ url, init });
					const next = responses.shift();
					if (next === undefined) {
						throw new Error(`unexpected request to ${url}`);
					}

					return new Response(JSON.stringify(next.body), {
						status: next.status,
						headers: next.headers,
					});
				}) as typeof fetch,
				wait: async (ms: number) => {
					waits.push(ms);
					clock += ms;
				},
				now: () => clock,
			},
		};
	}

	test("uploads, creates, polls through a retry and pages the logs", async () => {
		const fake = fakeTransport([
			{ status: 200, body: { versionNumber: 7 } },
			{ status: 200, body: { path: TASK_PATH, state: "QUEUED" } },
			{ status: 200, body: { path: TASK_PATH, state: "PROCESSING" } },
			{ status: 429, body: {}, headers: { "retry-after": "2" } },
			{ status: 200, body: completed([report()]) },
			{
				status: 200,
				body: {
					luauExecutionSessionTaskLogs: [{ messages: ["a"] }],
					nextPageToken: "p2",
				},
			},
			{
				status: 200,
				body: { luauExecutionSessionTaskLogs: [{ messages: ["b"] }] },
			},
		]);
		const client = createClient("key", fake.transport);

		const version = await client.uploadPlace(
			"111",
			"222",
			new Uint8Array([1, 2]),
		);
		const created = await client.createTask(
			"111",
			"222",
			version,
			"return 1",
			"300s",
		);
		const task = await client.waitForTask(created.path, {
			intervalMs: 3000,
			deadlineMs: 60_000,
		});
		const logs = await client.listLogs(task.path);

		expect(task.state).toBe("COMPLETE");
		expect(logs).toEqual(["a", "b"]);
		expect(fake.waits).toEqual([3000, 2000]);
		expect(fake.calls.map((call) => call.init.method)).toEqual([
			"POST",
			"POST",
			"GET",
			"GET",
			"GET",
			"GET",
			"GET",
		]);
		expect(fake.calls[0].init.headers).toEqual({
			"content-type": "application/octet-stream",
			"x-api-key": "key",
		});
		expect(JSON.parse(String(fake.calls[1].init.body))).toEqual({
			script: "return 1",
			timeout: "300s",
		});
		expect(fake.calls[6].url).toContain("pageToken=p2");
	});

	test("gives up on a client error and on a task that never settles", async () => {
		const forbidden = fakeTransport([
			{ status: 403, body: { message: "scope" } },
		]);
		await expect(
			createClient("key", forbidden.transport).uploadPlace(
				"111",
				"222",
				new Uint8Array(),
			),
		).rejects.toThrow(/returned 403: {"message":"scope"}/);

		const stuck = fakeTransport(
			Array.from({ length: 5 }, () => ({
				status: 200,
				body: { path: TASK_PATH, state: "PROCESSING" },
			})),
		);
		await expect(
			createClient("key", stuck.transport).waitForTask(TASK_PATH, {
				intervalMs: 3000,
				deadlineMs: 10_000,
			}),
		).rejects.toThrow(/still PROCESSING/);
	});

	test("stops retrying a server error after the last attempt", async () => {
		const failing = fakeTransport(
			Array.from({ length: 4 }, () => ({ status: 503, body: {} })),
		);

		await expect(
			createClient("key", failing.transport).waitForTask(TASK_PATH, {
				intervalMs: 3000,
				deadlineMs: 60_000,
			}),
		).rejects.toThrow(/returned 503/);
		expect(failing.waits).toEqual([2000, 4000, 8000]);
	});
});
