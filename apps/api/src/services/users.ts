import { PgDrizzle } from "@effect/sql-drizzle/Pg"
import { Schema, Effect } from "effect"
import { UsersResponse } from "@effect-starter/contracts/schemas/user"
import { users } from "../db/schema.js"

export const listUsers = Effect.gen(function* () {
  const db = yield* PgDrizzle
  const rows = yield* db.select().from(users)
  return yield* Schema.decodeUnknown(UsersResponse)(rows)
})
