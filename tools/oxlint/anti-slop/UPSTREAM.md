# Upstream

- Source: https://github.com/dmmulroy/anti-slop, `src/`
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-13)
- License: MIT, retained in `LICENSE`.

## Vendored subset

Only these rules and the shared modules they import are copied:

- `anti-slop`: `no-chained-type-assertions`, `no-module-mocking`, `no-reduce-accumulator-copy`,
  `no-unknown-parameters`, `no-unknown-returns`, `no-unsafe-dictionary-type`,
  `no-widen-then-assert`.
- `anti-slop-effect`: `no-manual-effect-error-tag`, `no-manual-tagged-construction`.

The type-aware `effecttsgo/*` rules from `@effect/tsgo` cover the remaining catch and tag
patterns, so `no-manual-tag-comparison` and `prefer-effect-match` are not vendored.
`no-service-constructor-imports` is omitted because it treats every relative `make*` import as a
service constructor. Upstream's formatting, naming, and `typeof` rules are omitted as policy choices.

## Local deviations

- `index.ts` and `effect/index.ts` register only the vendored rules.
- `rules/no-module-mocking.ts` also recognizes `vi` imported from `vite-plus/test` and
  `@effect/vitest`, which re-export Vitest's `vi`.
- `vite.config.ts` scopes the rules and exempts test wire-format fixtures; see its `overrides`.

## Updating

Fetch an explicit upstream revision, diff each vendored file against this commit, port relevant
fixes while keeping the deviations above, and update this record. The deliberate-violation tests in
`tools/effect-policy.test.js` must still pass.
