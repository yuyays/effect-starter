import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const cli = fileURLToPath(new URL("./cli.js", import.meta.url));

async function fixture(t, packageManager) {
  const directory = await mkdtemp(join(tmpdir(), "effect-install-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bin = join(directory, "bin");
  await mkdir(bin);
  const executable = join(bin, packageManager);
  await writeFile(
    executable,
    `#!${process.execPath}\nconst fs = require("node:fs");\nfs.writeFileSync("install-invocation.json", JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }));\nprocess.exit(Number(process.env.INSTALL_TEST_EXIT_CODE ?? 0));\n`,
  );
  await chmod(executable, 0o755);
  return {
    directory,
    env: {
      ...process.env,
      PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
    },
  };
}

for (const packageManager of ["pnpm", "bun"]) {
  for (const exitCode of [0, 23]) {
    void test(
      `explicit ${packageManager} installation ${exitCode === 0 ? "succeeds" : "preserves the app on failure"}`,
      { skip: process.platform === "win32" },
      async (t) => {
        const { directory, env } = await fixture(t, packageManager);
        const result = spawnSync(
          process.execPath,
          [cli, "nested/my-app", "--package-manager", packageManager, "--install"],
          {
            cwd: directory,
            encoding: "utf8",
            env: { ...env, INSTALL_TEST_EXIT_CODE: String(exitCode) },
          },
        );
        const project = join(directory, "nested/my-app");
        assert.deepEqual(
          JSON.parse(await readFile(join(project, "install-invocation.json"), "utf8")),
          {
            cwd: project,
            args: ["install"],
          },
        );
        assert.match(result.stdout, /Packages to install/);
        assert.match(result.stdout, /effect \^4\.0\.0/);
        const nextSteps = result.stdout.split("Next steps:")[1];
        assert.ok(nextSteps);
        assert.equal(nextSteps.includes(`${packageManager} install`), exitCode !== 0);
        assert.match(nextSteps, /db:migrate/);
        assert.equal(result.status, exitCode === 0 ? 0 : 1, result.stderr);
        if (exitCode === 0) assert.match(result.stdout, /Dependencies installed/);
        else assert.match(result.stderr, /Installation failed:.*exited with code 23.*kept/);
        assert.ok(
          JSON.parse(await readFile(join(project, "package.json"), "utf8")).name === "my-app",
        );
      },
    );
  }

  void test(
    `${packageManager} does not install by default or with --no-install`,
    { skip: process.platform === "win32" },
    async (t) => {
      const { directory, env } = await fixture(t, packageManager);
      for (const flags of [[], ["--no-install"]]) {
        const name = flags.length ? "skipped-app" : "default-app";
        const result = spawnSync(
          process.execPath,
          [cli, name, "--package-manager", packageManager, ...flags],
          { cwd: directory, env, encoding: "utf8" },
        );
        assert.equal(result.status, 0, result.stderr);
        await assert.rejects(readFile(join(directory, name, "install-invocation.json")), {
          code: "ENOENT",
        });
        assert.match(
          result.stdout.split("Next steps:")[1],
          new RegExp(`${packageManager} install`),
        );
      }
    },
  );
}

void test("missing package manager reports a retry command and keeps the project", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "effect-install-missing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [cli, "my-app", "--install"], {
    cwd: directory,
    env: { ...process.env, PATH: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Installation failed:/);
  assert.match(result.stdout.split("Next steps:")[1], /pnpm install/);
  assert.ok(await readFile(join(directory, "my-app/package.json"), "utf8"));
});

void test("conflicting or repeated install flags fail before creating a project", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "effect-install-flags-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const flags of [
    ["--install", "--no-install"],
    ["--install", "--install"],
    ["--no-install", "--no-install"],
  ]) {
    const result = spawnSync(process.execPath, [cli, "my-app", ...flags], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    await assert.rejects(readFile(join(directory, "my-app/package.json")), { code: "ENOENT" });
  }
});
