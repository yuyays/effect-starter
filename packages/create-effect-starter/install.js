import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPackageManager } from "./package-manager.js";

export async function dependencySummary(destination) {
  const workspaces = [
    ["Root tooling", "."],
    ["Web", "apps/web"],
    ["API", "apps/api"],
    ["Shared contracts", "packages/contracts"],
  ];
  const sections = await Promise.all(
    workspaces.map(async ([label, directory]) => {
      const manifest = JSON.parse(
        await readFile(join(destination, directory, "package.json"), "utf8"),
      );
      const packages = new Map();
      for (const field of ["dependencies", "devDependencies"]) {
        for (const [name, version] of Object.entries(manifest[field] ?? {})) {
          if (!version.startsWith("workspace:")) packages.set(name, version);
        }
      }
      return `${label}:\n${[...packages]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, version]) => `  ${name} ${version}`)
        .join("\n")}`;
    }),
  );
  return sections.join("\n\n");
}

export async function installDependencies(destination, packageManager) {
  getPackageManager(packageManager);
  await new Promise((resolve, reject) => {
    const child = spawn(packageManager, ["install"], {
      cwd: destination,
      stdio: "inherit",
      // Windows package-manager launchers can be .cmd files. Arguments are fixed.
      shell: process.platform === "win32",
    });
    child.once("error", (error) => {
      reject(
        new Error(
          error.code === "ENOENT"
            ? `${packageManager} was not found on PATH.`
            : `Could not run ${packageManager} install: ${error.message}`,
        ),
      );
    });
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${packageManager} install ${signal ? `was interrupted (${signal})` : `exited with code ${code}`}.`,
          ),
        );
    });
  });
}
