import { UsersListError } from "@effect-starter/contracts/http";
import { Schema } from "effect";
import { Api } from "./api-client.js";

/**
 * The users query as an atom. It starts when a component first reads it and shares
 * one in-flight request between every reader.
 */
export const usersAtom = Api.query("users", "list", {});

const isUsersListError = Schema.is(UsersListError);

/** Explains a failed query: the API reported an error, or it could not be reached. */
export const usersErrorMessage = (error: unknown) =>
  isUsersListError(error)
    ? "The API could not load users. Check its database connection."
    : "Could not load users. The API is unreachable or returned an unexpected response.";
