export type PackAttemptOptions = {
	pack: () => void;
	wait: (ms: number) => Promise<void>;
	attempts?: number;
	delayMs?: number;
	onRetry?: (info: {
		attempt: number;
		delayMs: number;
		reason: string;
	}) => void;
};

export const DEFAULT_PACK_ATTEMPTS = 5;
export const DEFAULT_PACK_DELAY_MS = 5_000;

function describeError(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

// A version npm has accepted is not readable the same instant, and the VSIX is
// cut from packages published minutes earlier, so `npm pack` answers ETARGET
// for one platform while its neighbour downloads. The delay doubles because the
// lag is measured in minutes, and the last failure is thrown as it stands so a
// version that really is absent still reports what npm said about it.
export async function packWithRegistryLagRetries(options: PackAttemptOptions) {
	const attempts = options.attempts ?? DEFAULT_PACK_ATTEMPTS;
	const delayMs = options.delayMs ?? DEFAULT_PACK_DELAY_MS;

	if (attempts < 1) {
		throw new Error(`attempts must be at least 1, got ${attempts}.`);
	}

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			options.pack();
			return;
		} catch (error) {
			if (attempt === attempts) {
				throw error;
			}

			const waitMs = delayMs * 2 ** (attempt - 1);
			options.onRetry?.({
				attempt,
				delayMs: waitMs,
				reason: describeError(error),
			});
			await options.wait(waitMs);
		}
	}
}
