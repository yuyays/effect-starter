import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";

export interface UsersCardProps {
  readonly users: ReadonlyArray<{ readonly id: string; readonly name: string }> | undefined;
  /** Why the last fetch failed; shown instead of any stale users. */
  readonly errorMessage: string | undefined;
  readonly isFetching: boolean;
  readonly onRefetch: () => void;
}

export function UsersCard({ users, errorMessage, isFetching, onRefetch }: UsersCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Read-only example backed by Drizzle and PostgreSQL.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={onRefetch} disabled={isFetching}>
          {isFetching ? "Loading..." : "Refetch"}
        </Button>

        {errorMessage !== undefined ? (
          <p className="text-sm text-red-700">{errorMessage}</p>
        ) : users === undefined ? (
          <p className="text-sm text-stone-600">Loading users...</p>
        ) : users.length ? (
          <ul className="space-y-2">
            {users.map((user) => (
              <li key={user.id} className="rounded-md border border-stone-200 bg-white p-3">
                {user.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-stone-300 bg-white/70 p-4 text-sm text-stone-600">
            No users yet. The starter intentionally ships without seed data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
