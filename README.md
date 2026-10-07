# effect-starter

Full-stack TypeScript starter with React, TanStack Router/Query, Effect v4,
Drizzle, PostgreSQL, and Vite+ (Vite, Vitest, Oxlint, and Oxfmt).

Licensed under the [MIT License](LICENSE).

## Start a new project

This path is for building your own app from the starter. The local generator
creates a separate project; it does not change this repository. To work on the
starter itself, skip to [Develop the starter](#develop-the-starter).

The generator is **not published to npm yet**, so `pnpm create effect-starter`
and `bunx create-effect-starter` currently return a registry error.

You need:

- Node.js 24.11+ for the generator, tooling, and API, even when using Bun.
- pnpm 11 or Bun 1.4.2.
- A running PostgreSQL database for database migrations and user queries.

Clone the starter, or use your existing checkout:

```sh
git clone https://github.com/yuyays/effect-starter.git
cd effect-starter
```

Choose one of the following paths. Both create a separate project named `my-app`
next to this repository. Replace `my-app` with your own lowercase name using
letters, numbers, and hyphens.

### With pnpm

```sh
pnpm create:app ../my-app --package-manager pnpm
cd ../my-app
pnpm install
```

### With Bun

```sh
bun run create:app ../my-app --package-manager bun
cd ../my-app
bun install
```

The generator renames workspace packages, imports, scripts, and the page title.
It creates `.env` files from the examples, but does not install dependencies,
create a database, or initialize Git. Nonempty destination directories are
never overwritten.

Omit `--package-manager` to choose interactively. Noninteractive creation
defaults to pnpm. Omit the directory to prompt for the project name.

## Configure and run your generated app

Run these commands from `my-app`, not from the starter checkout.

Set `DATABASE_URL` in `apps/api/.env` to your PostgreSQL connection string. The
example points to a local database; editing the file does not create that
database. A Supabase PostgreSQL connection string also works.

Create and apply the migration for the example `users` table, then start both
servers with the commands for your chosen package manager:

| Action             | pnpm               | Bun                   |
| ------------------ | ------------------ | --------------------- |
| Generate migration | `pnpm db:generate` | `bun run db:generate` |
| Apply migration    | `pnpm db:migrate`  | `bun run db:migrate`  |
| Start web and API  | `pnpm dev`         | `bun run dev`         |

Web runs at http://localhost:5173, API at http://localhost:3000, and API docs at
http://localhost:3000/docs. The health endpoint is http://localhost:3000/api/health.
Use `dev:web` or `dev:api` in place of `dev` to run only one server.

pnpm projects include a tested `pnpm-lock.yaml`. Bun projects create `bun.lock`
on their first install. **Commit the selected lockfile before pushing to your
own repository**: generated CI uses frozen installs. Use one package manager
per generated project.

## Verify your generated app

| Check            | pnpm                | Bun                    |
| ---------------- | ------------------- | ---------------------- |
| Lint             | `pnpm lint`         | `bun run lint`         |
| Formatting       | `pnpm format:check` | `bun run format:check` |
| Types            | `pnpm typecheck`    | `bun run typecheck`    |
| Tests            | `pnpm test`         | `bun run test`         |
| Production build | `pnpm build`        | `bun run build`        |

Vite+ is installed locally; a global `vp` installation is optional. Root scripts
run the workspace tasks for you.

`@effect/tsgo` adds Effect diagnostics to `typecheck`. Select the workspace
TypeScript version in your editor to enable its diagnostics and refactors there.
Effect and its Node/PostgreSQL adapters use v4. Drizzle ORM and Kit are pinned to
`1.0.0-rc.5-5935859` for stable Effect v4 compatibility. The API uses Drizzle’s
native `effect-postgres` integration through the `Database` service.

## Develop the starter

This path is for contributing to this repository. Stay in the `effect-starter`
checkout and use pnpm:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `DATABASE_URL` in `apps/api/.env`, then run:

```sh
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Run the same verification scripts listed above. In this checkout, `pnpm test`
also tests the generator. To verify fresh generated apps with both package
managers, including startup, API proxying, and shutdown, install Bun 1.4.2 and run:

```sh
pnpm test:generated
```

The API declares an esbuild peer explicitly so pnpm resolves one shared Vite+
and Vitest instance across the workspaces. Keep it aligned when upgrading tooling.

See [the CLI README](packages/create-effect-starter/README.md) for generator
usage and local packaging instructions.
