# create-effect-starter

Create a full-stack Effect v4, React, Drizzle, and Vite+ project with your own name.
Requires Node.js 24.11+ and pnpm 11 or Bun 1.4.2. The API runs on Node.js with
either package manager.

This package is distributed through GitHub Releases without publishing to npm.
Registry commands such as `pnpm create effect-starter` and
`bunx create-effect-starter` are not supported.

## Download and run

Once the first release is published, run the generator directly from its
GitHub Release archive:

```sh
npx --yes https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz my-app --package-manager pnpm
```

Use `--package-manager bun` for a Bun project. No npm account, global install,
or starter checkout is required. Then change into `my-app` and follow its README.

For a specific version, replace `latest/download` with `download/<tag>` in the
URL. Use the attached `.tgz`, since GitHub's automatic source archives do
not contain the built template.

You can also download `create-effect-starter.tgz` from
[Releases](https://github.com/yuyays/effect-starter/releases), extract it, and
run the CLI with Node.js. On macOS/Linux:

```sh
mkdir effect-starter-cli
tar -xzf create-effect-starter.tgz -C effect-starter-cli
node effect-starter-cli/package/cli.js my-app --package-manager pnpm
```

## Create a project locally

From the repository root, choose one command:

```sh
pnpm create:app ../my-app --package-manager pnpm
```

```sh
bun run create:app ../my-app --package-manager bun
```

These commands build the template and create a separate sibling project. They
do not start the app. Next, change into `../my-app` and follow its generated
README to install dependencies, configure PostgreSQL, run migrations, and start
the servers.

Omit the directory for an interactive project-name prompt. Omit
`--package-manager` to prompt for pnpm or Bun. Noninteractive creation defaults
to pnpm. Nested paths and existing empty directories are supported; nonempty
directories are never overwritten.

The CLI renames workspace packages, imports, scripts, and the page title, and
copies environment examples into `.env` files. It does not install dependencies,
create a database, or initialize Git.

pnpm projects include a lockfile. Bun projects generate `bun.lock` on their first
install. Commit the selected lockfile before pushing to your own repository,
because generated CI uses frozen installs.

## Test or package the CLI

From the repository root:

```sh
pnpm install
pnpm --filter create-effect-starter test
pnpm --filter create-effect-starter pack --out /tmp/create-effect-starter.tgz
```

Packing builds the template from this repository. The generated app template
contains only the apps, shared contracts, and project configuration. Local
secrets, dependencies, build output, repository history, and the generator's
source files are excluded from generated apps.

## Publish a GitHub Release

Commit the changes and push a version tag, such as `v0.1.0`, pointing at that
commit. In GitHub Actions, run **Release generator** and enter the existing tag.
The workflow tests and packs the generator, then creates a release with
`create-effect-starter.tgz` attached. It does not publish to npm. The workflow
must be on the default branch before it can be run manually.

For a manual release from a checkout of the tagged commit, use the test and
pack commands above, then:

```sh
gh release create v0.1.0 /tmp/create-effect-starter.tgz --verify-tag --generate-notes
```

Choose the tag for the version being released. Generated apps include their own
CI workflow and exclude this repository's release workflow.
