# Durable workflow example: document review

An optional example of a durable workflow built on this starter's stack. It is
not copied into generated apps.

A submitted document goes through these steps:

1. The API saves a run and queues proposal work in one transaction.
2. A worker runs a bounded tool loop (at most four model turns, one read-only
   `lookup_policy` tool). It commits each model response before acting on it.
3. The proposal and the intent to publish commit together, so a crash after the
   proposal is stored cannot strand a run that nobody will publish.
4. The proposal is sent to an external HTTP sink with a stable `Idempotency-Key`,
   and the receipt is recorded.

Run state lives in PostgreSQL. Background work uses Effect's SQL-backed
`PersistedQueue` (an unstable API), which delivers at least once. The handlers
tolerate redelivery: committed model turns are replayed, not re-requested, and
the publish key stays the same across retries. A crash after the sink accepts a
write therefore yields one record, provided the sink honours idempotency keys.
After three attempts per phase, a run becomes `failed`. An exhausted publish is
reported as an unknown outcome, because the sink may already hold the record.

| Module           | Owns                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `src/runs.ts`    | Every state transition: `AgentRuns` (start, read, cancel) for the API, `RunJobs` for the worker |
| `src/api.ts`     | HTTP routes, bearer authentication, HTTP error mapping                                          |
| `src/worker.ts`  | Queue consumption                                                                               |
| `src/propose.ts` | OpenAI Responses API calls and the tool contract                                                |
| `src/publish.ts` | External publishing with idempotency keys                                                       |
| `src/db.ts`      | PostgreSQL client, migrations, and the queue                                                    |

## Run it

```sh
cp examples/durable-workflow/.env.example examples/durable-workflow/.env  # then fill it in
pnpm --filter @effect-starter-examples/durable-workflow dev     # API on :3001
pnpm --filter @effect-starter-examples/durable-workflow worker  # in another shell
```

### Run without a model key

`worker:fake` swaps the OpenAI client for a deterministic model: one `lookup_policy`
turn, then a fixed invoice proposal. The OpenAI layer is never built in this mode, so
`OPENAI_API_KEY` and `OPENAI_MODEL` are not read. The database, token, and publish
settings are still real, so the queue and recovery code is unchanged; because the demo
model never fails, OpenAI request failures and their retries are not exercised.

```sh
pnpm --filter @effect-starter-examples/durable-workflow worker:fake
```

```sh
curl -X POST localhost:3001/runs -H 'authorization: Bearer <API_TOKEN>' \
  -H 'idempotency-key: invoice-42' -H 'content-type: application/json' \
  -d '{"document":"Invoice #42 from Acme for office supplies"}'
curl localhost:3001/runs/<id> -H 'authorization: Bearer <API_TOKEN>'
```

`POST /runs/:id/cancel` stops a run that is still processing. Once the proposal is
stored and publishing starts, the run can no longer be cancelled, because the sink may
already hold the record. The static bearer token stands in for a real identity
provider. The API needs only `DATABASE_URL` and `API_TOKEN`; the worker needs the model
and sink settings, and `worker:fake` needs `DATABASE_URL` plus the sink settings.

## Test it

The tests use a real PostgreSQL database and create a temporary schema for each test:

```sh
DOC_REVIEW_TEST_DATABASE_URL=postgres://… pnpm test:examples
pnpm typecheck:examples
```

They cover duplicate and conflicting submissions, automatic publication, replay of committed model turns, the turn limit, retry exhaustion, repeatedly
crashing deliveries, cancellation, queue offers rolling back with their transaction,
and a single sink record after the first publish acknowledgement is lost. The
`Examples` workflow runs them against PostgreSQL 18 on every pull request.
