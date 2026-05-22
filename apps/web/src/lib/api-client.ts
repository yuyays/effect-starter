import { BrowserHttpClient } from "@effect/platform-browser";
import { HttpApiClient } from "@effect/platform";
import { StarterApi } from "@effect-starter/contracts/http";
import { Effect } from "effect";

const baseUrl = import.meta.env.VITE_API_URL ?? "";

export const apiClient = Effect.runSync(
  HttpApiClient.make(StarterApi, { baseUrl }).pipe(
    Effect.provide(BrowserHttpClient.layerXMLHttpRequest),
  ),
);
