import { NodeHttpServer } from "@effect/platform-node";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { FetchHttpClient, HttpClient, HttpRouter, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "@effect/vitest";
import { Agent, get, type Server } from "node:http";
import { createApiServer } from "./server.ts";
import { Database } from "./db/database.ts";
import { HttpLive } from "./http.ts";

// Signals when a request reaches the handler, then answers after a delay, so the
// request is provably in flight when the test starts shutdown.
const slowRoute = (arrived: Deferred.Deferred<void>) =>
  HttpRouter.add(
    "GET",
    "/slow",
    Deferred.succeed(arrived, undefined).pipe(
      Effect.andThen(Effect.sleep("200 millis")),
      Effect.as(HttpServerResponse.text("slow")),
    ),
  );

const request = (agent: Agent, port: number) =>
  Effect.callback<string, Error>((resume) => {
    const req = get({ agent, host: "127.0.0.1", port, path: "/slow" }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        body += chunk;
      });
      response.once("end", () => resume(Effect.succeed(body)));
    });
    req.once("error", (error) => resume(Effect.fail(error)));
    return Effect.sync(() => req.destroy());
  });

const listeningPort = (server: Server) =>
  Effect.gen(function* () {
    yield* Effect.callback<void>((resume) => {
      if (server.listening) resume(Effect.void);
      else server.once("listening", () => resume(Effect.void));
    });
    const address = server.address();
    return address !== null && typeof address === "object"
      ? address.port
      : yield* Effect.die(new Error("The API server is not listening on a TCP port"));
  });

// Starts the API with one keep-alive socket shared by every request, like a browser
// or the dev proxy, and an in-flight request on that socket.
const serveWithRequestInFlight = Effect.gen(function* () {
  const server = createApiServer();
  // If shutdown regresses, this unblocks teardown so the test fails instead of hanging.
  yield* Effect.addFinalizer(() => Effect.sync(() => server.closeAllConnections()));
  const arrived = yield* Deferred.make<void>();
  const serving = yield* HttpRouter.serve(slowRoute(arrived), { disableLogger: true }).pipe(
    Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
    Layer.launch,
    Effect.forkChild,
  );
  const port = yield* listeningPort(server);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  yield* Effect.addFinalizer(() => Effect.sync(() => agent.destroy()));
  const inFlight = yield* Effect.forkChild(request(agent, port));
  yield* Deferred.await(arrived);
  return { agent, port, serving, inFlight };
});

// Shutdown must finish well inside Node's 5s keep-alive timeout.
const shutDown = (serving: Fiber.Fiber<unknown, unknown>) =>
  Fiber.interrupt(serving).pipe(Effect.timeout("3 seconds"));

describe("API server", () => {
  it.live("interrupts backend work and runs cleanup when the client disconnects", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const cleaned = yield* Deferred.make<void>();
      const interrupted = yield* Ref.make(false);
      const finalizers = yield* Ref.make(0);
      const query = Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Ref.set(interrupted, true)),
        Effect.ensuring(
          Ref.update(finalizers, (count) => count + 1).pipe(
            Effect.andThen(Deferred.succeed(cleaned, undefined)),
          ),
        ),
      );
      const server = createApiServer();
      yield* Effect.addFinalizer(() => Effect.sync(() => server.closeAllConnections()));
      const serving = yield* HttpRouter.serve(HttpLive, { disableLogger: true }).pipe(
        Layer.provide(Layer.succeed(Database, { selectUsers: () => query })),
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
        Layer.launch,
        Effect.forkChild,
      );
      const port = yield* listeningPort(server);
      const client = yield* HttpClient.HttpClient;
      const pending = yield* client
        .get(`http://127.0.0.1:${port}/api/users`)
        .pipe(Effect.forkChild);
      yield* Deferred.await(entered).pipe(Effect.timeout("3 seconds"));

      // Interrupting the real HTTP client closes its connection after the query has started.
      yield* Fiber.interrupt(pending);
      yield* Deferred.await(cleaned).pipe(Effect.timeout("3 seconds"));
      expect(yield* Ref.get(interrupted)).toBe(true);
      expect(yield* Ref.get(finalizers)).toBe(1);

      const health = yield* client.get(`http://127.0.0.1:${port}/api/health`);
      expect(health.status).toBe(200);
      expect(yield* health.json).toEqual({ ok: true, service: "api" });
      yield* shutDown(serving);
      expect(yield* Ref.get(finalizers)).toBe(1);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );

  // Real sockets and Node's keep-alive handling run on the wall clock, not TestClock.
  it.live("closes a connection whose request was in flight when shutdown started", () =>
    Effect.gen(function* () {
      const { serving, inFlight } = yield* serveWithRequestInFlight;
      yield* shutDown(serving);
      expect(yield* Fiber.join(inFlight)).toBe("slow");
    }),
  );

  it.live("shuts down while a keep-alive client keeps polling", () =>
    Effect.gen(function* () {
      const { agent, port, serving, inFlight } = yield* serveWithRequestInFlight;
      // Queued behind the in-flight request on the same socket, back to back.
      yield* request(agent, port).pipe(Effect.forever, Effect.ignore, Effect.forkChild);
      yield* shutDown(serving);
      expect(yield* Fiber.join(inFlight)).toBe("slow");
    }),
  );
});
