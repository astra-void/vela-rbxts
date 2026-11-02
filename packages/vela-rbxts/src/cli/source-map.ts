import { createHash } from "node:crypto";

const BASE64 =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUES = new Map(
	[...BASE64].map((character, index) => [character, index]),
);

/** A v3 source map with the hash of the generated text it was written for. */
export type VelaSourceMap = {
	version: 3;
	file: string;
	sources: string[];
	names: string[];
	mappings: string;
	x_vela_generated: string;
};

export function hashGeneratedText(text: string): string {
	return createHash("sha1").update(text).digest("hex");
}

function encodeVlq(value: number): string {
	let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
	let encoded = "";

	do {
		let digit = vlq & 31;
		vlq >>>= 5;
		if (vlq > 0) {
			digit |= 32;
		}
		encoded += BASE64[digit];
	} while (vlq > 0);

	return encoded;
}

function decodeVlqSegment(segment: string): number[] {
	const values: number[] = [];
	let value = 0;
	let shift = 0;

	for (const character of segment) {
		const digit = BASE64_VALUES.get(character);
		if (digit === undefined) {
			return [];
		}

		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
			continue;
		}

		values.push(value & 1 ? -(value >>> 1) : value >>> 1);
		value = 0;
		shift = 0;
	}

	return values;
}

/** Encodes sorted `[genLine, genCol, origLine, origCol]` quads against one source. */
export function encodeMappings(quads: readonly number[]): string {
	let encoded = "";
	let line = 0;
	let previousGeneratedColumn = 0;
	let previousOriginalLine = 0;
	let previousOriginalColumn = 0;
	let firstInLine = true;

	for (let index = 0; index + 3 < quads.length; index += 4) {
		const generatedLine = quads[index];
		const generatedColumn = quads[index + 1];
		const originalLine = quads[index + 2];
		const originalColumn = quads[index + 3];

		while (line < generatedLine) {
			encoded += ";";
			line += 1;
			previousGeneratedColumn = 0;
			firstInLine = true;
		}

		if (!firstInLine) {
			encoded += ",";
		}
		encoded +=
			encodeVlq(generatedColumn - previousGeneratedColumn) +
			encodeVlq(0) +
			encodeVlq(originalLine - previousOriginalLine) +
			encodeVlq(originalColumn - previousOriginalColumn);

		previousGeneratedColumn = generatedColumn;
		previousOriginalLine = originalLine;
		previousOriginalColumn = originalColumn;
		firstInLine = false;
	}

	return encoded;
}

/** The inverse of `encodeMappings`, reading only the first source. */
export function decodeMappings(mappings: string): number[] {
	const quads: number[] = [];
	let source = 0;
	let originalLine = 0;
	let originalColumn = 0;

	const lines = mappings.split(";");

	for (let line = 0; line < lines.length; line += 1) {
		let generatedColumn = 0;

		for (const segment of lines[line].split(",")) {
			if (segment === "") {
				continue;
			}

			const values = decodeVlqSegment(segment);
			if (values.length === 0) {
				continue;
			}

			generatedColumn += values[0];
			if (values.length < 4) {
				continue;
			}

			source += values[1];
			originalLine += values[2];
			originalColumn += values[3];
			if (source === 0) {
				quads.push(line, generatedColumn, originalLine, originalColumn);
			}
		}
	}

	return quads;
}

/** Where a generated position came from: the last mapping at or before it. */
export function originalPositionFor(
	quads: readonly number[],
	line: number,
	column: number,
): { line: number; column: number } {
	let low = 0;
	let high = quads.length / 4 - 1;
	let found = -1;

	while (low <= high) {
		const middle = (low + high) >> 1;
		const generatedLine = quads[middle * 4];
		const generatedColumn = quads[middle * 4 + 1];

		if (
			generatedLine < line ||
			(generatedLine === line && generatedColumn <= column)
		) {
			found = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	// Before the first mapping is the preamble the compiler prepended.
	if (found < 0) {
		return { line: 0, column: 0 };
	}

	return { line: quads[found * 4 + 2], column: quads[found * 4 + 3] };
}
