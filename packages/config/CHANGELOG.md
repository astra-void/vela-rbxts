# @vela-rbxts/config

## 0.5.1

### Patch Changes

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

- @vela-rbxts/types@0.5.0

## 0.4.2

### Patch Changes

- @vela-rbxts/types@0.4.2

## 0.4.1

### Patch Changes

- @vela-rbxts/types@0.4.1
