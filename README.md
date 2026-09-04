# vela-rbxts

`vela-rbxts` is a Tailwind-style `className` integration layer for [roblox-ts](https://roblox-ts.com/).
This monorepo contains the native compiler, the `rbxtsc` host adapter, shared config and type packages, the runtime the transformer imports, a standalone Rust LSP adapter, and three harness apps.

Release workflow documentation is available in `docs/release.md`.

## Current Scope

The implementation is intentionally narrow and focuses on Roblox UI styling rather than full Tailwind parity.

- `className?: ClassValue` is added to `React.Attributes` — and to `Vide.Attributes`, for projects that set `framework: "vide"` — through `vela-rbxts`.
- Supported TSX files are lowered by the `rbxtsc` transformer when they target supported Roblox host elements or your own components.
- The `vela` CLI lowers the same files ahead of `rbxtsc` for projects that cannot register a transform plugin.
- Dynamic `ClassValue` expressions and supported Roblox-oriented variants are rewritten against an imported runtime helper when needed.
- The standalone Rust LSP server under `packages/lsp` provides completions, hover, document colors, quickfixes, and diagnostics in editors.
- Unsupported utility families and unknown theme keys produce diagnostics instead of being silently ignored.

Full documentation lives at [docs.astra-void.xyz/vela-rbxts](https://docs.astra-void.xyz/vela-rbxts/). This README is the short version.

## Packages And Apps

| Path | What it does |
| --- | --- |
| `packages/vela-rbxts` | The only package an app installs by hand. Re-exports config helpers, `createTransformer`, shared types, the `./transformer` subpath export, and the `vela` CLI that lowers a source tree without the transformer. |
| `packages/runtime-core` | Published as `@rbxts/vela-runtime-core`. The target-neutral half of the runtime: resolution engine, theme normalization, rem math, rich text, margin and divide computation. |
| `packages/runtime` | Published as `@rbxts/vela-runtime` and installed with `vela-rbxts`. The React host every transformed module imports, as one ModuleScript the place shares. |
| `packages/runtime-vide` | Published as `@rbxts/vela-runtime-vide`. The same host for [Vide](https://centau.github.io/vide/), imported instead when the project sets `framework: "vide"`. |
| `packages/compiler` | Native compiler implementation that resolves, validates, and lowers utility classes. |
| `packages/lsp` | Standalone Rust stdio LSP server that adapts the compiler's editor APIs for completions, hover, colors, quickfixes, and diagnostics. |
| `packages/vscode-extension` | VS Code client for the LSP, published to the marketplace as `astra-void.vela-rbxts-lsp`. |
| `packages/rbxtsc-host` | Host adapter that filters eligible files, loads project config, and bridges compiler diagnostics into `rbxtsc`. |
| `packages/config` | Config schema, defaults, and `defineConfig()` helper. |
| `packages/core` | Semantic boundary and supported host element contracts. |
| `packages/ir` | Internal shared IR and supporting types. |
| `packages/types` | Shared public utility types such as `ClassValue` and `StylableProps`. |
| `apps/rbxts-harness` | Local reference app used by maintainers to validate the transformer in a real roblox-ts project. |
| `apps/vide-harness` | The same, for the Vide target: asserts the lowering contracts on the emit and renders every runtime path in Studio. |
| `apps/compiler-harness` | Browser-based preview for the compiler API and diagnostics. |
| `apps/lsp-harness` | Drives the real `vela-rbxts-lsp` binary over stdio and asserts on diagnostics, completions, hover, and document colors. |

## Using vela-rbxts in a roblox-ts project

`apps/rbxts-harness` in this repository is only a local reference app for maintainers. You do not need to recreate it to use Vela in your own project.

### 1. Install the packages

Install Vela alongside the normal roblox-ts React dependencies:

```bash
pnpm add vela-rbxts @rbxts/react @rbxts/react-roblox @rbxts/services
pnpm add -D @rbxts/compiler-types @rbxts/types roblox-ts typescript
```

A [Vide](https://centau.github.io/vide/) project swaps the UI library and sets [`framework`](#framework); nothing else changes:

```bash
pnpm add vela-rbxts @rbxts/vide @rbxts/services
pnpm add -D @rbxts/compiler-types @rbxts/types roblox-ts typescript
```

Both host runtimes arrive with `vela-rbxts`, so neither has to be named by hand. Each one declares its UI library as an *optional* peer, which is what keeps a Vide project from installing React — Rojo maps the whole `node_modules/@rbxts` directory into the place, and `@rbxts/react` is not something a Vide place should be carrying. The host you do not emit for is one inert ModuleScript.

If you are starting from an existing roblox-ts project, keep your current workspace tooling and add only the missing packages.

### 2. Configure `tsconfig.json`

Add the transformer entry to `compilerOptions.plugins`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "vela-rbxts/transformer" }]
  }
}
```

That is the entire tsconfig change. Vela requires no compiler option of its own, so everything else stays as your roblox-ts project already has it. The plugin is what lowers supported `className` usage into Roblox props during the build.

If you do not have a project yet, start from [roblox-ts's quick start](https://roblox-ts.com/docs/quick-start).

### 3. Add `vela.config.ts`

Vela reads its project configuration from `vela.config.ts`. Use `defineConfig()` from `vela-rbxts`:

```ts
// vela.config.ts
import { defineConfig } from "vela-rbxts";

