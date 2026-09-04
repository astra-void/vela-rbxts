import React from "@rbxts/react";

export const StateVariants = () => (
	<frame
		className={[
			"open:bg-blue-600 attr-[Selected=true]:ring-2",
			"md:px-6 max-md:px-3 md:max-lg:px-4 tablet:px-8",
			"max-mdd:px-2 attr-[State]:px-2 md:max-sm:px-2",
		]}
	/>
);
