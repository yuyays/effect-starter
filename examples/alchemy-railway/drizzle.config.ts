import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "../../apps/api/src/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
});
