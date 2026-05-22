# effect-starter

Full-stack TypeScript starter with React, TanStack Router/Query, Effect Platform, Drizzle, Supabase Postgres, Oxlint, and Oxfmt.

## Setup

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
