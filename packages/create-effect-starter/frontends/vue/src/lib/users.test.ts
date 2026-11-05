import { QueryClient } from "@tanstack/vue-query";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { usersQueryOptions } from "./users.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("users query", () => {
  it("keeps a stable cache key for route prefetching", () => {
    expect(usersQueryOptions.queryKey).toEqual(["users"]);
  });

  it("aborts the HTTP request when the query is cancelled", async () => {
    const signals: Array<AbortSignal> = [];
    // A request that never answers, so only cancellation can end it.
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fetching = client.fetchQuery(usersQueryOptions);
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    await client.cancelQueries({ queryKey: usersQueryOptions.queryKey });

    await expect(fetching).rejects.toThrow();
    expect(signals[0]?.aborted).toBe(true);
  });
});
