import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const template = new URL("./template/", import.meta.url);
const entries = [
  "apps",
  "packages/contracts",
  ".github",
  ".gitignore",
  "LICENSE",
  ".oxfmtrc.json",
  ".oxlintrc.json",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
];
const excluded = new Set(["node_modules", "dist", "coverage", ".git", ".DS_Store"]);

await rm(template, { recursive: true, force: true });
await mkdir(template, { recursive: true });
for (const entry of entries) {
  // npm omits .gitignore files from tarballs, so restore its name when scaffolding.
  const target = entry === ".gitignore" ? "gitignore.template" : entry;
  await cp(new URL(entry, root), new URL(target, template), {
    recursive: true,
    filter: (source) => {
      const name = source.split(/[\\/]/).at(-1);
      return !excluded.has(name) && (!name.startsWith(".env") || name === ".env.example");
    },
  });
}
await cp(new URL("./PROJECT_README.md", import.meta.url), new URL("README.md", template));
const lockfile = await readFile(new URL("pnpm-lock.yaml", root), "utf8");
await writeFile(
  new URL("pnpm-lock.yaml", template),
  lockfile.replace(/\n  packages\/create-effect-starter: \{\}\n/, ""),
);
