import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { Config, Context, Effect, Layer } from "effect";

const makeDb = PgDrizzle.makeWithDefaults();

export class Database extends Context.Service<Database, Effect.Success<typeof makeDb>>()(
  "Database",
) {}

const PgLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
});

export const DrizzleLive = Layer.effect(Database, makeDb).pipe(Layer.provide(PgLive));
