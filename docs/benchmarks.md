# Benchmarks and Studio tests

Four layers are measured, from the compiler crate out to a running place:

| Layer | Command | Where it runs |
| --- | --- | --- |
| Compiler crate (criterion) | `pnpm run bench:compiler` | CI runs each bench once on every PR; full runs on `main` and dispatch |
| napi and the rbxtsc host (vitest bench) | `pnpm run bench:host` | `main` and dispatch, locally |
| End-to-end `rbxtsc` overhead | `pnpm run bench:build` | `main` and dispatch, locally |
| Runtime in Studio (bench place plus specs) | `pnpm --filter rbxts-harness run bench:serve` | Local only; CI builds the place |

None of these gate a merge. Shared GitHub runners vary by 10 to 30% between runs, so
the numbers the `Bench` workflow uploads are for reading trends, not for asserting on.

## Compiler: `packages/compiler/benches/transform.rs`

Criterion with its default features off (no plotters, no rayon), so it adds little to
the `clippy --all-targets` compile.

| Group | What it measures |
| --- | --- |
| `transform/corpus/*` | `transform()` over the three harness `App.tsx` files, against the default config (`framework: "vide"` for the Vide one) |
| `transform/synthetic/{10,100,1000}` | A generated file of N elements cycling through a static class list, a variant one (`hover:`, `md:`, `dark:`), a dynamic one that needs the runtime host, and a static one |
| `transform/config/{none,defaults}` | One element with no `configJson` and with the full defaults, so the difference is the serde parse every file pays when the host passes the config |
| `editor/{completions,hover,diagnostics,sort}` | The editor entry points over a 1000-element document, a quarter of whose class lists repeat a property, so the overridden-class pass runs on every diagnostics call |

```sh
PATH="$HOME/.cargo/bin:$PATH" pnpm run bench:compiler
# compare against an earlier run
PATH="$HOME/.cargo/bin:$PATH" cargo bench --manifest-path packages/compiler/Cargo.toml --bench transform -- --save-baseline main
PATH="$HOME/.cargo/bin:$PATH" cargo bench --manifest-path packages/compiler/Cargo.toml --bench transform -- --baseline main
```

Criterion flags need `--bench transform`: without it the library's own test harness
receives them too and rejects `--save-baseline`. `-- --test` is the exception, and CI's
rust job runs `cargo bench --manifest-path packages/compiler/Cargo.toml -- --test`,
which executes every bench once and also runs a few sanity checks that fail if a bench
stops measuring real work (no runtime host emitted, completions or hover landing outside
a class, no `overridden-class` diagnostic). Reports land in
`packages/compiler/target/criterion`.

## Host: `packages/rbxtsc-host/bench/transform.bench.ts`

`transformSourceForHost` over the same corpus, with each harness's real `vela.config.ts`
resolved and cached the way the transformer does it, so the numbers include napi
marshalling, the config JSON cache and the IR `JSON.parse`. A second group calls the
napi `transform` with and without `configJson`.

```sh
pnpm run bench:host
```

That builds the addon with `--release` first (`build:native:release` in
`packages/compiler`). The normal `build:native` is a debug build, several times
slower, and a plain `pnpm test` in `packages/compiler` puts the debug build back.

## End to end: `scripts/bench/rbxtsc-build.ts`

Runs a clean `rbxtsc` build of a harness with the vela transformer and with
`plugins: []`, alternating, after one untimed pass of each, and reports the medians.

```sh
pnpm run bench:build                      # rbxts-harness, 5 runs each
pnpm run bench:build --harness vide-harness --runs 9
```

Each variant builds into `artifacts/bench/.work-<harness>/` with a generated Rojo
project pointing there, so the harness's own `out/` is left alone. The temporary
`tsconfig.rbxtsc-build.json` has to sit next to the harness `tsconfig.json`, because
`rbxtsc` finds the project's `node_modules` from the tsconfig's directory; it is removed
when the run ends. Results go to `artifacts/bench/rbxtsc-build-<harness>.json`. Build the
release addon first (`pnpm run bench:host` does) or the overhead includes a debug compiler.

## Runtime in Studio

### The bench place

`apps/rbxts-harness` (React) and `apps/vide-harness` (Vide) each have a `src/bench/`
compiled by `tsconfig.bench.json` and mounted by `bench.project.json`. The default
`tsconfig.json` excludes `src/bench`, and `default.project.json` does not mount it, so the
normal harness place and its emit tests are unchanged. The bench place mounts
`out/bench` as `StarterPlayerScripts.Bench` and, for React, only
`out/client/motion.luau` as `StarterPlayerScripts.Client.motion`, which is where the
emitted motion driver import (`script.Parent.Parent.Client.motion`) looks. `App`,
`Probe` and `main.client` never run in it.

