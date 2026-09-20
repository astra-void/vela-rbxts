import type { ThemeConfig } from "./index.js";
import {
	isBuiltInVariant,
	isReservedVariantPrefix,
	isValidAttributeName,
	isValidVariantName,
	type PluginVariants,
	type VariantDefinition,
} from "./variants.js";

/** Roblox property assignments, written as roblox-ts expression strings. */
export type PluginPropMap = Record<string, string>;

/** A plugin utility is either a utility class list or a Roblox property map. */
export type PluginUtilityValue = string | PluginPropMap;

export type PluginUtilities = Record<string, PluginUtilityValue>;

/**
 * Where the module that drives `transition`/`animate-*` lives. It is imported
 * by the inlined runtime host, so the specifier has to resolve from any module
 * in the project — a package name or a `baseUrl`-relative path, never `./`.
 */
export type MotionDriver = {
	module: string;
	/** Named export to import; the default export when omitted. */
	export?: string;
};

export type PluginApi = {
	addUtilities(utilities: PluginUtilities): void;
	/**
	 * Registers a runtime condition of the project's own, usable as a `name:`
	 * prefix on any class. The condition is read off the styled Roblox instance,
	 * so the runtime subscribes to that attribute only where a rule needs it.
	 */
	addVariant(name: string, definition: VariantDefinition): void;
	setMotionDriver(driver: MotionDriver): void;
	theme: ThemeAccessor;
};

export type ThemeAccessor = (path: string, defaultValue?: string) => string;

export type PluginHandler = (api: PluginApi) => void;

export type VelaPlugin = {
	name?: string;
	handler: PluginHandler;
};

/**
 * Everything the plugins of a config contributed, in the shape the compiler and
 * the inlined runtime host both read. Sections are namespaced so a later
 * extension point lands beside `utilities` instead of reshaping the payload.
 */
export type ResolvedPlugins = {
	utilities: PluginUtilities;
	variants: PluginVariants;
	motion?: MotionDriver;
};

/**
 * The already-resolved shape a `vela.config.json` states, where a function
 * cannot live. Every section is optional: a config written before a section
 * existed still states a complete set of what it knew about.
 */
export type ResolvedPluginsInput = {
	utilities?: PluginUtilities;
	variants?: PluginVariants;
	motion?: MotionDriver;
};

export type PluginsInput = readonly VelaPlugin[] | ResolvedPluginsInput;

export function plugin(
	handler: PluginHandler,
	options: { name?: string } = {},
): VelaPlugin {
	if (typeof handler !== "function") {
		throw new Error("plugin() expects a function.");
	}

	return { name: options.name, handler };
}

export function emptyResolvedPlugins(): ResolvedPlugins {
	return { utilities: {}, variants: {} };
}

export function runPlugins(
	plugins: PluginsInput | undefined,
	theme: ThemeConfig,
	base: ResolvedPlugins,
): ResolvedPlugins {
	const resolved: ResolvedPlugins = {
		utilities: { ...base.utilities },
		variants: { ...base.variants },
	};

	if (base.motion) {
		resolved.motion = base.motion;
	}

	if (!plugins) {
		return resolved;
	}

	// `vela.config.json` cannot hold a function, so the already-resolved shape
	// is accepted as written.
	if (!Array.isArray(plugins)) {
		const stated = plugins as ResolvedPluginsInput;

		for (const [name, value] of Object.entries(stated.utilities ?? {})) {
			const key = normalizeUtilityName(name, "plugins.utilities");
			resolved.utilities[key] = normalizeUtilityValue(
				value,
				"plugins.utilities",
				key,
			);
		}

		for (const [name, value] of Object.entries(stated.variants ?? {})) {
			resolved.variants[normalizeVariantName(name, "plugins.variants", theme)] =
				normalizeVariantDefinition(value, "plugins.variants", name);
		}

		if (stated.motion) {
			resolved.motion = normalizeMotionDriver(stated.motion, "plugins.motion");
		}

		return resolved;
	}

	const themeAccessor = createThemeAccessor(theme);

	plugins.forEach((entry, index) => {
		const label = entry?.name ?? `plugins[${index}]`;

		if (typeof entry?.handler !== "function") {
			throw new Error(
				`${label} is not a vela plugin; wrap the function with plugin().`,
			);
		}

		const api: PluginApi = {
			theme: themeAccessor,
			addUtilities(utilities: PluginUtilities) {
				for (const [name, value] of Object.entries(utilities ?? {})) {
					const key = normalizeUtilityName(name, label);
					resolved.utilities[key] = normalizeUtilityValue(value, label, key);
				}
			},
			addVariant(name: string, definition: VariantDefinition) {
				resolved.variants[normalizeVariantName(name, label, theme)] =
					normalizeVariantDefinition(definition, label, name);
			},
			setMotionDriver(driver: MotionDriver) {
				resolved.motion = normalizeMotionDriver(driver, label);
			},
		};

		entry.handler(api);
	});

	return resolved;
}

function createThemeAccessor(theme: ThemeConfig): ThemeAccessor {
	return (path, defaultValue) => {
		const value = readThemePath(theme, path);

		if (value !== undefined) {
			return value;
		}

		if (defaultValue !== undefined) {
			return defaultValue;
		}

		throw new Error(`theme("${path}") is not a key of the resolved theme.`);
	};
}

