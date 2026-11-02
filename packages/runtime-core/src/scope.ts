import { CollectionService as __VelaCollectionService } from "@rbxts/services";
import { __VelaLua } from "./lua";
import type {
	RuntimeScopeNeeds,
	RuntimeScopeState,
	RuntimeScopes,
	VariantEventBinding,
} from "./types";
import { __VelaVariant } from "./variant";

/// What `group-*` and `peer-*` read: the instance tree, found through the tags
/// the `group` and `peer` markers lower to. Both hosts share it, because Vide
/// builds children before their parents and so has no scope to hand down.
export namespace __VelaScope {
	export const GROUP_MARKER = "group";
	export const PEER_MARKER = "peer";
	export const GROUP_TAG = "VelaGroup";
	export const PEER_TAG = "VelaPeer";
	/// On the frame a host wraps an `m-*` element in, so peers are looked for
	/// beside the box rather than inside it.
	export const MARGIN_BOX_TAG = "VelaMarginBox";

	const IDLE: RuntimeScopeState = {
		hovered: false,
		pressed: false,
		focused: false,
	};

	/// The tag a marker named `name` lowers to, `""` being the unnamed one.
	export function tagFor(base: string, name: string): string {
		return name === "" ? base : `${base}/${name}`;
	}

	/// The tag a class-value utility puts on its instance, when it is a marker.
	export function markerTag(utility: string): string | undefined {
		return (
			readMarker(utility, GROUP_MARKER, GROUP_TAG) ??
			readMarker(utility, PEER_MARKER, PEER_TAG)
		);
	}

	function readMarker(
		utility: string,
		marker: string,
		tag: string,
	): string | undefined {
		if (utility === marker) {
			return tag;
		}

		const prefix = `${marker}/`;
		if (!__VelaLua.startsWith(utility, prefix)) {
			return undefined;
		}

		const name = __VelaLua.after(utility, prefix);
		return __VelaVariant.isMarkerName(name) ? tagFor(tag, name) : undefined;
	}

	/// The nearest ancestor carrying the group tag, starting at the parent, so
	/// an element never reads its own state through `group-*`.
	export function findGroup(
		element: Instance,
		name: string,
	): Instance | undefined {
		const tag = tagFor(GROUP_TAG, name);
		let current = element.Parent;
		while (current !== undefined) {
			if (current.HasTag(tag)) {
				return current;
			}
			current = current.Parent;
		}

		return undefined;
	}

	/// What the instance takes its place among its siblings as: the margin box
	/// a host wrapped it in, or the instance itself.
	export function slotOf(instance: Instance): Instance {
		const parent = instance.Parent;
		return parent?.HasTag(MARGIN_BOX_TAG) ? parent : instance;
	}

	/// The parent's children, and the element inside each margin box among them.
	function eachSlotted(parent: Instance, visit: (child: Instance) => void) {
		for (const child of parent.GetChildren()) {
			visit(child);
			if (child.HasTag(MARGIN_BOX_TAG)) {
				for (const inner of child.GetChildren()) {
					visit(inner);
				}
			}
		}
	}

	/// Every sibling under the same parent carrying the peer tag. Roblox keeps
	/// no sibling order, so Tailwind's "an earlier sibling" cannot be asked.
	export function findPeers(element: Instance, name: string): Instance[] {
		const slot = slotOf(element);
		const parent = slot.Parent;
		if (parent === undefined) {
			return [];
		}

		const tag = tagFor(PEER_TAG, name);
		const found: Instance[] = [];
		eachSlotted(parent, (child) => {
			if (child !== element && child !== slot && child.HasTag(tag)) {
				found.push(child);
			}
		});

		return found;
	}

	/// A peer marker on the child, or on the element inside it when it is a
	/// margin box.
	function carriesAny(child: Instance, tags: readonly string[]): boolean {
		if (tags.some((tag) => child.HasTag(tag))) {
			return true;
		}
		if (!child.HasTag(MARGIN_BOX_TAG)) {
			return false;
		}

		return child
			.GetChildren()
			.some((inner) => tags.some((tag) => inner.HasTag(tag)));
	}

	type TagReaders = {
		group: boolean;
		readers: Map<Instance, Set<() => void>>;
		connections: RBXScriptConnection[];
	};

	const tagReaders = new Map<string, TagReaders>();

	/// Only readers a change to this instance's tag can reach: those under it
	/// for a group, those beside it for a peer. Walking from the instance keeps
	/// a burst of N markers from waking every one of N readers.
	function dispatch(entry: TagReaders, instance: Instance) {
		const wake = (candidate: Instance) => {
			const callbacks = entry.readers.get(candidate);
			if (callbacks !== undefined) {
				for (const callback of [...callbacks]) {
					callback();
				}
			}
		};

		if (entry.group) {
			for (const descendant of instance.GetDescendants()) {
				wake(descendant);
			}
			return;
		}

		const parent = slotOf(instance).Parent;
		if (parent !== undefined) {
			eachSlotted(parent, wake);
		}
	}

