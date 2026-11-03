# Phase 4 design review — structural transform utilities (`m-*`, `divide-*`)

> **Status**: 4.1 (margin, option C) is implemented. Under a transition, the
> layout props routed to the wrapper tween on the wrapper itself, on both hosts.
> 4.2 (divide) is implemented too. It now ranks children by their `LayoutOrder`
> (section 2), so the only constraint left is the gap approximation.

Phase 4 covers the utilities that do not change one element's properties but
**have to change the render tree itself**. This review compares implementation
strategies and settles on a recommendation.

## Summary of conclusions

| Item | Recommendation |
| --- | --- |
| `m-*` implementation strategy | **Option C: the runtime host renders the wrapper** (not compile-time tree surgery) |
| margin support scope | `m/mx/my/mt/mr/mb/ml-*` plus negatives; `mx-auto` keeps the existing anchor approach |
| `divide-x/y-*` | **Feasible** with the same host mechanism, but split off as Phase 4.2 and done after margin settles |
| `space-x-reverse` and friends | Still unsupported (value diagnostic retained) |

---

## 1. `m-*` margin

### Settled semantics

Emulate the CSS margin box directly: **transparent wrapper frame = margin box**,
inner element = border box. UIPadding expresses the margin values.

```
wrapper(frame, transparent, Size = declared Size + margin sum)
 ├─ uipadding (PaddingTop/Right/Bottom/Left = margin)
 └─ inner(the original element, Size = fromScale(1, 1))
```

- Inside a list (UIListLayout): the wrapper becomes the list item, so the margin adds
  to the spacing between items — same as CSS. Document that it stacks with `gap`.
- Absolute positioning: in CSS `left` is measured from the margin edge, so moving
  Position/AnchorPoint to the wrapper matches CSS semantics exactly.
- Negative margins: UIPadding does not support negative values, so **negative margins
  are handled without a wrapper, purely as a Position offset shift** (joining the same
  pending path as translate). When mixed with a wrapper plus positive margins, they
  are computed and merged per axis.

### Size formula

| Inner declaration | Wrapper Size | Inner Size |
| --- | --- | --- |
| `w-40` (offset 160) | `UDim2(0, 160+ml+mr, …)` | `fromScale(1,1)` |
| `w-1/2` (scale 0.5) | `UDim2(0.5, ml+mr, …)` | `fromScale(1,1)` |
| `w-auto` | wrapper is `AutomaticSize` too, inner stays auto | auto |

Margin values come from the spacing scale, so they are always offsets — the formula
is pure addition. Scale margins do not exist, so there is no case explosion.

### Strategy comparison

**Option A — compile-time tree surgery (JSX wrapping in swc)**
- Pro: no host cost for static elements.
- Con: user prop routing has to happen **at compile time**. AST surgery to move
  dynamic attrs like `Size={expr}` and `LayoutOrder={props.i}` onto the wrapper, key
  migration, cases where an `md:w-*` runtime rule must change the wrapper size (a
  static wrapper cannot follow), branching the transition/animate ref target — a large
  implementation surface with many edge cases.

**Option B — no wrapper, only a Position shift**
- Rejected, since it gives up margin's main use case (list spacing). One could argue
  `space-*` already absorbed that demand — but then there is no reason to build
  option B at all.

**Option C — the runtime host renders the wrapper (recommended)**
- When `m-*` is present, **promote to the host** just like `animate-*` and pass
  `__velaMargin = {top,right,bottom,left}`. The host wraps with
  `createElement("frame", wrapperProps, createElement(tag, innerProps, …))`.
- Prop routing collapses to **a single runtime table**: dynamic or static, user props
  have already arrived as props, so no AST surgery is needed.
- When an `md:` rule changes the size, resolution is recomputed and the wrapper
  formula is recomputed with it — option A's hardest problem is solved for free.
- Cost: static margin elements become hosts too. The extra instance is a single
  wrapper frame, identical to option A; only one component layer is added. Acceptable.

### Option C prop routing table (the key output)

| To the wrapper | To the inner element |
| --- | --- |
| `Size` (with the formula applied), `Position`, `AnchorPoint`, `LayoutOrder`, `ZIndex`, `Visible`, `key` | Everything else: colors/transparency, the text family, `ref`, events (`Event`/`Change`/handlers), helper children (uicorner, etc.) |
| `AutomaticSize` (both, when the inner is auto) | `ClipsDescendants` |

- forwardRef/`instanceRef` (the tween/animate target) points at the **inner element**.
  However, props that a transition tweens but which route to the wrapper
  (Position/Size) have to tween the wrapper instance, so a separate wrapper ref is
  captured too and the tween goal is split in two along the routing table. React
  runs `prepareMarginWrapper` before holding tween values, so
  `__VelaMotion.holdTweenGoal` holds each instance's share separately (the
  wrapper's narrowed by `isMarginWrapperProp`, its `Size` with the margin added).
  The Vide writer tweens a routed prop on the wrapper it already writes to. A
  motion driver sees `{ owner, marginBox: true }` for those tweens.
