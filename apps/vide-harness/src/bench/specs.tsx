import Vide from "@rbxts/vide";
import { VelaBench } from "./runner";
import {
	attributeItems,
	colored,
	divideList,
	everyHost,
	hostCount,
	mount,
	ROSE_500,
	relationalTree,
	runtimeItems,
	SLATE_100,
	SLATE_700,
	SLATE_900,
	schemeItems,
	unmount,
} from "./scenarios";

function mountSettled(
	container: Instance,
	count: number,
	build: Parameters<typeof mount>[1],
) {
	const metrics: VelaBench.Metrics = {};
	const mounted = mount({ container, count, metrics }, build);
	VelaBench.waitUntil(metrics, "mount", () => hostCount(mounted) >= count);
	VelaBench.settle();

	return mounted;
}

/// What the visual order of a list's slot-taking children reads as.
function slotOrder(list: Instance): {
	names: string[];
	layoutOrders: number[];
} {
	const slots = list
		.GetChildren()
		.filter((child): child is GuiObject => child.IsA("GuiObject"));
	slots.sort((a, b) => a.AbsolutePosition.Y < b.AbsolutePosition.Y);

	return {
		names: slots.map((slot) =>
			slot.Name.find("item-", 1, true)[0] === 1 ? slot.Name : "|",
		),
		layoutOrders: slots.map((slot) => slot.LayoutOrder),
	};
}

