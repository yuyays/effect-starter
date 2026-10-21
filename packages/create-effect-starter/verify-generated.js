import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameworks, getFramework } from "./frameworks.js";
import { createProject } from "./create-project.js";

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

async function smokeDev(packageManager, destination, framework) {
  // Development must start from a clean checkout without prebuilt JavaScript.
  await rm(join(destination, "apps/api/dist"), { recursive: true, force: true });
  await rm(join(destination, "packages/contracts/dist"), { recursive: true, force: true });
  const apiPort = await freePort();
  const webPort = await freePort();
  // Match the IPv4 probes even when localhost resolves to IPv6 on CI.
  // Use private ports only in this disposable fixture, including its API proxy.
  const configPath = join(destination, "apps/web/vite.config.ts");
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    config
      .replace(/^\s*port: 5173,\n/m, "")
      .replace("server: {", `server: { host: "127.0.0.1", port: ${webPort}, strictPort: true,`)
      .replaceAll("http://localhost:3000", `http://127.0.0.1:${apiPort}`),
  );
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
  const webUrl = `http://127.0.0.1:${webPort}`;
  const apiUrl = `http://127.0.0.1:${apiPort}/api/health`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      const api = await response(apiUrl);
      const web = await response(webUrl);
      if (api?.ok && web?.ok) {
        assert.deepEqual(await api.json(), { ok: true, service: "api" });
        assert.match(
          await web.text(),
          framework === "tanstack-start"
            ? /TanStack Start, Effect Platform API/
            : /<div id="root">/,
        );
        const proxy = await fetch(`${webUrl}/api/health`);
        assert.deepEqual(await proxy.json(), { ok: true, service: "api" });
        ready = true;
        break;
      }
      if (child.exitCode !== null) break;
      await setTimeout(100);
    }
    assert.ok(ready, `Dev servers did not become ready:\n${output}`);
    // Change a contract route to verify compilation and Node dependency watching.
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
      if (!(await response(apiUrl)) && !(await response(webUrl))) {
        stopped = true;
        break;
      }
      await setTimeout(100);
    }
    assert.ok(stopped, `Dev servers remained running after Ctrl+C:\n${output}`);
    console.log(`${packageManager}: web, API, proxy, API/contract reload, and Ctrl+C verified`);
  } finally {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function smokeProduction(destination) {
  const port = await freePort();
  // Disable native TypeScript support to prove production only loads JavaScript.
  const child = spawn(process.execPath, ["--no-strip-types", "apps/api/dist/main.js"], {
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
        console.log("Node production API verified with TypeScript support disabled");
        return;
      }
      if (child.exitCode !== null) break;
      await setTimeout(100);
    }
    assert.fail(`Production API did not become ready:\n${output}`);
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
    for (const packageManager of ["pnpm", "bun"]) {
      const project = await createProject(`${framework}-${packageManager}-app`, directory, {
        packageManager,
        framework,
      });
      console.log(`\nVerifying ${packageManager} project: ${project.destination}`);
      if (packageManager === "bun") run("bun", ["install"], project.destination);
      run(packageManager, ["install", "--frozen-lockfile"], project.destination);
      for (const script of ["lint", "format:check", "typecheck", "test", "build"]) {
        run(packageManager, ["run", script], project.destination);
      }
      await smokeProduction(project.destination);
      await smokeDev(packageManager, project.destination, framework);
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
