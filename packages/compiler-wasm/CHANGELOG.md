# @vela-rbxts/compiler-wasm

## 0.4.2

### Patch Changes

- d49e8b3: Add `@vela-rbxts/compiler-wasm`, a WebAssembly build of the compiler crate. Same source as the native addon, exposing `transform` so class lowering can run where the platform binary cannot be loaded — the docs playground compiles with it in the browser.
