import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AsyncResult, AtomRegistry } from "effect/reactivity";
import { usersAtom, usersErrorMessage } from "./users.js";

// The atom builds its HTTP client lazily per registry, so a stub installs per test.
const fetchStub = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  fetchStub.mockReset();
  vi.unstubAllGlobals();
});

/** Mounts the atom until the query settles, then returns the settled result. */
const settle = async () => {
  const registry = AtomRegistry.make();
  const unmount = registry.mount(usersAtom);
  await vi.waitFor(() => {
    expect(AsyncResult.isNotInitial(registry.get(usersAtom))).toBe(true);
  });
  const result = registry.get(usersAtom);
  unmount();
  registry.dispose();
  return result;
};

const messageFor = (result: AsyncResult.AsyncResult<unknown, unknown>) =>
  AsyncResult.matchWithError(result, {
    onInitial: () => "initial",
    onSuccess: () => "success",
    onError: (error) => usersErrorMessage(error),
    // Transport and schema failures never reach the contract, so they read as unreachable.
    onDefect: () => usersErrorMessage(undefined),
  });

describe("users atom", () => {
  it("loads the users the contract declares", async () => {
    fetchStub.mockImplementation(async () =>
      Response.json([
        {
          id: "3f0a2b46-6b5b-4c58-9f6f-2f0f9c1f8a11",
          name: "Ada",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "8c2e1d7a-4f3b-4a6e-9d21-5b7c8e9f0a12",
          name: "Grace",
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ]),
    );

    const result = await settle();

    expect(AsyncResult.isSuccess(result)).toBe(true);
    // `createdAt` decodes to a DateTime, so compare the fields the card renders.
    expect(
      AsyncResult.isSuccess(result) ? result.value.map((user) => user.name) : undefined,
    ).toEqual(["Ada", "Grace"]);
  });

  it("aborts the request when the last reader unmounts", async () => {
    const signals: Array<AbortSignal> = [];
    // A request that never answers, so only disposal can end it.
    fetchStub.mockImplementation((_input, init) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const registry = AtomRegistry.make();
    try {
      const unmount = registry.mount(usersAtom);
      await vi.waitFor(() => expect(signals).toHaveLength(1));
      unmount();
      await vi.waitFor(() => expect(signals[0]?.aborted).toBe(true));
    } finally {
      // Disposal also aborts, so only the wait above proves the unmount did it.
      registry.dispose();
    }
  });

  it("tells an API-side failure apart from an unreachable API", async () => {
    fetchStub.mockImplementation(async () =>
      Response.json({ _tag: "UsersListError", message: "Failed to list users" }, { status: 500 }),
    );
    const apiFailure = await settle();

    fetchStub.mockImplementation(() => Promise.reject(new TypeError("fetch failed")));
    const unreachable = await settle();

    // A dev proxy answers 500 without the contract body when the API is down.
    fetchStub.mockImplementation(async () => new Response("", { status: 500 }));
    const proxied = await settle();

    expect(messageFor(apiFailure)).toBe(
      "The API could not load users. Check its database connection.",
    );
    expect(messageFor(unreachable)).toBe(
      "Could not load users. The API is unreachable or returned an unexpected response.",
    );
    expect(messageFor(proxied)).toBe(
      "Could not load users. The API is unreachable or returned an unexpected response.",
    );
  });
});