export default defineConfig({
  theme: {
    extend: {
      colors: {
        surface: "Color3.fromRGB(40, 48, 66)",
        brand: {
          500: "Color3.fromRGB(59, 130, 246)",
          700: "Color3.fromRGB(29, 78, 216)",
        },
      },
    },
  },
});
```

Theme values are expression strings, not colors or numbers. They are spliced into the TSX before roblox-ts compiles it, so they are written in the roblox-ts dialect — `new UDim(0, 6)` and `Color3.fromRGB(59, 130, 246)`, not their Luau equivalents.

Put additions under `theme.extend`. A top-level `theme.colors` **replaces** the whole color scale, and when it is present `theme.extend.colors` is discarded rather than merged on top of it — unlike real Tailwind. The same replace-versus-merge rule applies to `radius`, `spacing`, and `fontFamily`.

If you do not need custom theme values, `export default defineConfig();` is enough.

#### `vela.config.json` instead

The config file may also be written as `vela.config.json`, holding the same object `defineConfig()` takes:

```json
{
  "$schema": "./node_modules/vela-rbxts/schema.json",
  "theme": {
    "extend": {
      "colors": {
        "surface": "Color3.fromRGB(40, 48, 66)"
      }
    }
  }
}
```

Prefer this form in a project with typed ESLint (`parserOptions.project`). A roblox-ts `tsconfig.json` uses `"include": ["src"]`, so a root-level `vela.config.ts` sits outside the TypeScript program and the parser reports it as not included in the project. The JSON form is never parsed by ESLint at all, and `$schema` keeps editor completion for the theme keys. Moving the file into `src` is not an alternative — roblox-ts would then try to compile it.

`vela.config.ts` wins when both exist in the same directory.

### 4. Add the declaration file

Add a declaration file such as `src/vela-env.d.ts` so `className` is available on React attributes:

```ts
// src/vela-env.d.ts
import "vela-rbxts";
```

Do not name it `src/vela-rbxts.d.ts`. A roblox-ts project sets `baseUrl` to `src`, so under that name the import resolves back to the declaration file itself instead of the package, and `className` silently never appears.

### 5. Serve the project

Use your normal Rojo project setup and serve the compiled roblox-ts output as usual.
Vela needs no generated folder and no Vela-specific Rojo mapping. Its runtime, `@rbxts/vela-runtime`, installs as a dependency of `vela-rbxts`, so it lands in the `node_modules/@rbxts` folder a roblox-ts project already maps and already lists in `typeRoots`.

The one thing your Rojo project does need is the `node_modules/@rbxts` mapping every roblox-ts template already ships — that is where the runtime lands, the same as `@rbxts/react`.

For example, a client output mapping can remain as simple as:

```json
{
  "StarterPlayer": {
    "$className": "StarterPlayer",
    "StarterPlayerScripts": {
      "$className": "StarterPlayerScripts",
      "Client": {
        "$path": "out/client"
      }
    }
  }
}
```

A transformed module imports the runtime only when runtime evaluation is needed, and every module that does shares the one copy.

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

## Without the transformer: the `vela` CLI

The transformer plugin is one way to run Vela, not the only one. `vela-rbxts` also installs a `vela` binary that lowers a source tree ahead of time, so `rbxtsc` compiles ordinary TSX with no plugin registered at all. Use it when a project cannot or will not load a `rbxtsc` transform plugin — a pinned toolchain, a build system that drives `tsc` itself, or a CI step that wants the lowered sources as a reviewable artifact.

Both paths call the same compiler and emit the same Luau. Nothing about `vela.config.ts`, the declaration file, or the classes you write changes.

```bash
vela build
vela watch
```

`vela build` reads `src` and writes the lowered tree to `.vela/src`, transforming `.tsx` files that use `className` and copying everything else through byte for byte. `vela watch` does the same, then re-transforms on change. Point `rbxtsc` at the generated tree instead of your sources:

```json
{
  "compilerOptions": {
    "rootDir": ".vela/src",
    "baseUrl": ".vela/src",
    "outDir": "out"
  },
  "include": [".vela/src"]
}
```

Remove the `{ "transform": "vela-rbxts/transformer" }` plugin entry when you do — running both paths is redundant work. `vela build` warns about either mistake.

Your build and watch commands become two steps:

```bash
vela build && rbxtsc -p tsconfig.json
```

```bash
vela watch & rbxtsc -w -p tsconfig.json
```

Diagnostics are printed the same way the transformer reports them, anchored to your real source files:

```
src/client/App.tsx:80:31 - warning vela/compiler(unknown-variant): Unknown variant "checked" in "checked:px-4"; ...
```

`vela build` exits non-zero when a file fails to compile, so it is safe to chain with `&&`.

| Option | What it does |
| --- | --- |
| `-p, --project <dir>` | Project root. Defaults to the current directory. |
| `--src <dir>` | Source tree to read. Defaults to `src`. |
| `--out <dir>` | Generated tree to write. Defaults to `.vela/src`. |
| `--clean` | Delete the generated tree before building. |
| `-q, --quiet` | Print diagnostics only. |

The CLI writes `.vela/.gitignore` so the generated tree stays out of version control, and it records what it emitted in `.vela/build-manifest.json`. Pruning is driven by that manifest, so a file the CLI never wrote is never deleted.

Two consequences are worth knowing before you switch. Editors, stack traces, and `tsc --noEmit` see the generated tree rather than `src`, because that is what `rbxtsc` compiles; the LSP still reads your real sources, so completions and hover are unaffected. And the lowered tree is a build output — edit `src`, never `.vela/src`.

## Supported Surface

### Theme Axes

The current config model supports these theme families:

- `colors`
- `radius`
- `spacing`
- `fontFamily`
- `rem`

`spacing` feeds padding, gap, and sizing utilities in the current compiler slice.

Merge behavior:

- `theme.extend.*` merges into the built-in defaults
- top-level `theme.*` replaces the final scale for that family
- when a top-level `theme.colors` is present, `theme.extend.colors` is discarded rather than layered on top — real Tailwind merges the two, this does not

Built-in colors ship 26 shade palettes plus the literals `black` and `white`. Twenty-two borrow their names from Tailwind (`slate`, `gray`, `zinc`, `neutral`, `stone`, `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `emerald`, `teal`, `cyan`, `sky`, `blue`, `indigo`, `violet`, `purple`, `fuchsia`, `pink`, `rose`) and four are our own (`mauve`, `olive`, `mist`, `taupe`). The names match Tailwind; the values are close but not identical. Every palette carries the shades `50`, `100` through `900` in hundreds, and `950`, plus a `DEFAULT`.

