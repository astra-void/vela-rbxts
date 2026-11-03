# @rbxts/vela-runtime-vide

## 0.14.0

### Minor Changes

- 93b86f2: Let a prop written on an element outrank every class that names it, under every condition. The compiler no longer emits a class's copy beside a declared prop, where JSX let the class's later attribute win and replace a reactive binding: it drops the prop from the base, from variants and from class branches, and warns `explicit-prop-overrides-class` naming the class and the prop, in builds and in the editor. A class value resolved at render time is handed the declared names as `__velaOwn`, and both runtime hosts leave those props standing. A helper written as a child, a fragment's child included, outranks the class's (`explicit-helper-overrides-class`), except a `UIShadow` layer; a conditional child or a helper a variant changes is kept and reported as `possible-duplicate-helper`. Beside a spread, what a class lowers to now takes the `className`'s place and preflight's defaults go first, so `<frame className="bg-slate-700" {...props} />` lets `props` win and a spread can paint over preflight; move the `className` after the spread to keep the class winning.
- c3916fb: Space a divided list's items `gap + thickness` apart, as CSS does, instead of `2 * gap + thickness`. The separators were list items, so the list's `Padding` opened on both sides of each one. Now the host sets that `Padding` to 0 and each separator takes the gap itself: a transparent slot `thickness + gap` long holding a `Line` frame at its start, against the item before as Tailwind's border is. `gap-*`, `space-*`, a variant gap such as `hover:gap-4` and a gap from a runtime class value all move this way on both hosts. A gap stays on the list when the separators cross it, and a `Padding` written on your own `<uilistlayout>` is left as written. To make that possible the compiler emits the `uilistlayout` of an element a divide can reach as an unconditional rule rather than a child. In `@rbxts/vela-runtime-core`, `__VelaDivide.separatorSize` now returns the slot, `__VelaDivide.separatorLineSize` returns the line, and `__VelaDivide.absorbListGap` moves the gap.
- d8e292e: Rank the children of a `divide-*` list by their `LayoutOrder` or static `order-*` so the separators follow the sorted order on both hosts, fade the separators with `opacity-*`, keep the separators of a divided list whose value children sit under a fade, and make `divide-x-0`/`divide-y-0` remove them. The compiler warns when divide has no list layout, sits beside `grid`, or has a child whose `order-*` the React parent cannot read. Add `isolate`, which builds a `frame` as a `canvasgroup` so `opacity-*` fades its subtree as one layer; it has to be static and unconditional. `@rbxts/vela-runtime-core` gains `__VelaDivide.planDivideOrder` and `__VelaDivide.separatorTransparency`.
- d8e292e: Add `group-hover:`, `group-active:`, `group-focus:` and the matching `peer-*` variants, each with an optional `/name`, and the `group`, `group/name`, `peer` and `peer/name` markers. A marker lowers to a CollectionService tag (`VelaGroup`, `VelaPeer/name`), carried by `Tag` on a static React element and placed by the host on Vide, and a shared runtime-core observer finds the nearest marked ancestor or any marked sibling and reports its hover, press and focus. Peers ignore sibling order, which Roblox does not keep, and look past the `VelaMarginBox` frame an `m-*` element is wrapped in. `group-md:` and other unread states warn `unsupported-relational-variant`, and a conditional marker or one on a component element warns too. `group`, `peer`, `group-*` and `peer-*` are now reserved variant names.

### Patch Changes

