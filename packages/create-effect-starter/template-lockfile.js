import { posix } from "node:path";
import { parseAllDocuments } from "yaml";
import { hasFrontend } from "./frameworks.js";

const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies"];
const snapshotFields = ["dependencies", "optionalDependencies"];
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

// A snapshot key is `name@version` plus one `(peer@version)` suffix per resolved peer set.
function nameEnd(key) {
  return key.startsWith("@") ? key.indexOf("@", 1) : key.indexOf("@");
}

function baseKey(key) {
  const end = nameEnd(key);
  return `${key.slice(0, end)}@${key.slice(end + 1).split("(")[0]}`;
}

// The same base can appear once per peer set, so every variant is indexed.
function snapshotIndex(snapshots) {
  const index = new Map();
  for (const pair of snapshots.items) {
    const base = baseKey(pair.key.value);
    index.set(base, [...(index.get(base) ?? []), pair.key.value]);
  }
  return index;
}

// Importer entries store the alias target in `specifier` and a bare version in `version`.
function dependencyName(dependency) {
  const specifier = dependency.value.get("specifier", true)?.value;
  if (typeof specifier === "string" && specifier.startsWith("npm:")) {
    const alias = specifier.slice("npm:".length);
    const at = alias.lastIndexOf("@");
    return at > 0 ? alias.slice(0, at) : alias;
  }
  return dependency.key.value;
}

function snapshotKeys(index, name, version) {
  if (typeof version !== "string" || version.startsWith("link:")) return [];
  const direct = index.get(`${name}@${version.split("(")[0]}`);
  if (direct) return direct;
  // Snapshot edges record the resolved package id for aliases, e.g. `vite: '@scope/core@1.0.0'`.
  return nameEnd(version) > 0 ? (index.get(baseKey(version)) ?? []) : [];
}

function reachableSnapshots(importers, index, snapshots) {
  const reachable = new Set();
  const pending = [];
  for (const importer of importers) {
    for (const field of dependencyFields) {
      for (const dependency of importer.value.get(field)?.items ?? []) {
        const version = dependency.value.get("version", true)?.value;
        pending.push(...snapshotKeys(index, dependencyName(dependency), version));
      }
    }
  }
  while (pending.length > 0) {
    const key = pending.pop();
    if (reachable.has(key)) continue;
    reachable.add(key);
    for (const field of snapshotFields) {
      for (const dependency of snapshots.get(key).get(field)?.items ?? []) {
        pending.push(...snapshotKeys(index, dependency.key.value, dependency.value?.value));
      }
    }
  }
  return reachable;
}

// The repository lockfile resolves every workspace, so a generated project would otherwise ship
// the other templates' packages. Keep what the kept importers reach and drop the rest.
function pruneUnreachablePackages(lockfile, importers) {
  const snapshots = lockfile.get("snapshots");
  if (!snapshots) return;
  const index = snapshotIndex(snapshots);
  const reachable = reachableSnapshots(importers, index, snapshots);
  const reachableBases = new Set([...reachable].map(baseKey));
  const snapshotBases = new Set(snapshots.items.map((pair) => baseKey(pair.key.value)));
  snapshots.items = snapshots.items.filter((pair) => reachable.has(pair.key.value));
  const packages = lockfile.get("packages");
  // Entries without a snapshot describe a resolution this graph does not use; leave them alone.
  if (packages) {
    packages.items = packages.items.filter((pair) => {
      const base = baseKey(pair.key.value);
      return reachableBases.has(base) || !snapshotBases.has(base);
    });
  }
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
  pruneUnreachablePackages(lockfile, kept);
  return emitDocuments(documents);
}
