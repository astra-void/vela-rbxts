import type { EditorOptions } from "@vela-rbxts/compiler";
import { defaultConfig } from "@vela-rbxts/config";
import { resolveProjectConfigInfo } from "@vela-rbxts/rbxtsc-host";

export function resolveEditorOptions(fileName: string): EditorOptions {
	try {
		const info = resolveProjectConfigInfo(fileName);
		return {
			configJson: JSON.stringify(info.config),
			fileName,
			projectRoot: info.projectRoot,
		};
	} catch {
		return {
			configJson: JSON.stringify(defaultConfig),
			fileName,
		};
	}
}
