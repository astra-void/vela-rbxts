# @rbxts/vela-runtime-core

## 0.14.0

### Minor Changes

- c3916fb: Space a divided list's items `gap + thickness` apart, as CSS does, instead of `2 * gap + thickness`. The separators were list items, so the list's `Padding` opened on both sides of each one. Now the host sets that `Padding` to 0 and each separator takes the gap itself: a transparent slot `thickness + gap` long holding a `Line` frame at its start, against the item before as Tailwind's border is. `gap-*`, `space-*`, a variant gap such as `hover:gap-4` and a gap from a runtime class value all move this way on both hosts. A gap stays on the list when the separators cross it, and a `Padding` written on your own `<uilistlayout>` is left as written. To make that possible the compiler emits the `uilistlayout` of an element a divide can reach as an unconditional rule rather than a child. In `@rbxts/vela-runtime-core`, `__VelaDivide.separatorSize` now returns the slot, `__VelaDivide.separatorLineSize` returns the line, and `__VelaDivide.absorbListGap` moves the gap.
- d8e292e: Rank the children of a `divide-*` list by their `LayoutOrder` or static `order-*` so the separators follow the sorted order on both hosts, fade the separators with `opacity-*`, keep the separators of a divided list whose value children sit under a fade, and make `divide-x-0`/`divide-y-0` remove them. The compiler warns when divide has no list layout, sits beside `grid`, or has a child whose `order-*` the React parent cannot read. Add `isolate`, which builds a `frame` as a `canvasgroup` so `opacity-*` fades its subtree as one layer; it has to be static and unconditional. `@rbxts/vela-runtime-core` gains `__VelaDivide.planDivideOrder` and `__VelaDivide.separatorTransparency`.
- 94f1bdc: Read attribute variants through `group-*` and `peer-*`: `group-selected:` for a variant registered with `addVariant` or `@custom-variant`, and `group-attr-[State=open]/card:` or `peer-attr-[Tier=2]:` inline, each with the same optional `/name`. A slash inside the brackets stays part of the value. The shared runtime-core observer reads each attribute off the group or peer when it finds it and connects one `GetAttributeChangedSignal` per attribute per observed instance however many elements read it; a peer variant matches while any marked sibling carries the value. `group-md:` and other environment states still warn `unsupported-relational-variant`, and a malformed `group-attr-[…]` warns `malformed-attribute-variant`. The editor completes `group-<variant>:`, `group-attr-[` and their `peer-*` forms, hovers them, and sorts them after the interaction states of the same marker. `@rbxts/vela-runtime-core` gains `__VelaScope.watchedAttributeCount()` for the bench specs.
- d8e292e: Add `group-hover:`, `group-active:`, `group-focus:` and the matching `peer-*` variants, each with an optional `/name`, and the `group`, `group/name`, `peer` and `peer/name` markers. A marker lowers to a CollectionService tag (`VelaGroup`, `VelaPeer/name`), carried by `Tag` on a static React element and placed by the host on Vide, and a shared runtime-core observer finds the nearest marked ancestor or any marked sibling and reports its hover, press and focus. Peers ignore sibling order, which Roblox does not keep, and look past the `VelaMarginBox` frame an `m-*` element is wrapped in. `group-md:` and other unread states warn `unsupported-relational-variant`, and a conditional marker or one on a component element warns too. `group`, `peer`, `group-*` and `peer-*` are now reserved variant names.
- 83b2584: Tween the layout props an `m-*` element's margin box carries instead of snapping them, so `<frame className="m-4 w-20 transition-all hover:w-40" />` widens the box, margin included, on both hosts. A motion driver receives those tweens with `{ owner, marginBox: true }` as its fourth argument. `@rbxts/vela-runtime-core` gains `__VelaMotion.holdTweenGoal` and `__VelaMotion.changedGoal`.
- d8e292e: Add `__VelaEnv.listenerCount()`, a read-only count of the environment store's listeners, for the new Studio benches and specs: Roblox exposes no count of signal connections, so this is the one metric that shows how hosts share the store. The repository also gains criterion benches for the compiler, a vitest bench for the rbxtsc host, an end-to-end `rbxtsc` build overhead script, and a bench place in both harnesses.
- d8e292e: Keep one environment store for the whole place in `@rbxts/vela-runtime-core`, read with `__VelaEnv.currentEnvironment()` and `__VelaEnv.subscribeEnvironment()`, so every runtime host shares one set of viewport, input, `LocalPlayer` and color scheme connections instead of connecting its own, and subscribers hear only changes that move a field resolution reads. The Vide host now follows input mode, the `VelaColorScheme` attribute and a `LocalPlayer` that arrives late, live, where it used to decide them at mount.
- 632d260: Lower `backdrop-blur-*` to Roblox's `UIBlur`, mapping Tailwind's sizes onto its three strengths, and name `UIShadow` and `UIBlur` by their real class on the static React path so a statically lowered shadow no longer fails `Instance.new` on its lowercase tag.
- bf73f20: Lower `inset-shadow-*`, `shadow-inner` and `text-shadow-*` to Roblox's upgraded `UIShadow`, each as its own instance so a drop, an inset and a text shadow can sit on one element together.

