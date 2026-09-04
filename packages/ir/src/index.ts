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

export type RuntimeAttributeValue = string | number | boolean;

export type RuntimeCondition =
	| {
			kind: "all";
			conditions: RuntimeCondition[];
	  }
	| {
			kind: "width";
			/** The breakpoint name, which a project configures under `theme.screens`. */
			alias: string;
			minWidth: number;
			/** Exclusive, so `md:` and `max-md:` partition every viewport. */
			maxWidth?: number;
	  }
	| {
			kind: "orientation";
			value: "portrait" | "landscape";
	  }
	| {
			kind: "input";
			value: "touch" | "mouse" | "gamepad";
	  }
	| {
			kind: "color-scheme";
			value: "light" | "dark";
	  }
	| {
			kind: "hover";
	  }
	| {
			kind: "active";
	  }
	| {
			kind: "focus";
	  }
	/** A Roblox attribute on the styled instance. */
	| {
			kind: "attribute";
			name: string;
			value: RuntimeAttributeValue;
	  }
	/** A branch of a class value the transformer read but could not decide. */
	| {
			kind: "test";
			index: number;
			expected: boolean;
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
