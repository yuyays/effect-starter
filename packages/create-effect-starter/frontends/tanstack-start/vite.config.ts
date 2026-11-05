import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";
import { configDefaults } from "vite-plus/test/config";

// Vitest's default test pattern, limited to `.browser` tests.
const browserTests = "**/*.browser.{test,spec}.?(c|m)[jt]s?(x)";

export default defineConfig(({ mode }) => {
  // Vite keeps unprefixed .env values private; make the API origin available to SSR.
  process.env.API_URL ??= loadEnv(mode, process.cwd(), "API_").API_URL;
  return {
    plugins: [tanstackStart(), react({ compiler: true }), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": "http://localhost:3000",
        "/docs": "http://localhost:3000",
      },
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      // Component tests that need a real browser run in Chromium: `test:browser`.
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            environment: "happy-dom",
            exclude: [...configDefaults.exclude, browserTests],
          },
        },
        {
          extends: true,
          // Pre-bundle test-only dependencies so Vite does not reload mid-run.
          optimizeDeps: { include: ["@testing-library/react", "@testing-library/user-event"] },
          test: {
            name: "browser",
            include: [browserTests],
            browser: {
              enabled: true,
              headless: true,
              provider: playwright(),
              instances: [{ browser: "chromium" }],
            },
          },
        },
      ],
    },
  };
});
