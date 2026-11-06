import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const workspaces = ["apps", "packages"].flatMap((group) =>
  readdirSync(join(root, group), { withFileTypes: true }).flatMap((entry) => {
    const directory = join(root, group, entry.name);
    const manifest = join(directory, "package.json");
    if (!entry.isDirectory() || !existsSync(manifest)) return [];
    return [{ directory, group, ...JSON.parse(readFileSync(manifest, "utf8")) }];
  }),
);

function workspaceAt(filename) {
  return workspaces.find(
    ({ directory }) => filename === directory || filename.startsWith(directory + sep),
  );
}

// Read the package's public subpaths rather than duplicating its export map in lint config.
function isExported(workspace, subpath) {
  const exports = workspace.exports;
  if (exports === null) return false;
  if (exports === undefined || typeof exports === "string") return subpath === ".";
  const keys = Object.keys(exports);
  if (keys.length === 0) return false;
  if (!keys.some((key) => key.startsWith("."))) return subpath === ".";
  if (Object.hasOwn(exports, subpath)) return exports[subpath] !== null;
  const pattern = keys
    .filter((key) => {
      const star = key.indexOf("*");
      return (
        star !== -1 &&
        subpath.length >= key.length &&
        subpath.startsWith(key.slice(0, star)) &&
        subpath.endsWith(key.slice(star + 1))
      );
    })
    .sort((a, b) => b.indexOf("*") - a.indexOf("*") || b.length - a.length)[0];
  return pattern !== undefined && exports[pattern] !== null;
}

export const workspaceImports = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const filename = resolve(context.filename);
    const owner = workspaceAt(filename);
    if (!owner) return {};

    const check = (node) => {
      if (typeof node?.value !== "string") return;
      const source = node.value.split(/[?#]/)[0];
      const relative = source.startsWith(".") || source.startsWith("/") || source.startsWith("@/");
      const target = relative
        ? workspaceAt(
            source.startsWith("@/")
              ? resolve(owner.directory, "src", source.slice(2))
              : resolve(dirname(filename), source),
          )
        : workspaces.find(({ name }) => source === name || source.startsWith(name + "/"));
      if (!target || owner === target) return;

      let message;
      if (target.group === "apps") {
        message =
          "Keep application implementations private. Share contracts through a package or call the API.";
      } else if (relative) {
        message =
          "Import another workspace through its package name and public exports, not its source path.";
      } else {
        const subpath = source === target.name ? "." : "." + source.slice(target.name.length);
        if (!isExported(target, subpath))
          message = "Import a public subpath declared in the workspace package's exports.";
      }
      if (message) context.report({ node, message });
    };

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      TSImportType: (node) => check(node.source),
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require")
          check(node.arguments[0]);
      },
    };
  },
};
