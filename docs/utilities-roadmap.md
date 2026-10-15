# Unsupported utility support design (utilities roadmap)

Reclassifies the Tailwind families that currently only emit a `no-roblox-equivalent`
warning by whether they can be supported, and defines the lowering design for the
ones that can.

The classification axis is not implementation difficulty but **what kind of mapping
is required**.

| Tier | Meaning |
| --- | --- |
| A. Pure property mapping | Expressible right away with the existing architecture (static lowering + helpers) |
| B. Runtime host extension | Requires a new capability on `VelaRuntimeHost` (tweens, Text pipeline) |
| C. Structural transform | The JSX tree itself has to change (element wrapping, child injection) |
| D. Not expressible | Roblox UI has no corresponding concept — keep `no-roblox-equivalent` |

## Phase 1 — Pure mapping (tier A) — **implemented**

The ones that only need the existing utility-add checklist. `mx-auto`/`my-auto` were
folded into this phase and implemented alongside them.

### `object-*` → ImageLabel/ImageButton `ScaleType`

| Token | Value |
| --- | --- |
| `object-cover` | `Enum.ScaleType.Crop` |
| `object-contain` | `Enum.ScaleType.Fit` |
| `object-fill` | `Enum.ScaleType.Stretch` |

- Host restriction: `imagelabel`, `imagebutton` (`is_utility_allowed_on_host`).
- `object-none`, `object-scale-down`, and `object-{position}` have no counterpart →
  `unsupported-object-value` diagnostic.
- Roblox-specific value extension: `object-tile` → `Enum.ScaleType.Tile` (not in
  Tailwind, but common enough in Roblox to offer as a vela extension).

### `pointer-events-*` → `Interactable`

| Token | Value |
| --- | --- |
| `pointer-events-none` | `Interactable = false` |
| `pointer-events-auto` | `Interactable = true` |

- Allowed on every host. The family is `pointer` (parsed from the
  `pointer-events-` prefix).

### `space-x-*` / `space-y-*` → UIListLayout `Padding`

Tailwind's `space-*` means "gap between children" — exactly `UIListLayout.Padding`.

- `space-x-N` → `uilistlayout.Padding = <spacing N>` + `FillDirection = Horizontal`
- `space-y-N` → `uilistlayout.Padding = <spacing N>` + `FillDirection = Vertical`
- Reuses the same spacing scale and diagnostics as `gap-*`. When used together with
  `gap`, the later token wins (existing rule).
- `space-x-reverse` has no counterpart → value diagnostic.

### `whitespace-{normal,nowrap}` → `TextWrapped`

- `whitespace-normal` → `TextWrapped = true`, `whitespace-nowrap` → `false`
  (aliases of `text-wrap`/`text-nowrap`). Text hosts only.
- The `whitespace-pre*` variants have no counterpart → value diagnostic.

### `overscroll-*` → ScrollingFrame `ElasticBehavior`

| Token | Value |
| --- | --- |
| `overscroll-auto` | `Enum.ElasticBehavior.Always` |
| `overscroll-contain` | `Enum.ElasticBehavior.WhenScrollable` |
| `overscroll-none` | `Enum.ElasticBehavior.Never` |

- Host restriction: `scrollingframe`.

### `ring-*` / `outline-*` → UIStroke aliases

Both families lower through the same `uistroke` helper as `border-*`. Only one
UIStroke applies reliably per instance, so they are **merged into the same helper
instead of creating a separate stroke** (last token wins).

- `ring` → `Thickness = 3` (Tailwind default), `ring-N` → `Thickness = N` (0/1/2/4/8),
  `ring-{color}` → `Color`, plus `ApplyStrokeMode = Border`.
- `outline` → `Thickness = 2`; `outline-N` and `outline-{color}` follow the same rules.
  `outline-none`/`outline-hidden` → `Thickness = 0`.
- `ring-offset-*`, `outline-offset-*`, `outline-dashed` and friends have no
  counterpart → value diagnostic.
- The hover docs state the caveat that these "share the same UIStroke as `border`".

## Phase 2 — Transitions (tier B, core feature) — **implemented**

Supports `transition` / `duration-*` / `ease-*` / `delay-*` through TweenService.
The runtime host today is a React component that re-applies props **immediately**
when the environment (viewport/input) changes. This adds an "apply changed props as
a tween" mode on top of it.

### Syntax → configuration lowering

