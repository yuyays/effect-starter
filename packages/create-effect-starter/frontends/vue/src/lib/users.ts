import { queryOptions } from "@tanstack/vue-query";
import { UsersListError } from "@effect-starter/contracts/http";
import type { UsersResponse } from "@effect-starter/contracts/schemas/user";
import { Effect, Schema } from "effect";
import { apiClient } from "./api-client.js";

/** Every typed failure of the users endpoint, as declared by the shared contract. */
export type UsersError = Effect.Error<ReturnType<typeof apiClient.users.list>>;

// `runPromise` rejects with the failure itself, so the query error keeps the contract's type.
export const usersQueryOptions = queryOptions<UsersResponse, UsersError>({
  queryKey: ["users"],
  // Forwarding Query's signal interrupts the Effect, which aborts the HTTP request.
  queryFn: ({ signal }) => Effect.runPromise(apiClient.users.list({}), { signal }),
});

const isUsersListError = Schema.is(UsersListError);

/** Explains a failed users query: the API reported an error, or it could not be reached. */
export const usersErrorMessage = (error: UsersError | null) =>
  error === null
    ? undefined
    : isUsersListError(error)
      ? "The API could not load users. Check its database connection."
      : "Could not load users. Is the API running?";
