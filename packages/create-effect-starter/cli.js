#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createProject } from "./create-project.js";
import { getPackageManager, nextSteps } from "./package-manager.js";

const usage = "Usage: create-effect-starter [directory] [--package-manager pnpm|bun]";
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    `${usage}\n\nCreate an Effect v4 + React + Drizzle + Vite+ project. Requires Node.js 24.11+.\nPackage manager defaults to pnpm in noninteractive mode.`,
  );
} else {
  try {
    let directory;
    let packageManager;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === "--package-manager" && !packageManager) {
        packageManager = args[++index];
        if (!packageManager) throw new Error(usage);
        getPackageManager(packageManager);
      } else if (!arg.startsWith("-") && !directory) {
        directory = arg;
      } else {
        throw new Error(usage);
      }
    }
    if (!directory && !stdin.isTTY) {
      throw new Error("Provide a project directory: create-effect-starter my-app");
    }
    if (stdin.isTTY && (!directory || !packageManager)) {
      const prompt = createInterface({ input: stdin, output: stdout });
      try {
        directory ??=
          (await prompt.question("Project name (my-effect-app): ")).trim() || "my-effect-app";
        packageManager ??=
          (await prompt.question("Package manager (pnpm/bun; default pnpm): ")).trim() || "pnpm";
      } finally {
        prompt.close();
      }
    }
    packageManager ??= "pnpm";
    const project = await createProject(directory, process.cwd(), { packageManager });
    console.log(
      `\nCreated ${project.name} at ${project.destination}\n\nNext steps:\n  cd ${JSON.stringify(directory)}\n  ${nextSteps(packageManager).join("\n  ")}${packageManager === "bun" ? "\n  # Commit bun.lock before pushing to CI" : ""}`,
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