Transition tokens lower to **host configuration**, not to style props:

```tsx
// input
<frame className="bg-slate-700 md:bg-blue-600 transition duration-300 ease-out" />
// output (conceptually)
React.createElement(VelaRuntimeHost, {
  __velaTag: "frame",
  __velaRules: [...],
  __velaTransition: { time: 0.3, style: "Quad", direction: "Out", delay: 0 },
  ...staticProps,
})
```

| Token | TweenInfo field |
| --- | --- |
| `transition` | enable (default time 0.15) |
| `transition-none` | disable |
| `duration-N` (75/100/150/200/300/500/700/1000, or an arbitrary integer ms) | `time = N/1000` |
| `delay-N` | `delayTime = N/1000` |
| `ease-linear` | `Enum.EasingStyle.Linear` |
| `ease-in` | `Quad` + `Enum.EasingDirection.In` |
| `ease-out` | `Quad` + `Out` |
| `ease-in-out` | `Quad` + `InOut` |

- `transition-colors|opacity|transform` narrows which props get tweened (`colors` →
  `*Color3`, `opacity` → `*Transparency`, `transform` → Position/Size/Rotation/
  AnchorPoint). Props outside the group apply immediately. `transition-shadow` has
  nothing to filter — the shadow is a helper instance and applies immediately — so
  it falls back to a diagnostic.
- The `hover:` variant is supported by the host tracking state through
  MouseEnter/MouseLeave (composed with consumer Event handlers). Arbitrary
  `bg-[#hex]` colors and the `color/opacity` modifier (`bg-blue-600/50` →
  transparency prop) are supported too — the modifier works on every family with a
  transparency channel (bg/text/image/border/shadow/ring/outline/scrollbar, the
  divide separators, and the gradient stops, which carry theirs in a
  `UIGradient.Transparency` sequence). `placeholder-` has none, so it keeps the
  diagnostic.
- An element with only transition tokens and no runtime rule is lowered statically
  today, so the presence of `transition` must **promote it to the host** (added to
  the `needsRuntimeHost` condition).

### Runtime application

1. The host grabs the real instance with `React.useRef` (passing a `ref` prop).
2. When the computed props change due to an environment change, tweenable types
   (number, `UDim2`, `UDim`, `Color3`, `Vector2`) are not passed declaratively —
   the previous value is **kept and the instance is tweened with TweenService**.
   `Enum`/bool/string apply immediately.
3. Tweens on helper instances (uicorner, etc.) work the same way through a helper
   ref. The first scope covers only top-level instance properties; helpers start
   out applying immediately.
4. Props the user controls directly (explicit props) are excluded from tweening —
   the existing "explicit prop wins" rule stands.

Note: to keep React reconciliation from fighting the imperative tween, the host
remembers the last tween target for each tweened prop and passes that value on
re-render.

### `animate-*` (Phase 2.5) — **implemented**

For compatibility with slotting libraries (lattice-ui and friends), the runtime host
renders through `forwardRef` and composes its own instance ref with the forwarded
one. Component elements have no instance for a tween to reach, so `transition` and
`animate-*` only work on host tags; used on a component they emit a
`motion-on-component` warning and are ignored — attaching them to the `asChild` child
host element is the correct usage.

Preset looping tweens, reusing the same ref-based mechanism.

| Token | Implementation |
| --- | --- |
| `animate-spin` | Rotation 0→360, linear infinite loop (1s) |
| `animate-pulse` | BackgroundTransparency 0→0.5→0 (2s, ease-in-out) |
| `animate-bounce` | Position offset Y 0→-25%→0 loop |
| `animate-none` | clear |

`animate-ping` needs a duplicated element, so it is impossible without a structural
transform → value diagnostic retained.

## Phase 3 — Text pipeline (tier B) — **implemented**

The ones where the Text prop has to be processed by the host. Adds a "Text transform
chain" to the runtime host: `Text = pipeline(original Text)`. For a static string
literal the transform happens at compile time, avoiding host promotion.

- `uppercase` / `lowercase` → `string.upper` / `string.lower`
  (the hover docs note this is ASCII-only; scripts like Hangul are left unchanged,
  which is safe).
