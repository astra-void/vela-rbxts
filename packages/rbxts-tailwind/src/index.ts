import type { ClassValue } from "@rbxts-tailwind/types";

export {
	defineConfig,
	defaultConfig,
	type TailwindConfig,
	type TailwindConfigInput,
} from "@rbxts-tailwind/config";

export {
	createRbxtscTransformerBridge as createTransformer,
} from "@rbxts-tailwind/rbxtsc-host";

export type {
	ClassValue,
	StylableProps,
} from "@rbxts-tailwind/types";

declare global {
	namespace React {
		interface Attributes {
			className?: ClassValue;
		}
	}
}
