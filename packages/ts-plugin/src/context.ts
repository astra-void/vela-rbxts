import { SUPPORTED_HOST_ELEMENT_TAGS } from "@vela-rbxts/core";
import type ts from "typescript/lib/tsserverlibrary";

const supportedHostTags = new Set<string>(SUPPORTED_HOST_ELEMENT_TAGS);

export type ClassNameContext = {
	elementTag: string;
	range: {
		start: number;
		end: number;
	};
};

export function getSupportedClassNameContextAtPosition(
	typescript: typeof ts,
	sourceFile: ts.SourceFile,
	position: number,
): ClassNameContext | undefined {
	let match: ClassNameContext | undefined;

	function visit(node: ts.Node) {
		if (match) {
			return;
		}

		if (
			typescript.isJsxAttribute(node) &&
			typescript.isIdentifier(node.name) &&
			node.name.text === "className"
		) {
			const initializer = node.initializer;
			if (
				initializer &&
				typescript.isStringLiteral(initializer) &&
				position >= initializer.getStart(sourceFile) + 1 &&
				position <= initializer.getEnd() - 1
			) {
				const elementTag = getJsxAttributeElementTag(
					typescript,
					node,
					sourceFile,
				);
				if (elementTag && supportedHostTags.has(elementTag)) {
					match = {
						elementTag,
						range: {
							start: initializer.getStart(sourceFile) + 1,
							end: initializer.getEnd() - 1,
						},
					};
				}
			}
		}

		typescript.forEachChild(node, visit);
	}

	visit(sourceFile);
	return match;
}

export function hasSupportedClassNameContext(
	typescript: typeof ts,
	sourceFile: ts.SourceFile,
): boolean {
	let found = false;

	function visit(node: ts.Node) {
		if (found) {
			return;
		}

		if (
			typescript.isJsxAttribute(node) &&
			typescript.isIdentifier(node.name) &&
			node.name.text === "className"
		) {
			const initializer = node.initializer;
			const elementTag = getJsxAttributeElementTag(
				typescript,
				node,
				sourceFile,
			);
			found =
				!!initializer &&
				typescript.isStringLiteral(initializer) &&
				!!elementTag &&
				supportedHostTags.has(elementTag);
			if (found) {
				return;
			}
		}

		typescript.forEachChild(node, visit);
	}

	visit(sourceFile);
	return found;
}

function getJsxAttributeElementTag(
	typescript: typeof ts,
	attribute: ts.JsxAttribute,
	sourceFile: ts.SourceFile,
): string | undefined {
	const attributes = attribute.parent;
	const opening = attributes?.parent;

	if (
		!opening ||
		!(
			typescript.isJsxOpeningElement(opening) ||
			typescript.isJsxSelfClosingElement(opening)
		)
	) {
		return undefined;
	}

	const tagName = opening.tagName.getText(sourceFile).toLowerCase();
	return tagName.includes(".") ? undefined : tagName;
}
