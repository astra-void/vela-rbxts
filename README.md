# vela-rbxts

`vela-rbxts` is a Tailwind-style `className` integration layer for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the native compiler, the `rbxtsc` host adapter, shared config and type packages, the runtime host, a TypeScript language service plugin, a standalone Rust LSP adapter, and two harness apps.

## Current Scope

The implementation is intentionally narrow and focuses on Roblox UI styling rather than full Tailwind parity.

- `className?: ClassValue` is added to `React.Attributes` through `vela-rbxts`.
- Supported TSX files are lowered by the `rbxtsc` transformer when they target supported Roblox host elements.
- Dynamic `ClassValue` expressions and supported Roblox-oriented variants are rewritten to a generated runtime host when needed.
- The TypeScript plugin provides completions, hover, and diagnostics in editors.
- A standalone Rust LSP server is being introduced under `packages/lsp` as the long-term editor tooling path.
- Unsupported utility families and unknown theme keys produce diagnostics instead of being silently ignored.

## Packages And Apps

| Path | What it does |
| --- | --- |
| `packages/vela-rbxts` | Main public package. Re-exports config helpers, `createTransformer`, shared types, and the `./runtime` and `./transformer` subpath exports. |
| `packages/compiler` | Native compiler implementation that resolves, validates, and lowers utility classes. |
| `packages/lsp` | Early standalone Rust stdio LSP server that adapts compiler editor APIs for completions, hover, and diagnostics. |
| `packages/rbxtsc-host` | Host adapter that filters eligible files, loads project config, and bridges compiler diagnostics into `rbxtsc`. |
| `packages/ts-plugin` | TypeScript Language Service Plugin for completions, hover, and diagnostics. |
| `packages/runtime` | Runtime host bundle used when class values need runtime evaluation. |
| `packages/config` | Config schema, defaults, and `defineConfig()` helper. |
| `packages/core` | Semantic boundary and supported host element contracts. |
| `packages/ir` | Internal shared IR and supporting types. |
| `packages/types` | Shared public utility types such as `ClassValue` and `StylableProps`. |
| `apps/rbxts-harness` | Roblox-ts consumer harness that exercises the transformer in a real project. |
| `apps/compiler-harness` | Browser-based preview for the compiler API and diagnostics. |

## Supported Surface

### Theme Axes

The current config model supports these theme families:

- `colors`
- `radius`
- `spacing`

`spacing` feeds padding, gap, and sizing utilities in the current compiler slice.

`defineConfig()` follows Tailwind-style merge behavior for the current version:

- `theme.extend.*` merges into the built-in defaults
- top-level `theme.*` replaces the final scale for that family

Built-in color defaults follow Tailwind-style palettes.

- palette families stay shade maps, such as `slate`, `gray`, `blue`, and `rose`
- custom singleton semantic colors can still be defined in `theme.colors` or `theme.extend.colors`

That means `bg-slate-700` resolves from the built-in palette, while `bg-surface` only resolves after you define `surface` in your config.

### Supported Host Elements

The semantic boundary currently recognizes these Roblox elements:

- `frame`
- `scrollingframe`
- `canvasgroup`
- `textlabel`
- `textbutton`
- `textbox`
- `imagelabel`
- `imagebutton`

### Runtime-Aware Variants

Supported variants:

- `sm:`, `md:`, and `lg:` as width-bucket aliases
- `portrait:` and `landscape:`
- `touch:`, `mouse:`, and `gamepad:`

These variants can be used in static literals and are also resolved at runtime when a file needs the runtime path.

### Supported Utility Classes

The compiler currently supports a narrow Tailwind-inspired slice that maps to Roblox UI props.

| Category | Implemented classes | Notes |
| --- | --- | --- |
| Color | `bg-*`, `text-*`, `image-*`, `placeholder-*` | Resolve against config theme and the built-in palette. Palette colors need a shade such as `bg-slate-700`. Semantic singleton colors such as `bg-surface` work when defined in project config. `transparent` is supported where the target prop can express transparency. |
| Radius | `rounded-*` | Maps to `UICorner.CornerRadius`. |
| Stacking | `z-0`, `z-10`, `z-20`, `z-30`, `z-40`, `z-50` | Maps directly to Roblox `ZIndex`. |
| Spacing | `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*`, `gap-*` | Padding utilities map to `UIPadding`. `gap-*` lowers to a `UIListLayout` helper on supported Roblox host elements. |
| Size | `w-*`, `h-*`, `size-*` | Maps to `Size` through Roblox-specific `UDim2` values. `w-px` and `h-px` become a one-pixel offset. `w-full` and `h-full` map to scale `1`. Supported fractions such as `1/2`, `3/4`, and `5/12` map to scale values. |
| Spacing tokens | numeric spacing keys | Numeric spacing tokens resolve through the spacing theme first, then numeric fallback where allowed. |
| Special case | `fit` | Recognized but not lowered; the compiler warns instead of pretending to model Roblox automatic sizing. |

