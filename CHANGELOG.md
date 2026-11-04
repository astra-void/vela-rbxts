# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions are released in lockstep across every workspace package.

## [Unreleased]

## [0.15.0] - 2026-11-04

### Added

- **Editor features reach class lists outside the `className` attribute.** A `const` string a `className` names, as in `const base = "px-4 bg-slate-700"; <frame className={cn(base, active && "p-2")} />`, is completed, hovered, checked and sorted where it is declared. The editor mirrors the scope the compiler resolves consts in, so it reads exactly the consts that lower: not a `let`, not one declared after the class value, not one inside another function. A const several elements name is read once, against the host they share. A new `classFunctions` editor option (`velaRbxts.classFunctions` in VS Code, `initializationOptions.classFunctions` or `workspace/didChangeConfiguration` elsewhere) lists helpers whose arguments are class lists wherever they are called, `tw` tagged templates included. A string value is a class list, an object key is one only where its value is a condition, as in `clsx`, and in a cva-style map `defaultVariants` and the variant names in `compoundVariants` are skipped.
- **Diagnostic levels per code, and a switch for all of them.** The language server reads `lint`, a map from a diagnostic code to `error`, `warning`, `info`, `hint` or `ignore` that replaces the default level, and `validate`, which stops publishing diagnostics while completions, hover and colors keep working. Both arrive through `initializationOptions` or under `velaRbxts` in `workspace/didChangeConfiguration`, open documents are re-published when either changes, and a level the server does not know is dropped rather than discarding the settings sent with it. VS Code exposes them as `velaRbxts.lint` and `velaRbxts.validate`.
- **An arbitrary value is pointed at the named class it equals.** `w-[16px]`, `h-[100%]` and `text-[14px]` lower exactly as `w-4`, `h-full` and `text-sm`, and now carry a `canonical-class` info diagnostic with a quickfix to the named form, so the class list keeps following the theme. Equivalence is decided by the resolver the overridden-class check uses, on the element's host and with the variants kept, so a theme's own step counts: `px-[18px]` points at `px-card` when the spacing scale names `card` as 18 pixels. `EditorDiagnostic` gains an optional `replacement`, which the language server carries in the diagnostic's data.
- **`vela sort` and `vela sort --check`.** The editor's class sort now runs from the command line over every `.tsx` file under `--src`, or the files and directories named, reading the nearest `vela.config` the way a build does, so the result is what the `source.sortVelaClasses` action writes. `--check` lists the files that would change and exits 1 without writing, for CI and pre-commit hooks, and `--class-functions cn,cva` sorts the same helpers as the editor's `classFunctions`. `@vela-rbxts/rbxtsc-host` exports the `sortSourceForHost` it is built on.
- **VS Code commands.** **Vela: Restart Language Server** restarts the server and re-reads every `vela.config` without reloading the window, **Vela: Show Output** opens the server's output channel, and **Vela: Sort Classes** sorts the active TypeScript or TSX file.

### Changed

- **The VS Code extension is now called Vela IntelliSense.** Only the display name, description and keywords change: the marketplace ID `astra-void.vela-rbxts-lsp`, the `velaRbxts.lsp.*` settings and the `@vela-rbxts/lsp` server package keep their names, so installs and settings carry over.
- `get_class_tokens`, the Rust-only token API the language server highlights with, takes the editor options as a second argument, so highlights cover the class lists `classFunctions` adds.

## [0.14.0] - 2026-11-03

### Added

- **A `vela.css` config source.** A `@theme` block declares tokens in the units a designer already has them in, so `--color-brand-500: #3b82f6` and `--spacing-4: 16px` become `Color3.fromRGB(59, 130, 246)` and `new UDim(0, 16)` instead of being retyped as roblox-ts expressions; `.btn { @apply bg-brand-500 px-4 }` and `.panel { BackgroundTransparency: 0.5 }` register the same plugin utilities `addUtilities` does; `@custom-variant selected (Selected = true)` registers the same attribute-backed variant `addVariant` does; and `@import "./tokens.css"` folds a sibling in as a preset of the file that named it, cycles and all reported where they are written. A stylesheet only extends, never replaces, so it resolves on top of a `vela.config.ts` for a project that keeps structure in TypeScript and tokens in CSS, and a project that wants nothing else needs no config file at all. Because the parser produces the same config input `defineConfig` takes, the compiler and the language server read a class defined in CSS exactly as they read one from a plugin, with no second path to keep in step. What is deliberately absent is everything the cascade would be needed for: Roblox has no specificity, no inheritance and no selectors, so combinators, pseudo-classes, `@media`, and CSS properties such as `display` are diagnosed and pointed at the vela equivalent rather than accepted into an emit that could not honour them.
- **`vela watch` follows every stylesheet the config is built from.** A change to `vela.config.ts` or a stylesheet in the project root rebuilds the whole tree, and so does a change to a stylesheet that `@import` pulls in from anywhere else, outside the root and `src` included. The watcher asks the config loader which files it read, so an `@import` added while the watch runs is followed from the rebuild it triggers, and one that is removed stops being watched. Where the platform cannot watch a directory, it polls that directory every 400ms instead, as source watching already did.
- **`backdrop-blur-*` lowers to `UIBlur`.** Roblox's new `UIBlur` has three strengths where Tailwind has seven sizes, so `xs` and `sm` map to `Light`, `md` and `lg` to `Medium`, and `xl` through `3xl` to `Heavy`. A bare `backdrop-blur` is `sm`, `backdrop-blur-none` sets `Enabled = false`, and any other size is reported as `unsupported-backdrop-blur-value`. `opacity-*` fades the blur along with everything else the element draws, and a variant such as `hover:backdrop-blur-xl` swaps the strength on the runtime host. Every other `backdrop-*` filter is still `no-roblox-equivalent`. The class has no engine documentation yet, so the mapping assumes it blurs what is behind its parent and has not been checked in Studio.
- **Inset and text shadows.** `inset-shadow-{2xs,xs,sm}` and `text-shadow-{2xs,xs,sm,md,lg}`, each with `-none` and a color form, lower to Roblox's upgraded `UIShadow` (`Inset = true` and `Mode = Text`). Each layer is a `UIShadow` of its own, so `shadow-md inset-shadow-xs text-shadow-lg` puts three on one element rather than letting the last one win, and `opacity-*`, `transition-shadow` and rem scaling reach all three. `shadow-inner` used to warn `unsupported-shadow-inset` and now lowers to `inset-shadow-sm`; the diagnostic is gone. Tailwind's text shadows stack two or three layers, which collapse onto the widest with their combined alpha. Both capabilities are in Studio beta as of this release and do not render in a live game until Roblox ships them to the client.
- **A static/runtime parity harness.** `apps/parity-harness` lowers every class the editor completes, for every host tag and a component, plus seeded combinations of the families that meet in one Roblox property, and resolves the same classes through the compiled runtime-core Luau under Lune. Both sides go through the real Roblox constructors before they are compared, so float32 scales and int32 offsets are not mistaken for divergences. A second lane checks the rules the compiler emits for `hover:`, `dark:`, `md:` and attribute variants against the runtime resolving the same class under a matrix of environments, and a third repeats both under a config with extended theme keys, a plugin utility and a plugin variant. An order lane writes variants before the base and stacks breakpoints out of screen order, and unit checks pin which class wins on the runtime side. Intentional differences live in `known-differences.json`, each with its reason. CI installs the Lune release `apps/parity-harness/rokit.toml` pins; locally the harness skips with a warning when Lune is missing.
- **The editor flags a class that later classes override.** In `bg-red-500 bg-blue-500`, `px-2 p-4` or `p-4 px-2 py-2`, the first class sets nothing that survives, and it now carries an `overridden-class` warning that names the class that wins, or says the class is repeated when the winner is a copy of it. The check resolves the class list with the compiler's own resolver, with and without each class, so it agrees with the emit by construction: `w-4 h-8` and `font-mono font-bold` merge into one property and stay quiet, while `bg-red-500/50 bg-blue-500` warns because the solid color takes back the `/50`. The fade an element hands its subtree and a divide color count too, so `opacity-50 opacity-75` and `divide-y divide-red-500/50 divide-blue-500` warn on the class that loses. Only classes under the identical variant condition are compared, so `bg-red-500 hover:bg-blue-500` and `md:px-6 max-md:px-3` are never reported, and `md:hover:` and `hover:md:` count as the same condition. A class forwarded to the runtime host is read under the condition it was written with, counting the position a forwarded negative margin shifts, so `-mt-2 top-4 hover:mt-8` stays quiet. A bare `transition` before `duration-*` or `ease-*` stays quiet even though those enable the transition on their own, while `transition transition-colors` warns. A gradient forces `BackgroundColor3` to white, so a `bg-*` before `bg-gradient-to-r from-*` is reported with the gradient named as the cause. The language server tags the class as unnecessary, which editors draw faded, and offers removing it as the only quickfix. It is an editor lint: builds and the rbxtsc host do not report it.
- **rbxtsc diagnostics from the CLI tree point at your sources.** The compiler reprints a lowered file, prepends its runtime preamble and wraps every component root, so an error rbxtsc reported at `.vela/src/App.tsx:42:9` had nothing to do with line 42 of `src/App.tsx`. `vela build` and `vela watch` now write a v3 source map for each lowered file under `.vela/maps`, outside the tree rbxtsc copies into `out/`, and `vela rbxtsc [args...]` runs the project's own roblox-ts with both of its output streams rewritten: the path, line and column move back to `src`, and the code frame is drawn from the line you wrote. `vela remap` does the same as a filter for `rbxtsc 2>&1 | vela remap`. A map carries a hash of the file it was written for, so a diagnostic against a file that changed since, or a lowered file with no map, is left as it came rather than pointed at the wrong line, and a file copied through, a `.ts` among them, only has its path rewritten once its contents match the source. rbxtsc runs in the project root, so `vela -p game rbxtsc -p tsconfig.json` reads `game/tsconfig.json`. Lowered props and helper children inherit the span of the `className` they came from, so a type error on one lands on the `className`. Stack traces and the transformer plugin still see the generated code.
- **`isolate` fades a frame's subtree as one layer.** `opacity-*` fades every descendant on its own, so where two children overlap the lower one shows through and the overlap reads darker. `isolate` on a `frame` now builds the element as a `canvasgroup`, so `opacity-*` lowers to `GroupTransparency` and the subtree is composited once, the way CSS fades it. It is opt-in because a CanvasGroup is not free: it clips its descendants to its bounds, renders them to a texture that is redrawn whenever one of them changes, and is what a ref or an `IsA` check sees. The instance class is fixed when it is built, so an `isolate` under a variant, in a branch of a class value or in a class value left to the runtime warns `isolate-not-static`, and one on another host or a component warns `isolate-needs-frame`. Hover and completions on a frame with a static `isolate` read it as the `canvasgroup` it builds, so `opacity-*` shows `GroupTransparency`. `isolate` used to be reported as `no-roblox-equivalent`.
- **Divide diagnostics.** `divide-*` on an element nothing gives a list layout warns `divide-without-list-layout`, since every separator would stack at the corner, and `divide-*` beside `grid` warns `divide-with-grid`, since each separator would take a cell. On the React target, a child of a divided list whose `order-*` sits under a variant, in a class value branch or in a class value left to the runtime (a template literal, `clsx(...)`) warns `divide-unreadable-order`: the parent ranks children by what it reads off the element, before the child resolves anything.
- **Measured benchmarks and a Studio test place.** `pnpm run bench:compiler` runs criterion over the compiler crate: the harness sources, synthetic files of 10, 100 and 1000 elements, the cost of parsing `configJson` on every file, and completions, hover, diagnostics and sorting on a 1000-element document. `pnpm run bench:host` times the rbxtsc host against a release build of the addon, and `pnpm run bench:build` reports what the transformer adds to a clean `rbxtsc` build of a harness. Both harnesses also build a separate bench place (`bench:serve`, port 34873) that runs mount, rerender, color scheme, attribute variant, divide, group/peer and unmount scenarios at N=100 and N=1000, reporting CPU time, frame times, memory, instance counts and environment listeners, plus a small spec runner for the environment store, `dark:`, `selected:`, divide order and group/peer state. A run is requested and read back through `ReplicatedStorage` attributes and a `StringValue`, so an agent driving Studio never requires a module itself. `__VelaEnv.listenerCount()` in `@rbxts/vela-runtime-core` is the read-only count those numbers come from. CI runs every compiler bench once and builds both bench places; a non-gating `Bench` workflow on `main` uploads full results. `docs/benchmarks.md` describes each one and the Studio drive loop. A `Roblox specs` workflow uploads the bench place to a dedicated test place and runs the specs that need no client (the environment store, `selected:`, divide order and group/peer markers) on a Roblox server through Open Cloud Luau execution, once the repository has its API key and place secrets; `pnpm run bench:cloud` does the same locally.
- **`group-*` and `peer-*` variants.** `group-hover:`, `group-active:` and `group-focus:` style an element by the state of the nearest ancestor marked `group`, and `peer-hover:`, `peer-active:` and `peer-focus:` by a sibling marked `peer`. Both take a name, so `group-hover/card:` reads the ancestor marked `group/card` past any unnamed group nested inside it, and `peer-focus/email:` reads the sibling marked `peer/email`. A marker lowers to a CollectionService tag (`VelaGroup`, `VelaGroup/card`, `VelaPeer`, `VelaPeer/email`), and the runtime finds it in the instance tree rather than through a React context, which is what lets one mechanism work across component and file boundaries and on Vide, where children are built before their parents. On a static React element the tag rides the `Tag` prop, merged with a literal one, so the group itself stays static and only the elements reading it pay; Vide's host tags the instance. A shared observer in `@rbxts/vela-runtime-core` connects each observed instance's hover, press and focus once however many elements read it, follows the reader being reparented, siblings coming and going and markers being added or removed, and lets everything go with the reader or the instance. Marker changes arrive through one CollectionService subscription per tag for the whole place, and each wakes only the readers below that group or beside that peer, so mounting or unmounting N marked cards stays linear. Both hosts tag the frame they wrap an `m-*` element in as `VelaMarginBox`, and peers are looked for beside that box, so a margin on the peer or on its reader does not split the pair. Roblox keeps no sibling order, so any marked sibling counts as a peer, not only an earlier one, and several OR together. Hover is Roblox's geometric `MouseEnter`/`MouseLeave` on the group instance: a child drawn outside its bounds does not hover it, and the state starts unhovered until the first event. They also read attribute variants: `group-selected:` matches while the nearest `group` carries the attribute a registered `selected` names (through `addVariant` or `@custom-variant`), `group-attr-[State=open]/card:` reads `State` off `group/card`, and `peer-selected:` matches while any marked sibling carries it; a slash inside the brackets stays part of the value. The shared observer reads an attribute as it stands when it finds the instance and follows it through one `GetAttributeChangedSignal` connection per attribute per observed instance, however many elements read it. `group-md:` and other environment states, and a name outside the variant charset, warn `unsupported-relational-variant`; a malformed `group-attr-[…]` warns `malformed-attribute-variant`; a marker under a variant warns `conditional-marker`, and one on a component element warns `marker-on-component`. The editor completes, hovers and sorts them in a band of their own between `focus:` and `dark:`, attribute states after the interaction states of the same marker and registered before inline, and the overridden-class check compares two of them only under the same state and name. **Breaking for custom variants:** `group`, `peer`, and any name starting with `group-` or `peer-` are now reserved, so `addVariant` rejects them and a `vela.config.json` that registers one reports `invalid-custom-variant`.