- `capitalize` → uppercase the first letter of each word.
- `normal-case` → clear the transform.
- `underline` / `line-through` → set `RichText = true` and wrap the Text in
  `<u>…</u>` / `<s>…</s>`. **RichText special characters (`<`, `&`) in the original
  Text must be escaped.** On elements where the user already uses `RichText` there is
  a double-escaping hazard → if the user set the `RichText` prop explicitly, emit an
  `underline-on-richtext` diagnostic and skip the transform.
- `overline` has no RichText tag → stays unsupported.

## Phase 4 — Structural transforms (tier C) — **implemented** (4.1 margin, 4.2 divide), review: `phase4-structural-review.md`

### `m-*` (margin) — wrapper frame approach

Roblox has no margin, so the standard emulation is wrapping:

```tsx
<frame className="m-4 bg-slate-700" />
// ↓
<frame BackgroundTransparency={1} AutomaticSize={XY}>
  <uipadding PaddingTop/Right/Bottom/Left={16} />
  <frame BackgroundColor3={...} Size={UDim2.fromScale(1, 1)} />
</frame>
```

Problems to solve (the reason this was split into Phase 4):
- A rule is needed for moving `Size`/`Position`/`LayoutOrder`/`AnchorPoint` to the
  wrapper and filling the inner element with `fromScale(1,1)`.
- `ref` and event props must stay on the inner element.
- Keys/reconciliation: give the wrapper a stable key.
- Document the meaning inside a list layout (margin adds to the gap).

Once `space-*` is solved in Phase 1, most of the real demand for margin (list
spacing) disappears, so this proceeds only after actual usage demand is confirmed.
`mx-auto` (centering) alone can be expressed without wrapping via
`AnchorPoint.X=0.5 + Position.X=0.5`, so it can be pulled forward into Phase 1.

### `divide-x/y-*` — separators between children

Each child needs a UIStroke/frame injected → the parent has to rebuild its child
list. With dynamic JSX children this is impossible at compile time and the runtime
host has to walk the children. **Implemented** by having the runtime host insert
separator frames between content children only — see `phase4-structural-review.md`
for details.

## Phase 5 — Roblox-specific properties (tier A) — **implemented**

Not about Tailwind parity — this phase fills in properties that only exist on Roblox
instances. Host restrictions are handled by `is_utility_allowed_on_host`, and
everything is static lowering.

### ScrollingFrame family

Widens scrollingframe support from just `overscroll-*` to the properties people
actually use.

| Token | Value |
| --- | --- |
| `scroll-x` / `scroll-y` / `scroll-xy` | `ScrollingDirection` |
| `scroll-none` | `ScrollingEnabled = false` |
| `scrollbar-w-{spacing}` | `ScrollBarThickness` (spacing scale → offset) |
| `scrollbar-none` | `ScrollBarThickness = 0` |
| `scrollbar-{color}` (including the `/N` modifier) | `ScrollBarImageColor3` / `ScrollBarImageTransparency` |
| `canvas-auto` / `canvas-auto-x` / `canvas-auto-y` / `canvas-none` | `AutomaticCanvasSize` |

- The `scroll` family was pulled out of `is_known_tailwind_family`, so Tailwind's
  `scroll-smooth` / `scroll-m-*` are reported as `unsupported-scroll-value` rather
  than `no-roblox-equivalent` — which lets the message suggest a replacement token.
- `scrollbar-*` / `canvas-*` are vela extensions with no Tailwind counterpart (the
  `object-tile` precedent).

### `font-{family}` — a new theme axis

The family in `FontFace` was pinned to Source Sans Pro, so only weight/style were
selectable. `theme.fontFamily` was added as a new theme axis and `font-*` now serves
both scales — following the same rule as Tailwind, the fixed weight names win first
and the remaining payload is looked up as a font family key (`parse_utility` does not
receive the config, so the weight table alone is enough to branch on).

- Defaults: `sans` (SourceSansPro) / `serif` (Merriweather) / `mono` (RobotoMono).
  Values are Roblox font family asset strings, so uploaded `rbxassetid://` fonts work
  too.
- family/weight/style are merged in `PendingAxes` and emitted as a single `FontFace`.
- Wiring: `config/defaults.json`, `packages/config/src/index.ts`,
  `packages/vela-rbxts/schema.json`, `config/model.rs` (serde `fontFamily`),
  `config/merge.rs`.

### `theme.rem` — offsets follow the viewport

