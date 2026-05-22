import { PgClient } from "@effect/sql-pg"
import * as PgDrizzle from "@effect/sql-drizzle/Pg"
import { Config, Layer } from "effect"

const PgLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL"),
})

const DrizzleLive = PgDrizzle.layer.pipe(Layer.provide(PgLive))

export { DrizzleLive }
