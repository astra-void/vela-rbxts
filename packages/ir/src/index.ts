export type Diagnostic = {
	level: "warning" | "error";
	code: string;
	message: string;
	token?: string;
};

export type PropEntry = {
	name: string;
	value: string;
};

export type HelperEntry = {
	tag: string;
	props: PropEntry[];
};

export type StyleEffectBundle = {
	props: PropEntry[];
	helpers: HelperEntry[];
};

export type RuntimeCondition =
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

export type RuntimeRule = {
	condition: RuntimeCondition;
	effects: StyleEffectBundle;
};

export type StyleIR = {
	base: StyleEffectBundle;
	runtimeRules: RuntimeRule[];
	runtimeClassValue: boolean;
	diagnostics: Diagnostic[];
};

export type TransformResult = {
	code: string;
	diagnostics: Diagnostic[];
	changed: boolean;
};
