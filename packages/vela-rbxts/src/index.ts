import type { ClassValue } from "@vela-rbxts/types";

export {
	type AttributeVariant,
	defaultConfig,
	defineConfig,
	definePreset,
	type MotionDriver,
	type PluginApi,
	type PluginHandler,
	type PluginPropMap,
	type PluginUtilities,
	type PluginUtilityValue,
	type PluginVariants,
	plugin,
	type ResolvedPlugins,
	type ResolvedPluginsInput,
	type TailwindConfig,
	type TailwindConfigInput,
	type ThemeScreens,
	type VariantAttributeValue,
	type VariantDefinition,
	type VelaPlugin,
	type VelaPreset,
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

	// Vide's analogue of `React.Attributes`: `ActionAttributes` carries it to
	// every intrinsic and `JSX.IntrinsicAttributes` to every component. It is a
	// UMD global, so this is where the augmentation merges. A Vide prop may be
	// a source, and a class value is no exception.
	namespace Vide {
		interface Attributes {
			className?: ClassValue | (() => ClassValue);
		}
	}
}
