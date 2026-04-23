import type ts from "typescript/lib/tsserverlibrary";
import { createRbxtsTailwindLanguageServicePlugin } from "./plugin.js";

function init(modules: { typescript: typeof ts }) {
	return {
		create(info: ts.server.PluginCreateInfo) {
			return createRbxtsTailwindLanguageServicePlugin(modules.typescript, info);
		},
	};
}

export = init;
