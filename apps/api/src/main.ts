import { HttpRouter } from "effect/http";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { HttpLive } from "./http.js";
import { DrizzleLive } from "./db/client.js";
import { createApiServer } from "./server.js";

const Port = Config.Port("PORT").pipe(Config.withDefault(3000));

const ServerLive = Effect.gen(function* () {
  const port = yield* Port;
  yield* Effect.logInfo("API server starting", { port });

  return yield* HttpRouter.serve(HttpLive).pipe(
    Layer.provide(DrizzleLive),
    Layer.provide(NodeHttpServer.layer(createApiServer, { port })),
    Layer.launch,
  );
}).pipe(Effect.withSpan("api.server"));

NodeRuntime.runMain(ServerLive);
