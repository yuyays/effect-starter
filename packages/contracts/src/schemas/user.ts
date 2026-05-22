import { Schema } from "effect";

export const UserId = Schema.UUID;

export const User = Schema.Struct({
  id: UserId,
  name: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtc,
});

export type User = typeof User.Type;

export const UsersResponse = Schema.Array(User);
export type UsersResponse = typeof UsersResponse.Type;
