import { HttpRouter } from "effect/http";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { createServer } from "node:http";
import { HttpLive } from "./http.js";
import { DrizzleLive } from "./db/client.js";

const Port = Config.Port("PORT").pipe(Config.withDefault(3000));

const ServerLive = Effect.gen(function* () {
  const port = yield* Port;
  yield* Effect.logInfo("API server starting", { port });

  return yield* HttpRouter.serve(HttpLive).pipe(
    Layer.provide(DrizzleLive),
    Layer.provide(NodeHttpServer.layer(createServer, { port })),
    Layer.launch,
  );
}).pipe(Effect.withSpan("api.server"));

NodeRuntime.runMain(ServerLive);
