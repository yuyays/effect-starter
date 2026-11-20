import { NodeServices } from "@effect/platform-node";
import { PgClient, PgMigrator } from "@effect/sql-pg";
import { Config, Context, Effect, Layer, Schedule, Schema } from "effect";
import { PersistedQueue } from "effect/persistence";
import migration from "../migrations/0001_runs.ts";

export const Job = Schema.Struct({
  runId: Schema.String,
  phase: Schema.Literals(["propose", "publish"]),
});
export type Job = typeof Job.Type;

export class Jobs extends Context.Service<Jobs, PersistedQueue.PersistedQueue<Job>>()(
  "doc-review/Jobs",
) {}

const JobsLive = Layer.effect(
  Jobs,
  PersistedQueue.make({
    name: "doc-review",
    schema: Job,
    // Domain attempts settle exhausted runs on their next delivery, including after a crash.
    maxAttempts: Number.MAX_SAFE_INTEGER,
    retrySchedule: Schedule.spaced("1 second"),
  }),
);

/** Owns one SQL client so domain writes and queue offers share transactions. */
export const DatabaseLive = (options: PgClient.PgPoolConfig) => {
  const pg = PgClient.layer(options);
  const migrated = PgMigrator.layer({
    table: "review_migrations",
    loader: PgMigrator.fromRecord({ "0001_runs": migration }),
  }).pipe(Layer.provideMerge(pg), Layer.provide(NodeServices.layer));
  const store = PersistedQueue.layerStoreSql({
    tableName: "review_queue",
    pollInterval: "100 millis",
    lockRefreshInterval: "1 second",
    lockExpiration: "5 seconds",
  }).pipe(Layer.provideMerge(migrated));
  const factory = PersistedQueue.layer.pipe(Layer.provideMerge(store));
  return JobsLive.pipe(Layer.provideMerge(factory));
};

export const DatabaseConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const url = yield* Config.Redacted("DATABASE_URL");
    return DatabaseLive({ url });
  }),
);
