import { Database, DatabaseError } from "../db/database.ts";
import { Effect, Result } from "effect";
import { describe, expect, it } from "@effect/vitest";
import { UsersListError } from "@effect-starter/contracts/http";
import { listUsers } from "./users.ts";

describe("listUsers", () => {
  it.effect("translates database failures into the API error", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        listUsers().pipe(
          Effect.provideService(Database, {
            selectUsers: () =>
              Effect.fail(
                new DatabaseError({
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
