# @vela-rbxts/rbxtsc-host

## 0.15.0

### Minor Changes

- faf4ce7: Add `vela sort [paths...]`, which applies the editor's class sort to every `.tsx` file under `--src` or the paths given, and `vela sort --check`, which lists the files that would change and exits 1 without writing, for CI and pre-commit hooks. `--class-functions cn,cva` sorts the same helpers as the editor's `classFunctions`. `@vela-rbxts/rbxtsc-host` exports the `sortSourceForHost` it is built on.

### Patch Changes

- Updated dependencies [9eb6c01]
- Updated dependencies [5b2e9ac]
  - @vela-rbxts/compiler@0.15.0
  - @vela-rbxts/config@0.15.0
  - @vela-rbxts/ir@0.15.0

## 0.14.0

### Minor Changes

- d8e292e: The CLI writes a source map for every lowered file under `.vela/maps`, and `vela rbxtsc` and `vela remap` rewrite rbxtsc diagnostics against `.vela/src` so they point at the line and column in `src` where the code was written, with the code frame re-rendered from the original line. The compiler takes a `sourceMap` option and returns the mappings it recorded, and a file the compiler leaves unchanged is now copied through as written instead of reprinted.
- 78b1d68: Fail the build when Vela fails, instead of shipping the file unlowered. A host result now carries `fatal`, set whenever a diagnostic is an error, and neither the `rbxtsc` plugin nor `vela build` emits such a file: the plugin keeps the original out of the program and reports the error, and the CLI writes nothing to `.vela/src` and removes what an earlier run wrote there. The plugin also checks the config of every file it would lower on every build, so a config that broke after the last incremental `rbxtsc` build fails with `config-resolution-failed` even when no file changed, and `vela-rbxts/transformer` loads the compiler itself, so a native compiler that cannot load fails each styled file with `compiler-unavailable` where `rbxtsc` used to downgrade the plugin to a warning and compile `className` raw. A lowered file that no longer parses fails with `transformed-source-invalid`, and a host without `context.addDiagnostic` gets an exception for an error rather than nothing.
- d2a974d: Configure a project from a `vela.css`. `@theme` declares tokens with CSS values (`--color-brand-500: #3b82f6`, `--spacing-4: 16px`), `@custom-variant selected (Selected = true)` registers an attribute-backed variant, `.btn { @apply … }` and `.panel { BackgroundTransparency: 0.5 }` register plugin utilities, and `@import "./tokens.css"` folds a sibling stylesheet in as a preset of the file that named it. The stylesheet only ever extends, so it resolves on top of a `vela.config.ts` when a project has both, and a project that has only the stylesheet needs no config file at all. What the dialect does not have is a cascade: combinators, pseudo-classes, `@media`, and CSS properties are diagnosed with the vela equivalent rather than silently accepted.
- d8e292e: `vela watch` rebuilds when a stylesheet pulled in with `@import` changes, wherever it lives, outside the project root and `src` included, and follows an import added while the watch runs. It polls a directory it cannot watch. `@vela-rbxts/rbxtsc-host` exports `projectConfigDependencies`, the files a project's config was folded from.

### Patch Changes

- 3382d02: Fail the build when the runtime a lowered file imports cannot load from the project's `node_modules/@rbxts`, instead of building a place that stops on play with "Could not find module: vela-runtime-core". The runtimes are dependencies of `vela-rbxts`, and pnpm's default linker keeps a dependency's own dependencies out of that folder, which is all Rojo maps into the place. Both the `rbxtsc` plugin and `vela build` now walk the imported runtime's `@rbxts` dependencies from the nearest `package.json` and fail the file with `runtime-not-installed`, naming each missing package and the package that needs it, or a runtime package installed at another version than the compiler emits for. Before, the default pnpm install failed with a bare `Cannot find module '@rbxts/vela-runtime'`, and adding that package by hand compiled a place without its core. The README now gives pnpm projects `publicHoistPattern: ["*@rbxts*"]` in `pnpm-workspace.yaml`, the setting `@rbxts/react` already asks them for.
- Updated dependencies [d8e292e]
- Updated dependencies [d52a004]
- Updated dependencies [93b86f2]
- Updated dependencies [474e567]
- Updated dependencies [c3916fb]
- Updated dependencies [d8e292e]
- Updated dependencies [94f1bdc]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
- Updated dependencies [632d260]
- Updated dependencies [bf73f20]
- Updated dependencies [d8e292e]
- Updated dependencies [d2a974d]
- Updated dependencies [e88edf5]
  - @vela-rbxts/compiler@0.14.0
  - @vela-rbxts/config@0.14.0
  - @vela-rbxts/ir@0.14.0

