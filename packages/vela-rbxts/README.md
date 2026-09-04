# vela-rbxts

Tailwind-style `className` support for [roblox-ts](https://roblox-ts.com/) React UI.

`vela-rbxts` is the main public package. It adds `className?: ClassValue` to `React.Attributes`, exposes `defineConfig()`, `definePreset()` and `plugin()` for `vela.config.ts`, and ships the `rbxtsc` transformer entry used during the roblox-ts build.

## Install

```bash
pnpm add vela-rbxts @rbxts/react @rbxts/react-roblox @rbxts/services
pnpm add -D @rbxts/compiler-types @rbxts/types roblox-ts typescript
```

## Setup

Register the transformer in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "vela-rbxts/transformer" }]
  }
}
```

Add `vela.config.ts` at the project root:

```ts
import { defineConfig } from "vela-rbxts";

export default defineConfig();
```

Add a declaration file such as `src/vela-env.d.ts` so `className` is available on React attributes:

```ts
import "vela-rbxts";
```

Do not name it `src/vela-rbxts.d.ts`. A roblox-ts project sets `baseUrl` to `src`, so under that name the import resolves back to the declaration file itself instead of the package, and `className` silently never appears.

## Usage

```tsx
import React from "@rbxts/react";

export function App() {
  return <frame className="bg-slate-700 rounded-md px-4 py-3 gap-4" />;
}
```

Supported utility classes are lowered into Roblox UI props at build time and `className` is removed from the emitted output. No extra runtime package or Rojo mapping is required.

State a UI has of its own (open, selected, disabled) is a variant you register, reading a Roblox attribute off the styled instance:

```ts
import { defineConfig, plugin } from "vela-rbxts";

export default defineConfig({
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("selected", { attribute: "Selected", equals: true });
    }),
  ],
});
```

```tsx
<textbutton className="bg-slate-800 selected:bg-blue-600 md:px-6 max-md:px-3 transition-colors" />
```

See the [repository README](https://github.com/astra-void/vela-rbxts#readme) for the full list of supported utilities, host elements, and variants, plus responsive ranges, configurable breakpoints, and presets.

## License

MIT
