import { defineConfig } from "drizzle-kit";

// Railway supplies its private database URL to the pre-deploy container.
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for migrations");

export default defineConfig({
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
