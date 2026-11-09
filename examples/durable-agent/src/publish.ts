import { Config, Context, Effect, Layer, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import type { Proposal } from "./propose.ts";

export class PublishError extends Schema.TaggedError<PublishError>()("PublishError", {
  message: Schema.String,
  retryable: Schema.Boolean,
}) {}

/** The sink must bind each key to one payload and return the same receipt on retries. */
export class PublishSink extends Context.Service<
  PublishSink,
  {
    readonly publish: (key: string, proposal: Proposal) => Effect.Effect<string, PublishError>;
  }
>()("doc-review/PublishSink") {}

const decodeReceipt = HttpClientResponse.schemaBodyJson(Schema.Struct({ receipt: Schema.String }));

export const HttpPublishLive = Layer.effect(
  PublishSink,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const url = yield* Config.String("PUBLISH_URL");
    const token = yield* Config.Redacted("PUBLISH_TOKEN");
    const publish = Effect.fn("PublishSink.publish")(
      function* (key: string, proposal: Proposal) {
        const request = yield* HttpClientRequest.post(url).pipe(
          HttpClientRequest.bearerToken(token),
          HttpClientRequest.setHeader("Idempotency-Key", key),
          HttpClientRequest.bodyJson(proposal),
        );
        const response = yield* client.execute(request);
        if (response.status < 200 || response.status >= 300)
          return yield* new PublishError({
            message: "Publish sink rejected the request",
            retryable: response.status === 429 || response.status >= 500,
          });
        return (yield* decodeReceipt(response)).receipt;
      },
      Effect.timeout("15 seconds"),
      Effect.mapError((error) =>
        error instanceof PublishError
          ? error
          : new PublishError({
              message: "Publish sink unavailable or returned invalid output",
              retryable: true,
            }),
      ),
    );
    return PublishSink.of({ publish });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
