# @vela-rbxts/config

## 0.13.0

### Minor Changes

- 655432a: Composable state and responsive styling.

  **State variants.** `addVariant("open", { attribute: "State", equals: "open" })` registers a `open:` prefix that reads a Roblox attribute off the styled instance, so the states a UI actually has (open, selected, disabled, a tier) become variants without vela guessing at any of them. `attr-[State=open]:` reads one inline where a registration would be ceremony. Both compose with every other variant, and both leave the utility behind them resolving at compile time: only the condition travels. The runtime subscribes to `GetAttributeChangedSignal` for exactly the attributes an element's rules and class value name, and an element that names none connects nothing.

  **Responsive ranges and configurable breakpoints.** `max-md:` is the exact complement of `md:`: the minimum is inclusive and the maximum is not, so the two cover every viewport once and `md:max-lg:` addresses one bucket. `theme.screens` is a theme axis like the others, and the default scale gains Tailwind's `xl` and `2xl`. A range that leaves no viewport, and a `max-` in front of a name that is no breakpoint, are reported as themselves rather than as generic unknown variants.

  **Presets.** `presets: [gameUiPreset()]` folds a shared theme, its plugins, its utilities and its variants into a project, resolving before the config that names them and after the built-in defaults, as a fold over configuration inputs, so `theme.extend` still extends what a preset replaced.

  **Helper transitions.** `hover:rounded-xl`, `hover:border-blue-500` and `hover:shadow-lg` tween now: the motion system moves the UI\* helper instances the element already has rather than only its own props, and a custom motion driver is handed those tweens with a fourth argument naming the helper instead of being bypassed for them. `transition-shadow` means something for the first time.

  **Config resolution is cached.** A `vela.config.ts` is transpiled and executed once per build rather than once per eligible source file, and a config that throws is recoverable without restarting a watch process.

  **Editor.** Everything a project configures completes, hovers and sorts: custom breakpoints with their `max-` twins, registered variants with the attribute they read, and `attr-[`. Optional inlay hints show what each class lowers to, off by default, from the compiler's own lowering read back rather than a second semantic model.

## 0.12.8

## 0.12.7

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

### Patch Changes

- @vela-rbxts/types@0.12.4

## 0.12.3

### Patch Changes

- @vela-rbxts/types@0.12.3

## 0.12.2

### Patch Changes

- @vela-rbxts/types@0.12.2

## 0.12.1

### Patch Changes

- @vela-rbxts/types@0.12.1

## 0.12.0

### Minor Changes

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

### Patch Changes

- @vela-rbxts/types@0.12.0

## 0.11.1

### Patch Changes

- @vela-rbxts/types@0.11.1

## 0.11.0

### Patch Changes

- @vela-rbxts/types@0.11.0

## 0.10.0

### Patch Changes

- @vela-rbxts/types@0.10.0

## 0.9.0

### Patch Changes

- @vela-rbxts/types@0.9.0

## 0.8.0

### Patch Changes

- @vela-rbxts/types@0.8.0

## 0.7.0

### Minor Changes

- e464a5a: Add plugin utilities and a motion driver seam.

  `plugins.utilities` lets a config name its own tokens, expanding either to a
  utility class list or straight to Roblox property assignments, with a depth cap
  so a self-referential definition fails the config rather than the build.

  `plugins.motion` lets a driver take over transitions or animations one method at
  a time; whatever it leaves alone stays on the built-in TweenService path.

### Patch Changes

- @vela-rbxts/types@0.7.0

## 0.6.0

### Patch Changes

- @vela-rbxts/types@0.6.0

## 0.5.2

### Patch Changes

- @vela-rbxts/types@0.5.2

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
