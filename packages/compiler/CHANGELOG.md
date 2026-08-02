# @vela-rbxts/compiler

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

- 7a4dfa4: Fix `order-*` being ignored inside a flex container. The lowered `UIListLayout`
  left `SortOrder` at its engine default of `Name`, so children sorted
  alphabetically by instance name — `order-1` on a `textlabel` still landed after
  `order-2` on a `textbutton` — while `UIGridLayout` already set
  `SortOrder = LayoutOrder`. Every `UIListLayout` the compiler emits now sets it,
  statically and through the runtime host, unless something else already did.
- 6e20817: Stop emitting the deprecated `table.getn` from the inlined runtime host. The
  array-length helper aliased it locally because an earlier `.length` spelling
  compiled straight through as a nil field, but Luau's script analysis flags
  every `table.getn` reference as deprecated in consumer places. The helper now
  uses `size()`, which roblox-ts lowers to the `#` operator.

## 0.4.2

### Patch Changes

- fd6d430: Type a `ref` on a runtime-hosted element from its host tag. The runtime host is
  built with `forwardRef`, which pins one ref type for the whole component, so any
  element a variant or motion utility promoted typed its `ref` as `Ref<unknown>` —
  `<frame ref={frameRef} className={dynamic} />` would accept a ref to anything.
  The host is now restated as a generic call whose ref follows `__velaTag`.
- 80900eb: Fix `transition` snapping instead of tweening whenever the base value came
  from a statically lowered utility. The runtime host seeded its held tween
  values from the resolution alone, which never carries a static base like
  `bg-slate-700`, so the first render a `hover:`/`md:` rule introduced the prop
  held the _new_ value and the tween had nowhere to travel from. It now seeds
  from the merged props, and both entering and leaving a variant tween.
- 0348ad8: Fix a variant colour leaving the base opacity modifier in place, so
  `bg-blue-600/50 hover:bg-blue-600` stayed half transparent on hover instead of
  turning opaque. A variant resolves in isolation and then overlays the base at
  runtime, so dropping the transparency prop from its own bundle never reached
  the base value — the variant now states the opaque value when anything else in
  the same class list set that family's transparency.

## 0.4.1

### Patch Changes

- 04c4e35: Diagnostic quality: malformed `configJson` now reports `invalid-config-json` instead of silently falling back to the default theme, TSX parse failures carry line/column and a source range instead of a debug dump, and an invalid `vela.config.*` export names the failing theme key. The compiler root tarball also stops bundling the publish machine's native binary — platform packages already provide them.
- b5714bc: Fix two runtime host defects: breakpoint and orientation variants never matched because `Camera.ViewportSize` was only read at mount while it still reports 1x1, and `divide-*` counted lowered helper elements as content, placing a separator above the first child.
