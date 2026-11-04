import { sortClassNames } from "@vela-rbxts/compiler";
import type { TailwindConfig } from "@vela-rbxts/config";
import { getHostFileEligibility } from "./filter.js";
import { resolveProjectConfigInfo } from "./project-config.js";
import { configJsonFor } from "./transform.js";
import type { HostSourceFile } from "./types.js";

export type SortSourceForHostOptions = {
	config?: TailwindConfig;
	/** Helpers whose arguments are class lists, as the editor's `classFunctions`. */
	classFunctions?: readonly string[];
};

export type HostSortResult = {
	fileName: string;
	sourceText: string;
	changed: boolean;
	skipped: boolean;
};

/** Sorts every class list in a file the way the editor's sort action does. */
export function sortSourceForHost(
	request: HostSourceFile,
	options: SortSourceForHostOptions = {},
): HostSortResult {
	// A helper outside className is a class list too, so a file needs neither.
	const eligibility = getHostFileEligibility(request, {
		requireClassName: false,
		requireJsxSyntax: false,
	});
	if (!eligibility.eligible) {
		return { ...request, changed: false, skipped: true };
	}

	const config =
		options.config ?? resolveProjectConfigInfo(request.fileName).config;
	const { edits } = sortClassNames({
		source: request.sourceText,
		options: {
			configJson: configJsonFor(config),
			...(options.classFunctions?.length
				? { classFunctions: [...options.classFunctions] }
				: {}),
		},
	});

	// Ranges are UTF-16 offsets into the original text, so apply from the end.
	let sourceText = request.sourceText;
	for (const edit of [...edits].sort(
		(left, right) => right.range.start - left.range.start,
	)) {
		sourceText =
			sourceText.slice(0, edit.range.start) +
			edit.text +
			sourceText.slice(edit.range.end);
	}

	return {
		fileName: request.fileName,
		sourceText,
		changed: sourceText !== request.sourceText,
		skipped: false,
	};
}