### Changed

- **A prop written on the element outranks the class that names it.** `<frame className="bg-surface" BackgroundColor3={dynamicColor} />` used to lower to two `BackgroundColor3` attributes, and the class's, written last, replaced the binding. The class's copy is now left out of the base, the variants and the class branches, with an `explicit-prop-overrides-class` warning in the build and the editor; a class value resolved at render time is handed the declared names so the runtime host leaves them standing too. A `UICorner`, `UIPadding` or other helper written as a child likewise outranks the class's (`explicit-helper-overrides-class`), and a conditional child or a helper a variant changes is reported as `possible-duplicate-helper`.
- **A spread follows JSX order beside a `className`.** What a class lowers to took the end of the attribute list whatever was written after it, so `<textbutton className="bg-slate-700" {...props} />` ignored `props.BackgroundColor3`. It now takes the `className`'s place, and preflight's defaults go ahead of everything, so a spread can paint over them. Move the `className` after the spread to keep the class winning.
- **The CLI copies a file the compiler leaves unchanged as written.** It used to write the compiler's reprint, which drops comments and moves lines without lowering anything.
- **Every runtime host shares one set of environment connections.** Each React host that resolved at runtime connected its own viewport, input, `LocalPlayer` and color scheme signals, so a screen of N hosts held N copies of each and re-read the environment N times per change. `@rbxts/vela-runtime-core` now keeps one store for the whole place, read with `__VelaEnv.currentEnvironment()` and `__VelaEnv.subscribeEnvironment()`. It connects the first time a host asks, so a game that never resolves at runtime never listens, and it notifies subscribers only when a field resolution reads has actually moved. The React and Vide hosts both read from it.
- The workspace builds against `@rbxts/types` 1.0.958, the first release that has `UIBlur`. A project needs the same version for a statically lowered `backdrop-blur-*` to typecheck.

### Fixed

