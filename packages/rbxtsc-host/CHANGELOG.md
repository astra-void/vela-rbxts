# @vela-rbxts/rbxtsc-host

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
