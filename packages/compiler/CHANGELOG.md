# @vela-rbxts/compiler

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

### Patch Changes

- e9805ff: Let the pin under a `SurfaceGui` reach a subtree the caller built.

  A mount function that portals a `<surfacegui>` and fills it with what it was
  handed is the shape a project reaches for, and the offsets in those children
  were lowered in the caller's file, against the viewport. React puts them back
  after the fact by walking the elements the container is given, and that walk
  read the props of a host element and turned around at everything else: children
  written as `<><frame className="p-4" /></>`, or under a wrapper of the caller's
  own, went on scaling with the screen. A fragment, a wrapper and a provider read
  no context of their own, so the walk carries through them now. Putting a literal
  back twice finds nothing left to do, which is what the consumer at a component
  root was already relying on.

  The fade an `opacity-*` opens has the same reach now. It stops at a component and
  at a runtime host on purpose, since both read the alpha for themselves and a
  second application would multiply it, but a fragment reads nothing and renders
  what it was given as it is, so what a caller built under one went unfaded. It
  carries through a fragment now and stops where it always did.

  A component a file exports without naming, `export default (props) => …`, is
  read as a component root too. The rule that finds one reads a name and a default
  export has none, so such a component heard about neither the pin a `SurfaceGui`
  opened over it nor the fade an `opacity-*` opened around it.

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

- de7e6ea: Give a margin side one slot, so the last class written to it is the one that
  lands.

  A negative top or left margin cannot be UIPadding, so it moves the element
  instead, and that move was kept in an accumulator of its own beside the padding
  each side already had. Two slots per side meant neither could overwrite the
  other: `-ml-2 -ml-2` shifted by 16 rather than 8, `ml-4 -ml-2` applied a 16
  padding _and_ an 8 shift, and `-ml-2 ml-4` emitted exactly the same thing, so
  the order the two were written in stopped mattering. `-ml-0` had nothing to
  subtract and vanished, leaving an `ml-4` in front of it standing.

  Each side is one signed slot now. The last margin written to it wins, a side
  that ends up negative moves the element, and one that ends up positive pads it.
  A negative right or bottom margin still reports `unsupported-negative-margin`:
  it would have to pull the next sibling closer, which nothing here can reach.

- de7e6ea: Leave a class value's whitespace where its author put it when sorting, and stop
  offering a placeholder color the compiler turns down.

  Sorting rebuilt the value by joining the tokens with single spaces, so a class
  list written across several lines came back as one long line. The tokens are the
  only thing the sort is asked to move, so the whitespace between them is carried
  over as it was written.

  `placeholder-transparent` was offered by completion on a `textbox` and then
  reported as unsupported the moment it was accepted, because Roblox has no
  placeholder transparency for it to lower to. Every other family that takes the
  keyword keeps it.

## 0.12.3

### Patch Changes

- 3c2d451: Fix four ways the editor answered for a document it was reading wrong.

  A config pushed by the editor never arrived. `vela-rbxts/setConfigs` is sent as
  a notification, and it was wired to a request handler, which tower-lsp drops
  without a word, so a theme key defined in `vela.config.ts` stayed unknown for
  the whole session. It is a notification handler now.

  A file that opens with a BOM answered off by one. The source file drops the BOM
  before it hands out spans, while the offsets travel back over a document that
  still has it, so every diagnostic, hover and color swatch sat one character to
  the left of the class it was about.

  Completing inside a variant chain deleted the utility behind it. `hover:` typed
  over in `hover:bg-slate-700` replaced the whole token, so accepting an item left
  the utility gone. The segment under the cursor is the only part a completion may
  rewrite now, and the quick fix that offers completions for a diagnostic asks at
  the utility rather than at the token start.

  Sorting scrambled a class value whose bracket never closes. The pieces either
  side of an unclosed `[` are not independent classes, and moving them apart
  rewrote the source into something else; such a value is left alone.

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

### Patch Changes

- 0e83027: Read every shape a class value is written in.

  `className={() => "..."}` reached the editor features only while the file was
  failing to parse, where the lexical fallback happened to find the string. The
  walker that reads a `className` expression had no arm for a function, so a
  deferred class value, which is how a Vide project writes one, went unread on
  every file that did parse.

  It follows what a function returns now, along with the shapes that were missing
  beside it: a template's interpolations, `as const` and `satisfies`, string
  concatenation, and an object's computed keys and spreads.

  Two things the same walk got wrong go with it. The lexical fallback read a
  template's `${...}` as class text, so a half-typed file reported `${flag` and
  `?` as unknown utilities. And sorting dropped the space either side of an
  interpolation, running the last token into whatever it resolves to.

## 0.12.1

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