- **A `const` string used as a class value lowers its classes.** `const item = "w-6 bg-slate-500"; <frame className={item} />` emitted only preflight's defaults, because the compiler kept nothing about a `const` but whether it was truthy. It now keeps a string literal's text too, so the identifier lowers exactly as the string would.
- **A Vide `m-*` element sized at runtime fills its margin box.** When `w-*`/`h-*` came from a class value the host resolved, the box was sized and the element inside it stayed 0×0, and the box kept hugging its contents past the size it was given. The element now fills a box the resolution sizes, and a sized box stops sizing itself to its contents, as on the React host.
- **`divide-*` spaces items `gap + thickness` apart, as CSS does.** Separators are list items too, so the list's `Padding` landed on both sides of each one and items sat `2 * gap + thickness` apart. When an element is divided, the `gap-*` or `space-*` padding now moves into the separators: each is a transparent slot `thickness + gap` long with its line against the item before, the way Tailwind draws the border on the preceding item. Variant gaps such as `hover:gap-4` and gaps from a runtime class value follow, on both hosts. An element a divide can reach therefore takes its `UIListLayout` from the runtime host rather than as a static child, and `__VelaDivide.separatorSize` in `@rbxts/vela-runtime-core` returns the slot, beside new `separatorLineSize` and `absorbListGap`. A `Padding` written on your own `<uilistlayout>` is left as written.
- **A build fails when the runtime cannot load from `node_modules/@rbxts`.** Under pnpm's default linker, `vela-rbxts`'s host runtimes and `@rbxts/vela-runtime-core` never reach the project's own `node_modules/@rbxts`, the only folder Rojo maps into the place, so rbxtsc either failed on the transformer's type import or, with the host runtime added by hand, built a place that stopped on play with "Could not find module: vela-runtime-core". The `rbxtsc` plugin and `vela build` now walk the runtime a lowered file imports through that folder and fail with `runtime-not-installed`, naming each missing package and what needs it, and a runtime package installed at a different version than the compiler. The README tells pnpm projects to add `publicHoistPattern: ["*@rbxts*"]` to `pnpm-workspace.yaml`; pnpm 12 no longer reads `public-hoist-pattern` from `.npmrc`.
- **Vide elements built inside a function child no longer take the tree down.** A static element's rem-scaled offsets were emitted as one reactive prop each, and Vide refuses to open a prop effect inside the children effect a function child runs in, so `{() => items.map((item) => <frame className="w-6 h-6" />)}` threw "cannot create a new reactive scope inside another reactive scope" out of `Vide.root` and nothing mounted. The offsets now travel as one `__VelaRem.bind({ ... })` action child per instance, which opens its effect untracked: it still follows the viewport, and it is torn down with the function child that built it. A class followed by a spread keeps a binding per prop so the spread can still paint over it, and the element's own `action` is moved behind the binding so it runs after Vela's, as it does on the runtime host.
- **A transparency written on an element survives a fade that arrives at runtime.** `<frame BackgroundTransparency={0.2} />` inside a component rendered with `opacity-50` kept its 0.2 when the fade was composed at compile time and became 0.6 when the same fade crossed the component boundary through the opacity context, because the runtime could not tell a prop the author wrote from one Vela lowered. The compiler now wraps such an element in `__VelaOpacity.own(element, names)` and hands a runtime host its declared transparencies as `__velaOwn`, and both the React and the Vide consumer leave them standing. A literal `1` is left unwrapped, since a fade composes it to itself.
- **An `m-*` element's layout props tween on its margin box.** The margin box takes `Size`, `Position`, `AnchorPoint`, `LayoutOrder` and `ZIndex` from the element, but only the element itself was tweened, so `<frame className="m-4 w-20 transition-all hover:w-40" />` snapped to its new width. Both hosts now tween the box too, margin included, while the element fills it as it grows. A custom motion driver receives those tweens with `{ owner, marginBox: true }` as its fourth argument, and `@rbxts/vela-runtime-core` exports the `__VelaMotion.holdTweenGoal` and `__VelaMotion.changedGoal` the hosts are built on. A dynamic margin such as `hover:m-8` still changes the box's `UIPadding` instantly.
- **The language server runs on a maintained LSP crate.** It moved from `tower-lsp`, whose last release is 0.20, to the community fork `tower-lsp-server`. The fork stops reading input on the `exit` notification itself, so the server still exits while the client keeps stdin open, and the stdin wrapper that worked around that is gone.
- **A Vela failure fails the build.** A config that broke after the last incremental `rbxtsc` build went unreported until a file changed, since `rbxtsc` only re-transforms changed files, and a native compiler that could not load was downgraded by `rbxtsc` to a "transformer not found" warning, so the build passed with every `className` raw in the Luau. The plugin now checks the config on every build (`config-resolution-failed`) and loads the compiler itself (`compiler-unavailable`); a file with any error, a lowering that no longer parses included, is never emitted, and `vela build` removes its earlier output and exits 1.
- **The Vide host follows input mode, the color scheme and a late `LocalPlayer`.** It only watched the viewport, so `touch:`, `gamepad:` and `dark:` were decided at mount: plugging in a gamepad, setting the `VelaColorScheme` attribute, or a `LocalPlayer` that arrived after the first render left the styling where it started. It now re-resolves from the shared environment store on each change, as the React host does.
- **Sorting keeps the classes of one condition in the order they were written.** The sort ranked a variant chain in the order it was spelled, so `hover:md:bg-red-500 md:hover:bg-blue-500` came out as `md:hover:bg-blue-500 hover:md:bg-red-500`, and the class that won under hover on a wide screen changed. A chain is now compared as the set of conditions it names, broadest first, so classes that tie keep their source order and a chain still sorts after a shorter one it extends, which keeps `dark:hover:` behind `dark:` however either is spelled.
- A statically lowered `shadow-*` could unmount the whole UI. The emit wrote `<uishadow>`, roblox-ts turned that into `React.createElement("uishadow")`, and `@rbxts/react` passes a tag missing from its hardcoded class list straight to `Instance.new`, which is case sensitive. The runtime host already named the class correctly; the static path now does too, writing `<__VelaHelper.uishadow>` (and `<__VelaHelper.uiblur>`), whose value at runtime is the real class name while TypeScript still checks the props as the lowercase intrinsic. Vide resolves every lowercase tag through the engine's class list and keeps the plain tags.
- **An element's own `opacity-*` composes the same way on the runtime path.** A dynamic class value wrote the opacity straight into each transparency channel, so `bg-red-500/50 opacity-50` came out at `BackgroundTransparency` 0.5 instead of 0.75, `opacity-50 bg-red-500/50` overwrote the opacity with the color's alpha, and `ring-2 opacity-75` left the stroke fully opaque. The runtime now records the alpha and multiplies it into every channel and into the `UIStroke`, `UIShadow` and `UIBlur` the element draws once every token has resolved, as the static path always has.
- **Vide fades the children of a class value that turns on `opacity-*` later.** The host decided at mount whether to fade its children, so `className={() => (faded() ? "opacity-50" : "")}` faded the element itself but left its children opaque once `faded()` became true, and a variant rule's `opacity-*` did the same. It now follows any class value or rule that can bring an alpha, and leaves children it never faded alone.
- **A variant inside a plugin utility is watched on the runtime path.** A class value the runtime resolved spelled a plugin utility out before matching, but the scan for which attributes, groups and peers to watch read only the prefixes written on the class value, so a plugin `card` of `attr-[Selected=true]:ring-2` or `group-hover:bg-red-500` passed through `clsx(...)` never matched. The scan now reads the plugin body too.
- **A variant `opacity-*` fades everything the element draws while it applies.** `hover:opacity-50` was resolved without seeing the base, so it faded the background from opaque, dropped a color's own `/N` (`bg-red-500/50 hover:opacity-75` hovered at 0.25 rather than 0.625), left a ring, shadow or blur untouched, and multiplied with a base `opacity-*` instead of replacing it. A rule cannot know which other rules fire beside it, so `bg-red-500 hover:bg-blue-500/50 hover:opacity-50` or `hover:ring-2 hover:opacity-50` still came out wrong. The rule now carries only its alpha, an always-on rule carries what the base painted along with the drawing helpers, and the runtime multiplies the alpha in once every matching rule has applied, the way it does for a class value.
- **`opacity-*` no longer paints a background preflight neutralized.** With the default `preflight`, a frame with no `bg-*` is transparent, and `opacity-50`, `ring-2 opacity-50` or `ring-2 hover:opacity-50` turned it into a half-visible gray box, on the static path and the runtime one alike. An alpha now leaves such a background transparent. A background the author painted with a `BackgroundColor3` prop still fades on the static path.
- **A solid color takes back an earlier color's `/N` on the runtime path.** A dynamic `bg-red-500/50 bg-blue-500` stayed half transparent, and so did `text-*`, `image-*` and `scrollbar-*` colors, a gradient stop and a divide color written the same way, while the static path made them opaque. The runtime now resets the channel, and the static path states the reset as an explicit `0` so a rule overlaying it says the same thing.
- **Vide puts back a helper property a rule stops naming.** A `UIStroke`, `UIShadow` or `UIBlur` property that only a variant or a dynamic `opacity-*` named kept its last value on the Vide host after the class stopped applying, so `ring-2 hover:ring-blue-500` stayed blue after unhover. It now returns to the class default, as React's reconciler already did.
- **A variant font utility keeps the rest of the font.** `font-mono font-bold dark:italic` switched to a regular SourceSansPro italic in dark mode, because the rule carried a whole `FontFace`. It now carries the part it names and the runtime composes it over the base, which also means a string literal in a rule value or a plugin property map reaches the runtime without its quotes.
- **A variant `max-w-*` or `max-h-*` no longer collapses the other axis.** The runtime read the `math.huge` in `new Vector2(4, math.huge)` as 0, so `focus:max-w-1` capped the height at zero.
- **Negative margins resolve per side on the runtime path.** A dynamic `-mt-1 mt-4` kept both the padding and the shift, and `-mt-1 -mt-2` added the two up. Whichever token names a side last now decides it, as it does statically.
- **`divide-*` separators follow the children's `LayoutOrder`.** Every separator carried the default `LayoutOrder` of 0, so a list whose children set `LayoutOrder={i}` or `order-first`/`order-last` sorted the separators ahead of or among the items, and even without explicit orders the result depended on how Roblox breaks ties, which a React remount can reshuffle. Both hosts now rank every content child by its declared order, ties kept in source order, give the child ranked r `LayoutOrder` 2r and the separator after it 2r+1. React reads `LayoutOrder` off each child element and clones it with its rank (a Vela host child takes it on a prop applied after its own `order-*`), so a component child has to forward `LayoutOrder` to its root; separators are keyed. Vide reads the built instances, writes the ranks onto them and re-plans when a child's `LayoutOrder` changes, ranks each instance a reactive child returns on its own with a separator between them, as React does for an array child, and a reactive child that renders nothing hides the separator it would have left. The children's `LayoutOrder` is overwritten with the rank. The gap still applies on both sides of a separator, a documented approximation of CSS.
- **Divide separators fade with the subtree.** Under `opacity-*` on the divided element or an ancestor, the items faded and the separator lines stayed solid. The compiler composes the static alpha into the divide transparency, both hosts compose the alpha they resolve at render time on top, and a `canvasgroup` host leaves them to its `GroupTransparency`.
- **A divided list under a fade keeps its separators.** `<frame className="flex-col divide-y opacity-50">{props.children}</frame>` wrapped the value children in one opacity provider, which the React host saw as a single child and drew no separator for. The host now splits the provider into one per child at the same alpha.
- **`divide-x-0` and `divide-y-0` remove the separators.** They used to insert zero-size separators that drew nothing but still took the gap twice.
- **A zero margin stays on the static path.** `m-0`, `mb-0` and `-ml-0` emitted an all-zero margin and promoted the element to the runtime host, which wrapped it in a margin box with nothing to hold. The runtime already resolved such a margin to none.
- **A matching variant beats the base wherever it is written, and a wider breakpoint beats a narrower one.** A class value the runtime resolved applied its classes in source order, so `hover:bg-blue-500 bg-red-500` stayed red under the pointer, while the static path always laid a rule over the base. Both stacked breakpoints in source order, so `lg:p-8 md:p-4` came out at `p-4` on a wide screen. Both paths now rank what applies the way Tailwind's stylesheet does: the base first, then a state such as `hover:` or `group-hover:`, then breakpoints by their minimum width, then `portrait:`/`landscape:`, `dark:` and the input variants, which Tailwind registers after the breakpoints, so `dark:bg-blue-500 md:bg-red-500` is blue in dark mode on a wide screen. The class written last wins among equal ranks. A `max-*` range ranks as a breakpoint with no minimum, and two states such as `hover:` and `focus:` still meet in source order.
- **Margin, divide, text transform and decoration, transition and animation classes under a variant apply.** `hover:mt-4`, `md:divide-y`, `dark:underline` and `hover:duration-300` on a literal `className` were dropped without a diagnostic, because a runtime rule has no field for them, while the same class in a dynamic class value resolved. The compiler now forwards such a class to the runtime host as a class value of its own, together with the base classes of the same family so the runtime composes the family whole: `mt-2 hover:mt-4` hands over both, and the Vide host is told to build the margin box up front. Motion under a variant on a component element warns `motion-on-component` at the class, since no host can tween a component.
- **A variant `opacity-*` on a component element applies, and a hosted component keeps its alpha.** `<Card className="hover:opacity-50" />` was dropped because a rule had nowhere to carry an alpha, and `<Card className="opacity-50 hover:bg-red-500" />` lost its own `opacity-50` once a rule sent it to the runtime host, along with any alpha it inherited. The alpha now travels as a rule a variant replaces rather than multiplies, and the inherited alpha is handed to the host beside it.
- **A gap on a grid no longer adds a `UIListLayout` beside the `UIGridLayout`.** `grid gap-4` wrote the gap twice, as `CellPadding` and as the padding of a second layout that fought the grid for the children, and a variant gap such as `grid grid-cols-3 md:gap-4` wrote only the list layout. The gap now lands on the grid alone, and a variant gap, track or auto row recomposes `CellSize` and `CellPadding` from the grid the base declared, on the static and the runtime path alike. A gap `CellPadding` cannot carry, such as `gap-[10%]`, keeps the list padding on both paths, as it did before.
- **A variant position, translate or automatic size keeps the axis it never named.** `-inset-12 sm:left-1/2` reset the top offset, `-translate-x-1/2 hover:-translate-y-1/2` dropped the horizontal anchor, and `w-3/5 xl:w-fit` kept the fixed width under the automatic one, because the rule carried a whole `Position`, `AnchorPoint` or `AutomaticSize`. A rule now names one axis at a time and the runtime composes it over what the element already has, and whichever of a size and an automatic size names an axis last decides it on both paths. Once a rule moves the element, the base's translate goes to the runtime instead of being baked into `AnchorPoint` and `Position`, so `-translate-x-1/2 left-1/2 hover:translate-x-4` drops the half-width anchor on hover, and a negative margin goes with it as a forwarded class, so `-ml-2 hover:left-8` keeps the margin's shift on hover.

