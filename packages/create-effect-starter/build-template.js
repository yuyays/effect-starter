import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { format } from "vite-plus/fmt";
import { frameworks, hasFrontend, isReact } from "./frameworks.js";
import { templateLockfile } from "./template-lockfile.js";

const root = new URL("../../", import.meta.url);
const template = new URL("./template/", import.meta.url);
const entries = [
  "apps/api",
  "packages/contracts",
  ".github/workflows/ci.yml",
  ".gitignore",
  "AGENTS.md",
  "LICENSE",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "vite.config.ts",
  "tools",
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

// Fail the build when source text changes shape instead of silently skipping an edit.
function replaceRequired(text, search, replacement) {
  if (!text.includes(search)) throw new Error(`Template source no longer contains: ${search}`);
  return text.replace(search, replacement);
}

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
  const frontend = hasFrontend(framework);
  const web = new URL("apps/web/", destination);
  if (frontend && framework !== "vue") {
    await cp(new URL("apps/web/", root), web, copyOptions);
  }
  if (frontend && framework !== "react") {
    await cp(new URL(`./frontends/${framework}/`, import.meta.url), web, copyOptions);
  }
  if (frontend) {
    const webManifestPath = new URL("package.json", web);
    const webManifest = JSON.parse(await readFile(webManifestPath, "utf8"));
    webManifest.name = "@effect-starter/web";
    await writeFile(webManifestPath, `${JSON.stringify(webManifest, null, 2)}\n`);
  }
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
    config = replaceRequired(
      config,
      '["react", "jsx-a11y", "typescript", "import", "vitest", "effecttsgo"]',
      '["vue", "typescript", "import", "vitest", "effecttsgo"]',
    ).replace(/^      "react\/.*\n/gm, "");
  }
  if (!frontend) {
    // `apps/web/**` overrides stay: they are inert until someone adds a frontend.
    config = replaceRequired(
      config,
      '["react", "jsx-a11y", "typescript", "import", "vitest", "effecttsgo"]',
      '["typescript", "import", "vitest", "effecttsgo"]',
    ).replace(/^      "react\/.*\n/gm, "");
  }
  // Removing source-only ignore paths can change how arrays should wrap.
  const formatted = await format("vite.config.ts", config);
  if (formatted.errors.length) {
    throw new Error(`Cannot format ${framework} config: ${JSON.stringify(formatted.errors)}`);
  }
  await writeFile(configPath, formatted.code);
  let readme = await readFile(new URL("./PROJECT_README.md", import.meta.url), "utf8");
  if (frontend) {
    const stack =
      framework === "react"
        ? "React, TanStack Router/Query"
        : framework === "vue"
          ? "Vue, Vue Router, TanStack Query"
          : "TanStack Start (React), TanStack Query";
    readme = readme.replace("React, TanStack Router/Query", stack);
  } else {
    readme = replaceRequired(
      readme,
      "Full-stack TypeScript app with React, TanStack Router/Query, Effect v4, Drizzle,\nPostgreSQL, and Vite+,",
      "TypeScript API with Effect v4, Drizzle, PostgreSQL, and Vite+,",
    );
    readme = replaceRequired(
      readme,
      "`{{RUN}} dev:web` or `{{RUN}} dev:api` starts one server. The web app proxies\n`/api` and `/docs` to the API; ports are set in `apps/web/vite.config.ts` and\n`apps/api/.env`.",
      "`{{RUN}} dev` watches the API and restarts it when it or the contracts change. The\nport is set in `apps/api/.env`, and API docs are served at `/docs`. Clients call the\nAPI through the HttpApi contract in `packages/contracts`.",
    );
  }
  if (framework === "vue") {
    readme +=
      "\nVue single-file components use `vue-tsc` and a frontend-local TypeScript 5.9.\nThe API and shared contracts keep the root native TypeScript compiler and Effect diagnostics.\n";
  }
  if (framework === "tanstack-start") {
    readme +=
      "\n## Server rendering\n\nTanStack Start renders the page on the server; the example users query runs in the browser.\nEach request gets its own router and query client. For server-side API calls, use\n`API_URL` in `apps/web/.env` (default `http://localhost:3000`). `VITE_API_URL`\nis public and only configures browser requests.\n\nProduction hosting needs a TanStack Start server adapter as well as the Effect API.\nSee https://tanstack.com/start/latest/docs/framework/react/guide/hosting.\nConfigure your production reverse proxy for `/api` and `/docs`, or set `VITE_API_URL`.\n";
  }
  const browserTests = isReact(framework);
  if (!browserTests) {
    const agentsPath = new URL("AGENTS.md", destination);
    await writeFile(
      agentsPath,
      replaceRequired(
        await readFile(agentsPath, "utf8"),
        "React frontends' `*.browser.test.tsx` component tests run in Chromium; run `pnpm test:browser` too.\n",
        "",
      ),
    );
    readme = replaceRequired(
      readme,
      "\nComponent tests that need a real browser (`*.browser.test.tsx`) run in Chromium:\n`{{RUN}} browser:install` once per machine, then `{{RUN}} test:browser`.\n",
      "",
    );
    const workflowPath = new URL(".github/workflows/ci.yml", destination);
    let workflow = await readFile(workflowPath, "utf8");
    workflow = replaceRequired(workflow, "      - run: pnpm browser:install --with-deps\n", "");
    workflow = replaceRequired(workflow, "      - run: pnpm test:browser\n", "");
    await writeFile(workflowPath, workflow);
  }
  await writeFile(new URL("README.md", destination), readme);
  const manifestPath = new URL("package.json", destination);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.workspaces = ["apps/*", "packages/*"];
  delete manifest.scripts["create:app"];
  delete manifest.scripts["test:generated"];
  if (!frontend) delete manifest.scripts["dev:web"];
  if (!browserTests) {
    delete manifest.scripts["test:browser"];
    delete manifest.scripts["browser:install"];
  }
  manifest.scripts.test = manifest.scripts.test.split(
    " && node packages/create-effect-starter/",
  )[0];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // Generated projects get their own Dependabot config, not this repository's.
  await copyFile(
    new URL("./project-dependabot.yml", import.meta.url),
    new URL(".github/dependabot.yml", destination),
  );
  await writeFile(new URL("pnpm-lock.yaml", destination), templateLockfile(lockfile, framework));
}