Every pixel offset a utility lowered was a literal, so a class list that read well on
a 1080p monitor was oversized on a phone and undersized on a 4K screen. `theme.rem`
makes the offset a rem unit: the curve is Littensy's rem provider (viewport diagonal
against `baseResolution`, capped at a 19:9 aspect, gentler falloff in portrait,
rounded then clamped into `[min, max]`).

The two lowering paths need different mechanics, because only one of them re-renders:

- **Static path** — the element never renders again, so `__VelaRem.scale(value)` hands
  its offsets over as a React binding the reconciler writes through. The file gets the
  `__VelaRem` namespace inlined above it, alongside the opacity namespace if it needs
  that too.
- **Runtime host path** — the host already re-renders when the environment changes, so
  its own props stay values and it is handed `__velaRem`, the names of the props to
  scale. A value resolved from a rule or a dynamic class list is scaled as it enters
  the resolution, so composition never sees a raw offset. Helper children take the
  binding on this path as well, since the host renders them as plain children and
  never reads them back.

`min >= max` leaves the clamp no room, so every viewport resolves the same rem and the
compiler drops the scaling from the emit entirely — the pre-rem literal output, opt-out
included.

- Only offsets scale. `UDim2.fromScale`, a `UDim` with a zero offset, and a literal `0`
  keep their values, and `carries_offset` is what decides.
- `rem` is also an authoring unit. A `[2rem]` payload resolves against `theme.rem.base`
  on the way in — `Length::Rem` is what carries it until a config is at hand — so it
  lands as a plain offset and takes the same curve from there. Both parses mirror:
  `parse_arbitrary_length` in the compiler, `parseArbitraryLength` in the runtime.
- Wiring: `config/defaults.json`, `packages/config/src/index.ts`,
  `packages/vela-rbxts/schema.json`, `config/model.rs` (serde `rem`), `config/merge.rs`,
  `transform/rem.rs` (the scaled-prop table), and its mirror in the runtime's
  `__VelaRem.SCALED_PROPS`.

### Known branches in a class value

A class value the compiler could not decide used to travel whole: the element was
swapped for the runtime host and the class list was parsed in-game, against the
resolver's own prefix subset. But `active ? "text-lg" : "text-sm"` names every token
it can ever apply — only *which* of them apply is undecided — and `text-lg` has no
runtime resolution at all, so the branch resolved to nothing.

The reading is now a list of segments in source order: static tokens, branches, and
whatever is left for the runtime. A branch is resolved here through
`resolve_class_tokens`, the same call the static path makes, and what it comes to
becomes a `RuntimeRule` the host applies when its condition holds.

- **The condition is an index, not an expression.** The tests reach the host as
  `__velaTests`, narrowed to booleans where they are written, and
  `RuntimeCondition::Test { index, expected }` names one. A nested ternary reuses its
  test's index across every branch below it, so an expression is evaluated once
  however many rules hang on it.
- **A branch is resolved among the tokens written around it**, then diffed against
  the base — which is what keeps `["w-40", tall && "h-10"]` one `Size` rather than a
  branch that overwrites the width, and what lets a static token written *after* a
  branch still win.
- **A variant inside a branch meets the branch's own test** as
  `All [Test, Hover]`; `RuntimeCondition::All` already composed that way.
- **The bundle is the boundary.** A rule carries props and helpers, so a branch whose
  resolution differs from the base in `text`, `margin`, `divide`, `transition`,
  `animation` or `opacity_alpha` — all of which the host reads off its own props —
  cannot ride one. `diff_effects` returns `None` there and the whole class value is
  re-read with `collapse_class_value_expr_without_branches`, which is the pre-branch
  emit exactly.
- **`||` keeps its left side.** A truthy left *is* the class value and can name
  anything, so it stays on `className` while the literal behind it becomes a rule
  gated on the test being false. The two never both apply.
- Two branches that touch the same prop are applied in written order, so the later
  one wins. Two that touch different halves of one prop (`[a && "w-40", b && "h-10"]`)
  are two writes to `Size`, which the resolution cannot merge — the same limit the
  runtime resolver always had.
- **A rule's prop values are source text, and the runtime parses them back.**
  `parseRuntimePropValue` knew `Color3.fromRGB`, `UDim`, `UDim2` and `Enum.*`, but not
  `Vector2`, `ColorSequence` or `Font` — so `md:min-w-16`, `md:bg-gradient-to-r` and
  `md:font-bold` had been assigning strings to Roblox properties all along, which
  React rejects loudly enough to take the whole tree down. Branches reach those
  families far more often, which is how it surfaced. The parser now covers every
  constructor the emit can write, and
  `the_runtime_parses_every_value_constructor_the_emit_can_write` guards the seam.