## [0.13.1] - 2026-09-20

### Fixed

- `border-[#3fa8c2]` and `border-red-500/50` rendered as a black stroke when the class reached the runtime path, which is where a dynamic `className` goes. The in-game parser still refused every bracketed border payload and every slash, rules the compiler had already dropped in favour of "a trailing `/N` is opacity, a bracket is a length or a color", so the color was discarded while `border-2` beside it still created the `UIStroke`, left at Roblox's default. The runtime gate reads the payload the way the compiler does now; directional and style forms such as `border-x` and `border-dashed` are still refused on both paths.

## [0.13.0] - 2026-09-06

### Added

- **State variants.** A `hover:` is a state Roblox already exposes. Everything a UI has states for of its own, a panel that is open, a row that is selected, a button that is disabled, a tier a player reached, was left with no way to say it, and vela was never going to guess at the list. `addVariant("open", { attribute: "State", equals: "open" })` registers a `open:` prefix that reads a Roblox attribute off the styled instance, and `attr-[State=open]:` reads one inline where a registration would be ceremony. The attribute is the state the rest of the game already reads: it replicates from the server, survives a rejoin, and shows up in Studio's property panel, so the styling layer holds no second copy of it. Both forms compose with every other variant, both are checked, completed, hovered and sorted like a built-in one, and neither sends the utility behind it to the in-game parser: `open:rounded-lg` lowers `rounded-lg` exactly as a bare `rounded-lg` would, and only the condition travels.
- **Responsive ranges.** `max-md:` is the exact complement of `md:`: the minimum is inclusive and the maximum is not, so at 768px `md:` applies and `max-md:` does not, and between them the two cover every viewport exactly once. They chain, so `md:max-lg:` addresses one bucket and nothing else.
- **Configurable breakpoints.** `theme.screens` is a theme axis like `colors` and `spacing`, with the same replace-vs-extend rules, so `tablet:` and `max-tablet:` are two lines of config. The default scale gains Tailwind's `xl` (1280) and `2xl` (1536): a Roblox viewport is measured in the same pixels a browser one is, and the buckets were already the right ones.
- **Presets.** `presets: [gameUiPreset()]` folds a design system's theme, plugins, utilities and variants into a project in one line. They resolve after the built-in defaults and before the config that names them, in the order written, as a fold over configuration *inputs* rather than a merge of finished configs, which is what keeps the existing rules coherent: a preset that replaces `theme.radius` is then extended by the project's `theme.extend.radius` rather than raced back to the defaults. A JSON config can inline a preset but cannot import one from a package; that is a `vela.config.ts` capability, and vela will not evaluate a module path to pretend otherwise.
- **Optional inlay hints.** The editor can show what each class lowers to (`p-4 → UIPadding.PaddingTop/Right/Bottom/Left`) after the class. Off by default, behind `velaRbxts.inlayHints.enabled`, and built from the compiler's own lowering read back through an editor API rather than from a second semantic model that could disagree with the emit.
- **Per-corner radius.** `rounded-l-lg`, `rounded-t-md` and `rounded-tr-[0.625rem]` write the individual `UICorner` radius properties, and square off the corners they do not name rather than leaving those at whatever Roblox defaults to, so `rounded-r-lg` on its own keeps the left side flat. A directional utility therefore beats the all-corner shorthand on the corners it names however the two are written: `rounded-l-lg rounded-md` and `rounded-md rounded-l-lg` both round the left pair to `lg` and the right pair to `md`, the way the two rules stack in Tailwind's own stylesheet. Theme keys and arbitrary values resolve on the static path and the runtime one alike, and a variant still repaints what the base left open, as `rounded-l-lg hover:rounded-md` does.

### Changed

- **Transitions reach the helper instances.** A corner radius, a stroke colour and a shadow live on `UICorner`, `UIStroke` and `UIShadow` rather than on the element, so `hover:rounded-xl` and `hover:border-blue-500` snapped while `hover:bg-blue-600` beside them tweened, and `transition-shadow` could not mean anything at all. The motion system moves the helpers the element already has, without duplicating anything for the sake of animating it, and `transition-shadow` joins the property groups. A custom motion driver is handed those tweens too, with a fourth argument naming which helper it is moving; the argument is additive, so a driver written against the three-argument shape keeps working.
- **A `vela.config.ts` is executed once per build rather than once per source file.** The host resolves a config per directory and reuses it, re-reading the file only when its contents changed. A config that throws is cached alongside one that resolves, so the error is reported once instead of once per file, and the next edit is what lifts it, which is what makes a watch process recoverable from a typo.
- Diagnostics about a prefix say what is wrong with the prefix. A `max-` in front of a name that is not a breakpoint is `unknown-breakpoint` and names the ones that are; an `attr-[…]` that does not parse is `malformed-attribute-variant` and names what is missing, rather than degrading into an unknown-utility error about a family called `attr`; a chain whose width bounds leave no viewport is `invalid-breakpoint-range` rather than a rule that is emitted and never fires.
- Sorting ranks the new variants in bands of their own: min-width ascending, max-width widest-first, orientation, input, state variants, interaction, colour scheme. The order the previous variants already sorted into is unchanged, because moving one past another changes which rule wins where both apply.

## [0.12.8] - 2026-08-21

### Fixed

- The published editor extension carried no vela config loader at all, so a project's `vela.config.ts` was never read and every key it defined was checked against the default theme. The loader is bundled into the extension, and the VSIX workflow built that bundle without building the loader package first; esbuild leaves a `require` it cannot resolve inside a try/catch where it stands and says nothing about it, so packaging went green over a bundle that had none. The loader is imported outright now, so a bundle built without it fails the build, the workflow builds it before the bundle, and packaging refuses a staged bundle that still resolves the loader at runtime.

## [0.12.7] - 2026-08-20

### Added

- `justify-stretch`, which sets `UIListLayout.HorizontalFlex` to `Enum.UIFlexAlignment.Fill`. The two flex properties Roblox exposes are named for absolute axes rather than for the main and cross one, and vela follows that: `justify-*` writes the horizontal axis, `items-*` and `content-*` the vertical. `items-stretch` reached `VerticalFlex` from the first, but nothing reached `HorizontalFlex`, so a column that wanted its children to fill the width had no class to say it with. Tailwind spells the same value `justify-stretch`, and that is what it lowers to here.

### Fixed

- A `vela.config.ts` the editor extension could not read left the session silently on the default theme, so every key the project defined was reported as an unknown one while the same file compiled without complaint. The failure was written to the extension's output channel and nowhere else. It is raised as a notification now, naming the file and the reason, with the log one click away. A config that loads on a later save clears it.

## [0.12.6] - 2026-08-19

### Fixed

