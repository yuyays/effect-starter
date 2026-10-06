#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { scaffold } from "./scaffold.js";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "Usage: create-effect-starter [directory]\n\nCreate an Effect v4 + React + Drizzle project. Requires Node.js 24+ and pnpm.",
  );
} else {
  try {
    if (args.length > 1 || args.some((arg) => arg.startsWith("-"))) {
      throw new Error("Usage: create-effect-starter [directory]");
    }
    let directory = args[0];
    if (!directory) {
      if (!stdin.isTTY)
        throw new Error("Provide a project directory: create-effect-starter my-app");
      const prompt = createInterface({ input: stdin, output: stdout });
      try {
        directory =
          (await prompt.question("Project name (my-effect-app): ")).trim() || "my-effect-app";
      } finally {
        prompt.close();
      }
    }
    const project = await scaffold(directory);
    console.log(
      `\nCreated ${project.name} at ${project.destination}\n\nNext steps:\n  cd ${JSON.stringify(directory)}\n  pnpm install\n  # Set DATABASE_URL in apps/api/.env\n  pnpm --filter @${project.name}/api db:generate\n  pnpm --filter @${project.name}/api db:migrate\n  pnpm dev`,
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
