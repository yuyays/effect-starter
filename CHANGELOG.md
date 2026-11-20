# Changelog

## 0.5.0

### Breaking

- **The Vue starter is removed.** `--framework vue` is rejected; the picker offers React, TanStack
  Start, or no frontend. Vue needed its own compiler, its own type-checker, and a separately pinned
  TypeScript 5.9 — a second toolchain for one variant.

### Changed

- **Generated React and TanStack Start projects use Effect atoms** (`@effect/atom-react`) instead of
  TanStack Query. The client is an `AtomHttpApi` service built from the same contract the server
  implements, so there is one state model rather than two.
  - There is no 30-second query cache: a remount refetches.
  - Contract failures arrive in `onError`; transport and decode failures arrive in `onDefect`.
  - TanStack Start wraps the query atom in `Atom.withServerValueInitial`, so server rendering does
    not fetch and discard a response.
- **The durable example is `durable-workflow`** (was `durable-agent`) and publishes automatically
  when the model proposes, matching the current policy instead of an approval gate.
- **The template is composed from files.** The eleven string patches that edited the root project's
  README, CI workflow, workspace file and lint config are gone; variant differences are whole files
  or documented placeholders.
- **The API types its database boundary as the contract's encoded shape**, so renaming or removing
  a contract field fails the build instead of failing at runtime.

### Removed

- `examples/alchemy-railway` — an evaluation pinned to an older Alchemy beta, outside CI.
- `lucide-react` from the web app and the TanStack Start overlay; nothing imported it.

### Toolchain

- Vite+ 1.7.0, with the workspace's `vite` alias tracking its bundled core.
- `@effect/tsgo` 0.73.2, including the `--tsrs` patch.
- Dependabot no longer bumps `vitest` or `@vitest/browser-playwright` on their own: Vite+ bundles
  Vitest and the browser provider peers on that exact version, so all three move together.
