# vela-rbxts-lsp

## 0.15.0

### Minor Changes

- 8391d72: Diagnostics can be tuned per code. The LSP reads `lint`, a map from a diagnostic code to `error`, `warning`, `info`, `hint` or `ignore` that replaces the default severity, and `validate`, which stops publishing diagnostics while completions, hover and colors keep working. Both arrive through `initializationOptions` or under `velaRbxts` in `workspace/didChangeConfiguration`, and open documents are re-published when they change. VS Code exposes them as `velaRbxts.lint` and `velaRbxts.validate`.
- 5b2e9ac: Editor features now reach class lists outside the `className` attribute. A `const` string that a `className` names is completed, hovered, checked and sorted where it is declared, against what every element naming it shares, matching the const the compiler lowers. A new `classFunctions` editor option (`velaRbxts.classFunctions` in VS Code, `initializationOptions.classFunctions` or `workspace/didChangeConfiguration` elsewhere) lists helpers whose arguments are read wherever they are called, including tagged templates and cva-style variant maps, where `defaultVariants` and the variant names in `compoundVariants` are skipped. `get_class_tokens` takes the editor options as a second argument.
- c0d0e92: The VS Code extension contributes three commands: **Vela: Restart Language Server**, which restarts the server and re-reads every `vela.config` without reloading the window, **Vela: Show Output**, and **Vela: Sort Classes**, which runs `source.sortVelaClasses` on the active TypeScript or TSX file.

### Patch Changes

- 3110adf: Rename the VS Code extension's display name from Vela LSP to Vela Roblox IntelliSense. The marketplace ID `astra-void.vela-rbxts-lsp`, the `velaRbxts.lsp.*` settings and the `@vela-rbxts/lsp` server package keep their names, so existing installs and settings carry over.
- Updated dependencies [9eb6c01]
- Updated dependencies [8391d72]
- Updated dependencies [5b2e9ac]
  - @vela-rbxts/lsp@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [93b86f2]
- Updated dependencies [d8e292e]
- Updated dependencies [94f1bdc]
- Updated dependencies [d8e292e]
- Updated dependencies [3e6cc65]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
- Updated dependencies [d8e292e]
  - @vela-rbxts/lsp@0.14.0

## 0.13.1

### Patch Changes

- @vela-rbxts/lsp@0.13.1

## 0.13.0

### Patch Changes

- @vela-rbxts/lsp@0.13.0

## 0.12.8

### Patch Changes

- c5401b1: Ship the vela config loader the editor extension is built around.

  The extension bundles the loader that evaluates `vela.config.ts` for the language
  server, and the VSIX workflow built that bundle without building the loader
  package first. esbuild leaves a `require` it cannot resolve inside a try/catch
  where it stands and says nothing about it, so packaging went green over a bundle
  that had no loader in it, and the published extension read no project config at
  all: every key a project defined was checked against the default theme, which is
  the failure the release before this one taught the extension to report.

  The loader is imported outright now, so a bundle built without it fails the
  build. The workflow builds it before the bundle, and packaging refuses a staged
  bundle that still resolves the loader at runtime.

  - @vela-rbxts/lsp@0.12.8

## 0.12.7

### Patch Changes

- 3192917: Say so when a `vela.config.ts` fails to load, instead of falling back in silence.

  The editor extension evaluates the config and pushes the result to the language
  server, which cannot run TypeScript itself. A config the loader could not read
  was written to the extension's output channel and nowhere else, and the server
  went on checking class names against the default theme, so every key the project
  defined read as an unknown one while the same file compiled without complaint.

  The failure is raised as a notification now, naming the file and the reason, with
  the log one click away. It is not repeated while the reason stays the same, and a
  config that loads on a later save clears it.

  - @vela-rbxts/lsp@0.12.7

## 0.12.6

### Patch Changes

- @vela-rbxts/lsp@0.12.6

## 0.12.5

### Patch Changes

- @vela-rbxts/lsp@0.12.5

## 0.12.4

### Patch Changes

- Updated dependencies [033b2bd]
  - @vela-rbxts/lsp@0.12.4

## 0.12.3

### Patch Changes

- Updated dependencies [3c2d451]
  - @vela-rbxts/lsp@0.12.3

## 0.12.2

### Patch Changes

- @vela-rbxts/lsp@0.12.2

## 0.12.1

### Patch Changes

- @vela-rbxts/lsp@0.12.1

## 0.12.0

### Patch Changes

- @vela-rbxts/lsp@0.12.0

## 0.11.1

### Patch Changes

- @vela-rbxts/lsp@0.11.1

## 0.11.0

### Patch Changes

- @vela-rbxts/lsp@0.11.0

## 0.10.0

### Patch Changes

- @vela-rbxts/lsp@0.10.0

## 0.9.0

### Patch Changes

- @vela-rbxts/lsp@0.9.0

## 0.8.0

### Patch Changes

- @vela-rbxts/lsp@0.8.0

## 0.7.0

### Patch Changes

- @vela-rbxts/lsp@0.7.0

## 0.6.0

### Patch Changes

- @vela-rbxts/lsp@0.6.0

## 0.5.2

### Patch Changes

- @vela-rbxts/lsp@0.5.2

## 0.5.1

### Patch Changes

- 09f563d: Redraw the Marketplace icon as a sail. The name comes from the constellation
  Vela, the sails of the Argo, so the lettermark gives way to a sloop under sail —
  a jib and a mainsail whose leech curves out under the wind, over a hull. The
  brand gradient and the rounded canvas carry over unchanged, and the mark stays
  legible down to the 40px the extension list renders it at.
  - @vela-rbxts/lsp@0.5.1

## 0.5.0

### Patch Changes

- @vela-rbxts/lsp@0.5.0

## 0.4.2

### Patch Changes

- 79683f8: Move the VS Code extension to `vscode-languageclient` 10, which raises the
  minimum VS Code version to 1.91. The old client pinned `minimatch` 5, the last
  line still resolving `brace-expansion` 2.x, and that is what kept the repository
  on a package flagged by GHSA-mh99-v99m-4gvg.
  - @vela-rbxts/lsp@0.4.2

## 0.4.1

### Patch Changes

- @vela-rbxts/lsp@0.4.1
