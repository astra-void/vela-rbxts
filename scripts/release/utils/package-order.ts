import { WORKSPACE_PUBLISH_PRIORITY } from "../release-config";
import type { PackageJson } from "./package-json";

function sortByPriority(packageName: string, otherName: string) {
	const leftPriority = WORKSPACE_PUBLISH_PRIORITY.indexOf(
		packageName as (typeof WORKSPACE_PUBLISH_PRIORITY)[number],
	);
	const rightPriority = WORKSPACE_PUBLISH_PRIORITY.indexOf(
		otherName as (typeof WORKSPACE_PUBLISH_PRIORITY)[number],
	);
	const left = leftPriority === -1 ? Number.MAX_SAFE_INTEGER : leftPriority;
	const right = rightPriority === -1 ? Number.MAX_SAFE_INTEGER : rightPriority;
	if (left !== right) {
		return left - right;
	}
	return packageName.localeCompare(otherName);
}

export function computeDependencySafeOrder(
	manifests: Map<string, PackageJson>,
	packageNames: readonly string[],
) {
	const nodes = new Set(packageNames);
	const incoming = new Map<string, Set<string>>();
	const outgoing = new Map<string, Set<string>>();

	for (const node of nodes) {
		incoming.set(node, new Set());
		outgoing.set(node, new Set());
	}

	for (const node of nodes) {
		const manifest = manifests.get(node);
		if (!manifest) {
			continue;
		}

		const deps = {
			...(manifest.dependencies ?? {}),
			...(manifest.peerDependencies ?? {}),
			...(manifest.optionalDependencies ?? {}),
		};

		for (const depName of Object.keys(deps)) {
			if (!nodes.has(depName)) {
				continue;
			}
			incoming.get(node)?.add(depName);
			outgoing.get(depName)?.add(node);
		}
	}

	const queue = [...nodes]
		.filter((node) => (incoming.get(node)?.size ?? 0) === 0)
		.sort(sortByPriority);
	const ordered: string[] = [];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) {
			continue;
		}
		ordered.push(current);
		for (const dependent of outgoing.get(current) ?? []) {
			const dependentIncoming = incoming.get(dependent);
			if (!dependentIncoming) {
				continue;
			}
			dependentIncoming.delete(current);
			if (dependentIncoming.size === 0) {
				queue.push(dependent);
				queue.sort(sortByPriority);
			}
		}
	}

	if (ordered.length !== nodes.size) {
		throw new Error(
			"Failed to derive dependency-safe package order (cycle detected).",
		);
	}

	return ordered;
}
