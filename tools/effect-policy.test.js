import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const compiler = fileURLToPath(
  new URL("./dist/effect-tsgo.cjs", import.meta.resolve("@effect/tsgo/package.json")),
);
const vp = fileURLToPath(new URL("../bin/vp", import.meta.resolve("vite-plus")));
// Projects generated without a frontend skip the web rules until one is added.
const skipWithoutWeb = existsSync(join(root, "apps/web")) ? false : "no apps/web frontend";
// React Compiler and JSX accessibility rules apply only to the React frontends.
const skipWithoutReact =
  existsSync(join(root, "apps/web/src/main.tsx")) ||
  existsSync(join(root, "apps/web/src/router.tsx"))
    ? false
    : "no React frontend";

function run(binary, args) {
  const result = spawnSync(process.execPath, [binary, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.ifError(result.error);
  return { status: result.status, stdout: result.stdout, output: result.stdout + result.stderr };
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
    `import { Clock, Effect, Schema } from "effect";
class Failure extends Schema.TaggedError<Failure>()("Failure", { cause: Schema.Defect() }) {}
export const operation = Effect.fn("Example.operation")(function* (value: string) {
  const now = yield* Clock.currentTimeMillis;
  const signal = yield* Effect.abortSignal;
  yield* Effect.sleep(1);
  yield* Effect.log(value);
  return { value, now, signal };
});
export const expectedFailure = Effect.fail(new Failure({ cause: "expected" }));
export const sdkCall = Effect.tryPromise({
  try: () => Promise.resolve(1),
  catch: (cause) => new Failure({ cause }),
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
export const untypedFailure = Effect.fail(new Error("untyped failure"));
export const manualGlobals = Effect.gen(function* () {
  setTimeout(() => {}, 1);
  const now = Date.now();
  const signal = new AbortController().signal;
  return { now, signal };
});
export const untypedSdkCall = Effect.tryPromise({
  try: () => Promise.resolve(1),
  catch: (cause) => cause,
});
`,
  );
  const invalid = run(compiler, ["tsc", "--noEmit", "-p", config]);
  assert.notEqual(invalid.status, 0, invalid.output);
  for (const diagnostic of [
    "floatingEffect",
    "effectFnOpportunity",
    "promiseInEffectSuccess",
    "globalErrorInEffectFailure",
    "globalTimersInEffect",
    "unknownInEffectCatch",
    "globalDateInEffect",
    "abortControllerInEffect",
  ]) {
    assert.match(invalid.output, new RegExp(`error TS\\d+:.*effect\\(${diagnostic}\\)`));
  }
});

void test("lint restricts imported runtimes while allowing adapters and unrelated methods", async (t) => {
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
  const codes = await lintFixtures(t, "apps/api/src", Object.fromEntries(cases));
  for (const [name, , allowed] of cases) {
    assertRules(codes, { [name]: allowed ? [] : ["starter(runtime-boundary)"] });
  }
});

// Generated projects rename the workspace scope, so read names from the manifests.
async function packageName(workspace) {
  return JSON.parse(await readFile(join(root, workspace, "package.json"), "utf8")).name;
}

// Lint each fixture directory once and group reported rule codes by file name.
async function lintFixtures(t, location, files) {
  const directory = await fixture(t, location);
  for (const [name, source] of Object.entries(files)) {
    await writeFile(join(directory, name), source);
  }
  const result = run(vp, ["lint", "--format", "json", directory]);
  assert.ok(result.stdout.trimStart().startsWith("{"), result.output);
  const codes = new Map(Object.keys(files).map((name) => [name, new Set()]));
  for (const diagnostic of JSON.parse(result.stdout).diagnostics) {
    codes.get(diagnostic.filename.split("/").at(-1))?.add(diagnostic.code);
  }
  return codes;
}

function assertRules(codes, expected) {
  for (const [name, rules] of Object.entries(expected)) {
    const reported = [...codes.get(name)];
    if (rules.length === 0) assert.deepEqual(reported, [], `${name} must lint cleanly`);
    for (const rule of rules) {
      assert.ok(reported.includes(rule), `${name} must report ${rule}; got ${reported.join(", ")}`);
    }
  }
}