function readThemePath(theme: ThemeConfig, path: string): string | undefined {
	const segments = path.split(".");
	let current: unknown = theme;

	for (const segment of segments) {
		if (typeof current !== "object" || current === null) {
			return undefined;
		}

		current = (current as Record<string, unknown>)[segment];
	}

	if (typeof current === "string") {
		return current;
	}

	// `theme("colors.blue")` reads the palette's DEFAULT, the way `bg-blue` does.
	if (typeof current === "object" && current !== null) {
		const fallback = (current as Record<string, unknown>).DEFAULT;
		return typeof fallback === "string" ? fallback : undefined;
	}

	return undefined;
}

// Tailwind plugins name utilities with a CSS selector; the leading dot is
// dropped so the same source reads as a vela class token.
const UTILITY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PROP_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizeUtilityName(name: string, label: string): string {
	const key = name.startsWith(".") ? name.slice(1) : name;

	if (!UTILITY_NAME_PATTERN.test(key)) {
		throw new Error(
			`${label} registered "${name}", which is not a usable class name. Use letters, digits, "-", and "_"; variants such as "hover:" belong on the className.`,
		);
	}

	return key;
}

function normalizeVariantName(
	name: string,
	label: string,
	theme: ThemeConfig,
): string {
	const key = typeof name === "string" ? name.trim() : "";

	if (!isValidVariantName(key)) {
		throw new Error(
			`${label} registered the variant "${name}", which is not a usable class prefix. Use letters, digits, "-", and "_"; the ":" that separates a variant belongs on the className.`,
		);
	}

	if (isBuiltInVariant(key)) {
		throw new Error(
			`${label} registered the variant "${key}", which is a built-in vela variant. Pick another name.`,
		);
	}

	if (isReservedVariantPrefix(key)) {
		throw new Error(
			`${label} registered the variant "${key}", whose prefix vela reads as a breakpoint range ("max-*") or an inline attribute variant ("attr-*"). Pick another name.`,
		);
	}

	if (theme.screens[key] !== undefined) {
		throw new Error(
			`${label} registered the variant "${key}", which is already a breakpoint in theme.screens. Pick another name.`,
		);
	}

	return key;
}

function normalizeVariantDefinition(
	definition: VariantDefinition,
	label: string,
	name: string,
): VariantDefinition {
	if (
		typeof definition !== "object" ||
		definition === null ||
		Array.isArray(definition)
	) {
		throw new Error(
			`${label} registered the variant "${name}" with no definition. A variant names a Roblox attribute, as { attribute: "State", equals: "open" }.`,
		);
	}

	const attribute =
		typeof definition.attribute === "string" ? definition.attribute.trim() : "";

	if (!isValidAttributeName(attribute)) {
		throw new Error(
			`${label} registered the variant "${name}" with the attribute "${definition.attribute}", which is not a Roblox attribute name.`,
		);
	}

	const equals = definition.equals;

	if (
		typeof equals !== "string" &&
		typeof equals !== "number" &&
		typeof equals !== "boolean"
	) {
		throw new Error(
			`${label} registered the variant "${name}" without a value to compare. Give \`equals\` a string, number, or boolean.`,
		);
	}

	if (typeof equals === "number" && !Number.isFinite(equals)) {
		throw new Error(
			`${label} registered the variant "${name}" with a non-finite \`equals\` value.`,
		);
	}

	return { attribute, equals };
}

const EXPORT_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function normalizeMotionDriver(
	driver: MotionDriver,
	label: string,
): MotionDriver {
	const module = typeof driver?.module === "string" ? driver.module.trim() : "";

	if (module.length === 0) {
		throw new Error(
			`${label} set a motion driver with no module. Name the module the runtime host should import the driver from.`,
		);
	}

	// Every transformed module that needs a driver imports it itself, at
	// whatever depth it sits, so a relative specifier would resolve differently
	// per file.
	if (module.startsWith(".")) {
		throw new Error(
			`${label} set the motion driver module to "${module}". A relative path cannot resolve from every module that imports the driver; use a package name or a baseUrl-relative path.`,
		);
	}

	if (driver.export === undefined) {
		return { module };
	}

	if (!EXPORT_NAME_PATTERN.test(driver.export)) {
		throw new Error(
			`${label} set the motion driver export to "${driver.export}", which is not an identifier.`,
		);
	}

	return { module, export: driver.export };
}

function normalizeUtilityValue(
	value: PluginUtilityValue,
	label: string,
	key: string,
): PluginUtilityValue {
	if (typeof value === "string") {
		const classes = value.trim();

		if (classes.length === 0) {
			throw new Error(`${label} registered "${key}" with an empty class list.`);
		}

		return classes;
	}

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(
			`${label} registered "${key}" with neither a class list nor a property map.`,
		);
	}

	const props: PluginPropMap = {};

	for (const [prop, expression] of Object.entries(value)) {
		if (!PROP_NAME_PATTERN.test(prop)) {
			throw new Error(
				`${label} registered "${key}" with "${prop}", which is not a Roblox property name.`,
			);
		}

		if (typeof expression !== "string" || expression.trim().length === 0) {
			throw new Error(
				`${label} registered "${key}.${prop}" with a non-string value. Property values are roblox-ts expression strings such as "Color3.fromRGB(59, 130, 246)".`,
			);
		}

		props[prop] = expression.trim();
	}

	if (Object.keys(props).length === 0) {
		throw new Error(`${label} registered "${key}" with an empty property map.`);
	}

	return props;
}
