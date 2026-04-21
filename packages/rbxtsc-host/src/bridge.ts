import { getHostFileEligibility, isTransformableHostFile } from "./filter.js";
import { transformSourceForHost } from "./transform.js";
import type {
	HostTransformRequest,
	RbxtscTransformerBridge,
	RbxtscTransformerBridgeOptions,
} from "./types.js";

export function createRbxtscTransformerBridge(
	options: RbxtscTransformerBridgeOptions = {},
): RbxtscTransformerBridge {
	const transformFile = (request: HostTransformRequest) =>
		transformSourceForHost(request, options);

	return {
		name: "@rbxts-tailwind/rbxtsc-host",
		getFileEligibility(sourceFile) {
			return getHostFileEligibility(sourceFile, options.filter);
		},
		shouldTransformFile(sourceFile) {
			return isTransformableHostFile(sourceFile, options.filter);
		},
		transformSource: transformFile,
		transformFile,
	};
}
