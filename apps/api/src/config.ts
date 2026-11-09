import { ConfigProvider, Effect } from "effect";

// Keep environment overrides; only a missing .env is safe to ignore.
export const AppConfigLive = ConfigProvider.layerAdd(
  ConfigProvider.fromDotEnv().pipe(
    Effect.catchReason("PlatformError", "NotFound", () =>
      Effect.succeed(ConfigProvider.fromUnknown({})),
    ),
  ),
);
