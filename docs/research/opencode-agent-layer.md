# Optional agent layer for the Effect starter

**Date:** 2026-11-06  
**Scope:** independent research and assessment only. No implementation, no PR, no commit. I did not read `docs/research/effect-agent-runtime.md` or `docs/research/agent-platform-alternatives.md`; this report is intentionally based on the current repository, package contents, and primary external sources.

**Evidence labels:** `[Certain]` verified in the repository, installed package, npm registry, or primary docs on 2026-11-06. `[Likely]` follows from multiple primary sources but was not executed here. `[Uncertain]` depends on an unreleased change, a beta API, or was not evaluated deeply.

---

## 1. Current starter baseline

The starter is deliberately small and provider-neutral:

- Effect `4.1.2`, Drizzle `1.0.0-rc.5`, `@effect/sql-pg` `4.1.2`, Node `>=24.11.0` (`package.json`, `pnpm-workspace.yaml`). `[Certain]`
- One API app with a health endpoint and a users endpoint, an HttpApi contract package, and optional React/TanStack Start/Vue frontends (`apps/api/src/http.ts`, `packages/contracts/src/http/index.ts`, `packages/create-effect-starter/frameworks.js`). `[Certain]`
- PostgreSQL is the only database path: `PgClient` + `drizzle-orm/effect-postgres` + `pg-core` schema (`apps/api/src/db/client.ts`, `apps/api/src/db/schema.ts`, `apps/api/drizzle.config.ts`). `[Certain]`
- No auth, tenancy, job queue, event log, agent/session model, or provider adapter exists. `[Certain]`
- The README already points agent/CLI/MCP builders at the no-frontend starter, but that starter is still only the API + contracts skeleton (`README.md`). `[Certain]`
- The generator matrix is four starters × two package managers × two API runtimes, with generated-project tests. Adding an agent dimension multiplies template and test surface (`packages/create-effect-starter/build-template.js`, `create-project.test.js`). `[Certain]`

The base is a good **domain application** skeleton. It is not an agent harness, and its README does not claim to be one.

---

## 2. Three different problems that are often conflated

This distinction drives the recommendation.

| Concern                              | What it means                                                                                                                                                  | What it does **not** give you                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Persistent conversation state**    | Transcript, messages, tool results, approvals, and metadata survive process restart.                                                                           | It does not resume an interrupted turn, retry a failed model call, or settle accepted work. |
| **Reliable execution / restart**     | Accepted work has an obligation to reach a terminal state. The system records a run/attempt, an owner or lease, checkpoints or an outbox, and a resume budget. | It does not make external effects exactly-once.                                             |
| **External-side-effect idempotency** | A charge, deploy, email, or ticket update is safe to repeat, or is reconciled after an uncertain outcome.                                                      | No durable-execution engine can infer this for you.                                         |

Primary sources state this directly:

