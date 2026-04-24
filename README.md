# vela-rbxts

`vela-rbxts` is a Tailwind-style `className` integration layer for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the native compiler, the `rbxtsc` host adapter, shared config and type packages, the runtime host, a standalone Rust LSP adapter, and two harness apps.

Release workflow documentation is available in `docs/release.md`.

## Current Scope

The implementation is intentionally narrow and focuses on Roblox UI styling rather than full Tailwind parity.

- `className?: ClassValue` is added to `React.Attributes` through `vela-rbxts`.
- Supported TSX files are lowered by the `rbxtsc` transformer when they target supported Roblox host elements.
- Dynamic `ClassValue` expressions and supported Roblox-oriented variants are rewritten to a generated runtime host when needed.
- The standalone Rust LSP server under `packages/lsp` provides completions, hover, and diagnostics in editors.
- Unsupported utility families and unknown theme keys produce diagnostics instead of being silently ignored.

## Packages And Apps

| Path | What it does |
| --- | --- |
| `packages/vela-rbxts` | Main public package. Re-exports config helpers, `createTransformer`, shared types, and the `./runtime` and `./transformer` subpath exports. |
| `packages/compiler` | Native compiler implementation that resolves, validates, and lowers utility classes. |
| `packages/lsp` | Early standalone Rust stdio LSP server that adapts compiler editor APIs for completions, hover, and diagnostics. |
| `packages/rbxtsc-host` | Host adapter that filters eligible files, loads project config, and bridges compiler diagnostics into `rbxtsc`. |
| `packages/runtime` | Runtime host bundle used when class values need runtime evaluation. |
| `packages/config` | Config schema, defaults, and `defineConfig()` helper. |
| `packages/core` | Semantic boundary and supported host element contracts. |
| `packages/ir` | Internal shared IR and supporting types. |
| `packages/types` | Shared public utility types such as `ClassValue` and `StylableProps`. |
| `apps/rbxts-harness` | Local reference app used by maintainers to validate the transformer in a real roblox-ts project. |
| `apps/compiler-harness` | Browser-based preview for the compiler API and diagnostics. |

## Using vela-rbxts in a roblox-ts project

`apps/rbxts-harness` in this repository is only a local reference app for maintainers. You do not need to recreate it to use Vela in your own project.

### 1. Install the packages

Install Vela and the runtime package alongside the normal roblox-ts React dependencies:

```bash
pnpm add vela-rbxts @vela-rbxts/runtime @rbxts/react @rbxts/react-roblox @rbxts/services
pnpm add -D @rbxts/compiler-types @rbxts/types roblox-ts typescript
```

If you are starting from an existing roblox-ts project, keep your current workspace tooling and add only the missing packages.

### 2. Configure `tsconfig.json`

Add the transformer entry to `compilerOptions.plugins`:

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "React.createElement",
    "jsxFragmentFactory": "React.Fragment",
    "module": "commonjs",
    "moduleResolution": "Node",
    "noLib": true,
    "strict": true,
    "target": "ESNext",
    "typeRoots": ["node_modules/@rbxts", "node_modules/@vela-rbxts"],
    "types": ["types", "compiler-types"],
    "plugins": [
      {
        "transform": "vela-rbxts/transformer"
      }
    ],
    "rootDir": "src",
    "outDir": "out",
    "baseUrl": "src",
    "tsBuildInfoFile": "out/tsconfig.tsbuildinfo"
  },
  "include": ["src"]
}
```

The transformer is what lowers supported `className` usage into Roblox props during the roblox-ts build.

### 3. Add `vela.config.ts`

Vela reads its project configuration from `vela.config.ts`. Use `defineConfig()` from `vela-rbxts`:

```ts
// vela.config.ts
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

If you do not need custom theme values, `export default defineConfig();` is enough.

### 4. Add the declaration file

Add a declaration file such as `src/vela-rbxts.d.ts` so `className` is available on React attributes:

```ts
// src/vela-rbxts.d.ts
import "vela-rbxts";
```

### 5. Expose the runtime folders through Rojo

Map the Roblox TS dependency folders and the Vela package folders into `ReplicatedStorage`:

```json
{
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "$className": "ReplicatedStorage",
      "node_modules": {
        "$className": "Folder",
        "@rbxts": {
          "$path": "node_modules/@rbxts"
        },
        "@rbxts-js": {
          "$path": "node_modules/@rbxts-js"
        },
        "@vela-rbxts": {
          "$path": "node_modules/@vela-rbxts"
        }
      }
    }
  }
}
```

`@vela-rbxts/runtime` must be visible to Roblox Studio because transformed files can emit a runtime host import for `@vela-rbxts/runtime` when `className` needs runtime evaluation. If Studio cannot see that package through Rojo, the generated code cannot resolve the runtime host at run time.

### 6. Use `className` in TSX

A minimal component looks like this:

```tsx
import React from "@rbxts/react";

export function App() {
  return <frame className="rounded-md bg-slate-700 px-4 py-3" />;
}
```

The transformer handles supported host elements such as `frame`, `textlabel`, `textbutton`, and the other Roblox UI elements listed below.

### 7. Build and run

Use the normal roblox-ts build and watcher commands, then serve the Rojo project into Studio:

```bash
pnpm install
pnpm exec rbxtsc -p tsconfig.json
pnpm exec rbxtsc -w -p tsconfig.json
rojo serve default.project.json
```

In a typical project, `rbxtsc -p tsconfig.json` is your build step, `rbxtsc -w -p tsconfig.json` is your local watch mode, and `rojo serve` keeps Studio synced with the compiled output and mapped module folders.

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

The project config file is named `vela.config.ts`.
The host resolves it by walking upward from the source file location and loading the nearest config file it finds.

Use `defineConfig()` in `vela.config.ts` to build a config object:

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

The standalone Rust LSP path lives in `packages/lsp` and is intentionally minimal for now. It reuses the native compiler as the semantic engine and only handles transport, document state, and editor protocol translation.

The native compiler remains the semantic engine for token analysis, utility validation, completions, hover text, and diagnostics.

When developing from this monorepo, build the compiler native binding first:

```bash
pnpm --filter @vela-rbxts/compiler build
```

To run the early Rust LSP server directly:

```bash
cd packages/lsp
cargo run
```

## Example

```tsx
// vela.config.ts
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
