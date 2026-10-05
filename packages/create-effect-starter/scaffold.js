import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function scaffold(directory, cwd = process.cwd()) {
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

  const template = fileURLToPath(new URL("./template/", import.meta.url));
  // Check the packaged template before creating the destination.
  await readdir(template);
  await mkdir(destination, { recursive: true });
  await copy(template, destination, name);
  for (const app of ["api", "web"]) {
    const example = await readFile(join(destination, "apps", app, ".env.example"));
    await writeFile(join(destination, "apps", app, ".env"), example, { flag: "wx" });
  }
  return { destination, name };
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
