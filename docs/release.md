# Release Pipeline

This repository uses an artifact-first release pipeline with strict phases:

1. `plan`
2. `build artifacts`
3. `pack tarballs / VSIX`
4. `verify artifacts`
5. `publish npm`
6. `package VSIX`

Publishing scripts never build. Build scripts never publish.

## Commands

Dry-run prerelease (`next`):

```bash
pnpm release:dry-run:next
```

Real prerelease (`next`):

```bash
pnpm release:next
```

Real stable release (`latest`):

```bash
pnpm release:latest
```

## Artifact Layout

All release outputs are under `artifacts/`:

```txt
artifacts/
  npm/      # packed .tgz tarballs + pack manifest
  native/   # compiler native .node artifacts by target
  lsp/      # lsp binaries by target
  vsix/     # packaged VSIX files
  logs/     # build logs/manifests
  verify/   # verification report
```

## Failure Handling

If native artifacts fail:

1. Re-run `pnpm release:build` and confirm all configured compiler targets are present in `artifacts/native`.
2. Ensure required toolchains are installed for the failed target (Windows runner for Windows, Zig only for Linux cross targets that need it).

If LSP artifacts fail:

1. Re-run `pnpm release:build` and confirm each target binary exists under `artifacts/lsp/<target>/`.
2. Verify Rust target toolchain installation for the failed target.

## VSIX Dependency On LSP

`pnpm release:vsix` requires already built LSP artifacts in `artifacts/lsp`.
The VSIX packaging phase stages those binaries through `@vela-rbxts/lsp` and fails if the current platform binary is missing.
