import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const packageManagers = {
  pnpm: {
    version: "11.7.0",
    run: "pnpm run",
    setup: "      - uses: pnpm/action-setup@v5\n",
    cache: "          cache: pnpm\n",
    lockfileNote: "The included pnpm lockfile keeps dependencies on the starter's tested versions.",
  },
  bun: {
    version: "1.4.2",
    run: "bun run",
    setup: "      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: 1.4.2\n",
    cache: "",
    lockfileNote:
      "The first `bun install` creates `bun.lock`. Commit it before pushing so CI can use frozen installs.",
  },
};

export function getPackageManager(name) {
  if (!Object.hasOwn(packageManagers, name)) {
    throw new Error(`Unsupported package manager: ${name}. Choose pnpm or bun.`);
  }
  return packageManagers[name];
}

export function nextSteps(packageManager) {
  const manager = getPackageManager(packageManager);
  return [
    `${packageManager} install`,
    "# Set DATABASE_URL in apps/api/.env",
    `${manager.run} db:generate`,
    `${manager.run} db:migrate`,
    `${manager.run} dev`,
  ];
}

export async function configurePackageManager(destination, packageManager) {
  const manager = getPackageManager(packageManager);
  const manifestPath = join(destination, "package.json");
  let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.packageManager = `${packageManager}@${manager.version}`;
  if (packageManager === "bun") {
    manifest.overrides = {
      vite: "npm:@voidzero-dev/vite-plus-core@1.0.0",
      vitest: "5.0.1",
    };
    // An explicit list replaces Bun's built-in trusted dependency list.
    manifest.devDependencies.vite = manifest.overrides.vite;
    const { engines, packageManager: pin, ...workspace } = manifest;
    manifest = {
      ...workspace,
      engines,
      packageManager: pin,
      trustedDependencies: ["@parcel/watcher", "esbuild", "msgpackr-extract"],
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
  await writeFile(
    join(destination, ".github/workflows/ci.yml"),
    `name: CI\n\non:\n  pull_request:\n  push:\n    branches: [main]\n\njobs:\n  checks:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v5\n${manager.setup}      - uses: actions/setup-node@v6\n        with:\n          node-version: 24\n${manager.cache}      - run: ${packageManager} install --frozen-lockfile\n      - run: ${manager.run} lint\n      - run: ${manager.run} format:check\n      - run: ${manager.run} typecheck\n      - run: ${manager.run} test\n      - run: ${manager.run} build\n`,
  );
}
