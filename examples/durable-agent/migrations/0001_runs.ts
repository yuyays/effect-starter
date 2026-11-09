import { Effect } from "effect";
import { SqlClient } from "effect/sql";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE review_runs (
    id UUID PRIMARY KEY,
    request_key TEXT NOT NULL UNIQUE,
    input_hash TEXT NOT NULL,
    document TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN
      ('processing', 'awaitingApproval', 'publishing', 'published', 'rejected', 'failed', 'cancelled')),
    version INTEGER NOT NULL DEFAULT 0,
    proposal JSONB,
    attempts INTEGER NOT NULL DEFAULT 0,
    phase_attempts INTEGER NOT NULL DEFAULT 0,
    decided_by TEXT,
    decision TEXT,
    receipt TEXT,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  yield* sql`CREATE TABLE review_model_steps (
    run_id UUID NOT NULL REFERENCES review_runs(id),
    turn INTEGER NOT NULL,
    response JSONB NOT NULL,
    PRIMARY KEY (run_id, turn)
  )`;
});
