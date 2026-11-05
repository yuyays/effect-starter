import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { versions } from "vite-plus/versions";
import { format } from "vite-plus/fmt";
import { parse } from "yaml";
import { createProject } from "./create-project.js";

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), "effect-create-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

void test("CLI generates a renamed project without generator artifacts", async (t) => {
  const directory = await temporary(t);
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./cli.js", import.meta.url)), "nested/my-app"],
    {
      cwd: directory,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created my-app/);
  const project = join(directory, "nested/my-app");
  const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  assert.equal(manifest.name, "my-app");
  const sourceManifest = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  );
  assert.equal(manifest.packageManager, sourceManifest.packageManager);
  assert.ok(!("create:app" in manifest.scripts));
  // Workspace packages export TypeScript source, so no script builds contracts first.
  for (const script of Object.values(manifest.scripts)) assert.doesNotMatch(script, /#build/);
  const contracts = JSON.parse(
    await readFile(join(project, "packages/contracts/package.json"), "utf8"),
  );
  assert.equal(contracts.exports["./http"], "./src/http/index.ts");
  assert.match(manifest.scripts["dev:api"], /--filter @my-app\/api/);
  assert.equal(manifest.scripts["start:api"], "vp run @my-app/api#start");
  // Repeat typechecks replay unchanged packages; Vite+ tracks the files each check reads.
  assert.match(
    manifest.scripts.typecheck,
    /vp run --cache --concurrency-limit 4 --filter "@my-app\/\*" typecheck/,
  );
  for (const [location, name] of [
    ["apps/api", "api"],
    ["apps/web", "web"],
    ["packages/contracts", "contracts"],
  ]) {
    const pkg = JSON.parse(await readFile(join(project, location, "package.json"), "utf8"));
    assert.equal(pkg.name, `@my-app/${name}`);
    // The API bundles contracts, so production installs only its other dependencies.
    if (name === "api") assert.equal(pkg.devDependencies["@my-app/contracts"], "workspace:*");
    if (name === "web") assert.equal(pkg.dependencies["@my-app/contracts"], "workspace:*");
  }
  assert.deepEqual(await readdir(join(project, "packages")), ["contracts"]);
  // Shared versions live once in the workspace catalog; no package pins its own copy.
  const workspace = parse(await readFile(join(project, "pnpm-workspace.yaml"), "utf8"));
  const { catalog } = workspace;
  assert.match(catalog.effect, /^\^?4\./);
  // Vite+ and its Vite-compatible core must move together when either is bumped.
  assert.equal(catalog.vite, `npm:@voidzero-dev/vite-plus-core@${catalog["vite-plus"]}`);
  assert.equal(workspace.overrides["vite@*"], "catalog:");
  assert.equal(workspace.peerDependencyRules.allowedVersions.vite, catalog["vite-plus"]);
  for (const location of [".", "apps/api", "apps/web", "packages/contracts"]) {
    const pkg = JSON.parse(await readFile(join(project, location, "package.json"), "utf8"));
    for (const field of ["dependencies", "devDependencies"]) {
      for (const [name, version] of Object.entries(pkg[field] ?? {})) {
        if (Object.hasOwn(catalog, name)) assert.equal(version, "catalog:", `${location} ${name}`);
      }
    }
  }
  assert.deepEqual(await readdir(join(project, ".github/workflows")), ["ci.yml"]);
  // Generated projects keep their CI actions current; npm updates stay the owner's call.
  const dependabot = parse(await readFile(join(project, ".github/dependabot.yml"), "utf8"));
  assert.deepEqual(
    dependabot.updates.map((update) => update["package-ecosystem"]),
    ["github-actions"],
  );
  // Generated pnpm CI is the repository workflow, so Dependabot updates reach new projects.
  assert.equal(
    await readFile(join(project, ".github/workflows/ci.yml"), "utf8"),
    await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  assert.match(await readFile(join(project, ".gitignore"), "utf8"), /^\.env$/m);
  assert.equal(
    await readFile(join(project, "LICENSE"), "utf8"),
    await readFile(new URL("../../LICENSE", import.meta.url), "utf8"),
  );
  assert.equal(manifest.license, "MIT");
  const lockfile = await readFile(join(project, "pnpm-lock.yaml"), "utf8");
  assert.ok(lockfile.includes("@my-app/contracts"));
  assert.ok(!lockfile.includes("effect-starter"));
  const paths = await readdir(project, { recursive: true });
  assert.ok(
    !paths.some((path) => /(^|[/\\])(node_modules|dist|\.git|template)([/\\]|$)/.test(path)),
  );
  for (const path of paths) {
    if (/\.(ts|tsx|json|html|md)$/.test(path)) {
      assert.ok(!(await readFile(join(project, path), "utf8")).includes("effect-starter"), path);
    }
  }
  for (const app of ["api", "web"]) {
    assert.equal(
      await readFile(join(project, "apps", app, ".env"), "utf8"),
      await readFile(join(project, "apps", app, ".env.example"), "utf8"),
    );
  }
  assert.match(
    await readFile(join(project, "apps/web/index.html"), "utf8"),
    /<title>my-app<\/title>/,
  );
  const api = JSON.parse(await readFile(join(project, "apps/api/package.json"), "utf8"));
  // Production bundles the API and its workspace packages into one JavaScript file.
  assert.equal(api.scripts.build, "effect-tsgo tsc --noEmit && vp pack");
  assert.ok(!("tsup" in api.devDependencies));
  assert.ok(!("tsx" in api.devDependencies));
});

void test("rejects nonempty destinations without changing their contents", async (t) => {
  const directory = await temporary(t);
  const destination = join(directory, "my-app");
  await mkdir(destination);
  await writeFile(join(destination, "keep.txt"), "keep me");
  await assert.rejects(createProject("my-app", directory), /not an empty directory/);
  assert.deepEqual(await readdir(destination), ["keep.txt"]);
  assert.equal(await readFile(join(destination, "keep.txt"), "utf8"), "keep me");
});

void test("supports an existing empty directory and rejects symlinks", async (t) => {
  const directory = await temporary(t);
  await mkdir(join(directory, "empty-app"));
  await createProject("empty-app", directory);
  await mkdir(join(directory, "target"));
  await symlink(join(directory, "target"), join(directory, "linked-app"), "dir");
  await assert.rejects(createProject("linked-app", directory), /not an empty directory/);
  assert.deepEqual(await readdir(join(directory, "target")), []);
});

void test("invalid names fail before creating files", async (t) => {
  const directory = await temporary(t);
  for (const name of ["My App", "@scope", "_app", "a".repeat(101)]) {
    await assert.rejects(createProject(name, directory), /Use a project name/);
  }
  assert.deepEqual(await readdir(directory), []);
});

void test("help and missing arguments do not create a project", async (t) => {
  const directory = await temporary(t);
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  const help = spawnSync(process.execPath, [cli, "--help"], { cwd: directory, encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  const missing = spawnSync(process.execPath, [cli], { cwd: directory, encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Provide a project directory/);
  assert.deepEqual(await readdir(directory), []);
});

void test("Bun CLI emits Bun configuration, instructions, and CI", async (t) => {
  const directory = await temporary(t);
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./cli.js", import.meta.url)), "bun-app", "--package-manager", "bun"],
    { cwd: directory, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bun install/);
  assert.match(result.stdout, /^  bun db:migrate$/m);
  const project = join(directory, "bun-app");
  const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  assert.equal(manifest.packageManager, "bun@1.4.2");
  // Bun reads the workspace catalog from package.json.
  assert.deepEqual(manifest.workspaces.packages, ["apps/*", "packages/*"]);
  const { catalog } = manifest.workspaces;
  assert.match(catalog.effect, /^\^?4\./);
  assert.equal(manifest.devDependencies["vite-plus"], "catalog:");
  assert.equal(manifest.overrides.vite, catalog.vite);
  assert.equal(manifest.devDependencies.vite, "catalog:");
  assert.equal(manifest.overrides.vite, `npm:@voidzero-dev/vite-plus-core@${catalog["vite-plus"]}`);
  assert.equal(manifest.overrides.vitest, versions.vitest);
  assert.ok(manifest.trustedDependencies.includes("esbuild"));
  const files = await readdir(project);
  assert.ok(!files.some((file) => file.startsWith("pnpm")));
  assert.match(await readFile(join(project, "bunfig.toml"), "utf8"), /minimumReleaseAge = 86400/);
  const readme = await readFile(join(project, "README.md"), "utf8");
  // Bun runs scripts without `run`, except where its test runner and bundler win.
  assert.match(readme, /^bun typecheck$/m);
  assert.match(readme, /^bun run test$/m);
  assert.match(readme, /^bun run build$/m);
  assert.ok(!/^bun (test|build)$/m.test(readme));
  assert.match(readme, /`bun check` is Bun's type checker/);
  assert.match(readme, /Commit it before pushing/);
  assert.ok(!readme.includes("{{"));
  const ci = await readFile(join(project, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /bun install --frozen-lockfile/);
  assert.match(ci, /bun run test/);
  assert.ok(!ci.includes("pnpm"));
  const workflow = parse(ci);
  const source = parse(
    await readFile(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"),
  );
  assert.deepEqual(workflow.concurrency, source.concurrency);
  assert.deepEqual(workflow.permissions, source.permissions);
  assert.equal(workflow.jobs.checks["timeout-minutes"], source.jobs.checks["timeout-minutes"]);
  const steps = workflow.jobs.checks.steps;
  assert.equal(
    steps.find((step) => step.uses?.startsWith("oven-sh/setup-bun@")).with["bun-version"],
    "1.4.2",
  );
  const cache = steps.find((step) => step.uses?.startsWith("actions/cache@"));
  assert.equal(cache.with.path, "~/.bun/install/cache");
  assert.match(cache.with.key, /hashFiles\('bun\.lock'\)/);
  assert.ok(steps.indexOf(cache) < steps.findIndex((step) => step.run?.startsWith("bun install")));
  // Bun-only actions track the versions Dependabot maintains in this repository's workflows.
  const workflows = new URL("../../.github/workflows/", import.meta.url);
  const pinned = new Set();
  for (const file of await readdir(workflows)) {
    for (const match of (await readFile(new URL(file, workflows), "utf8")).matchAll(/uses: (\S+)/g))
      pinned.add(match[1]);
  }
  for (const step of steps) if (step.uses) assert.ok(pinned.has(step.uses), step.uses);
  assert.ok(!manifest.scripts.test.includes("create-effect-starter"));
});

void test("API runtime defaults to Node.js and Bun only changes the API process", async (t) => {
  const directory = await temporary(t);
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  const node = await createProject("node-app", directory);
  assert.equal(node.runtime, "node");
  const nodeApi = JSON.parse(
    await readFile(join(node.destination, "apps/api/package.json"), "utf8"),
  );
  assert.equal(nodeApi.scripts.start, "node --enable-source-maps dist/main.js");
  assert.equal(nodeApi.scripts.dev, "node --watch --watch-preserve-output src/main.ts");
  await assert.rejects(readFile(join(node.destination, "apps/api/dev.js")), { code: "ENOENT" });
  const nodeReadme = await readFile(join(node.destination, "README.md"), "utf8");
  assert.match(
    nodeReadme,
    /`dist\/main\.js` on Node\.js with `apps\/api` as the working directory/,
  );
  assert.match(nodeReadme, /`node --watch` runs `apps\/api\/src\/main\.ts`/);
  assert.ok(!nodeReadme.includes("bun check"), "pnpm + Node projects skip the Bun note");
  assert.ok(!nodeReadme.includes("{{"));

  const result = spawnSync(process.execPath, [cli, "bun-api", "--runtime", "bun"], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Bun API/);
  const project = join(directory, "bun-api");
  const api = JSON.parse(await readFile(join(project, "apps/api/package.json"), "utf8"));
  assert.equal(api.scripts.start, "bun dist/main.js");
  // The runner starts `bun --watch` and makes sure one Ctrl+C stops it.
  assert.equal(api.scripts.dev, "node dev.js");
  assert.equal(api.engines.bun, ">=1.4.2");
  assert.ok(!nodeApi.engines?.bun);
  assert.equal(
    await readFile(join(project, "apps/api/dev.js"), "utf8"),
    await readFile(new URL("./runtimes/bun/dev.js", import.meta.url), "utf8"),
  );
  // The runtime choice is independent of the package manager.
  const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  assert.match(manifest.packageManager, /^pnpm@/);
  assert.match(manifest.engines.node, /24\.11/);
  const readme = await readFile(join(project, "README.md"), "utf8");
  assert.match(readme, /runs on Bun 1\.4\.2\+/);
  assert.match(readme, /`dist\/main\.js` on Bun with `apps\/api` as the working directory/);
  assert.match(readme, /`bun --watch` runs `apps\/api\/src\/main\.ts`/);
  // The Bun command notes belong to the package manager, not the runtime.
  assert.ok(!readme.includes("bun check"));
  assert.ok(!readme.includes("{{"));
  assert.ok(!readme.includes("{{"));
});

void test("invalid runtimes fail before creating files", async (t) => {
  const directory = await temporary(t);
  await assert.rejects(
    createProject("my-app", directory, { runtime: "deno" }),
    /Unsupported runtime/,
  );
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  for (const args of [
    ["my-app", "--runtime", "deno"],
    ["my-app", "--runtime"],
    ["my-app", "--runtime", "bun", "--runtime", "node"],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
  }
  assert.deepEqual(await readdir(directory), []);
});

void test("invalid package managers and CLI flags fail before creating files", async (t) => {
  const directory = await temporary(t);
  await assert.rejects(
    createProject("my-app", directory, { packageManager: "npm" }),
    /Unsupported package manager/,
  );
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  for (const args of [
    ["my-app", "--package-manager", "npm"],
    ["my-app", "--package-manager"],
    ["my-app", "--unknown"],
    ["my-app", "--package-manager", "bun", "--package-manager", "pnpm"],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
  }
  assert.deepEqual(await readdir(directory), []);
});

for (const framework of ["react", "tanstack-start", "vue"]) {
  for (const packageManager of ["pnpm", "bun"]) {
    void test(`generates an isolated ${framework} frontend with ${packageManager}`, async (t) => {
      const directory = await temporary(t);
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL("./cli.js", import.meta.url)),
          "chosen-app",
          "--framework",
          framework,
          "--package-manager",
          packageManager,
        ],
        { cwd: directory, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Packages to install/);
      assert.ok(!result.stdout.includes("Running "));
      assert.equal(/^  react /m.test(result.stdout), framework !== "vue");
      assert.equal(/^  vue /m.test(result.stdout), framework === "vue");
      const project = join(directory, "chosen-app");
      const instructions = await readFile(join(project, "AGENTS.md"), "utf8");
      assert.match(instructions, /^# Effect architecture/m);
      // Lint explains its own rules; the instructions keep what no error message says.
      assert.match(instructions, /override in `vite\.config\.ts`/);
      assert.match(instructions, /`-- reason` suffix/);
      assert.match(instructions, /`catalog:`/);
      assert.ok(!instructions.includes("Effect.catchTag"), "lint enforces typed recovery");
      const examplePaths = [...instructions.matchAll(/\]\(((?:apps|packages)\/[^)#]+)\)/g)];
      assert.ok(examplePaths.length > 0, "Effect instructions link to working examples");
      for (const [, path] of examplePaths) {
        await readFile(join(project, path), "utf8");
      }
      const web = JSON.parse(await readFile(join(project, "apps/web/package.json"), "utf8"));
      const files = await readdir(join(project, "apps/web"), { recursive: true });
      assert.equal(web.dependencies["@chosen-app/contracts"], "workspace:*");
      assert.equal(Boolean(web.dependencies.vue), framework === "vue");
      assert.equal(Boolean(web.dependencies.react), framework !== "vue");
      assert.equal(
        Boolean(web.dependencies["@tanstack/react-start"]),
        framework === "tanstack-start",
      );
      assert.equal(files.includes("src/main.tsx"), framework === "react");
      assert.equal(files.includes("src/router.tsx"), framework === "tanstack-start");
      assert.equal(files.includes("src/pages/HomePage.vue"), framework === "vue");
      const readme = await readFile(join(project, "README.md"), "utf8");
      assert.ok(!readme.includes("{{"));
      assert.match(
        readme,
        framework === "vue"
          ? /Vue Router/
          : framework === "tanstack-start"
            ? /Server rendering/
            : /React, TanStack Router/,
      );
      if (packageManager === "pnpm") {
        const lock = await readFile(join(project, "pnpm-lock.yaml"), "utf8");
        assert.ok(!lock.includes("packages/create-chosen-app:"));
        const parsed = parse(lock);
        const dependencies = parsed.importers["apps/web"].dependencies;
        assert.equal(
          Boolean(dependencies["@tanstack/react-start"]),
          framework === "tanstack-start",
        );
        assert.equal(Boolean(dependencies["@tanstack/vue-query"]), framework === "vue");
        assert.deepEqual(Object.keys(parsed.importers).sort(), [
          ".",
          "apps/api",
          "apps/web",
          "packages/contracts",
        ]);
        assert.equal(
          parsed.importers["apps/web"].dependencies["@chosen-app/contracts"].version,
          "link:../../packages/contracts",
        );
        const workspace = await readFile(join(project, "pnpm-workspace.yaml"), "utf8");
        assert.ok(!workspace.includes("frontends"));
      }
    });
  }
}

for (const packageManager of ["pnpm", "bun"]) {
  void test(`generates an API-only project without a frontend with ${packageManager}`, async (t) => {
    const directory = await temporary(t);
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./cli.js", import.meta.url)),
        "api-app",
        "--framework",
        "none",
        "--package-manager",
        packageManager,
      ],
      { cwd: directory, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Created api-app \(No frontend, Node\.js API\)/);
    assert.ok(!/^Web:/m.test(result.stdout), "The dependency summary has no web section");
    const project = join(directory, "api-app");
    assert.deepEqual((await readdir(join(project, "apps"))).sort(), ["api"]);
    const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    assert.ok(!("dev:web" in manifest.scripts));
    assert.match(manifest.scripts["dev:api"], /--filter @api-app\/api/);
    const config = await readFile(join(project, "vite.config.ts"), "utf8");
    assert.ok(!/"react/.test(config), "API-only lint has no React plugin or rules");
    assert.match(config, /effecttsgo/);
    const formatted = await format("vite.config.ts", config);
    assert.equal(config, formatted.code);
    const agents = await readFile(join(project, "AGENTS.md"), "utf8");
    assert.ok(!agents.includes("web app"));
    const readme = await readFile(join(project, "README.md"), "utf8");
    assert.match(readme, /^TypeScript API with Effect v4/m);
    assert.ok(!/web|React|5173/.test(readme), "The README describes no frontend");
    assert.ok(!readme.includes("{{"));
    const paths = await readdir(project, { recursive: true });
    assert.ok(!paths.some((path) => path.startsWith("apps/web")));
    if (packageManager === "pnpm") {
      const lock = parse(await readFile(join(project, "pnpm-lock.yaml"), "utf8"));
      assert.deepEqual(Object.keys(lock.importers).sort(), [".", "apps/api", "packages/contracts"]);
    }
  });
}

void test("invalid frameworks and duplicate or missing framework flags do not create files", async (t) => {
  const directory = await temporary(t);
  await assert.rejects(
    createProject("my-app", directory, { framework: "angular" }),
    /Unsupported framework: angular\. Choose react, tanstack-start, vue, none\./,
  );
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  for (const flags of [
    ["--framework", "angular"],
    ["--framework"],
    ["--framework", "vue", "--framework", "react"],
  ]) {
    const result = spawnSync(process.execPath, [cli, "my-app", ...flags], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
  }
  assert.deepEqual(await readdir(directory), []);
});

for (const framework of ["react", "tanstack-start", "vue", "none"]) {
  void test(`generated root configs are formatted for ${framework}`, async (t) => {
    const directory = await temporary(t);
    const project = await createProject(
      // A long name catches scope renames that push config lines past the format width.
      "tanstack-start-pnpm-generated-app",
      directory,
      { framework },
    );
    for (const path of [
      "tools/oxlint/index.js",
      "tools/oxlint/anti-slop/index.ts",
      "tools/oxlint/anti-slop/effect/index.ts",
      "tools/oxlint/anti-slop/rules/no-module-mocking.ts",
      "tools/effect-policy.test.js",
      "apps/api/tsconfig.json",
    ]) {
      assert.equal(
        await readFile(join(project.destination, path), "utf8"),
        await readFile(new URL(`../../${path}`, import.meta.url), "utf8"),
        `${framework} must ship the current Effect policy`,
      );
    }
    const config = await readFile(join(project.destination, "vite.config.ts"), "utf8");
    const formatted = await format("vite.config.ts", config);
    assert.deepEqual(formatted.errors, []);
    assert.equal(
      config,
      formatted.code,
      "Framework customization must preserve formatter-clean output",
    );
  });
}
