import type { TailwindConfig } from "@vela-rbxts/config";
import type { ClassValue } from "@vela-rbxts/types";

type SupportedHostElementTag =
	| "frame"
	| "scrollingframe"
	| "canvasgroup"
	| "textlabel"
	| "textbutton"
	| "textbox"
	| "imagelabel"
	| "imagebutton";

type RuntimeRulePropEntry = {
	name: string;
	value: string;
};

type RuntimeRuleHelperEntry = {
	tag: string;
	props: RuntimeRulePropEntry[];
};

type RuntimeEffectBundle = {
	props: RuntimeRulePropEntry[];
	helpers: RuntimeRuleHelperEntry[];
};

type RuntimeCondition =
	| {
			kind: "all";
			conditions: RuntimeCondition[];
	  }
	| {
			kind: "width";
			alias: "sm" | "md" | "lg";
			minWidth: number;
			maxWidth?: number;
	  }
	| {
			kind: "orientation";
			value: "portrait" | "landscape";
	  }
	| {
			kind: "input";
			value: "touch" | "mouse" | "gamepad";
	  };

type RuntimeRule = {
	condition: RuntimeCondition;
	effects: RuntimeEffectBundle;
};

export type TailwindRuntimeHostProps = {
	__rbxtsTailwindTag: SupportedHostElementTag;
	__rbxtsTailwindRules?: readonly RuntimeRule[];
	className?: ClassValue;
	children?: React.ReactNode;
} & Record<string, unknown>;

export declare function createTailwindRuntimeHost(
	config: TailwindConfig,
): (props: TailwindRuntimeHostProps) => React.ReactNode;
