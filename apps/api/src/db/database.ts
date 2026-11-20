import { Context, type Effect, Schema } from "effect";
import type { User } from "@effect-starter/contracts/schemas/user";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
}) {}

export class Database extends Context.Service<
  Database,
  {
    /**
     * Rows are typed as the contract's encoded shape, so a renamed, removed or retyped
     * column fails to compile. Only the shape is checked here; `decodeUsers` enforces the
     * rules (GUID id, non-empty name) at the boundary.
     */
    readonly selectUsers: () => Effect.Effect<ReadonlyArray<typeof User.Encoded>, DatabaseError>;
  }
>()("Database") {}
