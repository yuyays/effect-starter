# effect-starter

[English](README.md) | [日本語](README.ja.md)

An Effect-based TypeScript application starter, with an optional **React**,
**TanStack Start**, or **Vue** frontend. Built on Effect v4, Drizzle, Effect SQL,
PostgreSQL, and Vite+. No hosting provider is preconfigured.

## Why I built this

More and more code is written by agents. I wanted a codebase whose shape keeps
them on track as it grows, so that anyone, including people who don't write code,
can start a project and keep building on it.

Effect gives code a direction to grow in: workflows are typed values, failures
are explicit, and dependencies come through layers, so new code follows the same
pattern as existing code. The Effect compiler profile and the VoidZero toolchain
(Vite+, Oxlint, Oxfmt) enforce that shape. An unexecuted Effect fails typecheck,
running Effects outside entrypoints fails lint, and `test` proves those rules
still reject bad code even without `AGENTS.md`.

The guardrails take over the routine review and platform upkeep that used to
take people's time, so they can spend it on the product instead.

## Start here

```sh
npx --yes https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

With [Vite+ installed globally](https://viteplus.dev/guide/), `vp dlx <same URL>` works too;
the [CLI guide](packages/create-effect-starter/README.md#launch-with-pnpm-or-bun) covers
`pnx` and `bunx`.

The wizard asks for:

- **Starter:** React (TanStack Router and Query), TanStack Start (server rendering),
  Vue (Vue Router and TanStack Query), or no frontend, for API servers and backends
  that agents, CLIs, or other services call. All share the same Effect API and contracts.
- **Package manager:** pnpm or Bun.
- **API runtime:** Node.js or Bun. Vite+ and the checks always run on Node.js.

Building a CLI, MCP server, agent, or custom harness? Start with no frontend and add
it as another app under `apps/`, with its own `main.ts` entrypoint. Then extend the
`starter/runtime-boundary` override in `vite.config.ts` to that app, so lint keeps
Effect execution at its entrypoint too.

## Run and verify your app

Set `DATABASE_URL` in `apps/api/.env`.

The API loads `.env` through Effect's configuration provider, with environment
variables taking priority. The file is optional; missing required values, invalid
values, and file read errors still fail startup. Restart the API after editing `.env`.

Then run:

| Task               | pnpm                | Bun                |
| ------------------ | ------------------- | ------------------ |
| Generate migration | `pnpm db:generate`  | `bun db:generate`  |
| Apply migration    | `pnpm db:migrate`   | `bun db:migrate`   |
| Start web and API  | `pnpm dev`          | `bun dev`          |
| Lint               | `pnpm lint`         | `bun lint`         |
| Formatting         | `pnpm format:check` | `bun format:check` |
| Types              | `pnpm typecheck`    | `bun typecheck`    |
| Tests              | `pnpm test`         | `bun run test`     |
| Production build   | `pnpm build`        | `bun run build`    |

Bun keeps `run` for `test` and `build`, whose built-in commands would otherwise
replace the scripts. With Vite+ installed globally, `vp run <script>` runs the
same scripts. Plain `vp lint` or `vp check` doesn't prepare the Effect rules
first, so it can miss them. Your generated README covers deployment and
framework notes.

## Develop the starter

```sh
git clone https://github.com/yuyays/effect-starter.git
cd effect-starter
pnpm install
pnpm create:app
```

Enter `../my-app` to generate an app beside the checkout. See the
[CLI and maintenance guide](packages/create-effect-starter/README.md) for flags,
testing, dependency updates, and releases. Effect conventions are in
[AGENTS.md](AGENTS.md).

[MIT License](LICENSE)
