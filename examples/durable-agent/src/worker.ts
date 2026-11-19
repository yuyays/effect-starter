import { NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { DatabaseConfigLive, Jobs } from "./db.ts";
import { DemoModelLive, OpenAIModelLive } from "./propose.ts";
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
  // The demo model keeps the example runnable without a model key; the database and sink
  // are still real, so recovery behaves exactly like the OpenAI-backed worker.
  const demo = process.argv.includes("--fake");
  const announce = demo
    ? Effect.logInfo("Using the deterministic demo model; OPENAI_API_KEY is not read.")
    : Effect.void;
  NodeRuntime.runMain(
    announce.pipe(
      Effect.andThen(work),
      Effect.provide(
        RunJobsLive.pipe(
          Layer.provideMerge(
            Layer.mergeAll(
              DatabaseConfigLive,
              demo ? DemoModelLive : OpenAIModelLive,
              HttpPublishLive,
            ),
          ),
        ),
      ),
    ),
  );
}
