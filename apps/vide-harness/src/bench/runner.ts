import {
	HttpService,
	Players,
	ReplicatedStorage,
	RunService,
	Stats,
} from "@rbxts/services";
import { __VelaEnv, __VelaScope } from "@rbxts/vela-runtime-core";

/// Instances, unlike `_G` and the module cache, cross the execute_luau sandbox.
export namespace VelaBench {
	export const REQUEST_ATTRIBUTE = "VelaBenchRequest";
	export const STATUS_ATTRIBUTE = "VelaBenchStatus";
	export const RESULT_NAME = "VelaBenchResult";
	export const LOG_PREFIX = "VELA_BENCH";
	export const COLOR_SCHEME_ATTRIBUTE = "VelaColorScheme";

	/// Mounts are split so one resume never holds Studio for a whole N=1000 tree.
	export const CHUNK = 250;
	const FRAME_SAMPLES = 60;
	const DEFAULT_COUNTS = [100, 1000];

	export type Metrics = Record<string, number | string | boolean>;

	export type Context = {
		container: Instance;
		count: number;
		metrics: Metrics;
	};

	export type Scenario = {
		name: string;
		/// Runs once per requested count; otherwise once at this count.
		sized: boolean;
		count?: number;
		run: (context: Context) => void;
	};

	export type Spec = {
		name: string;
		/// What it returns is reported beside the verdict.
		run: (container: Instance) => object | undefined;
	};

	type Request = {
		id?: string;
		kind?: "bench" | "spec";
		scenarios?: string[];
		specs?: string[];
		counts?: number[];
		runs?: number;
	};

	const SKIP = "__vela_bench_skip__";

	export function skip(reason: string): never {
		error(`${SKIP}${reason}`, 0);
	}

	export function time(metrics: Metrics, label: string, work: () => void) {
		const started = os.clock();
		work();
		const elapsed = (os.clock() - started) * 1000;
		metrics[label] = ((metrics[label] as number | undefined) ?? 0) + elapsed;
	}

	/// Deferred signals run their handlers after `work` returns; resuming behind them keeps them in the span.
	export function timeHandlers(
		metrics: Metrics,
		label: string,
		work: () => void,
	) {
		time(metrics, label, () => {
			work();
			task.defer(coroutine.running());
			coroutine.yield();
		});
	}

	export function settle(frames = 3) {
		for (let index = 0; index < frames; index += 1) {
			RunService.Heartbeat.Wait();
		}
	}

	function percentile(sorted: number[], fraction: number): number {
		const index = math.clamp(
			math.ceil(sorted.size() * fraction) - 1,
			0,
			sorted.size() - 1,
		);

		return sorted[index];
	}

	export function frames(metrics: Metrics, label: string) {
		const samples: number[] = [];
		for (let index = 0; index < FRAME_SAMPLES; index += 1) {
			samples.push(RunService.RenderStepped.Wait()[0] * 1000);
		}
		samples.sort((a, b) => a < b);
		metrics[`${label}FrameP50Ms`] = percentile(samples, 0.5);
		metrics[`${label}FrameP95Ms`] = percentile(samples, 0.95);
	}

	/// Passive effects subscribe after commit, so the counts settle a few frames late.
	export function snapshot(metrics: Metrics, label: string) {
		settle();
		metrics[`${label}GcKb`] = gcinfo();
		metrics[`${label}LuaHeapMb`] = Stats.GetMemoryUsageMbForTag(
			Enum.DeveloperMemoryTag.LuaHeap,
		);
		metrics[`${label}Instances`] = Stats.InstanceCount;
		metrics[`${label}Listeners`] = __VelaEnv.listenerCount();
	}

	export function listenerCount(): number {
		return __VelaEnv.listenerCount();
	}

	export function observedScopeCount(): number {
		return __VelaScope.observedCount();
	}

	export function followedTagCount(): number {
		return __VelaScope.followedTagCount();
	}

	/// Wall time until `done` holds, polled once per frame.
	export function waitUntil(
		metrics: Metrics,
		label: string,
		done: () => boolean,
		timeout = 10,
	) {
		const started = os.clock();
		let elapsedFrames = 0;
		while (!done()) {
			if (os.clock() - started > timeout) {
				error(`${label} did not settle within ${timeout}s`, 0);
			}
			RunService.Heartbeat.Wait();
			elapsedFrames += 1;
		}
		metrics[`${label}Ms`] = (os.clock() - started) * 1000;
		metrics[`${label}Frames`] = elapsedFrames;
	}

	export function chunkSizes(count: number): number[] {
		const sizes: number[] = [];
		for (let start = 0; start < count; start += CHUNK) {
			sizes.push(math.min(CHUNK, count - start));
		}

		return sizes;
	}

	export function chunkContainer(parent: Instance, index: number): Frame {
		const frame = new Instance("Frame");
		frame.Name = `chunk-${index}`;
		frame.BackgroundTransparency = 1;
		frame.Size = UDim2.fromScale(1, 1);
		frame.Parent = parent;

		return frame;
	}

	export function colorScheme(): unknown {
		return Players.LocalPlayer?.GetAttribute(COLOR_SCHEME_ATTRIBUTE);
	}

