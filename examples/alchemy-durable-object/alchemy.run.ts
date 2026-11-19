import * as Alchemy from "alchemy";
import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect } from "effect";
import Worker from "./src/worker.ts";

export default Alchemy.Stack(
  "effect-starter-alchemy-durable-object",
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const worker = yield* Worker;
    return { url: worker.url };
  }),
);
