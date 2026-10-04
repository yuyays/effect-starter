import { Database } from "../db/client.js";
import { UsersListError } from "@effect-starter/contracts/http";
import { Schema, Effect } from "effect";
import { UsersResponse } from "@effect-starter/contracts/schemas/user";
import { users } from "../db/schema.js";

export const listUsers = Effect.gen(function* () {
  const db = yield* Database;
  const rows = yield* db.select().from(users);
  return yield* Schema.decodeUnknownEffect(UsersResponse)(rows);
}).pipe(
  Effect.tapError(() => Effect.logError("Failed to list users")),
  Effect.mapError(() => new UsersListError({ message: "Failed to list users" })),
  Effect.withSpan("users.list"),
);
