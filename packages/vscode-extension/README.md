# `astra-void.vela-rbxts-lsp`

This VS Code extension launches the standalone Rust LSP through the published
`@vela-rbxts/lsp` wrapper package when the matching platform binary package is
installed.

New editor features should go through the standalone Rust LSP rather than a
TypeScript language service plugin.

## Build A Local VSIX

```sh
pnpm --filter ./packages/vscode-extension package:vsix
```

This generates:

```txt
packages/vscode-extension/dist/vela-rbxts-lsp-0.1.0.vsix
```

Install it manually with:

```sh
code --install-extension packages/vscode-extension/dist/vela-rbxts-lsp-0.1.0.vsix
```

The packaged extension id is:

```txt
astra-void.vela-rbxts-lsp
```

The VSIX packaging flow stages a temporary package snapshot and rewrites
workspace dependencies in that staging directory only. Source files are not
mutated.
