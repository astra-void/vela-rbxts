# vela-rbxts

## 0.13.0

### Minor Changes

- 655432a: Composable state and responsive styling.

  **State variants.** `addVariant("open", { attribute: "State", equals: "open" })` registers a `open:` prefix that reads a Roblox attribute off the styled instance, so the states a UI actually has (open, selected, disabled, a tier) become variants without vela guessing at any of them. `attr-[State=open]:` reads one inline where a registration would be ceremony. Both compose with every other variant, and both leave the utility behind them resolving at compile time: only the condition travels. The runtime subscribes to `GetAttributeChangedSignal` for exactly the attributes an element's rules and class value name, and an element that names none connects nothing.

  **Responsive ranges and configurable breakpoints.** `max-md:` is the exact complement of `md:`: the minimum is inclusive and the maximum is not, so the two cover every viewport once and `md:max-lg:` addresses one bucket. `theme.screens` is a theme axis like the others, and the default scale gains Tailwind's `xl` and `2xl`. A range that leaves no viewport, and a `max-` in front of a name that is no breakpoint, are reported as themselves rather than as generic unknown variants.

  **Presets.** `presets: [gameUiPreset()]` folds a shared theme, its plugins, its utilities and its variants into a project, resolving before the config that names them and after the built-in defaults, as a fold over configuration inputs, so `theme.extend` still extends what a preset replaced.

  **Helper transitions.** `hover:rounded-xl`, `hover:border-blue-500` and `hover:shadow-lg` tween now: the motion system moves the UI\* helper instances the element already has rather than only its own props, and a custom motion driver is handed those tweens with a fourth argument naming the helper instead of being bypassed for them. `transition-shadow` means something for the first time.

  **Config resolution is cached.** A `vela.config.ts` is transpiled and executed once per build rather than once per eligible source file, and a config that throws is recoverable without restarting a watch process.

  **Editor.** Everything a project configures completes, hovers and sorts: custom breakpoints with their `max-` twins, registered variants with the attribute they read, and `attr-[`. Optional inlay hints show what each class lowers to, off by default, from the compiler's own lowering read back rather than a second semantic model.

### Patch Changes

- Updated dependencies [655432a]
  - @vela-rbxts/config@0.13.0
  - @vela-rbxts/rbxtsc-host@0.13.0
  - @rbxts/vela-runtime@0.13.0
  - @rbxts/vela-runtime-vide@0.13.0
  - @vela-rbxts/types@0.13.0

## 0.12.8

### Patch Changes

- @vela-rbxts/config@0.12.8
- @vela-rbxts/rbxtsc-host@0.12.8
- @vela-rbxts/types@0.12.8
- @rbxts/vela-runtime@0.12.8
- @rbxts/vela-runtime-vide@0.12.8

## 0.12.7

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.12.7
- @rbxts/vela-runtime@0.12.7
- @rbxts/vela-runtime-vide@0.12.7
- @vela-rbxts/config@0.12.7
- @vela-rbxts/types@0.12.7

## 0.12.6

### Patch Changes

- Updated dependencies [e9805ff]
  - @rbxts/vela-runtime@0.12.6
  - @vela-rbxts/rbxtsc-host@0.12.6
  - @vela-rbxts/config@0.12.6
  - @vela-rbxts/types@0.12.6
  - @rbxts/vela-runtime-vide@0.12.6

## 0.12.5

### Patch Changes

- Updated dependencies [d1d3538]
  - @vela-rbxts/config@0.12.5
  - @rbxts/vela-runtime@0.12.5
  - @rbxts/vela-runtime-vide@0.12.5
  - @vela-rbxts/rbxtsc-host@0.12.5
  - @vela-rbxts/types@0.12.5

## 0.12.4

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.12.4
- @vela-rbxts/config@0.12.4
- @vela-rbxts/types@0.12.4
- @rbxts/vela-runtime@0.12.4
- @rbxts/vela-runtime-vide@0.12.4

## 0.12.3

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.12.3
- @rbxts/vela-runtime@0.12.3
- @rbxts/vela-runtime-vide@0.12.3
- @vela-rbxts/config@0.12.3
- @vela-rbxts/types@0.12.3

## 0.12.2

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.12.2
- @vela-rbxts/config@0.12.2
- @vela-rbxts/types@0.12.2
- @rbxts/vela-runtime@0.12.2
- @rbxts/vela-runtime-vide@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [7e27a1e]
  - @vela-rbxts/rbxtsc-host@0.12.1
  - @vela-rbxts/config@0.12.1
  - @vela-rbxts/types@0.12.1
  - @rbxts/vela-runtime@0.12.1
  - @rbxts/vela-runtime-vide@0.12.1