- Yielded Agent’s durability contract separates “persistent history” from “durable host,” and says: **“Exactly-once recording is not exactly-once external execution.”** It also defines Thread → Run → Attempt → Turn and says a shared database does not provide distributed takeover by itself ([durability](https://yielded.dev/agent/concepts/durability/), [runtime model](https://yielded.dev/agent/concepts/runtime-model/)). `[Certain]`
- Effect’s `Activity` docs warn that only completed activity results are memoized; if an activity suspends, its body runs again and **“Side effects before the suspension can repeat; make those side effects idempotent.”** ([Activity.ts](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/workflow/Activity.ts)). `[Certain]`
- Temporal recommends idempotent Activities because a Worker can finish the work and crash before reporting completion; the Activity is then retried. It suggests using the Workflow Run ID + Activity ID as an idempotency key ([Activity Definition](https://docs.temporal.io/activity-definition)). `[Certain]`
- Cloudflare’s Agents `Lifecycle` is durable infrastructure, but its docs say: **“Lifecycle does not automatically checkpoint arbitrary JavaScript or resume a function where it stopped.”** ([Lifecycle](https://developers.cloudflare.com/agents/runtime/lifecycle/)). `[Certain]`
- Pi Durable checkpoints tasks and deduplicates submissions by `requestId`, but tool calls rerun only when declared `replay: "safe"`; otherwise the model receives an interrupted result ([Pi Durable README](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md)). `[Certain]`

**Implication:** an agent layer must expose at least three separate seams: conversation storage, run/attempt recovery, and effect idempotency/reconciliation. A single “messages” table is not an agent runtime.

---

## 3. SQLite vs PostgreSQL

### 3.1 Current primary facts

- SQLite WAL allows readers and one writer concurrently, but **only one writer at a time**, and WAL requires all processes on the same host because the wal-index uses shared memory; it does not work on a network filesystem ([SQLite WAL](https://www.sqlite.org/wal.html)). `[Certain]`
- Effect’s Node SQLite client uses one serialized connection, enables WAL by default, waits up to five seconds for busy databases, and uses `BEGIN IMMEDIATE` for writable transactions. Critically, **“Busy waits block the Node.js event loop because `node:sqlite` is synchronous.”** ([SqliteClient docs](https://effect.website/docs/v4/api/sql-sqlite-node/SqliteClient)). `[Certain]`
- `node:sqlite` is still **Stability 1.2, release candidate** in the Node 24 docs, and all APIs are synchronous ([Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)). `[Certain]`
- PostgreSQL uses MVCC and is designed for concurrent multiuser access; reads and writes do not block each other in the usual case ([PostgreSQL MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html)). `[Certain]`
- Effect Cluster’s `SingleRunner` is explicitly for “local, embedded, or small single-node setups”; message storage is still SQL-backed, and runner communication is a no-op, so it is not multi-runner coordination ([SingleRunner](https://effect.website/docs/v4/api/effect/cluster/SingleRunner)). `[Certain]`
- Drizzle 1.0 RC ships separate Effect adapters for Postgres, SQLite Node, SQLite DO, D1, and others (`drizzle-orm/effect-postgres`, `effect-sqlite-node`, `effect-sqlite-do`). The schemas and migrations are dialect-specific. `[Certain]`

### 3.2 Practical comparison

| Dimension                | SQLite                                                                                            | PostgreSQL                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Topology                 | One file, one host; no network FS with WAL                                                        | Network service; many clients and hosts                |
| Write concurrency        | One writer; `busy_timeout`; `BEGIN IMMEDIATE`                                                     | MVCC; concurrent writers                               |
| Effect driver            | Synchronous `node:sqlite`; single serialized connection; busy waits block the event loop          | Pooled async client (`@effect/sql-pg`)                 |
| Drizzle path             | `effect-sqlite-node` / `effect-sqlite-do`; SQLite schema                                          | `effect-postgres`; pg schema                           |
| Effect durable workflows | `SingleRunner` + SQL storage; single process                                                      | Cluster sharding + SQL storage; multiple runners       |
| Multi-user SaaS          | Possible only at small single-node scale; weak fit for horizontal scaling, tenant isolation, PITR | Strong fit: concurrency, managed backups, RLS, pooling |
| Local coding harness     | Strong fit: one process, one user, local files                                                    | Usually unnecessary; adds an external service          |
| Operational cost         | Low; but WAL checkpoints, backups, and file locking need care                                     | Higher; but managed Postgres removes much of it        |

A concrete SQLite caveat from production code: T3 Code had to build a custom `node:sqlite` client with a reader-worker pool and a checkpoint worker because the stock synchronous driver would otherwise block the server; its setup uses WAL, `busy_timeout = 5000`, `synchronous = NORMAL`, and `checkpoint_fullfsync` ([`nodeSqliteClient.ts`](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/packages/shared/src/nodeSqliteClient.ts), [`Sqlite.ts`](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/persistence/Sqlite.ts)). `[Certain]`

Also verify the bundled SQLite version if you use multiple connections. SQLite fixed a rare WAL-reset corruption bug in **3.51.3** (2026-03-13); older versions are affected only when multiple connections write/checkpoint at the same instant ([SQLite WAL](https://www.sqlite.org/wal.html)). Node 24.11 predates that fix; the exact bundled version should be checked with `SELECT sqlite_version()` rather than assumed. `[Uncertain]` for the exact Node 24.11 version.

### 3.3 Recommendation

- **Base starter:** keep PostgreSQL. It is the right default for a multiuser domain app, and changing it would break the existing Drizzle/pg setup for no clear gain.
- **Local coding harness preset/example:** use SQLite. One process owns the database; that matches Pi Durable, OpenCode, and T3.
- **Multi-user domain-agent preset:** use PostgreSQL. Do not pretend SQLite is a drop-in for multiple API replicas.
- **Do not add a dual-dialect abstraction.** Share contracts and service interfaces, not a lowest-common-denominator ORM schema. Dialect-specific schemas and migrations are simpler and less surprising.

---

## 4. Durable execution options

### 4.1 Effect v4 workflow + cluster

Effect v4 ships durable workflow and cluster primitives in the core package (`effect/workflow`, `effect/cluster`) at `4.1.2`. `[Certain]`

- A `Workflow` has typed payload/success/error schemas and a deterministic execution ID derived from the tag + idempotency key. It supports `execute`, `poll`, `interrupt`, `resume`, `toLayer`, compensation, suspension, and durable clocks/deferreds ([Workflow docs](https://effect.website/docs/v4/api/effect/workflow/Workflow)). `[Certain]`
- `ClusterWorkflowEngine.layer` requires `Sharding | MessageStorage`; `SqlMessageStorage` explicitly supports SQLite, PostgreSQL, MySQL, and MSSQL dialects ([ClusterWorkflowEngine](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/cluster/ClusterWorkflowEngine.ts), [SqlMessageStorage](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/cluster/SqlMessageStorage.ts)). `[Certain]`
- `SingleRunner.layer` wires sharding, SQL-backed message storage, and either SQL or in-memory runner storage for a single process. It is suitable for local/embedded/small single-node use, not multi-runner coordination. `[Certain]`
- The test suite covers restart/replay behavior, including orphaned activities, queued activities after shutdown, duplicate child workflow requests, and “runs an activity once after a transient failure” saving or acknowledging its request ([ClusterWorkflowEngine.test.ts](https://github.com/Effect-TS/effect/blob/main/packages/effect/test/cluster/ClusterWorkflowEngine.test.ts)). `[Certain]`
- **Maturity:** the workflow and cluster APIs are marked `@stability unstable` in the 4.1.2 package docs. `[Certain]`
- **Cloudflare:** the Effect cluster-on-Durable-Objects integration is an **open, unmerged PR** (#7322, “Cluster sharding on Cloudflare Durable Objects”), not in the published 4.1.2 package; `@effect/platform-cloudflare` is not published. `[Certain]` Do not build a starter on that integration yet.

**Fit:** good for multi-user domain workflows on Postgres, especially when the app is already Effect-native. It is overkill for a local coding harness whose main problem is “resume the current turn after the process dies.”

### 4.2 Temporal

- Temporal’s TypeScript SDK is at `1.25.0` and is a mature 1.x SDK. `[Likely]`
- Temporal provides durable Workflow Executions with replay, Activities, timers, signals, child workflows, and Continue-As-New ([Workflow Execution](https://docs.temporal.io/workflow-execution)). `[Certain]`
- Activities are retried and must be idempotent; Temporal guarantees the Activity is _observed_ as completed exactly once, but the Activity may execute multiple times ([Activity Definition](https://docs.temporal.io/activity-definition)). `[Certain]`
- Running it requires a Temporal Service: Temporal Cloud, or a self-hosted deployment with a database, workers, namespaces, monitoring, and upgrades ([Self-hosted guide](https://docs.temporal.io/self-hosted-guide)). `[Certain]`
- **Fit:** strong for a serious multi-tenant workflow product with long waits, human approvals, and many background jobs. Too much operational surface for a local coding harness or a small domain agent. It is also a second programming model next to Effect, unless you wrap it carefully.

### 4.3 Cloudflare Agents SDK / Durable Objects / Workflows

These are three different products and should not be treated as one option.

**Agents SDK + Durable Objects**

- An agent is a Durable Object; the Agents SDK `Lifecycle` provides startup, request dispatch, a durable SQLite job queue, a single alarm, object names, and teardown ([Agents overview](https://developers.cloudflare.com/agents/), [Lifecycle](https://developers.cloudflare.com/agents/runtime/lifecycle/)). `[Certain]`
- The SDK ships harnesses for Pi and OpenCode. `PiHarness` gives Pi the object’s SQLite storage and wakes the object after eviction; `OpenCodeHarness` does the same for OpenCode 2.0 ([Pi harness](https://developers.cloudflare.com/agents/harnesses/pi/), [OpenCode harness](https://developers.cloudflare.com/agents/harnesses/opencode/)). `[Certain]`
- `agents` is `0.33.0`; `agents/lifecycle` is documented as stable, but the Pi/OpenCode harnesses are newer and version-pinned. Agents 0.33 supports Pi 1.5; each `agents` release supports one Pi minor. Rolling back after a Pi minor upgrade can make conversations unreadable. `[Certain]`
- Durable Object limits matter: 10 GB SQLite storage per object on Workers Paid, 2 MB max row/value, 30 s CPU per request by default (5 min configurable), 15 min per alarm invocation, and one object is single-threaded ([DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/)). `[Certain]`
- **Fit:** excellent for “one object per conversation/user” multi-user agents and for hosting Pi/OpenCode harnesses. It is a platform commitment, not a neutral starter default.

**Cloudflare Workflows**

- `WorkflowEntrypoint` + `step.do` provides durable multi-step execution, retries, sleeps, `waitForEvent`, and rollback/compensation ([Workflows](https://developers.cloudflare.com/workflows/), [Workers API](https://developers.cloudflare.com/workflows/build/workers-api/)). `[Certain]`
- Limits: 1 MiB non-stream step result, 10,000 steps default / 25,000 configurable, 7-day default retention (up to 30 days). Individual steps have no wall-clock limit, but a Workflow is a Worker script and is subject to the Worker CPU limit ([Limits](https://developers.cloudflare.com/workflows/reference/limits/)). `[Certain]`
- Step callbacks can retry; external side effects still need idempotency or compensation. `[Likely]` from retry semantics; the docs do not claim exactly-once external effects.
- **Fit:** good for long domain jobs (approval flows, report generation, billing), not for the interactive token stream of a coding harness.

### 4.4 Pi Durable

**It is real, not a guess.** `@earendil-works/pi-durable` is `1.5.0` on npm, announced 2026-10-01, and documented by Cloudflare on 2026-11-03. `[Certain]`

- It is an **experimental** durable agent harness from the Pi team, source in `earendil-works/pi/packages/durable`; it is not a separate repository. `[Certain]`
- It owns the agent loop: conversations, submissions, model turns, tool calls, compaction, subagents, and application documents. Storage backends: memory, IndexedDB, SQLite, JSONL, and Cloudflare Durable Object SQLite. `[Certain]`
- It checkpoints each task; after a crash it reopens storage and resumes unfinished tasks. A model request cut off counts as a failed attempt and is retried; a tool call reruns only if declared `replay: "safe"`, otherwise the model gets an interrupted result. `[Certain]`
- `requestId` deduplicates submissions, but **one process owns a storage at a time; there is no cross-process locking**. The README explicitly says this. `[Certain]`
- It has a `restartLimit` (default 5) to stop crash loops, and Cloudflare’s `PiHarness` uses a Lifecycle job + alarm to wake an evicted object. `[Certain]`
- Limitations include no approval/permission step, a 15-minute alarm cap (the harness hands off every 10 minutes), and Pi-version/format coupling. `[Certain]`

**Fit:** the best reference for a local/durable coding harness, and a plausible optional host for a “local agent” preset. It is not a multi-user Postgres runtime, and its API is explicitly unstable. `[Certain]`

### 4.5 Plain SQL outbox + claim (the overlooked option)

T3 Code and OpenCode both implement agent durability **without** a general workflow engine:

- T3 records commands, events, projections, command receipts, and outbox effects in one SQLite transaction. `EffectWorker` claims effects with a lease, retries, and terminalizes; it explicitly separates `REPLAY_SAFE_EFFECT_TYPES_AFTER_PROCESS_LOSS` from `PROCESS_BOUND_EFFECT_TYPES`, cancelling process-bound effects after process loss instead of replaying them ([`EventSink.ts`](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/orchestration-v2/EventSink.ts), [`EffectOutbox.ts`](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/orchestration-v2/EffectOutbox.ts), [`EffectWorker.ts`](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/orchestration-v2/EffectWorker.ts)). `[Certain]`
- OpenCode writes a durable execution claim at turn start, keeps it across shutdown, releases it on terminal events, and on boot resumes orphaned claims with a durable resume counter and max-attempt budget. It states recovery is **at-least-once** and does not prevent repeated external side effects after a crash ([`execution.ts`](https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/execution.ts), [`restart.ts`](https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/execution/restart.ts)). `[Certain]`

This is usually the right first design for agent turns. It is smaller than Temporal or Effect Cluster, keeps the state in the same database as the conversation, and makes the at-least-once boundary explicit.

### 4.6 Other alternatives not evaluated deeply

- **Yielded Agent** (`@yielded/agent` `0.1.0-beta.192`) is an Effect-native agent runtime with Thread/Run/Attempt/Turn, SQLite/Postgres/Cloudflare storage, approvals, budgets, and a written durability contract ([repo](https://github.com/yielded-dev/agent), [durability](https://yielded.dev/agent/concepts/durability/)). It is the closest existing interface to what this starter would need, but it is beta, young, and small. `[Certain]` for version/features; `[Uncertain]` for production maturity.
- **Restate, Inngest, DBOS, Trigger.dev** are durable-execution/job platforms that could fit a multi-tenant SaaS with less operational work than Temporal. I did not verify their current TypeScript maturity or Effect integration; treat them as candidates for a later spike. `[Uncertain]`
- **`effect/eventlog` + `SqlEventJournal`** could back an append-only event log instead of hand-rolled tables; not evaluated against the agent event shape. `[Uncertain]`
- **`effect/persistence`** already provides SQL-backed key-value stores, persisted queues, rate limiters, and circuit breakers; useful for quotas and outbox infrastructure, not a replacement for a run coordinator. `[Certain]`

---

## 5. Alchemy’s actual role

Alchemy is **Infrastructure as Effects**: a TypeScript framework where infrastructure and runtime code are written as Effect Layers, type-checked together, emulated locally, and deployed as a Stack ([What is Alchemy](https://alchemy.run/what-is-alchemy/)). `[Certain]`

- It is an IaC/deployment framework with providers for Cloudflare, AWS, Fly, Railway, Neon, and others; it is not a database, an agent runtime, or a durable log. `[Certain]`
- It can define Cloudflare Workers, Durable Objects, R2, D1, Queues, and Workflows; its Cloudflare Workflows bridge exposes `Cloudflare.Workflow`, `Cloudflare.Workflows.task/sleep/waitForEvent`, and a `layerDurableObjectEngine`/`NativeEngine` choice for Effect workflows ([Cloudflare Workflows](https://alchemy.run/cloudflare/workflows/)). `[Certain]`
- Current npm version is `2.0.0-beta.85`; it is still beta. `[Certain]`
- T3 Code’s repository contains a vendored `.repos/alchemy-effect` tree, but its server package dependencies do not list Alchemy. Do not cite that as evidence that T3 runs on Alchemy. `[Certain]`

**Fit:** optional deployment layer for a Cloudflare agent preset, especially if you want local emulation and per-PR stages. It does not solve conversation state, run recovery, or idempotency. Adding it to the base starter would introduce a beta deployment opinion the base explicitly avoids.

---

## 6. Strong reference implementations

### Effect

- `packages/effect/src/workflow/Workflow.ts`, `Activity.ts`, `WorkflowEngine.ts`: typed durable workflows, activities, suspension, resume, compensation.
- `packages/effect/src/cluster/SingleRunner.ts`, `SqlMessageStorage.ts`, `ClusterWorkflowEngine.ts`: single-node and SQL-backed durable execution.
- `packages/effect/test/cluster/ClusterWorkflowEngine.test.ts`: the best evidence for restart/replay semantics and duplicate-suppression behavior.
- Docs: [Workflow](https://effect.website/docs/v4/api/effect/workflow/Workflow), [SingleRunner](https://effect.website/docs/v4/api/effect/cluster/SingleRunner), [SqlMessageStorage](https://effect.website/docs/v4/api/effect/cluster/SqlMessageStorage), [SQLite client](https://effect.website/docs/v4/api/sql-sqlite-node/SqliteClient).

### T3 Code (local coding-harness control surface)

- Architecture: durable intent is decided as events; `EventSink` commits events, projections, command receipts, and outbox effects in one transaction; the worker performs side effects after commit ([overview](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/docs/internals/overview.md)). `[Certain]`
- Provider boundary: one adapter per provider; Codex/Claude/Pi/OpenCode behavior stays at the adapter boundary; Pi runs in RPC mode, OpenCode 1.x/2.x have different server ownership ([providers](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/docs/internals/providers.md)). `[Certain]`
- SQLite: custom `node:sqlite` client with reader and checkpoint workers; WAL/busy-timeout/fsync tuning ([`Sqlite.ts`](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/persistence/Sqlite.ts), [`nodeSqliteClient.ts`](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/packages/shared/src/nodeSqliteClient.ts)).
- Key lesson: T3 is optimized for a user’s own machine/environment. It demonstrates local harness durability, not multi-tenant SaaS isolation. `[Likely]`

### OpenCode (local coding agent, SQLite-first, multi-runtime)

- Database: `packages/core/src/database/database.ts` opens SQLite via an Effect/Drizzle adapter, applies WAL/busy-timeout/tuning pragmas, and has separate `sqlite.node.ts`, `sqlite.bun.ts`, and `sqlite.workerd.ts` implementations. `[Certain]`
- The workerd adapter handles Durable Object SQLite’s restrictions: no `BEGIN/COMMIT/SAVEPOINT`, no tuning pragmas, transactions through `storage.transaction`, and `transactionStatements: false` ([`sqlite.workerd.ts`](https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/database/sqlite.workerd.ts)). `[Certain]`
- Session durability: write-ahead claim, release on terminal, resume orphaned claims with a durable attempt counter and max budget; recovery is explicitly at-least-once ([`execution.ts`](https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/execution.ts), [`restart.ts`](https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/execution/restart.ts), [`store.ts`](https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/store.ts)). `[Certain]`
- It also has an Effect/Drizzle SQLite driver and migrations for event-sourced session input, execution claims, jobs, and schedules. `[Certain]`

### Pi Durable

- Source/README: `earendil-works/pi/packages/durable` ([README](https://github.com/earendil-works/pi/blob/main/packages/durable/README.md)).
- Announcement: [Pi Durable](https://earendil.com/posts/pi-durable/).
- Cloudflare harness: [Pi](https://developers.cloudflare.com/agents/harnesses/pi/).
- Examples: the vacation planner and small coding agent under `packages/coding-agent/src/experimental/` in the Pi v1.0.0 tag. `[Certain]`

### Yielded Agent (Effect-native agent runtime)

- Repo: [yielded-dev/agent](https://github.com/yielded-dev/agent).
- Concepts: [runtime model](https://yielded.dev/agent/concepts/runtime-model/), [durability](https://yielded.dev/agent/concepts/durability/), [storage](https://yielded.dev/agent/storage/).
- Examples: `examples/sandbox` (coding agent), `examples/travel-planner`, `examples/durable-bench`, `examples/cold-start`. `[Certain]`
- This is the most directly relevant interface reference for the “smallest coherent” seam: Thread, Run, Attempt, Turn; history vs recovery vs model context; durable receipt vs external effect.

### Domain-agent examples

- Cloudflare Agents examples: chat, Slack, email, voice, browser, and the Pi/OpenCode harness apps ([Agents overview](https://developers.cloudflare.com/agents/)). `[Certain]`
- Yielded’s travel planner and sandbox coding agent show multi-conversation, subagents, approvals, and recovery in a domain setting. `[Certain]`
- `mikearnaldi/accountability` is a useful Effect domain-app reference (accounting, authorization, HttpApi, Postgres), but it is not an agent runtime. `[Certain]`

---

## 7. The two target use cases are not one product

| Concern            | Local coding harness                                                      | Multi-user industry/domain agent                                                |
| ------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Primary user       | One developer on one machine                                              | Many tenants/users                                                              |
| Agent loop owner   | Codex/Claude/Pi/OpenCode SDK owns it                                      | Often app-owned loop or a provider SDK                                          |
| Conversation state | SQLite; native provider session + app event log                           | Postgres; app-owned transcript, audit, projections                              |
| Recovery           | Resume the current turn after process death; cancel process-bound effects | Durable workflows, approvals, long waits, retries, quotas                       |
| Isolation          | Filesystem/worktree/PTY, provider account                                 | Auth, tenant isolation, row-level security, audit                               |
| Deployment         | Desktop/CLI/local server, one process                                     | Horizontally scaled service, multiple runners                                   |
| Best reference     | T3 Code, OpenCode, Pi Durable                                             | Temporal or Effect Workflow + Postgres, Yielded, Cloudflare DO per conversation |

A single “agent layer” that abstracts both would either be a large universal-provider framework (the thing to avoid) or a lowest-common-denominator chat store that solves neither problem well.

---

## 8. Recommendation

**Do not change the base starter. Add an optional separate starter or example, not a base-layer dependency.**

My recommendation, in order:

1. **Recommended: two reference examples in this repository**, each independently runnable and tested:
   - `examples/agent-local`: one local coding harness, SQLite, one process, provider adapter for one SDK (Pi RPC or OpenCode SDK), durable claim + outbox, event stream to a minimal UI/CLI.
   - `examples/agent-service`: multi-user domain agent, PostgreSQL, auth/tenant seam, one long-running workflow (e.g. approval-gated report) using Effect Workflow + `SingleRunner`/cluster or Temporal behind a port.
2. **If demand is proven: promote one example to a separate starter** (`create-effect-agent-starter`) with its own pinned dependencies and release cadence. Share contracts/tooling later, not upfront.
3. **Optional generator preset only after the example is stable.** A preset multiplies the existing framework/package-manager/runtime matrix and couples the base release to unstable agent APIs.
4. **Base change: no.** At most, add a README link from “Building a CLI, MCP server, agent, or custom harness?” to the examples/separate starter.

Why this differs from “add an optional agent layer to the base”:

- The base’s value is a small, provider-neutral domain skeleton. An agent layer is opinionated about providers, sandboxing, auth, streaming, and durability.
- The two target use cases require different databases, runtimes, isolation, and operational models.
- The relevant APIs are not stable enough to sit on the base’s upgrade path: Effect workflow/cluster are `unstable`; the Effect Cloudflare cluster integration is unmerged; Pi Durable is experimental; Yielded is beta; Alchemy is beta.
- Agent SDKs already own the loop and native session state. The starter should provide a thin host/adapter and durable intent, not reimplement a harness.
- The generator already has four starters and two runtimes; an agent dimension would make the test matrix and maintenance cost disproportionate.

What would change my mind:

- A provider-neutral agent contract that is genuinely small (five ports, below), proven by two independent providers and both SQLite/Postgres stores, with stable upstream APIs.
- A commitment to one platform (e.g. Cloudflare Agents SDK) where the harness and durability are provided, making the starter mostly configuration.
- Evidence that most starter users are building agents, not domain apps.

---

## 9. Smallest coherent interface/modules

Keep the seam at **contracts + ports**, not a universal provider abstraction. One contract package, one composition root per preset.

### Contracts (`packages/agent-contracts`)

- `Session`: stable conversation identity, owner/tenant, provider binding, native session ref, status, timestamps.
- `Entry`: immutable transcript record (user/assistant/tool/system/approval), ordered by a monotonic cursor.
- `Run`: one logical execution against a session; status, input, attempt count, lease owner, terminal outcome.
- `Attempt`: one period advancing a run; restart budget and last checkpoint reference.
- `ProviderEvent`: normalized lifecycle/delta/tool/approval events; provider-specific payload stays opaque or adapter-owned.
- `Approval`: request, decision, scope (once/session/always), expiry.
- `WorkspaceRef`: cwd/worktree/sandbox identity, not a filesystem path in the contract.

### Ports (one module each)

- `ConversationStore`: append entries atomically; read by cursor; snapshot for reconnect. SQLite or Postgres implementation, not both in one module.
- `RunStore`: admit with idempotency key, claim/lease, heartbeat, settle, list suspended, count resume attempts. One owner per session.
- `ProviderAdapter`: `start`, `resume`, `steer`, `interrupt`, `stop`, `events`; native session ref in/out; no shared tool schema across providers.
- `EffectOutbox`: enqueue a typed intent with `idempotencyKey` and `replay: "safe" | "process-bound"`; claim with lease; retry; terminalize; reconcile after process loss.
- `Workspace`: prepare/release a local or remote execution environment; no assumption that it is a local path.
- `AgentApi`: HttpApi/RPC/SSE or WebSocket contract for sessions, runs, events, approvals; transport only.

### Ownership rules

- The app owns **intent, run state, event log, approvals, and effect classification**.
- The provider SDK owns **native transcript, model loop, and provider-specific session recovery**; store only the native ref and normalized events.
- The database owns **durability of intent**; it does not own external side effects.
- A workflow engine owns **long multi-step jobs**, not the interactive token stream.

This is intentionally close to Yielded’s Thread/Run/Attempt/Turn and T3’s command/event/outbox split, without adopting either wholesale.

---

## 10. Observable acceptance criteria

These are behavioral contracts, not implementation tests.

1. **Crash mid-turn:** kill the process after a user message is admitted and before the answer settles. On restart, the same run resumes once; the transcript has one user entry; after the resume budget is exhausted, the run reaches a terminal failure rather than looping.
2. **Duplicate submit:** submit the same `idempotencyKey` twice, including across restart. Both calls return the same receipt/run; the provider receives one model request.
3. **Unsafe tool interruption:** kill the process during a declared non-replay-safe tool. After restart the tool is not executed again; the model receives an interrupted result. A `replay: "safe"` tool may execute again.
4. **Reconnect:** connect with a cursor, disconnect, reconnect. The client receives a snapshot plus exactly the missed events, with no gap or duplicate; pruned history is represented by an explicit marker, not silent loss.
5. **Concurrency:** two submits for one session follow the configured queue/steer policy; there is never more than one active run for that session; no input is lost.
6. **Multi-user isolation:** a user from tenant A cannot read or mutate tenant B’s session/run/events; quotas and rate limits are enforced; authorization failures are auditable.
7. **Database choice:** the SQLite preset works in one process and refuses multi-process ownership; the Postgres preset allows two API replicas to process different sessions and recover a dead replica’s claim without duplicate active runs.
8. **Workflow idempotency:** a completed activity is not re-executed on restart; an external effect is invoked once per idempotency key even when the activity is retried; a failed workflow runs compensation in reverse order.
9. **Provider addition:** adding a provider touches one adapter package and its contract tests; it does not require changes to the run coordinator, store, or transport.
10. **Base untouched:** `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass in the base starter with no new agent dependencies; the agent example builds and tests independently.

---

## 11. Open questions and uncertainty

- **Provider order:** Pi RPC and OpenCode SDK are the easiest local embeds (T3 already supports both). Codex/Claude SDK terms and process ownership may constrain redistribution; verify before choosing a default. `[Uncertain]`
- **Native transcript vs app transcript:** mirroring the full provider transcript can conflict with provider-owned compaction and resume. The safer default is app-owned normalized events + native refs; confirm per provider. `[Likely]`
- **Effect Workflow on Cloudflare:** the unmerged PR may land; until then, use Cloudflare’s native Workflows/Agents SDK or Alchemy’s beta bridge, not a starter dependency. `[Uncertain]`
- **SQLite on Node 24.11:** verify the bundled SQLite version and WAL behavior; the stock Effect client is synchronous and can block the event loop under load. `[Certain]` for the client behavior; `[Uncertain]` for the exact Node 24.11 SQLite version.
- **Auth/tenancy:** the base has none. A multi-user preset must choose an auth model before it can claim tenant isolation. `[Certain]`
- **Yielded/Pi Durable adoption:** both could remove a lot of code, but both are beta/experimental and have their own storage/ownership assumptions. A spike should compare “adopt” vs “copy the contract” before writing a new runtime. `[Uncertain]`
- **Long model calls on Cloudflare:** DO alarm invocations are capped at 15 minutes; PiHarness hands off every 10 minutes. A single model request streaming longer than that can be cut off. `[Certain]`

---

## 12. Primary sources

All URLs accessed 2026-11-06. Repository links for moving projects are pinned to the commit I inspected.

**Current repository**

- `README.md`, `package.json`, `pnpm-workspace.yaml`
- `apps/api/src/main.ts`, `server.ts`, `http.ts`, `db/client.ts`, `db/schema.ts`, `services/users.ts`
- `packages/contracts/src/http/index.ts`, `schemas/user.ts`
- `packages/create-effect-starter/frameworks.js`, `runtime.js`, `build-template.js`, `PROJECT_README.md`
- `vite.config.ts`, `tools/oxlint/index.js`

**Effect**

- Effect `4.1.2`: https://registry.npmjs.org/effect/latest
- Workflow: https://effect.website/docs/v4/api/effect/workflow/Workflow
- Activity source: https://github.com/Effect-TS/effect/blob/main/packages/effect/src/workflow/Activity.ts
- SingleRunner: https://effect.website/docs/v4/api/effect/cluster/SingleRunner
- SqlMessageStorage: https://effect.website/docs/v4/api/effect/cluster/SqlMessageStorage
- ClusterWorkflowEngine source: https://github.com/Effect-TS/effect/blob/main/packages/effect/src/cluster/ClusterWorkflowEngine.ts
- Cluster workflow tests: https://github.com/Effect-TS/effect/blob/main/packages/effect/test/cluster/ClusterWorkflowEngine.test.ts
- SQLite client: https://effect.website/docs/v4/api/sql-sqlite-node/SqliteClient
- Cloudflare cluster PR (open, unmerged): https://github.com/Effect-TS/effect/pull/7322

**T3 Code** (commit `337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17`)

- Architecture: https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/docs/internals/overview.md
- Providers: https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/docs/internals/providers.md
- Event sink: https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/orchestration-v2/EventSink.ts
- Outbox: https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/orchestration-v2/EffectOutbox.ts
- Worker: https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/orchestration-v2/EffectWorker.ts
- SQLite setup: https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/persistence/Sqlite.ts
- Node SQLite client: https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/packages/shared/src/nodeSqliteClient.ts

**OpenCode** (commit `a316ae64c397cff9ad110e6b9277d5dba5002a2e`)

- Database: https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/database/database.ts
- Node SQLite: https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/database/sqlite.node.ts
- Workerd SQLite: https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/database/sqlite.workerd.ts
- Session execution: https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/execution.ts
- Restart recovery: https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/execution/restart.ts
- Session store/claim: https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/store.ts
- Job recovery: https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/job/recovery.ts

**Pi Durable** (commit `55a5c6914570e2ae31ca36297654483bbbf46883`)

- README: https://github.com/earendil-works/pi/blob/main/packages/durable/README.md
- Announcement: https://earendil.com/posts/pi-durable/
- npm `1.5.0`: https://registry.npmjs.org/@earendil-works/pi-durable/latest
- Cloudflare Pi harness: https://developers.cloudflare.com/agents/harnesses/pi/

**Yielded Agent** (commit `b3abdfb97ff73e5ff505c0bb7b35c796fff01c9e`)

- Repo: https://github.com/yielded-dev/agent
- Runtime model: https://yielded.dev/agent/concepts/runtime-model/
- Durability contract: https://yielded.dev/agent/concepts/durability/
- npm `0.1.0-beta.192`: https://registry.npmjs.org/@yielded/agent/latest

**Cloudflare**

- Agents overview: https://developers.cloudflare.com/agents/
- Lifecycle: https://developers.cloudflare.com/agents/runtime/lifecycle/
- OpenCode harness: https://developers.cloudflare.com/agents/harnesses/opencode/
- Workflows: https://developers.cloudflare.com/workflows/
- Workflows Workers API: https://developers.cloudflare.com/workflows/build/workers-api/
- Workflows limits: https://developers.cloudflare.com/workflows/reference/limits/
- Durable Objects limits: https://developers.cloudflare.com/durable-objects/platform/limits/

**Temporal**

- TypeScript SDK: https://docs.temporal.io/develop/typescript
- Activity definition/idempotency: https://docs.temporal.io/activity-definition
- Workflow execution: https://docs.temporal.io/workflow-execution
- Self-hosted guide: https://docs.temporal.io/self-hosted-guide
- npm `1.25.0`: https://registry.npmjs.org/@temporalio/workflow/latest

**Alchemy**

- What is Alchemy: https://alchemy.run/what-is-alchemy/
- Cloudflare Workflows: https://alchemy.run/cloudflare/workflows/
- npm `2.0.0-beta.85`: https://registry.npmjs.org/alchemy/latest

**SQLite / Node / PostgreSQL**

- SQLite WAL: https://www.sqlite.org/wal.html
- Node SQLite (v24): https://nodejs.org/docs/latest-v24.x/api/sqlite.html
- PostgreSQL MVCC: https://www.postgresql.org/docs/current/mvcc-intro.html

**Drizzle**

- SQLite connection docs: https://orm.drizzle.team/docs/get-started-sqlite
- Installed Drizzle `1.0.0-rc.5` export directories: `drizzle-orm/effect-postgres`, `effect-sqlite-node`, `effect-sqlite-do`
