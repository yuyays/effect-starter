import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";
import { HttpRouter } from "effect/http";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from "effect/http-api";
import { DatabaseConfigLive } from "./db.ts";
import {
  AgentRuns,
  RunConflict,
  type RunError,
  RunInput,
  RunInvalid,
  RunNotFound,
  RunView,
  RunsLive,
} from "./runs.ts";

/** The authenticated caller; handlers never take the actor from request data. */
export interface Actor {
  readonly id: string;
}

export class CurrentActor extends Context.Service<CurrentActor, Actor>()(
  "doc-review/CurrentActor",
) {}

/** Storage failures are logged server-side; clients never see their cause. */
class InternalError extends Schema.TaggedError<InternalError>()("InternalError", {}) {}
const hideStorageErrors = <A, R>(effect: Effect.Effect<A, RunError, R>) =>
  effect.pipe(
    Effect.catchTag("RunStorageError", (error) =>
      Effect.logError("Run storage failed", error.cause).pipe(
        Effect.andThen(Effect.fail(new InternalError())),
      ),
    ),
  );

class Unauthenticated extends Schema.TaggedError<Unauthenticated>()("Unauthenticated", {}) {}

class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentActor }
>()("doc-review/Authentication", {
  error: Unauthenticated.pipe(HttpApiSchema.status(401)),
  security: { bearer: HttpApiSecurity.bearer },
}) {}

const errors = [
  RunConflict.pipe(HttpApiSchema.status(409)),
  RunNotFound.pipe(HttpApiSchema.status(404)),
  RunInvalid.pipe(HttpApiSchema.status(400)),
  InternalError.pipe(HttpApiSchema.status(500)),
];
const runParams = { id: Schema.String.check(Schema.isUUID()) };

class RunsApi extends HttpApiGroup.make("runs")
  .add(
    HttpApiEndpoint.post("start", "/runs", {
      headers: { "idempotency-key": Schema.String },
      payload: RunInput,
      success: Schema.Struct({ id: Schema.String }),
      error: errors,
    }),
    HttpApiEndpoint.get("read", "/runs/:id", {
      params: runParams,
      success: RunView,
      error: errors,
    }),
    HttpApiEndpoint.post("cancel", "/runs/:id/cancel", { params: runParams, error: errors }),
  )
  .middleware(Authentication) {}

export class DocReviewApi extends HttpApi.make("doc-review").add(RunsApi) {}

// One static token keeps the example small; replace it with your identity provider.
const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const token = yield* Config.Redacted("API_TOKEN");
    const digest = (value: string) => createHash("sha256").update(value).digest();
    return Authentication.of({
      bearer: Effect.fn("Authentication.bearer")(function* (httpEffect, { credential }) {
        if (!timingSafeEqual(digest(Redacted.value(credential)), digest(Redacted.value(token))))
          return yield* new Unauthenticated();
        return yield* Effect.provideService(httpEffect, CurrentActor, { id: "client" });
      }),
    });
  }),
);

const RunsHandlers = HttpApiBuilder.group(DocReviewApi, "runs", (handlers) =>
  Effect.gen(function* () {
    const runs = yield* AgentRuns;
    return handlers
      .handle("start", ({ headers, payload }) =>
        runs.start(headers["idempotency-key"], payload).pipe(
          Effect.tap((id) =>
            CurrentActor.use((actor) => Effect.logInfo(`Run ${id} started by ${actor.id}`)),
          ),
          Effect.map((id) => ({ id })),
          hideStorageErrors,
        ),
      )
      .handle("read", ({ params }) => hideStorageErrors(runs.read(params.id)))
      .handle("cancel", ({ params }) => hideStorageErrors(runs.cancel(params.id)));
  }),
);

export const ApiLive = HttpApiBuilder.layer(DocReviewApi).pipe(
  Layer.provide(RunsHandlers),
  Layer.provide(AuthenticationLive),
);

if (import.meta.main) {
  const port = Config.Port("PORT").pipe(Config.withDefault(3001));
  const main = Effect.gen(function* () {
    return yield* HttpRouter.serve(ApiLive).pipe(
      Layer.provide(RunsLive),
      Layer.provide(DatabaseConfigLive),
      Layer.provide(NodeHttpServer.layer(createServer, { port: yield* port })),
      Layer.launch,
    );
  });
  NodeRuntime.runMain(main);
}
