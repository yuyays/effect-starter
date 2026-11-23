import { NodeHttpServer } from "@effect/platform-node";
import { DateTime, Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpRouter } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { StarterApi, UsersListError } from "@effect-starter/contracts/http";
import { describe, expect, it } from "@effect/vitest";
import { Database, DatabaseError } from "./db/database.ts";
import { HttpLive } from "./http.ts";

const baseUrl = "http://localhost";

/**
 * Runs `self` against an in-memory API whose database returns `rows`. Requests go
 * through Effect's `HttpClient`, with `fetch` routed to the web handler.
 */
const withApi = <A, E, R>(
  rows: ReturnType<Database["Service"]["selectUsers"]>,
  self: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const { handler } = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(
          HttpLive.pipe(
            Layer.provideMerge(Layer.succeed(Database, { selectUsers: () => rows })),
            Layer.provide(NodeHttpServer.layerHttpServices),
          ),
          { disableLogger: true },
        ),
      ),
      ({ dispose }) => Effect.promise(dispose),
    );
    return yield* self.pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, (input, init) =>
        handler(new Request(input, init)),
      ),
    );
  }).pipe(Effect.scoped);

const ada = {
  id: "8c2f3558-1ec5-4b87-b7af-7ad83f8c7778",
  name: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("HTTP API", () => {
  it.effect("serves health, OpenAPI, docs, and CORS at their existing paths", () =>
    withApi(
      Effect.succeed([]),
      Effect.gen(function* () {
        const health = yield* HttpClient.get(`${baseUrl}/api/health`, {
          headers: { origin: "http://localhost:5173" },
        });
        expect(health.status).toBe(200);
        expect(yield* health.json).toEqual({ ok: true, service: "api" });
        expect(health.headers["access-control-allow-origin"]).toBe("*");

        const openapi = yield* HttpClient.get(`${baseUrl}/docs/openapi.json`);
        expect(openapi.status).toBe(200);
        const spec = yield* openapi.json;
        expect(spec).toHaveProperty(
          ["paths", "/api/users", "get", "responses", "500"],
          expect.any(Object),
        );
        expect(spec).toHaveProperty(
          ["paths", "/api/health", "get", "responses", "200"],
          expect.any(Object),
        );

        const docs = yield* HttpClient.get(`${baseUrl}/docs`);
        expect(docs.status).toBe(200);
        expect(docs.headers["content-type"]).toContain("text/html");
        expect(yield* docs.text).toContain("scalar");
      }),
    ),
  );

  it.effect("serializes user dates and decodes them through the v4 client", () =>
    withApi(
      Effect.succeed([{ ...ada, createdAt: "2026-01-01 09:00:00+09" }]),
      Effect.gen(function* () {
        const response = yield* HttpClient.get(`${baseUrl}/api/users`);
        expect(response.status).toBe(200);
        expect(yield* response.json).toEqual([ada]);

        const client = yield* HttpApiClient.make(StarterApi, { baseUrl });
        const users = yield* client.users.list({});
        expect(DateTime.formatIso(users[0]!.createdAt)).toBe("2026-01-01T00:00:00.000Z");
      }),
    ),
  );

  it.effect("returns the typed 500 response for database failures and invalid rows", () =>
    Effect.forEach(
      [
        Effect.fail(new DatabaseError({ cause: "database unavailable" })),
        ...[{ id: "invalid" }, { createdAt: "not a date" }, { name: "" }].map((invalidField) =>
          Effect.succeed([{ ...ada, ...invalidField }]),
        ),
      ],
      (rows) =>
        withApi(
          rows,
          Effect.gen(function* () {
            const response = yield* HttpClient.get(`${baseUrl}/api/users`);
            expect(response.status).toBe(500);
            expect(yield* response.json).toEqual({
              _tag: "UsersListError",
              message: "Failed to list users",
            });

            const client = yield* HttpApiClient.make(StarterApi, { baseUrl });
            const error = yield* Effect.flip(client.users.list({}));
            expect(error).toBeInstanceOf(UsersListError);
          }),
        ),
      { discard: true },
    ),
  );
});
