# Effect architecture

- Compose backend workflows directly in Effect; wrapping first-party async workflows
  in `Effect.promise` is insufficient. Pure functions and UI callbacks need no conversion.
- Give resources and background fibers an owning scope, cleanup, and failure reporting;
  forward cancellation to external SDKs where supported.
- When extending a legacy Promise-based backend operation, migrate that operation
  to Effect without rewriting unrelated operations.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:browser` where it exists
(or Bun equivalents) before finishing.
Name API tests that open real sockets or processes `*.integration.test.ts`.

# Workspace imports

- Keep app implementations private: apps share contracts through `packages/contracts`
  and call the API through its typed client. Contracts stay independent of apps.
- Import another workspace by its package name and declared public exports. Use
  relative paths within a workspace; cross-workspace source paths are rejected by lint.
- Keep database access and runtime wiring in `apps/api`. Extract another shared
  package when a second backend consumer needs the same implementation.

# Test quality

- Test observable contracts and plausible failures; derive expectations independently
  of the implementation. Avoid tautologies that merely repeat mock outputs or code logic.
- Consolidate redundant coverage. Avoid change detectors that pin private structure,
  source text, constants, or wording unless these are explicit contracts.
- Delete retired-feature tests; assert code stays absent only for an explicit policy.
  Preserve meaningful contracts, errors, boundary cases, and required external interactions.
