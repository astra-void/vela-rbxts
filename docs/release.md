# Release Pipeline

This repository uses an artifact-first release pipeline with strict phases:

1. `plan`
2. `build artifacts`
3. `pack tarballs / VSIX`
4. `verify artifacts`
5. `publish npm`
6. `package VSIX`

The VS Code extension is released by its own workflow, `publish-vscode.yaml`, which
`publish.yaml` dispatches once npm is published — see
[VS Code Extension Release](#vs-code-extension-release).

`pnpm release:verify` now also spins up a temporary external roblox-ts consumer,
installs the packed Vela tarballs from `artifacts/npm`, compiles a small TSX
fixture with `rbxtsc`, and checks the emitted Luau for the expected transformer
output. Set `VELA_KEEP_PACKED_CONSUMER=1` if you want the temporary consumer
directory preserved after a successful run.

Publishing scripts never build. Build scripts never publish.

## Release Flow

Changesets accumulate on `main` and a release starts when `release.yaml` is dispatched:

```bash
gh workflow run release.yaml --ref main
```

1. `release.yaml` refuses a ref other than `main` and a run with no pending changesets, then
   runs `release:version` to bump every package and write the changelogs.
2. It commits the bump straight to `main` as `chore(release): vX.Y.Z`, tags that commit, and
   dispatches `publish.yaml` on the tag.
3. `publish.yaml` validates, builds every target, packs, verifies, and publishes to npm.
4. `publish.yaml` then creates the GitHub release for the tag — see
   [GitHub Release](#github-release) — and dispatches `publish-vscode.yaml`, which packages the
   VSIX from the binaries npm just received and publishes it to the Marketplace.

Nothing opens a pull request. Releasing is the moment the workflow is dispatched, so changesets
can pile up for as long as you like and go out in one batch.

The branch push in step 2 happens before the tag: if something landed on `main` after the run
started, the push is rejected and no tag exists for a release that never happened. Re-dispatch
once `main` is settled.

The dispatch in step 2 is deliberate: a tag pushed with `GITHUB_TOKEN` raises no `push` event,
so `on: push: tags` never fires for an automated release. `workflow_dispatch` through the API
is the documented exception, which is why no PAT is involved. `on: push: tags` remains only for
a tag someone pushes by hand.

## GitHub Release

The `github release` job in `publish.yaml` creates the release for the tag once `publish npm`
succeeds, so a release page never appears for a version that failed to reach the registry. It is
skipped entirely on a dry run.

The body comes from `CHANGELOG.md`, resolved by `release:notes`:

```bash
pnpm release:notes --release-tag v0.11.0 --out release-notes.md
```

It takes the `## [X.Y.Z]` section for the tag. The root changelog is hand-maintained, so a release
can reach this point with its entries still under `## [Unreleased]`; those are used instead, and
the run logs which of the two it took. With neither carrying entries the release falls back to
GitHub's generated notes rather than failing the run.

A version with a prerelease segment is marked as a prerelease, matching the `next` dist-tag it
publishes under. Re-running a published tag edits the existing release instead of failing on the
name — with one exception: generated notes are only written on creation, since `gh release edit`
cannot generate them, so a re-run leaves that body alone.

The job covers both entry points into `publish.yaml`. An automated release arrives through the
`workflow_dispatch` from `release.yaml`, a hand-pushed tag through `on: push: tags`, and either
way the release is created at the end of the same pipeline.

## npm Authentication

Publishing uses **npm trusted publishing (OIDC)**. There is no `NPM_TOKEN` anywhere; the job
carries `id-token: write` and passes `--provenance`.

Trusted publishing is configured **per package** on npmjs.com. A package published by hand before
its trusted publisher exists will fail the pipeline with a misleading `404 Not Found - PUT`, which
is how npm reports "no permission". When adding a package to the release set, add its trusted
publisher (repository `astra-void/vela-rbxts`, workflow `publish.yaml`) before the first automated
release.

`release:publish:npm` skips versions already on the registry, so re-dispatching after a partial
failure picks up only the stragglers. The extension release is dispatched only after `publish npm`
succeeds, because the VSIX is built from the LSP binaries that job puts on the registry.

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

If `@vela-rbxts/compiler-wasm` fails:

1. Install [`wasm-pack`](https://drager.github.io/wasm-pack/installer/) (`cargo install wasm-pack`) and the
   `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`). The build script checks both
   and names whichever is missing.
2. Re-run `pnpm --filter @vela-rbxts/compiler-wasm run build` and confirm `packages/compiler-wasm/dist` holds
   `vela_compiler.js`, its `.d.ts`, and `vela_compiler_bg.wasm`.

If one package fails `publish npm` with `404 Not Found - PUT`:

1. That package has no trusted publisher on npmjs.com — see [npm Authentication](#npm-authentication).
   The other packages in the run are unaffected and stay published.
2. Add it, then re-dispatch. The already-published versions are skipped.

If only the Marketplace publish fails:

1. Nothing about the npm release needs repeating. Re-run `publish-vscode.yaml` alone against the
   same tag — see [VS Code Extension Release](#vs-code-extension-release).

## VS Code Extension Release

`publish-vscode.yaml` releases the extension on its own. It takes a `release_tag`, checks that
tag out, and packages one VSIX per VS Code target:

1. `release:vsix:version` asks the Marketplace which versions exist and resolves the version to
   publish — see [VSIX Versioning](#vsix-versioning).
2. `release:lsp:fetch` downloads the published `@vela-rbxts/lsp-*` binary packages for the tag's
   version and lays them out under `artifacts/lsp/<rust-target>/` exactly as a build would.
3. `release:vsix` stages those binaries through `@vela-rbxts/lsp` and packages the VSIX files.
4. `publish:vsix` uploads them, unless `dry_run=true`.

Because the binaries come off npm, the workflow needs no Rust toolchain and no matrix — it runs
in a couple of minutes and ships exactly the binaries consumers install. The trade-off is that it
can only release a tag whose npm packages are already published, which is why `publish.yaml`
dispatches it after `publish npm` rather than beside it.

Re-run it by hand whenever only the Marketplace step needs another attempt:

```bash
gh workflow run publish-vscode.yaml --ref v0.5.1 -f release_tag=v0.5.1 -f dry_run=false
```

When the Marketplace rejects something in the extension itself, such as a display name too close
to an existing extension's, the fix cannot go into a tag npm already published from. Land it on
`main` and package from there with `source_ref`, keeping `release_tag` on the release so the LSP
binaries still come from its npm version:

```bash
gh workflow run publish-vscode.yaml --ref main -f release_tag=v0.15.0 -f source_ref=main -f dry_run=false
```

## VSIX Dependency On LSP

`pnpm release:vsix` requires LSP artifacts in `artifacts/lsp`, from either `release:build` or
`release:lsp:fetch`. The VSIX packaging phase stages those binaries through `@vela-rbxts/lsp`
and fails if a target's binary is missing.

## Local VSIX Build

```sh
pnpm --filter ./packages/vscode-extension package:vsix
```

This generates `packages/vscode-extension/dist/vela-rbxts-lsp-<version>-<host-target>.vsix`.
A specific VS Code target can be packaged explicitly:

```sh
pnpm --filter ./packages/vscode-extension package:vsix -- --target win32-x64 --out ./dist/vela-rbxts-lsp-<version>-win32-x64.vsix
```

Install the result with `code --install-extension <path-to-vsix>`. The packaged
extension id is `astra-void.vela-rbxts-lsp`. Packaging stages a temporary
snapshot and rewrites workspace dependencies in that staging directory only —
source files are not mutated.

## VSIX Versioning

The packaged extension uses a date version, `YYYY.M.DDNNN`, rather than the release tag:
a UTC date plus a same-day build counter, so `2026-07-20` first packages as `2026.7.20001`.
This applies to the staged manifest only — `packages/vscode-extension/package.json` keeps its
semver version and still moves in lockstep with the other packages.

Marketplace versions can never be reused or rolled back, so the counter has to move for every
release on one UTC date — including a stable release that follows a prerelease on that date.
`release:vsix:version` resolves it against the Marketplace itself: it reads the published
versions, takes the highest counter already used for today, and adds one. Nothing has to be
remembered between releases, and a same-day re-release needs no extra input.

Both inputs still override it. `vsix_build_number=4` pins the counter, and
`vsix_version=2026.7.20005` pins the whole version. Either skips the Marketplace query, so a
pinned value that is already published fails the publish step the way it always did.

A build number is only spent when a VSIX actually reaches the Marketplace. A run that fails
before the publish step leaves the number free, and the next run resolves to it again.

Every VSIX goes to the stable Marketplace channel; `--pre-release` is never passed. The
Marketplace separates channels by an odd/even minor version, which a date version cannot
express, and the two channels would otherwise collide on one number. A `vX.Y.Z-next.N` tag
still selects the `next` npm dist-tag — only the Marketplace channel is unaffected by it.

## Manual Dispatch Options

For `workflow_dispatch` on `.github/workflows/release.yaml`:

- `dry_run=true`: version the workspace and print the tag and dist-tag it would release, without
  committing, tagging, or publishing anything. This is how you preview a bump now that no release
  PR shows it.
- `publish_vscode_extension=false`: release npm only; `publish.yaml` will not dispatch the
  extension workflow.

For `workflow_dispatch` on `.github/workflows/publish.yaml`:

- `dry_run=true`: validates the release flow without real npm publishing, and dispatches the
  extension workflow in its own dry-run mode.
- `vsix_version`: optional Marketplace-compatible `major.minor.patch` override, passed straight
  to the extension workflow.
- `publish_vscode_extension=false`: publish npm only; do not dispatch the extension workflow.
- `publish_vscode_extension=true`: dispatch the extension workflow once npm is published.

For `workflow_dispatch` on `.github/workflows/publish-vscode.yaml`:

- `release_tag`: required; the tag to package the extension from. Its npm packages must already
  be published.
- `source_ref`: optional commit or branch to package the extension from instead of the tag; the
  LSP binaries are still fetched for `release_tag`'s version.
- `vsix_version`: optional `major.minor.patch` override for the staged VSIX manifest version.
- `vsix_build_number`: optional same-day counter (1-999); empty resolves the next free one from
  the Marketplace.
- `dry_run=true`: package and upload the VSIX files as a workflow artifact without publishing.
- `VSCE_PAT` is required only for real VS Code Marketplace publishing.
