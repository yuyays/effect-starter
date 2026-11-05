import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Fiber, Layer, Option } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { describe, expect, it } from "@effect/vitest";
import { Agent, get } from "node:http";
import { createApiServer } from "./server.js";

// Answers after a delay so a request is always in flight when shutdown starts.
const Slow = HttpRouter.add(
  "GET",
  "/slow",
  Effect.as(Effect.sleep("200 millis"), HttpServerResponse.text("slow")),
);

const request = (agent: Agent, port: number) =>
  Effect.callback<void, Error>((resume) => {
    const req = get({ agent, host: "127.0.0.1", port, path: "/slow" }, (response) => {
      response.resume();
      response.once("end", () => resume(Effect.void));
    });
    req.once("error", (error) => resume(Effect.fail(error)));
  });

describe("API server", () => {
  it.live("shuts down while a keep-alive client keeps polling", () =>
    Effect.gen(function* () {
      const server = createApiServer();
      const serving = yield* HttpRouter.serve(Slow, { disableLogger: true }).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
        Layer.launch,
        Effect.forkChild,
      );
      yield* Effect.callback<void>((resume) => {
        if (server.listening) resume(Effect.void);
        else server.once("listening", () => resume(Effect.void));
      });
      const address = server.address();
      const port =
        address !== null && typeof address === "object"
          ? address.port
          : yield* Effect.die(new Error("The API server is not listening on a TCP port"));
      // One socket, reused for every request, like a browser or dev proxy polling the API.
      const agent = new Agent({ keepAlive: true, maxSockets: 1 });
      yield* Effect.addFinalizer(() => Effect.sync(() => agent.destroy()));
      // Polls back to back until the server refuses the connection.
      yield* request(agent, port).pipe(Effect.forever, Effect.ignore, Effect.forkChild);
      yield* Effect.sleep("100 millis");

      const shutdown = yield* Fiber.interrupt(serving).pipe(Effect.timeoutOption("3 seconds"));
      expect(Option.isSome(shutdown)).toBe(true);
    }),
  );
});
