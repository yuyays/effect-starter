import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { frameworks, getFramework, hasFrontend } from "./frameworks.js";
import { createProject } from "./create-project.js";
import { waitForDevServers } from "./dev-servers.js";

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function response(url) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(1000) });
  } catch {
    return undefined;
  }
}

async function smokeDev(packageManager, destination, framework, runtime) {
  // Development runs the TypeScript source, so it must not depend on a production build.
  await rm(join(destination, "apps/api/dist"), { recursive: true, force: true });
  const apiPort = await freePort();
  const webPort = await freePort();
  // Match the IPv4 probes even when localhost resolves to IPv6 on CI.
  // Use private ports only in this disposable fixture, including its API proxy.
  const frontend = hasFrontend(framework);
  if (frontend) {
    const configPath = join(destination, "apps/web/vite.config.ts");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config
        .replace(/^\s*port: 5173,\n/m, "")
        .replace("server: {", `server: { host: "127.0.0.1", port: ${webPort}, strictPort: true,`)
        .replaceAll("http://localhost:3000", `http://127.0.0.1:${apiPort}`),
    );
  }
  const child = spawn(packageManager, ["run", "dev"], {
    cwd: destination,
    detached: true,
    env: {
      ...process.env,
      PORT: String(apiPort),
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const pid = child.pid;
  if (pid === undefined) throw new Error(`Could not start ${packageManager}`);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  child.on("error", (error) => {
    output += error.message;
  });
  const webUrl = frontend ? `http://127.0.0.1:${webPort}` : undefined;
  const apiUrl = `http://127.0.0.1:${apiPort}/api/health`;
  try {
    const {
      ready,
      api: apiHealth,
      web: webHealth,
      proxy: proxyHealth,
      reason,
      proxyStatus,
    } = await waitForDevServers({
      response,
      apiUrl,
      webUrl,
      shouldStop: () => child.exitCode !== null,
      delay: () => setTimeout(100),
    });
    assert.ok(
      ready,
      reason === "exited"
        ? `Dev servers exited before becoming ready (code ${child.exitCode}):\n${output}`
        : frontend
          ? `Dev servers did not become ready (proxy ${proxyStatus ?? "unreachable"}):\n${output}`
          : `The API did not become ready:\n${output}`,
    );
    assert.deepEqual(await apiHealth.json(), { ok: true, service: "api" });
    if (frontend) {
      assert.match(
        await webHealth.text(),
        framework === "tanstack-start" ? /TanStack Start, Effect Platform API/ : /<div id="root">/,
      );
      assert.deepEqual(await proxyHealth.json(), { ok: true, service: "api" });
    }
    // Change a contract route to verify the watcher reloads the API when a workspace package changes.
    const contractsPath = join(destination, "packages/contracts/src/http/index.ts");
    const contracts = await readFile(contractsPath, "utf8");
    try {
      assert.ok(contracts.includes('"/health"'));
      await writeFile(contractsPath, contracts.replace('"/health"', '"/health-updated"'));
      let reloaded = false;
      for (let attempt = 0; attempt < 300; attempt++) {
        if ((await response(`http://127.0.0.1:${apiPort}/api/health-updated`))?.ok) {
          reloaded = true;
          break;
        }
        if (child.exitCode !== null) break;
        await setTimeout(100);
      }
      assert.ok(reloaded, `Contract edits did not reload the API:\n${output}`);
    } finally {
      await writeFile(contractsPath, contracts);
    }
    const httpPath = join(destination, "apps/api/src/http.ts");
    const http = await readFile(httpPath, "utf8");
    try {
      assert.ok(http.includes('openapiPath: "/docs/openapi.json"'));
      await writeFile(
        httpPath,
        http.replace(
          'openapiPath: "/docs/openapi.json"',
          'openapiPath: "/docs/openapi-updated.json"',
        ),
      );
      let reloaded = false;
      for (let attempt = 0; attempt < 300; attempt++) {
        const api = await response(`http://127.0.0.1:${apiPort}/docs/openapi-updated.json`);
        if (api?.ok) {
          reloaded = true;
          break;
        }
        if (child.exitCode !== null) break;
        await setTimeout(100);
      }
      assert.ok(reloaded, `API edits did not reload the server:\n${output}`);
    } finally {
      await writeFile(httpPath, http);
    }
    // Sending SIGINT to the group models Ctrl+C in a terminal.
    process.kill(-pid, "SIGINT");
    let stopped = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (!(await response(apiUrl)) && !(webUrl && (await response(webUrl)))) {
        stopped = true;
        break;
      }
      await setTimeout(100);
    }
    assert.ok(stopped, `Dev servers remained running after Ctrl+C:\n${output}`);
    // Closed ports are not enough: lingering watchers would keep the terminal busy.
    const exited = () => child.exitCode !== null || child.signalCode !== null;
    for (let attempt = 0; attempt < 100 && !exited(); attempt++) {
      await setTimeout(100);
    }
    assert.ok(exited(), `The dev command kept running after Ctrl+C:\n${output}`);
    console.log(
      `${packageManager} (${runtime} API): ${frontend ? "web, API, proxy" : "API"}, API/contract reload, and Ctrl+C verified`,
    );
  } finally {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

// Compiled components reference React's memo cache sentinel, which React's own runtime
// also defines. A client chunk without the runtime (React's production build links its
// errors to react.dev/errors) that references it proves the app's code was compiled.
async function assertReactCompiled(destination) {
  const output = join(destination, "apps/web/dist");
  const compiled = [];
  for (const file of await readdir(output, { recursive: true })) {
    if (!file.endsWith(".js") || file.split(sep).includes("server")) continue;
    const code = await readFile(join(output, file), "utf8");
    if (!code.includes("react.dev/errors") && code.includes("react.memo_cache_sentinel")) {
      compiled.push(file);
    }
  }
  assert.ok(compiled.length > 0, "The React Compiler did not transform the web app's chunks");
  console.log(`React Compiler verified in ${compiled.join(", ")}`);
}

async function smokeProduction(destination, runtime) {
  // Node with TypeScript support disabled proves production only loads bundled
  // JavaScript. Bun runs TypeScript natively, so it cannot prove that itself.
  await smokeApi(destination, process.execPath, ["--no-strip-types", "apps/api/dist/main.js"]);
  console.log("Node production API verified with TypeScript support disabled");
  if (runtime === "bun") {
    await smokeApi(destination, "bun", ["apps/api/dist/main.js"]);
    console.log("Bun production API verified");
  }
}

async function smokeApi(destination, command, args) {
  const port = await freePort();
  const child = spawn(command, args, {
    cwd: destination,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  child.on("error", (error) => {
    output += error.message;
  });
  try {
    for (let attempt = 0; attempt < 300; attempt++) {
      const api = await response(`http://127.0.0.1:${port}/api/health`);
      if (api?.ok) {
        assert.deepEqual(await api.json(), { ok: true, service: "api" });
        return;
      }
      if (child.exitCode !== null) break;
      await setTimeout(100);
    }
    assert.fail(`Production API (${command}) did not become ready:\n${output}`);
  } finally {
    child.kill("SIGKILL");
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve();
      else child.once("exit", resolve);
    });
  }
}

const selectedFrameworks = process.argv.slice(2);
const frameworkNames = selectedFrameworks.length ? selectedFrameworks : Object.keys(frameworks);
for (const framework of frameworkNames) getFramework(framework);

// Run outside the repository so generated apps cannot resolve its dependencies.
const directory = await mkdtemp(join(tmpdir(), "effect-generated-check-"));
try {
  for (const framework of frameworkNames) {
    // Common setups end to end; unit tests cover pnpm with the Bun runtime.
    for (const [packageManager, runtime] of [
      ["pnpm", "node"],
      ["bun", "node"],
      ["bun", "bun"],
    ]) {
      const project = await createProject(
        `${framework}-${packageManager}-${runtime}-app`,
        directory,
        { packageManager, framework, runtime },
      );
      console.log(
        `\nVerifying ${packageManager} project with ${runtime} API: ${project.destination}`,
      );
      // The Bun runtime only changes the API `dev`/`start` scripts and README text,
      // so lint, typecheck, tests, and the lockfile check would repeat Bun + Node.
      const runtimeOnly = runtime !== "node";
      if (packageManager === "bun") run("bun", ["install"], project.destination);
      if (!runtimeOnly) run(packageManager, ["install", "--frozen-lockfile"], project.destination);
      // Enforcement must survive consumers replacing the agent instructions.
      await rm(join(project.destination, "AGENTS.md"));
      const scripts = runtimeOnly
        ? ["format:check", "build"]
        : ["lint", "format:check", "typecheck", "test", "build"];
      for (const script of scripts) {
        run(packageManager, ["run", script], project.destination);
      }
      if (framework === "react" || framework === "tanstack-start") {
        await assertReactCompiled(project.destination);
      }
      await smokeProduction(project.destination, runtime);
      await smokeDev(packageManager, project.destination, framework, runtime);
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
