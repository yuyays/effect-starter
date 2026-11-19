import assert from "node:assert/strict";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Test from "@alchemy.run/test/Vitest";
import { Effect, Schema, Schedule } from "effect";
import { HttpClient } from "effect/http";
import Stack from "../alchemy.run.ts";

const { test, beforeAll, deploy } = Test.make({
  providers: Cloudflare.providers(),
  state: Cloudflare.state(),
  dev: true,
});

const stack = beforeAll(deploy(Stack));
const HandleView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  closed: Schema.Boolean,
});
const decodeHandle = Schema.decodeUnknownSync(HandleView);
const CountView = Schema.decodeUnknownSync(Schema.Struct({ count: Schema.Number }));

test(
  "call scopes finalize each response while construction handles stay stable",
  Effect.gen(function* () {
    const { url } = yield* stack;
    assert.ok(url, "The stack did not expose a Worker URL");
    // A fresh object per run keeps finalizer counters independent of earlier runs.
    const name = `lifetimes-${crypto.randomUUID()}`;
    const get = (path: string) => HttpClient.get(`${url}/do/${name}/${path}`);
    const handle = (path: string) =>
      get(path).pipe(
        Effect.flatMap((response) => response.text),
        Effect.map((text) => decodeHandle(JSON.parse(text))),
      );
    const finalizers = (key: string) =>
      get(`closed/${key}`).pipe(
        Effect.flatMap((response) => response.text),
        Effect.map((text) => CountView(JSON.parse(text)).count),
      );
    const waitFor = (key: string, count: number) =>
      finalizers(key).pipe(
        Effect.repeat({
          schedule: Schedule.spaced("100 millis"),
          until: (value) => value >= count,
          times: 20,
        }),
        Effect.timeout("5 seconds"),
      );

    const first = yield* handle("per-call");
    assert.equal(first.name, "per-call");
    assert.equal(first.closed, false);
    assert.equal(yield* waitFor("per-call", 1), 1);

    const second = yield* handle("per-call");
    assert.notEqual(second.id, first.id, "each call acquires a fresh handle");
    assert.equal(yield* waitFor("per-call", 2), 2);

    // Construction and retained handles belong to the instance, not the call.
    const construction = yield* handle("construction");
    const constructionAgain = yield* handle("construction");
    assert.equal(construction.name, "construction");
    assert.equal(construction.closed, false);
    assert.equal(constructionAgain.id, construction.id, "the construction handle is stable");

    const retained = yield* handle("retained");
    const retainedAgain = yield* handle("retained");
    assert.equal(retained.name, "retained");
    assert.equal(retained.closed, false);
    assert.equal(retainedAgain.id, retained.id, "the retained handle is stable");
    assert.notEqual(retained.id, construction.id);
  }),
);
