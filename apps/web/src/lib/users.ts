import { queryOptions } from "@tanstack/react-query";
import { Effect } from "effect";
import { apiClient } from "./api-client.js";

export const usersQueryOptions = queryOptions({
  queryKey: ["users"],
  // Forwarding Query's signal interrupts the Effect, which aborts the HTTP request.
  queryFn: ({ signal }) => Effect.runPromise(apiClient.users.list({}), { signal }),
});
