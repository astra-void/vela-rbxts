import type { EditorOptions } from "@vela-rbxts/compiler";
import { defaultConfig } from "@vela-rbxts/config";
import { resolveProjectConfigInfo } from "@vela-rbxts/rbxtsc-host";
import { dirname, resolve } from "node:path";

export function resolveEditorOptions(fileName: string): EditorOptions {
	try {
		const info = resolveProjectConfigInfo(fileName);
		return {
			configJson: JSON.stringify(info.config ?? defaultConfig),
			fileName,
			projectRoot: info.projectRoot || dirname(resolve(fileName)),
		};
	} catch {
		return {
			configJson: JSON.stringify(defaultConfig),
			fileName,
			projectRoot: dirname(resolve(fileName)),
		};
	}
}
