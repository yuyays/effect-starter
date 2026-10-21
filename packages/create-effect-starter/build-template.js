import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { frameworks } from "./frameworks.js";

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
    await cp(new URL(`./frontends/${framework}/`, import.meta.url), web, {
      ...copyOptions,
      filter: (source) => copyOptions.filter(source) && !source.endsWith("pnpm-lock.yaml"),
    });
  }
  if (framework === "tanstack-start") {
    for (const entry of ["index.html", "src/main.tsx", "src/lib/query-client.ts"]) {
      await rm(new URL(entry, web));
    }
  }
  if (framework === "vue") {
    const workspacePath = new URL("pnpm-workspace.yaml", destination);
    const workspace = await readFile(workspacePath, "utf8");
    await writeFile(
      workspacePath,
      workspace.replace("allowBuilds:\n", 'allowBuilds:\n  "vue-demi": true\n'),
    );
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
  await writeFile(configPath, config);
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
  delete manifest.scripts["create:app"];
  delete manifest.scripts["test:generated"];
  manifest.scripts.test = 'vp run --filter "@effect-starter/*" test';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const lockfilePath =
    framework === "react"
      ? new URL("pnpm-lock.yaml", root)
      : new URL(`./frontends/${framework}/pnpm-lock.yaml`, import.meta.url);
  // Variant lockfiles are maintained with the generated workspace, not the source overlay.
  try {
    const lockfile = await readFile(lockfilePath, "utf8");
    await writeFile(
      new URL("pnpm-lock.yaml", destination),
      lockfile.replace(/\n  packages\/create-effect-starter:[\s\S]*?(?=\n  \S|\npackages:)/, "\n"),
    );
  } catch (error) {
    if (error.code !== "ENOENT" || framework === "react") throw error;
    // Only used when bootstrapping a new template's checked-in lockfile.
    if (process.env.UPDATE_TEMPLATE_LOCKFILES !== "1") throw error;
  }
}