## 0.12.0

### Minor Changes

- 7a9fde7: Ship the runtime as `@rbxts/vela-runtime` instead of copying it into every file.

  The runtime resolver used to be inlined whole into every module that needed it. A
  place with ten components that use a variant carried ten copies of the same 5,500
  lines, and each copy ran its own camera subscription, its own rem binding and its
  own React context. In the reference app one `App.luau` was 190,260 bytes, of which
  about 167,000 was the runtime.

  It is now one ModuleScript the whole place shares, and a transformed module gets
  an import and the config it hands the host:

  ```ts
  import { createVelaRuntimeHost } from "@rbxts/vela-runtime";
  const VelaRuntimeHost = createVelaRuntimeHost({
    /* … */
  });
  ```

  That same `App.luau` is 43,187 bytes — 22.7% of what it was — and the runtime is
  166,682 bytes once, however many files reach it.

  **Setup is unchanged.** The package installs as a dependency of `vela-rbxts`, and
  it sits under the `@rbxts` scope on purpose: roblox-ts only resolves a package
  whose scope directory is one of the project's `typeRoots`, and `node_modules/@rbxts`
  is the one every roblox-ts project already lists and every Rojo template already
  maps. Nothing to add to `tsconfig.json`, nothing to add to the Rojo project.

  Three things the inlined shape had forced:

  - `__VelaOpacity` kept its React context and provider on `_G`, because a
    `createContext` per copy made one context per module and the alpha could never
    cross a component boundary. The context is now simply created once.
  - `__VelaRem` opened a `CurrentCamera` subscription per module. One now.
  - The emit numbers rem slots from zero in each file, so the slot table moved out
    of the namespace and onto a per-module scaler (`createVelaRemScaler`) — a shared
    table would have handed one module the binding its neighbour built.

  The motion driver still resolves from the transformed module rather than from the
  package, so a `plugins.motion.module` specifier keeps the rule it always had: a
  package name or a `baseUrl`-relative path, never a relative one. The specifier no
  longer travels to the runtime in the config, which never read it.

- 39ba0ee: Keep React out of a Vide place without making anyone name a runtime.

  `vela-rbxts` depended on `@rbxts/react` outright, so a Vide project installed
  it — and Rojo maps the whole `node_modules/@rbxts` directory into the place,
  which is what the three-package runtime split exists to avoid. The Vide host
  was not a dependency at all, so the specifier its emit imports did not resolve.

  Both hosts ship with `vela-rbxts` now, so neither has to be installed by hand,
  and each declares its own UI library as an **optional** peer. A project brings
  the library it writes JSX with — it always did — and gets nothing of the other
  one. The host it does not emit for is one inert ModuleScript.

  The install line is unchanged for React, and a Vide project only swaps
  `@rbxts/react` for `@rbxts/vide` and sets `framework: "vide"`.

- 7a9fde7: Resolve a class value's known branches at compile time.

  `active ? "text-lg" : "text-sm"` names every token it can ever apply — only which
  of them apply is undecided — but the whole class value used to travel to the
  runtime resolver, which parses a subset of the utility set. `text-lg` is not in
  that subset, so neither size ever reached the instance.

  Those branches are now resolved by the compiler, through the same call the static
  path makes, and the element is handed the resolved props alongside the tests that
  decide them. It still renders through the runtime host, because something has to
  read the tests, but nothing is parsed in-game:

  - the full utility set applies inside a branch, not the runtime resolver's prefixes
  - a bad utility written in a branch now reports a diagnostic instead of vanishing
  - a variant inside a branch answers to both, as `hover:` **and** the branch's test
  - each test is evaluated exactly once, however many branches hang on it

  It reads ternaries, `&&`, the literal behind `||`, arrays, and object maps, and it
  resolves a branch among the tokens written around it — so `["w-40", tall && "h-10"]`
  is one `Size` rather than a branch that overwrites the width.

  A branch naming `m-*`, `divide-*`, `animate-*`, `transition*`, a text transform or
  `opacity-*` still takes the whole class value down the runtime path unchanged:
  the runtime host reads those off its own props rather than off the resolution.

  Two fixes that predate branches came with it, both on the rule path:

  - A base helper a variant rule overwrote (`p-4 hover:p-8`) was emitted as a child
    _and_ resolved by the host, leaving two `UIPadding` under one instance. The base
    helper now joins the resolution, where the two merge by tag.
  - A rule carries its prop values as source text and the runtime parses them back,
    but the parser did not know `Vector2`, `ColorSequence` or `Font` — so
    `md:min-w-16`, `md:bg-gradient-to-r` and `md:font-bold` assigned a string to a
    Roblox property, which React rejects by tearing down the whole tree. It now
    parses every constructor the emit can write.

