# effect-starter

Full-stack TypeScript app with React, TanStack Router/Query, Effect v4, Drizzle,
PostgreSQL, Oxlint, and Oxfmt. Requires Node.js 24+ and pnpm.

## Setup

```sh
pnpm install
```

Set `DATABASE_URL` in `apps/api/.env` to a running PostgreSQL database. The
example URL points to a local database; a Supabase Postgres connection string
also works. Create the example `users` table, then start the app:

```sh
pnpm --filter @effect-starter/api db:generate
pnpm --filter @effect-starter/api db:migrate
pnpm dev
```

The environment files have already been created from the included examples.

Web runs on http://localhost:5173. API runs on http://localhost:3000.
API docs are at http://localhost:3000/docs.

Drizzle ORM and Kit are pinned to `1.0.0-rc.5-5935859` for stable Effect v4 compatibility.

## Verify changes

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

The included lockfile keeps dependencies on the starter's tested versions.
