import type { ClassValue } from "@vela-rbxts/types";

export {
	defaultConfig,
	defineConfig,
	type TailwindConfig,
	type TailwindConfigInput,
} from "@vela-rbxts/config";

export { createRbxtscTransformerBridge as createTransformer } from "@vela-rbxts/rbxtsc-host";
export type {
	ClassValue,
	StylableProps,
} from "@vela-rbxts/types";

declare global {
	namespace React {
		interface Attributes {
			className?: ClassValue;
		}
	}
}
