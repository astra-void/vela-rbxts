import { transform } from "@rbxts-tailwind/compiler";
import { defaultConfig, type TailwindConfig } from "@rbxts-tailwind/config";

export type HostTransformRequest = {
	fileName: string;
	sourceText: string;
	config?: TailwindConfig;
};

export type HostTransformResponse = {
	sourceText: string;
	diagnostics: ReturnType<typeof transform>["diagnostics"];
	changed: boolean;
};

export function transformSourceForHost(
	request: HostTransformRequest,
): HostTransformResponse {
	const result = transform(request.sourceText, {
		configJson: JSON.stringify(request.config ?? defaultConfig),
	});

	return {
		sourceText: result.code,
		diagnostics: result.diagnostics,
		changed: result.changed,
	};
}

export function createRbxtscTransformerBridge() {
	// TODO: Wire this entry point into rbxtsc's transformer host lifecycle.
	// TODO: Keep this package host-only; semantic resolution stays in @rbxts-tailwind/compiler.
	return {
		name: "@rbxts-tailwind/rbxtsc-host",
		transformSource: transformSourceForHost,
	};
}
