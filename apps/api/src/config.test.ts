import { describe, expect, it } from "@effect/vitest";
import { Config, ConfigProvider, Effect, FileSystem, Layer, PlatformError, Result } from "effect";
import { AppConfigLive } from "./config.ts";

const configLayer = (fileSystem: FileSystem.FileSystem, env: Record<string, string> = {}) =>
  AppConfigLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(FileSystem.FileSystem, fileSystem),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env })),
      ),
    ),
  );

const dotenv = (contents: string) =>
  FileSystem.makeNoop({ readFileString: () => Effect.succeed(contents) });

describe("application configuration", () => {
  it.effect("uses environment overrides and loads remaining values from .env", () =>
    Effect.gen(function* () {
      const config = yield* Config.all({
        port: Config.Port("PORT"),
        databaseUrl: Config.String("DATABASE_URL"),
      }).pipe(
        Effect.provide(
          configLayer(dotenv("PORT=4100\nDATABASE_URL=postgres://localhost/example"), {
            PORT: "4200",
          }),
        ),
      );
      expect(config).toEqual({ port: 4200, databaseUrl: "postgres://localhost/example" });
    }),
  );

  it.effect("allows a missing .env while still requiring configuration values", () =>
    Effect.gen(function* () {
      const port = yield* Config.Port("PORT").pipe(
        Effect.provide(configLayer(FileSystem.makeNoop({}), { PORT: "4300" })),
      );
      expect(port).toBe(4300);

      const missing = yield* Config.Redacted("DATABASE_URL").pipe(
        Effect.provide(configLayer(FileSystem.makeNoop({}))),
        Effect.result,
      );
      expect(Result.isFailure(missing)).toBe(true);
    }),
  );

  it.effect("rejects invalid values instead of using the file or a default", () =>
    Effect.gen(function* () {
      for (const layer of [
        configLayer(dotenv("PORT=4100"), { PORT: "invalid" }),
        configLayer(dotenv("PORT=invalid")),
      ]) {
        const result = yield* Config.Port("PORT").pipe(
          Config.withDefault(3000),
          Effect.provide(layer),
          Effect.result,
        );
        expect(Result.isFailure(result)).toBe(true);
      }
    }),
  );

  it.effect("reports unreadable .env files even when environment values exist", () =>
    Effect.gen(function* () {
      const denied = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "readFileString",
        pathOrDescriptor: ".env",
      });
      const result = yield* Config.Port("PORT").pipe(
        Effect.provide(
          configLayer(FileSystem.makeNoop({ readFileString: () => Effect.fail(denied) }), {
            PORT: "4400",
          }),
        ),
        Effect.result,
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) expect(result.failure).toBe(denied);
    }),
  );
});