| File | Role |
| --- | --- |
| `runner.ts` | The mailbox, the metrics and the spec runner. Framework-agnostic and identical in both harnesses |
| `scenarios.tsx` | The scenarios, written against React or Vide |
| `specs.tsx` | The specs |
| `main.client.ts` | `VelaBench.serve("react" \| "vide", scenarios, specs)` |

```sh
PATH="$HOME/.cargo/bin:$PATH" pnpm build          # root build first, see below
cd apps/rbxts-harness
pnpm run bench:serve                              # rbxtsc + rojo serve bench.project.json --port 34873
pnpm run bench:place                              # or a file: out/bench.rbxl
```

Port 34873 keeps it apart from the normal harness on 34872. Build from the root first:
an app built on its own uses whatever its siblings last left in `dist`, and the runtime
copies under `node_modules/@rbxts` are only refreshed by the materialize step
`build:bench` runs. Before trusting a number, check that
`ReplicatedStorage.node_modules["@rbxts"]` holds exactly one `vela-runtime`: a stale
`node_modules/@rbxts/.ignored_vela-runtime` left by pnpm is mounted under the same name
and can be the one `TS.import` picks.

### Driving it

Someone has to click Connect in Studio's Rojo plugin; nothing can reach the plugin UI.
Then start play (`start_stop_play`) and talk to the place through instances only. A
bench never requires a harness module from `execute_luau`: that call runs in its own
sandbox with its own `_G` and module cache, a raw roblox-ts module fails there, and the
failure is cached for the rest of the session. The protocol:

| Instance | Meaning |
| --- | --- |
| `ReplicatedStorage` attribute `VelaBenchRequest` | A JSON request. A change starts a run |
| `ReplicatedStorage` attribute `VelaBenchStatus` | `ready` once the bench is listening, then `running`, `done` or `error` |
| `ReplicatedStorage.VelaBenchResult` (StringValue) | The JSON result of the last run |
| Output line `VELA_BENCH {json}` | The same result, for `get_console_output` |

1. Queue a request with `execute_luau` in the `Client` datamodel. Give every request a
   new `id`: setting the attribute to the same string again fires nothing, and the id
   is how a poll tells a fresh result from the previous one.

   ```lua
   local ReplicatedStorage = game:GetService("ReplicatedStorage")
   local HttpService = game:GetService("HttpService")
   ReplicatedStorage:SetAttribute("VelaBenchStatus", "queued")
   ReplicatedStorage:SetAttribute("VelaBenchRequest", HttpService:JSONEncode({
   	id = "run-1",
   	kind = "bench", -- or "spec"
   	scenarios = { "mount-static", "mount-runtime" }, -- omit for all
   	counts = { 100, 1000 }, -- the default
   	runs = 3, -- the default is 1
   }))
   ```

2. Poll about once a second, in separate `execute_luau` calls, until the status is
   `done` or `error` and the result carries your id:

   ```lua
   local ReplicatedStorage = game:GetService("ReplicatedStorage")
   local status = ReplicatedStorage:GetAttribute("VelaBenchStatus")
   if status ~= "done" and status ~= "error" then
   	return status
   end
   return ReplicatedStorage.VelaBenchResult.Value
   ```

3. A request that arrives while a run is in progress is ignored. Rojo syncs into the Edit
   datamodel only, so stop and restart play after every rebuild.

`{ "kind": "spec" }` runs the specs instead, with `specs = { "<name>", ... }` to pick some.

### Scenarios

Every mount is split into chunks of 250 hosts with a `task.wait()` between them, so
Studio stays responsive and `execute_luau` calls keep landing. React mounts with
`createLegacyRoot`, which commits synchronously, so the timed span is the whole commit;
Vide builds synchronously inside `mount`.

Studio play mode compiles below O2, where Vide turns on strict mode and evaluates every
effect twice. The Vide bench sets `Vide.strict = false` before it serves, matching a
published game and React, which runs without `__DEV__`, and reports it as
`settings.strict` in every result.