- 7a9fde7: Add `theme.rem`, so every pixel offset a utility lowers follows the viewport.

  `p-4`, `w-40`, `rounded-lg`, `text-sm`, `border-2` and `top-2` are now rem units
  rather than raw pixels: one rem is 16px at a 1920×1020 viewport and scales from
  there, so the same class list reads at the same visual weight on a phone, a
  laptop and a 4K monitor. The curve follows Littensy's rem provider — the viewport
  diagonal against `baseResolution`, capped at a 19:9 aspect ratio, with a gentler
  falloff in portrait — rounded and clamped into `[min, max]`. No provider, hook or
  wrapper component is involved.

  `base`, `min`, `max` and `baseResolution` are configurable, and `rem` merges
  field by field rather than replacing the family, so naming only `min` leaves the
  rest at their defaults.

  This changes rendering on any viewport other than the base resolution. To keep
  the previous literal-pixel behavior, close the clamp:

  ```ts
  export default defineConfig({
    theme: { rem: { min: 16, max: 16 } },
  });
  ```

  With the clamp closed on `base` the compiler drops the scaling from the emit
  entirely — offsets lower to plain `UDim2`/`UDim` literals with no binding and no
  runtime import. Pinning somewhere other than `base` is still a scale, by a
  constant ratio, so it keeps the binding. An inverted clamp collapses onto `min`.

  Scale-valued utilities are untouched: `w-full`, `h-1/2` and `translate-x-1/2`
  stay fractions of the parent.

  `TextSize` stops at 100, which is where Roblox itself stops honoring it. On a
  large viewport `text-6xl` and up land on that ceiling rather than tweening
  toward a size the engine never paints.

- 7a9fde7: Lower the `/N` color opacity modifier on every family that has a transparency
  channel.

  `bg-blue-600/50` already worked; `border-slate-500/25`, `divide-white/10` and the
  gradient stops did not. `border-*` reported the modifier as a missing theme key,
  and the rest reported `unsupported-opacity-modifier` — so a class list carried
  over from Tailwind lost exactly the alpha it was written for.

  Each family now lowers the modifier to the channel Roblox actually gives it:

  - `border-{color}/N` → `UIStroke.Transparency`
  - `divide-{color}/N` → the separator frames' `BackgroundTransparency`
  - `from-*/N`, `via-*/N`, `to-*/N` → a `UIGradient.Transparency` sequence whose
    keypoints line up with the color stops, so one faded stop does not fade the
    others

  The runtime resolver reads the same modifiers off a dynamic class value, and the
  prop parser learned `NumberSequence`, which a variant bundle needs to restate a
  faded gradient.

  `placeholder-*` is the one family left: Roblox has no placeholder transparency,
  and fading the text itself would take the typed value with it. It still reports
  `unsupported-opacity-modifier`, now with a message that says why.

  Editor surfaces follow: a `/N` token gets its swatch and hover back instead of
  being read as a theme key that does not exist.

- 7a9fde7: Send the theme as what a project changed, not as the whole palette.

  A module that hands the runtime host a class value to parse — `className={cn(…)}`,
  a spread that might carry one, a plugin utility resolved at render time — used to
  carry the entire theme so the parser could read it. Most of that is the default
  Tailwind palette, which is the same table in every such module in every project.
  In the reference app it was 15,950 bytes of a 43,187-byte `App.luau`: 37% of the
  file, and the runtime re-parsed all of it into `Color3` values once per module.

  `@rbxts/vela-runtime` now carries the defaults itself, copied at build time from
  the same `packages/config/src/defaults.json` the compiler diffs against, and the
  emit sends only the entries that differ:

  ```lua
  theme = { colors = {}, radius = {}, spacing = {}, fontFamily = {}, rem = { … } }
  ```

  That `App.luau` is now 27,912 bytes, and the emitted config within it went from
  15,950 to 675.

  What travels scales with what you changed, not with the size of the palette:

  - an untouched scale sends nothing at all
  - `theme.extend.colors.brand` sends `brand`
  - overriding one shade sends that whole color family, so the shades around it
    survive the family-level merge
  - a top-level `theme.colors`, which **replaces** the scale rather than extending
    it, sends the table whole and names it in `theme.replaced` — otherwise the
    runtime would merge the defaults back under it and resurrect colors the
    project deliberately dropped

  A module that parses no class value still sends empty tables, now marked
  replaced so the runtime uses them as given instead of falling back on its
  defaults — the same behaviour as before, and it keeps that module from
  normalizing a palette it never reads.

