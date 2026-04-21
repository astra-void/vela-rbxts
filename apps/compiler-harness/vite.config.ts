import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";

type Diagnostic = {
	level: string;
	code: string;
	message: string;
	token?: string;
};

type TransformResult = {
	code: string;
	diagnostics: Diagnostic[];
	changed: boolean;
};

type CompilerBinding = {
	implementationKind(): string;
	transform(
		source: string,
		options?: { configJson?: string } | null,
	): TransformResult;
};

type TransformRequest = {
	source: string;
	configJson?: string;
};

const compilerRequire = createRequire(import.meta.url);

function compilerHarnessApi(): Plugin {
	return {
		name: "compiler-harness-api",
		configureServer(server) {
			server.middlewares.use("/api/transform", async (request, response) => {
				if (request.method !== "POST") {
					sendJson(response, 405, {
						error: "Method not allowed. Use POST /api/transform.",
					});
					return;
				}

				try {
					const body = validateTransformRequest(await readJsonBody(request));
					const compiler = loadCompiler();
					const result = compiler.transform(body.source, {
						configJson: body.configJson,
					});

					sendJson(response, 200, {
						implementationKind: compiler.implementationKind(),
						...result,
					});
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: "Unknown compiler harness error.";
					const status = error instanceof BadRequestError ? 400 : 500;

					sendJson(response, status, {
						error: status === 500 ? formatServerError(message) : message,
					});
				}
			});
		},
	};
}

function loadCompiler(): CompilerBinding {
	try {
		return compilerRequire("@rbxts-tailwind/compiler") as CompilerBinding;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		throw new Error(
			`Failed to load @rbxts-tailwind/compiler native binding. Run "pnpm --filter @rbxts-tailwind/compiler build:native" and restart the harness. Original error: ${message}`,
		);
	}
}

function validateTransformRequest(value: unknown): TransformRequest {
	if (!isRecord(value)) {
		throw new BadRequestError("Request body must be a JSON object.");
	}

	if (typeof value.source !== "string") {
		throw new BadRequestError('Request body field "source" must be a string.');
	}

	if (value.configJson !== undefined && typeof value.configJson !== "string") {
		throw new BadRequestError(
			'Request body field "configJson" must be a string when provided.',
		);
	}

	if (typeof value.configJson === "string") {
		validateConfigJson(value.configJson);
	}

	return {
		source: value.source,
		configJson: value.configJson,
	};
}

function validateConfigJson(configJson: string): void {
	if (configJson.trim() === "") {
		return;
	}

	let parsed: unknown;

	try {
		parsed = JSON.parse(configJson);
	} catch {
		throw new BadRequestError(
			'Request body field "configJson" must contain valid JSON.',
		);
	}

	if (!isRecord(parsed)) {
		throw new BadRequestError(
			'Request body field "configJson" must contain a JSON object.',
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];

	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");

	if (rawBody.trim() === "") {
		throw new BadRequestError("Request body must not be empty.");
	}

	try {
		return JSON.parse(rawBody) as unknown;
	} catch {
		throw new BadRequestError("Request body must be valid JSON.");
	}
}

function sendJson(
	response: ServerResponse,
	statusCode: number,
	payload: Record<string, unknown>,
): void {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.end(JSON.stringify(payload));
}

function formatServerError(message: string): string {
	if (
		message.includes("native binding") ||
		message.includes("Cannot find native")
	) {
		return message;
	}

	return `Compiler harness server error: ${message}`;
}

class BadRequestError extends Error {}

export default defineConfig({
	plugins: [compilerHarnessApi()],
});
