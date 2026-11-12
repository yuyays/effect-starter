import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { UsersCard } from "@/components/users-card.js";
import { usersErrorMessage, usersQueryOptions } from "@/lib/users.js";

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(usersQueryOptions);
  },
  component: IndexRoute,
});

function IndexRoute() {
  const usersQuery = useQuery(usersQueryOptions);

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
            TanStack Query calls an Effect HttpApiClient generated from the same API contract the
            server implements.
          </p>
        </div>

        <UsersCard
          users={usersQuery.data}
          errorMessage={usersErrorMessage(usersQuery.error)}
          isFetching={usersQuery.isFetching}
          onRefetch={() => void usersQuery.refetch()}
        />
      </section>
    </main>
  );
}