- 4fbd38d: Hand a branched `opacity-*` back to the runtime host.

  A bare `opacity-*` fades the element's subtree as well as the element, and
  the subtree wrapper is built from the tokens that always apply — a branch is
  not among them. Lowered as a rule the branch painted the element's own
  transparency and the subtree never learned about the alpha.

  A class value with a branch naming an opacity now goes back to the runtime
  host, which resolves it and hands the subtree one alpha. A CanvasGroup stays
  on the rule path — `GroupTransparency` composites its subtree by itself — and
  an opacity written beside a branch stays as static as it ever was.

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

- 7a9fde7: Drop the theme scales from a file the runtime never parses a class against.

  The inlined runtime host carried the whole resolved config — every color scale,
  every radius, spacing and font-family key, and the plugin utility table. That is
  about 19KB of the emit, and the host only ever reads it while parsing a class
  value it was handed at render time.

  Most files hand it none. A variant, a branch, a text transform, a margin, a
  divide or a preset animation reaches the host through props the compiler already
  resolved, and the tables sit there unread. Those files now inline the config with
  its scales emptied, which is roughly 400 bytes instead of 19KB.

  A file that does hand the host a class value — a `className` bound to a value the
  compiler cannot read — keeps the full tables, and so does one whose host takes a
  spread, since a spread can carry a `className` this pass never sees. `preflight`,
  `theme.rem` and the motion driver stay either way; the host reads those whatever
  it renders.

  Nothing about what a class resolves to changes.

- 5a31e51: Read editor descriptions in rem now that offsets scale with the viewport.

  Hover and completion docs still spoke in the units rem retired: `p-4` showed
  `new UDim(0, 16)`, `border-2` a bare `2`, `-translate-y-2` "8 pixels". With
  scaling active none of those numbers is what actually renders — they are only
  the value at `baseResolution`.

  A viewport-scaled offset now reads as its rem value first — `` `1rem` (16px at
the base viewport)`` — across padding, gap, margin, sizes, positions, radius,
  text size, stroke and separator thickness, and scrollbar width, in hovers and
  completion docs alike. The shadow preset hover names `BlurRadius` as the value
  that follows the viewport. A config that pins rem (`min = max = base`) keeps
  the old pixel wording, matching the emit it produces.

## 0.11.1

### Patch Changes

- c71a864: Fix type errors in the inlined runtime under `noUncheckedIndexedAccess`. A
  `className` carrying a state variant such as `hover:bg-amber-400` pulls the
  runtime host into the emit, where the consumer's own compiler options typecheck
  it — and its indexed reads of parsed call arguments, enum segments, and gradient
  stops were typed as if an index could never miss. The runtime now typechecks
  under that flag, and is built with it so the seam cannot regress.

## 0.11.0

## 0.10.0

### Minor Changes

- 63d44ca: Carry `opacity-*` across a component boundary, in both directions.

  A fade written around a component reached nothing it rendered, and a fade written
  on one — `<Label className="opacity-50" />` — lowered to `BackgroundTransparency`
  and no further: the tag is unknown there, so the channel that actually paints a
  label was never named and its text stayed opaque. The emitted Luau held the token
  either way; the instance held `0`.

  React context is the one thing that crosses that boundary, so the alpha now
  travels as one. The transformer wraps what it cannot reach — `{props.children}`,
  a component child, a component element carrying the utility itself — in a
  provider that renders no instance, so the tree keeps its shape, its keys and the
  names Roblox gives them. That provider is relative: it multiplies its alpha by
  the fade it is nested in, because a context alone would let the inner value win
  rather than compose. An `opacity-*` on a component element lowers to no property
  at all now; it becomes that alpha.

  Reaching a subtree that was lowered entirely at compile time needs a consumer,
  since an instance cannot read a context. Every component definition gets its root
  routed through one, unless that root is a runtime host or another component,
  which read the context for themselves. The consumer walks the instances below it
  and composes the alpha onto each channel they paint, and stops at anything that
  resolves against the context on its own — fading those from outside as well would
  apply the same alpha twice. The context lives on a shared global rather than
  being created per module: the runtime is inlined into every file that needs it,
  so a `createContext` in each copy would make one context per module and nothing
  would ever cross. A file that needs only the fade inlines that namespace alone
  rather than the whole runtime host.

  A class value that settles at render time is now left whole to the runtime for
  the same reason. The transformer no longer fades the subtree under a
  `className={cn(…)}`, and the host — which resolves all of it — hands its children
  one alpha, so an `opacity-*` inside a recipe reaches the subtree it is written
  over. The fade still ends at a `canvasgroup` on both paths: its
  `GroupTransparency` composites the subtree in one pass, and the runtime resets
  the context there so nothing below repeats it.

  `opacity-unreachable-child` is gone with the limitation it described. One
  difference between the two paths remains: the static path leaves a transparency
  the author declared on the element alone, and a fade arriving as context cannot
  tell that prop from one Vela lowered, so it composes over both.

### Patch Changes

