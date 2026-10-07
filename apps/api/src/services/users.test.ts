import { Database } from "../db/client.js";
import { Effect, Result, type Context } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { UsersListError } from "@effect-starter/contracts/http";
import { listUsers } from "./users.js";

const makeDb = (query: Effect.Effect<ReadonlyArray<unknown>, unknown>) =>
  ({
    select: () => ({
      from: () => query,
    }),
  }) as unknown as Context.Service.Shape<typeof Database>;

const runWithDb = (db: Context.Service.Shape<typeof Database>) =>
  Effect.runPromise(listUsers.pipe(Effect.provideService(Database, db)));

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
      Effect.provideService(Database, makeDb(Effect.fail(new Error("database unavailable")))),
    );
    const result = await Effect.runPromise(Effect.result(program));

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(UsersListError);
      expect(result.failure.message).toBe("Failed to list users");
    }
  });
});
