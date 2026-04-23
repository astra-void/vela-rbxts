import { beforeEach, expect, test, vi } from "vitest";

vi.mock("@rbxts/react", () => ({
	default: {
		createElement: vi.fn((tag, props, ...children) => ({
			tag,
			props,
			children,
		})),
		useEffect: vi.fn(),
		useState: vi.fn((initialValue) => [
			typeof initialValue === "function" ? initialValue() : initialValue,
			vi.fn(),
		]),
	},
}));

const signal = {
	Connect: vi.fn(() => ({
		Disconnect: vi.fn(),
	})),
};

vi.mock("@rbxts/services", () => ({
	UserInputService: {
		GamepadEnabled: false,
		TouchEnabled: false,
		GetPropertyChangedSignal: vi.fn(() => signal),
	},
	Workspace: {
		CurrentCamera: {
			ViewportSize: { X: 1024, Y: 768 },
			GetPropertyChangedSignal: vi.fn(() => signal),
		},
		GetPropertyChangedSignal: vi.fn(() => signal),
	},
}));

beforeEach(() => {
	vi.resetModules();
	Object.defineProperty(String.prototype, "size", {
		value() {
			return this.length;
		},
		configurable: true,
	});
	Object.defineProperty(Array.prototype, "size", {
		value() {
			return this.length;
		},
		configurable: true,
	});
	vi.stubGlobal("string", {
		sub: (value: string, start: number, stop?: number) =>
			value.slice(start - 1, stop),
	});
	vi.stubGlobal("tonumber", (value: string) => {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : undefined;
	});
	vi.stubGlobal("tostring", (value: unknown) => String(value));
	vi.stubGlobal("typeOf", (value: unknown) => {
		if (value === undefined) {
			return "nil";
		}
		if (Array.isArray(value) || typeof value === "object") {
			return "table";
		}
		return typeof value;
	});
	vi.stubGlobal("pairs", (value: Record<string, unknown>) =>
		Object.entries(value),
	);
	vi.stubGlobal("Color3", {
		fromRGB: vi.fn((red, green, blue) => ({ red, green, blue })),
	});
	class TestUDim2 {
		constructor(
			public xScale: number,
			public xOffset: number,
			public yScale: number,
			public yOffset: number,
		) {}

		static fromOffset(x: number, y: number) {
			return new TestUDim2(0, x, 0, y);
		}

		static fromScale(x: number, y: number) {
			return new TestUDim2(x, 0, y, 0);
		}
	}

	vi.stubGlobal(
		"UDim",
		class {
			constructor(
				public Scale: number,
				public Offset: number,
			) {}
		},
	);
	vi.stubGlobal("UDim2", TestUDim2);
});

test("does not silently coerce invalid singleton colors to white", async () => {
	const { createTailwindRuntimeHost } = await import("../src/runtime");
	const RuntimeHost = createTailwindRuntimeHost({
		theme: {
			colors: {
				brand: "not-a-color",
			},
			radius: {},
			spacing: {},
		},
	});

	const element = RuntimeHost({
		__rbxtsTailwindTag: "frame",
		className: "bg-brand",
	});

	expect(element.props).not.toHaveProperty("BackgroundColor3");
	expect(
		(
			globalThis as unknown as {
				Color3: { fromRGB: ReturnType<typeof vi.fn> };
			}
		).Color3.fromRGB,
	).not.toHaveBeenCalledWith(255, 255, 255);
});

test("resolves runtime color lookups from normalized palettes", async () => {
	const { createTailwindRuntimeHost } = await import("../src/runtime");
	const RuntimeHost = createTailwindRuntimeHost({
		theme: {
			colors: {
				brand: {
					500: "Color3.fromRGB(4, 5, 6)",
					700: "Color3.fromRGB(7, 8, 9)",
				},
			},
			radius: {},
			spacing: {},
		},
	});

	const element = RuntimeHost({
		__rbxtsTailwindTag: "frame",
		className: "bg-brand-700",
	});

	expect(element.props.BackgroundColor3).toEqual({
		red: 7,
		green: 8,
		blue: 9,
	});
});

test("does not resolve unshaded palette colors", async () => {
	const { createTailwindRuntimeHost } = await import("../src/runtime");
	const RuntimeHost = createTailwindRuntimeHost({
		theme: {
			colors: {
				brand: {
					500: "Color3.fromRGB(4, 5, 6)",
					700: "Color3.fromRGB(7, 8, 9)",
				},
			},
			radius: {},
			spacing: {},
		},
	});

	const element = RuntimeHost({
		__rbxtsTailwindTag: "frame",
		className: "bg-brand",
	});

	expect(element.props).not.toHaveProperty("BackgroundColor3");
});
