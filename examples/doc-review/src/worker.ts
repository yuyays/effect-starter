import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { DatabaseConfigLive, Jobs } from "./db.ts";
import { OpenAIModelLive } from "./propose.ts";
import { HttpPublishLive } from "./publish.ts";
import { RunJobs, RunJobsLive } from "./runs.ts";

/**
 * Processes queued jobs until interrupted. A failed delivery stays queued for retry;
 * a crash releases its lock once the lease expires, so another worker can resume it.
 */
export const work = Effect.gen(function* () {
  const jobs = yield* Jobs;
  const runJobs = yield* RunJobs;
  return yield* jobs.take(runJobs.handle).pipe(
    Effect.catch((error) => Effect.logWarning("Job delivery failed; it will be retried", error)),
    Effect.forever,
  );
});

if (import.meta.main) {
  NodeRuntime.runMain(
    work.pipe(
      Effect.provide(
        RunJobsLive.pipe(
          Layer.provideMerge(Layer.mergeAll(DatabaseConfigLive, OpenAIModelLive, HttpPublishLive)),
        ),
      ),
    ),
  );
}
