# `@vela-rbxts/lsp`

Source package for the standalone vela-rbxts Rust LSP wrapper.

## Capabilities

- Completion, hover, and document colors for `className` utilities.
- Diagnostics for unknown theme keys, unsupported utilities, and invalid values
  (debounced while typing, synced incrementally).
- Quick-fix code actions: replace a token with the nearest valid suggestion, or
  remove it.
- Document highlight for every occurrence of the class token under the cursor.
- Optional inlay hints summarizing what each class lowers to, off until the
  client sends `velaRbxts.inlayHints.enabled` (through
  `initializationOptions.inlayHints` at startup or
  `workspace/didChangeConfiguration` later).
- Project-config aware: the editor client loads each `vela.config.ts` and pushes
  the resolved theme via the `vela-rbxts/setConfigs` notification (and through
  `initializationOptions.configs` at startup). The server picks the config
  nearest to each source file, so custom theme tokens, configured breakpoints
  and registered variants resolve instead of being flagged as unknown.

The release flow stages publish artifacts under `packages/lsp/.npm/publish`:

- the wrapper package lives at the stage root
- platform-specific binary packages live under `stage/npm/<platform>`
- Linux binaries are split into `gnu` and `musl` packages

The published wrapper starts the matching prebuilt binary package for the
current platform. In the monorepo, the VSCode extension falls back to:

```sh
cargo run --manifest-path packages/lsp/Cargo.toml
```

That fallback is for local development only. Release artifacts should use the
staged wrapper and binary packages generated from this package.

Release staging expects `zig` and `cargo-zigbuild` to be available so the
platform binaries can be cross-compiled before npm publish.
