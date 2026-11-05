import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bunVersion } from "./package-manager.js";

// The API runtime is independent of the package manager. Vite+, lint,
// typecheck, and tests always run on Node.js; only the API process changes.
export const runtimes = {
  node: {
    label: "Node.js",
    bin: "node",
    readme: "The API runs on Node.js.",
  },
  bun: {
    label: "Bun",
    bin: "bun",
    version: bunVersion,
    readme: `The API runs on Bun ${bunVersion}+; Vite+ and the checks run on Node.js.`,
  },
};

export function getRuntime(name) {
  if (!Object.hasOwn(runtimes, name)) {
    throw new Error(`Unsupported runtime: ${name}. Choose node or bun.`);
  }
  return runtimes[name];
}

export async function configureRuntime(destination, runtime) {
  const selected = getRuntime(runtime);
  if (runtime === "bun") {
    const manifestPath = join(destination, "apps/api/package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const dev = "node --watch --watch-preserve-output src/main.ts";
    if (manifest.scripts.dev !== dev) {
      throw new Error(
        `Cannot select the Bun runtime in the API dev script: ${manifest.scripts.dev}`,
      );
    }
    // Both runtimes run the TypeScript source directly and restart on changes; the
    // runner works around Bun dropping Ctrl+C during a restart.
    await copyFile(
      new URL("./runtimes/bun/dev.js", import.meta.url),
      join(destination, "apps/api/dev.js"),
    );
    manifest.scripts.dev = "node dev.js";
    manifest.scripts.start = `bun dist/main.js`;
    manifest.engines = { ...manifest.engines, bun: `>=${bunVersion}` };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const readmePath = join(destination, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(
    readmePath,
    readme
      .replaceAll("{{RUNTIME_NOTE}}", selected.readme)
      .replaceAll("{{RUNTIME_BIN}}", selected.bin)
      .replaceAll("{{RUNTIME}}", selected.label),
  );
}
