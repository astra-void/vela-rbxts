import type { TailwindConfig } from "@vela-rbxts/config";
import type { StyleIR } from "@vela-rbxts/ir";

export const SEMANTIC_OWNER_PACKAGE = "@vela-rbxts/compiler" as const;
export const SEMANTIC_OWNER_RUNTIME = "rust-swc-napi" as const;

export type SemanticOwnership = {
	ownerPackage: typeof SEMANTIC_OWNER_PACKAGE;
	runtime: typeof SEMANTIC_OWNER_RUNTIME;
	notes: string;
};

// Core declares shared semantic boundaries only.
// Executable semantic resolution lives exclusively in @vela-rbxts/compiler.
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