- `mx-auto` + `m-*` combined: the centering (AnchorPoint/Position) applies to the
  wrapper.
- Component elements (`<Switch.Root className="m-4">`) work as well: the host creates
  the wrapper and the inner is a component render, so no instance access is needed.
  Unlike motion, there is no component restriction.

### Diagnostics

- Combinations where the formula is undefined, such as negative `-m-*` with an auto
  size → value diagnostic.
- Margin plus `basis`/`size-*` and friends fall out of the formula naturally, so no
  extra diagnostic is needed.

### Test plan

- transform: `__velaMargin` serialization, host promotion, the negative-margin pending
  path.
- The runtime logic is verified in rbxts-harness by pattern-matching the wrapper
  structure in the emitted Luau (transparent frame + uipadding + fromScale(1,1)).
  Manual Studio item: margin spacing inside a list.
- lattice regression: confirm `<Switch.Root className="m-4">` compiles (reusing the
  archived lattice-compat harness).

---

## 2. `divide-x/y-*` (Phase 4.2)

### Design

The host's `normalizeChildren` already flattens children, so having the host insert a
separator frame between each pair of children is an extension of the same mechanism:

```
[a, b, c] → [a, sep, b, sep, c]
sep = frame(Size: (0,N,1,0) for divide-x, (1,0,0,N) for divide-y, BackgroundColor3 = divide color)
```

- `divide-x-N` (0/1/2/4/8, default 1) → thickness, `divide-{color}` → color (theme
  resolution reuses the existing color resolver).
- Conditional children (`cond && <frame/>`) are already filtered out by
  normalizeChildren, so the separator count works out automatically.

### Ordering contract

UIListLayout sorts by `LayoutOrder`, and a separator would otherwise carry the
default 0 and land wherever the engine breaks ties. So the host ranks every content
child, whether or not any of them declares an order:

- `planDivideOrder` (runtime-core) stable-sorts the children by `(LayoutOrder ?? 0,
  source index)`. The child ranked r gets `LayoutOrder = 2r`, and the separator
  between ranks r-1 and r gets `2r-1`. Ranks are always written, so the result never
  depends on how Roblox breaks a tie (instance creation order, which a React remount
  can reshuffle).
- The order a child declares is what the host can read: an explicit `LayoutOrder`
  prop, or a static `order-*`, which the compiler lowers to that prop.
- **React** reads `props.LayoutOrder` off each child element and clones it with its
  rank. A Vela host child takes the rank on the host-own `__velaLayoutOrder` prop,
  applied after its own resolution, so its runtime `order-*` cannot overwrite it.
  Separators are keyed, so they reconcile in place. A component child has to forward
  `LayoutOrder` to the instance it renders. An `order-*` under a variant or in a
  dynamic class value on a child is decided after the parent reads it; the compiler
  warns `divide-unreadable-order`, and the separators follow the static order.
- **Vide** builds children first, so the host reads `LayoutOrder` off each built
  GuiObject (component roots included), writes the ranks onto the instances and
  re-plans when a `LayoutOrder` changes, telling its own writes apart by the value it
  last wrote. A thunk child is ranked by the instances it returns; one that returns
  nothing hides its spare separator. Rewriting a rank with exactly the value the host
  last wrote cannot be told apart from the host's own write.
- The host overwrites each child's `LayoutOrder` with its rank, which code reading
  `instance.LayoutOrder` can observe.
- A value child under a fade arrives wrapped in one `__VelaOpacity.Provider`; the
  React host splits it into one provider per child at the same alpha, so each child
  gets its own slot and is faded once.

### Other semantics

- Separators fade with the subtree: the compiler composes the static `opacity-*`
  alpha (own and inherited) into the divide transparency, and both hosts compose the
  ambient and runtime alpha on top. Under a `canvasgroup` the group transparency
  already covers them.
- `divide-x-0` / `divide-y-0` insert no separators.
- The compiler warns `divide-without-list-layout` when nothing gives the element a
  UIListLayout (`flex`, `flex-col`, `space-*` or a written `<uilistlayout>`), and
  `divide-with-grid` under `grid`, where each separator would take a cell.

### Constraint (documented)

- Separators are list items too, so `gap` applies on both sides of each separator,
  unlike CSS (where divide is a border and independent of gap). Item to item, Vela
  spaces `2 * gap + thickness` against CSS's `gap + thickness`. This is kept as a
  documented approximation; no gap compensation is applied.

### Judgment

The implementation is easier than margin option C (just child-array manipulation), but
demand was uncertain and the LayoutOrder constraint could surprise users (the
ordering contract above has since removed it). Recommendation at the time:
**do it after margin settles, in the same host release cycle**. For now the `divide`
family stays in no-roblox-equivalent.

---

## Open decisions

1. Whether to approve margin option C (host wrapper) — on approval, start Phase 4.1.
2. Whether to include divide in 4.1 or defer to 4.2 (recommendation: 4.2).
