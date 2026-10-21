import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { format } from "vite-plus/fmt";
import { frameworks } from "./frameworks.js";
import { templateLockfile } from "./template-lockfile.js";

const root = new URL("../../", import.meta.url);
const template = new URL("./template/", import.meta.url);
const entries = [
  "apps/api",
  "packages/contracts",
  ".github/workflows/ci.yml",
  ".gitignore",
  "LICENSE",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "vite.config.ts",
];
const excluded = new Set([
  "node_modules",
  "dist",
  "coverage",
  ".git",
  ".DS_Store",
  ".tanstack",
  ".output",
]);
const copyOptions = {
  recursive: true,
  filter: (source) => {
    const name = source.split(/[\\/]/).at(-1);
    return !excluded.has(name) && (!name.startsWith(".env") || name === ".env.example");
  },
};

await rm(template, { recursive: true, force: true });
const lockfile = await readFile(new URL("pnpm-lock.yaml", root), "utf8");
for (const framework of Object.keys(frameworks)) {
  const destination = new URL(`${framework}/`, template);
  await mkdir(destination, { recursive: true });
  for (const entry of entries) {
    // npm omits .gitignore files from tarballs; restore its name during generation.
    const target = entry === ".gitignore" ? "gitignore.template" : entry;
    await cp(new URL(entry, root), new URL(target, destination), copyOptions);
  }
  const web = new URL("apps/web/", destination);
  if (framework !== "vue") {
    await cp(new URL("apps/web/", root), web, copyOptions);
  }
  if (framework !== "react") {
    await cp(new URL(`./frontends/${framework}/`, import.meta.url), web, copyOptions);
  }
  const webManifestPath = new URL("package.json", web);
  const webManifest = JSON.parse(await readFile(webManifestPath, "utf8"));
  webManifest.name = "@effect-starter/web";
  await writeFile(webManifestPath, `${JSON.stringify(webManifest, null, 2)}\n`);
  const workspacePath = new URL("pnpm-workspace.yaml", destination);
  const workspace = await readFile(workspacePath, "utf8");
  await writeFile(
    workspacePath,
    workspace.replace('  - "packages/create-effect-starter/frontends/*"\n', ""),
  );
  if (framework === "tanstack-start") {
    for (const entry of ["index.html", "src/main.tsx", "src/lib/query-client.ts"]) {
      await rm(new URL(entry, web));
    }
  }
  const configPath = new URL("vite.config.ts", destination);
  let config = await readFile(configPath, "utf8");
  // Template source files are not part of generated projects.
  config = config.replace(/^\s*"packages\/create-effect-starter\/[^"\n]+",\n/gm, "");
  if (framework === "vue") {
    config = config
      .replace(
        '["react", "typescript", "import", "vitest"]',
        '["vue", "typescript", "import", "vitest"]',
      )
      .replace(/^      "react\/.*\n/gm, "");
  }
  // Removing source-only ignore paths can change how arrays should wrap.
  const formatted = await format("vite.config.ts", config);
  if (formatted.errors.length) {
    throw new Error(`Cannot format ${framework} config: ${JSON.stringify(formatted.errors)}`);
  }
  await writeFile(configPath, formatted.code);
  let readme = await readFile(new URL("./PROJECT_README.md", import.meta.url), "utf8");
  const stack =
    framework === "react"
      ? "React, TanStack Router/Query"
      : framework === "vue"
        ? "Vue, Vue Router, TanStack Query"
        : "TanStack Start (React), TanStack Query";
  readme = readme.replace("React, TanStack Router/Query", stack);
  if (framework === "vue") {
    readme +=
      "\nVue single-file components use `vue-tsc` and a frontend-local TypeScript 5.9.\nThe API and shared contracts keep the root native TypeScript compiler and Effect diagnostics.\n";
  }
  if (framework === "tanstack-start") {
    readme +=
      "\n## Server rendering\n\nTanStack Start renders the page on the server; the example users query runs in the browser.\nEach request gets its own router and query client. For server-side API calls, use\n`API_URL` in `apps/web/.env` (default `http://localhost:3000`). `VITE_API_URL`\nis public and only configures browser requests.\n\nProduction hosting needs a TanStack Start server adapter as well as the Effect API.\nSee https://tanstack.com/start/latest/docs/framework/react/guide/hosting.\nConfigure your production reverse proxy for `/api` and `/docs`, or set `VITE_API_URL`.\n";
  }
  await writeFile(new URL("README.md", destination), readme);
  const manifestPath = new URL("package.json", destination);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.workspaces = ["apps/*", "packages/*"];
  delete manifest.scripts["create:app"];
  delete manifest.scripts["test:generated"];
  manifest.scripts.test = 'vp run --filter "@effect-starter/*" test';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(new URL("pnpm-lock.yaml", destination), templateLockfile(lockfile, framework));
}
