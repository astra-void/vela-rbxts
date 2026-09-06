import { describe, expect, test } from "vitest";

import { packWithRegistryLagRetries } from "./pack-attempt";

function createHarness(packResults: readonly ("ok" | "throw")[]) {
	const results = [...packResults];
	const waits: number[] = [];
	const retries: string[] = [];
	let packCalls = 0;

	return {
		waits,
		retries,
		get packCalls() {
			return packCalls;
		},
		pack: () => {
			const result = results.shift() ?? "throw";
			packCalls += 1;
			if (result === "throw") {
				throw new Error(
					"npm error notarget No matching version found for @vela-rbxts/lsp-darwin-x64@0.13.0.",
				);
			}
		},
		wait: async (ms: number) => {
			waits.push(ms);
		},
		onRetry: (info: { reason: string }) => {
			retries.push(info.reason);
		},
	};
}

describe("pack retries over registry lag", () => {
	test("packs once when npm answers straight away", async () => {
		const harness = createHarness(["ok"]);

		await packWithRegistryLagRetries(harness);

		expect(harness.packCalls).toBe(1);
		expect(harness.waits).toEqual([]);
		expect(harness.retries).toEqual([]);
	});

	test("waits for a version the registry has not caught up with", async () => {
		const harness = createHarness(["throw", "throw", "ok"]);

		await packWithRegistryLagRetries({ ...harness, delayMs: 1_000 });

		expect(harness.packCalls).toBe(3);
		expect(harness.waits).toEqual([1_000, 2_000]);
		expect(harness.retries).toHaveLength(2);
	});

	test("throws what npm said once the attempts run out", async () => {
		const harness = createHarness(["throw", "throw"]);

		await expect(
			packWithRegistryLagRetries({
				...harness,
				attempts: 2,
				delayMs: 1_000,
			}),
		).rejects.toThrow("notarget");

		expect(harness.packCalls).toBe(2);
		expect(harness.waits).toEqual([1_000]);
	});

	test("refuses an attempt budget that would never pack", async () => {
		const harness = createHarness(["ok"]);

		await expect(
			packWithRegistryLagRetries({ ...harness, attempts: 0 }),
		).rejects.toThrow("attempts must be at least 1");

		expect(harness.packCalls).toBe(0);
	});
});