- 474e567: A transparency written on an element now survives a fade that arrives at runtime, as it already did under a fade the compiler could see. `<frame BackgroundTransparency={0.2} />` inside a component rendered with `opacity-50` kept its 0.2 when the fade was composed statically, but became 0.6 when the same fade crossed the component boundary through the opacity context, because the runtime could not tell a prop the author wrote from one Vela lowered. The compiler now wraps such an element in `__VelaOpacity.own(element, names)` and hands a runtime host the names as `__velaOwn`, and both the React and the Vide consumer leave those props standing. A literal `1` is left unwrapped, since a fade composes it to itself.
- 83b2584: Tween the layout props an `m-*` element's margin box carries instead of snapping them, so `<frame className="m-4 w-20 transition-all hover:w-40" />` widens the box, margin included, on both hosts. A motion driver receives those tweens with `{ owner, marginBox: true }` as its fourth argument. `@rbxts/vela-runtime-core` gains `__VelaMotion.holdTweenGoal` and `__VelaMotion.changedGoal`.
- d8e292e: Watch the attribute, `group-*` and `peer-*` variants a plugin utility's body carries when a class value the runtime resolves names it. On Vide, fade a host's children when a class value or a variant rule turns on `opacity-*` after mount, and rank each instance a reactive child returns on its own in a `divide-*` list, with a separator between them.
- d8e292e: Keep one environment store for the whole place in `@rbxts/vela-runtime-core`, read with `__VelaEnv.currentEnvironment()` and `__VelaEnv.subscribeEnvironment()`, so every runtime host shares one set of viewport, input, `LocalPlayer` and color scheme connections instead of connecting its own, and subscribers hear only changes that move a field resolution reads. The Vide host now follows input mode, the `VelaColorScheme` attribute and a `LocalPlayer` that arrives late, live, where it used to decide them at mount.
- d8e292e: Make the runtime path resolve a class the way the static path lowers it: an element's own `opacity-*` multiplies into every channel and the stroke, shadow and blur it draws once every token has resolved, negative margins replace rather than accumulate, a variant `max-w-*` keeps its other axis unbounded, and a solid color takes back an earlier color's `/N`. On the static path, an all-zero margin no longer promotes an element to the runtime host, a variant `opacity-*` hands its alpha to the runtime to compose over every rule that fires beside it, and a variant font utility keeps the family and weight the base set. On both paths, `opacity-*` leaves a background preflight neutralized transparent. The Vide host puts a helper property back to its default when no rule names it any more.
- d8e292e: Rank what applies the way Tailwind's stylesheet does on both paths: a matching variant beats the base wherever it is written, a wider breakpoint beats a narrower one, orientation, `dark:` and the input variants beat every breakpoint, and the last class wins among equal conditions. On the static path, margin, divide, text transform and decoration, transition and animation classes under a variant are forwarded to the runtime host instead of being dropped, a variant `opacity-*` on a component element applies and a hosted component keeps its own and inherited alpha, a grid takes its gap as `CellPadding` without a second `UIListLayout`, a variant position, translate or automatic size names one axis at a time, and the base's translate and negative margin go to the runtime once a rule moves the element. The overridden-class warning reads forwarded classes under the condition they were written with.
- c30efc8: On Vide, an `m-*` element whose size comes from a class value resolved at runtime now fills its margin box. The host only made the element fill the box when its size was already a static prop when the host was built, so `className={() => "m-4 w-20 h-10"}` sized the box while the element inside stayed 0×0, and the box kept hugging its contents and grew past the size it was given. The element now fills a box the resolution sizes and falls back when nothing does, and a sized box stops sizing itself to its contents, as the React host already did.
- e88edf5: On the Vide target, a statically lowered element no longer crashes the whole tree when it is built inside a function child. Its rem-scaled offsets used to be emitted as one reactive prop each, and Vide refuses to open a prop effect inside the children effect a function child runs in, so `{() => items.map((item) => <frame className="w-6 h-6" />)}` threw "cannot create a new reactive scope inside another reactive scope" out of `Vide.root`. The offsets now travel as one `__VelaRem.bind({ ... })` action child per instance, which opens its effect untracked: it still follows the viewport, and it is owned by and torn down with the function child that built it. An element whose class is followed by a spread keeps a binding per prop, so the spread can still paint over it. The element's own `action` is moved behind the binding, so it still runs after Vela's and reads the offsets already scaled.
- Updated dependencies [c3916fb]
- Updated dependencies [d8e292e]
- Updated dependencies [94f1bdc]
- Updated dependencies [d8e292e]
- Updated dependencies [83b2584]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
- Updated dependencies [632d260]
- Updated dependencies [bf73f20]
- Updated dependencies [d8e292e]
  - @rbxts/vela-runtime-core@0.14.0

## 0.13.1

### Patch Changes

- Updated dependencies [e14d8f1]
  - @rbxts/vela-runtime-core@0.13.1

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
- Updated dependencies [fcaa7dd]
  - @rbxts/vela-runtime-core@0.13.0

## 0.12.8

### Patch Changes

- @rbxts/vela-runtime-core@0.12.8

## 0.12.7

### Patch Changes

- Updated dependencies [da7d895]
  - @rbxts/vela-runtime-core@0.12.7

## 0.12.6

### Patch Changes

- @rbxts/vela-runtime-core@0.12.6

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

- Updated dependencies [d1d3538]
  - @rbxts/vela-runtime-core@0.12.5

## 0.12.4

### Patch Changes

- @rbxts/vela-runtime-core@0.12.4

## 0.12.3

### Patch Changes

- Updated dependencies [3c2d451]
  - @rbxts/vela-runtime-core@0.12.3

## 0.12.2

### Patch Changes

- @rbxts/vela-runtime-core@0.12.2

## 0.12.1

### Patch Changes

- @rbxts/vela-runtime-core@0.12.1

## 0.12.0

### Minor Changes

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

### Patch Changes

