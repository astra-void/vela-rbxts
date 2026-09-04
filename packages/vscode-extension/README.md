# Vela LSP

Editor support for [vela-rbxts](https://github.com/astra-void/vela-rbxts), the
Tailwind-style `className` layer for roblox-ts. The extension launches the
standalone Rust language server and wires it to TypeScript and TSX files.

## Features

Inside a `className` (and nowhere else) you get:

- Completions with theme color swatches, fuzzy-ranked and variant-aware,
  including the breakpoints and state variants your own config defines, and the
  inline `attr-[Name=value]:` form
- Hover documentation for every supported utility and variant
- Diagnostics for unsupported families, unknown theme keys, and invalid values,
  anchored to the offending token
- Document colors and color presentations for `bg-*`, `text-*`, and the other
  color families
- Quickfix code actions and document highlight
- Optional inlay hints showing what each class lowers to

The server reuses the vela-rbxts native compiler as its semantic engine, so
what the editor tells you about a class is exactly what the build would do
with it.

## Requirements

A project that uses vela-rbxts — see the
[setup guide](https://github.com/astra-void/vela-rbxts#using-vela-rbxts-in-a-roblox-ts-project).
The language server ships inside the extension through the `@vela-rbxts/lsp`
wrapper; prebuilt binaries cover macOS (arm64/x64), Linux x64 (gnu/musl),
Linux arm64 (gnu), and Windows x64. On an unsupported platform, point
`velaRbxts.lsp.serverPath` at a `vela-rbxts-lsp` binary you built from source.

## Configuration

Your project's `vela.config.ts` or `vela.config.json` is picked up
automatically — the extension watches `**/vela.config.{ts,json}` and pushes
changes to the server, so custom theme keys complete and validate live.

| Setting | Default | What it does |
| --- | --- | --- |
| `velaRbxts.lsp.enabled` | `true` | Enable the LSP integration for TypeScript and TSX files. |
| `velaRbxts.lsp.serverPath` | `""` | Optional path to a standalone `vela-rbxts-lsp` executable. When empty, the bundled `@vela-rbxts/lsp` wrapper resolves the platform binary. |
| `velaRbxts.lsp.trace.server` | `off` | LSP trace level (`off`, `messages`, `verbose`) for debugging. |
| `velaRbxts.inlayHints.enabled` | `false` | Show what each class lowers to (the Roblox properties and helper instances) inline after the class. |

Output lands in the **vela-rbxts-lsp** output channel.

## Not Provided

Go-to-definition, references, rename, formatting, semantic tokens, and
signature help are out of scope; the server only understands `className`
values.

## Development

Maintainer docs — building the extension from source and packaging a local
VSIX — live in the repository's
[docs/release.md](https://github.com/astra-void/vela-rbxts/blob/main/docs/release.md).
