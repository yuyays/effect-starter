# effect-starter

Full-stack TypeScript starter with React, TanStack Router/Query, Effect v4, Drizzle, Supabase Postgres, Oxlint, and Oxfmt.

Effect and its Node/PostgreSQL adapters use v4. Drizzle ORM and Kit are pinned to
`1.0.0-rc.5-5935859` because this build fixes compatibility with stable Effect v4.
The API uses Drizzle’s native `effect-postgres` integration through the `Database` service.

## Setup

### Scaffolding CLI

The `create-effect-starter` package creates a project with your chosen name,
including workspace packages, internal imports, scripts, and the page title.
Once published to npm, use `pnpm create effect-starter my-app`.

To try the CLI locally now:

```sh
pnpm --filter create-effect-starter build
node packages/create-effect-starter/cli.js /tmp/my-app
```

See [the CLI README](packages/create-effect-starter/README.md) for packaging instructions.

### Working on this repository

```sh
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

Web runs on `http://localhost:5173`. API runs on `http://localhost:3000`. API docs are at `http://localhost:3000/docs`.

## Scripts

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @effect-starter/api db:generate
pnpm --filter @effect-starter/api db:migrate
```
