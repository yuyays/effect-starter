import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { type UsersError, usersErrorMessage, usersQueryOptions } from "./users.js";

// Effect reads `globalThis.fetch` once, so every test shares this stub and sets its response.
const fetchStub = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  fetchStub.mockReset();
  vi.unstubAllGlobals();
});

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("users query", () => {
  it("aborts the HTTP request when the query is cancelled", async () => {
    const signals: Array<AbortSignal> = [];
    // A request that never answers, so only cancellation can end it.
    fetchStub.mockImplementation((_input, init) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const client = newClient();
    const fetching = client.fetchQuery(usersQueryOptions);
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    await client.cancelQueries({ queryKey: usersQueryOptions.queryKey });

    await expect(fetching).rejects.toThrow();
    expect(signals[0]?.aborted).toBe(true);
  });

  // Fetches users once and explains the failure.
  const failureMessage = async (respond: () => Promise<Response>) => {
    fetchStub.mockImplementation(respond);
    const error = await newClient()
      .fetchQuery(usersQueryOptions)
      .then(
        () => expect.unreachable("the users query should fail"),
        (cause: UsersError) => cause,
      );
    return usersErrorMessage(error);
  };

  it("tells an API-side failure apart from an unreachable API", async () => {
    const apiFailure = await failureMessage(async () =>
      Response.json({ _tag: "UsersListError", message: "Failed to list users" }, { status: 500 }),
    );
    const unreachable = await failureMessage(() => Promise.reject(new TypeError("fetch failed")));
    // A dev proxy answers 500 without the contract body when the API is down.
    const proxied = await failureMessage(async () => new Response("", { status: 500 }));

    expect(apiFailure).toBe("The API could not load users. Check its database connection.");
    expect(unreachable).toBe("Could not load users. Is the API running?");
    expect(proxied).toBe("Could not load users. Is the API running?");
  });
});