export const specs: VelaBench.Spec[] = [
	{
		// Vide reads the store through one place-wide source, so mounting hosts adds no listener.
		name: "env store: listener count constant across 1000 runtime hosts",
		run: (container) => {
			const baseline = VelaBench.listenerCount();
			const small = mountSettled(container, 100, runtimeItems);
			const atSmall = VelaBench.listenerCount();
			unmount(small);
			const large = mountSettled(container, 1000, runtimeItems);
			const atLarge = VelaBench.listenerCount();
			unmount(large);
			VelaBench.settle();
			VelaBench.assertEqual(atSmall, baseline, "listeners with 100 hosts");
			VelaBench.assertEqual(atLarge, baseline, "listeners with 1000 hosts");
			VelaBench.assertEqual(
				VelaBench.listenerCount(),
				baseline,
				"listeners after unmount",
			);

			return { baseline, atSmall, atLarge };
		},
	},
	{
		name: "dark: follows the VelaColorScheme attribute",
		run: (container) => {
			const previous = VelaBench.colorScheme();
			VelaBench.setColorScheme("light");
			const metrics: VelaBench.Metrics = {};
			const mounted = mountSettled(container, 1, schemeItems);
			try {
				VelaBench.waitUntil(metrics, "light", () =>
					everyHost(mounted, colored(SLATE_100)),
				);
				VelaBench.setColorScheme("dark");
				VelaBench.waitUntil(metrics, "dark", () =>
					everyHost(mounted, colored(SLATE_900)),
				);
				VelaBench.setColorScheme("light");
				VelaBench.waitUntil(metrics, "back", () =>
					everyHost(mounted, colored(SLATE_100)),
				);
			} finally {
				VelaBench.setColorScheme(previous);
				unmount(mounted);
			}

			return metrics;
		},
	},
	{
		name: "selected: follows the Selected attribute",
		run: (container) => {
			const metrics: VelaBench.Metrics = {};
			const mounted = mountSettled(container, 1, attributeItems);
			const host = mounted.containers[0].FindFirstChildOfClass("Frame");
			try {
				host?.SetAttribute("Selected", true);
				VelaBench.waitUntil(metrics, "selected", () =>
					everyHost(mounted, colored(ROSE_500)),
				);
				host?.SetAttribute("Selected", false);
				VelaBench.waitUntil(metrics, "cleared", () =>
					everyHost(mounted, colored(SLATE_700)),
				);
			} finally {
				unmount(mounted);
			}

			return metrics;
		},
	},
	{
		name: "divide: separators sit between children in declared order",
		run: (container) => {
			const count = 4;
			const cleanup = Vide.mount(() => divideList(count), container);
			const metrics: VelaBench.Metrics = {};
			try {
				VelaBench.waitUntil(metrics, "mount", () => {
					const list = container.FindFirstChild("list");
					return (
						list !== undefined && list.GetChildren().size() >= count * 2 - 1
					);
				});
				VelaBench.settle();
				const order = slotOrder(container.FindFirstChild("list") as Instance);
				VelaBench.assertEqual(
					order.names.join(","),
					"item-0,|,item-1,|,item-2,|,item-3",
					"visual order",
				);
				// Children take the even ranks and separators the odd ones between.
				VelaBench.assertEqual(
					order.layoutOrders.join(","),
					"0,1,2,3,4,5,6",
					"rank assignment",
				);

				return { layoutOrders: order.layoutOrders.join(",") };
			} finally {
				cleanup();
			}
		},
	},
	{
		name: "divide: separators follow the LayoutOrder each child declares",
		run: (container) => {
			const count = 4;
			const cleanup = Vide.mount(() => divideList(count, true), container);
			const metrics: VelaBench.Metrics = {};
			try {
				VelaBench.waitUntil(metrics, "mount", () => {
					const list = container.FindFirstChild("list");
					return (
						list !== undefined && list.GetChildren().size() >= count * 2 - 1
					);
				});
				VelaBench.settle();
				const order = slotOrder(container.FindFirstChild("list") as Instance);
				VelaBench.assertEqual(
					order.names.join(","),
					"item-3,|,item-2,|,item-1,|,item-0",
					"visual order",
				);
				// Children take the even ranks and separators the odd ones between.
				VelaBench.assertEqual(
					order.layoutOrders.join(","),
					"0,1,2,3,4,5,6",
					"rank assignment",
				);

				return { layoutOrders: order.layoutOrders.join(",") };
			} finally {
				cleanup();
			}
		},
	},
	{
		name: "group/peer: state propagates to marked descendants",
		run: (container) => {
			const baseline = VelaBench.observedScopeCount();
			const followedBaseline = VelaBench.followedTagCount();
			const cleanup = Vide.mount(() => relationalTree(), container);
			const metrics: VelaBench.Metrics = {};
			try {
				VelaBench.waitUntil(
					metrics,
					"mount",
					() =>
						container
							.FindFirstChild("relational")
							?.FindFirstChild("pair")
							?.FindFirstChild("hint") !== undefined,
				);
				VelaBench.settle();
				const tree = container.FindFirstChild("relational") as Instance;
				const group = tree.FindFirstChild("group") as TextBox;
				const member = group.FindFirstChild("member") as Frame;
				const pair = tree.FindFirstChild("pair") as Instance;
				const field = pair.FindFirstChild("field") as TextBox;
				const hint = pair.FindFirstChild("hint") as Frame;
				VelaBench.assertEqual(group.HasTag("VelaGroup"), true, "group tag");
				VelaBench.assertEqual(field.HasTag("VelaPeer/field"), true, "peer tag");
				const marginPair = tree.FindFirstChild("marginPair") as Instance;
				const marginField = marginPair.FindFirstChildWhichIsA(
					"TextBox",
					true,
				) as TextBox;
				const marginHint = marginPair.FindFirstChildWhichIsA(
					"TextLabel",
					true,
				) as TextLabel;
				VelaBench.assertEqual(
					marginField.Parent?.HasTag("VelaMarginBox"),
					true,
					"margin box tag",
				);
				VelaBench.assertEqual(
					VelaBench.observedScopeCount() - baseline,
					3,
					"observed scopes",
				);
				VelaBench.assertEqual(
					VelaBench.followedTagCount() - followedBaseline,
					2,
					"followed tags",
				);

				group.CaptureFocus();
				VelaBench.waitUntil(metrics, "groupFocus", () =>
					colored(ROSE_500)(member),
				);
				group.ReleaseFocus();
				VelaBench.waitUntil(metrics, "groupBlur", () =>
					colored(SLATE_700)(member),
				);

				field.CaptureFocus();
				VelaBench.waitUntil(metrics, "peerFocus", () =>
					colored(ROSE_500)(hint),
				);
				field.ReleaseFocus();
				VelaBench.waitUntil(metrics, "peerBlur", () =>
					colored(SLATE_700)(hint),
				);

				marginField.CaptureFocus();
				VelaBench.waitUntil(
					metrics,
					"marginPeerFocus",
					() => marginHint.BackgroundColor3.ToHex() === ROSE_500,
				);
				marginField.ReleaseFocus();
				VelaBench.waitUntil(
					metrics,
					"marginPeerBlur",
					() => marginHint.BackgroundColor3.ToHex() === SLATE_700,
				);
			} finally {
				cleanup();
			}

			VelaBench.settle();
			VelaBench.assertEqual(
				VelaBench.observedScopeCount(),
				baseline,
				"observed scopes after unmount",
			);
			VelaBench.assertEqual(
				VelaBench.followedTagCount(),
				followedBaseline,
				"followed tags after unmount",
			);

			return metrics;
		},
	},
];
