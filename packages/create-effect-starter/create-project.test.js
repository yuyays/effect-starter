import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createProject } from "./create-project.js";

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), "effect-create-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("CLI generates a renamed project without generator artifacts", async (t) => {
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
  assert.ok(!("create:app" in manifest.scripts));
  assert.equal(manifest.scripts["dev:api"], "pnpm --filter @my-app/api dev");
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

test("rejects nonempty destinations without changing their contents", async (t) => {
  const directory = await temporary(t);
  const destination = join(directory, "my-app");
  await mkdir(destination);
  await writeFile(join(destination, "keep.txt"), "keep me");
  await assert.rejects(createProject("my-app", directory), /not an empty directory/);
  assert.deepEqual(await readdir(destination), ["keep.txt"]);
  assert.equal(await readFile(join(destination, "keep.txt"), "utf8"), "keep me");
});

test("supports an existing empty directory and rejects symlinks", async (t) => {
  const directory = await temporary(t);
  await mkdir(join(directory, "empty-app"));
  await createProject("empty-app", directory);
  await mkdir(join(directory, "target"));
  await symlink(join(directory, "target"), join(directory, "linked-app"), "dir");
  await assert.rejects(createProject("linked-app", directory), /not an empty directory/);
  assert.deepEqual(await readdir(join(directory, "target")), []);
});

test("invalid names fail before creating files", async (t) => {
  const directory = await temporary(t);
  for (const name of ["My App", "@scope", "_app", "a".repeat(101)]) {
    await assert.rejects(createProject(name, directory), /Use a project name/);
  }
  assert.deepEqual(await readdir(directory), []);
});

test("help and missing arguments do not create a project", async (t) => {
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
