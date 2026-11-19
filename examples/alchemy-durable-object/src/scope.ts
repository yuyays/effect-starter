import * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Exit, Schema, Scope } from "effect";

class HandleClosed extends Schema.TaggedError<HandleClosed>()("HandleClosed", {
  handle: Schema.String,
}) {}

class Handle {
  closed = false;
  readonly id = crypto.randomUUID();
  constructor(readonly name: string) {}
  use(): Effect.Effect<{ id: string; name: string; closed: boolean }, HandleClosed> {
    return this.closed
      ? Effect.fail(new HandleClosed({ handle: this.name }))
      : Effect.succeed({ id: this.id, name: this.name, closed: false });
  }
}

/**
 * Retains a scope for the Durable Object instance. Alchemy's constructor scope is not tied to
 * any call and has no teardown hook, so a resource needed by later requests is registered here
 * instead. The scope is closed only when construction fails, which releases partial state.
 */
export const withInstanceScope = <A, E, R>(
  use: (scope: Scope.Scope) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(Scope.make(), use, (scope, exit) =>
    Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void,
  );

export default class ScopeDO extends Cloudflare.DurableObject<ScopeDO>()(
  "ScopeDO",
  Effect.gen(function* () {
    const state = yield* Cloudflare.DurableObjectState;
    // @effect-diagnostics-next-line returnEffectInGen:off -- Alchemy's Durable Object API is returned from the construction Effect
    return Effect.gen(function* () {
      const recordFinalizer = (name: string) =>
        Effect.gen(function* () {
          const count = (yield* state.storage.get<number>(`closed:${name}`)) ?? 0;
          yield* state.storage.put(`closed:${name}`, count + 1);
        });
      const acquire = (name: string) =>
        Effect.acquireRelease(Effect.succeed(new Handle(name)), (handle) =>
          Effect.gen(function* () {
            handle.closed = true;
            yield* recordFinalizer(name);
          }).pipe(Effect.orDie),
        );

      // Acquired in the construction phase without the retained scope. It survives later
      // requests, but nothing closes it when the instance is evicted.
      const construction = yield* acquire("construction");

      return yield* withInstanceScope((scope) =>
        Effect.gen(function* () {
          // Registered on the retained scope: closed only if construction fails.
          const retained = yield* acquire("retained").pipe(
            Effect.provideService(Scope.Scope, scope),
          );
          return {
            // Acquired and released by this call's scope, after the response is returned.
            perCall: () =>
              Effect.gen(function* () {
                const call = yield* acquire("per-call");
                return yield* call.use();
              }),
            construction: () => construction.use(),
            retained: () => retained.use(),
            closedCount: (name: string) =>
              state.storage.get<number>(`closed:${name}`).pipe(Effect.map((count) => count ?? 0)),
          };
        }),
      );
    });
  }),
) {}
