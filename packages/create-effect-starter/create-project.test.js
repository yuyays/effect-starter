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
  assert.equal(manifest.scripts["dev:api"], "vp run @my-app/api#dev");
  for (const [location, name] of [
    ["apps/api", "api"],
    ["apps/web", "web"],
    ["packages/contracts", "contracts"],
  ]) {
    const pkg = JSON.parse(await readFile(join(project, location, "package.json"), "utf8"));
    assert.equal(pkg.name, `@my-app/${name}`);
    if (name !== "contracts") assert.equal(pkg.dependencies["@my-app/contracts"], "workspace:*");
  }
  assert.deepEqual(await readdir(join(project, "packages")), ["contracts"]);
  assert.deepEqual(await readdir(join(project, ".github/workflows")), ["ci.yml"]);
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
  assert.match(
    await readFile(join(project, "apps/api/tsup.config.ts"), "utf8"),
    /@my-app\/contracts/,
  );
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
  assert.match(result.stdout, /bun run db:migrate/);
  const project = join(directory, "bun-app");
  const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  assert.equal(manifest.packageManager, "bun@1.4.2");
  assert.deepEqual(manifest.workspaces, ["apps/*", "packages/*"]);
  assert.equal(manifest.overrides.vite, manifest.devDependencies.vite);
  assert.equal(
    manifest.overrides.vite,
    `npm:@voidzero-dev/vite-plus-core@${manifest.devDependencies["vite-plus"]}`,
  );
  assert.equal(manifest.overrides.vitest, versions.vitest);
  assert.ok(manifest.trustedDependencies.includes("esbuild"));
  const files = await readdir(project);
  assert.ok(!files.some((file) => file.startsWith("pnpm")));
  assert.match(await readFile(join(project, "bunfig.toml"), "utf8"), /minimumReleaseAge = 86400/);
  const readme = await readFile(join(project, "README.md"), "utf8");
  assert.match(readme, /bun run typecheck/);
  assert.match(readme, /Commit it before pushing/);
  assert.ok(!readme.includes("{{"));
  const ci = await readFile(join(project, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /bun install --frozen-lockfile/);
  assert.match(ci, /bun run test/);
  assert.ok(!ci.includes("pnpm"));
  assert.ok(!manifest.scripts.test.includes("create-effect-starter"));
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

void test("invalid frameworks and duplicate or missing framework flags do not create files", async (t) => {
  const directory = await temporary(t);
  await assert.rejects(
    createProject("my-app", directory, { framework: "angular" }),
    /Unsupported framework/,
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

for (const framework of ["react", "tanstack-start", "vue"]) {
  void test(`generated root configs are formatted for ${framework}`, async (t) => {
    const directory = await temporary(t);
    const project = await createProject("my-app", directory, { framework });
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
