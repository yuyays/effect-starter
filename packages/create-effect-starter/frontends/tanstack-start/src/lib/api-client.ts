import { FetchHttpClient } from "effect/http";
import { AtomHttpApi } from "effect/reactivity";
import { StarterApi } from "@effect-starter/contracts/http";

// SSR resolves the API directly; the browser uses the same-origin proxy in dev.
const baseUrl = import.meta.env.SSR
  ? (process.env.API_URL ?? "http://localhost:3000")
  : (import.meta.env.VITE_API_URL ?? "");

/**
 * The generated client as an atom runtime. `query` and `runtime.atom` read through
 * this service, so a test can provide its own layer instead of stubbing `fetch`.
 */
export class Api extends AtomHttpApi.Service<Api>()("web/Api", {
  api: StarterApi,
  httpClient: FetchHttpClient.layer,
  ...(baseUrl === "" ? {} : { baseUrl }),
}) {}