void test("lint enforces typed Effect recovery, tagged constructors, and evidence-preserving casts", async (t) => {
  const codes = await lintFixtures(t, "apps/api/src", {
    "catch.ts": `import { Effect } from "effect";
declare const program: Effect.Effect<number, { readonly _tag: "NotFound" }>;
export const recovered = program.pipe(
  Effect.catch((error) => (error._tag === "NotFound" ? Effect.succeed(0) : Effect.fail(error))),
);
`,
    "catch-tag.ts": `import { Effect, Schema } from "effect";
class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}
declare const program: Effect.Effect<number, NotFound>;
export const recovered = program.pipe(Effect.catchTag("NotFound", () => Effect.succeed(0)));
`,
    "tagged.ts": 'export const ready = { _tag: "Ready", value: 1 };\n',
    "wire.test.ts": 'export const expected = { _tag: "Ready", value: 1 };\n',
    "struct-tag.ts": `import { Schema } from "effect";
export const Ready = Schema.Struct({ _tag: Schema.Literal("Ready") });
`,
    "chained.ts":
      "declare const input: string;\nexport const value = input as unknown as number;\n",
    "widen.ts": `interface User { readonly id: string }
declare function loadUser(): User;
const loaded: User = loadUser();
const stored: unknown = loaded;
export const user = stored as User;
`,
    "reduce.ts": `const items = [1, 2];
export const all = items.reduce((acc, item) => acc.concat([item]), []);
`,
  });
  assertRules(codes, {
    "catch.ts": ["anti-slop-effect(no-manual-effect-error-tag)"],
    "catch-tag.ts": [],
    "tagged.ts": ["anti-slop-effect(no-manual-tagged-construction)"],
    "wire.test.ts": [],
    "struct-tag.ts": ["effecttsgo(schema-struct-with-tag)"],
    "chained.ts": ["anti-slop(no-chained-type-assertions)"],
    "widen.ts": ["anti-slop(no-widen-then-assert)"],
    "reduce.ts": ["anti-slop(no-reduce-accumulator-copy)"],
  });
});

void test("lint requires parsed boundaries only in domain workflows", async (t) => {
  const files = {
    "parameter.ts": "export function handle(input: unknown) {\n  return String(input);\n}\n",
    "dictionary.ts": "export type Metadata = Record<string, unknown>;\n",
  };
  assertRules(await lintFixtures(t, "apps/api/src/services", files), {
    "parameter.ts": ["anti-slop(no-unknown-parameters)"],
    "dictionary.ts": ["anti-slop(no-unsafe-dictionary-type)"],
  });
  assertRules(await lintFixtures(t, "apps/api/src", files), {
    "parameter.ts": [],
    "dictionary.ts": [],
  });
});

void test("lint hoists Schema compilers out of function bodies", async (t) => {
  const schema =
    'import { Schema } from "effect";\nconst User = Schema.Struct({ name: Schema.String });\n';
  const codes = await lintFixtures(t, "apps/api/src", {
    "inline.ts": `${schema}export const decode = (input: string) => Schema.decodeUnknownSync(User)(input);\n`,
    "hoisted.ts": `${schema}const decodeUser = Schema.decodeUnknownSync(User);\nexport const decode = (input: string) => decodeUser(input);\n`,
    "aliased.ts": `import * as S from "effect/Schema";\nconst User = S.Struct({ name: S.String });\nexport const decode = (input: string) => S.decodeUnknownSync(User)(input);\n`,
    "local.ts":
      "const Schema = { decodeSync: (schema: string) => (input: string) => schema + input };\nexport const decode = (input: string) => Schema.decodeSync('User')(input);\n",
    "camel.ts":
      'import { Schema } from "effect";\nconst userSchema = Schema.Struct({ name: Schema.String });\nexport const decode = (input: string) => Schema.decodeUnknownSync(userSchema)(input);\n',
    "argument.ts": `${schema}import { Effect } from "effect";\nexport const decode = (input: string) => Effect.succeed(input).pipe(Effect.flatMap(Schema.decodeUnknownEffect(User)));\n`,
    "named.ts":
      'import { Struct, String as Text, decodeUnknownSync } from "effect/Schema";\nconst User = Struct({ name: Text });\nexport const decode = (input: string) => decodeUnknownSync(User)(input);\n',
    "parameter.ts":
      'import { Schema } from "effect";\nexport const decodeWith = (options: { readonly schema: Schema.String; readonly input: string }) => Schema.decodeSync(options.schema)(options.input);\n',
  });
  assertRules(codes, {
    "inline.ts": ["starter(schema-compile-scope)"],
    "hoisted.ts": [],
    "aliased.ts": ["starter(schema-compile-scope)"],
    "local.ts": [],
    "camel.ts": ["starter(schema-compile-scope)"],
    "argument.ts": ["starter(schema-compile-scope)"],
    "named.ts": ["starter(schema-compile-scope)"],
    "parameter.ts": [],
  });
});

