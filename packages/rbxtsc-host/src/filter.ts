import type {
	HostFileEligibility,
	HostFileFilterOptions,
	HostSourceFile,
} from "./types.js";

const DEFAULT_FILTER_OPTIONS = {
	skipNodeModules: true,
	requireClassName: true,
	requireJsxSyntax: true,
} satisfies Required<HostFileFilterOptions>;

export function getHostFileEligibility(
	sourceFile: HostSourceFile,
	options: HostFileFilterOptions = {},
): HostFileEligibility {
	const resolvedOptions = {
		...DEFAULT_FILTER_OPTIONS,
		...options,
	};

	if (!isTsxFile(sourceFile.fileName)) {
		return { eligible: false, reason: "not-tsx" };
	}

	if (isDeclarationFile(sourceFile.fileName)) {
		return { eligible: false, reason: "declaration-file" };
	}

	if (resolvedOptions.skipNodeModules && isInNodeModules(sourceFile.fileName)) {
		return { eligible: false, reason: "node-modules" };
	}

	if (
		resolvedOptions.requireClassName &&
		!sourceFile.sourceText.includes("className")
	) {
		return { eligible: false, reason: "missing-class-name" };
	}

	if (
		resolvedOptions.requireJsxSyntax &&
		!/<\s*[A-Za-z][A-Za-z0-9_.:-]*(\s|>|\/)/.test(sourceFile.sourceText)
	) {
		return { eligible: false, reason: "missing-jsx" };
	}

	return { eligible: true, reason: "eligible" };
}

export function isTransformableHostFile(
	sourceFile: HostSourceFile,
	options: HostFileFilterOptions = {},
): boolean {
	return getHostFileEligibility(sourceFile, options).eligible;
}

function isTsxFile(fileName: string): boolean {
	return fileName.toLowerCase().endsWith(".tsx");
}

function isDeclarationFile(fileName: string): boolean {
	const normalizedFileName = fileName.toLowerCase();
	return (
		normalizedFileName.endsWith(".d.ts") ||
		normalizedFileName.endsWith(".d.tsx")
	);
}

function isInNodeModules(fileName: string): boolean {
	return fileName.split(/[\\/]/).includes("node_modules");
}
