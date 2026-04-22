# rbxts-tailwind

`rbxts-tailwind` is the Tailwind CSS integration layer for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the compiler, host adapter, shared config/types, and the main consumer package that exposes the public API.

## What is implemented now

The current utility-class implementation is a focused baseline for Roblox UI styling, not full Tailwind parity.

The current implementation is centered on `className`-driven utility classes for Roblox UI elements.

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
- lowering for shared color utilities (`bg-*`, `text-*`, `image-*`, and `placeholder-*`), `rounded-*`, spacing-backed padding utilities, `gap-*` on list-layout helpers, and spacing-backed sizing utilities
- diagnostics for unsupported utility families, unsupported color keywords, and unknown theme keys
- transformer entry points for `rbxtsc` and direct host use
- automatic runtime-aware lowering for dynamic `ClassValue` expressions and supported Roblox-oriented variants

Still incomplete:

- broader Tailwind utility families beyond the current theme-backed slice
- arbitrary embedded expressions inside bracket literals
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
4. The compiler lowers supported static utility classes into Roblox props and strips the original `className` attribute.
5. If a file uses dynamic `ClassValue` input or supported runtime variants, the host generates an include-scoped runtime artifact and the compiler rewrites the file to use it automatically.

## Supported surface

### Supported theme axes

The current config model supports these theme families:

- `colors`
- `radius`
- `spacing`

`spacing` feeds padding, gap, and sizing utilities in the current compiler slice.

`defineConfig()` follows Tailwind-style behavior for the current version:

- `theme.extend.*` merges into the built-in defaults
- top-level `theme.*` replaces the final scale for that family

Color families are normalized internally to shade-based palette entries before the compiler sees them. A single literal color is still accepted for authoring, but it is expanded into a normalized palette during config resolution.

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

### Runtime-aware variants

The first runtime-aware variant slice is Roblox-oriented, not web Tailwind parity.

Supported variants:

- `sm:`, `md:`, and `lg:` as width-bucket aliases
- `portrait:` and `landscape:`
- `touch:`, `mouse:`, and `gamepad:`

These variants can be used in static literals and are also resolved at runtime when a file needs the runtime path.

### Current utility behavior

The compiler currently supports a narrow Tailwind-inspired utility slice that maps to the implemented theme families and Roblox UI props.

Examples:

- shared color utilities map to Roblox color props through normalized palette lookup in config output
- unshaded color tokens such as `bg-surface` use shade `500` as the compatibility bridge
- `rounded-*` utilities map to `UICorner.CornerRadius`
- padding utilities `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, and `pl-*` map to `UIPadding`
- `gap-*` lowers to a `UIListLayout` helper and sets its `Padding` property on supported Roblox host elements
- sizing utilities `w-*`, `h-*`, and `size-*` map to the direct `Size` prop through offset- or scale-based `UDim2` values
- `w-px` and `h-px` map to a one-pixel offset
- `w-full` and `h-full` map to scale `1` on the relevant axis
- fraction utilities such as `1/2`, `3/4`, and `5/12` map to scale values on the relevant axis
- `fit` is recognized but not lowered; the compiler warns instead of pretending to model Roblox automatic sizing
- spacing-backed numeric tokens continue to resolve through the spacing theme first, then numeric fallback where allowed
- static arbitrary values are supported only when they are literal and safe, such as `w-[320]`, `h-[48]`, and `rounded-[12]`

### Static and runtime split

The compiler keeps the fast path for pure static literals:

- fully static `className` strings are lowered at compile time as before
- files that only use static literals do not receive runtime helper injection

When the `className` value is dynamic or contains supported runtime variants:

- the file is rewritten automatically to use the generated runtime host
- no new user import, wrapper, or setup file is required
- the generated runtime artifact is placed under `include/rbxts-tailwind`

Supported behavior includes:

- built-in radius presets such as `rounded-none`, `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, and `rounded-full`
- numeric spacing fallback for valid spacing values, including spacing-backed size and gap utilities when the resolved spacing value is offset-only
- explicit theme overrides through config
- last relevant token wins per axis for width and height utilities

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
  return (
    <frame className="bg-surface rounded-md px-4 py-3 w-80 h-27 gap-4">
      <textlabel Text="rbxts consumer harness" TextScaled TextWrapped />
      <textlabel Text="layout and spacing baseline" TextScaled TextWrapped />
    </frame>
  );
}
```

After transformation, supported utility classes are lowered into Roblox UI props and `className` is removed from the output.

## Limits and warnings

The current implementation is intentionally narrow.

- Unsupported utility families emit warnings and are not lowered.
- Unknown theme keys emit warnings.
- truly unsupported `className` patterns still emit diagnostics instead of being silently dropped
- `gap-*` is currently implemented as a `UIListLayout` helper on supported Roblox host elements, not as a general-purpose CSS gap model.
- Width, height, and size utilities are Roblox-specific `UDim2` lowerings, so `fit` is not translated into automatic layout behavior.
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
