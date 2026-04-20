import { defaultConfig, type TailwindConfig } from "@rbxts-tailwind/config";
import { resolveClassTokens, tokenizeClassName } from "@rbxts-tailwind/core";
import type {
	Diagnostic,
	HelperEntry,
	PropEntry,
	TransformResult,
} from "@rbxts-tailwind/ir";
import ts from "typescript";

export type TransformOptions = {
	config?: TailwindConfig;
	backend?: CompilerBackend;
};

export type CompilerBackend = {
	transform(source: string, options: InternalTransformOptions): TransformResult;
};

type InternalTransformOptions = {
	config: TailwindConfig;
};

const typescriptBackend: CompilerBackend = {
	transform: transformWithTypeScriptBackend,
};

export function transform(
	source: string,
	options: TransformOptions = {},
): TransformResult {
	const backend = options.backend ?? loadNativeBackend() ?? typescriptBackend;
	return backend.transform(source, {
		config: options.config ?? defaultConfig,
	});
}

function loadNativeBackend(): CompilerBackend | undefined {
	// TODO: Load the N-API native compiler binding here once available.
	return undefined;
}

function transformWithTypeScriptBackend(
	source: string,
	options: InternalTransformOptions,
): TransformResult {
	const sourceFile = ts.createSourceFile(
		"input.tsx",
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const diagnostics: Diagnostic[] = [];

	let changed = false;

	const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
		const visit: ts.Visitor = (node) => {
			if (ts.isJsxSelfClosingElement(node) && isFrameTag(node.tagName)) {
				return lowerFrameSelfClosingElement(
					node,
					diagnostics,
					options.config,
					() => {
						changed = true;
					},
				);
			}

			if (ts.isJsxElement(node) && isFrameTag(node.openingElement.tagName)) {
				return lowerFrameElement(
					node,
					context,
					visit,
					diagnostics,
					options.config,
					() => {
						changed = true;
					},
				);
			}

			return ts.visitEachChild(node, visit, context);
		};

		return (file) => ts.visitNode(file, visit) as ts.SourceFile;
	};

	const transformed = ts.transform(sourceFile, [transformer]);
	const outputSource = transformed.transformed[0] ?? sourceFile;
	const code = ts.createPrinter().printFile(outputSource);
	transformed.dispose();

	return {
		code,
		diagnostics,
		changed,
	};
}

function lowerFrameSelfClosingElement(
	node: ts.JsxSelfClosingElement,
	diagnostics: Diagnostic[],
	config: TailwindConfig,
	onChange: () => void,
): ts.JsxSelfClosingElement | ts.JsxElement {
	const lowered = lowerClassName(
		node.attributes.properties,
		diagnostics,
		config,
	);
	if (!lowered) {
		return node;
	}

	onChange();

	const nextAttributes = ts.factory.createJsxAttributes([
		...lowered.preservedAttributes,
		...lowered.style.props.map(createPropAttribute),
	]);

	if (lowered.style.helpers.length === 0) {
		return ts.factory.updateJsxSelfClosingElement(
			node,
			node.tagName,
			node.typeArguments,
			nextAttributes,
		);
	}

	const helperChildren = lowered.style.helpers.map(createHelperChild);

	return ts.factory.createJsxElement(
		ts.factory.createJsxOpeningElement(
			node.tagName,
			node.typeArguments,
			nextAttributes,
		),
		helperChildren,
		ts.factory.createJsxClosingElement(node.tagName),
	);
}

function lowerFrameElement(
	node: ts.JsxElement,
	context: ts.TransformationContext,
	visit: ts.Visitor,
	diagnostics: Diagnostic[],
	config: TailwindConfig,
	onChange: () => void,
): ts.JsxElement {
	const lowered = lowerClassName(
		node.openingElement.attributes.properties,
		diagnostics,
		config,
	);
	if (!lowered) {
		return ts.visitEachChild(node, visit, context) as ts.JsxElement;
	}

	onChange();

	const nextOpeningElement = ts.factory.updateJsxOpeningElement(
		node.openingElement,
		node.openingElement.tagName,
		node.openingElement.typeArguments,
		ts.factory.createJsxAttributes([
			...lowered.preservedAttributes,
			...lowered.style.props.map(createPropAttribute),
		]),
	);

	const visitedChildren = ts.visitNodes(
		node.children,
		visit,
	) as ts.NodeArray<ts.JsxChild>;
	const helperChildren = lowered.style.helpers.map(createHelperChild);

	return ts.factory.updateJsxElement(
		node,
		nextOpeningElement,
		ts.factory.createNodeArray([...helperChildren, ...visitedChildren]),
		node.closingElement,
	);
}

function lowerClassName(
	attributes: readonly ts.JsxAttributeLike[],
	diagnostics: Diagnostic[],
	config: TailwindConfig,
):
	| {
			preservedAttributes: ts.JsxAttributeLike[];
			style: ReturnType<typeof resolveClassTokens>;
	  }
	| undefined {
	const classNameAttribute = attributes.find(
		(attribute): attribute is ts.JsxAttribute =>
			ts.isJsxAttribute(attribute) &&
			ts.isIdentifier(attribute.name) &&
			attribute.name.text === "className",
	);

	if (!classNameAttribute) {
		return undefined;
	}

	if (
		!classNameAttribute.initializer ||
		!ts.isStringLiteral(classNameAttribute.initializer)
	) {
		diagnostics.push({
			level: "warning",
			code: "unsupported-classname-expression",
			message:
				"Only className string literals are supported in this compiler slice.",
		});
		return undefined;
	}

	const tokens = tokenizeClassName(classNameAttribute.initializer.text);
	const style = resolveClassTokens(tokens, { config });
	diagnostics.push(...style.diagnostics);

	if (style.props.length === 0 && style.helpers.length === 0) {
		return undefined;
	}

	const preservedAttributes = attributes.filter(
		(attribute) =>
			!(
				ts.isJsxAttribute(attribute) &&
				ts.isIdentifier(attribute.name) &&
				attribute.name.text === "className"
			),
	);

	return {
		preservedAttributes,
		style,
	};
}

function createHelperChild(helper: HelperEntry): ts.JsxSelfClosingElement {
	return ts.factory.createJsxSelfClosingElement(
		ts.factory.createIdentifier(helper.tag),
		undefined,
		ts.factory.createJsxAttributes(helper.props.map(createPropAttribute)),
	);
}

function createPropAttribute(prop: PropEntry): ts.JsxAttribute {
	return ts.factory.createJsxAttribute(
		ts.factory.createIdentifier(prop.name),
		ts.factory.createJsxExpression(undefined, parseExpression(prop.value)),
	);
}

function parseExpression(value: string): ts.Expression {
	const expressionFile = ts.createSourceFile(
		"expression.ts",
		`(${value});`,
		ts.ScriptTarget.Latest,
		false,
		ts.ScriptKind.TS,
	);

	const statement = expressionFile.statements[0];
	if (
		statement &&
		ts.isExpressionStatement(statement) &&
		ts.isParenthesizedExpression(statement.expression)
	) {
		return statement.expression.expression;
	}

	return ts.factory.createStringLiteral(value);
}

function isFrameTag(tagName: ts.JsxTagNameExpression): boolean {
	return ts.isIdentifier(tagName) && tagName.text === "frame";
}
