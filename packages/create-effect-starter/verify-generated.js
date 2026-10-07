import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

async function smokeDev(packageManager, destination) {
  const apiPort = await freePort();
  const webPort = await freePort();
  // Use private ports only in this disposable fixture, including its API proxy.
  const configPath = join(destination, "apps/web/vite.config.ts");
  const config = await readFile(configPath, "utf8");
  await writeFile(
    configPath,
    config
      .replace("server: {", `server: { port: ${webPort}, strictPort: true,`)
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
    for (let attempt = 0; attempt < 100; attempt++) {
      const api = await response(apiUrl);
      const web = await response(webUrl);
      if (api?.ok && web?.ok) {
        assert.deepEqual(await api.json(), { ok: true, service: "api" });
        assert.match(await web.text(), /<div id="root">/);
        const proxy = await fetch(`${webUrl}/api/health`);
        assert.deepEqual(await proxy.json(), { ok: true, service: "api" });
        ready = true;
        break;
      }
      if (child.exitCode !== null) break;
      await setTimeout(100);
    }
    assert.ok(ready, `Dev servers did not become ready:\n${output}`);
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
    console.log(`${packageManager}: web, API, proxy, and Ctrl+C verified`);
  } finally {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

// Run outside the repository so generated apps cannot resolve its dependencies.
const directory = await mkdtemp(join(tmpdir(), "effect-generated-check-"));
try {
  for (const packageManager of ["pnpm", "bun"]) {
    const project = await createProject(`${packageManager}-app`, directory, { packageManager });
    console.log(`\nVerifying ${packageManager} project: ${project.destination}`);
    if (packageManager === "bun") run("bun", ["install"], project.destination);
    run(packageManager, ["install", "--frozen-lockfile"], project.destination);
    for (const script of ["lint", "format:check", "typecheck", "test", "build"]) {
      run(packageManager, ["run", script], project.destination);
    }
    await smokeDev(packageManager, project.destination);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
