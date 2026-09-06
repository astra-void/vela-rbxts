# @vela-rbxts/lsp

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
