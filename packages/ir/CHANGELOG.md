# @vela-rbxts/ir

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

### Patch Changes

- @vela-rbxts/types@0.5.0

## 0.4.2

### Patch Changes

- @vela-rbxts/types@0.4.2

## 0.4.1

### Patch Changes

- @vela-rbxts/types@0.4.1
