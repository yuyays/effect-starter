# effect-starter

Full-stack TypeScript starter with React, TanStack Router/Query, Effect v4, Drizzle, PostgreSQL, Oxlint, and Oxfmt.

Effect and its Node/PostgreSQL adapters use v4. Drizzle ORM and Kit are pinned to
`1.0.0-rc.5-5935859` because this build fixes compatibility with stable Effect v4.
The API uses Drizzle’s native `effect-postgres` integration through the `Database` service.
`@effect/tsgo` adds Effect diagnostics to `pnpm typecheck`. After installing
dependencies, select the workspace TypeScript version in your editor to use its
Effect diagnostics and refactors there too.

## Create your project

Requires Node.js 24+ and pnpm 11. From this repository, create a new project
with your own name:

```sh
pnpm scaffold ../my-app
cd ../my-app
pnpm install
```

`pnpm scaffold` first builds a template from this repository, then creates a
separate project in a sibling directory named `my-app`. It renames the packages,
imports, scripts, and page title. Choose another directory name for your app.
The generator also copies the `.env.example` files to `.env` files; it does not
install dependencies or create a database.

Set `DATABASE_URL` in `apps/api/.env` to a running PostgreSQL database. The
example URL points to a local database; a Supabase Postgres connection string
also works. Create the example `users` table, then start the app:

```sh
pnpm --filter @my-app/api db:generate
pnpm --filter @my-app/api db:migrate
pnpm dev
```

Web runs on `http://localhost:5173`. API runs on `http://localhost:3000`.
API docs are at `http://localhost:3000/docs`.

Once the generator is published to npm, `pnpm create effect-starter my-app`
will work without cloning this repository. See [the CLI README](packages/create-effect-starter/README.md)
for packaging instructions.

## Work on this starter

If you are developing the starter itself, stay in this repository:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `DATABASE_URL` in `apps/api/.env`, then run:

```sh
pnpm --filter @effect-starter/api db:generate
pnpm --filter @effect-starter/api db:migrate
pnpm dev
```

This repository retains the `effect-starter` package name; generated projects
get their own names.

## Verify changes

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```
