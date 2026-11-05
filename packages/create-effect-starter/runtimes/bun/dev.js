import { spawn } from "node:child_process";

// Runs the API with `bun --watch`. Bun drops a Ctrl+C that arrives while it restarts
// after a file change, so the signal is sent again, then Bun is stopped if it still runs.
const child = spawn("bun", ["--watch", "--no-clear-screen", "src/main.ts"], {
  stdio: "inherit",
});
let stopping = false;
let forced = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
  setTimeout(() => child.kill(signal), 1000).unref();
  setTimeout(() => {
    forced = true;
    child.kill("SIGKILL");
  }, 3000).unref();
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("error", (error) => {
  // Bun is missing or could not start; there is no process to stop.
  console.error(error);
  stopping = true;
  process.exitCode = 1;
});
// Exit codes for a program stopped by SIGINT or SIGTERM, as the API exits after Ctrl+C.
const stopped = new Set([0, 130, 143]);
child.on("exit", (code) => {
  // Ctrl+C is a clean stop unless Bun had to be killed or failed while stopping.
  if (forced) process.exitCode = 1;
  else if (stopping) process.exitCode = code === null || stopped.has(code) ? 0 : code;
  else process.exitCode = code || 1;
});