void test("lint keeps tests on real seams, Effect test runners, and controlled clocks", async (t) => {
  const codes = await lintFixtures(t, "apps/api/src", {
    "vite-plus.test.ts": 'import { vi } from "vite-plus/test";\nvi.mock("./users.js");\n',
    "effect-vitest.test.ts": 'import { vi } from "@effect/vitest";\nvi.doMock("./users.js");\n',
    "runtime.test.ts":
      'import { Effect } from "effect";\nexport const value = Effect.runSync(Effect.succeed(1));\n',
    "managed.test.ts":
      'import { Layer, ManagedRuntime } from "effect";\nexport const runtime = ManagedRuntime.make(Layer.empty);\n',
    "wall-clock.test.ts": "export const started = Date.now();\nexport const today = new Date();\n",
    "global-clock.test.ts": "export const started = globalThis.Date.now();\n",
    "date-call.test.ts": "export const today = Date();\n",
    "fixed-clock.test.ts": 'export const epoch = new Date("2026-01-01T00:00:00.000Z");\n',
    "clock.ts": "export const started = Date.now();\n",
  });
  assertRules(codes, {
    "vite-plus.test.ts": ["anti-slop(no-module-mocking)"],
    "effect-vitest.test.ts": ["anti-slop(no-module-mocking)"],
    "runtime.test.ts": ["starter(test-runtime)"],
    "managed.test.ts": ["starter(test-runtime)"],
    "wall-clock.test.ts": ["starter(no-wall-clock-in-tests)"],
    "global-clock.test.ts": ["starter(no-wall-clock-in-tests)"],
    "date-call.test.ts": ["starter(no-wall-clock-in-tests)"],
    "fixed-clock.test.ts": [],
    "clock.ts": [],
  });
  for (const name of ["runtime.test.ts", "managed.test.ts"]) {
    assert.ok(!codes.get(name).has("starter(runtime-boundary)"), `${name} is a test, not app code`);
  }
});

void test("lint lets web tests run Effects", { skip: skipWithoutWeb }, async (t) => {
  const source =
    'import { Effect } from "effect";\nexport const value = Effect.runSync(Effect.succeed(1));\n';
  assertRules(await lintFixtures(t, "apps/web/src", { "client.test.ts": source }), {
    "client.test.ts": [],
  });
});

void test(
  "lint enforces the React Compiler rules and JSX accessibility",
  { skip: skipWithoutReact },
  async (t) => {
    const codes = await lintFixtures(t, "apps/web/src", {
      "render.tsx": `import { useState } from "react";
export function Counter() {
  const [count, setCount] = useState(0);
  setCount(count + 1);
  return <p>{count}</p>;
}
`,
      "mutate.tsx": `export function Total(props: { count: number }) {
  props.count = 0;
  return <p>{props.count}</p>;
}
`,
      "image.tsx": `export const Logo = () => <img src="/logo.svg" />;\n`,
      "clean.tsx": `export const Logo = () => <img src="/logo.svg" alt="Effect starter" />;\n`,
    });
    assertRules(codes, {
      "render.tsx": ["react(set-state-in-render)"],
      "mutate.tsx": ["react(immutability)"],
      "image.tsx": ["jsx-a11y(alt-text)"],
      "clean.tsx": [],
    });
  },
);

void test("lint lets tooling tests read the clock", async (t) => {
  assertRules(
    await lintFixtures(t, "tools", { "timing.test.js": "export const started = Date.now();\n" }),
    { "timing.test.js": [] },
  );
});

