import { Database } from "../db/client.js";
import { Effect, Result } from "effect";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { describe, expect, it } from "@effect/vitest";
import { UsersListError } from "@effect-starter/contracts/http";
import { listUsers } from "./users.js";

describe("listUsers", () => {
  it.effect("decodes rows returned by the database", () =>
    Effect.gen(function* () {
      const users = yield* listUsers().pipe(
        Effect.provideService(Database, {
          selectUsers: () =>
            Effect.succeed([
              {
                id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
                name: "Ada",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ]),
        }),
      );
      expect(users[0]?.name).toBe("Ada");
    }),
  );

  it.effect("translates database failures into the API error", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        listUsers().pipe(
          Effect.provideService(Database, {
            selectUsers: () =>
              Effect.fail(
                new EffectDrizzleQueryError({
                  query: "select users",
                  params: [],
                  cause: "database unavailable",
                }),
              ),
          }),
        ),
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(UsersListError);
        expect(result.failure.message).toBe("Failed to list users");
      }
    }),
  );
});
