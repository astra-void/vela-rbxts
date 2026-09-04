declare const string: {
	len: (value: string) => number;
	sub: (value: string, start: number, stop?: number) => string;
};

export namespace __VelaLua {
	export const __velaStringLen = string.len;
	export const __velaStringSub = string.sub;

	export function stringLength(value: string): number {
		return __velaStringLen(value);
	}

	export function substring(
		value: string,
		start: number,
		stop?: number,
	): string {
		const resolvedStop =
			stop === undefined
				? undefined
				: stop < 0
					? stringLength(value) + stop
					: stop;

		return __velaStringSub(value, start + 1, resolvedStop);
	}

	export function after(value: string, prefix: string): string {
		return substring(value, stringLength(prefix));
	}

	export function startsWith(value: string, prefix: string): boolean {
		return substring(value, 0, stringLength(prefix)) === prefix;
	}

	export function endsWith(value: string, suffix: string): boolean {
		const suffixLength = stringLength(suffix);
		return substring(value, stringLength(value) - suffixLength) === suffix;
	}

	export function indexOf(value: string, needle: string): number {
		const limit = stringLength(value) - stringLength(needle);

		for (let index = 0; index <= limit; index++) {
			if (substring(value, index, index + stringLength(needle)) === needle) {
				return index;
			}
		}

		return -1;
	}

	export function lastIndexOf(value: string, needle: string): number {
		for (
			let index = stringLength(value) - stringLength(needle);
			index >= 0;
			index--
		) {
			if (substring(value, index, index + stringLength(needle)) === needle) {
				return index;
			}
		}

		return -1;
	}

	export function includesChar(value: string, char: string): boolean {
		for (let index = 0; index < stringLength(value); index++) {
			if (substring(value, index, index + 1) === char) {
				return true;
			}
		}

		return false;
	}

	export function trim(value: string): string {
		let start = 0;
		let stop = stringLength(value);

		while (start < stop && isWhitespace(substring(value, start, start + 1))) {
			start++;
		}

		while (stop > start && isWhitespace(substring(value, stop - 1, stop))) {
			stop--;
		}

		return substring(value, start, stop);
	}

	/// The index just past the `]` closing the `[` at `open`, when one closes it.
	/// A bracket left open is not an arbitrary value, so the whitespace behind it
	/// goes on separating classes.
	function arbitraryValueEnd(
		value: string,
		open: number,
		length: number,
	): number | undefined {
		let depth = 0;

		for (let index = open; index < length; index++) {
			const character = substring(value, index, index + 1);
			if (character === "[") {
				depth += 1;
			} else if (character === "]") {
				depth -= 1;
				if (depth === 0) {
					return index + 1;
				}
			}
		}

		return undefined;
	}

	/// Whitespace separates classes, except where it sits inside an arbitrary
	/// value: `w-[calc(100% - 4px)]` is one class written with spaces.
	export function splitWhitespace(value: string): string[] {
		const tokens: string[] = [];
		let tokenStart: number | undefined;
		let joinedUntil = 0;
		const length = stringLength(value);

		for (let index = 0; index < length; index++) {
			const character = substring(value, index, index + 1);
			if (character === "[" && index >= joinedUntil) {
				const closed = arbitraryValueEnd(value, index, length);
				if (closed !== undefined) {
					joinedUntil = closed;
				}
			}

			if (isWhitespace(character) && index >= joinedUntil) {
				if (tokenStart !== undefined) {
					tokens.push(substring(value, tokenStart, index));
					tokenStart = undefined;
				}
			} else if (tokenStart === undefined) {
				tokenStart = index;
			}
		}

		if (tokenStart !== undefined) {
			tokens.push(substring(value, tokenStart));
		}

		return tokens;
	}

	export function splitBy(value: string, separator: string): string[] {
		const pieces: string[] = [];
		let pieceStart = 0;
		const length = stringLength(value);
		const separatorLength = stringLength(separator);

		for (let index = 0; index <= length - separatorLength; index++) {
			if (substring(value, index, index + separatorLength) === separator) {
				pieces.push(substring(value, pieceStart, index));
				pieceStart = index + separatorLength;
				index = pieceStart - 1;
			}
		}

		pieces.push(substring(value, pieceStart));
		return pieces;
	}

