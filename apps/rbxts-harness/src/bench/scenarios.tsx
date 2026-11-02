import React from "@rbxts/react";
import ReactRoblox from "@rbxts/react-roblox";
import { VelaBench } from "./runner";

export const SLATE_600 = Color3.fromRGB(69, 85, 108).ToHex();
export const SLATE_700 = Color3.fromRGB(49, 65, 88).ToHex();
export const SLATE_100 = Color3.fromRGB(241, 245, 249).ToHex();
export const SLATE_900 = Color3.fromRGB(15, 23, 43).ToHex();
export const ROSE_500 = Color3.fromRGB(255, 32, 86).ToHex();

// Behind a call, the shape the compiler leaves for the runtime host to resolve.
const runtimeClass = (active: boolean) =>
	active
		? "bg-slate-600 rounded-lg p-2 w-10 h-8"
		: "bg-slate-700 rounded-md p-2 w-10 h-8";

type Build = (size: number, offset: number, active: boolean) => React.Element;

export const staticItems: Build = (size, offset) => {
	const items: React.Element[] = [];
	for (let index = 0; index < size; index += 1) {
		items.push(
			<frame
				key={`item-${offset + index}`}
				className="bg-slate-700 rounded-md p-2 w-10 h-8"
			/>,
		);
	}

	return <React.Fragment>{items}</React.Fragment>;
};

export const runtimeItems: Build = (size, offset, active) => {
	const items: React.Element[] = [];
	for (let index = 0; index < size; index += 1) {
		items.push(
			<frame key={`item-${offset + index}`} className={runtimeClass(active)} />,
		);
	}

	return <React.Fragment>{items}</React.Fragment>;
};

export const schemeItems: Build = (size, offset) => {
	const items: React.Element[] = [];
	for (let index = 0; index < size; index += 1) {
		items.push(
			<frame
				key={`item-${offset + index}`}
				className="bg-slate-100 dark:bg-slate-900 w-10 h-8"
			/>,
		);
	}

	return <React.Fragment>{items}</React.Fragment>;
};

export const attributeItems: Build = (size, offset) => {
	const items: React.Element[] = [];
	for (let index = 0; index < size; index += 1) {
		items.push(
			<frame
				key={`item-${offset + index}`}
				className="bg-slate-700 selected:bg-rose-500 w-10 h-8"
			/>,
		);
	}

	return <React.Fragment>{items}</React.Fragment>;
};

export const groupItems: Build = (size, offset) => {
	const items: React.Element[] = [];
	for (let index = 0; index < size; index += 1) {
		items.push(
			<frame key={`item-${offset + index}`} className="group w-10 h-8">
				<frame className="bg-slate-700 group-hover:bg-rose-500 w-4 h-4" />
			</frame>,
		);
	}

	return <React.Fragment>{items}</React.Fragment>;
};

export const divideList = (size: number, reversed = false) => {
	const items: React.Element[] = [];
	for (let index = 0; index < size; index += 1) {
		items.push(
			<frame
				key={`item-${index}`}
				LayoutOrder={reversed ? size - index : 0}
				className="w-10 h-4 bg-slate-600"
			/>,
		);
	}

	return (
		<frame key="list" className="flex-col divide-y-2 divide-slate-500 w-20">
			{items}
		</frame>
	);
};

/// A focusable group with a member inside it, and a named peer beside the
/// sibling that reads it, once bare and once with both in margin boxes. A
/// TextBox is what a spec can focus without input.
export const relationalTree = () => (
	<frame key="relational" className="flex-col gap-2 w-40">
		<textbox key="group" Text="" className="group w-40 h-8">
			<frame
				key="member"
				className="bg-slate-700 group-focus:bg-rose-500 w-10 h-4"
			/>
		</textbox>
		<frame key="pair" className="flex-col w-40">
			<textbox key="field" Text="" className="peer/field w-40 h-8" />
			<frame
				key="hint"
				className="bg-slate-700 peer-focus/field:bg-rose-500 w-10 h-4"
			/>
		</frame>
		<frame key="marginPair" className="flex-col w-40">
			<textbox key="field" Text="" className="peer/field m-1 w-40 h-8" />
			<textlabel
				key="hint"
				Text=""
				className="bg-slate-700 peer-focus/field:bg-rose-500 m-1 w-10 h-4"
			/>
		</frame>
	</frame>
);

export type Mounted = {
	roots: ReactRoblox.Root[];
	containers: Frame[];
	build: Build;
};

/// Legacy roots render synchronously, so the timed span is the whole commit.
export function mount(
	context: VelaBench.Context,
	build: Build,
	label?: string,
): Mounted {
	const mounted: Mounted = { roots: [], containers: [], build };
	let offset = 0;
	const sizes = VelaBench.chunkSizes(context.count);

	for (let index = 0; index < sizes.size(); index += 1) {
		const size = sizes[index];
		const container = VelaBench.chunkContainer(context.container, index);
		const root = ReactRoblox.createLegacyRoot(container);
		const element = build(size, offset, false);
		if (label === undefined) {
			root.render(element);
		} else {
			VelaBench.time(context.metrics, label, () => root.render(element));
		}
		mounted.roots.push(root);
		mounted.containers.push(container);
		offset += size;
		task.wait();
	}

	return mounted;
}

export function rerender(mounted: Mounted, metrics: VelaBench.Metrics) {
	let offset = 0;
	for (let index = 0; index < mounted.roots.size(); index += 1) {
		const root = mounted.roots[index];
		const size = mounted.containers[index].GetChildren().size();
		const element = mounted.build(size, offset, true);
		VelaBench.time(metrics, "rerenderCpuMs", () => root.render(element));
		offset += size;
		task.wait();
	}
}

