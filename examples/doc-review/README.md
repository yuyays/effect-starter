# Document-review agent example

An optional example of a durable domain agent built on this starter's stack. It is
not copied into generated apps.

A submitted document goes through these steps:

1. The API saves a run and queues proposal work in one transaction.
2. A worker runs a bounded tool loop (at most four model turns, one read-only
   `lookup_policy` tool). It commits each model response before acting on it.
3. The run waits in `awaitingApproval` until a reviewer approves or rejects the
   proposal version they saw.
4. An approved proposal is sent to an external HTTP sink with a stable
   `Idempotency-Key`, and the receipt is recorded.

Run state lives in PostgreSQL. Background work uses Effect's SQL-backed
`PersistedQueue` (an unstable API), which delivers at least once. The handlers
tolerate redelivery: committed model turns are replayed, not re-requested, and
the publish key stays the same across retries. A crash after the sink accepts a
write therefore yields one record, provided the sink honours idempotency keys.
After three attempts per phase, a run becomes `failed`. An exhausted publish is
reported as an unknown outcome, because the sink may already hold the record.

| Module           | Owns                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `src/runs.ts`    | Every state transition: `AgentRuns` (start, read, decide, cancel) for the API, `RunJobs` for the worker |
| `src/api.ts`     | HTTP routes, bearer authentication, HTTP error mapping                                                  |
| `src/worker.ts`  | Queue consumption                                                                                       |
| `src/propose.ts` | OpenAI Responses API calls and the tool contract                                                        |
| `src/publish.ts` | External publishing with idempotency keys                                                               |
| `src/db.ts`      | PostgreSQL client, migrations, and the queue                                                            |

## Run it

```sh
cp examples/doc-review/.env.example examples/doc-review/.env  # then fill it in
pnpm --filter @effect-starter-examples/doc-review dev     # API on :3001
pnpm --filter @effect-starter-examples/doc-review worker  # in another shell
```

```sh
curl -X POST localhost:3001/runs -H 'authorization: Bearer <SUBMITTER_TOKEN>' \
  -H 'idempotency-key: invoice-42' -H 'content-type: application/json' \
  -d '{"document":"Invoice #42 from Acme for office supplies"}'
curl localhost:3001/runs/<id> -H 'authorization: Bearer <SUBMITTER_TOKEN>'
curl -X POST localhost:3001/runs/<id>/decision -H 'authorization: Bearer <REVIEWER_TOKEN>' \
  -H 'content-type: application/json' -d '{"version":1,"decision":"approve"}'
```

`POST /runs/:id/cancel` stops a run that is still processing or awaiting approval.
Once publishing has been approved, the run can no longer be cancelled. Either token
may submit, read, or cancel; only the reviewer token may decide. The two static tokens
stand in for a real identity provider. The API needs only `DATABASE_URL` and the
tokens; the worker needs the model and sink settings.

## Test it

The tests use a real PostgreSQL database and create a temporary schema for each test:

```sh
DOC_REVIEW_TEST_DATABASE_URL=postgres://… pnpm test:examples
pnpm typecheck:examples
```

They cover duplicate and conflicting submissions, stale and unauthorized decisions,
replay of committed model turns, the turn limit, retry exhaustion, repeatedly
crashing deliveries, cancellation, queue offers rolling back with their transaction,
and a single sink record after the first publish acknowledgement is lost. The
`Examples` workflow runs them against PostgreSQL 18 on every pull request.