| Scenario | Count | What is timed |
| --- | --- | --- |
| `mount-static` | requested counts | N statically lowered frames |
| `mount-runtime` | requested counts | N runtime hosts (`className` behind a call) |
| `rerender` | requested counts | Re-rendering N runtime hosts into the other class list |
| `env-broadcast` | requested counts | N `dark:` hosts after `VelaColorScheme` flips on the local player |
| `attribute-variant` | requested counts | N `selected:` hosts after each gets `Selected = true` |
| `divide-list` | 200 | One `divide-y-2` list with 200 children |
| `relational` | requested counts | Mounting and unmounting N `group` cards, each with one `group-hover:` reader inside; reports `mountedScopes` (observed groups) and `mountedFollowedTags` (place-wide tag subscriptions, one per tag at any N) |
| `unmount` | requested counts | Unmounting N runtime hosts |

Metrics, flat in each result's `metrics`:

- `*CpuMs`: `os.clock()` around the synchronous work. This is the primary number. For
  `env-broadcast` (`broadcastCpuMs`) and `attribute-variant` (`attributeCpuMs`) the span
  also resumes once behind the attribute's deferred handlers, so it holds the store
  refresh and every host's update under either `SignalBehavior`. Work those handlers
  defer again falls outside it; the settle wait (`broadcastMs`, `attributeMs`) is the
  end-to-end number for those two.
- `*Ms` and `*Frames` from a settle wait (`mountSettled`, `broadcast`, `attribute`):
  wall time and Heartbeat frames until every host shows the expected state.
- `*FrameP50Ms` and `*FrameP95Ms`: RenderStepped over 60 frames after the work. Play
  mode in Studio runs at about 15 fps, so these are coarse.
- `<phase>GcKb`, `<phase>LuaHeapMb`, `<phase>Instances`, `<phase>Listeners` for the
  `baseline`, `mounted` and `unmounted` phases: `gcinfo()`, the LuaHeap memory tag,
  `Stats.InstanceCount` and `__VelaEnv.listenerCount()`. Roblox cannot force a
  collection, so memory deltas are noisy.

`listenerCount()` is the only connection metric there is, since Roblox exposes no count
of `RBXScriptConnection`s. The environment store connects one set of Roblox signals for
the whole place. Vide reads it through one place-wide source, so its count stays at its
baseline at any N. React subscribes each runtime host to the store, so its count rises by
exactly one per host and returns to the baseline on unmount, still without a Roblox
connection per host.

### Specs

A spec is a function run under `pcall` against a fresh container; it fails by raising,
skips with `VelaBench.skip(reason)`, and anything it returns is reported as `detail`.
The result has `passed`, `failed`, `skipped` and one entry per spec.

| Spec | Asserts |
| --- | --- |
| env store | Vide: the listener count is unchanged with 100 and 1000 hosts mounted. React: exactly one listener per host at 100 and at 1000, and back to the baseline after each unmount |
| `dark:` | A host turns slate-900 when `VelaColorScheme` is `dark` and back when it is `light` |
| `selected:` | A host follows its `Selected` attribute both ways |
| divide | Children of a `divide-y-2` list sit in declared order with one separator between each pair, and the runtime ranks them exactly `0..6`: item r at `2r`, the separator after it at `2r+1` |
| divide, reversed | The same list with each child declaring a descending `LayoutOrder` renders `item-3..item-0`, still ranked `0..6` |
| group/peer | A `group` TextBox and two `peer/field` TextBoxes, one of them with its reader in margin boxes, carry their tags; the margin box carries `VelaMarginBox`; focusing each turns its reader rose-500 and blurring it turns it back; exactly three instances are observed and two tags followed while mounted, and none of either after unmount |

Without a local player (a server context), the color scheme cases skip.

## CI

- `rust` job: `cargo bench --manifest-path packages/compiler/Cargo.toml -- --test`, plus
  the existing `clippy --all-targets`, which compiles the benches.
- `test` job: installs the Rojo release both harness `rokit.toml` files pin (checksum
  verified, the same way Lune is installed for the parity harness) and runs
  `bench:place` for both harnesses after the tests, so the bench places at least build.
  Nothing executes Luau in Roblox.
- `Bench` workflow (`.github/workflows/bench.yaml`, on push to `main` and dispatch, not
  gating): the full criterion, host and build-overhead benches, uploading
  `packages/compiler/target/criterion` and `artifacts/bench/*.json`.

## Not done yet

- Roblox Open Cloud Luau Execution could run the specs in CI: upload the bench place to a
  dedicated test place and post a task that requires the runner and returns its JSON. It
  needs an API key and a universe and place id as secrets, which fork PRs do not get, and
  it runs server-side, so nothing that needs rendering, input or a viewport can be
  covered there.
- `run-in-roblox` could run the specs headlessly against a local Studio without the
  Connect click. Its 0.3.0 release is old and untested against current Studio on macOS,
  and it still needs a logged-in Studio, so it would stay local.