## 0.13.1

### Patch Changes

- @vela-rbxts/compiler@0.13.1
- @vela-rbxts/config@0.13.1
- @vela-rbxts/ir@0.13.1

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
  - @vela-rbxts/config@0.13.0
  - @vela-rbxts/compiler@0.13.0
  - @vela-rbxts/ir@0.13.0

## 0.12.8

### Patch Changes

- @vela-rbxts/compiler@0.12.8
- @vela-rbxts/config@0.12.8
- @vela-rbxts/ir@0.12.8

## 0.12.7

### Patch Changes

- Updated dependencies [da7d895]
  - @vela-rbxts/compiler@0.12.7
  - @vela-rbxts/config@0.12.7
  - @vela-rbxts/ir@0.12.7

## 0.12.6

### Patch Changes

- Updated dependencies [e9805ff]
  - @vela-rbxts/compiler@0.12.6
  - @vela-rbxts/config@0.12.6
  - @vela-rbxts/ir@0.12.6

## 0.12.5

### Patch Changes

- Updated dependencies [d1d3538]
  - @vela-rbxts/compiler@0.12.5
  - @vela-rbxts/config@0.12.5
  - @vela-rbxts/ir@0.12.5

## 0.12.4

### Patch Changes

- Updated dependencies [de7e6ea]
- Updated dependencies [de7e6ea]
  - @vela-rbxts/compiler@0.12.4
  - @vela-rbxts/config@0.12.4
  - @vela-rbxts/ir@0.12.4
  - @vela-rbxts/types@0.12.4

## 0.12.3

### Patch Changes

- Updated dependencies [3c2d451]
- Updated dependencies [3c2d451]
  - @vela-rbxts/compiler@0.12.3
  - @vela-rbxts/config@0.12.3
  - @vela-rbxts/ir@0.12.3
  - @vela-rbxts/types@0.12.3

## 0.12.2

### Patch Changes

- Updated dependencies [0e83027]
  - @vela-rbxts/compiler@0.12.2
  - @vela-rbxts/config@0.12.2
  - @vela-rbxts/ir@0.12.2
  - @vela-rbxts/types@0.12.2

## 0.12.1

### Patch Changes

- 7e27a1e: Let a `vela.config.ts` reach the framework inference.

  The tsconfig `jsxFactory` only decided the framework for a project whose config
  never named one, and that was read off the export. `defineConfig` resolves an
  unset framework to the default before returning, so every config that went
  through it looked like it had asked for React, and a Vide project had to name
  `framework: "vide"` by hand after all.

  The resolved configs `defineConfig` hands back are tracked now, so only an
  export it did not produce is read as a declaration.

  - @vela-rbxts/compiler@0.12.1
  - @vela-rbxts/config@0.12.1
  - @vela-rbxts/ir@0.12.1
  - @vela-rbxts/types@0.12.1

## 0.12.0

### Patch Changes

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

- Updated dependencies [4fbd38d]
- Updated dependencies [6b06e22]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [7a9fde7]
- Updated dependencies [5a31e51]
  - @vela-rbxts/compiler@0.12.0
  - @vela-rbxts/config@0.12.0
  - @vela-rbxts/ir@0.12.0
  - @vela-rbxts/types@0.12.0

## 0.11.1

### Patch Changes

- Updated dependencies [c71a864]
  - @vela-rbxts/compiler@0.11.1
  - @vela-rbxts/config@0.11.1
  - @vela-rbxts/ir@0.11.1
  - @vela-rbxts/types@0.11.1

## 0.11.0

### Patch Changes

