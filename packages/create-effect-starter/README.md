# create-effect-starter

Create a full-stack Effect v4, React, Drizzle, and Vite+ project with your own name.
Requires Node.js 24.11+ and pnpm 11 or Bun 1.4.2. The API runs on Node.js with
either package manager.

**This package is not published to npm yet.** Registry commands such as
`pnpm create effect-starter` and `bunx create-effect-starter` currently fail.
Use the local generator from a checkout of this repository.

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
