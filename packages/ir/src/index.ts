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

export type StyleIR = {
	props: PropEntry[];
	helpers: HelperEntry[];
	diagnostics: Diagnostic[];
};

export type TransformResult = {
	code: string;
	diagnostics: Diagnostic[];
	changed: boolean;
};