	/// One pair of CollectionService connections per tag for the whole place,
	/// held while any reader follows it.
	function followTag(
		tag: string,
		group: boolean,
		element: Instance,
		rebind: () => void,
	): () => void {
		let entry = tagReaders.get(tag);
		if (entry === undefined) {
			const created: TagReaders = {
				group,
				readers: new Map(),
				connections: [],
			};
			entry = created;
			tagReaders.set(tag, created);
			const onTag = (instance: Instance) => dispatch(created, instance);
			created.connections.push(
				__VelaCollectionService.GetInstanceAddedSignal(tag).Connect(onTag),
			);
			created.connections.push(
				__VelaCollectionService.GetInstanceRemovedSignal(tag).Connect(onTag),
			);
		}

		const held = entry;
		let callbacks = held.readers.get(element);
		if (callbacks === undefined) {
			callbacks = new Set();
			held.readers.set(element, callbacks);
		}
		const own = callbacks;
		own.add(rebind);

		return () => {
			own.delete(rebind);
			if (own.size() === 0 && held.readers.get(element) === own) {
				held.readers.delete(element);
			}
			if (held.readers.size() === 0 && tagReaders.get(tag) === held) {
				tagReaders.delete(tag);
				for (const connection of held.connections) {
					connection.Disconnect();
				}
			}
		};
	}

	/// Read-only, for benches and specs: how many tags have a place-wide
	/// CollectionService subscription.
	export function followedTagCount(): number {
		return tagReaders.size();
	}

	type Observed = {
		state: RuntimeScopeState;
		listeners: Set<() => void>;
		connections: RBXScriptConnection[];
	};

	const observed = new Map<Instance, Observed>();

	function release(instance: Instance) {
		const entry = observed.get(instance);
		if (entry === undefined) {
			return;
		}

		observed.delete(instance);
		for (const connection of entry.connections) {
			connection.Disconnect();
		}
	}

	/// One set of connections per observed instance however many elements read
	/// it, held while any of them does and dropped when the instance goes.
	export function observe(
		instance: Instance,
		listener: () => void,
	): () => void {
		let entry = observed.get(instance);
		if (entry === undefined) {
			const created: Observed = {
				state: IDLE,
				listeners: new Set(),
				connections: [],
			};
			entry = created;
			observed.set(instance, created);

			const write = (key: keyof RuntimeScopeState, value: boolean) => {
				if (created.state[key] === value) {
					return;
				}
				const updated = { ...created.state };
				updated[key] = value;
				created.state = updated;
				for (const each of [...created.listeners]) {
					each();
				}
			};

			if (instance.IsA("GuiObject")) {
				const bindings: VariantEventBinding[] = [];
				for (const binding of __VelaVariant.hoverTracking((value) =>
					write("hovered", value),
				)) {
					bindings.push(binding);
				}
				for (const binding of __VelaVariant.activeTracking((value) =>
					write("pressed", value),
				)) {
					bindings.push(binding);
				}
				for (const binding of __VelaVariant.focusTracking(
					instance.IsA("TextBox") ? "textbox" : "frame",
					(value) => write("focused", value),
				)) {
					bindings.push(binding);
				}

				for (const binding of bindings) {
					const signal = (
						instance as unknown as Record<string, RBXScriptSignal | undefined>
					)[binding.name];
					if (signal !== undefined) {
						created.connections.push(signal.Connect(binding.handler));
					}
				}
			}

			created.connections.push(
				instance.Destroying.Connect(() => release(instance)),
			);
		}

		// A token per acquisition, so a rebind can take the new hold before it
		// lets go of the old one and the state survives it.
		const token = () => listener();
		const held = entry;
		held.listeners.add(token);

		return () => {
			held.listeners.delete(token);
			if (held.listeners.size() === 0 && observed.get(instance) === held) {
				release(instance);
			}
		};
	}

	/// Read-only, for benches and specs: how many instances are being observed.
	export function observedCount(): number {
		return observed.size();
	}

	export function stateOf(instance: Instance): RuntimeScopeState {
		return observed.get(instance)?.state ?? IDLE;
	}

	/// Any marked sibling in the state counts, so several peers OR together.
	function combine(instances: readonly Instance[]): RuntimeScopeState {
		let hovered = false;
		let pressed = false;
		let focused = false;
		for (const instance of instances) {
			const state = stateOf(instance);
			hovered = hovered || state.hovered;
			pressed = pressed || state.pressed;
			focused = focused || state.focused;
		}

		return { hovered, pressed, focused };
	}

