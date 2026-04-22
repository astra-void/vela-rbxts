import fs from "node:fs";
import path from "node:path";

import type { TailwindConfig } from "@rbxts-tailwind/config";

import type { HostRuntimeArtifact } from "./types.js";

export const RUNTIME_ARTIFACT_MODULE_SPECIFIER = "rbxts-tailwind/runtime-host";
export const RUNTIME_ARTIFACT_RELATIVE_PATH = path.join(
	"include",
	"rbxts-tailwind",
	"runtime-host.ts",
);

export function writeRuntimeArtifact(
	projectRoot: string,
	config: TailwindConfig,
): HostRuntimeArtifact {
	const fileName = path.join(projectRoot, RUNTIME_ARTIFACT_RELATIVE_PATH);
	const sourceText = renderRuntimeArtifactSource(config);

	fs.mkdirSync(path.dirname(fileName), { recursive: true });
	fs.writeFileSync(fileName, sourceText, "utf8");

	return {
		fileName,
		moduleSpecifier: RUNTIME_ARTIFACT_MODULE_SPECIFIER,
		sourceText,
	};
}

function renderRuntimeArtifactSource(config: TailwindConfig): string {
	return [
		'import { createTailwindRuntimeHost } from "rbxts-tailwind/runtime";',
		"",
		`export const TailwindRuntimeHost = createTailwindRuntimeHost(${JSON.stringify(
			config,
			null,
			2,
		)});`,
		"",
	].join("\n");
}
