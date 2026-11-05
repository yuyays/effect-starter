import { createServer } from "node:http";
import { expect, it } from "@effect/vitest";
import { PgClient } from "@effect/sql-pg";
import { ConfigProvider, Effect, Layer, Option, Redacted } from "effect";
import { SqlClient } from "effect/sql";
import { DatabaseLive, Jobs } from "./db.ts";
import { ModelClient, ModelError, type ModelTurn } from "./propose.ts";
import { HttpPublishLive, PublishError, PublishSink } from "./publish.ts";
import { AgentRuns, RunConflict, RunJobs, RunJobsLive, RunUnauthorized, RunsLive } from "./runs.ts";

const databaseUrl = process.env.DOC_REVIEW_TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("Set DOC_REVIEW_TEST_DATABASE_URL to a dedicated PostgreSQL test database.");
const url = Redacted.make(databaseUrl);

// Each test gets a fresh schema, so queue rows never leak between tests.
const database = Layer.unwrap(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const schema = `test_${crypto.randomUUID().replaceAll("-", "")}`;
    yield* sql`CREATE SCHEMA ${sql(schema)}`;
    yield* Effect.addFinalizer(() => sql`DROP SCHEMA ${sql(schema)} CASCADE`.pipe(Effect.orDie));
    return DatabaseLive({ url, startupParameters: { search_path: schema } });
  }),
).pipe(Layer.provide(PgClient.layer({ url })));

const proposal = {
  title: "Office supplies",
  category: "invoice",
  summary: "Invoice for office supplies",
} as const;
const policyThenPropose = (history: ReadonlyArray<unknown>): ModelTurn =>
  history.length ? { kind: "proposal", proposal } : { kind: "lookup_policy" };
const model = Layer.succeed(ModelClient, {
  respond: (_document, history) => Effect.succeed(policyThenPropose(history)),
});
const sink = Layer.succeed(PublishSink, { publish: () => Effect.succeed("receipt-1") });
const layerWith = (
  models: Layer.Layer<ModelClient> = model,
  sinks: Layer.Layer<PublishSink> = sink,
) =>
  Layer.mergeAll(RunsLive, RunJobsLive).pipe(
    Layer.provideMerge(Layer.mergeAll(database, models, sinks)),
  );

// One worker delivery: take the next queued job and run it.
const deliver = Effect.gen(function* () {
  const jobs = yield* Jobs;
  const { handle } = yield* RunJobs;
  return yield* jobs.take(handle);
});

const reviewer = { id: "reviewer", canApprove: true };
const document = { document: "Invoice for office supplies" };

it.live("admits duplicate requests once and rejects conflicting input", () =>
  Effect.gen(function* () {
    const runs = yield* AgentRuns;
    const key = crypto.randomUUID();
    const id = yield* runs.start(key, document);
    expect(yield* runs.start(key, document)).toBe(id);
    expect((yield* runs.read(id)).status).toBe("processing");
    const conflict = yield* runs.start(key, { document: "A different document" }).pipe(Effect.flip);
    expect(conflict).toBeInstanceOf(RunConflict);
  }).pipe(Effect.provide(layerWith())),
);

it.live("keeps a versioned proposal until an authorized reviewer decides", () =>
  Effect.gen(function* () {
    const runs = yield* AgentRuns;
    const id = yield* runs.start(crypto.randomUUID(), document);
    yield* deliver;
    const view = yield* runs.read(id);
    expect(view).toMatchObject({ status: "awaitingApproval", proposal });
    const stale = yield* runs.decide(id, view.version - 1, "approve", reviewer).pipe(Effect.flip);
    expect(stale).toBeInstanceOf(RunConflict);
    const reader = yield* runs
      .decide(id, view.version, "approve", { id: "reader", canApprove: false })
      .pipe(Effect.flip);
    expect(reader).toBeInstanceOf(RunUnauthorized);
    yield* runs.decide(id, view.version, "reject", reviewer);
    expect((yield* runs.read(id)).status).toBe("rejected");
  }).pipe(Effect.provide(layerWith())),
);

it.live("replays committed model responses after a failed delivery", () => {
  let calls = 0;
  // The second model call fails once: turn 0 is committed, turn 1 is not.
  const flaky = Layer.succeed(ModelClient, {
    respond: (_document, history) =>
      ++calls === 2
        ? Effect.fail(new ModelError({ message: "connection reset" }))
        : Effect.succeed(policyThenPropose(history)),
  });
  return Effect.gen(function* () {
    const runs = yield* AgentRuns;
    const id = yield* runs.start(crypto.randomUUID(), document);
    yield* deliver.pipe(Effect.flip);
    yield* deliver;
    expect((yield* runs.read(id)).status).toBe("awaitingApproval");
    expect(calls).toBe(3);
  }).pipe(Effect.provide(layerWith(flaky)));
});