### Patch Changes

- d8e292e: Watch the attribute, `group-*` and `peer-*` variants a plugin utility's body carries when a class value the runtime resolves names it. On Vide, fade a host's children when a class value or a variant rule turns on `opacity-*` after mount, and rank each instance a reactive child returns on its own in a `divide-*` list, with a separator between them.
- d8e292e: Make the runtime path resolve a class the way the static path lowers it: an element's own `opacity-*` multiplies into every channel and the stroke, shadow and blur it draws once every token has resolved, negative margins replace rather than accumulate, a variant `max-w-*` keeps its other axis unbounded, and a solid color takes back an earlier color's `/N`. On the static path, an all-zero margin no longer promotes an element to the runtime host, a variant `opacity-*` hands its alpha to the runtime to compose over every rule that fires beside it, and a variant font utility keeps the family and weight the base set. On both paths, `opacity-*` leaves a background preflight neutralized transparent. The Vide host puts a helper property back to its default when no rule names it any more.
- d8e292e: Rank what applies the way Tailwind's stylesheet does on both paths: a matching variant beats the base wherever it is written, a wider breakpoint beats a narrower one, orientation, `dark:` and the input variants beat every breakpoint, and the last class wins among equal conditions. On the static path, margin, divide, text transform and decoration, transition and animation classes under a variant are forwarded to the runtime host instead of being dropped, a variant `opacity-*` on a component element applies and a hosted component keeps its own and inherited alpha, a grid takes its gap as `CellPadding` without a second `UIListLayout`, a variant position, translate or automatic size names one axis at a time, and the base's translate and negative margin go to the runtime once a rule moves the element. The overridden-class warning reads forwarded classes under the condition they were written with.

## 0.13.1

### Patch Changes

- e14d8f1: Resolve `border-[#hex]` and `border-red-500/50` on the runtime path. The in-game parser still refused every bracketed border payload and every slash, rules the compiler had dropped, so a border color that reached it through a dynamic `className` was discarded and the `UIStroke` kept Roblox's default black.

## 0.13.0

### Minor Changes

- 655432a: Composable state and responsive styling.

  **State variants.** `addVariant("open", { attribute: "State", equals: "open" })` registers a `open:` prefix that reads a Roblox attribute off the styled instance, so the states a UI actually has (open, selected, disabled, a tier) become variants without vela guessing at any of them. `attr-[State=open]:` reads one inline where a registration would be ceremony. Both compose with every other variant, and both leave the utility behind them resolving at compile time: only the condition travels. The runtime subscribes to `GetAttributeChangedSignal` for exactly the attributes an element's rules and class value name, and an element that names none connects nothing.

  **Responsive ranges and configurable breakpoints.** `max-md:` is the exact complement of `md:`: the minimum is inclusive and the maximum is not, so the two cover every viewport once and `md:max-lg:` addresses one bucket. `theme.screens` is a theme axis like the others, and the default scale gains Tailwind's `xl` and `2xl`. A range that leaves no viewport, and a `max-` in front of a name that is no breakpoint, are reported as themselves rather than as generic unknown variants.

  **Presets.** `presets: [gameUiPreset()]` folds a shared theme, its plugins, its utilities and its variants into a project, resolving before the config that names them and after the built-in defaults, as a fold over configuration inputs, so `theme.extend` still extends what a preset replaced.

  **Helper transitions.** `hover:rounded-xl`, `hover:border-blue-500` and `hover:shadow-lg` tween now: the motion system moves the UI\* helper instances the element already has rather than only its own props, and a custom motion driver is handed those tweens with a fourth argument naming the helper instead of being bypassed for them. `transition-shadow` means something for the first time.

  **Config resolution is cached.** A `vela.config.ts` is transpiled and executed once per build rather than once per eligible source file, and a config that throws is recoverable without restarting a watch process.

  **Editor.** Everything a project configures completes, hovers and sorts: custom breakpoints with their `max-` twins, registered variants with the attribute they read, and `attr-[`. Optional inlay hints show what each class lowers to, off by default, from the compiler's own lowering read back rather than a second semantic model.

