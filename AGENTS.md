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

The API's compiler profile enforces Effect correctness and recommends named
`Effect.fn` operations. Run `pnpm typecheck` (or `bun run typecheck`) to check it;
the scripts invoke the Effect compiler directly, independently of install hooks.
Lint restricts runtime execution to `main.ts` and `http.ts`; API tests run Effects with
`it.effect` from `@effect/vitest`. Add an explicit override in `vite.config.ts` when
introducing a framework adapter. `pnpm lint` and `pnpm test` apply the Effect Oxlint patch
themselves, so they also work without install hooks.
Diagnostic suppressions require a `-- reason` suffix.
Lint also runs the type-aware `effecttsgo` rules and a vendored anti-slop subset (see
[its provenance](tools/oxlint/anti-slop/UPSTREAM.md)): recover with `Effect.catchTag(s)`,
construct tagged values through their Schema or error class, hoist Schema decoders to module
scope, replace dependencies through Layers rather than module mocks, and run test Effects with
`it.effect` and `TestClock`. The web app imports the API only through the contracts package. `pnpm test` also verifies
that deliberate compiler and lint violations fail, even without this document.