- 7802618: Add a `vela` CLI that lowers a source tree ahead of `rbxtsc`, so a project can use Vela without registering the transform plugin.

  `vela build` mirrors `src` into `.vela/src`, transforming the `.tsx` files that use `className` and copying everything else through unchanged; `vela watch` re-transforms on change. Point `compilerOptions.rootDir` and `include` at the generated tree and drop the `vela-rbxts/transformer` plugin entry — the CLI warns when either is still wired for the transformer. Both paths run the same compiler and emit identical Luau.

  Diagnostics keep the transformer's anchoring against your real sources, and `vela build` exits non-zero when a file fails to compile. Pruning is driven by a manifest of what the CLI emitted, so a file it never wrote is never deleted.

  Project configs are now cached by content in the `rbxtsc` host, which stops a whole-tree run from transpiling and evaluating `vela.config.ts` once per source file.

  - @vela-rbxts/compiler@0.11.0
  - @vela-rbxts/config@0.11.0
  - @vela-rbxts/ir@0.11.0
  - @vela-rbxts/types@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [3724fbd]
- Updated dependencies [63d44ca]
  - @vela-rbxts/compiler@0.10.0
  - @vela-rbxts/config@0.10.0
  - @vela-rbxts/ir@0.10.0
  - @vela-rbxts/types@0.10.0

## 0.9.0

### Patch Changes

- Updated dependencies [c661947]
- Updated dependencies [c661947]
  - @vela-rbxts/compiler@0.9.0
  - @vela-rbxts/config@0.9.0
  - @vela-rbxts/ir@0.9.0
  - @vela-rbxts/types@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [9cea6df]
  - @vela-rbxts/compiler@0.8.0
  - @vela-rbxts/config@0.8.0
  - @vela-rbxts/ir@0.8.0
  - @vela-rbxts/types@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [e464a5a]
- Updated dependencies [e464a5a]
  - @vela-rbxts/compiler@0.7.0
  - @vela-rbxts/config@0.7.0
  - @vela-rbxts/ir@0.7.0
  - @vela-rbxts/types@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [8ff59d9]
- Updated dependencies [354b20b]
- Updated dependencies [b4e5ee1]
  - @vela-rbxts/compiler@0.6.0
  - @vela-rbxts/config@0.6.0
  - @vela-rbxts/ir@0.6.0
  - @vela-rbxts/types@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies [fe23df6]
  - @vela-rbxts/compiler@0.5.2
  - @vela-rbxts/config@0.5.2
  - @vela-rbxts/ir@0.5.2
  - @vela-rbxts/types@0.5.2

## 0.5.1

### Patch Changes

- @vela-rbxts/compiler@0.5.1
- @vela-rbxts/config@0.5.1
- @vela-rbxts/ir@0.5.1
- @vela-rbxts/types@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [7a4dfa4]
- Updated dependencies [c84f22b]
- Updated dependencies [6e20817]
  - @vela-rbxts/compiler@0.5.0
  - @vela-rbxts/config@0.5.0
  - @vela-rbxts/ir@0.5.0
  - @vela-rbxts/types@0.5.0

## 0.4.2

### Patch Changes

- Updated dependencies [fd6d430]
- Updated dependencies [80900eb]
- Updated dependencies [0348ad8]
  - @vela-rbxts/compiler@0.4.2
  - @vela-rbxts/config@0.4.2
  - @vela-rbxts/ir@0.4.2
  - @vela-rbxts/types@0.4.2

## 0.4.1

### Patch Changes

- 04c4e35: Diagnostic quality: malformed `configJson` now reports `invalid-config-json` instead of silently falling back to the default theme, TSX parse failures carry line/column and a source range instead of a debug dump, and an invalid `vela.config.*` export names the failing theme key. The compiler root tarball also stops bundling the publish machine's native binary — platform packages already provide them.
- Updated dependencies [04c4e35]
- Updated dependencies [b5714bc]
  - @vela-rbxts/compiler@0.4.1
  - @vela-rbxts/config@0.4.1
  - @vela-rbxts/ir@0.4.1
  - @vela-rbxts/types@0.4.1