	function sameState(
		previous: RuntimeScopeState | undefined,
		latest: RuntimeScopeState,
	): boolean {
		const left = previous ?? IDLE;
		return (
			left.hovered === latest.hovered &&
			left.pressed === latest.pressed &&
			left.focused === latest.focused
		);
	}

	/// Missing entries read as idle, which is what a host starts from.
	export function sameScopes(
		previous: RuntimeScopes | undefined,
		latest: RuntimeScopes,
	): boolean {
		for (const [name, state] of pairs(latest.groups)) {
			if (!sameState(previous?.groups[name as string], state)) {
				return false;
			}
		}
		for (const [name, state] of pairs(latest.peers)) {
			if (!sameState(previous?.peers[name as string], state)) {
				return false;
			}
		}

		return true;
	}

	export function needsKey(needs: RuntimeScopeNeeds): string {
		return `${__VelaLua.join(needs.groups, ",")}|${__VelaLua.join(needs.peers, ",")}`;
	}

	export function hasNeeds(needs: RuntimeScopeNeeds): boolean {
		return needs.groups.size() > 0 || needs.peers.size() > 0;
	}

	/// Finds what the element's `group-*` and `peer-*` read and reports their
	/// states as they change. It follows the element moving, siblings coming
	/// and going and markers being added or removed, and stops on the returned
	/// disposer or when the element is destroyed.
	export function watch(
		element: Instance,
		needs: RuntimeScopeNeeds,
		onChange: (scopes: RuntimeScopes) => void,
	): () => void {
		const structural: RBXScriptConnection[] = [];
		let siblingConnections: RBXScriptConnection[] = [];
		let releases: (() => void)[] = [];
		const groups = new Map<string, Instance>();
		const peers = new Map<string, Instance[]>();
		let last: RuntimeScopes | undefined;
		let disposed = false;
		const peerTags = needs.peers.map((name) => tagFor(PEER_TAG, name));

		function read(): RuntimeScopes {
			const scopes: RuntimeScopes = { groups: {}, peers: {} };
			for (const name of needs.groups) {
				const target = groups.get(name);
				scopes.groups[name] = target === undefined ? IDLE : stateOf(target);
			}
			for (const name of needs.peers) {
				scopes.peers[name] = combine(peers.get(name) ?? []);
			}

			return scopes;
		}

		function emit() {
			if (disposed) {
				return;
			}

			const latest = read();
			if (sameScopes(last, latest)) {
				return;
			}

			last = latest;
			onChange(latest);
		}

		function bind() {
			if (disposed) {
				return;
			}

			const previous = releases;
			releases = [];
			for (const connection of siblingConnections) {
				connection.Disconnect();
			}
			siblingConnections = [];
			groups.clear();
			peers.clear();

			for (const name of needs.groups) {
				const target = findGroup(element, name);
				if (target !== undefined) {
					groups.set(name, target);
					releases.push(observe(target, emit));
				}
			}

			const parent = slotOf(element).Parent;
			if (needs.peers.size() > 0 && parent !== undefined) {
				siblingConnections.push(
					parent.ChildAdded.Connect((child) => {
						if (carriesAny(child, peerTags)) {
							bind();
						}
					}),
				);
				siblingConnections.push(
					parent.ChildRemoved.Connect((child) => {
						for (const [, found] of peers) {
							if (found.some((peer) => slotOf(peer) === child)) {
								bind();
								return;
							}
						}
					}),
				);
				for (const name of needs.peers) {
					const found = findPeers(element, name);
					peers.set(name, found);
					for (const peer of found) {
						releases.push(observe(peer, emit));
					}
				}
			}

			for (const releaseHold of previous) {
				releaseHold();
			}

			emit();
		}

		// Deferred: inside the removed signal the tag can still read as present,
		// and a burst of marker changes rebinds once.
		let pending = false;
		function rebindLater() {
			if (pending) {
				return;
			}
			pending = true;
			task.defer(() => {
				pending = false;
				bind();
			});
		}

		const unfollow: (() => void)[] = [];
		for (const name of needs.groups) {
			unfollow.push(
				followTag(tagFor(GROUP_TAG, name), true, element, rebindLater),
			);
		}
		for (const tag of peerTags) {
			unfollow.push(followTag(tag, false, element, rebindLater));
		}

		function dispose() {
			if (disposed) {
				return;
			}

			disposed = true;
			for (const connection of structural) {
				connection.Disconnect();
			}
			for (const stop of unfollow) {
				stop();
			}
			for (const connection of siblingConnections) {
				connection.Disconnect();
			}
			for (const releaseHold of releases) {
				releaseHold();
			}
			releases = [];
		}

		structural.push(element.AncestryChanged.Connect(bind));
		structural.push(element.Destroying.Connect(dispose));
		bind();

		return dispose;
	}
}