	/// `splitBy` for a value that nests: a comma inside `Color3.fromRGB(…)` or
	/// inside a quoted font family is part of an argument, not a separator.
	export function splitTopLevel(value: string, separator: string): string[] {
		const pieces: string[] = [];
		let pieceStart = 0;
		let depth = 0;
		let quote: string | undefined;
		const length = stringLength(value);

		for (let index = 0; index < length; index++) {
			const char = substring(value, index, index + 1);

			if (quote !== undefined) {
				if (char === quote) {
					quote = undefined;
				}
				continue;
			}

			if (char === '"' || char === "'") {
				quote = char;
			} else if (char === "(" || char === "[") {
				depth++;
			} else if (char === ")" || char === "]") {
				depth--;
			} else if (char === separator && depth === 0) {
				pieces.push(substring(value, pieceStart, index));
				pieceStart = index + 1;
			}
		}

		pieces.push(substring(value, pieceStart));
		return pieces.map((piece) => trim(piece));
	}

	export function splitCallArguments(
		value: string,
		prefix: string,
		suffix: string,
	): string[] | undefined {
		if (!startsWith(value, prefix) || !endsWith(value, suffix)) {
			return undefined;
		}

		const body = trim(
			substring(value, stringLength(prefix), -stringLength(suffix)),
		);

		return body === "" ? [] : splitTopLevel(body, ",");
	}

	export function unquote(value: string): string | undefined {
		const length = stringLength(value);
		if (length < 2) {
			return undefined;
		}

		const first = substring(value, 0, 1);
		if (first !== '"' && first !== "'") {
			return undefined;
		}

		return substring(value, length - 1, length) === first
			? substring(value, 1, length - 1)
			: undefined;
	}

	export function splitOnce(
		value: string,
		separator: string,
	): [string, string | undefined] {
		const separatorLength = stringLength(separator);
		for (
			let index = 0;
			index <= stringLength(value) - separatorLength;
			index++
		) {
			if (substring(value, index, index + separatorLength) === separator) {
				return [
					substring(value, 0, index),
					substring(value, index + separatorLength),
				];
			}
		}

		return [value, undefined];
	}

	export function parseCallArguments(
		value: string,
		prefix: string,
		suffix: string,
	): string[] | undefined {
		if (!startsWith(value, prefix) || !endsWith(value, suffix)) {
			return undefined;
		}

		const body = substring(value, stringLength(prefix), -stringLength(suffix));
		return splitBy(body, ",").map((entry) => trim(entry));
	}

	function isWhitespace(value: string): boolean {
		return value === " " || value === "\t" || value === "\n" || value === "\r";
	}

	export function toText(value: string | number): string {
		return tostring?.(value) ?? "";
	}

	// Mirrors `tonumber`, which answers nil for a nil argument: the callers read
	// parsed call arguments, and an index past the end is absent, not a number.
	export function toNumber(value: string | undefined): number | undefined {
		const numeric = tonumber?.(value);

		if (numeric === undefined || isNaNNumber(numeric)) {
			return undefined;
		}

		return numeric;
	}

	export function mathAbs(value: number): number {
		return value < 0 ? -value : value;
	}

	export function mathFloor(value: number): number {
		const remainder = value % 1;
		const truncated = value - remainder;
		return value < 0 && remainder !== 0 ? truncated - 1 : truncated;
	}

	export function isWholeNumber(value: number): boolean {
		const rounded = mathRound(value);
		return mathAbs(value - rounded) < 1e-9;
	}

	function mathRound(value: number): number {
		return mathFloor(value + 0.5);
	}

	export function isArrayValue(value: unknown): boolean {
		return typeOf(value) === "table" && arraySize(value as unknown[]) > 0;
	}

	function isNaNNumber(value: number): boolean {
		return !(value >= 0 || value <= 0);
	}

	export function arraySize<T>(value: T[]): number {
		return value.size();
	}

	export function join(values: readonly string[], separator: string): string {
		let result = "";

		for (let index = 0; index < arraySize(values as string[]); index++) {
			const value = values[index] ?? "";
			result = index === 0 ? value : `${result}${separator}${value}`;
		}

		return result;
	}
}
