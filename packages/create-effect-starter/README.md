# create-effect-starter

Create a full-stack Effect v4, React, and Drizzle project with your own project name.
Requires Node.js 24.11+ and pnpm 11 or Bun 1.4.2.

After this package is published to npm:

```sh
pnpm create effect-starter my-app --package-manager pnpm
bunx create-effect-starter my-app --package-manager bun
```

Omit the directory for an interactive project-name prompt. Interactive creation
also prompts for pnpm or Bun unless `--package-manager` is supplied.
Noninteractive creation defaults to pnpm. Nested paths and existing
empty directories are supported. Nonempty directories are never overwritten.

The CLI renames workspace packages, imports, scripts, and the page title, and copies
environment examples into `.env` files. Follow the printed steps to configure your
database and install dependencies. It does not install dependencies or initialize Git. Bun projects generate their
lockfile on the first install; commit `bun.lock` before pushing to CI.
Bun manages packages and scripts; the API still uses Node.js.

## Local development

From the repository root:

```sh
pnpm create:app /tmp/my-effect-app
```

This builds the CLI's template from this repository and creates a separate
project at `/tmp/my-effect-app`; it does not run that project. To use it, change
into that directory, install dependencies, set its
`apps/api/.env` `DATABASE_URL` to a PostgreSQL database, and run `pnpm dev`.

To test or package the CLI itself:

```sh
pnpm --filter create-effect-starter test
pnpm --filter create-effect-starter pack --out /tmp/create-effect-starter.tgz
```

The packaged template is built from the repository before packing. It contains
only the apps, shared contracts, and project configuration; the generator itself,
local secrets, dependencies, build output, and repository history are excluded.
