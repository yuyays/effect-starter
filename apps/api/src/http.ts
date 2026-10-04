import { HttpApiBuilder, HttpApiScalar } from "effect/http-api";
import { HttpRouter } from "effect/http";
import { StarterApi } from "@effect-starter/contracts/http";
import { Effect, Layer } from "effect";
import { listUsers } from "./services/users.js";

const HealthLive = HttpApiBuilder.group(StarterApi, "health", (handlers) =>
  handlers.handle("get", () => Effect.succeed({ ok: true, service: "api" as const })),
);

const UsersLive = HttpApiBuilder.group(StarterApi, "users", (handlers) =>
  handlers.handle("list", () => listUsers),
);

const ApiRoutes = HttpApiBuilder.layer(StarterApi, {
  openapiPath: "/docs/openapi.json",
}).pipe(Layer.provide(HealthLive), Layer.provide(UsersLive));

const DocsRoute = HttpApiScalar.layer(StarterApi, {
  path: "/docs",
});

export const HttpLive = Layer.mergeAll(ApiRoutes, DocsRoute).pipe(Layer.provide(HttpRouter.cors()));
