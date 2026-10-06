# effect-starter

Full-stack TypeScript starter with React, TanStack Router/Query, Effect v4, Drizzle, PostgreSQL, Oxlint, and Oxfmt.

Effect and its Node/PostgreSQL adapters use v4. Drizzle ORM and Kit are pinned to
`1.0.0-rc.5-5935859` because this build fixes compatibility with stable Effect v4.
The API uses Drizzle’s native `effect-postgres` integration through the `Database` service.

## Setup

### Working on this repository

```sh
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `DATABASE_URL` in `apps/api/.env` to a PostgreSQL connection string, then run
`pnpm dev`.
The example points to a local database; a Supabase Postgres connection string also works.
You need a running database at that address. The web app uses the API's database connection.

Web runs on `http://localhost:5173`. API runs on `http://localhost:3000`. API docs are at `http://localhost:3000/docs`.

### Creating a separate project from this starter

The optional `create-effect-starter` CLI copies this starter into a new directory
and renames the workspace packages, imports, scripts, and page title. To try it
from this repository before publishing the package:

```sh
pnpm --filter create-effect-starter build
node packages/create-effect-starter/cli.js /tmp/my-app
```

The first command builds the CLI's template from this repository. The second
creates a new project at `/tmp/my-app`; it does not start the app or change this
repository. Then run `cd /tmp/my-app` and `pnpm install`, set `DATABASE_URL` in
`apps/api/.env`, and run `pnpm dev`. The CLI creates the `.env` files from the
examples but does not install dependencies or create a database.

Once the package is published to npm, `pnpm create effect-starter my-app` will
replace those two commands. See [the CLI README](packages/create-effect-starter/README.md)
for packaging instructions.

## Scripts

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @effect-starter/api db:generate
pnpm --filter @effect-starter/api db:migrate
```
