# Effect architecture

- Compose backend steps as Effects. Use `Effect.fn` or `Effect.gen` with `yield*` for
  multi-step workflows. Use Promise adapters only at boundaries that require them,
  such as calls to Promise-based SDKs. Pure helpers and UI callbacks can stay plain
  TypeScript.
- Close resources and stop background tasks when the service or operation that started
  them ends. Report failures and pass cancellation signals to SDKs that accept them.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:browser` where it exists
(or Bun equivalents) before finishing.
Name API tests that open real sockets or processes `*.integration.test.ts`.

# Workspace imports

Share API contracts through `packages/contracts` and call the API through its typed
client.

# Test quality

- Test observable contracts and plausible failures; derive expectations independently
  of the implementation. Avoid tautologies that merely repeat mock outputs or code logic.
- Observable effects are valid assertions when they express a public contract: callback
  calls, cancellation signals, and retry or deduplication counts.
- A test for a change must fail on the old code and pass on the new code.
- Consolidate redundant coverage. Avoid change detectors that pin private structure,
  source text, constants, or wording unless these are explicit contracts.
- Delete retired-feature tests; assert code stays absent only for an explicit policy.
  Preserve meaningful contracts, errors, boundary cases, and required external interactions.
