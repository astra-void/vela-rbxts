type ClassDictionary = Record<string, boolean | null | undefined>;
type EmptyProps = Record<string, never>;
type StylableClassNameProp = {
	className?: ClassValue;
};

export type ClassValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| ClassDictionary
	| ClassValue[];

export type StylableProps<P = unknown> = (P extends object ? P : EmptyProps) &
	StylableClassNameProp;