- 3724fbd: Group the inlined runtime into namespaces so it stops crowding Luau's local
  register limit.

  Scoping the runtime into one initializer moved its declarations off module
  scope, but it did not shrink them: the initializer is itself a function, and it
  had grown to 177 of the 200 local registers Luau allows one. Twenty-three more
  top-level helpers — roughly one utility family's worth — and every transformed
  file would have failed to compile with
  `Out of local registers when trying to allocate <name>: exceeded limit 200`,
  against generated code the author never wrote.

  The runtime's helpers now live in thirteen namespaces. roblox-ts lowers a
  namespace to `local Group = {} do ... end`, so a group costs one register that
  lives on and its members are freed at the block's end. Growth is bounded by the
  group a helper joins rather than by the runtime as a whole.

  Measured on the rbxts harness, the busiest register file in an emitted file went
  from 177 to 65. Both the harness and the compiler crate now assert a budget of
  120, so crowding the limit again fails a test instead of a consumer's build.

## 0.9.0

### Minor Changes

- c661947: Compose `opacity-*` into everything the element draws, and into the subtree
  written under it.

  `opacity-*` lowered to `BackgroundTransparency` alone, which is invisible on a
  label whose background is already transparent, and it reached nothing below the
  instance it was written on. It now fades every channel the host paints itself —
  `BackgroundTransparency` everywhere, `TextTransparency` on the text hosts,
  `ImageTransparency` on the image hosts, and the `Transparency` of a `UIStroke` or
  `UIShadow` drawn alongside it. A `canvasgroup` still takes `GroupTransparency`
  alone, which already covers all of them.

  Roblox has no inherited transparency: CSS fades a subtree by compositing it once
  and multiplying alpha over the result, and the closest thing that stays a
  property is to hand every instance below the class the running product. The
  transformer now walks the JSX with that alpha and applies `1 - (1 - own) * alpha`
  to each element it reaches, which includes children written inside an expression
  — `{cond && <X />}` and `{items.map(…)}` are nested JSX as far as the AST is
  concerned. A `canvasgroup` on the way down ends the walk. A child whose
  `className` is only known at render time is handed the alpha as `__velaOpacity`
  so the runtime host composes what it resolves, variant rules included; the
  statically known half is composed at compile time and neither side does it twice.

  Two shapes stay out of reach — `{props.children}`, and a component child whose
  instances are created elsewhere — and both now report
  `opacity-unreachable-child` rather than silently fading half a subtree.

  `opacity-*` also stopped being order-dependent. `bg-slate-700` clears
  `BackgroundTransparency`, so `opacity-50 bg-slate-700` came out opaque while
  `bg-slate-700 opacity-50` did not. Tailwind reads `opacity-*` as independent of a
  color's own alpha and multiplies the two, so the utility is now held until the
  whole class list is read and composed over whatever alpha the colors settled on.

  Overlapping siblings are where this parts ways with a real composite: it fades
  each of them rather than the group, so the overlap darkens.

### Patch Changes

- c661947: Scope the inlined runtime host so a file with enough parts of its own still
  compiles.

  Luau caps a function at 200 local registers, and a module body is a function.
  The runtime was inlined as ~96 top-level declarations, which every transformed
  file paid before it declared anything itself — so a component with enough parts
  crossed the limit and failed to compile at all, reporting
  `Out of local registers when trying to allocate <name>: exceeded limit 200`
  against generated code the author never wrote. A six-part `card` hit it at the
  second part; the four components beside it were merely close.

  The runtime now arrives as a single initializer, so the module body spends one
  register on it instead of ninety-six. Type declarations stay outside it: they
  cost no register, and the host cast names one of them.

  Measured on the rbxts harness, module-scope locals in an emitted file went from
  96 to 12.

  The runtime source moved out of a string literal in the Rust crate and into
  `packages/runtime/src/index.ts`, which the compiler reads at build time. It is
  not published and consumers install nothing — the point is that the runtime is
  now real TypeScript the repo typechecks and formats, which it could never do
  while it was a string. That alone caught a live brace error in it.

## 0.8.0

### Minor Changes

