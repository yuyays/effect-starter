import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("./", import.meta.url));
const compiler = fileURLToPath(
  new URL("./dist/effect-tsgo.cjs", import.meta.resolve("@effect/tsgo/package.json")),
);
const children = new Set();
let stopping = false;

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

function watch(args) {
  const child = spawn(process.execPath, args, { cwd, stdio: "inherit" });
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
}

process.on("SIGINT", () => stop(0, "SIGINT"));
process.on("SIGTERM", () => stop(0));

watch([compiler, "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"]);
watch(["--watch", "--watch-preserve-output", "--enable-source-maps", "dist/main.js"]);
