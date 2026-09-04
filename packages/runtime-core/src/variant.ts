import { __VelaLua } from "./lua";
import type {
	RuntimeAttributeValue,
	RuntimeCondition,
	RuntimeEnvironment,
	RuntimeTheme,
	VariantEventBinding,
	VelaRuntimeTag,
} from "./types";

/// The prefix a maximum-width variant is written with: `max-md:`.
const MAX_WIDTH_PREFIX = "max-";
/// The prefix a variant that names a Roblox attribute inline is written with.
const ATTRIBUTE_PREFIX = "attr-";

export namespace __VelaVariant {
	/// What a `prefix:` segment means, resolved against the project's own
	/// breakpoints and registrations. This mirrors `VariantRegistry::parse` in
	/// the compiler: one reading of a prefix, so a token that lowers statically
	/// and one the runtime parses agree.
	export function parseVariantPrefix(
		prefix: string,
		theme: RuntimeTheme,
	): RuntimeCondition | undefined {
		const minWidth = theme.screens[prefix];
		if (minWidth !== undefined) {
			return { kind: "width", alias: prefix, minWidth };
		}

		if (__VelaLua.startsWith(prefix, MAX_WIDTH_PREFIX)) {
			const screen = __VelaLua.after(prefix, MAX_WIDTH_PREFIX);
			const maxWidth = theme.screens[screen];
			return maxWidth === undefined
				? undefined
				: { kind: "width", alias: prefix, minWidth: 0, maxWidth };
		}

		if (__VelaLua.startsWith(prefix, ATTRIBUTE_PREFIX)) {
			return parseAttributeVariant(__VelaLua.after(prefix, ATTRIBUTE_PREFIX));
		}

		const registered = theme.pluginVariants[prefix];
		if (registered !== undefined) {
			return {
				kind: "attribute",
				name: registered.attribute,
				value: registered.equals,
			};
		}

		switch (prefix) {
			case "portrait":
			case "landscape":
				return { kind: "orientation", value: prefix };
			case "touch":
			case "mouse":
			case "gamepad":
				return { kind: "input", value: prefix };
			case "dark":
				return { kind: "color-scheme", value: "dark" };
			case "hover":
				return { kind: "hover" };
			case "active":
				return { kind: "active" };
			case "focus":
				return { kind: "focus" };
			default:
				return undefined;
		}
	}

	/// Reads the `[Name=value]` an `attr-` prefix carries. Nothing here is
	/// evaluated: the value is compared as a boolean, a number, or the literal
	/// text, whichever it reads as.
	function parseAttributeVariant(
		payload: string,
	): RuntimeCondition | undefined {
		if (
			!__VelaLua.startsWith(payload, "[") ||
			!__VelaLua.endsWith(payload, "]")
		) {
			return undefined;
		}

		const inner = __VelaLua.substring(
			payload,
			1,
			__VelaLua.stringLength(payload) - 1,
		);
		// The first `=` separates: an attribute name can never contain one, so
		// `attr-[State=a=b]` compares against the literal `a=b`.
		const separator = __VelaLua.indexOf(inner, "=");
		if (separator < 0) {
			return undefined;
		}

		const name = __VelaLua.substring(inner, 0, separator);
		const value = __VelaLua.substring(inner, separator + 1);
		if (name === "" || value === "" || !isAttributeName(name)) {
			return undefined;
		}

		return { kind: "attribute", name, value: parseAttributeValue(value) };
	}

	export function parseAttributeValue(value: string): RuntimeAttributeValue {
		if (value === "true") {
			return true;
		}
		if (value === "false") {
			return false;
		}

		const numeric = tonumber(value);

		return numeric === undefined ? value : numeric;
	}

	function isAttributeName(name: string): boolean {
		return string.match(name, "^[%a_][%w_]*$")[0] !== undefined;
	}

	/// Whether the two compare equal as Roblox attributes. A missing attribute
	/// reads as `nil` and matches nothing, which is what makes a state variant
	/// inert until the game sets it.
	function attributeMatches(
		actual: unknown,
		expected: RuntimeAttributeValue,
	): boolean {
		if (typeIs(expected, "number")) {
			return typeIs(actual, "number") && actual === expected;
		}
		if (typeIs(expected, "boolean")) {
			return typeIs(actual, "boolean") && actual === expected;
		}

		// A Roblox attribute is typed, so an EnumItem or a Color3 written as
		// `attr-[Team=Red]` is compared by how it reads rather than not at all.
		return typeIs(actual, "string")
			? actual === expected
			: actual !== undefined && tostring(actual) === expected;
	}

