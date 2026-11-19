import { expect, it } from "@effect/vitest";
import { Effect, Exit, Ref, Scope } from "effect";
import { withInstanceScope } from "./scope.ts";

// A resource whose finalizer records that the scope released it.
const acquireUnder = (scope: Scope.Scope, closed: Ref.Ref<boolean>) =>
  Effect.acquireRelease(Effect.void, () => Ref.set(closed, true)).pipe(
    Effect.provideService(Scope.Scope, scope),
  );

it.effect("closes the retained scope when construction fails", () =>
  Effect.gen(function* () {
    const closed = yield* Ref.make(false);
    const exit = yield* withInstanceScope((scope) =>
      Effect.gen(function* () {
        yield* acquireUnder(scope, closed);
        return yield* Effect.fail("construction failed");
      }),
    ).pipe(Effect.exit);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(yield* Ref.get(closed)).toBe(true);
  }),
);

it.effect("leaves the retained scope open after successful construction", () =>
  Effect.gen(function* () {
    const closed = yield* Ref.make(false);
    const api = yield* withInstanceScope((scope) =>
      Effect.gen(function* () {
        yield* acquireUnder(scope, closed);
        return "api";
      }),
    );
    expect(api).toBe("api");
    // There is no isolate-teardown hook: only eviction ends the instance.
    expect(yield* Ref.get(closed)).toBe(false);
  }),
);
