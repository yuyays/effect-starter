import { describe, expect, it } from "vitest";
import { usersQueryOptions } from "./users.js";

describe("users query", () => {
  it("keeps a stable cache key for route prefetching", () => {
    expect(usersQueryOptions.queryKey).toEqual(["users"]);
  });
});
