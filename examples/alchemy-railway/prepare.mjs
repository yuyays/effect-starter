import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { parse } from "yaml";

const root = new URL("../../", import.meta.url);
const context = new URL("./.build/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("apps/api/package.json", root), "utf8"));
const lockfile = parse(await readFile(new URL("pnpm-lock.yaml", root), "utf8"));
const api = lockfile.importers["apps/api"];
const dependencies = {};

// Pin the runtime to the API's resolved direct dependencies, without workspace tools.
for (const name of [...Object.keys(manifest.dependencies), "drizzle-kit"]) {
  const dependency = api.dependencies[name] ?? api.devDependencies[name];
  const version = dependency?.version.split("(")[0];
  if (!version || !/^\d/.test(version)) throw new Error(`Cannot package dependency ${name}`);
  dependencies[name] = version;
}

// Fail before replacing an earlier context if the build or migrations are missing.
await readFile(new URL("apps/api/dist/main.js", root));
const migrations = new URL("./migrations/", import.meta.url);
const entries = await readdir(migrations, { withFileTypes: true });
const directories = entries.filter((entry) => entry.isDirectory());
if (directories.length === 0) throw new Error("Generate and commit a migration before building");
for (const directory of directories) {
  await readFile(new URL(`${directory.name}/migration.sql`, migrations));
}
const runtimeLock = await readFile(new URL("./runtime-package-lock.json", import.meta.url), "utf8");
const parsedLock = JSON.parse(runtimeLock);
const locked = parsedLock.packages?.[""]?.dependencies;
if (
  parsedLock.lockfileVersion !== 3 ||
  !locked ||
  Object.keys(locked).length !== Object.keys(dependencies).length ||
  Object.entries(dependencies).some(([name, version]) => locked[name] !== version)
) {
  throw new Error(
    "Runtime dependency versions changed; refresh runtime-package-lock.json (see README)",
  );
}
await rm(context, { recursive: true, force: true });
await mkdir(context, { recursive: true });
await writeFile(
  new URL("package.json", context),
  `${JSON.stringify({ private: true, type: "module", dependencies }, null, 2)}\n`,
);
await writeFile(new URL("package-lock.json", context), runtimeLock);
// An allowlist keeps local .env files, source, credentials, and Alchemy state out.
await cp(new URL("apps/api/dist/", root), new URL("dist/", context), { recursive: true });
await cp(migrations, new URL("migrations/", context), { recursive: true });
await cp(new URL("./migrate.config.ts", import.meta.url), new URL("drizzle.config.ts", context));
await cp(new URL("./Dockerfile", import.meta.url), new URL("Dockerfile", context));