Every palette also carries a `DEFAULT`, mirroring its `500`, and that is what a bare family name resolves to — `bg-slate` and `bg-slate-500` are the same color. Your own palettes can declare one too:

```ts
export default defineConfig({
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "Color3.fromRGB(59, 130, 246)",
          700: "Color3.fromRGB(29, 78, 216)",
        },
      },
    },
  },
});
```

A palette with no `DEFAULT` still reports `color-missing-shade` when you reference it bare. Note that `DEFAULT` is reachable only through the bare name: `bg-brand-DEFAULT` is not a class. A singleton semantic color such as `bg-surface` resolves only after you define `surface`.

`radius` ships `none`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, and `full`, plus a `DEFAULT` of 4px — so a bare `rounded` works with no key, like Tailwind.

`spacing` ships exactly one key, `4`. Every other spacing token resolves through a numeric fallback: a non-negative multiple of `0.5` becomes an offset of `key * 4` pixels, so `p-1.5` is 6px and `p-40` is 160px. Define `theme.extend.spacing` when you want named keys instead.

`fontFamily` ships `sans` (Source Sans Pro, the Roblox default), `serif` (Merriweather), and `mono` (Roboto Mono). Values are Roblox font family assets, so any built-in family or an uploaded `rbxassetid://` font works:

```ts
export default defineConfig({
  theme: {
    extend: {
      fontFamily: {
        display: "rbxasset://fonts/families/GothamSSm.json",
      },
    },
  },
});
```

`font-*` then covers both scales the way Tailwind does: the weight names (`font-bold`, `font-medium`, …) win, and every other payload is looked up as a font family key — `font-display` above, or `unknown-theme-key` when there is no such key.

### Rem

Every pixel offset a utility lowers — `p-4`, `w-40`, `rounded-lg`, `text-sm`, `border-2`, `top-2` — is a rem unit, not a raw pixel. One rem is 16px at a 1920×1020 viewport and scales with the viewport from there, so the same class list reads at the same visual weight on a phone, a laptop, and a 4K monitor. This is on by default and needs no provider, no hook, and no wrapper component.