- Base helpers a rule also names are hoisted into an unconditional rule
  (`All { conditions: [] }`) so they merge by tag inside the resolution. The host
  renders `resolution.helpers` next to the children it was handed, so leaving the
  base helper as a child would put two `UIPadding` under one instance — which the
  variant path had been doing all along.
- Wiring: `class_value/collapse.rs` (segments and tests), `transform/branch.rs`
  (resolution, diff and hoisting), `ir/model.rs` (`RuntimeCondition::Test`),
  `swc/builders.rs` (`create_tests_attr`), and the runtime's `RuntimeEnvironment.tests`
  and `matchesRuntimeCondition`.

### The inlined config carries only what the file reads

The host inlines the resolved config, and the config is mostly scales: the color
palette alone is 12KB of the 19KB it serializes to. Every one of those keys exists
for `applyToken`, which runs over `normalizeClassValue(className)` and nothing else
— so a file that never hands the host a class value carries the whole table unread.

That is most files, and more of them since branches: a variant, a branch, a text
transform, a margin, a divide or a preset animation all reach the host through props
resolved at compile time. `prune_resolver_tables` empties `colors`, `radius`,
`spacing`, `fontFamily` and `plugins.utilities` for those, taking the config from
~19KB to ~400 bytes. `preflight`, `rem` and the motion driver stay — the host reads
those whatever it renders.

- **The signal is per file, because the config is inlined per file.** One element
  with a class value the compiler cannot read keeps the tables for the whole module.
- **A spread counts as a class value.** `<frame {...rest} className="hover:bg-*" />`
  hands the host whatever `rest` holds, and `className` is a declared prop, so the
  tables have to survive it.
- Wiring: `transform/context.rs` (`resolves_class_values`), `transform/runtime_host.rs`
  (`prune_resolver_tables`). The harness keeps `surfaceClass(active)` for the sole
  purpose of holding the unpruned path open end to end.

### Host awareness in `opacity-*`

`opacity-*` used to lower only to `BackgroundTransparency`, but a CanvasGroup
composites its subtree, so the property matching CSS `opacity` is `GroupTransparency`
alone. It lowers that way only on the `canvasgroup` host. To make that possible,
lowering was widened to take the host tag —
`resolve_class_tokens(tokens, config, element_tag, diagnostics)` — and component
elements pass `None` since their tag is unknown, preserving the existing behavior.

### Composing `opacity-*` — the element itself and its subtree

`opacity-*` now fades every channel the element draws itself: `BackgroundTransparency`
on every host, `TextTransparency` on text hosts, `ImageTransparency` on image hosts,
and the `Transparency` of the `UIStroke`/`UIShadow` drawn alongside it (on
`canvasgroup`, `GroupTransparency` alone covers all of it).

Two things follow from that.

**It multiplies with the color alpha.** `bg-*` used without `/N` clears
`BackgroundTransparency`, so `opacity-50 bg-slate-700` became opaque purely because
of ordering. In Tailwind `opacity-*` is independent of the color alpha and the two
multiply, so `opacity-*` is stashed as an alpha in `PendingAxes` and composed by
`compose_inherited_opacity` after the whole class list has been read. Order no longer
changes the result.

**It descends into the subtree.** Roblox has no inherited transparency. CSS
composites the subtree once and multiplies the alpha; the closest thing expressible
as properties is passing the accumulated alpha directly to every instance below.
`VelaTransformer` carries `opacity_alpha` down the JSX and applies
`1 - (1 - own value) * parent alpha` — JSX written inside expressions like
`{cond && <X/>}` or `{items.map(...)}` is still nested in the AST, so it is reached
too. It stops at a `canvasgroup` (that one already composites its subtree).

Children with a runtime class value (`className={cn(...)}`) get the alpha via
`__velaOpacity`, so the runtime host composes what it resolved itself (variant rules
included) the same way. The transformer handles the statically knowable half and the
runtime handles the rest — neither one covers both.

### Crossing the component boundary

Two shapes are out of the transformer's reach: expression children that contain no
JSX (`{props.children}`) and component children like `<Button />`, whose instances
are created somewhere this pass never sees. A component element the fade is written
*on* is the same problem from the other side — `<Label className="opacity-50" />`
knows no tag, so there is no channel to lower to and the text stayed opaque.