it.live("reports a failed run once retries are exhausted", () => {
  const down = Layer.succeed(ModelClient, {
    respond: () => Effect.fail(new ModelError({ message: "unavailable" })),
  });
  return Effect.gen(function* () {
    const runs = yield* AgentRuns;
    const id = yield* runs.start(crypto.randomUUID(), document);
    for (let delivery = 0; delivery < 3; delivery++) yield* Effect.exit(deliver);
    expect(yield* runs.read(id)).toMatchObject({ status: "failed", attempts: 3 });
  }).pipe(Effect.provide(layerWith(down)));
});

it.live("fails the run when the model never proposes within the turn limit", () => {
  let calls = 0;
  const stuck = Layer.succeed(ModelClient, {
    respond: () => Effect.sync((): ModelTurn => (calls++, { kind: "lookup_policy" })),
  });
  return Effect.gen(function* () {
    const runs = yield* AgentRuns;
    const id = yield* runs.start(crypto.randomUUID(), document);
    yield* deliver;
    expect(yield* runs.read(id)).toMatchObject({
      status: "failed",
      error: "Model turn limit exceeded",
    });
    expect(calls).toBe(4);
  }).pipe(Effect.provide(layerWith(stuck)));
});

it.live("drops a queued job when its transaction rolls back", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const jobs = yield* Jobs;
    yield* sql
      .withTransaction(
        jobs
          .offer({ runId: crypto.randomUUID(), phase: "propose" })
          .pipe(Effect.andThen(Effect.fail("rollback"))),
      )
      .pipe(Effect.flip);
    const taken = yield* jobs.take(() => Effect.void).pipe(Effect.timeoutOption("500 millis"));
    expect(Option.isNone(taken)).toBe(true);
  }).pipe(Effect.provide(layerWith())),
);

it.live("cancellation stops pending work but cannot revoke approved publishing", () => {
  let calls = 0;
  const counted = Layer.succeed(ModelClient, {
    respond: (_document, history) => Effect.sync(() => (calls++, policyThenPropose(history))),
  });
  return Effect.gen(function* () {
    const runs = yield* AgentRuns;
    const cancelled = yield* runs.start(crypto.randomUUID(), document);
    yield* runs.cancel(cancelled);
    yield* deliver;
    expect((yield* runs.read(cancelled)).status).toBe("cancelled");
    expect(calls).toBe(0);

    const approved = yield* runs.start(crypto.randomUUID(), document);
    yield* deliver;
    yield* runs.decide(approved, (yield* runs.read(approved)).version, "approve", reviewer);
    expect(yield* runs.cancel(approved).pipe(Effect.flip)).toBeInstanceOf(RunConflict);
  }).pipe(Effect.provide(layerWith(counted)));
});

it.live("publishes one sink record when the worker fails after the sink accepts", () =>
  Effect.gen(function* () {
    // A sink honouring Idempotency-Key: one record per key, same receipt on retry.
    const records = new Map<string, string>();
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        const key = String(request.headers["idempotency-key"]);
        if (!records.has(key)) records.set(key, body);
        response
          .writeHead(201, { "content-type": "application/json" })
          .end(JSON.stringify({ receipt: `r-${key}` }));
      });
    });
    yield* Effect.acquireRelease(
      Effect.callback<void>(
        (resume) => void server.listen(0, "127.0.0.1", () => resume(Effect.void)),
      ),
      () => Effect.callback<void>((resume) => void server.close(() => resume(Effect.void))),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      return yield* Effect.die("Sink server has no TCP port");
    const config = ConfigProvider.layer(
      ConfigProvider.fromUnknown({
        PUBLISH_URL: `http://127.0.0.1:${address.port}/records`,
        PUBLISH_TOKEN: "test-token",
      }),
    );
    // Lose the first acknowledgement, as if the worker died before recording success.
    let lost = false;
    const lossy = Layer.effect(
      PublishSink,
      Effect.gen(function* () {
        const http = yield* PublishSink;
        return {
          publish: (key, record) =>
            http.publish(key, record).pipe(
              Effect.tap(() => {
                if (lost) return Effect.void;
                lost = true;
                return Effect.fail(new PublishError({ message: "lost", retryable: true }));
              }),
            ),
        };
      }),
    ).pipe(Layer.provide(HttpPublishLive), Layer.provide(config), Layer.orDie);

    return yield* Effect.gen(function* () {
      const runs = yield* AgentRuns;
      const id = yield* runs.start(crypto.randomUUID(), document);
      yield* deliver;
      yield* runs.decide(id, (yield* runs.read(id)).version, "approve", reviewer);
      yield* deliver.pipe(Effect.flip);
      yield* deliver;
      const view = yield* runs.read(id);
      expect(view.status).toBe("published");
      expect(records.size).toBe(1);
      expect(JSON.parse([...records.values()][0]!)).toEqual(proposal);
      expect(view.receipt).toBe(`r-${[...records.keys()][0]}`);
    }).pipe(Effect.provide(layerWith(model, lossy)));
  }),
);
