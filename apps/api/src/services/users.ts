import { Schema } from "effect";
import { Effect } from "effect";
import { UsersResponse } from "@effect-starter/contracts/schemas/user";
import { makeDb } from "../db/client.js";
import { users } from "../db/schema.js";

export const listUsers = Effect.gen(function* () {
  const db = yield* makeDb;
  const rows = yield* Effect.promise(() => db.select().from(users));

  return yield* Schema.decodeUnknown(UsersResponse)(rows);
});
