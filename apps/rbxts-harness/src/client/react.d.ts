/// <reference types="@rbxts/types" />
/// <reference types="@rbxts/react" />

import type { ClassValue } from "@rbxts-tailwind/types";

declare global {
	namespace React {
		interface Attributes {
			className?: ClassValue;
		}
	}
}
