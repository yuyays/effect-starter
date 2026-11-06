import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { Config, Effect, Layer } from "effect";
import { Database, DatabaseError } from "./database.ts";
import { users } from "./schema.ts";

const PgLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
});

export const DrizzleLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.makeWithDefaults();
    const selectUsers = Effect.fn("Database.selectUsers")(function* () {
      return yield* db
        .select()
        .from(users)
        .pipe(Effect.mapError((cause) => new DatabaseError({ cause })));
    });
    return Database.of({ selectUsers });
  }),
).pipe(Layer.provide(PgLive));
