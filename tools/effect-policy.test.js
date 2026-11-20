import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

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

// The compiler test writes its own throwaway project; lint fixtures are collected below.
async function fixture(t, location = "apps/api/src") {
  const directory = await mkdtemp(join(root, location, "policy-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

// Generated projects rename the workspace scope, so read names from the manifests.
function packageName(workspace) {
  return JSON.parse(readFileSync(join(root, workspace, "package.json"), "utf8")).name;
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

// Fixtures are declared before the tests run and linted together: `vp lint` spends about
// 0.3s starting up, which was most of this file's runtime while every test started its
// own process. A set marked with a skip condition is never written, matching the tests
// that do not run in a project without that frontend.
const fixtureSets = new Map();

function fixtureSet(name, location, files, skip = false) {
  if (skip) return name;
  if (fixtureSets.has(name)) throw new Error(`Duplicate fixture set: ${name}`);
  fixtureSets.set(name, { location, files });
  return name;
}

const fixtureDirectories = new Map(); // fixture set name -> directory
const fixtureDiagnostics = new Map(); // fixture set name -> Map(file name -> diagnostics)

function diagnosticsFor(name, file) {
  lintFixtures();
  const diagnostics = fixtureDiagnostics.get(name)?.get(file);
  if (!diagnostics) throw new Error(`No fixture file ${file} in ${name}`);
  return diagnostics;
}

// The first lint assertion writes every declared fixture and lints them in one pass.
// Declarations live after the tests that use them, so this cannot run in a `before` hook:
// node:test runs top-level hooks before the rest of the module body.
let fixturesLinted = false;

function lintFixtures() {
  if (fixturesLinted) return;
  fixturesLinted = true;
  for (const [name, { location, files }] of fixtureSets) {
    // A project without the frontend a skipped test needs lacks that source directory.
    if (!existsSync(join(root, location))) continue;
    const directory = mkdtempSync(join(root, location, `policy-fixture-${name}-`));
    fixtureDirectories.set(name, directory);
    fixtureDiagnostics.set(name, new Map(Object.keys(files).map((file) => [file, []])));
    for (const [file, source] of Object.entries(files)) {
      writeFileSync(join(directory, file), source);
    }
  }
  if (fixtureDirectories.size === 0) return;
  const result = run(vp, ["lint", "--format", "json", ...fixtureDirectories.values()]);
  assert.ok(result.stdout.trimStart().startsWith("{"), result.output);
  for (const diagnostic of JSON.parse(result.stdout).diagnostics) {
    const filename = resolve(root, diagnostic.filename);
    for (const [name, directory] of fixtureDirectories) {
      if (!filename.startsWith(directory + sep)) continue;
      fixtureDiagnostics.get(name).get(relative(directory, filename))?.push(diagnostic);
      break;
    }
  }
}

function codesFor(name) {
  lintFixtures();
  const codes = new Map();
  for (const [file, diagnostics] of fixtureDiagnostics.get(name) ?? []) {
    codes.set(file, new Set(diagnostics.map((diagnostic) => diagnostic.code)));
  }
  return codes;
}

after(async () => {
  await Promise.all(
    [...fixtureDirectories.values()].map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

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

const runtimeCases = [
  ["service.ts", 'import { Effect as Fx } from "effect"; export const run = Fx.runPromise;', false],
  ["computed.ts", 'import * as Fx from "effect/Effect"; export const run = Fx["runSync"];', false],
  ["named.ts", 'import { runPromise as execute } from "effect/Effect"; export { execute };', false],
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
  ["plain.ts", "const Effect = { runSync: () => 1 }; export const value = Effect.runSync();", true],
  [
    "shadow.ts",
    '// eslint-disable-next-line no-shadow -- Verify lexical shadowing does not flag an unrelated object.\nimport { Effect } from "effect"; export const run = Effect.succeed(1); export function local(Effect: { runSync(): number }) { return Effect.runSync(); }',
    true,
  ],
];
fixtureSet("runtime-boundaries", "apps/api/src", Object.fromEntries(runtimeCases));

void test("lint restricts imported runtimes while allowing adapters and unrelated methods", () => {
  const codes = codesFor("runtime-boundaries");
  for (const [name, , allowed] of runtimeCases) {
    assertRules(codes, { [name]: allowed ? [] : ["starter(runtime-boundary)"] });
  }
});

fixtureSet("typed-failures", "apps/api/src", {
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
  "chained.ts": "declare const input: string;\nexport const value = input as unknown as number;\n",
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

void test("lint enforces typed Effect recovery, tagged constructors, and evidence-preserving casts", () => {
  assertRules(codesFor("typed-failures"), {
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

// The same sources are linted in a domain workflow and in application code, where only
// the workflow requires parsed input.
const boundaryFiles = {
  "parameter.ts": "export function handle(input: unknown) {\n  return String(input);\n}\n",
  "dictionary.ts": "export type Metadata = Record<string, unknown>;\n",
};
fixtureSet("service-boundaries", "apps/api/src/services", boundaryFiles);
fixtureSet("app-boundaries", "apps/api/src", boundaryFiles);

void test("lint requires parsed boundaries only in domain workflows", () => {
  assertRules(codesFor("service-boundaries"), {
    "parameter.ts": ["anti-slop(no-unknown-parameters)"],
    "dictionary.ts": ["anti-slop(no-unsafe-dictionary-type)"],
  });
  assertRules(codesFor("app-boundaries"), {
    "parameter.ts": [],
    "dictionary.ts": [],
  });
});

const schema =
  'import { Schema } from "effect";\nconst User = Schema.Struct({ name: Schema.String });\n';
fixtureSet("schema-compile-scope", "apps/api/src", {
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

void test("lint hoists Schema compilers out of function bodies", () => {
  assertRules(codesFor("schema-compile-scope"), {
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

fixtureSet("test-seams", "apps/api/src", {
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

void test("lint keeps tests on real seams, Effect test runners, and controlled clocks", () => {
  const codes = codesFor("test-seams");
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

const webRuntimeSource =
  'import { Effect } from "effect";\nexport const load = () => Effect.runPromise(Effect.succeed(1));\n';
fixtureSet("web-runtime", "apps/web/src", { "users-panel.ts": webRuntimeSource }, skipWithoutWeb);

void test("lint keeps web Effect runtimes in the client adapters", { skip: skipWithoutWeb }, () => {
  assertRules(codesFor("web-runtime"), { "users-panel.ts": ["starter(runtime-boundary)"] });
});

fixtureSet(
  "react-effects",
  "apps/web/src",
  {
    "named.ts": `import { useEffect as effect } from "react";
export const schedule = effect;
export function defer(effect: () => void) { return effect; }`,
    "namespace.ts": `import * as React from "react";
export const schedule = React[\`useEffect\`];`,
    "default.ts": `import React from "react";
export function useMeasure() { React.useLayoutEffect(() => {}, []); }`,
    "destructured.ts": `import React from "react";
const { useLayoutEffect: measure } = React;
export { measure };`,
    "assigned.ts": `import React from "react";
export function register(hooks: { run: typeof React.useEffect }) {
  ({ useEffect: hooks.run } = React);
}`,
    "reexport.ts": `export { useEffect as schedule } from "react";`,
    "allowed.ts": `import { useEffect as effect, useInsertionEffect, useState } from "react";
export type EffectCallback = Parameters<typeof effect>[0];
export const effects = { useEffect: useInsertionEffect };
export function useSettings() { return useState(false); }
export function defer(useEffect: () => void) { return useEffect; }
export function useDialogListener() {
  // oxlint-disable-next-line starter/no-direct-react-effect -- Subscribes to a browser event.
  effect(() => {
    const close = () => window.dispatchEvent(new Event("dialog-closed"));
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);
}`,
    "bare.ts": `import { useLayoutEffect } from "react";
export function useMeasure() {
  // oxlint-disable-next-line starter/no-direct-react-effect
  useLayoutEffect(() => {}, []);
}`,
  },
  skipWithoutReact,
);

void test(
  "lint restricts direct React effects and requires reasons for exceptions",
  { skip: skipWithoutReact },
  () => {
    const codes = codesFor("react-effects");
    assertRules(codes, {
      "named.ts": ["starter(no-direct-react-effect)"],
      "namespace.ts": ["starter(no-direct-react-effect)"],
      "default.ts": ["starter(no-direct-react-effect)"],
      "destructured.ts": ["starter(no-direct-react-effect)"],
      "assigned.ts": ["starter(no-direct-react-effect)"],
      "reexport.ts": ["starter(no-direct-react-effect)"],
      "allowed.ts": [],
      "bare.ts": ["starter(suppression-reason)"],
    });
    assert.equal(
      diagnosticsFor("react-effects", "named.ts").filter(
        (diagnostic) => diagnostic.code === "starter(no-direct-react-effect)",
      ).length,
      1,
      "only the imported hook reference must be reported",
    );
    assert.ok(!codes.get("bare.ts").has("starter(no-direct-react-effect)"));
  },
);

const webTestSource =
  'import { Effect } from "effect";\nexport const value = Effect.runSync(Effect.succeed(1));\n';
fixtureSet("web-tests", "apps/web/src", { "client.test.ts": webTestSource }, skipWithoutWeb);

void test("lint lets web tests run Effects", { skip: skipWithoutWeb }, () => {
  assertRules(codesFor("web-tests"), {
    "client.test.ts": [],
  });
});

const timerCases = {
  "wrapped.test.ts":
    "export const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 50));\n",
  "callback.test.ts":
    "export const wait = () => new Promise<void>((resolve) => globalThis.setTimeout(() => resolve(), 50));\n",
  "nested.test.ts":
    "export const wait = () => new Promise<void>((resolve) => queueMicrotask(() => setTimeout(resolve, 50)));\n",
  "alias.test.ts":
    'import { setTimeout as sleep } from "node:timers/promises";\nexport const wait = () => sleep(50);\n',
  "namespace.test.ts":
    'import * as timers from "node:timers/promises";\nexport const wait = () => timers.setTimeout(50);\n',
  "default.test.ts":
    'import timers from "timers/promises";\nexport const wait = () => timers["setTimeout"](50);\n',
  "callback-import.test.ts":
    'import { setTimeout as later } from "node:timers";\nexport const wait = () => new Promise<void>((resolve) => later(resolve, 50));\n',
  "shadow-import.test.ts":
    'import { setTimeout as sleep } from "node:timers/promises";\nexport { sleep };\n// eslint-disable-next-line no-shadow -- Verify a local function is not mistaken for the imported timer.\nexport const wait = (sleep: (ms: number) => Promise<void>) => sleep(50);\n',
  "retry.test.ts":
    'import { vi } from "@effect/vitest";\nexport const wait = () => vi.waitFor(() => true);\n',
  "shadow.test.ts":
    "export const wait = (setTimeout: (callback: () => void, ms: number) => void) => new Promise<void>((resolve) => setTimeout(resolve, 50));\n",
  "plain.test.ts": "export const wait = (sleep: (ms: number) => Promise<void>) => sleep(50);\n",
  "event.test.ts":
    "export const wait = (target: EventTarget) => new Promise<void>((resolve) => target.addEventListener('ready', () => resolve(), { once: true }));\n",
  "schedule.test.ts":
    "export const schedule = (callback: () => void) => setTimeout(callback, 50);\n",
  "clock.test.ts":
    'import { Effect, TestClock } from "effect";\nexport const work = Effect.sleep(50);\nexport const advance = TestClock.adjust(50);\n',
  "live.integration.test.ts":
    'import { setTimeout as sleep } from "node:timers/promises";\nexport const wait = () => sleep(50);\n',
};
fixtureSet("timer-waits", "apps/api/src", timerCases);
fixtureSet("tooling-timers", "tools", { "wait.test.js": timerCases["alias.test.ts"] });

void test("lint rejects direct timer waits in unit tests without banning event signals", () => {
  const codes = codesFor("timer-waits");
  assertRules(codes, {
    "wrapped.test.ts": ["starter(no-timer-waits-in-tests)"],
    "callback.test.ts": ["starter(no-timer-waits-in-tests)"],
    "nested.test.ts": ["starter(no-timer-waits-in-tests)"],
    "alias.test.ts": ["starter(no-timer-waits-in-tests)"],
    "namespace.test.ts": ["starter(no-timer-waits-in-tests)"],
    "default.test.ts": ["starter(no-timer-waits-in-tests)"],
    "callback-import.test.ts": ["starter(no-timer-waits-in-tests)"],
    "shadow-import.test.ts": [],
    "retry.test.ts": [],
    "shadow.test.ts": [],
    "plain.test.ts": [],
    "event.test.ts": [],
    "schedule.test.ts": [],
    "clock.test.ts": [],
    "live.integration.test.ts": [],
  });
  assertRules(codesFor("tooling-timers"), {
    "wait.test.js": [],
  });
});

fixtureSet(
  "react-compiler",
  "apps/web/src",
  {
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
  },
  skipWithoutReact,
);

void test(
  "lint enforces the React Compiler rules and JSX accessibility",
  { skip: skipWithoutReact },
  () => {
    assertRules(codesFor("react-compiler"), {
      "render.tsx": ["react(set-state-in-render)"],
      "mutate.tsx": ["react(immutability)"],
      "image.tsx": ["jsx-a11y(alt-text)"],
      "clean.tsx": [],
    });
  },
);

fixtureSet("tooling-clock", "tools", {
  "timing.test.js": "export const started = Date.now();\n",
});

void test("lint lets tooling tests read the clock", () => {
  assertRules(codesFor("tooling-clock"), { "timing.test.js": [] });
});

// Generated projects rename the workspace scope, so read the names once for the fixtures
// below instead of per test.
const apiName = packageName("apps/api");
const contractsName = packageName("packages/contracts");
const webName = skipWithoutWeb ? undefined : packageName("apps/web");

fixtureSet(
  "web-contracts",
  "apps/web/src",
  {
    "relative.ts": 'export { listUsers } from "../../../api/src/services/users.js";\n',
    "root.ts": 'export { listUsers } from "../../../../apps/api/src/services/users.js";\n',
    "alias.ts": 'export { listUsers } from "@/../../api/src/services/users.js";\n',
    "package.ts": `export * from "${apiName}";\n`,
    "normalized.ts": 'export * from ".././../../api/src/services/users.ts";\n',
    "dynamic.ts": `export const load = () => import("${apiName}/src/http.ts");\n`,
    "template.ts": `export const load = () => import(\`${apiName}\`);\n`,
    "contracts.ts": `export { StarterApi } from "${contractsName}/http";\n`,
  },
  skipWithoutWeb,
);

void test(
  "lint keeps the web app on the shared contracts instead of API internals",
  { skip: skipWithoutWeb },
  () => {
    assertRules(codesFor("web-contracts"), {
      "relative.ts": ["starter(workspace-imports)"],
      "root.ts": ["starter(workspace-imports)"],
      "alias.ts": ["starter(workspace-imports)"],
      "package.ts": ["starter(workspace-imports)"],
      "normalized.ts": ["starter(workspace-imports)"],
      "dynamic.ts": ["starter(workspace-imports)"],
      "template.ts": ["starter(workspace-imports)"],
      "contracts.ts": [],
    });
  },
);

fixtureSet(
  "web-config",
  "apps/web",
  { "config.ts": `export * from "${apiName}";\n` },
  skipWithoutWeb,
);
fixtureSet(
  "api-web-import",
  "apps/api/src",
  { "web.ts": `export * from "${webName}";\n` },
  skipWithoutWeb,
);

void test(
  "lint keeps app configuration and backend code on public package interfaces",
  { skip: skipWithoutWeb },
  () => {
    assertRules(codesFor("web-config"), {
      "config.ts": ["starter(workspace-imports)"],
    });
    assertRules(codesFor("api-web-import"), {
      "web.ts": ["starter(workspace-imports)"],
    });
  },
);

fixtureSet("contracts-independence", "packages/contracts/src", {
  "app.ts": `export * from "${apiName}";\n`,
  "relative.ts": 'export * from "../../../../apps/api/src/db/database.ts";\n',
  "dynamic.ts": `export const load = () => import("${apiName}/src/http.ts");\n`,
  "import-type.ts": `export type App = typeof import("${apiName}");\n`,
  "require.ts": `export const app = require("${apiName}");\n`,
  "local.ts": 'export { UsersResponse } from "../schemas/user.ts";\n',
});

void test("lint keeps contracts independent of applications", () => {
  assertRules(codesFor("contracts-independence"), {
    "app.ts": ["starter(workspace-imports)"],
    "relative.ts": ["starter(workspace-imports)"],
    "dynamic.ts": ["starter(workspace-imports)"],
    "import-type.ts": ["starter(workspace-imports)"],
    "require.ts": ["starter(workspace-imports)"],
    "local.ts": [],
  });
});

fixtureSet("public-exports", "apps/api/src", {
  "public.ts": `export { StarterApi } from "${contractsName}/http";\n`,
  "root.ts": `export { StarterApi } from "${contractsName}";\n`,
  "private.ts": `export { StarterApi } from "${contractsName}/src/http/index.ts";\n`,
  "type.ts": `export type { User } from "${contractsName}/src/schemas/user.ts";\n`,
  "relative.ts": 'export * from "../../../../packages/contracts/src/http/index.ts";\n',
  "normalized.ts": 'export * from ".././../../../packages/contracts/src/http/index.ts";\n',
  "local.ts": 'export { Database } from "../db/database.ts";\n',
});

void test("lint requires public package exports across workspaces", () => {
  assertRules(codesFor("public-exports"), {
    "public.ts": [],
    "root.ts": [],
    "private.ts": ["starter(workspace-imports)"],
    "type.ts": ["starter(workspace-imports)"],
    "relative.ts": ["starter(workspace-imports)"],
    "normalized.ts": ["starter(workspace-imports)"],
    "local.ts": [],
  });
});

// `starter/workspace-imports` reads workspace manifests when lint starts, so these
// fixture packages exist before the shared lint pass runs.
fixtureSet("policy-empty-package", "packages", {
  "package.json": JSON.stringify({ name: "@policy/empty", exports: {} }),
});
fixtureSet("policy-library-package", "packages", {
  "package.json": JSON.stringify({
    name: "@policy/library",
    exports: {
      ".": { import: "./src/index.ts" },
      "./*": "./src/*.ts",
      "./private/*": null,
      "./blocked": null,
    },
  }),
});
fixtureSet("export-maps", "apps/api/src", {
  "empty.ts": 'export * from "@policy/empty";\n',
  "conditional.ts": 'export * from "@policy/library";\n',
  "pattern.ts": 'export * from "@policy/library/users";\n',
  "private.ts": 'export * from "@policy/library/private/users";\n',
  "blocked.ts": 'export * from "@policy/library/blocked";\n',
});

void test("lint respects empty export maps, conditional roots, and private pattern exclusions", () => {
  assertRules(codesFor("export-maps"), {
    "empty.ts": ["starter(workspace-imports)"],
    "conditional.ts": [],
    "pattern.ts": [],
    "private.ts": ["starter(workspace-imports)"],
    "blocked.ts": ["starter(workspace-imports)"],
  });
});

fixtureSet("suppressions", "apps/api/src", {
  "bare.ts": "// eslint-disable-next-line no-debugger\ndebugger;",
  "explained.ts":
    "// eslint-disable-next-line no-debugger -- The fixture tests a debugger statement.\ndebugger;",
  "typescript.ts": "// @ts-expect-error\nexport const value: string = 1;",
  "effect.ts": "// @effect-diagnostics-next-line floatingEffect:off\nexport const value = 1;",
  "reason.ts":
    "// @ts-expect-error -- The fixture deliberately violates this contract.\nexport const value: string = 1;",
});

void test("lint requires explanations for lint, TypeScript, and Effect suppressions", () => {
  for (const [name, allowed] of [
    ["bare.ts", false],
    ["explained.ts", true],
    ["typescript.ts", false],
    ["effect.ts", false],
    ["reason.ts", true],
  ]) {
    const diagnostics = diagnosticsFor("suppressions", name);
    // `vp lint <file>` exits 1 when the file has an error, which is the per-file status
    // this test used to read from a separate lint process.
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.code === "starter(suppression-reason)"),
      !allowed,
      `${name}: ${diagnostics.map((diagnostic) => diagnostic.code).join(", ")}`,
    );
    assert.equal(
      diagnostics.some((diagnostic) => diagnostic.severity === "error"),
      !allowed,
      `${name} must ${allowed ? "lint cleanly" : "fail lint"}`,
    );
  }
});