void test(
  "lint keeps the web app on the shared contracts instead of API internals",
  { skip: skipWithoutWeb },
  async (t) => {
    const codes = await lintFixtures(t, "apps/web/src", {
      "relative.ts": 'export { listUsers } from "../../../api/src/services/users.js";\n',
      "root.ts": 'export { listUsers } from "../../../../apps/api/src/services/users.js";\n',
      "alias.ts": 'export { listUsers } from "@/../../api/src/services/users.js";\n',
      "package.ts": `export * from "${await packageName("apps/api")}";\n`,
      "normalized.ts": 'export * from ".././../../api/src/services/users.ts";\n',
      "dynamic.ts": `export const load = () => import("${await packageName("apps/api")}/src/http.ts");\n`,
      "contracts.ts": `export { StarterApi } from "${await packageName("packages/contracts")}/http";\n`,
    });
    assertRules(codes, {
      "relative.ts": ["starter(workspace-imports)"],
      "root.ts": ["starter(workspace-imports)"],
      "alias.ts": ["starter(workspace-imports)"],
      "package.ts": ["starter(workspace-imports)"],
      "normalized.ts": ["starter(workspace-imports)"],
      "dynamic.ts": ["starter(workspace-imports)"],
      "contracts.ts": [],
    });
  },
);

void test("lint keeps contracts independent of applications", async (t) => {
  const api = await packageName("apps/api");
  assertRules(
    await lintFixtures(t, "packages/contracts/src", {
      "app.ts": `export * from "${api}";\n`,
      "relative.ts": 'export * from "../../../../apps/api/src/db/database.ts";\n',
      "dynamic.ts": `export const load = () => import("${api}/src/http.ts");\n`,
      "import-type.ts": `export type App = typeof import("${api}");\n`,
      "require.ts": `export const app = require("${api}");\n`,
      "local.ts": 'export { UsersResponse } from "../schemas/user.ts";\n',
    }),
    {
      "app.ts": ["starter(workspace-imports)"],
      "relative.ts": ["starter(workspace-imports)"],
      "dynamic.ts": ["starter(workspace-imports)"],
      "import-type.ts": ["starter(workspace-imports)"],
      "require.ts": ["starter(workspace-imports)"],
      "local.ts": [],
    },
  );
});

void test("lint requires public package exports across workspaces", async (t) => {
  const contracts = await packageName("packages/contracts");
  assertRules(
    await lintFixtures(t, "apps/api/src", {
      "public.ts": `export { StarterApi } from "${contracts}/http";\n`,
      "root.ts": `export { StarterApi } from "${contracts}";\n`,
      "private.ts": `export { StarterApi } from "${contracts}/src/http/index.ts";\n`,
      "type.ts": `export type { User } from "${contracts}/src/schemas/user.ts";\n`,
      "relative.ts": 'export * from "../../../../packages/contracts/src/http/index.ts";\n',
      "normalized.ts": 'export * from ".././../../../packages/contracts/src/http/index.ts";\n',
      "local.ts": 'export { Database } from "../db/database.ts";\n',
    }),
    {
      "public.ts": [],
      "root.ts": [],
      "private.ts": ["starter(workspace-imports)"],
      "type.ts": ["starter(workspace-imports)"],
      "relative.ts": ["starter(workspace-imports)"],
      "normalized.ts": ["starter(workspace-imports)"],
      "local.ts": [],
    },
  );
});

void test("lint respects empty export maps, conditional roots, and private pattern exclusions", async (t) => {
  const empty = await fixture(t, "packages");
  const library = await fixture(t, "packages");
  await writeFile(
    join(empty, "package.json"),
    JSON.stringify({ name: "@policy/empty", exports: {} }),
  );
  await writeFile(
    join(library, "package.json"),
    JSON.stringify({
      name: "@policy/library",
      exports: {
        ".": { import: "./src/index.ts" },
        "./*": "./src/*.ts",
        "./private/*": null,
        "./blocked": null,
      },
    }),
  );
  assertRules(
    await lintFixtures(t, "apps/api/src", {
      "empty.ts": 'export * from "@policy/empty";\n',
      "conditional.ts": 'export * from "@policy/library";\n',
      "pattern.ts": 'export * from "@policy/library/users";\n',
      "private.ts": 'export * from "@policy/library/private/users";\n',
      "blocked.ts": 'export * from "@policy/library/blocked";\n',
    }),
    {
      "empty.ts": ["starter(workspace-imports)"],
      "conditional.ts": [],
      "pattern.ts": [],
      "private.ts": ["starter(workspace-imports)"],
      "blocked.ts": ["starter(workspace-imports)"],
    },
  );
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
