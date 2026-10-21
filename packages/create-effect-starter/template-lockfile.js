import { posix } from "node:path";
import { parse, stringify } from "yaml";

// Select only the generated workspaces from the shared, bot-maintained lockfile.
export function templateLockfile(source, framework) {
  const lockfile = parse(source);
  const web =
    framework === "react" ? "apps/web" : `packages/create-effect-starter/frontends/${framework}`;
  const workspaces = new Map([
    [".", "."],
    ["apps/api", "apps/api"],
    [web, "apps/web"],
    ["packages/contracts", "packages/contracts"],
  ]);
  const importers = {};
  for (const [sourcePath, destinationPath] of workspaces) {
    const importer = lockfile.importers[sourcePath];
    if (!importer) throw new Error(`Missing ${sourcePath} in pnpm-lock.yaml. Run pnpm install.`);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const dependency of Object.values(importer[field] ?? {})) {
        if (!dependency.version.startsWith("link:")) continue;
        const target = posix.normalize(posix.join(sourcePath, dependency.version.slice(5)));
        const destination = workspaces.get(target);
        if (!destination)
          throw new Error(`Template dependency points outside its workspaces: ${target}`);
        dependency.version = `link:${posix.relative(destinationPath, destination)}`;
      }
    }
    importers[destinationPath] = importer;
  }
  lockfile.importers = importers;
  return stringify(lockfile, { lineWidth: 0 });
}
