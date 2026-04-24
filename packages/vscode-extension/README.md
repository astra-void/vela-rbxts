# `@vela-rbxts/vscode-extension`

This VSCode extension launches the standalone Rust LSP through the published
`@vela-rbxts/lsp` wrapper package when the matching platform binary package is
installed.

`packages/ts-plugin` remains in the monorepo as a legacy or transitional
package, but new editor features should go through the standalone Rust LSP
instead of the TypeScript plugin.

For monorepo development, the extension can fall back to:

```sh
cargo run --manifest-path packages/lsp/Cargo.toml
```

That Cargo-based launch path is useful during local development, but it is not
the right packaged release strategy. Packaged releases should use the staged
`@vela-rbxts/lsp` wrapper and the platform-specific binary packages it depends
on.
