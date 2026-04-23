import type ts from "typescript/lib/tsserverlibrary";
import { createVelaRbxtsLanguageServicePlugin } from "./plugin.js";

function init(modules: { typescript: typeof ts }) {
	return {
		create(info: ts.server.PluginCreateInfo) {
			return createVelaRbxtsLanguageServicePlugin(modules.typescript, info);
		},
	};
}

export = init;
