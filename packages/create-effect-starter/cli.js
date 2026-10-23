#!/usr/bin/env node
import { stdin, stdout } from "node:process";
import { cancel, confirm, intro, isCancel, note, select, text } from "@clack/prompts";
import { createProject } from "./create-project.js";
import { frameworks, getFramework } from "./frameworks.js";
import { dependencySummary, installDependencies } from "./install.js";
import { getPackageManager, nextSteps } from "./package-manager.js";

const usage =
  "Usage: create-effect-starter [directory] [--framework react|tanstack-start|vue] [--package-manager pnpm|bun] [--install|--no-install]";
const args = process.argv.slice(2);

async function answer(prompt) {
  const value = await prompt;
  if (isCancel(value)) {
    cancel("Project creation cancelled.");
    process.exit(0);
  }
  return value;
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    `${usage}\n\nCreate an Effect v4 + Drizzle + Vite+ project. Requires Node.js 24.11+.\nChoose your starter and package manager interactively with arrow keys and Enter.\nNoninteractive defaults: React and pnpm, without installation.\n--install runs dependency installation; --no-install skips the installation prompt.`,
  );
} else {
  try {
    let directory;
    let packageManager;
    let framework;
    let install;
    const interactive = stdin.isTTY && stdout.isTTY;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index];
      if (arg === "--package-manager" && !packageManager) {
        packageManager = args[++index];
        if (!packageManager) throw new Error(usage);
        getPackageManager(packageManager);
      } else if (arg === "--framework" && !framework) {
        framework = args[++index];
        if (!framework) throw new Error(usage);
        getFramework(framework);
      } else if (arg === "--install" && install === undefined) {
        install = true;
      } else if (arg === "--no-install" && install === undefined) {
        install = false;
      } else if (!arg.startsWith("-") && !directory) {
        directory = arg;
      } else {
        throw new Error(usage);
      }
    }
    if (!directory && !stdin.isTTY) {
      throw new Error("Provide a project directory: create-effect-starter my-app");
    }
    if (interactive && (!directory || !framework || !packageManager)) {
      intro("Create Effect Starter");
      directory ??= await answer(
        text({
          message: "Project name or directory",
          placeholder: "my-effect-app",
          defaultValue: "my-effect-app",
        }),
      );
      framework ??= await answer(
        select({
          message: "Choose your starter",
          initialValue: "react",
          options: Object.entries(frameworks).map(([value, { label, hint }]) => ({
            value,
            label,
            hint,
          })),
        }),
      );
      packageManager ??= await answer(
        select({
          message: "Package manager for dependency installation (Vite+ provides the dev tools)",
          initialValue: "pnpm",
          options: [
            { value: "pnpm", label: "pnpm", hint: "recommended" },
            { value: "bun", label: "Bun" },
          ],
        }),
      );
    }
    if (!directory) throw new Error("Provide a project directory: create-effect-starter my-app");
    packageManager ??= "pnpm";
    framework ??= "react";
    const project = await createProject(directory, process.cwd(), { packageManager, framework });
    console.log(
      `\nCreated ${project.name} (${getFramework(framework).label}) at ${project.destination}`,
    );
    const summary = await dependencySummary(project.destination);
    if (interactive) note(summary, "Packages to install (direct dependencies and dev tools)");
    else console.log(`\nPackages to install (direct dependencies and dev tools):\n${summary}`);
    console.log("The package manager also installs their transitive dependencies.");

    if (install === undefined && interactive) {
      const choice = await confirm({
        message: `Run ${packageManager} install now in ${project.destination}?`,
        initialValue: true,
      });
      if (isCancel(choice)) {
        cancel("Installation skipped. Your generated project has been kept.");
        install = false;
      } else {
        install = choice;
      }
    }
    let installed = false;
    if (install) {
      console.log(`\nRunning ${packageManager} install...`);
      try {
        await installDependencies(project.destination, packageManager);
        installed = true;
        console.log("\nDependencies installed.");
      } catch (error) {
        console.error(
          `\nInstallation failed: ${error.message} Your generated project has been kept.`,
        );
        process.exitCode = 1;
      }
    }
    console.log(
      "\nWith global Vite+, use vp install if needed, then vp run db:generate, vp run db:migrate, and vp run dev. Set DATABASE_URL in apps/api/.env first.\nWithout global Vite+, use the package-manager commands below.",
    );
    console.log(
      `\nNext steps:\n  cd ${JSON.stringify(directory)}\n  ${nextSteps(packageManager, { installed }).join("\n  ")}${packageManager === "bun" ? "\n  # Commit bun.lock before pushing to CI" : ""}`,
    );
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
