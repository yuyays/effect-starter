import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { UsersListError } from "../http/errors.js";
import { User } from "./user.js";

describe("User schema", () => {
  it("decodes a valid user", () => {
    const user = Schema.decodeUnknownSync(User)({
      id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
      name: "Ada",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(user.name).toBe("Ada");
  });

  it("decodes the typed users list error", () => {
    const error = Schema.decodeUnknownSync(UsersListError)({
      _tag: "UsersListError",
      message: "Failed to list users",
    });

    expect(error).toBeInstanceOf(UsersListError);
    expect(error.message).toBe("Failed to list users");
  });
});
