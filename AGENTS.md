# Effect architecture

- Backend application workflows return `Effect<A, E, R>`: describe work lazily
  and compose it until an entrypoint or framework adapter executes it.
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
