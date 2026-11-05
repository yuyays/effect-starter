import { parse } from "yaml";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const packageManagers = {
  pnpm: {
    run: "pnpm run",
    lockfileNote: "The included pnpm lockfile keeps dependencies on the starter's tested versions.",
  },
  bun: {
    version: "1.4.2",
    run: "bun run",
    lockfileNote:
      "The first `bun install` creates `bun.lock`. Commit it before pushing so CI can use frozen installs.",
  },
};

function replaceRequired(text, pattern, replacement) {
  // Fail generation if the repository workflow changes shape instead of emitting pnpm steps.
  if (!pattern.test(text)) throw new Error(`The CI workflow no longer matches ${pattern}`);
  return text.replace(pattern, replacement);
}

// Bun-only actions use the versions pinned in this repository's workflows.
function bunWorkflow(workflow, version) {
  const setup = [
    "      - uses: oven-sh/setup-bun@v2",
    "        with:",
    `          bun-version: ${version}`,
    "      - uses: actions/cache@v6",
    "        with:",
    "          path: ~/.bun/install/cache",
    "          key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}",
    "          restore-keys: bun-${{ runner.os }}-",
    "",
  ].join("\n");
  let result = replaceRequired(workflow, /^ {6}- uses: pnpm\/action-setup@\S+\n/m, setup);
  result = replaceRequired(result, /^ {10}cache: pnpm\n/m, "");
  result = replaceRequired(result, /- run: pnpm install /, "- run: bun install ");
  result = replaceRequired(result, /- run: pnpm (?!install )/g, "- run: bun run ");
  if (result.includes("pnpm")) throw new Error("The Bun CI workflow still references pnpm");
  return result;
}

export function getPackageManager(name) {
  if (!Object.hasOwn(packageManagers, name)) {
    throw new Error(`Unsupported package manager: ${name}. Choose pnpm or bun.`);
  }
  return packageManagers[name];
}

export function nextSteps(packageManager, { installed = false } = {}) {
  const manager = getPackageManager(packageManager);
  return [
    ...(installed ? [] : [`${packageManager} install`]),
    "# Set DATABASE_URL in apps/api/.env",
    `${manager.run} db:generate`,
    `${manager.run} db:migrate`,
    `${manager.run} dev`,
  ];
}

export async function configurePackageManager(destination, packageManager, framework = "react") {
  const manager = getPackageManager(packageManager);
  const manifestPath = join(destination, "package.json");
  let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // pnpm inherits the source workspace pin; Bun declares its selected manager.
  if (packageManager === "bun") manifest.packageManager = `bun@${manager.version}`;
  if (packageManager === "bun") {
    const workspaceConfig = parse(await readFile(join(destination, "pnpm-workspace.yaml"), "utf8"));
    manifest.overrides = {
      vite: workspaceConfig.overrides["vite@*"],
      vitest: workspaceConfig.overrides["vitest@*"],
    };
    // An explicit list replaces Bun's built-in trusted dependency list.
    manifest.devDependencies.vite = manifest.overrides.vite;
    const { engines, packageManager: pin, ...workspace } = manifest;
    manifest = {
      ...workspace,
      engines,
      packageManager: pin,
      trustedDependencies: [
        "@parcel/watcher",
        "esbuild",
        "msgpackr-extract",
        ...(framework === "vue" ? ["vue-demi"] : []),
      ],
    };
    await rm(join(destination, "pnpm-workspace.yaml"));
    await rm(join(destination, "pnpm-lock.yaml"));
    await writeFile(join(destination, "bunfig.toml"), "[install]\nminimumReleaseAge = 86400\n");
  }
  manifest.devDependencies = Object.fromEntries(
    Object.entries(manifest.devDependencies).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const readmePath = join(destination, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(
    readmePath,
    readme
      .replaceAll("{{PACKAGE_MANAGER}}", packageManager)
      .replaceAll("{{RUN}}", manager.run)
      .replaceAll("{{LOCKFILE_NOTE}}", manager.lockfileNote),
  );
  // pnpm projects keep the copied repository workflow, which Dependabot maintains.
  if (packageManager === "bun") {
    const workflowPath = join(destination, ".github/workflows/ci.yml");
    await writeFile(
      workflowPath,
      bunWorkflow(await readFile(workflowPath, "utf8"), manager.version),
    );
  }
}
