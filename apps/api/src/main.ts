import { HttpRouter } from "effect/http";
import { NodeFileSystem, NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Config, Effect, Layer } from "effect";
import { HttpLive } from "./http.ts";
import { DrizzleLive } from "./db/client.ts";
import { createApiServer } from "./server.ts";
import { AppConfigLive } from "./config.ts";

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

NodeRuntime.runMain(
  ServerLive.pipe(Effect.provide(AppConfigLive.pipe(Layer.provide(NodeFileSystem.layer)))),
);
