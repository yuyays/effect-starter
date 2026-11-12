import { createHash, randomUUID } from "node:crypto";
import { Context, Effect, Layer, Schema } from "effect";
import type { PersistedQueue } from "effect/persistence";
import { SqlClient, type SqlError } from "effect/sql";
import { Jobs, type Job } from "./db.ts";
import {
  ModelClient,
  type ModelError,
  ModelTurn,
  Proposal,
  reviewPolicy,
  type Step,
} from "./propose.ts";
import { type PublishError, PublishSink } from "./publish.ts";

export class RunConflict extends Schema.TaggedError<RunConflict>()("RunConflict", {
  message: Schema.String,
}) {}
export class RunNotFound extends Schema.TaggedError<RunNotFound>()("RunNotFound", {}) {}
export class RunUnauthorized extends Schema.TaggedError<RunUnauthorized>()("RunUnauthorized", {}) {}
export class RunStorageError extends Schema.TaggedError<RunStorageError>()("RunStorageError", {
  cause: Schema.Defect(),
}) {}
export class RunInvalid extends Schema.TaggedError<RunInvalid>()("RunInvalid", {
  message: Schema.String,
}) {}
export const RunInput = Schema.Struct({
  document: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20000)),
});
export const RunView = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals([
    "processing",
    "awaitingApproval",
    "publishing",
    "published",
    "rejected",
    "failed",
    "cancelled",
  ]),
  version: Schema.Int,
  attempts: Schema.Int,
  proposal: Schema.NullOr(Proposal),
  receipt: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export type RunView = typeof RunView.Type;
export interface Actor {
  readonly id: string;
  readonly canApprove: boolean;
}
export type RunError = RunConflict | RunNotFound | RunUnauthorized | RunStorageError | RunInvalid;

export class AgentRuns extends Context.Service<
  AgentRuns,
  {
    readonly start: (
      requestKey: string,
      input: typeof RunInput.Type,
    ) => Effect.Effect<string, RunError>;
    readonly read: (runId: string) => Effect.Effect<RunView, RunError>;
    readonly decide: (
      runId: string,
      version: number,
      decision: "approve" | "reject",
      actor: Actor,
    ) => Effect.Effect<void, RunError>;
    readonly cancel: (runId: string) => Effect.Effect<void, RunError>;
  }
>()("doc-review/AgentRuns") {}

/** Worker-only: executes one queued job. A failure leaves the job queued for retry. */
export class RunJobs extends Context.Service<
  RunJobs,
  {
    readonly handle: (job: Job) => Effect.Effect<void, ModelError | PublishError | RunStorageError>;
  }
>()("doc-review/RunJobs") {}

/** Model output or stored data that fails its schema; retrying cannot repair it. */
class InvalidRunData extends Schema.TaggedError<InvalidRunData>()("InvalidRunData", {
  cause: Schema.Defect(),
}) {}
const invalidData = (cause: Schema.SchemaError) => new InvalidRunData({ cause });
type JobsError = PersistedQueue.PersistedQueueError | Schema.SchemaError;
const storageError = (cause: SqlError.SqlError | InvalidRunData | RunNotFound | JobsError) =>
  Effect.fail(new RunStorageError({ cause }));
// Failures `start` and `decide` report as storage errors; domain errors pass through.
const storageTags = ["SqlError", "PersistedQueueError", "SchemaError"] as const;

const decodeInput = Schema.decodeUnknownEffect(RunInput);
// Codecs for stored run data; a schema failure becomes InvalidRunData.
const viewDecoder = Schema.decodeUnknownEffect(RunView);
const turnDecoder = Schema.decodeUnknownEffect(ModelTurn);
const turnEncoder = Schema.encodeEffect(Schema.fromJsonString(ModelTurn));
const proposalEncoder = Schema.encodeEffect(Schema.fromJsonString(Proposal));
const decodeView = (row: unknown) => viewDecoder(row).pipe(Effect.mapError(invalidData));
const decodeTurn = (saved: unknown) => turnDecoder(saved).pipe(Effect.mapError(invalidData));
const encodeTurn = (turn: ModelTurn) => turnEncoder(turn).pipe(Effect.mapError(invalidData));
const encodeProposal = (proposal: Proposal) =>
  proposalEncoder(proposal).pipe(Effect.mapError(invalidData));
const attemptLimit = 3;
const turnLimit = 4;

const readRun = Effect.fn("readRun")(function* (sql: SqlClient.SqlClient, id: string) {
  const rows =
    yield* sql`SELECT id, status, version, attempts, proposal, receipt, error FROM review_runs WHERE id = ${id}`;
  if (!rows[0]) return yield* new RunNotFound();
  return yield* decodeView(rows[0]);
});

