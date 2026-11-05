import { spawn } from "node:child_process";

// Runs the API with `bun --watch`. Bun drops a Ctrl+C that arrives while it restarts
// after a file change, so the signal is sent again, then Bun is stopped if it still runs.
const child = spawn("bun", ["--watch", "--no-clear-screen", "src/main.ts"], {
  stdio: "inherit",
});
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  setTimeout(() => child.kill(signal), 1000).unref();
  setTimeout(() => child.kill("SIGKILL"), 3000).unref();
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = stopping ? 0 : code || 1;
});
