import { posix } from "node:path";
import { parseAllDocuments } from "yaml";
import { hasFrontend } from "./frameworks.js";

const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies"];
const compareNames = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

// Write the parsed documents the way pnpm writes them. Round-tripping the AST keeps pnpm's
// quoting, flow collections, and blank lines; serializing the value graph would rewrite all of
// them, so a user's first `pnpm install` would reformat the shipped lockfile.
function emitDocuments(documents) {
  return documents
    .map((document) => document.toString({ lineWidth: 0, flowCollectionPadding: false }))
    .join("\n");
}

// pnpm sorts each importer's dependency names. Renaming the template to the project name can move
// a shared `@scope/contracts` package past its siblings, so restore pnpm's order.
export function sortImporterDependencies(source) {
  const documents = parseAllDocuments(source);
  const importers = documents.at(-1).get("importers");
  for (const importer of importers.items) {
    for (const field of dependencyFields) {
      importer.value
        .get(field)
        ?.items.sort((left, right) => compareNames(left.key.value, right.key.value));
    }
  }
  return emitDocuments(documents);
}

// pnpm 12 writes the pinned package manager as its own YAML document before the project graph,
// and a frozen install rejects a lockfile whose pin is missing. Keep every document and edit the
// graph in place, so generated projects install from the lockfile they ship.
export function templateLockfile(source, framework) {
  const documents = parseAllDocuments(source);
  const lockfile = documents.at(-1);
  const importerMap = lockfile.get("importers");
  const importers = new Map(importerMap.items.map((pair) => [pair.key.value, pair]));
  const web =
    framework === "react" ? "apps/web" : `packages/create-effect-starter/frontends/${framework}`;
  // Keep pnpm's sorted importer order so generated lockfiles stay stable.
  const workspaces = new Map([
    [".", "."],
    ["apps/api", "apps/api"],
    ...(hasFrontend(framework) ? [[web, "apps/web"]] : []),
    ["packages/contracts", "packages/contracts"],
  ]);
  const kept = [];
  for (const [sourcePath, destinationPath] of workspaces) {
    const importer = importers.get(sourcePath);
    if (!importer) throw new Error(`Missing ${sourcePath} in pnpm-lock.yaml. Run pnpm install.`);
    for (const field of dependencyFields) {
      for (const dependency of importer.value.get(field)?.items ?? []) {
        // Keep the scalar node so its quoting style survives the edit.
        const version = dependency.value.get("version", true);
        if (typeof version?.value !== "string" || !version.value.startsWith("link:")) continue;
        const target = posix.normalize(posix.join(sourcePath, version.value.slice(5)));
        const destination = workspaces.get(target);
        if (!destination)
          throw new Error(`Template dependency points outside its workspaces: ${target}`);
        version.value = `link:${posix.relative(destinationPath, destination)}`;
      }
    }
    if (destinationPath !== sourcePath) importer.key.value = destinationPath;
    kept.push(importer);
  }
  importerMap.items = kept;
  return emitDocuments(documents);
}
