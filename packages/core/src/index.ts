import type { TailwindConfig } from "@rbxts-tailwind/config";
import type { StyleIR } from "@rbxts-tailwind/ir";

export const SEMANTIC_OWNER_PACKAGE = "@rbxts-tailwind/compiler" as const;
export const SEMANTIC_OWNER_RUNTIME = "rust-swc-napi" as const;

export type SemanticOwnership = {
	ownerPackage: typeof SEMANTIC_OWNER_PACKAGE;
	runtime: typeof SEMANTIC_OWNER_RUNTIME;
	notes: string;
};

// Core declares shared semantic boundaries only.
// Executable semantic resolution lives exclusively in @rbxts-tailwind/compiler.
export const semanticOwnership: SemanticOwnership = {
	ownerPackage: SEMANTIC_OWNER_PACKAGE,
	runtime: SEMANTIC_OWNER_RUNTIME,
	notes:
		"This package defines semantic contracts only. Utility tokenization/resolution is compiler-owned.",
};

export const SUPPORTED_HOST_ELEMENT_TAGS = [
	"frame",
	"scrollingframe",
	"canvasgroup",
	"textlabel",
	"textbutton",
	"textbox",
	"imagelabel",
	"imagebutton",
] as const;

export type SupportedHostElementTag =
	(typeof SUPPORTED_HOST_ELEMENT_TAGS)[number];

export type ClassNameSemanticRequest = {
	elementTag: SupportedHostElementTag;
	attributeName: "className";
	classNameLiteral: string;
	config: TailwindConfig;
};

export type ClassNameSemanticResult = StyleIR;
