# @vela-rbxts/lsp

## 0.14.0

### Minor Changes

- 93b86f2: Let a prop written on an element outrank every class that names it, under every condition. The compiler no longer emits a class's copy beside a declared prop, where JSX let the class's later attribute win and replace a reactive binding: it drops the prop from the base, from variants and from class branches, and warns `explicit-prop-overrides-class` naming the class and the prop, in builds and in the editor. A class value resolved at render time is handed the declared names as `__velaOwn`, and both runtime hosts leave those props standing. A helper written as a child, a fragment's child included, outranks the class's (`explicit-helper-overrides-class`), except a `UIShadow` layer; a conditional child or a helper a variant changes is kept and reported as `possible-duplicate-helper`. Beside a spread, what a class lowers to now takes the `className`'s place and preflight's defaults go first, so `<frame className="bg-slate-700" {...props} />` lets `props` win and a spread can paint over preflight; move the `className` after the spread to keep the class winning.
- d8e292e: Rank the children of a `divide-*` list by their `LayoutOrder` or static `order-*` so the separators follow the sorted order on both hosts, fade the separators with `opacity-*`, keep the separators of a divided list whose value children sit under a fade, and make `divide-x-0`/`divide-y-0` remove them. The compiler warns when divide has no list layout, sits beside `grid`, or has a child whose `order-*` the React parent cannot read. Add `isolate`, which builds a `frame` as a `canvasgroup` so `opacity-*` fades its subtree as one layer; it has to be static and unconditional. `@rbxts/vela-runtime-core` gains `__VelaDivide.planDivideOrder` and `__VelaDivide.separatorTransparency`.
- 94f1bdc: Read attribute variants through `group-*` and `peer-*`: `group-selected:` for a variant registered with `addVariant` or `@custom-variant`, and `group-attr-[State=open]/card:` or `peer-attr-[Tier=2]:` inline, each with the same optional `/name`. A slash inside the brackets stays part of the value. The shared runtime-core observer reads each attribute off the group or peer when it finds it and connects one `GetAttributeChangedSignal` per attribute per observed instance however many elements read it; a peer variant matches while any marked sibling carries the value. `group-md:` and other environment states still warn `unsupported-relational-variant`, and a malformed `group-attr-[…]` warns `malformed-attribute-variant`. The editor completes `group-<variant>:`, `group-attr-[` and their `peer-*` forms, hovers them, and sorts them after the interaction states of the same marker. `@rbxts/vela-runtime-core` gains `__VelaScope.watchedAttributeCount()` for the bench specs.
- d8e292e: Add `group-hover:`, `group-active:`, `group-focus:` and the matching `peer-*` variants, each with an optional `/name`, and the `group`, `group/name`, `peer` and `peer/name` markers. A marker lowers to a CollectionService tag (`VelaGroup`, `VelaPeer/name`), carried by `Tag` on a static React element and placed by the host on Vide, and a shared runtime-core observer finds the nearest marked ancestor or any marked sibling and reports its hover, press and focus. Peers ignore sibling order, which Roblox does not keep, and look past the `VelaMarginBox` frame an `m-*` element is wrapped in. `group-md:` and other unread states warn `unsupported-relational-variant`, and a conditional marker or one on a component element warns too. `group`, `peer`, `group-*` and `peer-*` are now reserved variant names.
- d8e292e: Warn in the editor about a class that later classes override. `bg-red-500 bg-blue-500`, `px-2 p-4` and `hover:bg-red-500 hover:bg-blue-500` now flag the first class as `overridden-class`, naming the class that wins, while partial overlaps such as `p-4 px-2` or `w-4 h-8` and classes under different conditions stay quiet. An element's subtree fade and a divide color count, so `opacity-50 opacity-75` and `divide-y divide-red-500/50 divide-blue-500` warn too. The check runs the compiler's own resolver with and without each class, so it agrees with what the build emits. The language server marks the class as unnecessary and offers only its removal. Builds do not report it.

### Patch Changes

- 3e6cc65: The language server runs on `tower-lsp-server`, the maintained fork of the unmaintained `tower-lsp`, which stops reading on the `exit` notification itself, so the server still exits on `exit` while the client holds stdin open without scanning the input stream for it.
- d8e292e: Sort a variant chain as the set of conditions it names, so `hover:md:bg-red-500 md:hover:bg-blue-500` keeps its order and the class that wins under that condition stays the same, while a chain still sorts after a shorter chain it extends, such as `dark:hover:` after `dark:`.
- d8e292e: Rank what applies the way Tailwind's stylesheet does on both paths: a matching variant beats the base wherever it is written, a wider breakpoint beats a narrower one, orientation, `dark:` and the input variants beat every breakpoint, and the last class wins among equal conditions. On the static path, margin, divide, text transform and decoration, transition and animation classes under a variant are forwarded to the runtime host instead of being dropped, a variant `opacity-*` on a component element applies and a hosted component keeps its own and inherited alpha, a grid takes its gap as `CellPadding` without a second `UIListLayout`, a variant position, translate or automatic size names one axis at a time, and the base's translate and negative margin go to the runtime once a rule moves the element. The overridden-class warning reads forwarded classes under the condition they were written with.

## 0.13.1

## 0.13.0

## 0.12.8

## 0.12.7

## 0.12.6

## 0.12.5

## 0.12.4

### Patch Changes

- 033b2bd: Exit on the `exit` notification instead of on the pipe closing behind it.

  tower-lsp ends its read loop on end of input and handles `exit` without ending
  it, so the notification alone left the server running: a client that sends it
  and holds stdin open, as one waiting for the process to go away does, was left
  with a server that never went. Editors mostly close the pipe right after and
  force-kill on a timeout, which is what kept this out of sight.

  The stdin the server reads reports end of input right behind the notification
  now, which is the path tower-lsp already unwinds cleanly, and the harness waits
  for the process to end on its own rather than killing it after 200ms.

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

## 0.12.2

## 0.12.1

## 0.12.0

## 0.11.1

## 0.11.0

## 0.10.0

## 0.9.0

## 0.8.0

## 0.7.0

## 0.6.0

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.2

## 0.4.1
