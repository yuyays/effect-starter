import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { Config, Context, Effect, Layer } from "effect";
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { users } from "./schema.ts";

export class Database extends Context.Service<
  Database,
  {
    readonly selectUsers: () => Effect.Effect<
      ReadonlyArray<typeof users.$inferSelect>,
      EffectDrizzleQueryError
    >;
  }
>()("Database") {}

const PgLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
});

export const DrizzleLive = Layer.effect(
  Database,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.makeWithDefaults();
    const selectUsers = Effect.fn("Database.selectUsers")(function* () {
      return yield* db.select().from(users);
    });
    return Database.of({ selectUsers });
  }),
).pipe(Layer.provide(PgLive));
