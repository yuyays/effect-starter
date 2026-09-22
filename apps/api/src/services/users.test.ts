import { PgDrizzle } from "@effect/sql-drizzle/Pg";
import { Context, Effect, Either } from "effect";
import { describe, expect, it } from "vitest";
import { UsersListError } from "@effect-starter/contracts/http";
import { listUsers } from "./users.js";

const makeDb = (query: Effect.Effect<ReadonlyArray<unknown>, unknown>) =>
  ({
    select: () => ({
      from: () => query,
    }),
  }) as unknown as Context.Tag.Service<typeof PgDrizzle>;

const runWithDb = (db: Context.Tag.Service<typeof PgDrizzle>) =>
  Effect.runPromise(listUsers.pipe(Effect.provideService(PgDrizzle, db)));

describe("listUsers", () => {
  it("decodes rows returned by the database", async () => {
    const users = await runWithDb(
      makeDb(
        Effect.succeed([
          {
            id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
            name: "Ada",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      ),
    );

    expect(users[0]?.name).toBe("Ada");
  });

  it("translates database failures into the API error", async () => {
    const program = listUsers.pipe(
      Effect.provideService(PgDrizzle, makeDb(Effect.fail(new Error("database unavailable")))),
    );
    const result = await Effect.runPromise(Effect.either(program));

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(UsersListError);
      expect(result.left.message).toBe("Failed to list users");
    }
  });
});
