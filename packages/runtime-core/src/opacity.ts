export namespace __VelaOpacity {
	/// Mirrors `opacity_transparency_props`: every channel an instance paints
	/// itself. A CanvasGroup composites its whole subtree, so `GroupTransparency`
	/// is the one property that already means what CSS `opacity` means. A helper
	/// is not a host: only the ones that draw carry a transparency, and a
	/// background written onto the rest would throw.
	export function transparencyProps(tag: string | undefined): string[] {
		if (tag === "canvasgroup") {
			return ["GroupTransparency"];
		}

		if (tag === "textlabel" || tag === "textbutton" || tag === "textbox") {
			return ["BackgroundTransparency", "TextTransparency"];
		}

		if (tag === "imagelabel" || tag === "imagebutton") {
			return ["BackgroundTransparency", "ImageTransparency"];
		}

		if (tag === "uistroke" || tag === "uishadow" || tag === "uiblur") {
			return ["Transparency"];
		}

		// A component element hides its tag, and the static path takes the same
		// branch: the background is the one channel every host paints.
		if (tag === undefined || tag === "frame" || tag === "scrollingframe") {
			return ["BackgroundTransparency"];
		}

		return [];
	}

	export function compose(transparency: number, alpha: number): number {
		return 1 - (1 - transparency) * alpha;
	}
}
