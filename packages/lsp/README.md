# `@vela-rbxts/lsp`

Source package for the standalone vela-rbxts Rust LSP wrapper.

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
