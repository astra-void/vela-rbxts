import React from "@rbxts/react";

const roomy = true;

export const Diagnostics = () => (
	<frame
		className={[
			"bg-slate-700 rounded right-4 order-2 self-center",
			"grid-cols-3 -translate-x-1/2 basis-1/2 divide-y-2 divide-slate-500",
			"mx-auto pointer-events-none space-y-2 ring-2 m-4 -ml-2",
			"hover:bg-blue-600 active:bg-rose-500 focus:border-blue-600",
			"dark:bg-slate-900 w-[120px] p-[7px] rounded-[10px]",
			"bg-[#ff0000]",
			"bg-blue-600/50",
			"transition duration-300 ease-out duration-fast",
			"transition-colors",
			"animate-spin animate-ping",
			"tracking-wide md:rounded-mdd",
			`bg-[oops] from-blue-600/50`,
			roomy && "blorb-2",
		]}
	>
		<frame className={{ "px-4": roomy, "checked:px-2": !roomy }} />
		<textbox className="placeholder-white/50" />
		<scrollingframe className="scroll-y scrollbar-w-2 scrollbar-slate-500 canvas-auto scroll-smooth" />
		<textlabel
			Text="hello"
			className="uppercase underline leading-tight font-mono font-bold font-handwriting"
		/>
	</frame>
);
