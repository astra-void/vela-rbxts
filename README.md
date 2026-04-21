# rbxts-tailwind

Base monorepo skeleton for rbxts-tailwind using pnpm workspace + Turborepo.
This stage includes shared config, package boundaries, and harness apps.

## Apps

- apps/compiler-harness: Compiler-native debug harness that directly exercises @rbxts-tailwind/compiler.
- apps/rbxts-harness: Minimal real rbxts consumer app harness for validating app-boundary TSX and className usage.

## Packages

- packages/ir
- packages/core
- packages/config
- packages/types
- packages/compiler
- packages/rbxtsc-host

## Package Roles

- @rbxts-tailwind/ir: Intermediate representation layer contracts and primitives.
- @rbxts-tailwind/core: Semantic contracts and ownership boundary (non-executable).
- @rbxts-tailwind/config: Configuration contracts and loading entry points.
- @rbxts-tailwind/types: Workspace-wide shared public types.
- @rbxts-tailwind/compiler: Real Rust/SWC/N-API compiler execution and semantic resolution.
- @rbxts-tailwind/rbxtsc-host: Host adapter boundary for rbxtsc integration (host-only).

## Commands

```bash
pnpm install
pnpm build
pnpm dev
pnpm lint
pnpm typecheck
pnpm clean
```
