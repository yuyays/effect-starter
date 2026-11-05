import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

// Local agent tooling is not project source.
const agentDirectories = [
  ".agent/**",
  ".agents/**",
  ".claude/**",
  ".codex/**",
  ".cursor/**",
  ".gemini/**",
  ".opencode/**",
];

const testFiles = ["**/*.test.*", "**/*.spec.*"];

export default defineConfig({
  lint: {
    options: {
      typeAware: true,
      reportUnusedDisableDirectives: "error",
    },
    categories: {
      correctness: "error",
      suspicious: "error",
      perf: "warn",
    },
    // `effecttsgo` requires the Oxlint integration patched by `effect-tsgo patch --oxlint`.
    plugins: ["react", "typescript", "import", "vitest", "effecttsgo"],
    jsPlugins: [
      "./tools/oxlint/index.js",
      "./tools/oxlint/anti-slop/index.ts",
      "./tools/oxlint/anti-slop/effect/index.ts",
    ],
    rules: {
      ...effectRecommended.rules,
      "effecttsgo/catch-all-tag-dispatch-to-catch-tag": "error",
      "effecttsgo/catch-if-tag-to-catch-tag": "error",
      "effecttsgo/schema-struct-with-tag": "error",
      // Service methods stay functions so each call gets its own Effect.fn span.
      "effecttsgo/lazy-effect": "off",
      // Branding every Schema class adds ceremony without a starter use case.
      "effecttsgo/schema-class-missing-brand": "off",
      "react/exhaustive-deps": "warn",
      "react/rules-of-hooks": "error",
      "react/react-in-jsx-scope": "off",
      "react/purity": "error",
      "react/refs": "error",
      "react/set-state-in-effect": "error",
      "react/static-components": "error",
      "react/no-unstable-nested-components": "error",
      "typescript/consistent-type-imports": "error",
      "typescript/no-base-to-string": "warn",
      "typescript/no-floating-promises": "warn",
      "typescript/no-misused-spread": "warn",
      "typescript/no-unsafe-type-assertion": "error",
      "oxc/no-accumulating-spread": "error",
      "import/no-unassigned-import": "off",
      "vitest/no-conditional-expect": "off",
      "vitest/no-standalone-expect": [
        "error",
        { additionalTestBlockFunctions: ["it.effect", "it.live"] },
      ],
      "vitest/require-to-throw-message": "off",
      "no-await-in-loop": "off",
      "require-yield": "off",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop-effect/no-manual-effect-error-tag": "error",
      "anti-slop-effect/no-manual-tagged-construction": "error",
      "starter/schema-compile-scope": "error",
      "starter/suppression-reason": "error",
    },
    overrides: [
      {
        files: ["apps/api/src/**/*.ts"],
        rules: { "starter/runtime-boundary": "error" },
      },
      {
        files: ["apps/api/src/main.ts", "apps/api/src/http.ts", ...testFiles],
        rules: { "starter/runtime-boundary": "off" },
      },
      {
        // API tests run Effects through @effect/vitest, which provides TestClock.
        files: ["apps/api/src/**"],
        rules: { "starter/test-runtime": "error" },
      },
      {
        // Tooling tests under tools/ and the generator measure real processes.
        files: ["apps/**", "packages/contracts/**"],
        rules: { "starter/no-wall-clock-in-tests": "error" },
      },
      {
        // Domain workflows and contracts parse input at their boundary instead of passing it on.
        files: ["apps/api/src/services/**/*.ts", "packages/contracts/src/**/*.ts"],
        rules: {
          "anti-slop/no-unknown-parameters": "error",
          "anti-slop/no-unknown-returns": "error",
          "anti-slop/no-unsafe-dictionary-type": "error",
        },
      },
      {
        files: ["apps/web/src/**"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  regex: "^@effect-starter/api(?:/|$)|^(?:@/)?(?:\\.\\./)+(?:apps/)?api/src(?:/|$)",
                  message: "Call the API through @effect-starter/contracts and its HttpApi client.",
                },
              ],
            },
          ],
        },
      },
      {
        // The browser client module is the frontend's Effect entry point.
        files: ["apps/web/src/lib/api-client.ts"],
        rules: { "effecttsgo/strict-effect-provide": "off" },
      },
      {
        files: testFiles,
        rules: {
          // Tests assert encoded wire values, which carry literal tags.
          "anti-slop-effect/no-manual-tagged-construction": "off",
          // Test cases provide their own layers and run once.
          "effecttsgo/effect-fn-opportunity": "off",
          "effecttsgo/strict-effect-provide": "off",
          "starter/schema-compile-scope": "off",
        },
      },
    ],
    ignorePatterns: [
      ...agentDirectories,
      "**/dist/**",
      "**/node_modules/**",
      "apps/web/src/routeTree.gen.ts",
      "tools/oxlint/anti-slop/**",
      "packages/create-effect-starter/template/**",
      "packages/create-effect-starter/frontends/**",
    ],
  },
  fmt: {
    ignorePatterns: [
      ...agentDirectories,
      "apps/web/src/routeTree.gen.ts",
      "tools/oxlint/anti-slop/**",
      "packages/create-effect-starter/template/**",
      "packages/create-effect-starter/frontends/**/pnpm-lock.yaml",
    ],
  },
});