	export function conditionUsesState(
		condition: RuntimeCondition,
		kind: "hover" | "active" | "focus",
	): boolean {
		if (condition.kind === kind) {
			return true;
		}
		if (condition.kind === "all") {
			return condition.conditions.some((entry) =>
				conditionUsesState(entry, kind),
			);
		}
		return false;
	}

	/// The attribute names a condition reads, added to `into`. This is what an
	/// element subscribes to, and an element whose rules name none subscribes
	/// to nothing at all.
	export function collectConditionAttributes(
		condition: RuntimeCondition,
		into: Set<string>,
	) {
		if (condition.kind === "attribute") {
			into.add(condition.name);
			return;
		}
		if (condition.kind === "all") {
			for (const entry of condition.conditions) {
				collectConditionAttributes(entry, into);
			}
		}
	}

	/// The attribute names a class value reads, without resolving any of it. An
	/// element's rules are known before it is built; a class value the runtime
	/// parses is not, so its prefixes are scanned for the same names.
	export function collectClassValueAttributes(
		tokens: readonly string[],
		theme: RuntimeTheme,
		into: Set<string>,
	) {
		for (const token of tokens) {
			const segments = splitVariantSegments(token);
			// The last segment is the utility, not a variant.
			segments.pop();

			for (const segment of segments) {
				const condition = parseVariantPrefix(segment, theme);
				if (condition !== undefined) {
					collectConditionAttributes(condition, into);
				}
			}
		}
	}

	/// Splits a class token on the `:` that separate its variants. A colon
	/// inside `[...]` belongs to an arbitrary value, so `attr-[State=a:b]` is
	/// one segment, the same rule the compiler's tokenizer applies.
	export function splitVariantSegments(token: string): string[] {
		const segments: string[] = [];
		const length = __VelaLua.stringLength(token);
		let start = 0;
		let depth = 0;

		for (let index = 0; index < length; index++) {
			const char = __VelaLua.substring(token, index, index + 1);

			if (char === "[" || char === "(") {
				depth += 1;
			} else if (char === "]" || char === ")") {
				depth = math.max(depth - 1, 0);
			} else if (char === ":" && depth === 0) {
				segments.push(__VelaLua.substring(token, start, index));
				start = index + 1;
			}
		}

		segments.push(__VelaLua.substring(token, start));

		return segments;
	}

	/// Wraps one Event entry, keeping whatever handler the consumer declared and
	/// whatever an earlier tracker already composed onto it.
	export function composeEvent(
		hostProps: Record<string, unknown>,
		name: string,
		handler: (...args: unknown[]) => void,
	) {
		const existing = hostProps.Event;
		const events: Record<string, unknown> = {};
		if (typeIs(existing, "table")) {
			for (const [key, value] of pairs(existing as Record<string, unknown>)) {
				events[key as string] = value;
			}
		}

		const previous = events[name];
		events[name] = (...args: unknown[]) => {
			handler(...args);
			if (typeIs(previous, "function")) {
				(previous as (...args: unknown[]) => void)(...args);
			}
		};

		hostProps.Event = events;
	}

	/// Attaches MouseEnter/MouseLeave to drive the hover state.
	/// What a variant needs connected, named rather than attached: `Event` is
	/// how @rbxts/react spells a handler, and Vide writes one under the property
	/// name itself. Each host runtime composes these its own way.
	export function hoverTracking(
		setHovered: (hovered: boolean) => void,
	): VariantEventBinding[] {
		return [
			{ name: "MouseEnter", handler: () => setHovered(true) },
			{ name: "MouseLeave", handler: () => setHovered(false) },
		];
	}

