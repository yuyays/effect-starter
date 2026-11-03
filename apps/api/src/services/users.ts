import { Database } from "../db/client.js";
import { UsersListError } from "@effect-starter/contracts/http";
import { Schema, Effect } from "effect";
import { UsersResponse } from "@effect-starter/contracts/schemas/user";

export const listUsers = Effect.fn("users.list")(
  function* () {
    const db = yield* Database;
    const rows = yield* db.selectUsers();
    return yield* Schema.decodeUnknownEffect(UsersResponse)(rows);
  },
  Effect.tapError((error) => Effect.logError("Failed to list users", error)),
  Effect.mapError(() => new UsersListError({ message: "Failed to list users" })),
);
