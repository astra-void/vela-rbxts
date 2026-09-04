/**
 * The variant vocabulary the compiler, the runtime and the editor all read.
 * Screens come from `theme.screens` and state variants from `addVariant`, so
 * only the fixed prefixes live here.
 */

/** Roblox attribute values a variant can compare against. */
export type VariantAttributeValue = string | number | boolean;

/**
 * A project-defined variant. It matches while the styled instance carries the
 * named Roblox attribute with this value, so the condition is read off the
 * instance rather than off the viewport.
 */
export type AttributeVariant = {
	attribute: string;
	equals: VariantAttributeValue;
};

export type VariantDefinition = AttributeVariant;

export type PluginVariants = Record<string, VariantDefinition>;

/**
 * Variant prefixes that are not a screen and not registered by a plugin. A
 * plugin may not take one of these names, and neither may a screen.
 */
export const BUILT_IN_VARIANTS = [
	"portrait",
	"landscape",
	"touch",
	"mouse",
	"gamepad",
	"hover",
	"active",
	"focus",
	"dark",
] as const;

export type BuiltInVariant = (typeof BUILT_IN_VARIANTS)[number];

/** The prefix a maximum-width variant is written with: `max-md:`. */
export const MAX_WIDTH_VARIANT_PREFIX = "max-";

/** The prefix a variant that names a Roblox attribute inline is written with. */
export const ATTRIBUTE_VARIANT_PREFIX = "attr-";

// Roblox attribute names are letters, digits and underscores, and cannot lead
// with a digit.
const ATTRIBUTE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// A variant is a class-token prefix, so it may not carry the `:` that separates
// it, nor the brackets an arbitrary value is written with.
const VARIANT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function isValidVariantName(name: string): boolean {
	return VARIANT_NAME_PATTERN.test(name);
}

export function isValidAttributeName(name: string): boolean {
	return ATTRIBUTE_NAME_PATTERN.test(name);
}

export function isBuiltInVariant(name: string): boolean {
	return (BUILT_IN_VARIANTS as readonly string[]).includes(name);
}

/**
 * Whether a name would be read as something other than a plain variant: a
 * maximum-width range, or an inline attribute variant.
 */
export function isReservedVariantPrefix(name: string): boolean {
	return (
		name.startsWith(MAX_WIDTH_VARIANT_PREFIX) ||
		name.startsWith(ATTRIBUTE_VARIANT_PREFIX)
	);
}