- The pin under a `SurfaceGui` stopped at a fragment or a wrapper the caller built. A mount function that portals a `<surfacegui>` and fills it with what it was handed is the shape a project reaches for, and the offsets in those children were lowered in the caller's file, against the viewport; React puts them back after the fact by walking the elements the container is given, and that walk read the props of a host element and turned around at everything else. Children written as `<><frame className="p-4" /></>`, or under a wrapper of the caller's own, went on scaling with the screen. A fragment, a wrapper and a provider read no context of their own, so the walk carries through them now, and putting a literal back a second time finds nothing left to do, which is what the consumer at a component root was already relying on.
- A fade written around a component never reached what the caller handed it under a fragment. `opacity-*` composes onto the instances it finds by walking the same subtree the pin does, and it stops at a component and at a runtime host on purpose, since both read the alpha for themselves and applying it here as well would multiply it; a fragment reads nothing at all, though, and renders what it was given as it is, so the walk died there. It carries through a fragment now and stops where it always did.
- A component a file exports without naming it, `export default (props) => …`, heard about nothing that crossed the boundary: neither the pin a `SurfaceGui` opened over it nor the fade an `opacity-*` opened around it. The rule that finds a component root reads a name and a default export has none. It is read as a component root now, like the `export default function Panel()` beside it.

## [0.12.5] - 2026-08-15

### Changed

- A `SurfaceGui` keeps its literal pixels. Every offset a utility lowers has followed the viewport since rem landed, and a surface UI followed it too, though a `SurfaceGui` takes its pixel space from the part it is drawn on and its `PixelsPerStud`, and a `BillboardGui` sizes itself the same way: a panel written to fit its part grew and shrank with the player's screen, and closing the clamp to stop it took the scaling away from the screen UI as well. Both containers are pinned now, on the static path and on the runtime path alike. The container element in the JSX opens the pin: what is written under it lexically lowers to literal offsets with no binding at all, and a component rendered there, compiled in a file of its own against the viewport, reads the pin at its root and is handed back the offsets it was written with. `theme.rem.pinnedUnder` names the containers this applies to, and emptying it puts them back on the curve. A `SurfaceGui` the compiler never sees, one built in Luau or in another file that a React root is mounted into, is outside what this reaches; such a project still pins with `theme.rem: { min: 16, max: 16 }`.

## [0.12.4] - 2026-08-11

### Fixed

- The LSP server did not exit on the `exit` notification, only on the pipe closing behind it. tower-lsp ends its read loop on end of input and handles `exit` without ending it, so a client that sends the notification and holds stdin open, as one waiting for the process to go away does, was left with a server that never went. Editors mostly close the pipe right after and force-kill on a timeout, which is what kept this out of sight. The stdin the server reads reports end of input right behind the notification now, which is the path tower-lsp already unwinds cleanly.
- A margin side held two slots rather than one, so neither could overwrite the other. A negative top or left margin cannot be UIPadding and moves the element instead, and that move was accumulated beside the padding the side already had: `-ml-2 -ml-2` shifted by 16 rather than 8, `ml-4 -ml-2` applied a 16 padding *and* an 8 shift, `-ml-2 ml-4` emitted exactly the same thing so the order stopped mattering, and `-ml-0` had nothing to subtract and vanished, leaving the `ml-4` in front of it standing. Each side is one signed slot now: the last margin written to it wins, a side that ends up negative moves the element, and one that ends up positive pads it.
- Sorting rebuilt a class value by joining its tokens with single spaces, so a class list written across several lines came back as one long line. Only the tokens move now; the whitespace between them is carried over as it was written.
- `placeholder-transparent` was offered by completion on a `textbox` and then reported as unsupported the moment it was accepted, since Roblox has no placeholder transparency for it to lower to. It is no longer offered; every other family that takes the keyword keeps it.

## [0.12.3] - 2026-08-11

### Fixed

- A class an interpolation splices into was reported as broken. `` `w-[${width}]` `` reaches the editor as `w-[` and `]`, because a template is read one quasi at a time, and both halves were analyzed as whole classes: one unknown theme key and one unsupported family for a class the compiler hands the runtime untouched. A token an interpolation cuts into is left alone now, while a token that merely sits beside one, with a space between, is checked as before.
- Whitespace inside an arbitrary value split it into pieces, so `w-[calc(100% - 4px)]` was read as `w-[calc(100%`, `-` and `4px)]`. The editor and the compiler both reported three diagnostics about fragments where one about the value was owed. Whitespace stops separating classes between a `[` and the `]` that closes it, in the compiler and in the Luau the runtime splits with, so a static class and a deferred one tokenize alike. A bracket that never closes still splits, which keeps the classes written behind a typo applying, and sorting moves such a value as the one class it is.
- A config pushed by the editor never arrived. `vela-rbxts/setConfigs` is sent as a notification and was wired to a request handler, which tower-lsp drops without a word, so a theme key defined in `vela.config.ts` stayed unknown for the whole session.
- A file that opens with a BOM answered one character to the left. The source file drops the BOM before it hands out spans, while the offsets travel back over a document that still has it, which shifted every diagnostic, hover and color swatch off the class it was about.
- Completing inside a variant chain deleted the utility behind it: accepting an item over `hover:` in `hover:bg-slate-700` replaced the whole token. The segment under the cursor is the only part a completion may rewrite now, and the quick fix that offers completions for a diagnostic asks at the utility rather than at the token start.
- Sorting scrambled a class value whose bracket never closes. The pieces either side of an unclosed `[` are not independent classes, so moving them apart rewrote the source into something else; such a value is left alone.

## [0.12.2] - 2026-08-11

### Fixed

- A class value written as a function, `className={() => "..."}`, reached completion, hover, diagnostics, colors and sorting only while the file was failing to parse. The editor walks a `className` expression for the class strings written in it, and it had no arm for a function at all, so a deferred class value, which is how a Vide project writes one, was read by nothing but the lexical fallback a broken file falls back to. It follows what a function returns now, along with the shapes that were missing beside it: a template's interpolations, `as const` and `satisfies`, string concatenation, and an object's computed keys and spreads.
- The lexical fallback read a template's `${...}` as class text, so a file mid-edit reported `${flag` and `?` as unknown utilities. It reads one quasi at a time now and keeps only the strings written inside the interpolation, so what a half-typed file reports is what it would report once it parses.
- Sorting a class value that contains a template interpolation dropped the space either side of it: `` `bg-slate-700 p-4 ${flag}` `` came back as `` `p-4 bg-slate-700${flag}` ``, running the last token into whatever the interpolation resolves to. The value's leading and trailing whitespace is kept.

## [0.12.1] - 2026-08-10

### Fixed

- A Vide project that left the framework unnamed compiled against the React host, so its emit imported `@rbxts/vela-runtime`, which such a project has no reason to have installed. The tsconfig inference only ever ran for a project with no `vela.config.ts` at all: `defineConfig()` resolves an unset framework to the default before it returns, and that resolved value was read back as a choice the project had made. A config that names `framework` still wins over the tsconfig.

## [0.12.0] - 2026-08-10

### Added

