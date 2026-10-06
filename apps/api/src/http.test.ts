import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer, type Context } from "effect";
import { HttpRouter } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { FetchHttpClient } from "effect/http";
import { StarterApi } from "@effect-starter/contracts/http";
import { DateTime } from "effect";
import { describe, expect, it } from "vitest";
import { Database } from "./db/client.js";
import { HttpLive } from "./http.js";

const makeHandler = (rows: Effect.Effect<ReadonlyArray<unknown>, unknown>) => {
  const db = {
    select: () => ({ from: () => rows }),
  } as unknown as Context.Service.Shape<typeof Database>;

  return HttpRouter.toWebHandler(
    HttpLive.pipe(
      Layer.provideMerge(Layer.succeed(Database, db)),
      Layer.provide(NodeHttpServer.layerHttpServices),
    ),
    { disableLogger: true },
  );
};

describe("HTTP API", () => {
  it("serves health, OpenAPI, docs, and CORS at their existing paths", async () => {
    const { handler, dispose } = makeHandler(Effect.succeed([]));
    try {
      const health = await handler(
        new Request("http://localhost/api/health", {
          headers: { origin: "http://localhost:5173" },
        }),
      );
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true, service: "api" });
      expect(health.headers.get("access-control-allow-origin")).toBe("*");

      const openapi = await handler(new Request("http://localhost/docs/openapi.json"));
      expect(openapi.status).toBe(200);
      const spec = await openapi.json();
      expect(spec.paths["/api/users"].get.responses["500"]).toBeDefined();
      expect(spec.paths["/api/health"].get.responses["200"]).toBeDefined();

      const docs = await handler(new Request("http://localhost/docs"));
      expect(docs.status).toBe(200);
      expect(docs.headers.get("content-type")).toContain("text/html");
      expect(await docs.text()).toContain("scalar");
    } finally {
      await dispose();
    }
  });

  it("serializes user dates and decodes them through the v4 client", async () => {
    const { handler, dispose } = makeHandler(
      Effect.succeed([
        {
          id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
          name: "Ada",
          createdAt: "2026-01-01 09:00:00+09",
        },
      ]),
    );
    try {
      const response = await handler(new Request("http://localhost/api/users"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([
        {
          id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
          name: "Ada",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      const users = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* HttpApiClient.make(StarterApi, { baseUrl: "http://localhost" });
          return yield* client.users.list({});
        }).pipe(
          Effect.provide(FetchHttpClient.layer),
          Effect.provideService(FetchHttpClient.Fetch, (input, init) =>
            handler(new Request(input, init)),
          ),
        ),
      );
      expect(DateTime.formatIso(users[0]!.createdAt)).toBe("2026-01-01T00:00:00.000Z");
    } finally {
      await dispose();
    }
  });

  it("returns the typed 500 response for database failures and invalid rows", async () => {
    for (const query of [
      Effect.fail(new Error("database unavailable")),
      Effect.succeed([{ id: "invalid", name: "Ada", createdAt: "not a date" }]),
    ]) {
      const { handler, dispose } = makeHandler(query);
      try {
        const response = await handler(new Request("http://localhost/api/users"));
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({
          _tag: "UsersListError",
          message: "Failed to list users",
        });
      } finally {
        await dispose();
      }
    }
  });
});