React context is the only thing that crosses that boundary, so the alpha travels as
one. `__VelaOpacity` holds a context, a provider and a consumer:

- The transformer wraps what it cannot reach in `<__VelaOpacity.Provider value={α}>`,
  which renders no instance, so the tree keeps its shape and its keys.
- The provider is **relative**: it multiplies its own alpha by the one it is nested
  in, because a context otherwise lets the inner value simply win.
- An `opacity-*` on a component element lowers to no props at all. It becomes that
  alpha, statically or through `resolution.opacityAlpha` on the runtime host.
- Every component definition gets its root wrapped in `<__VelaOpacity.Fade>`, unless
  that root is a runtime host or another component — those read the context already.
  The consumer walks the instances below it and composes the alpha onto each, which
  is what reaches a subtree that was lowered entirely at compile time.
- The walk stops at anything that reads the context itself. Fading a runtime host or
  a component from outside as well would apply the same alpha twice.

The context is created once, in the runtime module every file imports, so it is the
same object wherever the alpha crosses a component boundary. It used to be stashed on
`_G`: the runtime was copied into every file that needed it, and `createContext` in
each copy made one context per module that nothing could cross. A file that needs only
the fade imports the opacity namespace alone rather than the whole host.

Because the boundary is now crossed at render time, a class value that only settles
then is left whole to the runtime: the transformer stops fading the subtree under a
`className={cn(…)}` and the host, which resolves all of it, hands its children one
alpha. The fade ends at a `canvasgroup` on both paths — its `GroupTransparency`
already carries the subtree, so the runtime resets the context there rather than
letting a consumer below apply it again.

One thing the runtime cannot mirror: the static path leaves a transparency the author
declared on the element alone, and a fade arriving through the context has no way to
tell that prop from one Vela lowered, so it composes over both.

Limitation: overlapping siblings would fade together under real compositing, but here
each fades on its own, so the overlap ends up darker.

## Permanently unsupported (tier D — keep `no-roblox-equivalent`)

| Family | Rationale |
| --- | --- |
| `tracking-*`, `indent-*`, `break-*`, `hyphens-*`, `list-*` | The Roblox text engine has no letter-spacing/indent/line-break control |
| `decoration-*`, `overline` | No matching RichText tag/attribute |
| `blur-*`, `backdrop-*` (except `backdrop-blur-*`), `grayscale`, `invert`, `sepia`, `contrast-*` | No per-UI-element filters; `UIBlur` only covers `backdrop-blur-*` |
| `skew-*`, `perspective-*`, `transform-3d` | No skew/perspective in 2D UI |
| `float`, `clear`, `columns-*`, `col-span-*`, `row-span-*` | No corresponding layout concept (UIGridLayout has no span) |
| `static/fixed/absolute/relative/sticky`, `block/inline/table/contents` | Roblox always positions absolutely relative to the parent; there is no positioning model at all |
| `cursor-*`, `caret-*`, `accent-*`, `appearance-*`, `select-*` | No per-element cursor/caret/native widget styling |
| `snap-*`, `resize-*` | No scroll snap or resize handles |
| `isolate`, `box-*`, `container`, `sr-*`, `antialiased` | The rendering concept does not exist |
| `brightness-*`, `fill-*`, `stroke-*` | An approximate mapping (ImageColor3) distorts the meaning — too misleading, so excluded |

This list is kept 1:1 with `is_known_tailwind_family`, and is managed by removing
entries from it as phases land.

## Implementation order and verification

1. **Phase 1** — the six utility families in one pass (following the existing
   checklist: parse → remove the analyze classification → lowering → diagnostics →
   completions/hover/diagnostics → unit tests → add rbxts-harness/lsp-harness
   probes). No structural changes.
2. **Phase 2** — transitions. Transform side: `needsRuntimeHost` promotion +
   `__velaTransition` serialization. Runtime host: ref + TweenService. Add transition
   probes to rbxts-harness alongside the `md:` variant and verify the TweenInfo
   serialization in the emitted Luau without emulation. (Real-device behavior is
   documented as a manual Studio check.)
3. **Phase 2.5 / 3** — animate presets and the Text pipeline. RichText escaping
   requires dedicated unit tests.
4. **Phase 4** — a separate design review once demand is confirmed.
