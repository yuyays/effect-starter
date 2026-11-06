import { Context, type Effect, Schema } from "effect";
import type { users } from "./schema.ts";

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect(),
}) {}

export class Database extends Context.Service<
  Database,
  {
    readonly selectUsers: () => Effect.Effect<
      ReadonlyArray<typeof users.$inferSelect>,
      DatabaseError
    >;
  }
>()("Database") {}
