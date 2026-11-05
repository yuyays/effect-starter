import { NodeHttpServer } from "@effect/platform-node";
import { DateTime, Effect, Layer } from "effect";
import { HttpRouter, FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { StarterApi } from "@effect-starter/contracts/http";
import { describe, expect, it } from "@effect/vitest";
import { Database } from "./db/client.ts";
import { HttpLive } from "./http.ts";

const makeHandler = (rows: ReturnType<Database["Service"]["selectUsers"]>) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        HttpLive.pipe(
          Layer.provideMerge(Layer.succeed(Database, { selectUsers: () => rows })),
          Layer.provide(NodeHttpServer.layerHttpServices),
        ),
        { disableLogger: true },
      ),
    ),
    ({ dispose }) => Effect.promise(() => dispose()),
  );

describe("HTTP API", () => {
  it.effect("serves health, OpenAPI, docs, and CORS at their existing paths", () =>
    Effect.gen(function* () {
      const { handler } = yield* makeHandler(Effect.succeed([]));
      const health = yield* Effect.promise(() =>
        handler(
          new Request("http://localhost/api/health", {
            headers: { origin: "http://localhost:5173" },
          }),
        ),
      );
      expect(health.status).toBe(200);
      expect(yield* Effect.promise(() => health.json())).toEqual({ ok: true, service: "api" });
      expect(health.headers.get("access-control-allow-origin")).toBe("*");

      const openapi = yield* Effect.promise(() =>
        handler(new Request("http://localhost/docs/openapi.json")),
      );
      expect(openapi.status).toBe(200);
      const spec = yield* Effect.promise(() => openapi.json());
      expect(spec.paths["/api/users"].get.responses["500"]).toBeDefined();
      expect(spec.paths["/api/health"].get.responses["200"]).toBeDefined();

      const docs = yield* Effect.promise(() => handler(new Request("http://localhost/docs")));
      expect(docs.status).toBe(200);
      expect(docs.headers.get("content-type")).toContain("text/html");
      expect(yield* Effect.promise(() => docs.text())).toContain("scalar");
    }),
  );

  it.effect("serializes user dates and decodes them through the v4 client", () =>
    Effect.gen(function* () {
      const { handler } = yield* makeHandler(
        Effect.succeed([
          {
            id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
            name: "Ada",
            createdAt: "2026-01-01 09:00:00+09",
          },
        ]),
      );
      const response = yield* Effect.promise(() =>
        handler(new Request("http://localhost/api/users")),
      );
      expect(response.status).toBe(200);
      expect(yield* Effect.promise(() => response.json())).toEqual([
        {
          id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
          name: "Ada",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ]);

      const users = yield* Effect.gen(function* () {
        const client = yield* HttpApiClient.make(StarterApi, { baseUrl: "http://localhost" });
        return yield* client.users.list({});
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, (input, init) =>
          handler(new Request(input, init)),
        ),
      );
      expect(DateTime.formatIso(users[0]!.createdAt)).toBe("2026-01-01T00:00:00.000Z");
    }),
  );

  it.effect("returns the typed 500 response for database failures and invalid rows", () =>
    Effect.gen(function* () {
      for (const query of [
        Effect.fail(
          new EffectDrizzleQueryError({
            query: "select users",
            params: [],
            cause: "database unavailable",
          }),
        ),
        ...[{ id: "invalid" }, { createdAt: "not a date" }, { name: "" }].map((invalidField) =>
          Effect.succeed([
            {
              id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
              name: "Ada",
              createdAt: "2026-01-01T00:00:00.000Z",
              ...invalidField,
            },
          ]),
        ),
      ]) {
        yield* Effect.scoped(
          Effect.gen(function* () {
            const { handler } = yield* makeHandler(query);
            const response = yield* Effect.promise(() =>
              handler(new Request("http://localhost/api/users")),
            );
            expect(response.status).toBe(500);
            expect(yield* Effect.promise(() => response.json())).toEqual({
              _tag: "UsersListError",
              message: "Failed to list users",
            });
          }),
        );
      }
    }),
  );
});