/** Request-side commands. Each state change and its queued job commit together. */
export const RunsLive = Layer.effect(
  AgentRuns,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const jobs = yield* Jobs;
    const read = (id: string) =>
      readRun(sql, id).pipe(Effect.catchTag(["SqlError", "InvalidRunData"], storageError));
    const start = Effect.fn("AgentRuns.start")(
      function* (key: string, input: typeof RunInput.Type) {
        if (!key || key.length > 200)
          return yield* new RunInvalid({ message: "Request key must contain 1–200 characters" });
        yield* decodeInput(input).pipe(
          Effect.mapError(
            () => new RunInvalid({ message: "Document must contain 1–20000 characters" }),
          ),
        );
        const hash = createHash("sha256").update(input.document).digest("hex");
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<{ id: string; input_hash: string }>`
        INSERT INTO review_runs (id, request_key, input_hash, document)
        VALUES (${randomUUID()}, ${key}, ${hash}, ${input.document})
        ON CONFLICT (request_key) DO UPDATE SET request_key = EXCLUDED.request_key
        RETURNING id, input_hash`;
            const row = rows[0]!;
            if (row.input_hash !== hash)
              return yield* new RunConflict({
                message: "Request key already belongs to different input",
              });
            yield* jobs.offer({ runId: row.id, phase: "propose" }, { id: `propose:${row.id}` });
            return row.id;
          }),
        );
      },
      Effect.catchTag(storageTags, storageError),
    );

    const decide = Effect.fn("AgentRuns.decide")(
      function* (id: string, version: number, decision: "approve" | "reject", actor: Actor) {
        if (!actor.canApprove) return yield* new RunUnauthorized();
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const status = decision === "approve" ? "publishing" : "rejected";
            const rows =
              yield* sql`UPDATE review_runs SET status = ${status}, decision = ${decision}, decided_by = ${actor.id}, phase_attempts = 0
        WHERE id = ${id} AND status = 'awaitingApproval' AND version = ${version} RETURNING id`;
            if (rows.length) {
              return yield* decision === "approve"
                ? jobs
                    .offer({ runId: id, phase: "publish" }, { id: `publish:${id}:${version}` })
                    .pipe(Effect.asVoid)
                : Effect.void;
            }
            // Repeating the decision that already won is a no-op; anything else is stale.
            const prior = yield* sql<{
              version: number;
              decision: string | null;
            }>`SELECT version, decision FROM review_runs WHERE id = ${id}`;
            if (!prior[0]) return yield* new RunNotFound();
            const repeated = prior[0].version === version && prior[0].decision === decision;
            return yield* repeated
              ? Effect.void
              : Effect.fail(new RunConflict({ message: "Proposal is stale or already decided" }));
          }),
        );
      },
      Effect.catchTag(storageTags, storageError),
    );

    const cancel = Effect.fn("AgentRuns.cancel")(
      function* (id: string) {
        const rows = yield* sql`UPDATE review_runs SET status = 'cancelled'
      WHERE id = ${id} AND status IN ('processing', 'awaitingApproval') RETURNING id`;
        // Cancelling twice is a no-op; approved, finished, or rejected runs cannot be cancelled.
        const cancelled = rows.length > 0 || (yield* read(id)).status === "cancelled";
        return yield* cancelled
          ? Effect.void
          : Effect.fail(new RunConflict({ message: "Run can no longer be cancelled" }));
      },
      Effect.catchTag("SqlError", storageError),
    );
    return AgentRuns.of({ start, read, decide, cancel });
  }),
);

