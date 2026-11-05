import { isBuiltin } from "node:module";
import { defineConfig } from "vite-plus";
import manifest from "./package.json" with { type: "json" };

// Production installs only the API's own `dependencies`, so those stay external and
// load from node_modules. Everything else is bundled into dist: workspace packages,
// which export TypeScript source, and any package they import.
const installed = Object.entries(manifest.dependencies)
  .filter(([, version]) => !version.startsWith("workspace:"))
  .map(([name]) => name);

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    deps: {
      alwaysBundle: (id) =>
        !isBuiltin(id) && !installed.some((name) => id === name || id.startsWith(`${name}/`)),
    },
    fixedExtension: false,
    sourcemap: true,
  },
});
