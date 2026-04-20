import { type TransformOptions, transform } from "@rbxts-tailwind/compiler";
import { defaultConfig, type TailwindConfig } from "@rbxts-tailwind/config";
import type { TransformResult } from "@rbxts-tailwind/ir";

export type HostTransformRequest = {
	fileName: string;
	sourceText: string;
	config?: TailwindConfig;
};

export type HostTransformResponse = {
	sourceText: string;
	diagnostics: TransformResult["diagnostics"];
	changed: boolean;
};

export function transformSourceForHost(
	request: HostTransformRequest,
): HostTransformResponse {
	const options: TransformOptions = {
		config: request.config ?? defaultConfig,
	};
	const result = transform(request.sourceText, options);

	return {
		sourceText: result.code,
		diagnostics: result.diagnostics,
		changed: result.changed,
	};
}

export function createRbxtscTransformerBridge() {
	// TODO: Wire this entry point into rbxtsc's transformer host lifecycle.
	// TODO: Keep this package host-only; semantic resolution stays in @rbxts-tailwind/core.
	return {
		name: "@rbxts-tailwind/rbxtsc-host",
		transformSource: transformSourceForHost,
	};
}
