import { createFileRoute } from "@tanstack/react-router";
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { UsersCard } from "@/components/users-card.js";
import { usersAtom, usersErrorMessage } from "@/lib/users.js";

export const Route = createFileRoute("/")({ component: IndexRoute });

function IndexRoute() {
  const result = useAtomValue(usersAtom);
  const refresh = useAtomRefresh(usersAtom);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#ecfeff,_transparent_34rem),linear-gradient(135deg,_#fafaf9,_#f5f5f4)] px-6 py-10 text-stone-950">
      <section className="mx-auto flex max-w-4xl flex-col gap-8">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-700">
            Effect starter
          </p>
          <h1 className="max-w-2xl text-5xl font-semibold tracking-tight">
            React client, Effect Platform API, shared contracts.
          </h1>
          <p className="max-w-2xl text-lg text-stone-600">
            An Effect atom calls the HttpApiClient generated from the same API contract the server
            implements.
          </p>
        </div>

        <UsersCard
          users={AsyncResult.isSuccess(result) ? result.value : undefined}
          errorMessage={AsyncResult.matchWithError(result, {
            onInitial: () => undefined,
            onSuccess: () => undefined,
            onError: (error) => usersErrorMessage(error),
            // A defect never reaches the API contract, so treat it as unreachable.
            onDefect: () => usersErrorMessage(undefined),
          })}
          isFetching={AsyncResult.isInitial(result) || AsyncResult.isWaiting(result)}
          onRefetch={refresh}
        />
      </section>
    </main>
  );
}
