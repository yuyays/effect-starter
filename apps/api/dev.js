import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("./", import.meta.url));
const compiler = fileURLToPath(
  new URL("./dist/effect-tsgo.cjs", import.meta.resolve("@effect/tsgo/package.json")),
);
// `node dev.js bun` runs the API on Bun; the compiler always runs on Node.js.
const runtimes = {
  node: [process.execPath, ["--watch", "--watch-preserve-output", "--enable-source-maps"]],
  bun: ["bun", ["--watch", "--no-clear-screen"]],
};
const runtime = runtimes[process.argv[2] ?? "node"];
if (!runtime) throw new Error(`Unsupported API runtime: ${process.argv[2]}. Use node or bun.`);
const watchingMessage = "Watching for file changes";
const children = new Set();
let stopping = false;
let apiStarted = false;

function stop(code, signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill(signal);
  // A watcher should not keep the other process alive after shutdown.
  const timeout = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 3000);
  timeout.unref();
}

function watch(command, args, stdio = "inherit") {
  const child = spawn(command, args, { cwd, stdio });
  children.add(child);
  child.on("error", (error) => {
    console.error(error);
    children.delete(child);
    stop(1);
  });
  child.on("exit", (code) => {
    children.delete(child);
    if (!stopping) stop(code || 1);
  });
  return child;
}

function startApi() {
  if (apiStarted || stopping) return;
  apiStarted = true;
  clearTimeout(fallback);
  const [command, args] = runtime;
  watch(command, [...args, "dist/main.js"]);
}

process.on("SIGINT", () => stop(0, "SIGINT"));
process.on("SIGTERM", () => stop(0));

const tsc = watch(
  process.execPath,
  [compiler, "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"],
  ["inherit", "pipe", "inherit"],
);
// Edits saved before the compiler's first watch pass are lost, so the API starts
// after it: once the API responds, source changes are picked up.
let pending = "";
tsc.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  if (apiStarted) return;
  // Keep a short tail so a message split across chunks still matches.
  pending = (pending + chunk).slice(-watchingMessage.length * 2);
  if (pending.includes(watchingMessage)) startApi();
});
// Start anyway if the compiler's wording changes, rather than never serving.
const fallback = setTimeout(() => {
  console.warn(`Compiler did not report "${watchingMessage}"; starting the API anyway.`);
  startApi();
}, 30_000);
fallback.unref();
