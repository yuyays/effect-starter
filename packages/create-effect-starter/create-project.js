import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getFramework, hasFrontend } from "./frameworks.js";
import { configurePackageManager, getPackageManager } from "./package-manager.js";
import { configureRuntime, getRuntime } from "./runtime.js";
import { sortImporterDependencies } from "./template-lockfile.js";

export async function createProject(directory, cwd = process.cwd(), options = {}) {
  const framework = options.framework ?? "react";
  getFramework(framework);
  const packageManager = options.packageManager ?? "pnpm";
  getPackageManager(packageManager);
  const runtime = options.runtime ?? "node";
  getRuntime(runtime);
  const destination = resolve(cwd, directory);
  const name = basename(destination);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || name.length > 100) {
    throw new Error(
      "Use a project name with lowercase letters, numbers, and hyphens (max 100 characters).",
    );
  }

  let existing;
  try {
    existing = await lstat(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    existing &&
    (!existing.isDirectory() || existing.isSymbolicLink() || (await readdir(destination)).length)
  ) {
    throw new Error(`Destination already exists and is not an empty directory: ${destination}`);
  }

  const template = fileURLToPath(new URL(`./template/${framework}/`, import.meta.url));
  // Check the packaged template before creating the destination.
  await readdir(template);
  await mkdir(destination, { recursive: true });
  await copy(template, destination, name);
  // The rename can reorder pnpm's importer keys; keep the format pnpm writes so the first
  // install leaves the shipped lockfile untouched.
  if (packageManager === "pnpm") {
    const lockfile = join(destination, "pnpm-lock.yaml");
    await writeFile(lockfile, sortImporterDependencies(await readFile(lockfile, "utf8")));
  }
  for (const app of hasFrontend(framework) ? ["api", "web"] : ["api"]) {
    const example = await readFile(join(destination, "apps", app, ".env.example"));
    await writeFile(join(destination, "apps", app, ".env"), example, { flag: "wx" });
  }
  await configurePackageManager(destination, packageManager);
  await configureRuntime(destination, runtime);
  // Placeholders are filled by the builder and by these two steps; a missed one would
  // otherwise ship as literal text in a project the user is about to read.
  await assertRendered(destination);
  return { destination, name, packageManager, framework, runtime };
}

const textFile = /\.(md|json|ya?ml|ts|tsx|js|jsx|mjs|cjs|html|css|example|toml)$/;

/** Fails when any generated text file still contains a `{{PLACEHOLDER}}`. */
async function assertRendered(directory, relative = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const label = join(relative, entry.name);
    if (entry.isDirectory()) {
      await assertRendered(path, label);
      continue;
    }
    if (!entry.isFile() || !textFile.test(entry.name)) continue;
    // Uppercase only: `${{ ... }}` in a workflow is an expression, not a placeholder.
    const unresolved = (await readFile(path, "utf8")).match(/\{\{[A-Z_]+\}\}/);
    if (unresolved) throw new Error(`${label} still contains ${unresolved[0]}`);
  }
}

async function copy(source, destination, name) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const target = join(
      destination,
      entry.name === "gitignore.template" ? ".gitignore" : entry.name,
    );
    const origin = join(source, entry.name);
    if (entry.isDirectory()) {
      await mkdir(target);
      await copy(origin, target, name);
    } else if (entry.isFile()) {
      let content = (await readFile(origin, "utf8")).replaceAll("effect-starter", name);
      if (entry.name === "package.json") {
        const manifest = JSON.parse(content);
        for (const field of [
          "dependencies",
          "devDependencies",
          "peerDependencies",
          "optionalDependencies",
        ]) {
          if (manifest[field]) {
            manifest[field] = Object.fromEntries(
              Object.entries(manifest[field]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
            );
          }
        }
        content = `${JSON.stringify(manifest, null, 2)}\n`;
      }
      await writeFile(target, content, { flag: "wx" });
    } else {
      throw new Error(`Unsupported template entry: ${origin}`);
    }
  }
}