export function unmount(mounted: Mounted, metrics?: VelaBench.Metrics) {
	for (const root of mounted.roots) {
		if (metrics === undefined) {
			root.unmount();
		} else {
			VelaBench.time(metrics, "unmountCpuMs", () => root.unmount());
		}
		task.wait();
	}
}

export function hostCount(mounted: Mounted): number {
	let count = 0;
	for (const container of mounted.containers) {
		count += container.GetChildren().size();
	}

	return count;
}

export function everyHost(
	mounted: Mounted,
	check: (frame: Frame) => boolean,
): boolean {
	for (const container of mounted.containers) {
		for (const child of container.GetChildren()) {
			if (child.IsA("Frame") && !check(child)) {
				return false;
			}
		}
	}

	return true;
}

export const colored = (hex: string) => (frame: Frame) =>
	frame.BackgroundColor3.ToHex() === hex;

function mountAndMeasure(context: VelaBench.Context, build: Build) {
	const { metrics, count } = context;
	VelaBench.snapshot(metrics, "baseline");
	const mounted = mount(context, build, "mountCpuMs");
	VelaBench.waitUntil(
		metrics,
		"mountSettled",
		() => hostCount(mounted) >= count,
	);
	VelaBench.snapshot(metrics, "mounted");
	VelaBench.frames(metrics, "mounted");
	unmount(mounted);
	VelaBench.snapshot(metrics, "unmounted");
}

export const scenarios: VelaBench.Scenario[] = [
	{
		name: "mount-static",
		sized: true,
		run: (context) => mountAndMeasure(context, staticItems),
	},
	{
		name: "mount-runtime",
		sized: true,
		run: (context) => mountAndMeasure(context, runtimeItems),
	},
	{
		name: "rerender",
		sized: true,
		run: (context) => {
			const { metrics, count } = context;
			const mounted = mount(context, runtimeItems);
			VelaBench.waitUntil(
				metrics,
				"mountSettled",
				() => hostCount(mounted) >= count,
			);
			VelaBench.settle();
			rerender(mounted, metrics);
			VelaBench.waitUntil(metrics, "rerenderSettled", () =>
				everyHost(mounted, colored(SLATE_600)),
			);
			VelaBench.frames(metrics, "rerendered");
			unmount(mounted);
		},
	},
	{
		name: "env-broadcast",
		sized: true,
		run: (context) => {
			const { metrics, count } = context;
			const previous = VelaBench.colorScheme();
			VelaBench.setColorScheme("light");
			const mounted = mount(context, schemeItems);
			VelaBench.waitUntil(
				metrics,
				"mountSettled",
				() =>
					hostCount(mounted) >= count && everyHost(mounted, colored(SLATE_100)),
			);
			VelaBench.snapshot(metrics, "mounted");
			VelaBench.timeHandlers(metrics, "broadcastCpuMs", () =>
				VelaBench.setColorScheme("dark"),
			);
			VelaBench.waitUntil(metrics, "broadcast", () =>
				everyHost(mounted, colored(SLATE_900)),
			);
			VelaBench.frames(metrics, "dark");
			VelaBench.setColorScheme(previous);
			unmount(mounted);
		},
	},
	{
		name: "attribute-variant",
		sized: true,
		run: (context) => {
			const { metrics, count } = context;
			const mounted = mount(context, attributeItems);
			VelaBench.waitUntil(
				metrics,
				"mountSettled",
				() => hostCount(mounted) >= count,
			);
			VelaBench.settle();
			VelaBench.timeHandlers(metrics, "attributeCpuMs", () => {
				for (const container of mounted.containers) {
					for (const child of container.GetChildren()) {
						child.SetAttribute("Selected", true);
					}
				}
			});
			VelaBench.waitUntil(metrics, "attribute", () =>
				everyHost(mounted, colored(ROSE_500)),
			);
			VelaBench.frames(metrics, "selected");
			unmount(mounted);
		},
	},
	{
		name: "divide-list",
		sized: false,
		count: 200,
		run: (context) => {
			const { metrics, count, container } = context;
			VelaBench.snapshot(metrics, "baseline");
			const root = ReactRoblox.createLegacyRoot(container);
			const element = divideList(count);
			VelaBench.time(metrics, "mountCpuMs", () => root.render(element));
			VelaBench.waitUntil(metrics, "mountSettled", () => {
				const list = container.FindFirstChild("list");
				// Every child plus a separator between each pair.
				return list !== undefined && list.GetChildren().size() >= count * 2 - 1;
			});
			VelaBench.snapshot(metrics, "mounted");
			VelaBench.frames(metrics, "mounted");
			VelaBench.time(metrics, "unmountCpuMs", () => root.unmount());
		},
	},
	{
		name: "relational",
		sized: true,
		run: (context) => {
			const { metrics, count } = context;
			VelaBench.snapshot(metrics, "baseline");
			const mounted = mount(context, groupItems, "mountCpuMs");
			VelaBench.waitUntil(
				metrics,
				"mountSettled",
				() => hostCount(mounted) >= count,
			);
			VelaBench.snapshot(metrics, "mounted");
			metrics.mountedScopes = VelaBench.observedScopeCount();
			metrics.mountedFollowedTags = VelaBench.followedTagCount();
			unmount(mounted, metrics);
			VelaBench.snapshot(metrics, "unmounted");
		},
	},
	{
		name: "unmount",
		sized: true,
		run: (context) => {
			const { metrics, count } = context;
			VelaBench.snapshot(metrics, "baseline");
			const mounted = mount(context, runtimeItems);
			VelaBench.waitUntil(
				metrics,
				"mountSettled",
				() => hostCount(mounted) >= count,
			);
			VelaBench.snapshot(metrics, "mounted");
			unmount(mounted, metrics);
			VelaBench.snapshot(metrics, "unmounted");
		},
	},
];
