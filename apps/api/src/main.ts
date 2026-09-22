import { HttpLayerRouter } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { createServer } from "node:http";
import { HttpLive } from "./http.js";
import { DrizzleLive } from "./db/client.js";

const Port = Config.integer("PORT").pipe(Config.withDefault(3000));

const ServerLive = Effect.gen(function* () {
  const port = yield* Port;
  yield* Effect.logInfo("API server starting", { port });

  return HttpLayerRouter.serve(HttpLive).pipe(
    Layer.provide(DrizzleLive),
    Layer.provide(NodeHttpServer.layer(createServer, { port })),
    Layer.launch,
  );
}).pipe(Effect.flatten, Effect.withSpan("api.server"));

NodeRuntime.runMain(ServerLive);
