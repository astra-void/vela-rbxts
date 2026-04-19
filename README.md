# rbxts-tailwind

Base monorepo skeleton for rbxts-tailwind using pnpm workspace + Turborepo.
This stage only includes shared config and package placeholders.

## Packages

- packages/ir
- packages/core
- packages/config
- packages/types
- packages/compiler
- packages/rbxtsc-host

## Package Roles

- @rbxts-tailwind/ir: Intermediate representation layer contracts and primitives.
- @rbxts-tailwind/core: Core domain flow and shared utility boundary.
- @rbxts-tailwind/config: Configuration contracts and loading entry points.
- @rbxts-tailwind/types: Workspace-wide shared public types.
- @rbxts-tailwind/compiler: Compile pipeline orchestration entry package.
- @rbxts-tailwind/rbxtsc-host: Host adapter boundary for rbxtsc integration.

## Commands

```bash
pnpm install
pnpm build
pnpm dev
pnpm lint
pnpm typecheck
pnpm clean
```