- fcaa7dd: Add directional corner radius utilities, including theme keys and arbitrary values such as `rounded-l-lg`, `rounded-l-[10%]`, `rounded-r-[7px]`, and `rounded-tr-[0.625rem]`. A per-corner utility writes the individual `UICorner` radius properties and squares off the corners it does not name, so it beats the order-dependent `CornerRadius` shorthand however the two are written. A variant still repaints the corners the base left open, as `rounded-l-lg hover:rounded-md` does.

## 0.12.8

## 0.12.7

### Patch Changes

- da7d895: Add `justify-stretch`, the class that reaches `UIListLayout.HorizontalFlex`.

  The two flex properties Roblox exposes are named for absolute axes rather than
  for the main and the cross one, and vela follows that: `justify-*` writes the
  horizontal axis, `items-*` and `content-*` the vertical. `items-stretch` reached
  `VerticalFlex` from the first, but the only values that reached `HorizontalFlex`
  were `between`, `around` and `evenly`, so a column that wanted its children to
  fill the width had no class to say it with.

  Tailwind spells the same value `justify-stretch`, and that is what it lowers to
  here, on the static path and on the runtime one alike.

## 0.12.6

## 0.12.5

### Patch Changes

- d1d3538: Keep the literal pixels under a `SurfaceGui`, which is drawn on a part rather
  than on the screen.

  Every pixel offset follows the viewport since rem landed, and a surface UI
  followed it too: a `SurfaceGui` takes its pixel space from the part it is on and
  its `PixelsPerStud`, and a `BillboardGui` sizes itself the same way, so the
  viewport says nothing about either. A panel written to fit its part grew and
  shrank with the player's screen instead, and closing the clamp to stop it took
  the scaling away from the screen UI as well.

  Both containers are pinned now, on the static path and on the runtime path
  alike. The pin is opened by the container element in the JSX: what is written
  under it lexically lowers to literal offsets in the emit, and a component
  rendered there, compiled in a file of its own, reads the pin at its root and is
  handed back the offsets it was written with. `theme.rem.pinnedUnder` names the
  containers this applies to, and emptying it puts them back on the curve.

  A `SurfaceGui` the compiler never sees, one built in Luau or in another file
  that a React root is mounted into, is outside what this can reach; such a
  project still pins with `theme.rem: { min: 16, max: 16 }`.

## 0.12.4

## 0.12.3

### Patch Changes

- 3c2d451: Read a class the way it is written rather than the way whitespace splits it.

  Two shapes were reported as broken while being perfectly ordinary. A template
  interpolation splices into the class beside it, so `` `w-[${width}]` `` reaches
  the editor as `w-[` and `]`, and both were analyzed as if they were whole
  classes: one unknown theme key and one unsupported family for a class the
  compiler defers to the runtime untouched. A token an interpolation cuts into is
  left alone now; a token that merely sits next to one, with a space between, is
  checked as before.

  The second shape was not editor-only. Whitespace inside an arbitrary value split
  it into pieces, so `w-[calc(100% - 4px)]` was read as `w-[calc(100%`, `-` and
  `4px)]`, and both the editor and the compiler reported three diagnostics about
  fragments instead of one about the value. Whitespace stops separating classes
  between a `[` and the `]` that closes it. A bracket that never closes still
  splits, so the classes written behind a typo go on applying, and sorting moves
  such a value as the one class it is rather than refusing to touch the value it
  sits in.

  The runtime splits class strings in Luau rather than in the compiler, so it
  carries the same rule: a static class and a deferred one tokenize alike.

## 0.12.2

## 0.12.1

## 0.12.0

### Patch Changes

- 3b1fbd9: Ship the runtime core as a module per namespace.

  The core was one 5,180-line file holding fifteen namespaces, four of which
  referenced each other in a cycle that no split could have survived: Luau
  resolves a `require` when the module loads, so a cycle between two scripts is
  an error rather than a slow path.

  Four helpers moved to break it — `isWholeNumber` to `__VelaLua`,
  `opacityToTransparency` and the two alignment resolvers to `__VelaValue`, and
  `colorPropEffect` to `__VelaToken`, beside the other effect constructors it is
  only ever called from. The namespaces then split into one module each, with the
  shared types in their own, and the package's entry point re-exports all of them
  under the names it always had.

  Consumers import the same names from the same specifier. What changes is the
  shipped artifact: the package is now a ModuleScript with a child per namespace
  rather than a single script.