### Patch Changes

- Updated dependencies [6b06e22]
- Updated dependencies [fcea92a]
- Updated dependencies [7a9fde7]
- Updated dependencies [39ba0ee]
- Updated dependencies [fcea92a]
- Updated dependencies [7a9fde7]
- Updated dependencies [fcea92a]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
  - @rbxts/vela-runtime-vide@0.12.0
  - @vela-rbxts/rbxtsc-host@0.12.0
  - @rbxts/vela-runtime@0.12.0
  - @vela-rbxts/config@0.12.0
  - @vela-rbxts/types@0.12.0

## 0.11.1

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.11.1
- @vela-rbxts/config@0.11.1
- @vela-rbxts/types@0.11.1

## 0.11.0

### Minor Changes

- 7802618: Add a `vela` CLI that lowers a source tree ahead of `rbxtsc`, so a project can use Vela without registering the transform plugin.

  `vela build` mirrors `src` into `.vela/src`, transforming the `.tsx` files that use `className` and copying everything else through unchanged; `vela watch` re-transforms on change. Point `compilerOptions.rootDir` and `include` at the generated tree and drop the `vela-rbxts/transformer` plugin entry — the CLI warns when either is still wired for the transformer. Both paths run the same compiler and emit identical Luau.

  Diagnostics keep the transformer's anchoring against your real sources, and `vela build` exits non-zero when a file fails to compile. Pruning is driven by a manifest of what the CLI emitted, so a file it never wrote is never deleted.

  Project configs are now cached by content in the `rbxtsc` host, which stops a whole-tree run from transpiling and evaluating `vela.config.ts` once per source file.

### Patch Changes

- Updated dependencies [7802618]
  - @vela-rbxts/rbxtsc-host@0.11.0
  - @vela-rbxts/config@0.11.0
  - @vela-rbxts/types@0.11.0

## 0.10.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.10.0
- @vela-rbxts/config@0.10.0
- @vela-rbxts/types@0.10.0

## 0.9.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.9.0
- @vela-rbxts/config@0.9.0
- @vela-rbxts/types@0.9.0

## 0.8.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.8.0
- @vela-rbxts/config@0.8.0
- @vela-rbxts/types@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [e464a5a]
  - @vela-rbxts/config@0.7.0
  - @vela-rbxts/rbxtsc-host@0.7.0
  - @vela-rbxts/types@0.7.0

## 0.6.0

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.6.0
- @vela-rbxts/config@0.6.0
- @vela-rbxts/types@0.6.0

## 0.5.2

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.5.2
- @vela-rbxts/config@0.5.2
- @vela-rbxts/types@0.5.2

## 0.5.1

### Patch Changes

- @vela-rbxts/config@0.5.1
- @vela-rbxts/rbxtsc-host@0.5.1
- @vela-rbxts/types@0.5.1

## 0.5.0

### Minor Changes

- c84f22b: Neutralize the Roblox host defaults, and add a `preflight` config flag to turn
  that off. Roblox paints every `GuiObject` as an opaque gray box with a 1px
  border, and a framework that only ever adds properties can never take that
  back — so `bg-transparent` had to be repeated on almost every element. Any host
  element carrying a `className` now starts from `BackgroundTransparency = 1` and
  `BorderSizePixel = 0` unless a `bg-*` utility or an explicitly declared prop
  says otherwise, and a background painted by a variant or a dynamic class value
  reopens it. Elements without a `className`, and components, are untouched.

  **Breaking for existing UI:** anywhere the default gray background was
  load-bearing, the element now renders invisible. Add the `bg-*` it was relying
  on, or set `preflight: false` in `vela.config.ts` to keep the old behavior.

### Patch Changes

- Updated dependencies [c84f22b]
  - @vela-rbxts/config@0.5.0
  - @vela-rbxts/rbxtsc-host@0.5.0
  - @vela-rbxts/types@0.5.0

## 0.4.2

### Patch Changes

- @vela-rbxts/rbxtsc-host@0.4.2
- @vela-rbxts/config@0.4.2
- @vela-rbxts/types@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [04c4e35]
  - @vela-rbxts/rbxtsc-host@0.4.1
  - @vela-rbxts/config@0.4.1
  - @vela-rbxts/types@0.4.1
