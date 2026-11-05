import { defineConfig } from "vite-plus";
import manifest from "./package.json" with { type: "json" };

// Workspace packages export TypeScript source, so production bundles them into
// dist; installed dependencies stay external and load from node_modules.
const workspacePackages = Object.entries(manifest.dependencies)
  .filter(([, version]) => version.startsWith("workspace:"))
  .map(([name]) => name);

export default defineConfig({
  pack: {
    entry: ["src/main.ts"],
    deps: {
      alwaysBundle: (id) =>
        workspacePackages.some((name) => id === name || id.startsWith(`${name}/`)),
    },
    fixedExtension: false,
    sourcemap: true,
  },
});
