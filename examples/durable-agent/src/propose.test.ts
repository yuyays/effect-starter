import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { DemoModelLive, ModelClient } from "./propose.ts";

it.effect("the demo model looks up policy once and then proposes", () =>
  Effect.gen(function* () {
    const model = yield* ModelClient;
    expect(yield* model.respond("Invoice for office supplies", [])).toEqual({
      kind: "lookup_policy",
    });
    const turn = yield* model.respond("Invoice for office supplies", [
      { turn: { kind: "lookup_policy" }, policy: "Review policy" },
    ]);
    if (turn.kind !== "proposal") throw new Error("Expected the demo model to propose");
    expect(turn.proposal).toMatchObject({ category: "invoice" });
    expect(turn.proposal.title.length).toBeGreaterThan(0);
    expect(turn.proposal.summary.length).toBeGreaterThan(0);
  }).pipe(Effect.provide(DemoModelLive)),
);
