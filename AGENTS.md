# Effect architecture

- Backend application workflows return `Effect<A, E, R>`: describe work lazily
  and compose it until an entrypoint or framework adapter executes it.
- Prefer named `Effect.fn("Service.operation")` for reusable backend operations;
  use `Effect.gen` for inline composition and layer construction.
- Represent expected failures in `E` with tagged errors; keep unexpected defects
  distinct. Declare public errors and HTTP statuses in
  [the HttpApi contract](packages/contracts/src/http/index.ts).
- Provide external capabilities through `Context.Service` and `Layer`. Wrap
  Promise-based SDK operations at their adapter with `Effect.tryPromise` for
  expected rejection, forwarding cancellation where the SDK supports it.
- Keep resources and background work scoped, with cleanup and failure reporting.
  Background fibers belong to an owning scope rather than detached timers.
- Keep `run*` calls at entrypoints, framework integration adapters, and tests.
  Adapters translate and delegate. Wrapping an entire first-party async application
  in `Effect.promise` does not make it Effect-based; compose Effects directly.
- Pure functions stay plain TypeScript. UI callbacks and SDK hooks may use their
  required Promise interfaces; this policy does not require converting UI code.
- When extending legacy Promise-based backend workflows, migrate the affected
  operation to Effect rather than expanding the async application. Unrelated
  operations do not require a rewrite.

Before adding a backend workflow, read [the users workflow](apps/api/src/services/users.ts)
and [its database layer](apps/api/src/db/client.ts). Follow their composition and
dependency patterns; add abstractions only for capabilities the workflow needs.
See also [the HTTP adapter](apps/api/src/http.ts) and [the entrypoint](apps/api/src/main.ts).

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` (or the `bun` equivalents) before
finishing. The Effect compiler profile and lint enforce these rules independently of install
hooks, and each message says how to fix the violation. Running Effects is limited to
entrypoints: add an override in `vite.config.ts` when introducing a framework adapter.
Diagnostic suppressions require a `-- reason` suffix.
Shared versions (Effect, Vite+) come from the workspace catalog in `pnpm-workspace.yaml`,
or `workspaces.catalog` in `package.json` for Bun; declare those packages as `catalog:`.