The curve follows [Littensy's rem provider](https://github.com/littensy/slither/blob/main/src/client/providers/rem-provider.tsx): the viewport diagonal against `baseResolution`, capped at a 19:9 aspect ratio so an ultrawide does not inflate the scale, with a gentler falloff in portrait, rounded and then clamped into `[min, max]`.

```ts
export default defineConfig({
  theme: {
    rem: {
      base: 16,
      min: 8,
      max: 64,
      baseResolution: { x: 1920, y: 1020 },
      pinnedUnder: ["surfacegui", "billboardgui"],
    },
  },
});
```

`rem` is a record rather than a keyed scale, so a partial override merges field by field: `theme.rem` and `theme.extend.rem` behave the same, and naming only `min` leaves the rest at their defaults. `pinnedUnder` is the one list among them, and a list that merged could never say "none", so naming one replaces the defaults.

Scale-valued utilities are unaffected: `w-full`, `h-1/2`, and `translate-x-1/2` are fractions of the parent, and rem never touches them.

**A container that is not the screen keeps its literal pixels.** A `SurfaceGui` is drawn on a part, at the pixel space that part and its `PixelsPerStud` give it, and a `BillboardGui` sizes itself the same way; the viewport the curve follows says nothing about either. Both are pinned by default, so every offset under one lowers to the literal it was written as, on the static path and on the runtime path alike:

```tsx
<surfacegui Adornee={panel}>
  {/* 32px is 32px here, whatever the player's screen is doing */}
  <frame className="size-8 rounded-md p-2">
    <Menu />
  </frame>
</surfacegui>
```

The pin is opened by the container element in your JSX. What is written under it lexically is pinned in the emit and costs nothing at runtime; a component rendered there was compiled in a file of its own, so the emit also opens a scope it reads at its root. A subtree handed to the container as `children`, which is what a mount function does, was built by its caller against the viewport, and React hands it back its literal offsets at render, through whatever fragment or wrapper it arrives under. A `SurfaceGui` your JSX never names (one built in Luau, or in another file, that a React root is mounted into) is not something this pass can see, so pin such a project with the clamp below instead.

`theme.rem.pinnedUnder` names the containers this applies to. Emptying it puts them back on the curve.

**To pin offsets to literal pixels**, close the clamp:

```ts
export default defineConfig({
  theme: { rem: { min: 16, max: 16 } },
});
```

With no room left in the clamp every viewport resolves the same rem, and the compiler drops the scaling from the emit entirely — offsets lower to plain `UDim2`/`UDim` literals exactly as they did before rem existed, with no binding and no runtime import.

Otherwise a statically lowered element carries its offsets as React bindings, because it has no render of its own to run again when the viewport changes; the file builds a rem scaler above it. An element that already needs the runtime host keeps plain values and is handed the names of the props to scale, since it re-renders on a rem change anyway.

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

`className` on any other lowercase element — `screengui`, `uilistlayout`, and the rest — is left alone and reported as `classname-on-unsupported-host`.

### Components

`className` also works on your own React components. Anything whose name starts with an uppercase letter, or any dotted name such as `Switch.Root`, counts as a component:

```tsx
<Card className="bg-slate-700 rounded-md px-4" />
```

The transformer resolves the utilities at compile time and passes the result to the component as ordinary props, with helper elements added as its first children:

```tsx
<Card BackgroundColor3={Color3.fromRGB(49, 65, 88)}>
  <uicorner CornerRadius={new UDim(0, 6)} />
  <uipadding PaddingLeft={new UDim(0, 16)} PaddingRight={new UDim(0, 16)} />
</Card>
```

This means the component has to forward the props and children it does not consume down to a Roblox host element, the same way `className` on the web only works because a component passes it to a DOM node. Components that drop unknown props will silently drop the styling.

Dynamic `ClassValue` expressions and runtime-aware variants work on components too. Those are wrapped in the runtime helper, which resolves the class list at runtime and then renders the component with the resulting props.

Per-element utility restrictions do not apply to components, because the eventual host element is unknown. The editor offers the full utility set inside a component's `className` and never reports `unsupported-host-utility` there.

### Runtime-Aware Variants

Supported variants:

- `sm:`, `md:`, and `lg:` as min-width buckets at 640, 768, and 1024 pixels
- `portrait:` and `landscape:`
- `touch:`, `mouse:`, and `gamepad:`
- `hover:`, tracked per element through `MouseEnter`/`MouseLeave`
- `active:`, tracked through `InputBegan`/`InputEnded` for mouse and touch presses
- `focus:`, tracked through `Focused`/`FocusLost` on a `textbox` and through `SelectionGained`/`SelectionLost` everywhere else
- `dark:`, read from the local player's `VelaColorScheme` attribute

Prefixes chain, and every condition has to match. Orientation is derived from the viewport as `width >= height ? landscape : portrait`. Input mode resolves gamepad first, then touch, then mouse. When the element also carries `transition`, a state change tweens instead of snapping.

Roblox exposes no color scheme to a running game — there is no `prefers-color-scheme` and no player setting a game can read — so `dark:` is app-owned. It matches when `Players.LocalPlayer` carries the attribute `VelaColorScheme = "dark"`; anything else, including a missing attribute, is light. Set it from your own settings menu, or from the server for a specific player, and every element with a `dark:` rule follows:

```ts
Players.LocalPlayer.SetAttribute("VelaColorScheme", dark ? "dark" : "light");
```

An attribute rather than a React context or a settings module: the attribute is readable from anywhere, including code that never rendered a Vela element, and it survives the player rejoining a place.

The three interaction variants attach their listeners only when a rule actually uses them, and compose with whatever handlers you declared in `Event` — yours still run. A press that ends outside the element never reaches its `InputEnded`, so `active:` also clears on `MouseLeave`. There is no `disabled:`: Roblox has no disabled state to observe. Model it with your own prop and `pointer-events-none`.

A variant on a utility that actually resolves forces the runtime path for that element, including inside a plain string literal — `className="sm:w-full"` moves that element onto the runtime resolver. (A variant on an unsupported utility resolves to nothing and stays static, which is not a feature to rely on.) Use variants where they earn it rather than by reflex.

### Supported Utility Classes

The compiler supports a narrow Tailwind-inspired slice that maps onto Roblox UI props and helper instances. A helper instance is a child — `UIPadding`, `UIListLayout`, `UICorner` and friends — that the transformer prepends to the element's children.

The exhaustive table of accepted values lives in the [utility reference](https://docs.astra-void.xyz/vela-rbxts/reference/utilities/). The summary:

| Category | Classes | Target |
| --- | --- | --- |
| Color | `bg-*`, `text-*`, `image-*`, `placeholder-*` | `BackgroundColor3`, `TextColor3`, `ImageColor3`, `PlaceholderColor3`. `transparent` sets the matching transparency prop and drops the color, where the target has one — `placeholder-transparent` has none and warns. |
| Gradient | `bg-gradient-to-*` (alias `bg-linear-to-*`), `from-*`, `via-*`, `to-*` | `UIGradient`. Any stop also forces `BackgroundColor3` to white, overriding an accompanying `bg-*` regardless of token order. |
| Border | `border`, `border-{0,1,2,4}`, `border-{color}`, `border-{round,bevel,miter}` | `UIStroke` thickness, color, and `LineJoinMode` |
| Ring / outline | `ring`, `ring-{0,1,2,4,8}`, `ring-{color}`, `outline`, `outline-{0,1,2,4,8}`, `outline-{color}`, `outline-none` | The same `UIStroke` as `border-*`, with `ApplyStrokeMode = Border` |
| Radius | `rounded`, `rounded-*`, `rounded-{t,r,b,l,tl,tr,bl,br}-*` | `UICorner` all-corner or directional radius properties, resolved from the theme |
| Shadow | `shadow`, `shadow-{sm,md,lg,xl,2xl}`, `shadow-none`, `shadow-{color}` | `UIShadow` |
| Stacking | `z-{0,10,20,30,40,50}` | `ZIndex` |
| Padding | `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*` | `UIPadding` |
| Margin | `m-*`, `mx-*`, `my-*`, `mt-*`, `mr-*`, `mb-*`, `ml-*`, `mx-auto`, `my-auto`, `-mt-*`, `-ml-*` | A CSS-style margin box: a transparent wrapper frame padded by the margins, with layout props routed onto it. `mx-auto`/`my-auto` center an axis through `AnchorPoint`; negative `-mt-*`/`-ml-*` pull through `Position`. |
| Gap | `gap-*` | `UIListLayout.Padding` (and `UIGridLayout.CellPadding` under `grid`) |
| List spacing | `space-x-*`, `space-y-*` | `UIListLayout.Padding` plus the matching `FillDirection` |
| Divide | `divide-x`, `divide-y`, `divide-{x,y}-{0,1,2,4,8}`, `divide-{color}` | Separator frames inserted between content children at runtime |
| Size | `w-*`, `h-*`, `size-*` | `Size`. `px` is a one-pixel offset, `full` is scale `1`, `fit` and `auto` set `AutomaticSize`, and a fixed set of fractions maps to scale. |
| Constraints | `min-w-*`, `max-w-*`, `min-h-*`, `max-h-*` | `UISizeConstraint` |
| Position | `left-*`, `top-*`, `right-*`, `bottom-*`, `inset-*` and their negated forms | `Position`. `right-*`/`bottom-*` position from the far edge. |
| Translate | `translate-x-*`, `translate-y-*` and negated forms | Fractions lower to `AnchorPoint`, pixels to `Position` offsets — the `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` centering idiom works verbatim. |
| Anchor | `origin-*` | `AnchorPoint`, nine origins |
| Flex layout | `flex`, `flex-row`, `flex-col`, `flex-wrap`, `flex-nowrap`, `justify-*`, `items-*`, `content-*` | `UIListLayout`. `justify-{start,center,end}` sets `HorizontalAlignment` while `justify-{between,around,evenly,stretch}` sets `HorizontalFlex`; `items-stretch` sets `VerticalFlex`; `content-*` packs the cross axis. The two flex axes are absolute rather than main/cross, so `justify-stretch` is the horizontal `Fill` whatever `FillDirection` is. |
| Flex items | `flex-1`, `flex-auto`, `flex-initial`, `flex-none`, `grow`, `grow-0`, `shrink`, `shrink-0`, `self-*`, `basis-*` | `UIFlexItem` (`FlexMode`, `ItemLineAlignment`); `basis-*` sizes the main axis |
| Grid | `grid`, `grid-cols-{1..12}`, `grid-rows-{1..12}`, `auto-rows-*`, `auto-cols-*` | `UIGridLayout`. `grid-cols-N` divides the filled axis into N tracks through `CellSize`, giving each cell back its share of the gap; `auto-rows-*`/`auto-cols-*` name the cross axis, which defaults to 100px. `gap-*` feeds `CellPadding` |
| Order | `order-*`, `order-{first,last,none}`, `-order-*` | `LayoutOrder`; every emitted `UIListLayout` and `UIGridLayout` carries `SortOrder = LayoutOrder` so the values take effect |
| Aspect ratio | `aspect-square`, `aspect-video`, `aspect-[W/H]`, `aspect-[N]` | `UIAspectRatioConstraint` |
| Transform | `rotate-*`, `-rotate-*`, `scale-*` | `Rotation`, `UIScale` |
| Effects | `opacity-*` | Every channel the element paints itself, integers 0 to 100: `BackgroundTransparency`, `TextTransparency` on text hosts, `ImageTransparency` on image hosts, and the `Transparency` of a stroke or shadow drawn with it. It multiplies with the color's own alpha and composes into the subtree, across component boundaries in both directions. On `canvasgroup` it lowers to `GroupTransparency`, which composites the subtree in one pass and ends the fade there. |
| Typography | `text-{xs..9xl}`, `font-*`, `italic`, `not-italic`, `text-{left,center,right}`, `align-*`, `leading-*`, `text-wrap`, `text-nowrap`, `whitespace-{normal,nowrap}`, `truncate`, `uppercase`, `lowercase`, `capitalize`, `underline`, `line-through` | `TextSize`, `FontFace` (family, weight, and style), `TextXAlignment`, `TextYAlignment`, `LineHeight`, `TextWrapped`, `TextTruncate`; case transforms rewrite `Text` (at compile time for literals, at runtime otherwise) and decorations render through `RichText`. `font-{family}` selects the family from `theme.fontFamily`, and family, weight, and style merge into one `FontFace`. |
| Motion | `transition`, `transition-{all,colors,opacity,transform,none}`, `duration-*`, `ease-{linear,in,out,in-out}`, `delay-*`, `animate-{spin,pulse,bounce,none}` | Runtime style changes tween through `TweenService` instead of snapping; the property group narrows which props tween (`colors` → `*Color3`, `opacity` → `*Transparency`, `transform` → `Position`/`Size`/`Rotation`/`AnchorPoint`), and everything outside it applies instantly. `animate-*` runs looping presets. Warns `motion-on-component` on component elements. |
| Interaction | `pointer-events-{none,auto}` | `Interactable` |
| Image fit | `object-{cover,contain,fill,tile}` | `ScaleType` on image hosts (`object-tile` is a Roblox-only extension) |
| Visibility | `hidden`, `visible`, `overflow-{hidden,clip,visible}`, `overscroll-{auto,contain,none}` | `Visible`, `ClipsDescendants`, `ElasticBehavior` on scrolling frames |
| Scrolling | `scroll-{x,y,xy}`, `scroll-none`, `scrollbar-w-*`, `scrollbar-none`, `scrollbar-{color}`, `canvas-{auto,auto-x,auto-y,none}` | `ScrollingDirection`, `ScrollingEnabled`, `ScrollBarThickness` (from the spacing scale), `ScrollBarImageColor3`, `AutomaticCanvasSize` — scrolling frames only. `scrollbar-*` and `canvas-*` are Roblox-only extensions. |

A per-corner `rounded-{t,r,b,l,tl,tr,bl,br}-*` beats the all-corner `rounded-*` on the corners it names, whichever order the two are written in, the way the two rules stack in Tailwind's own stylesheet. `rounded-l-lg rounded-md` and `rounded-md rounded-l-lg` both round the left corners to `lg` and the right ones to `md`. A corner no utility names is squared off rather than left at the Roblox default, so `rounded-r-lg` alone keeps the left side flat. Under a variant the shorthand still repaints what the base left open: `rounded-l-lg hover:rounded-md` holds the left corners at `lg` and rounds the right pair on hover.

Two value forms work across every color family (`bg-`, `text-`, `image-`, `placeholder-`, `border-`, `divide-`, `shadow-`, `ring-`, `outline-`, and the gradient stops):

- Arbitrary hex colors: `bg-[#ff0000]` and the short `bg-[#f00]` resolve to `Color3.fromRGB`. Non-hex bracket payloads keep the `unsupported-arbitrary-value` diagnostic.
- Opacity modifiers: a trailing `/N` (0–100) lowers to the family's transparency channel — `bg-blue-600/50` sets `BackgroundTransparency = 0.5`, `border-slate-500/25` sets the `UIStroke` `Transparency`, `divide-slate-500/10` fades the separator frames, and a gradient stop such as `from-blue-600/50` becomes a `UIGradient.Transparency` keypoint. `placeholder-` is the one family Roblox gives no transparency channel, so it still reports `unsupported-opacity-modifier`.

### Arbitrary Values

Length families read a `[...]` payload directly, so a one-off value does not need a theme key:

| Payload | Reads as |
| --- | --- |
| `[16px]` or `[16]` | 16 pixels of offset |
| `[1rem]` | `theme.rem.base` pixels of offset — 16 by default |
| `[50%]` | scale `0.5` |
| `[-8px]` | negative offset |

It works on `p-*`/`m-*`/`gap-*`/`space-*`, `w-*`/`h-*`/`size-*`/`min-*`/`max-*`/`basis-*`, `top-*`/`left-*`/`right-*`/`bottom-*`/`inset-*`/`translate-*`, `rounded-*` (including directional forms such as `rounded-l-[10%]`, `rounded-r-[7px]`, and `rounded-tr-[0.625rem]`), and `scrollbar-w-*`. A few families read the number in their own unit instead: `text-[13px]` (`TextSize`), `leading-[1.6]` (`LineHeight`), `rotate-[17deg]` (`Rotation`), `z-[15]` (`ZIndex`, integers only), and `border-[3px]`/`ring-[3px]`/`outline-[3px]` (`UIStroke.Thickness`). Every family that counts in pixels reads `rem` as well as `px`, so `text-[1.5rem]` and `border-[0.125rem]` say what `text-[24px]` and `border-[2px]` say.

`rem` is resolved against `theme.rem.base`, the same base the viewport scaling divides by, so a rem payload is worth exactly what one written on the spacing scale is — and it follows the viewport from there like any other offset. A payload the family cannot read — `w-[3em]`, `z-[1.5]` — still reports `unsupported-arbitrary-value` rather than being guessed at. CSS units other than `px`, `rem` and `%` have no Roblox meaning.

### Not Implemented

Tailwind families with no Roblox counterpart emit `no-roblox-equivalent` and are dropped: CSS positioning and display keywords (`static`, `fixed`, `absolute`, `relative`, `sticky`, `block`, `inline`, `table`, `contents`, `float`, `clear`, `columns-*`), text control Roblox's engine lacks (`tracking-*`, `indent-*`, `break-*`, `hyphens-*`, `list-*`, `decoration-*`, `overline`), element-level filters (`blur-*`, `backdrop-*`, `grayscale`, `invert`, `sepia`, `contrast-*`, `saturate-*`, `brightness-*`), 3D transforms (`skew-*`, `perspective-*`, `transform`), and browser interaction utilities (`cursor-*`, `select-*`, `resize-*`, `snap-*`, `caret-*`, `accent-*`, `appearance-*`). Roblox has no positioning model to map them onto — everything is already absolutely placed relative to its parent.

`place-*` has no counterpart either; use `content-*` and `self-*`. `col-span-*`/`row-span-*` are unsupported because `UIGridLayout` cannot span cells.

Anything the parser does not recognize at all — typos included — emits `unsupported-utility-family`.

Tailwind's own `scroll-*` utilities (`scroll-smooth`, `scroll-m-*`, `scroll-p-*`) now collide with the Roblox scrolling family, so they report `unsupported-scroll-value` instead of `no-roblox-equivalent`.

`gap-x-*` and `gap-y-*` do not exist, but they fail differently: they match the `gap-` prefix and then fail to resolve `x-4` as a spacing key, so they report `unknown-theme-key` rather than an unknown family. Use `space-x-*`/`space-y-*` for per-axis list spacing.

### Static And Runtime Lowering

The two paths produce very different results, and the difference is worth knowing before you compute a class string.

A `className` that collapses to static tokens is lowered at compile time, and the full utility set above applies. A `className` the compiler cannot collapse takes the runtime path, where the element is swapped for the runtime helper and the class list is resolved in-game.

**A branch whose classes are written out is lowered at compile time as well.** `active ? "text-lg" : "text-sm"`, `["w-40", tall && "h-10"]`, `{ "px-4": roomy, "px-2": !roomy }` and `props.className || "bg-blue-500"` all name their tokens in the source; only *which* of them apply is left for render time. Those tokens are resolved here — full utility set, diagnostics included — and the element is handed the resolved props alongside the tests that decide them. It still renders through the runtime host, because something has to read the tests, but nothing is parsed in-game and the prefix list below does not apply. Each test is evaluated exactly once, however many branches hang on it.

```tsx
// `text-lg` has no runtime resolution at all. Written as a branch it lowers here,
// so both sizes reach the instance.
<textlabel className={big ? "text-lg" : "text-sm"} />
```

Three things send a branch back to the runtime resolver:

- **a token no rule can carry** — `m-*`, `divide-*`, `animate-*`, `transition*`, the text transforms (`uppercase`, `underline`, …) and `opacity-*`. The runtime host reads these off its own props rather than off the resolution, so one of them in any branch takes the whole class value down the runtime path.
- **a value the source never names** — `` `size-${n}` ``, a variable, a call, a spread.
- **the left side of `||`**, which is the class value itself when it is truthy. The literal behind it is still resolved here.

Two branches that touch the same property are applied in the order they were written, so `[a && "bg-red-500", b && "bg-blue-500"]` paints blue when both hold. Two branches that touch different halves of one property are not merged: `[a && "w-40", b && "h-10"]` is two writes to `Size`, and the later one wins — write the pair inside a single branch when both axes matter.

**The runtime resolver handles only these prefixes:** `bg-*`, `text-{color}` (colors only — `text-lg` and `text-left` stay static-only), `border` and `border-*`, `rounded` and `rounded-*` (including directional forms), `p-*` through `pl-*`, `gap-*`, `w-*`, `h-*`, `size-*`, the positive margin forms `m-*` through `ml-*`, `divide-*`, the text transforms (`uppercase`, `lowercase`, `capitalize`, `underline`, `line-through` and their resets), and motion (`transition*`, `duration-*`, `delay-*`, `ease-*`, `animate-*`). Anything else in a class value that reaches the runtime is dropped with no diagnostic. Arbitrary length values resolve on both paths and agree; arbitrary hex colors, supported statically, do not resolve dynamically. It drops `fit` and `auto`, and lets a later `w-`/`h-` overwrite an earlier one instead of merging both into one `Size`.

### Diagnostics

- unsupported utility families and unknown theme keys emit warnings and are not lowered
- unsupported `className` patterns emit diagnostics instead of being silently dropped
- `className` on an element that is neither a supported host nor a component emits `classname-on-unsupported-host` and is left in the output
- diagnostics reach `rbxtsc` through `context.addDiagnostic`; a host that does not expose it drops them

`text-*` utilities are meaningful only on `textlabel`, `textbutton`, and `textbox`, `image-*` only on `imagelabel` and `imagebutton`, and `placeholder-*` only on `textbox`. That restriction is enforced by the editor, which reports `unsupported-host-utility`, and **not** by the compiler — `<frame className="text-red-500" />` compiles and emits `TextColor3` on a Frame with no build warning. It does not apply to components at all, since the eventual host element is unknown.

`className` support is for TSX in the roblox-ts toolchain, not plain Lua.

## Configuration

The project config file is named `vela.config.ts` or `vela.config.json` — those exact filenames, with no `.js`, `.mjs`, or `.cjs` variant. The host resolves it by walking upward from each source file and loading the nearest one it finds, preferring `.ts` within a directory and falling back to the built-in defaults when there is none. See [step 3](#3-add-velaconfigts) for the shape and [Theme Axes](#theme-axes) for the merge rules.

The schema is only `framework`, `preflight`, `plugins`, `theme.colors`, `theme.radius`, `theme.spacing`, `theme.fontFamily`, `theme.rem`, and their `theme.extend` counterparts. There is no `content`, `presets`, `darkMode`, `prefix`, `safelist`, or `variants` option.

### `framework`

Which UI library the project's JSX is compiled for — `"react"` (the default) or `"vide"`. `jsxFactory` is a program-wide TypeScript setting, so the two cannot be mixed in one project and the choice is per project rather than per file.

```ts
export default defineConfig({ framework: "vide" });
```

Left unset, it is inferred from the nearest `tsconfig.json`: a `compilerOptions.jsxFactory` of `Vide.jsx` selects Vide. Naming it explicitly always wins over the inference.

The whole token → utility pipeline is shared, and so is every prop and helper child the static path writes — Vide reads the same lowercase host tags and the same Roblox property names React does. What differs is the runtime package the emit imports (`@rbxts/vela-runtime-vide` rather than `@rbxts/vela-runtime`, so React never reaches a Vide place) and the reactive seams: a dynamic class value is written as a thunk (`className={() => active() ? "bg-red-500" : "bg-blue-500"}`), because a Vide component body runs once and has no re-render to refresh it with.

Three limits are inherent to that, and all are narrow. On a **component** element, which props the host can hand down is fixed when the component is called, since it is given its props once rather than written to; a host element has no such limit. And a `m-*` needs a box *above* the element, which cannot be introduced once the element is parented — so the compiler says up front whenever a class value names one anywhere it can read, and the host builds the box before the element. Only a margin arriving out of an opaque call is left, and the runtime warns there rather than rendering it unspaced. Everything else a deferred class value can name later — a prop, a `hover:` prefix, a helper, a `divide-*` — arrives.

The third is the rem pin: a Vide child is built before the container that holds it, so the pin under a `SurfaceGui` reaches what the JSX writes there (the emit defers those children into the scope) but not a node the caller built and passed in as `children`. React rewrites such a node after the fact instead. Write the subtree under the container, or pin the project with the clamp.

### `preflight`

Roblox paints every `GuiObject` as an opaque gray box with a 1px border, and a framework that only ever adds properties can never take that back. Preflight neutralizes those defaults, so every **host element that carries a `className`** starts from `BackgroundTransparency = 1` and `BorderSizePixel = 0` — `<frame className="w-40 h-10" />` is an invisible box, not a gray rectangle, and `bg-transparent` no longer has to be spelled out everywhere.

A `bg-*` utility still wins, including one that only appears in a variant (`hover:bg-blue-600`) or in a dynamic class value, and a prop written on the element itself (`<frame BackgroundTransparency={0.25} className="w-full" />`) is left alone. Props arriving through a spread are not — the transformer cannot see their names, so preflight overrides them like any other utility does.

It is deliberately not global: an element with no `className` keeps the Roblox defaults, so `<frame />` and `<frame className="w-full" />` do not render the same. Components are skipped too, since the eventual host element is unknown.

Preflight is on by default. Turn it off to keep the engine defaults:

```ts
export default defineConfig({ preflight: false });
```

### `plugins`

A plugin registers class names of your own. It is a function wrapped in `plugin()`, the way a Tailwind plugin is, and it runs while the config resolves — so what reaches the compiler is a plain table of utilities, not a function.

```ts
// vela.config.ts
import { defineConfig, plugin } from "vela-rbxts";

export default defineConfig({
  plugins: [
    plugin(({ addUtilities, theme }) => {
      addUtilities({
        // A class list: `btn` stands for the utilities on the right.
        btn: "bg-blue-600 rounded-lg px-4 py-2 hover:bg-blue-700",
        // A property map: Roblox properties, as roblox-ts expression strings.
        panel: {
          BackgroundColor3: theme("colors.slate.800"),
          BorderSizePixel: "0",
        },
      });
    }),
  ],
});
```

```tsx
<textbutton className="btn" />
<frame className="panel w-80 md:w-96" />
```

Both forms are ordinary class tokens once registered:

- **Variants compose.** `md:btn` prefixes every class the utility expands to, and a `hover:` written inside the body composes with it — `md:btn` above resolves `md:hover:bg-blue-700`.
- **They work on both lowering paths.** A plugin utility inside a dynamic `className` resolves in-game through the same table, which the runtime helper carries.
- **They can reach each other.** `addUtilities({ card: "panel rounded-xl" })` expands `panel` in turn. A cycle is dropped rather than expanded forever.
- **Sorting puts them first.** `source.sortVelaClasses` moves a plugin utility ahead of the plain utilities, so a `bg-*` written beside it is the one that wins.
- **They are not the only extension point.** `setMotionDriver` below replaces what drives `transition` and `animate-*`.
- **Names are class tokens, not selectors.** A leading `.` is accepted and stripped, since Tailwind plugins are written that way; a `:` is not, because variants belong at the use site.

What a plugin utility expands to is checked where it is used, and a class the body cannot resolve is reported on the token you wrote: `Plugin utility "btn" expands to "bg-nope-500": Unknown theme key "nope-500" …`. A property map is **not** checked — the property name and the expression are emitted as written, and neither is validated against the host element, so `panel` on a `textlabel` is your responsibility.

`theme("colors.slate.800")` reads the resolved theme, including your own `theme.extend` values, and throws when the key is missing unless a second argument gives a fallback. Later plugins overwrite an earlier utility of the same name.

#### Replacing the motion driver

`transition` and `animate-*` run on `TweenService` by default. `setMotionDriver` points the runtime host at a module of your own instead — a spring library, a shared animation service, whatever the project already uses:

```ts
plugin(({ setMotionDriver }) => {
  setMotionDriver({ module: "@rbxts/vela-spring", export: "springDriver" });
});
```

The driver is imported by **every** transformed module that needs it, at whatever depth it sits, and handed to the runtime from there — so the specifier has to resolve from any of them. Use a package name or a `baseUrl`-relative path (`"client/motion"`); a relative `./motion` is rejected. Omit `export` to import the default export.

The driver is an object with two optional methods:

```ts
export const springDriver = {
  // Only the properties that changed, plus the resolved `transition` spec
  // ({ time, style, direction, delay, property }). `style` and `direction` are
  // `EasingStyle`/`EasingDirection` member names — "Linear", "InOut" — so they
  // index the enums directly.
  transition(instance: Instance, goal: Record<string, unknown>, spec) { … },
  // `animate-spin` and friends, by name. Return a cleanup for when the
  // animation is taken away.
  animate(instance: Instance, animation: string) { … return () => {}; },
};
```

Write them as methods, as above — not as arrow properties. roblox-ts gives a method an implicit `self` and the runtime calls it as one; `transition: (instance, goal, spec) => { … }` is rejected with `Attempted to assign non-method where method was expected`.

Each method is taken over independently, so a driver that only implements `transition` keeps the built-in `animate-*` presets. **A driver that implements `transition` owns writing those properties**: while a transition is in play the element renders its held value and never assigns the new one itself, so a driver that does nothing leaves the instance where it was.

Because a JSON config cannot hold a function, `vela.config.json` states the resolved result instead:

```json
{
  "plugins": {
    "utilities": {
      "btn": "bg-blue-600 rounded-lg px-4 py-2",
      "panel": { "BorderSizePixel": "0" }
    },
    "motion": { "module": "client/motion", "export": "springDriver" }
  }
}
```

The `.ts` config is transpiled and executed rather than type-checked, so a type error in it passes silently while a syntax error fails the build. The `.json` config is parsed, with a `$schema` key ignored. Project `paths` and ambient types are not available inside it. It is also re-read and re-executed for every eligible source file, so keep it cheap.

Transformer options can be passed through the `tsconfig.json` plugin entry: `filter.skipNodeModules`, `filter.requireClassName`, `filter.requireJsxSyntax`, `diagnosticCodeBase` (default `89000`), `projectRoot`, and `config`.

Only `.tsx` files are eligible, and declaration files are always skipped. By default a file also has to sit outside `node_modules` and contain both the text `className` and JSX — those three checks are the `filter.*` options above, and each can be turned off. There is no include/exclude glob support.

## Editor Integration

Install **Vela LSP** (`astra-void.vela-rbxts-lsp`) for VS Code, or point any other editor at `npx --package @vela-rbxts/lsp vela-rbxts-lsp` over stdio. The server does not read the config file itself — the client supplies it through `initializationOptions.configs`, which is what the VS Code extension does as it watches `**/vela.config.{ts,json}`.

The standalone Rust LSP lives in `packages/lsp`. It reuses the native compiler as the semantic engine and only handles transport, document state, and protocol translation, so what the editor tells you about a class is what the compiler would do with it.

It provides completions inside a `className` (and nowhere else), hover, push diagnostics, document colors and color presentations, quickfix code actions, class sorting, and document highlight. It does not provide go-to-definition, references, rename, formatting, semantic tokens, inlay hints, or signature help.

### Sorting Classes

The `source.sortVelaClasses` action rewrites every `className` in the file into a canonical order — layout, then box, then color, then typography, then motion, with variant-prefixed utilities after the plain ones. Run it from the editor's source-action menu, or on save:

```json
{
  "editor.codeActionsOnSave": {
    "source.sortVelaClasses": "explicit"
  }
}
```

Sorting never changes what an element renders. Utilities that can write the same Roblox property — `gap-*` with `space-*`, `border-*`/`ring-*`/`outline-*`, `w-*`/`h-*`/`size-*`, `opacity-*` with a `bg-*/N` modifier — sort as one group, so the one you wrote last stays last.

Prebuilt binaries cover darwin arm64 and x64, linux x64 gnu and musl, linux arm64 gnu, and win32 x64. Linux arm64 musl and Windows on ARM have no binary on any channel and need a build from source.

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
    <frame className="bg-slate-700 border border-slate-700 rounded-md px-4 py-3 w-80 h-27 gap-4">
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

## Changelog

Release notes are kept in [CHANGELOG.md](./CHANGELOG.md).

## Contributing

Setup, test, and pull request expectations are in [CONTRIBUTING.md](./CONTRIBUTING.md).
Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).
Security issues should be reported privately as described in [SECURITY.md](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