- [Vide](https://centau.github.io/vide/) as a second target. A project installs `@rbxts/vide` instead of `@rbxts/react` and writes the same classes; `vela.config.ts` needs nothing, since a framework left unnamed is inferred from the nearest `tsconfig.json`, where a `jsxFactory` starting with `Vide.` selects Vide. That inference is what a Vide project already has to configure to compile its JSX at all, so `framework: "vide"` is there to name the choice explicitly and to win over the inference, not to switch the target on. `className` is added to `Vide.Attributes` the way it is to `React.Attributes`, the static lowering is byte-identical between the two targets, and the runtime path covers what React's does: variants, branches, rem, `opacity-*` across component boundaries, `divide-*`, margins, text transforms, and `transition-*`/`animate-*` on the same motion driver seam.
- An arbitrary value can name the rem unit directly, as in `w-[2rem]`.
- The `/N` color opacity modifier on every family that has a transparency channel. `border-{color}/N` lowers to `UIStroke.Transparency`, `divide-{color}/N` to the separator frames' `BackgroundTransparency`, and `from-*/N`, `via-*/N`, `to-*/N` to a `UIGradient.Transparency` sequence whose keypoints line up with the color stops, so one faded stop does not fade the others. `placeholder-*` is the one family left reporting `unsupported-opacity-modifier`, now with a message that says why: Roblox has no placeholder transparency.
- Compile-time resolution of a class value's known branches. `active ? "text-lg" : "text-sm"` used to travel whole to the runtime resolver, which parses only a subset of the utility set, so neither size ever reached the instance. The compiler resolves the branches through the same call the static path makes and hands the element the resolved props alongside the tests that decide them: the full utility set applies inside a branch, a bad utility written in one reports a diagnostic instead of vanishing, a variant inside a branch answers to both, and each test is evaluated once however many branches hang on it. It reads ternaries, `&&`, the literal behind `||`, arrays and object maps, and resolves a branch among the tokens written around it, so `["w-40", tall && "h-10"]` is one `Size` rather than a branch that overwrites the width.

### Changed

- **Breaking:** every pixel offset a utility lowers follows the viewport, by default. `p-4`, `w-40`, `rounded-lg`, `text-sm`, `border-2` and `top-2` are rem units now: one rem is 16px at a 1920×1020 viewport and scales from there along the viewport diagonal, capped at a 19:9 aspect ratio with a gentler falloff in portrait, then rounded and clamped into `[8, 64]`. No provider, hook or wrapper component is involved. Rendering therefore changes on any viewport other than the base resolution, and `TextSize` stops at 100, where Roblox itself stops honoring it, so `text-6xl` and up land on that ceiling. `theme.rem` is where the curve is retuned rather than where it is turned on: `base`, `min`, `max` and `baseResolution` are configurable and merge field by field. To keep literal-pixel behavior, close the clamp with `theme: { rem: { min: 16, max: 16 } }`; the compiler then drops the scaling from the emit entirely, lowering offsets to plain `UDim2`/`UDim` literals with no binding and no runtime import. Scale-valued utilities are untouched: `w-full`, `h-1/2` and `translate-x-1/2` stay fractions of the parent.
- The runtime ships as `@rbxts/vela-runtime` instead of being inlined into every module that needs it. A place with ten components that use a variant used to carry ten copies of the same 5,500 lines, each running its own camera subscription, rem binding and React context; it is one ModuleScript the whole place shares now. In the reference app `App.luau` went from 190,260 bytes to 27,912. Setup is unchanged: the package installs as a dependency of `vela-rbxts` and sits under the `@rbxts` scope every roblox-ts project already lists in `typeRoots` and every Rojo template already maps. The neutral half is `@rbxts/vela-runtime-core`, shipped as a ModuleScript with a child per namespace.
- The emit sends the theme a project changed rather than the whole palette. An untouched scale sends nothing, `theme.extend.colors.brand` sends `brand`, overriding one shade sends that color family so the shades around it survive the merge, and a top-level `theme.colors`, which replaces rather than extends, travels whole and is named in `theme.replaced`. A file that hands the runtime host no class value to parse carries its scales emptied entirely, roughly 400 bytes where the full tables are about 19KB.
- Both hosts ship with `vela-rbxts`, and each declares its UI library as an optional peer. A Vide project no longer installs `@rbxts/react` as a side effect of installing Vela, which matters because Rojo maps the whole `node_modules/@rbxts` directory into the place. The host a project does not emit for is one inert ModuleScript.
- Hover and completion docs read scaled offsets in rem, `` `1rem` (16px at the base viewport)``, across padding, gap, margin, sizes, positions, radius, text size, stroke and separator thickness, and scrollbar width. A config that pins rem keeps the old pixel wording, matching the emit it produces.
- Both hosts settle a viewport resize before resolving it, instead of re-reading the rem curve for every intermediate size a window drag reports.

### Fixed

- A branched `opacity-*` faded the element but never its subtree. The subtree wrapper is built from the tokens that always apply, and a branch is not among them, so a class value with a branch naming an opacity now goes back to the runtime host, which resolves it and hands the subtree one alpha. A `canvasgroup` stays on the rule path, and an opacity written beside a branch stays as static as it ever was.
- A base helper a variant rule overwrote, `p-4 hover:p-8`, was emitted as a child *and* resolved by the host, leaving two `UIPadding` under one instance.
- `md:min-w-16`, `md:bg-gradient-to-r` and `md:font-bold` tore down the tree. A rule carries its prop values as source text for the runtime to parse back, and the parser did not know `Vector2`, `ColorSequence`, `Font` or `NumberSequence`, so it assigned a string to a Roblox property.

## [0.11.1] - 2026-08-08

### Fixed

- The inlined runtime failed to typecheck in a project that sets `noUncheckedIndexedAccess`. A `className` carrying a state variant pulls the runtime host into the emit, where it is checked under the consumer's compiler options rather than this repo's, and its indexed reads of parsed call arguments, enum segments and gradient stops were typed as if an index could never miss.

## [0.11.0] - 2026-08-08

### Added

- `vela` CLI, a second way to run Vela for projects that cannot register a transform plugin. `vela build` mirrors the source tree into `.vela/src`, transforming the `.tsx` files that use `className` and copying everything else through byte for byte, and `vela watch` re-transforms on change; `rbxtsc` then compiles the generated tree with no plugin registered. Both paths call the same compiler and emit identical Luau, and nothing about `vela.config.ts`, the declaration file, or the classes you write changes. Diagnostics stay anchored to the real sources, the command exits non-zero when a file fails to compile, an identical output is never rewritten so `rbxtsc -w` does not rebuild an untouched tree, and pruning is driven by a manifest of what the CLI emitted rather than by whatever else sits in the output directory.

### Changed

- `vela.config.ts` is transpiled and evaluated once per build instead of once per source file, on the CLI and the transformer path alike.

## [0.10.0] - 2026-08-04

### Changed

- `opacity-*` crosses a component boundary in both directions. A fade written around a component reached nothing it rendered, and a fade written on one lowered to `BackgroundTransparency` and no further, since the host tag is unknown there. The alpha now travels as React context: the transformer wraps what it cannot reach in a provider that renders no instance, so the tree keeps its shape and its names, and each component root is routed through a consumer that composes the alpha onto every channel the instances below it paint. The fade still ends at a `canvasgroup`, whose `GroupTransparency` composites the subtree in one pass. A class value that settles at render time is left whole to the runtime host, so an `opacity-*` inside a recipe reaches the subtree it is written over.

### Removed

- `opacity-unreachable-child`, along with the limitation it described.

### Fixed

- A motion driver's `transition` and `animate` are called as methods. A driver written the documented way carries an implicit `self`, but the runtime read the method off the table and called it detached, so every argument landed one place to the left and the driver died at mount, taking the tree down with it.

## [0.9.0] - 2026-08-04

### Added

- `opacity-unreachable-child`, reported for the two shapes the compile-time fade cannot reach — `{props.children}` and a component child whose instances are created elsewhere — instead of silently fading half a subtree.

### Changed

- `opacity-*` composes into everything the element draws and into the subtree written under it. It previously lowered to `BackgroundTransparency` alone, which is invisible on a label whose background is already transparent, and reached nothing below its own instance. It now fades every channel the host paints — `TextTransparency` on the text hosts, `ImageTransparency` on the image hosts, the `Transparency` of a `UIStroke` or `UIShadow` drawn alongside — and hands each element below it the running product, since Roblox has no inherited transparency. A `canvasgroup` on the way down ends the walk.
- `opacity-*` is no longer order-dependent. `bg-slate-700` clears `BackgroundTransparency`, so `opacity-50 bg-slate-700` came out opaque while the reverse order did not. The utility is now held until the whole class list is read and multiplied over whatever alpha the colors settled on, the way Tailwind reads it.

## [0.8.0] - 2026-08-03

### Added

- Every remaining utility family resolves on the runtime class path: positioning, the box constraints, the grid, gradients, `ring-*`/`outline-*`, shadows, `z-*`, `rotate-*`, `scale-*`, `opacity-*`, `order-*`, `leading-*`, `self-*`, `content-*`, `object-*`, `pointer-events-*`, `space-*`, `whitespace-*`, the ScrollingFrame family, and the rest of the text families. Color opacity modifiers and arbitrary values resolve there too, and `theme.fontFamily` now reaches the runtime theme. A utility the host element cannot carry is dropped rather than applied, since writing `TextColor3` onto a `Frame` is a hard Roblox error.

### Fixed

- The runtime host names `UIShadow` by its real class. `@rbxts/react` passes an unknown tag straight to `Instance.new`, which is case sensitive, so the lowercase form failed to instantiate and unwound the whole tree.

## [0.7.0] - 2026-08-03

### Added

- `setMotionDriver` in the plugin API. `transition` and `animate-*` no longer have to run on `TweenService`: a plugin names a module, the inlined runtime host imports it, and its `transition`/`animate` methods take over. Each method is taken over on its own, so a driver that only springs transitions keeps the built-in `animate-*` presets. Since the helper is inlined into every transformed module, the specifier must resolve from any of them — a package name or a `baseUrl`-relative path, and a relative one is rejected with a config error rather than resolving differently per file.

- `plugins` config option and the `plugin()` helper. A plugin registers class names of its own through `addUtilities`, either as a list of existing utilities (`btn: "bg-blue-600 rounded-lg px-4"`) or as Roblox properties written directly (`panel: { BorderSizePixel: "0" }`), and reads the resolved theme through `theme()`. Plugin functions run while the config resolves, so what the compiler, the runtime helper, and the LSP receive is the same plain utility table — which also lets `vela.config.json` state it as `plugins.utilities`. Registered utilities take variants, resolve on both the static and the runtime path, may reach through each other, and sort ahead of the plain utilities so a `bg-*` written beside one still wins.

- Class sorting: the compiler exposes a canonical class order as per-`className` edits, and the LSP offers it as the `source.sortVelaClasses` source action, which editors can also run on save. Utilities that can write the same Roblox property sort as one group, so the sort never changes which one wins.
- Arbitrary length values: `[16px]`, `[16]`, `[50%]` and their negatives resolve on the spacing, size, position, radius, and scrollbar-width families, on both the static and the runtime path. `text-[13px]`, `leading-[1.6]`, `rotate-[17deg]`, `z-[15]`, and `border-[3px]`/`ring-[3px]`/`outline-[3px]` read the number in their own unit. A payload the family cannot read still reports `unsupported-arbitrary-value`.
- `dark:` runtime variant. Roblox exposes no color scheme to a running game, so the app owns it: `dark:` matches when `Players.LocalPlayer` carries `VelaColorScheme = "dark"`, and the runtime host follows the attribute's change signal. An instance attribute is the only shared source that works here, since the runtime helper is inlined per module.
- `active:` and `focus:` runtime variants. `active:` follows mouse and touch presses through `InputBegan`/`InputEnded` (clearing on `MouseLeave`, since a release outside the element never reaches it), and `focus:` follows `Focused`/`FocusLost` on a `textbox` and `SelectionGained`/`SelectionLost` on every other element. Both compose with the consumer's own `Event` handlers and tween when the element carries `transition`.
- `theme.fontFamily` and the `font-{family}` utilities. The scale ships `sans` (Source Sans Pro), `serif` (Merriweather), and `mono` (Roboto Mono), and takes any Roblox font family asset — including uploaded `rbxassetid://` fonts. `font-*` resolves the fixed weight names first and reads anything else as a font family key, so family, weight, and style merge into a single `FontFace`.
- Scrolling frame utilities: `scroll-{x,y,xy}` and `scroll-none` map to `ScrollingDirection`/`ScrollingEnabled`, `scrollbar-w-*` and `scrollbar-none` set `ScrollBarThickness` from the spacing scale, `scrollbar-{color}` (opacity modifier included) sets `ScrollBarImageColor3`, and `canvas-{auto,auto-x,auto-y,none}` sets `AutomaticCanvasSize`. All four families are restricted to `scrollingframe`, with completions, hover, and document colors wired up.

### Changed

- `transition-colors`, `transition-opacity`, and `transition-transform` now narrow the tween to their property group instead of all being treated as `transition-all`. `transition-shadow` reports `unsupported-transition-value`: a shadow lives on a helper instance, which applies instantly, so there is nothing for the filter to hold back.
- `z-[N]` and `border-[Npx]` resolve instead of reporting `unsupported-arbitrary-z-index`/`unsupported-arbitrary-value`. A fractional `z-[1.5]` keeps the diagnostic, since `ZIndex` is an integer.
- `opacity-*` on a `canvasgroup` now lowers to `GroupTransparency` instead of `BackgroundTransparency`, so it fades the whole subtree the way CSS `opacity` does. Every other host keeps the previous behavior.
- Tailwind's own `scroll-*` utilities (`scroll-smooth`, `scroll-m-*`) report `unsupported-scroll-value` with the supported values instead of `no-roblox-equivalent`, now that the family carries a Roblox meaning.

### Fixed

- Layout, sizing, and text utilities resolve on the runtime class path. The runtime host implemented a strict subset of the static lowering, so a component whose `className` comes from a helper — the normal shape for a variant recipe — silently lost `flex-row`, `items-*`, `justify-*`, `w-fit`/`h-auto`/`size-fit`, `text-<size>`, `text-left|center|right`, and `font-<weight>`.

## [0.6.0] - 2026-08-03

### Added

- `auto-rows-*` and `auto-cols-*` name the grid's cross axis from the spacing scale. A column count says nothing about row height, and without one the extent stays at the 100px the engine already used.

### Changed

- `grid-cols-*` and `grid-rows-*` give each cell a real `CellSize`. `UIGridLayout` stamps `CellSize` onto every child and ignores whatever `Size` the child set for itself, and the grid utilities only ever set `FillDirection`, `FillDirectionMaxCells`, and `CellPadding` — so every cell fell back to Roblox's 100x100 default and a `grid-cols-2` of 430px cards collapsed to 100px squares. `grid-cols-N` now divides the axis it fills into N tracks and hands each cell back its share of the gap. Existing grids keep their row extent and gain correct track widths.

### Fixed

- `w-*` and `h-*` stop erasing each other on the runtime path. `Size` holds both axes, so a bundle naming one of them stated a whole `UDim2` and zeroed out the other — `md:w-32 md:h-32` kept only the height. Each axis is now carried on its own and composed over whatever `Size` the element already has.
- `text-{color}` resolves on the runtime path. The runtime resolver had no `text-` branch at all, so every text color in a dynamic class value was dropped without a diagnostic and the label kept Roblox's near-black default, while the identical class string lowered correctly when it happened to be static.

## [0.5.2] - 2026-08-03

No user-facing changes. Released to split the VS Code extension out of the npm release workflow.

## [0.5.1] - 2026-08-02

### Changed

- The VS Code extension's marketplace icon is redrawn as a sail.

## [0.5.0] - 2026-08-02

### Changed

- **Breaking for existing UI:** Roblox host defaults are neutralized. Roblox paints every `GuiObject` as an opaque gray box with a 1px border, and a framework that only ever adds properties can never take that back, so `bg-transparent` had to be repeated on almost every element. Any host element carrying a `className` now starts from `BackgroundTransparency = 1` and `BorderSizePixel = 0` unless a `bg-*` utility or an explicitly declared prop says otherwise; a background painted by a variant or a dynamic class value reopens it. Elements without a `className`, and components, are untouched. Anywhere the default gray background was load-bearing, the element now renders invisible — add the `bg-*` it was relying on, or set `preflight: false` in `vela.config.ts` to keep the old behavior.

### Fixed

- `order-*` is no longer ignored inside a flex container. The lowered `UIListLayout` left `SortOrder` at its engine default of `Name`, so children sorted alphabetically by instance name while `UIGridLayout` already sorted by `LayoutOrder`.
- The inlined runtime host no longer emits the deprecated `table.getn`. Luau's script analysis flagged every reference to it in consumer places; the array-length helper uses `size()` now, which roblox-ts lowers to the `#` operator.

## [0.4.2] - 2026-08-02

### Added

- `@vela-rbxts/compiler-wasm`, a WebAssembly build of the compiler, carried through the release pipeline.
- `apps/playground`, an in-Studio utility playground for exercising the compiler against real Roblox rendering.

### Fixed

- A `ref` on a runtime-hosted element is typed from its host tag instead of `unknown`.
- `transition` snaps no longer: a tween whose base value came from the static lowering now starts from that value rather than the element's default.
- A variant colour no longer leaves the base opacity modifier in place.

### Security

- The VS Code extension moved to `vscode-languageclient` 10, clearing GHSA-mh99-v99m-4gvg.

## [0.4.1] - 2026-07-31

### Added

- Malformed `configJson` passed to the compiler API reports an `invalid-config-json` error diagnostic instead of silently compiling against the default theme.

### Changed

- TSX parse failures report a human-readable message with line and column and anchor a source range, instead of dumping the parser's internal debug format.
- An invalid `vela.config.ts`/`vela.config.json` export names the failing theme key (for example `theme.extend.colors.surface.55`) instead of only saying a TailwindConfig-compatible object was expected.
- The `@vela-rbxts/compiler` root package no longer bundles the publish machine's native binary; platform binaries come only from the per-platform optional dependencies, shrinking the install for everyone else.

### Fixed

- Responsive and orientation variants (`sm:`, `md:`, `lg:`, `portrait:`, `landscape:`) never matched at runtime. The runtime host read `Camera.ViewportSize` only when it mounted, and Roblox reports `1x1` until the first frame renders, so every width rule was evaluated against a width of `1` and orientation was always `landscape`. The host now follows the camera's `ViewportSize` signal, so breakpoints resolve correctly and also react to window resizes.
- `divide-x-*`/`divide-y-*` drew an extra separator above the first child whenever the same element carried a utility that lowers a helper — `flex-col`, `gap-*`, `rounded-*`, `border`, `p-*` and friends. Those `UI*` elements arrive in the same children list and were counted as content; separators now sit between content children only.

## [0.4.0] - 2026-07-31

### Added

- `hover:` runtime variant: the runtime host tracks per-element MouseEnter/MouseLeave state (composing with any Event handlers the consumer declared, and attaching listeners only when a hover rule actually exists), so `hover:bg-*` works on its own and tweens when combined with `transition`.
- Arbitrary hex colors: `[#rgb]` and `[#rrggbb]` payloads resolve to `Color3.fromRGB` in every color family (`bg-[#ff0000]`, `border-[#0f0]`, `divide-[#333]`, ...). Non-hex arbitrary values keep the `unsupported-arbitrary-value` diagnostic.
- Color opacity modifiers: a trailing `/N` (0-100) lowers to the family's transparency prop — `bg-blue-600/50` sets `BackgroundTransparency = 0.5`, `ring-rose-500/25` sets the UIStroke `Transparency`. Families without a transparency prop (gradient stops, divide) keep the `unsupported-opacity-modifier` diagnostic.

### Changed

- `border-[N]`-style numeric arbitraries now report `unsupported-arbitrary-value` instead of `unsupported-border-value`, since bracket payloads are parsed as arbitrary colors first.

## [0.3.0] - 2026-07-31

### Added

- Layout utilities: `right-*`/`bottom-*` position from the far edges (`-right-*`/`-bottom-*` included), `content-*` and `self-*` map to UIListLayout cross-axis packing and UIFlexItem line alignment, `order-*` sets `LayoutOrder` (`first`/`last`/`none` and negatives included), `grid`/`grid-cols-N`/`grid-rows-N` create a UIGridLayout whose `CellPadding` picks up `gap-*`, `basis-*` sizes the main (row) axis, and `mx-auto`/`my-auto` center an axis through `AnchorPoint` without any wrapper.
- Transform utilities: `translate-x/y-*` lower fractions to `AnchorPoint` — so the `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` centering idiom works verbatim — and pixel values to `Position` offsets.
- `space-x/y-*` set `UIListLayout.Padding` together with the matching `FillDirection`, `pointer-events-none/auto` map to `Interactable`, `object-cover/contain/fill` map to `ScaleType` on image hosts (plus a Roblox-only `object-tile`), `overscroll-*` maps to `ElasticBehavior` on scrolling frames, and `ring`/`outline` merge into the same UIStroke `border-*` uses with `ApplyStrokeMode = Border`.
- Typography utilities: `leading-*` sets `LineHeight`, `italic`/`not-italic` merge with `font-*` weights into a single `FontFace`, `whitespace-normal/nowrap` alias `TextWrapped`, `uppercase`/`lowercase`/`capitalize` transform `Text` (at compile time for literals, through the runtime host otherwise), and `underline`/`line-through` enable `RichText` around escaped text — backing off with a diagnostic when the element manages `RichText` itself.
- Motion: `transition`/`duration-*`/`ease-*`/`delay-*` tween runtime style changes with TweenService instead of snapping, and `animate-spin/pulse/bounce` run preset loops. Both work from dynamic `className` values too, and warn (`motion-on-component`) on component elements, which cannot expose an instance to tween.
- Structural utilities: `m/mx/my/mt/mr/mb/ml-*` render a CSS-style margin box — a transparent wrapper padded by the margins, with layout props routed onto it — so margins participate in lists and absolute positioning; negative `-mt-*`/`-ml-*` pull through `Position`. `divide-x/y[-N]` and `divide-{color}` insert separator frames between an element's children.
- The runtime host renders through `forwardRef`, composing consumer refs with its own, so `asChild`-style slotting libraries (verified against lattice-ui) and plain refs reach the rendered instance.
- The default radius scale ships a `DEFAULT` key, so a bare `rounded` resolves to 4px like Tailwind.
- Editor: `className` values are collected from expression containers (arrays, objects, template literals, `cn()`-style calls) with a lexical fallback for files that fail to parse, completions are fuzzy-ranked server-side with theme color swatches and variant-aware replacement ranges, and the LSP returns incomplete lists so that ranking stays in charge on every keystroke.
- Diagnostics distinguish unknown variant prefixes, valid Tailwind families with no Roblox equivalent, and per-value errors for every new family instead of collapsing into one generic family error.
- `apps/lsp-harness`: a maintainer harness that drives the release LSP binary over stdio and asserts diagnostics anchoring, completions, hover, and document colors.

### Fixed

- `top-*` utilities were parsed as `to-*` gradient stops because of prefix ordering, so they never set `Position.Y`.
- Mixed scale/offset `Size`/`Position` values emitted `UDim2.new(...)`, which does not exist in roblox-ts, failing the consumer's typecheck; they now emit `new UDim2(...)` and the runtime host parses both spellings.
- Consumer refs on runtime-host elements were silently dropped, since the host was a plain function component.

## [0.2.1] - 2026-07-20

### Added

- The project config may be written as `vela.config.json`, holding the same object `defineConfig()` takes. `vela.config.ts` still wins when both sit in the same directory. A roblox-ts `tsconfig.json` includes only `src`, so a root-level `vela.config.ts` makes typed ESLint setups report the file as not included in the project; the JSON form avoids that entirely. `vela-rbxts/schema.json` ships alongside it for editor completion through `$schema`.
- Color palettes may carry a `DEFAULT` key, which is what a bare family name resolves to, following the convention Tailwind uses for nested color objects. Every built-in palette now ships `DEFAULT` mirroring its `500`, so `bg-slate` works with no configuration. A palette without `DEFAULT` still reports `color-missing-shade` when referenced bare, and `DEFAULT` is reachable only through the bare name — `bg-slate-DEFAULT` is not a class.

### Changed

- The packaged VS Code extension is versioned by date as `YYYY.M.DDNNN` — a UTC date plus a same-day build counter — rather than by the release tag. `packages/vscode-extension/package.json` keeps its semver version and still moves in lockstep with every other package. Set `VSIX_BUILD_NUMBER` to release more than once on a single date.
- Package versions are bumped in lockstep by changesets, and a release tag is cut automatically once the release pull request lands.

### Fixed

- The setup guide named the declaration file `src/vela-rbxts.d.ts`, which collides with the package name under the `baseUrl` of `src` every roblox-ts project sets. The `import "vela-rbxts"` inside it resolved back to the file itself, so the augmentation never loaded and `className` was missing with no diagnostic. The guide now uses `src/vela-env.d.ts`.
- Repaired the compiler unit tests, which stopped compiling when `is_utility_allowed_on_host` began taking an `Option<&str>` for component support. `cargo test` had been failing while CI stayed green, because CI builds the napi binding rather than the test target.
- The VS Code extension declared `@vela-rbxts/rbxtsc-host` as a runtime dependency but never shipped it, so `vsce package` failed on the missing package and the config loader could not have resolved even if packaging had succeeded. The loader is now bundled into the extension.
- The config loader resolved `typescript` from its own install directory, which holds no TypeScript once the extension bundles it, so every `vela.config.ts` silently fell back to the built-in defaults in the editor. It now resolves from the config file's own project.
- Security overrides no longer cross major versions. The blanket ranges substituted incompatible APIs: `brace-expansion` 5 is ESM-only and broke `minimatch` 5 inside `vscode-languageclient`, `linkify-it` 6 broke the README renderer in `vsce`, and `js-yaml` 5 broke `read-yaml-file`, which made `changeset version` fail outright.

## [0.2.0] - 2026-07-20

First release published as a public project, with release tooling, documentation, and package metadata prepared for external consumers.

### Added

- `className` on React components is now lowered: static utilities resolve at compile time and are passed to the component as props, with helper elements added as its first children. Dynamic expressions and runtime-aware variants are wrapped in the inline runtime helper, which renders the component with the resolved props. The component must forward what it does not consume to a Roblox host element.
- Editor support for `className` on components: completions, hover, document colors, and diagnostics work there too. Utilities restricted to specific host elements, such as `text-*`, stay available because a component's host element is not known.
- A diagnostic for `className` on Roblox host elements that are not supported, instead of passing an unknown property through to the runtime.
- Flexbox utilities: `flex`, `flex-row`, `flex-col`, `justify-{start,center,end}`, `items-{start,center,end}`, plus flex distribution and flex-item utilities, lowered to `UIListLayout`.
- Aspect ratio utilities `aspect-square`, `aspect-video`, and arbitrary `aspect-[W/H]`, lowered to `UIAspectRatioConstraint`.
- Transform utilities `rotate-*` / `-rotate-*` mapped to Roblox `Rotation`.
- Effect utility `opacity-*` mapped to `BackgroundTransparency`.
- Scale (`UIScale`) and stroke line-join utilities.
- Class token spans exposed from the compiler for editor tooling.
- LSP: project config loading, quick-fix code actions, document highlight, and incremental text synchronization.
- Packaged LICENSE, README, and full npm metadata (description, keywords, homepage, bugs) for every published package.

### Changed

- The transformer now inlines its runtime helper into transformed modules instead of requiring an external runtime package. No Vela-specific Rojo mapping or runtime dependency is needed.
- Internal `tailwind`-prefixed identifiers and exports renamed to `vela`; `vela-rbxts` keeps backward-compatible transformer export aliases.
- Release pipeline verifies packed tarballs against a temporary external roblox-ts consumer before publishing.
- Bumped `@rbxts/types` to `^1.0.935`.
- Deduplicated compiler completion candidates for faster editor responses.

### Removed

- The standalone runtime package, superseded by the inline runtime helper.
- Deprecated `createRbxtsTailwindProgramTransformer` export from `@vela-rbxts/rbxtsc-host`.

### Fixed

- Runtime-aware `className` on an element with children no longer fails to compile. Swapping in the runtime helper renamed only the opening tag, so the mismatched closing tag produced TS17002.
- Compile-time diagnostics are anchored to the offending token in the `className` literal. They previously used the first textual match in the file, so a comment or unrelated string containing the same text stole the position.
- The `tsconfig.json` example in the README was missing `incremental`, which made `tsBuildInfoFile` fail with TS5069 on a fresh setup.
- `@vela-rbxts/rbxtsc-host` strips `vela-rbxts` imports when loading `vela.config.ts`.
- String polyfills and locally aliased `table`/`string` methods in the emitted runtime helper.
- LSP no longer shows a console window when spawning the server on Windows.
- VSIX marketplace version normalization for explicit `VSIX_VERSION` overrides.

### Security

- Updated development dependencies to clear 24 advisories reported against the workspace, covering `turbo`, `esbuild`, `vitest`, `@vscode/vsce`, and transitive packages pinned through pnpm overrides. None of these were runtime dependencies of the published packages.

## [0.1.0] - 2026-04-24

Initial npm publish of the `vela-rbxts` toolchain.

### Added

- `vela-rbxts`: main package adding `className?: ClassValue` to `React.Attributes`, the `defineConfig()` helper, and the `./transformer` entry for roblox-ts.
- `@vela-rbxts/compiler`: native Rust/N-API compiler that resolves, validates, and lowers utility classes, with editor APIs for completions, hover, diagnostics, and document colors.
- `@vela-rbxts/rbxtsc-host`: host adapter that resolves `vela.config.ts`, filters eligible files, and bridges compiler diagnostics into `rbxtsc`.
- `@vela-rbxts/config`, `@vela-rbxts/core`, `@vela-rbxts/ir`, `@vela-rbxts/types`: config schema and defaults, host element contracts, shared IR, and public types.
- Standalone Rust LSP server and the `vela-rbxts-lsp` VS Code extension.
- Supported utilities: colors (`bg-*`, `text-*`, `image-*`, `placeholder-*`), `border*`, `rounded-*`, `z-*`, padding and `gap-*`, sizing (`w-*`, `h-*`, `size-*`).
- Runtime-aware variants: `sm:`, `md:`, `lg:`, `portrait:`, `landscape:`, `touch:`, `mouse:`, `gamepad:`.
- Artifact-first release pipeline (`plan` → `build` → `pack` → `verify` → `publish`) with a cross-platform CI matrix.

[Unreleased]: https://github.com/astra-void/vela-rbxts/compare/v0.15.0...HEAD
[0.15.0]: https://github.com/astra-void/vela-rbxts/compare/v0.14.0...v0.15.0
[0.14.0]: https://github.com/astra-void/vela-rbxts/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/astra-void/vela-rbxts/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/astra-void/vela-rbxts/compare/v0.12.8...v0.13.0
[0.12.8]: https://github.com/astra-void/vela-rbxts/compare/v0.12.7...v0.12.8
[0.12.7]: https://github.com/astra-void/vela-rbxts/compare/v0.12.6...v0.12.7
[0.12.6]: https://github.com/astra-void/vela-rbxts/compare/v0.12.5...v0.12.6
[0.12.5]: https://github.com/astra-void/vela-rbxts/compare/v0.12.4...v0.12.5
[0.12.4]: https://github.com/astra-void/vela-rbxts/compare/v0.12.3...v0.12.4
[0.12.3]: https://github.com/astra-void/vela-rbxts/compare/v0.12.2...v0.12.3
[0.12.2]: https://github.com/astra-void/vela-rbxts/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/astra-void/vela-rbxts/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/astra-void/vela-rbxts/compare/v0.11.1...v0.12.0
[0.11.1]: https://github.com/astra-void/vela-rbxts/compare/v0.11.0...v0.11.1
[0.11.0]: https://github.com/astra-void/vela-rbxts/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/astra-void/vela-rbxts/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/astra-void/vela-rbxts/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/astra-void/vela-rbxts/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/astra-void/vela-rbxts/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/astra-void/vela-rbxts/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/astra-void/vela-rbxts/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/astra-void/vela-rbxts/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/astra-void/vela-rbxts/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/astra-void/vela-rbxts/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/astra-void/vela-rbxts/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/astra-void/vela-rbxts/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/astra-void/vela-rbxts/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/astra-void/vela-rbxts/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/astra-void/vela-rbxts/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/vela-rbxts/v/0.1.0
