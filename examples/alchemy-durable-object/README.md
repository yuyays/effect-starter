# Alchemy Durable Object lifetimes

A minimal Cloudflare Durable Object that shows where a resource should be acquired
when it has to survive a request, and what Alchemy does — and does not — close.

Alchemy's Durable Object has two construction effects. The outer resolves the
instance state; the inner returns the public API. Both run once per in-memory
instance under `blockConcurrencyWhile`. Their scope is **not tied to any call**,
and workerd has **no isolate-teardown hook**. Every RPC, fetch and alarm instead
runs with a fresh `Scope`, closed via `state.waitUntil` after the response.

| Route                    | Acquired in                            | Released                                         |
| ------------------------ | -------------------------------------- | ------------------------------------------------ |
| `/do/:name/per-call`     | the RPC method                         | after the response, by the call scope            |
| `/do/:name/construction` | the construction phase                 | never on success; eviction discards the instance |
| `/do/:name/retained`     | construction, under a retained `Scope` | on failed construction; never on success         |
| `/do/:name/closed/:key`  | —                                      | finalizer count written to storage               |

The important consequence: a resource needed by later requests is **safe to
acquire in construction**, but nothing cleans it up on success. Eviction ends the
instance without running those finalizers. `withInstanceScope` retains a scope for
that resource and closes it only when construction fails, which releases partial
state after a failed activation. It is not a way to free the resource on success.

## Run it

The tests deploy the real stack into local workerd — no Cloudflare account:

```sh
pnpm install
pnpm test
pnpm typecheck
```

`pnpm dev` runs `alchemy dev` for a live local Worker. `pnpm deploy` is optional
and needs Cloudflare credentials.

```sh
curl localhost:<port>/do/demo/construction
curl localhost:<port>/do/demo/per-call
curl localhost:<port>/do/demo/closed/per-call
```

## What the tests prove

- Each `test/lifetime.integration.test.ts` run uses a fresh object name. After the
  first `per-call` request the finalizer counter reaches exactly 1; after the
  second it reaches 2. The two requests return different handle ids, so each call
  acquired its own handle.
- Construction and retained handle ids stay the same across requests, and their
  bodies report `closed: false`.
- Failed construction closes the retained scope and releases its resources
  (`src/scope.test.ts`). A throwing constructor leaves the local Durable Object
  unusable for later RPCs, so this branch is proven at the Effect seam rather
  than through workerd.

The harness does not expose object eviction, so the success path intentionally
leaves the retained scope open. Do not put process-wide cleanup in a Durable
Object constructor, and do not assume a finalizer will run on eviction.

## Version

Alchemy, `@alchemy.run/cloudflare` and `@alchemy.run/test` are pinned to
`2.0.0-beta.87`; these APIs are still beta.