	/// The input object arrives first here, because a binding is connected to
	/// the signal itself. @rbxts/react prepends the instance to every handler's
	/// arguments, which is why the attach form below reads one place further in.
	export function activeTracking(
		setPressed: (pressed: boolean) => void,
	): VariantEventBinding[] {
		return [
			{
				name: "InputBegan",
				handler: (...args: unknown[]) => {
					if (isPressInput(args[0])) {
						setPressed(true);
					}
				},
			},
			{
				name: "InputEnded",
				handler: (...args: unknown[]) => {
					if (isPressInput(args[0])) {
						setPressed(false);
					}
				},
			},
			{ name: "MouseLeave", handler: () => setPressed(false) },
		];
	}

	/// Text boxes carry their own keyboard focus events; every other element reads
	/// focus as the selection a gamepad or `GuiService` moved onto it.
	export function focusTracking(
		tag: VelaRuntimeTag,
		setFocused: (focused: boolean) => void,
	): VariantEventBinding[] {
		const gained = tag === "textbox" ? "Focused" : "SelectionGained";
		const lost = tag === "textbox" ? "FocusLost" : "SelectionLost";

		return [
			{ name: gained, handler: () => setFocused(true) },
			{ name: lost, handler: () => setFocused(false) },
		];
	}

	export function attachHoverTracking(
		hostProps: Record<string, unknown>,
		setHovered: (hovered: boolean) => void,
	) {
		composeEvent(hostProps, "MouseEnter", () => setHovered(true));
		composeEvent(hostProps, "MouseLeave", () => setHovered(false));
	}

	/// Drives the pressed state from mouse and touch input. A release that lands
	/// outside the element never reaches its `InputEnded`, so leaving the element
	/// clears the state too.
	export function attachActiveTracking(
		hostProps: Record<string, unknown>,
		setPressed: (pressed: boolean) => void,
	) {
		composeEvent(hostProps, "InputBegan", (...args: unknown[]) => {
			if (isPressInput(args[1])) {
				setPressed(true);
			}
		});
		composeEvent(hostProps, "InputEnded", (...args: unknown[]) => {
			if (isPressInput(args[1])) {
				setPressed(false);
			}
		});
		composeEvent(hostProps, "MouseLeave", () => setPressed(false));
	}

	function isPressInput(input: unknown): boolean {
		if (!typeIs(input, "Instance") || !input.IsA("InputObject")) {
			return false;
		}

		return (
			input.UserInputType === Enum.UserInputType.MouseButton1 ||
			input.UserInputType === Enum.UserInputType.Touch
		);
	}

	export function attachFocusTracking(
		hostProps: Record<string, unknown>,
		tag: VelaRuntimeTag,
		setFocused: (focused: boolean) => void,
	) {
		for (const binding of focusTracking(tag, setFocused)) {
			composeEvent(hostProps, binding.name, binding.handler);
		}
	}

	/// Resolves a written prefix and answers whether it holds. The one place a
	/// class value's variants are evaluated, so `md:` in a string the runtime
	/// parses means exactly what `md:` lowered statically means.
	export function matchesVariant(
		prefix: string,
		environment: RuntimeEnvironment,
		theme: RuntimeTheme,
	): boolean {
		const condition = parseVariantPrefix(prefix, theme);

		return (
			condition !== undefined && matchesRuntimeCondition(condition, environment)
		);
	}

	export function matchesRuntimeCondition(
		condition: RuntimeCondition,
		environment: RuntimeEnvironment,
	): boolean {
		switch (condition.kind) {
			case "all":
				return condition.conditions.every((entry) =>
					matchesRuntimeCondition(entry, environment),
				);
			// `minWidth` is inclusive and `maxWidth` is not, so `md:` and
			// `max-md:` cover every viewport exactly once between them.
			case "width":
				return (
					environment.width >= condition.minWidth &&
					(condition.maxWidth === undefined ||
						environment.width < condition.maxWidth)
				);
			case "orientation":
				return environment.orientation === condition.value;
			case "input":
				return environment.input === condition.value;
			case "color-scheme":
				return environment.colorScheme === condition.value;
			case "hover":
				return environment.hovered;
			case "active":
				return environment.pressed;
			case "focus":
				return environment.focused;
			case "attribute":
				return attributeMatches(
					environment.attributes?.[condition.name],
					condition.value,
				);
			case "test":
				return (
					(environment.tests?.[condition.index] ?? false) === condition.expected
				);
			default:
				return false;
		}
	}
}