- 9cea6df: Resolve every utility family on the runtime class path.

  The runtime host knew about a third of the families the static path lowers, so a
  component whose `className` arrives as a value kept losing whatever the subset
  did not cover: positioning (`left-*`, `inset-*`, `translate-*`, `origin-*`,
  `mx-auto`), the box constraints (`min-w-*`, `max-h-*`, `aspect-*`), the grid
  (`grid-cols-*`, `auto-rows-*`), gradients, `ring-*`/`outline-*`, shadows,
  `z-*`, `rotate-*`, `scale-*`, `opacity-*`, `order-*`, `leading-*`, `self-*`,
  `content-*`, `object-*`, `pointer-events-*`, `space-*`, `whitespace-*`, the
  whole ScrollingFrame family and the rest of the text families.

  All of them now resolve dynamically with the static semantics: color opacity
  modifiers (`bg-blue-600/50`) and arbitrary values (`bg-[#ff0000]`, `w-[120px]`,
  `text-[13px]`) included, and the families that only meet at the end — the two
  `Size` axes, `Position` and `AnchorPoint`, `FontFace`, a grid track and the gap
  it gives back — are composed the way `PendingAxes::flush` composes them.
  `font-<family>` resolves too: `theme.fontFamily` now reaches the runtime theme.

  A utility the host element cannot carry is dropped rather than applied, mirroring
  `is_utility_allowed_on_host` — writing `TextColor3` onto a `Frame` is a hard
  Roblox error, not a no-op.

  The runtime host also names `UIShadow` by its real class: `@rbxts/react` passes a
  tag it does not know straight to `Instance.new`, which is case sensitive, so the
  lowercase form would fail to instantiate and unwind the whole tree. The static
  path still emits the lowercase tag through JSX and needs its own fix.

## 0.7.0

### Minor Changes

- e464a5a: Add plugin utilities and a motion driver seam.

  `plugins.utilities` lets a config name its own tokens, expanding either to a
  utility class list or straight to Roblox property assignments, with a depth cap
  so a self-referential definition fails the config rather than the build.

  `plugins.motion` lets a driver take over transitions or animations one method at
  a time; whatever it leaves alone stays on the built-in TweenService path.

- e464a5a: Resolve layout, sizing and text utilities on the runtime class path.

  The runtime host implemented a strict subset of the static lowering, so a
  component whose `className` comes from a helper — the normal shape for a variant
  recipe — silently lost most of its styling: `flex-row`, `items-*`, `justify-*`,
  `w-fit`/`h-auto`/`size-fit`, `text-<size>`, `text-left|center|right` and
  `font-<weight>` all fell through.

  They now resolve with the same semantics the static path uses. `font-<family>`
  remains static-only, because the runtime theme carries colors, radius and
  spacing but no font families.

## 0.6.0

### Minor Changes

- 8ff59d9: Give `grid-cols-*`/`grid-rows-*` a real `CellSize`, and add `auto-rows-*` /
  `auto-cols-*` to name the other axis.

  `UIGridLayout` stamps `CellSize` onto every child and ignores whatever `Size`
  the child set for itself. The grid utilities only ever set `FillDirection`,
  `FillDirectionMaxCells` and `CellPadding`, so every cell fell back to Roblox's
  100x100 default: a `grid-cols-2` of 430px cards collapsed to 100px squares and
  their content spilled across the neighbouring track. `grid-cols-*` was not
  merely imprecise, it was unusable.

  `grid-cols-N` now divides the axis it fills into N tracks and hands each cell
  back its share of the gap — `grid grid-cols-2 gap-2.5` lowers to
  `CellSize = new UDim2(0.5, -5, 0, 100)`. `grid-rows-N` does the same on the
  vertical axis.

  The cross axis needs its own answer, since a column count says nothing about
  row height, so `auto-rows-*` and `auto-cols-*` set it from the spacing scale.
  Without one it stays at the 100px the engine already used, which is why this is
  a minor rather than a patch: existing grids keep their row extent and gain
  correct track widths.

### Patch Changes

- 354b20b: Keep `w-*` and `h-*` from erasing each other on the runtime path. `Size` holds
  both axes, so a bundle that named one of them used to state a whole `UDim2` and
  zero out the other — `md:w-32 md:h-32` kept only the height, and a `md:h-32`
  overlay dropped the base width. Variant rules and dynamic class values now carry
  each axis on its own, and the runtime composes them over whatever `Size` the
  element already has, so a variant only moves the axis it names.
- b4e5ee1: Resolve `text-{color}` on the runtime path. A dynamic class value reaches the
  inlined runtime host, and that resolver had no `text-` branch at all, so every
  text color in one was dropped without a diagnostic — the label kept Roblox's
  near-black default and went invisible on any dark surface, while the identical
  class string lowered correctly when it happened to be static. Colors now reach
  `TextColor3` (and `text-transparent` reaches `TextTransparency`) on both paths.
  The overloaded non-color halves of the prefix, `text-lg` and `text-left`, still
  fall through unresolved rather than guessing a value.

## 0.5.2

### Patch Changes

- fe23df6: Keep `w-*` and `h-*` from erasing each other on the runtime path. `Size` holds
  both axes, so a bundle that named one of them used to state a whole `UDim2` and
  zero out the other — `md:w-32 md:h-32` kept only the height, and a `md:h-32`
  overlay dropped the base width. Variant rules and dynamic class values now carry
  each axis on its own, and the runtime composes them over whatever `Size` the
  element already has, so a variant only moves the axis it names.

## 0.5.1

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
