import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiler = fileURLToPath(
  new URL("./dist/effect-tsgo.cjs", import.meta.resolve("@effect/tsgo/package.json")),
);
const vp = fileURLToPath(new URL("../bin/vp", import.meta.resolve("vite-plus")));

function run(binary, args) {
  const result = spawnSync(process.execPath, [binary, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(result.error);
  return { status: result.status, output: result.stdout + result.stderr };
}

async function fixture(t, location = "apps/api/src") {
  const directory = await mkdtemp(join(root, location, "policy-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

void test("API compiler rejects Effect mistakes independently of the TypeScript patch", async (t) => {
  const directory = await fixture(t, "apps/api");
  const config = join(directory, "tsconfig.json");
  await writeFile(config, JSON.stringify({ extends: "../tsconfig.json", include: ["*.ts"] }));
  await writeFile(
    join(directory, "valid.ts"),
    `import { Effect } from "effect";
export const operation = Effect.fn("Example.operation")(function* (value: string) {
  yield* Effect.log(value);
  return value;
});
`,
  );
  const valid = run(compiler, ["tsc", "--noEmit", "-p", config]);
  assert.equal(valid.status, 0, valid.output);
  await writeFile(
    join(directory, "invalid.ts"),
    `import { Effect } from "effect";
Effect.log("never executed");
export const operation = (value: string) => Effect.gen(function* () {
  yield* Effect.log(value);
  return value;
});
export const nestedPromise = Effect.succeed(Promise.resolve(1));
`,
  );
  const invalid = run(compiler, ["tsc", "--noEmit", "-p", config]);
  assert.notEqual(invalid.status, 0, invalid.output);
  for (const diagnostic of ["floatingEffect", "effectFnOpportunity", "promiseInEffectSuccess"]) {
    assert.match(invalid.output, new RegExp(`error TS\\d+:.*effect\\(${diagnostic}\\)`));
  }
});

void test("lint restricts imported runtimes while allowing adapters and unrelated methods", async (t) => {
  const directory = await fixture(t);
  const cases = [
    [
      "service.ts",
      'import { Effect as Fx } from "effect"; export const run = Fx.runPromise;',
      false,
    ],
    [
      "computed.ts",
      'import * as Fx from "effect/Effect"; export const run = Fx["runSync"];',
      false,
    ],
    [
      "named.ts",
      'import { runPromise as execute } from "effect/Effect"; export { execute };',
      false,
    ],
    [
      "managed.ts",
      'import * as Runtime from "effect/ManagedRuntime"; export const make = Runtime.make;',
      false,
    ],
    [
      "destructured.ts",
      'import { Effect } from "effect"; export const { runPromise } = Effect;',
      false,
    ],
    ["barrel.ts", 'import * as Fx from "effect"; export const run = Fx.Effect.runSync;', false],
    [
      "node.ts",
      'import { NodeRuntime } from "@effect/platform-node"; export const run = NodeRuntime.runMain;',
      false,
    ],
    [
      "node-subpath.ts",
      'import { runMain } from "@effect/platform-node/NodeRuntime"; export { runMain };',
      false,
    ],
    [
      "bun.ts",
      'import * as Runtime from "@effect/platform-bun/BunRuntime"; export const run = Runtime.runMain;',
      false,
    ],
    [
      "allowed.test.ts",
      'import { Effect } from "effect"; export const run = Effect.runPromise;',
      true,
    ],
    [
      "plain.ts",
      "const Effect = { runSync: () => 1 }; export const value = Effect.runSync();",
      true,
    ],
    [
      "shadow.ts",
      '// eslint-disable-next-line no-shadow -- Verify lexical shadowing does not flag an unrelated object.\nimport { Effect } from "effect"; export const run = Effect.succeed(1); export function local(Effect: { runSync(): number }) { return Effect.runSync(); }',
      true,
    ],
  ];
  for (const [name, source, allowed] of cases) {
    const path = join(directory, name);
    await writeFile(path, source);
    const result = run(vp, ["lint", path]);
    assert.equal(result.status, allowed ? 0 : 1, result.output);
    if (!allowed) assert.match(result.output, /runtime-boundary/);
  }
});

void test("lint requires explanations for lint, TypeScript, and Effect suppressions", async (t) => {
  const directory = await fixture(t);
  for (const [name, source, allowed] of [
    ["bare.ts", "// eslint-disable-next-line no-debugger\ndebugger;", false],
    [
      "explained.ts",
      "// eslint-disable-next-line no-debugger -- The fixture tests a debugger statement.\ndebugger;",
      true,
    ],
    ["typescript.ts", "// @ts-expect-error\nexport const value: string = 1;", false],
    [
      "effect.ts",
      "// @effect-diagnostics-next-line floatingEffect:off\nexport const value = 1;",
      false,
    ],
    [
      "reason.ts",
      "// @ts-expect-error -- The fixture deliberately violates this contract.\nexport const value: string = 1;",
      true,
    ],
  ]) {
    const path = join(directory, name);
    await writeFile(path, source);
    const result = run(vp, ["lint", "--config", join(root, "vite.config.ts"), path]);
    assert.equal(result.output.includes("suppression-reason"), !allowed, result.output);
    assert.equal(result.status, allowed ? 0 : 1, result.output);
  }
});
