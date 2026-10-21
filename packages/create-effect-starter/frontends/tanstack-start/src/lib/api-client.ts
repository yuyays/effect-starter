import { FetchHttpClient } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { StarterApi } from "@effect-starter/contracts/http";
import { Effect } from "effect";

const baseUrl = import.meta.env.SSR
  ? (process.env.API_URL ?? "http://localhost:3000")
  : (import.meta.env.VITE_API_URL ?? "");

export const apiClient = Effect.runSync(
  HttpApiClient.make(StarterApi, { baseUrl }).pipe(Effect.provide(FetchHttpClient.layer)),
);