- 6b06e22: Tell the Vide host a margin is coming.

  A margin box is an instance _above_ the element, and Vide parents an element as
  soon as it builds one — so a `m-*` the runtime resolved could never be honoured.
  No rule can carry a margin either, which is exactly why such a class value goes
  to the runtime whole.

  But the compiler read the token on its way to that decision. It says so now:
  a class value naming a margin anywhere this pass can see — a static token, a
  branch's — emits `__velaMarginBox`, and the host builds the box before the
  element rather than after. `EmitTarget::needs_margin_box_hint` is what asks, and
  React answers `false`: the render that resolves a margin also renders the
  wrapper around it, so the hint would only be a prop with no reader.

  What is left is a margin named where nothing can read it — a token arriving out
  of an opaque call — and the runtime warns there rather than rendering unspaced.

- fcea92a: Bring the Vide host to parity with the React one.

  The static path was already identical; everything here was on the runtime host.

  Three of the host's own props were never filtered out of the static
  passthrough. `__velaTransition`, `__velaAnimation` and `__velaText` are emitted
  for every target, and only `__velaMargin`/`__velaDivide` had been named — so a
  `transition-*`, an `animate-*` or a text transform beside a variant reached
  `Instance` and threw there. They are one set now rather than a chain of name
  comparisons.

  A rule that stopped matching wrote `nil`. Every prop a rule can name is bound,
  and Vide writes whatever the thunk returns, so a variant with no static
  counterpart — `hover:font-bold` on an element that declares no `FontFace` —
  took the tree down as it was created. React drops the prop and the reconciler
  restores the class default; the fallback now reads that default off the class.

  Also fixed: the inherited alpha composed once per bound prop instead of once
  per resolution, and faded that much more each time; a component tag lost its
  children to the array part of the props table, where only a host tag reads
  them; and every element with a dynamic class value grew a margin wrapper it had
  not asked for, moving its layout props onto a frame between it and its parent.

  Text transforms and motion now run on the Vide host — `uppercase`/`underline`
  through the shared Text pipeline, `transition-*` as a per-prop tween and
  `animate-*` as a preset under `cleanup()`, both on the same neutral driver seam
  `plugins.motion` replaces for React. The fade consumer walks the subtree it is
  handed rather than only its root, stopping at a `CanvasGroup` that already
  composites its own.

  `framework` is inferred from the nearest `tsconfig.json` when the project does
  not name one: a `jsxFactory` of `Vide.jsx` selects Vide.

- fcea92a: Close the three opacity holes the Vide host had left.

  They share one seam. React has a single context that both the host and the fade
  consumer read; Vide has two disjoint mechanisms — the host's own
  `__velaOpacity`, and a consumer that walks the instances a component already
  built — and the mark that keeps the two from overlapping dropped exactly these
  cases.

  The context's alpha never reached a prop the element was _handed_, only what it
  resolved, so a written `BackgroundTransparency={0}` under a component-boundary
  fade stayed opaque. A component the host renders got no alpha at all, because
  every one the host applies sat behind a host-tag guard — its body runs inside
  the host, though, which is the one place a real Vide context scope still opens
  around a subtree the transformer could not see into. And a host's own children
  got nothing from an `opacity-*` the host resolved: React wraps them in a
  provider they read during their own render, which a child built before its
  parent cannot do, so the alpha is written onto what they built instead —
  against a remembered base, so a resolution that changes it does not compound.

  All three were measured in Studio against what the React host computes for the
  same element, and now agree with it.

- fcea92a: Stop deciding what a Vide element can become before it exists.

  The host bound a thunk per prop name, which forces the names to be known up
  front — so it read them off one untracked resolution, and a token that only a
  later reading of a deferred `className` produced could not take effect. Which
  props were written, which of `hover:`/`active:`/`focus:` were tracked, and
  whether there were divide separators were all fixed at construction.

  A host tag is an instance the host owns, so none of that has to be decided in
  advance. The thunks are one effect that writes what the resolution now names —
  which is what a re-render is for React. A name that appears is written; a name
  that disappears goes back to what the element declared, or to the class default
  where it declared nothing. Tweens moved into the same write. Trackers attach
  unconditionally when the class value is deferred, and separators are built up
  front like the helpers already were, so the children thunk can return the run
  the resolution currently asks for.

  **A handler was being called as if it were a value.** Reading the element's
  declared props called every function among them, and in Vide an event handler
  and a derivable prop are the same type — so a `MouseButton1Click` on any element
  with a dynamic class value fired on every resolution reading. Vide tells the two
  apart by asking the instance whether the property is a signal; the class answers
  the same question here, which also covers `action` and the `*Changed` names.

  What remains is narrow and now loud: a `m-*` arriving late cannot be honoured,
  because the margin box is an instance above one that is already parented, and
  the runtime warns rather than rendering it unspaced. On a component element the
  prop names are still fixed at the call, since it is handed its props once.

- Updated dependencies [3b1fbd9]
  - @rbxts/vela-runtime-core@0.12.0