	export function setColorScheme(scheme: unknown) {
		const player = Players.LocalPlayer;
		if (player === undefined) {
			skip("no LocalPlayer to carry VelaColorScheme");
		}
		player.SetAttribute(COLOR_SCHEME_ATTRIBUTE, scheme as AttributeValue);
	}

	export function assertEqual(
		actual: unknown,
		expected: unknown,
		label: string,
	) {
		if (actual !== expected) {
			error(
				`${label}: expected ${tostring(expected)}, got ${tostring(actual)}`,
				0,
			);
		}
	}

	function selected<T extends { name: string }>(
		all: T[],
		names: string[] | undefined,
	): T[] {
		if (names === undefined || names.size() === 0) {
			return all;
		}

		return all.filter((entry) => names.includes(entry.name));
	}

	function runBench(
		root: Instance,
		scenarios: Scenario[],
		request: Request,
	): defined[] {
		const counts = request.counts ?? DEFAULT_COUNTS;
		const runs = request.runs ?? 1;
		const results: defined[] = [];

		for (const scenario of selected(scenarios, request.scenarios)) {
			const sizes = scenario.sized ? counts : [scenario.count ?? 1];
			for (const count of sizes) {
				for (let run = 1; run <= runs; run += 1) {
					const container = chunkContainer(root, 0);
					container.Name = `${scenario.name}-${count}`;
					const metrics: Metrics = {};
					const started = os.clock();
					const [ok, failure] = pcall(() =>
						scenario.run({ container, count, metrics }),
					);
					container.Destroy();
					results.push({
						scenario: scenario.name,
						count,
						run,
						ok,
						error: ok ? undefined : tostring(failure),
						wallMs: (os.clock() - started) * 1000,
						metrics,
					});
					task.wait();
				}
			}
		}

		return results;
	}

	function runSpecs(root: Instance, specs: Spec[], request: Request) {
		const results: defined[] = [];
		let passed = 0;
		let failed = 0;
		let skipped = 0;

		for (const spec of selected(specs, request.specs)) {
			const container = chunkContainer(root, 0);
			container.Name = spec.name;
			const started = os.clock();
			const [ok, outcome] = pcall(() => spec.run(container));
			container.Destroy();
			const message = ok ? undefined : tostring(outcome);
			const status = ok
				? "pass"
				: message !== undefined && message.find(SKIP, 1, true)[0] !== undefined
					? "skip"
					: "fail";
			if (status === "pass") {
				passed += 1;
			} else if (status === "skip") {
				skipped += 1;
			} else {
				failed += 1;
			}
			results.push({
				name: spec.name,
				status,
				error: status === "fail" ? message : undefined,
				detail: ok ? outcome : undefined,
				reason: status === "skip" ? message?.gsub(SKIP, "")[0] : undefined,
				ms: (os.clock() - started) * 1000,
			});
			task.wait();
		}

		return { passed, failed, skipped, specs: results };
	}

	function benchRoot(): Instance {
		const player = Players.LocalPlayer;
		const gui = new Instance("ScreenGui");
		gui.Name = "VelaBench";
		gui.ResetOnSpawn = false;
		gui.IgnoreGuiInset = true;
		gui.Parent = player?.WaitForChild("PlayerGui") ?? ReplicatedStorage;

		return gui;
	}

	export function serve(
		framework: string,
		scenarios: Scenario[],
		specs: Spec[],
		settings?: Metrics,
	) {
		const result = new Instance("StringValue");
		result.Name = RESULT_NAME;
		result.Parent = ReplicatedStorage;
		const root = benchRoot();
		let busy = false;

		function handle() {
			const raw = ReplicatedStorage.GetAttribute(REQUEST_ATTRIBUTE);
			if (!typeIs(raw, "string") || raw === "" || busy) {
				return;
			}

			busy = true;
			ReplicatedStorage.SetAttribute(STATUS_ATTRIBUTE, "running");
			const started = os.clock();
			const [ok, payload] = pcall(() => {
				const request = HttpService.JSONDecode(raw) as Request;
				const kind = request.kind ?? "bench";
				const body =
					kind === "spec"
						? runSpecs(root, specs, request)
						: { results: runBench(root, scenarios, request) };

				return { id: request.id, kind, framework, settings, ...body };
			});
			const report = ok
				? {
						...(payload as object),
						ok: true,
						elapsedMs: (os.clock() - started) * 1000,
					}
				: { framework, ok: false, error: tostring(payload) };
			const json = HttpService.JSONEncode(report);
			result.Value = json;
			ReplicatedStorage.SetAttribute(STATUS_ATTRIBUTE, ok ? "done" : "error");
			print(`${LOG_PREFIX} ${json}`);
			busy = false;
		}

		ReplicatedStorage.GetAttributeChangedSignal(REQUEST_ATTRIBUTE).Connect(() =>
			task.spawn(handle),
		);
		ReplicatedStorage.SetAttribute(STATUS_ATTRIBUTE, "ready");
		print(`${LOG_PREFIX} ready ${framework}`);
	}
}
