# rbxts-tailwind

`rbxts-tailwind` is the Tailwind CSS integration layer for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the compiler, host adapter, shared config/types, and the main consumer package that exposes the public API.

## What is implemented now

Current utility-class implementation status: about **70% complete** for the repo's current v0 scope.

That percentage is based on the feature slice that exists today, not on full Tailwind parity.

The current implementation is focused on `className`-driven utility classes for Roblox UI elements.

- `rbxts-tailwind` augments `React.Attributes` so TSX can accept `className?: ClassValue`.
- `rbxts-tailwind/transformer` exposes the TypeScript transformer entry point for `rbxtsc`.
- `@rbxts-tailwind/rbxtsc-host` decides which TSX files should be transformed and bridges compiler diagnostics into the host.
- `@rbxts-tailwind/compiler` lowers supported utility classes into Roblox UI props and removes the original `className`.
- `@rbxts-tailwind/config` provides the default config and `defineConfig()` helper.
- `@rbxts-tailwind/core` owns the semantic boundary and supported host element contracts.
- `@rbxts-tailwind/types` provides shared public types such as `ClassValue` and `StylableProps`.

### Implementation progress

Completed in the current slice:

- `className` support on TSX `React.Attributes`
- host file filtering for `.tsx`, JSX presence, and `className` presence
- nearest `rbxtw.config.ts` loading with `defineConfig()` support
- lowering for `bg-*`, `rounded-*`, and `px|py|pt|pr|pb|pl-*`
- diagnostics for unsupported utility families and unknown theme keys
- transformer entry points for `rbxtsc` and direct host use

Still incomplete:

- broader Tailwind utility families beyond the current theme-backed slice
- variant handling such as responsive/state modifiers
- arbitrary value support
- fuller CSS parity across Roblox UI styling
- more host-aware lowering rules beyond the current supported element set

## Package responsibilities

| Package | Responsibility |
| --- | --- |
| `rbxts-tailwind` | Main public package. Re-exports config helpers, the transformer bridge, and shared types. |
| `rbxts-tailwind/transformer` | CommonJS transformer entry point for `rbxtsc` and other TypeScript transformer consumers. |
| `@rbxts-tailwind/compiler` | Native compiler implementation that resolves and lowers utility classes. |
| `@rbxts-tailwind/rbxtsc-host` | Host adapter that filters eligible files, loads project config, and calls the compiler. |
| `@rbxts-tailwind/config` | Tailwind-style config shape, defaults, and config composition helpers. |
| `@rbxts-tailwind/core` | Semantic ownership boundary and supported host element tags. |
| `@rbxts-tailwind/types` | Shared utility types used across packages and public exports. |

## Utility class flow

1. A TSX file uses `className` on a supported Roblox host element.
2. The host adapter checks that the file is eligible:
   - file extension must be `.tsx`
   - `.d.ts` and `.d.tsx` files are skipped
   - `node_modules` files are skipped by default
   - the source must contain `className`
   - the source must contain JSX syntax
3. The host loads the nearest `rbxtw.config.ts` file if one exists, otherwise it falls back to the default config.
4. The compiler lowers supported utility classes into Roblox props and strips the original `className` attribute.

## Supported surface

### Supported theme axes

The current config model supports these theme families:

- `colors`
- `radius`
- `spacing`

`defineConfig()` follows Tailwind-style behavior for the current version:

- `theme.extend.*` merges into the built-in defaults
- top-level `theme.*` replaces the final scale for that family

### Supported host elements

The semantic boundary currently recognizes these Roblox elements:

- `frame`
- `scrollingframe`
- `canvasgroup`
- `textlabel`
- `textbutton`
- `textbox`
- `imagelabel`
- `imagebutton`

### Current utility behavior

The compiler currently supports utility classes that map to the implemented theme families and Roblox UI props.

Examples:

- `bg-*` utilities map to background color props
- `rounded-*` utilities map to `UICorner.CornerRadius`
- spacing utilities such as `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*` map to `UIPadding`

Supported behavior includes:

- built-in radius presets such as `rounded-none`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, and `rounded-full`
- numeric spacing fallback for valid spacing values
- explicit theme overrides through config

## Configuration

The project config file is named `rbxtw.config.ts`.
The host resolves it by walking upward from the source file location and loading the nearest config file it finds.

Use `defineConfig()` in `rbxtw.config.ts` to build a config object:

```ts
import { defineConfig } from "rbxts-tailwind";

export default defineConfig({
  theme: {
    extend: {
      colors: {
        primary: "Color3.fromRGB(99, 102, 241)",
      },
    },
  },
});
```

## Example

```tsx
// rbxtw.config.ts
import { defineConfig } from "rbxts-tailwind";

export default defineConfig();
```

```tsx
// src/client/App.tsx
export function Example() {
  return <frame className="bg-surface rounded-md px-4 py-3" />;
}
```

After transformation, supported utility classes are lowered into Roblox UI props and `className` is removed from the output.

## Limits and warnings

The current implementation is intentionally narrow.

- Unsupported utility families emit warnings and are not lowered.
- Unknown theme keys emit warnings.
- The compiler is still centered on UI element styling, not general CSS parity.
- `className` support is for TSX/React-style usage in the roblox-ts toolchain, not plain Lua.

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages and apps
pnpm build

# Run development mode
pnpm dev

# Lint code
pnpm lint

# Check types
pnpm typecheck

# Clean workspace
pnpm clean
```
