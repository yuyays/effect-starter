import { HttpApiBuilder, HttpApiScalar, HttpLayerRouter } from "@effect/platform";
import { StarterApi } from "@effect-starter/contracts/http";
import { Effect, Layer } from "effect";
import { listUsers } from "./services/users.js";

const HealthLive = HttpApiBuilder.group(StarterApi, "health", (handlers) =>
  handlers.handle("get", () => Effect.succeed({ ok: true, service: "api" as const })),
);

const UsersLive = HttpApiBuilder.group(StarterApi, "users", (handlers) =>
  handlers.handle("list", () => listUsers.pipe(Effect.orDie)),
);

const ApiRoutes = HttpLayerRouter.addHttpApi(StarterApi, {
  openapiPath: "/docs/openapi.json",
}).pipe(Layer.provide(HealthLive), Layer.provide(UsersLive));

const DocsRoute = HttpApiScalar.layerHttpLayerRouter({
  api: StarterApi,
  path: "/docs",
});

export const HttpLive = Layer.mergeAll(ApiRoutes, DocsRoute).pipe(
  Layer.provide(HttpLayerRouter.cors()),
);
