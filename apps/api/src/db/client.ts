import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Effect } from "effect";
import { AppConfig } from "../config.js";
import * as schema from "./schema.js";

export const makeDb = Effect.gen(function* () {
  const config = yield* AppConfig;
  const client = postgres(config.databaseUrl, { max: 1 });

  return drizzle(client, { schema });
});

export type Db = Effect.Effect.Success<typeof makeDb>;
