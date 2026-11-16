import { posix } from "node:path";
import { parseAllDocuments, stringify } from "yaml";
import { hasFrontend } from "./frameworks.js";

// pnpm 12 writes the pinned package manager as its own YAML document before the project graph,
// and a frozen install rejects a lockfile whose pin is missing. Keep every document, rewriting
// only the graph, so generated projects install from the lockfile they ship.
export function templateLockfile(source, framework) {
  const documents = parseAllDocuments(source).map((document) => document.toJS());
  const lockfile = documents.at(-1);
  const web =
    framework === "react" ? "apps/web" : `packages/create-effect-starter/frontends/${framework}`;
  // Keep pnpm's sorted importer order so generated lockfiles stay stable.
  const workspaces = new Map([
    [".", "."],
    ["apps/api", "apps/api"],
    ...(hasFrontend(framework) ? [[web, "apps/web"]] : []),
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
  return documents.map((document) => `---\n${stringify(document, { lineWidth: 0 })}`).join("");
}
