# vela-rbxts

`vela-rbxts` is a Tailwind-style `className` integration layer for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the native compiler, the `rbxtsc` host adapter, shared config and type packages, the runtime host, a TypeScript language service plugin, and two harness apps.

## Current Scope

The implementation is intentionally narrow and focuses on Roblox UI styling rather than full Tailwind parity.

- `className?: ClassValue` is added to `React.Attributes` through `vela-rbxts`.
- Supported TSX files are lowered by the `rbxtsc` transformer when they target supported Roblox host elements.
- Dynamic `ClassValue` expressions and supported Roblox-oriented variants are rewritten to a generated runtime host when needed.
- The TypeScript plugin provides completions, hover, and diagnostics in editors.
- Unsupported utility families and unknown theme keys produce diagnostics instead of being silently ignored.

## Packages And Apps

| Path | What it does |
| --- | --- |
| `packages/vela-rbxts` | Main public package. Re-exports config helpers, `createTransformer`, shared types, and the `./runtime` and `./transformer` subpath exports. |
| `packages/compiler` | Native compiler implementation that resolves, validates, and lowers utility classes. |
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

Color families preserve their authoring shape:

- singleton semantic colors stay single values, such as `surface`, `background`, `foreground`, `muted`, and `card`
- palette colors stay shade maps, such as `slate`, `gray`, `blue`, and `rose`

That means `bg-surface` resolves directly from a singleton color, while `bg-slate-700` resolves through an explicit palette entry.

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

### Current Utility Behavior

The compiler currently supports a narrow Tailwind-inspired utility slice that maps to the implemented theme families and Roblox UI props.

Examples:

- shared color utilities map to Roblox color props through the config's preserved color entry shape
- singleton colors such as `bg-surface` resolve directly without fake shade expansion
- palette colors require an explicit shade token such as `bg-slate-700`
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

### Limits And Warnings

- unsupported utility families emit warnings and are not lowered
- unknown theme keys emit warnings
- unsupported `className` patterns still emit diagnostics instead of being silently dropped
- `gap-*` is currently implemented as a `UIListLayout` helper on supported Roblox host elements, not as a general-purpose CSS gap model
- width, height, and size utilities are Roblox-specific `UDim2` lowerings, so `fit` is not translated into automatic layout behavior
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
        slate: {
          500: "Color3.fromRGB(100, 116, 139)",
          700: "Color3.fromRGB(71, 85, 105)",
        },
      },
    },
  },
});
```

## Editor Integration

The v1 editor integration is a TypeScript Language Service Plugin. It does not run a standalone LSP server.

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
    <frame className="bg-surface rounded-md px-4 py-3 w-80 h-27 gap-4">
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
