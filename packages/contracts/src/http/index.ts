import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { UsersResponse } from "../schemas/user.js";

export const HealthResponse = Schema.Struct({
  ok: Schema.Boolean,
  service: Schema.Literal("api"),
});

export type HealthResponse = typeof HealthResponse.Type;

export class HealthApi extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("get", "/health").addSuccess(HealthResponse),
) {}

export class UsersApi extends HttpApiGroup.make("users").add(
  HttpApiEndpoint.get("list", "/users").addSuccess(UsersResponse),
) {}

export class StarterApi extends HttpApi.make("starter-api")
  .add(HealthApi)
  .add(UsersApi)
  .prefix("/api") {}