/** Executes jobs; every step tolerates redelivery after a committed transition. */
export const RunJobsLive = Layer.effect(
  RunJobs,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const model = yield* ModelClient;
    const sink = yield* PublishSink;
    const read = (id: string) => readRun(sql, id);

    // The key is stable per proposal version, so a redelivery cannot publish twice.
    const publishApproved = Effect.fn("RunJobs.publishApproved")(function* (
      runId: string,
      attempt: number,
    ) {
      const view = yield* read(runId);
      if (view.status !== "publishing" || !view.proposal) return;
      const receipt = yield* sink.publish(`${runId}:${view.version}`, view.proposal);
      yield* sql`UPDATE review_runs SET status = 'published', receipt = ${receipt}, error = NULL
        WHERE id = ${runId} AND status = 'publishing' AND phase_attempts = ${attempt}`;
    });

    const savedTurn = (runId: string, turn: number) =>
      sql<{
        response: unknown;
      }>`SELECT response FROM review_model_steps WHERE run_id = ${runId} AND turn = ${turn}`.pipe(
        Effect.map((rows) => rows[0]?.response),
      );

    // Replays a committed response, or asks the model and commits before any tool runs.
    const modelTurn = Effect.fn("RunJobs.modelTurn")(function* (
      runId: string,
      turn: number,
      document: string,
      history: ReadonlyArray<Step>,
    ) {
      const saved = yield* savedTurn(runId, turn);
      if (saved !== undefined) return yield* decodeTurn(saved);
      const next = yield* model.respond(document, history);
      const response = yield* encodeTurn(next);
      // First committed response wins if a stale lease produces two responses.
      yield* sql`INSERT INTO review_model_steps (run_id, turn, response)
        VALUES (${runId}, ${turn}, ${response}) ON CONFLICT DO NOTHING`;
      return yield* decodeTurn(yield* savedTurn(runId, turn));
    });

    // Bounded tool loop; stops early if the run leaves `processing` (e.g. cancelled).
    const propose = Effect.fn("RunJobs.propose")(function* (
      runId: string,
      attempt: number,
      document: string,
    ) {
      const history: Array<Step> = [];
      for (let turn = 0; turn < turnLimit; turn++) {
        if ((yield* read(runId)).status !== "processing") return;
        const response = yield* modelTurn(runId, turn, document, history);
        if (response.kind === "proposal") {
          const proposal = yield* encodeProposal(response.proposal);
          yield* sql`UPDATE review_runs SET status = 'awaitingApproval', version = version + 1,
            proposal = ${proposal}, error = NULL
            WHERE id = ${runId} AND status = 'processing' AND phase_attempts = ${attempt}`;
          return;
        }
        // This tool returns immutable example policy; replay has the same output.
        history.push({ turn: response, policy: reviewPolicy });
      }
      yield* sql`UPDATE review_runs SET status = 'failed', error = 'Model turn limit exceeded'
        WHERE id = ${runId} AND status = 'processing' AND phase_attempts = ${attempt}`;
    });

    const handle = Effect.fn("RunJobs.handle")(
      function* (job: Job) {
        const expected = job.phase === "propose" ? "processing" : "publishing";
        // The next delivery settles crash-exhausted work without another external call.
        // A publish may have reached the sink before the crash, so its outcome is unknown.
        const exhausted =
          job.phase === "publish"
            ? "Publish outcome unknown after repeated crashes; reconcile with the sink"
            : "Attempt limit exceeded";
        yield* sql`UPDATE review_runs SET status = 'failed', error = ${exhausted}
      WHERE id = ${job.runId} AND status = ${expected} AND phase_attempts >= ${attemptLimit}`;
        const claimed = yield* sql<{ document: string; phase_attempts: number }>`UPDATE review_runs
      SET attempts = attempts + 1, phase_attempts = phase_attempts + 1
      WHERE id = ${job.runId} AND status = ${expected} RETURNING document, phase_attempts`;
        if (!claimed[0]) return;
        // Every later write is fenced on this attempt, so a delivery whose lease lapsed
        // and was re-claimed elsewhere cannot overwrite the newer claim's outcome.
        const { document, phase_attempts: attempt } = claimed[0];
        const perform = Effect.gen(function* () {
          if (job.phase === "publish") return yield* publishApproved(job.runId, attempt);
          return yield* propose(job.runId, attempt, document);
        });
        // Records a terminal failure; `reason` is operator-facing and omits storage internals.
        const settle = (reason: string) =>
          sql`UPDATE review_runs SET status = 'failed', error = ${reason}
            WHERE id = ${job.runId} AND status = ${expected} AND phase_attempts = ${attempt}`.pipe(
            Effect.asVoid,
          );
        // Fails the delivery so the queue retries, until the attempt limit settles the run.
        const retryOrSettle = <E>(error: E, reason: string) =>
          attempt < attemptLimit ? Effect.fail(error) : settle(reason);
        yield* perform.pipe(
          Effect.catchTags({
            InvalidRunData: () => settle("Invalid model or stored data"),
            ModelError: (error) => retryOrSettle(error, `Model failed: ${error.message}`),
            PublishError: (error) =>
              error.retryable
                ? retryOrSettle(error, `Publish failed: ${error.message}`)
                : settle(`Publish failed: ${error.message}`),
            SqlError: (error) => retryOrSettle(error, "Processing failed"),
            RunNotFound: (error) => retryOrSettle(error, "Processing failed"),
          }),
        );
      },
      Effect.catchTag(["SqlError", "RunNotFound"], storageError),
    );
    return RunJobs.of({ handle });
  }),
);
