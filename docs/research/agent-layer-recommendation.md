# Agent example recommendation

2026-11-06. Assessment, not an implementation plan approved for execution.

## Decision

Keep the base starter unchanged. Start with **one optional domain-agent example**
using the existing PostgreSQL, one model provider, and a separate Node worker.
Start with a bounded Effect operation, domain status records, and Effect's SQL-backed
`PersistedQueue`. Pin and compile this unstable API before adopting it. No cluster,
sharding, or workflow replay is needed for the initial flow. Do not add a generator
option yet.

The example should process a document, propose a structured record, wait for human
approval, and publish the approved record to an external HTTP sink supporting
idempotency keys. Make proposal generation a bounded tool-calling loop over read-only
domain lookups; otherwise describe it as extraction rather than an agent.
A second local coding-harness example
can follow if that becomes a real user need. These are different products, not two
implementations we need to support immediately.

## Research agreement and disagreement

- Both Codex researchers and independent OpenCode/DeepSeek V4.1 Flash (`high`)
  favor keeping agent dependencies out of the base.
- The Effect researcher recommends one Effect/Postgres workflow example. The
  platform researcher considers Temporal for long business workflows. OpenCode
  recommends separate local and service examples and highlights ordinary SQL
  claims/outboxes as an alternative to a workflow engine.
- Choose one domain example first to limit maintenance and expose the actual
  requirements. Do not require two providers and both database dialects before
  an example is useful; introduce another adapter only when needed.
- SQL claims/outboxes are smaller for a simple recoverable agent turn, but leases,
  ambiguous outcomes, approval waits, and upgrades remain application work. Avoid
  rebuilding a general workflow engine merely to avoid its dependency.
- Claude Opus 5.5 challenged the initial Effect Workflow recommendation and identified
  the built-in SQL queue as a smaller option. Its API, at-least-once delivery, locks,
  and retry support were checked in the installed Effect 4.1.2 source; integration
  has not been compiled or tested. Accept this simplification. Persist approval state
  in domain records without duplicating it in a workflow deferred.

## Storage and execution choices

| Target                              | Starting point                                        | Reason                                                                                    |
| ----------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| This starter's domain-agent example | PostgreSQL status records + SQL queue worker          | Reuses the stack; durable job handoff and approval records. Validate unstable APIs first. |
| Local coding harness                | SQLite + one SDK/harness host                         | Local ownership and workspace access; no database service required.                       |
| Workflow-heavy production service   | Evaluate Temporal                                     | Durable orchestration with a separate service/worker and replay programming model.        |
| Cloudflare-specific product         | Agents/DO for interaction, Workflows for durable jobs | Managed platform with explicit deployment and storage coupling.                           |

A saved transcript, a recoverable run, and safe external writes are three different
contracts. No engine makes an arbitrary external action exactly once. Persisted
activity results still leave a crash window between external success and recording
that success. Choose downstream idempotency or reconciliation for each write.

Consider Effect Workflow when several dependent steps, durable timers, or compensation
make explicit status handling unwieldy. Evaluate Temporal when numerous long workflows,
timers, and child workflows across teams justify its service and programming model.

## Small application interface

Expose `start(requestKey, input)`, `read(runId)`,
`decide(runId, proposalVersion, decision, actor)`, and `cancel(runId)` through an
`AgentRuns` Effect module. Resolve the actor from authenticated server context.
Store an input hash to reject conflicting request keys. `RunView` reports processing,
awaiting approval, publishing, published, rejected, failed, or cancelled, with a version
and attempt count. A cursor-based event stream is a later capability if needed.

Keep queue/provider internals private. The worker owns execution; PostgreSQL holds
domain state, model-response checkpoints, and queued work. Make run/approval transitions
and job admission atomic, or provide explicit reconciliation for interrupted handoffs;
verify transaction compatibility before selecting the queue composition. A `PublishSink`
adapter owns HTTP calls and idempotency keys. Bound model turns and retries; commit each
model response before executing its tools. Calls cut off before that commit may repeat.

Use one owner for durable steps. Do not journal the same tool independently in Pi
Durable and Effect Workflow. Do not add a common interface for multiple engines,
four coding SDKs, or both database dialects before something actually varies.

## Acceptance criteria

- Duplicate submissions return the same run; conflicting input is rejected.
- Killing and restarting the worker preserves the run and committed model responses;
  interrupted handoffs do not lose work, and retry exhaustion becomes a visible failure.
- Approval waits survive restart; stale, unauthorized, or duplicate decisions cannot
  publish again.
- Kill the worker after the HTTP sink accepts a write but before local completion is
  committed. On recovery, that sink holds one record for the operation key.
- Client disconnection leaves accepted work running. Cancellation persists, prevents
  new work, and is cooperative for calls already in flight; it cannot undo a completed write.
- A bounded read-only tool loop stops at its limits. The base gains no agent dependencies.

Prove these against real PostgreSQL before promoting the example. Upstream examples
were inspected, not executed in this starter. No agent runtime was implemented.

## References worth borrowing from

- [Effect PersistedQueue](https://github.com/Effect-TS/effect/blob/cb679e39cabeeadc5b40a5e20da311b9e4054a1b/packages/effect/src/persistence/PersistedQueue.ts): SQL-backed queue, scoped claims, retries, and at-least-once delivery; the smaller starting point.
- [Effect cluster workflow integration tests](https://github.com/Effect-TS/effect/blob/cb679e39cabeeadc5b40a5e20da311b9e4054a1b/packages/platform/node/test/cluster-integration/Workflow.test.ts): restart, deferred waits, cancellation, and storage contracts.
- [T3 Code outbox](https://github.com/pingdotgg/t3code/blob/337c5858c33bc7f8f6dfd391a2c279fa0f7e4d17/apps/server/src/orchestration-v2/EffectOutbox.ts): explicit replay-safe versus process-bound work.
- [OpenCode restart recovery](https://github.com/anomalyco/opencode/blob/a316ae64c397cff9ad110e6b9277d5dba5002a2e/packages/core/src/session/execution/restart.ts): recovering interrupted agent execution.
- [Pi Durable](https://github.com/earendil-works/pi/tree/55a5c6914570e2ae31ca36297654483bbbf46883/packages/durable): an experimental conversation-first harness; useful for a local alternative.
- [Yielded durability contract](https://yielded.dev/agent/concepts/durability/): separates conversation history, run ownership, and external action guarantees. Evaluate adoption before rebuilding an agent runtime; maturity needs a separate spike.

Alchemy can deploy resources and bridge Effect workflows to cloud runtimes; it is
not required for the Postgres example. Its deployment state is not agent history.

Detailed evidence: [Effect report](effect-agent-runtime.md),
[platform alternatives](agent-platform-alternatives.md),
[independent OpenCode report](opencode-agent-layer.md).