### Not Yet Implemented

These Tailwind-style families are not implemented yet and currently emit diagnostics instead of being lowered.

| Category | Not implemented yet | Notes |
| --- | --- | --- |
| Layout and positioning | `m-*`, `mx-*`, `my-*`, `mt-*`, `mr-*`, `mb-*`, `ml-*`, `absolute`, `relative`, `top-*`, `right-*`, `bottom-*`, `left-*` | Emits diagnostics instead of lowering. |
| Flex and grid | `flex-*`, `grid-*`, `items-*`, `justify-*`, `content-*`, `self-*`, `place-*` | Emits diagnostics instead of lowering. |
| Borders and effects | `border-*`, `ring-*`, `shadow-*`, `opacity-*`, `blur-*` | Emits diagnostics instead of lowering. |
| Typography and text formatting | `font-*`, `leading-*`, `tracking-*`, `uppercase`, `lowercase`, `capitalize`, and other non-color `text-*` utilities | Emits diagnostics instead of lowering. |
| Motion and transforms | `transition-*`, `duration-*`, `ease-*`, `animate-*`, `transform`, `scale-*`, `rotate-*`, `translate-*`, `skew-*` | Emits diagnostics instead of lowering. |

Notes:

- unsupported utility families emit warnings and are not lowered
- unknown theme keys emit warnings
- unsupported `className` patterns still emit diagnostics instead of being silently dropped
- `text-*` color utilities are only valid on `textlabel`, `textbutton`, and `textbox`
- `image-*` color utilities are only valid on `imagelabel` and `imagebutton`
- `placeholder-*` color utilities are only valid on `textbox`
- `className` support is for TSX/React-style usage in the roblox-ts toolchain, not plain Lua

## Configuration

The project config file is named `rbxtw.config.ts`.
The host resolves it by walking upward from the source file location and loading the nearest config file it finds.

Use `defineConfig()` in `rbxtw.config.ts` to build a config object:

```ts
import { defineConfig } from "vela-rbxts";

export default defineConfig({
  theme: {
    colors: {
      surface: "Color3.fromRGB(40, 48, 66)",
    },
    extend: {
      colors: {
        brand: {
          500: "Color3.fromRGB(59, 130, 246)",
          700: "Color3.fromRGB(29, 78, 216)",
        },
      },
    },
  },
});
```

## Editor Integration

The v1 editor integration is a TypeScript Language Service Plugin. It does not run a standalone LSP server.

The new LSP path lives in `packages/lsp` and is intentionally minimal for now. It reuses the native compiler as the semantic engine and only handles transport, document state, and editor protocol translation.

The plugin keeps TypeScript-side responsibilities in TypeScript:

- tsserver lifecycle integration
- detecting supported TSX `className="..."` contexts
- nearest `rbxtw.config.ts` resolution through the existing host config loader
- translating compiler query results into TypeScript completions, quick info, and diagnostics

The native compiler remains the semantic engine for token analysis, utility validation, completions, hover text, and diagnostics.

To enable the local plugin in a project or harness `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "name": "@vela-rbxts/ts-plugin"
      }
    ]
  }
}
```

When developing from this monorepo, build the compiler native binding and plugin package first:

```bash
pnpm --filter @vela-rbxts/compiler build
pnpm --filter @vela-rbxts/ts-plugin build
```

To run the early Rust LSP server directly:

```bash
cd packages/lsp
cargo run
```

## Example

```tsx
// rbxtw.config.ts
import { defineConfig } from "vela-rbxts";

export default defineConfig();
```

```tsx
// src/client/App.tsx
export function Example() {
  return (
    <frame className="bg-slate-700 rounded-md px-4 py-3 w-80 h-27 gap-4">
      <textlabel Text="rbxts consumer harness" TextScaled TextWrapped />
      <textlabel Text="layout and spacing baseline" TextScaled TextWrapped />
    </frame>
  );
}
```

After transformation, supported utility classes are lowered into Roblox UI props and `className` is removed from the output.

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
