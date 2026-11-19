import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import { HttpServerRequest } from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import ScopeDO from "./scope.ts";

const stringify = (value: unknown) => JSON.stringify(value);

export default Cloudflare.Worker(
  "Worker",
  { main: import.meta.url },
  Effect.gen(function* () {
    const scopes = yield* ScopeDO;
    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest;
        const [, , name = "demo", method = "per-call", key = "per-call"] = new URL(
          request.url,
          "http://localhost",
        ).pathname.split("/");
        const stub = scopes.getByName(name);
        const call =
          method === "construction"
            ? stub.construction().pipe(Effect.map(stringify))
            : method === "retained"
              ? stub.retained().pipe(Effect.map(stringify))
              : method === "closed"
                ? stub.closedCount(key).pipe(Effect.map((count) => stringify({ count })))
                : stub.perCall().pipe(Effect.map(stringify));
        const result = yield* call.pipe(
          Effect.match({
            onFailure: (error) => ({ ok: false, message: String(error) }),
            onSuccess: (message) => ({ ok: true, message }),
          }),
        );
        return result.ok
          ? HttpServerResponse.text(result.message)
          : HttpServerResponse.text(result.message, { status: 500 });
      }),
    };
  }),
);
