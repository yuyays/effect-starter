# effect-starter

Full-stack TypeScript starter with **React**, **TanStack Start**, or **Vue**, plus
Effect v4, Drizzle, PostgreSQL, and Vite+.

## Start here

Run the generator—no clone needed:

```sh
npx --yes https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

The `latest` URL points at the newest GitHub release; replace `latest` with a
release tag to pin a version. Use arrow keys and Enter to choose your project
name, starter, and package manager. Review the dependency list, then accept or
skip installation.

- **React:** single-page app with TanStack Router and Query.
- **TanStack Start:** React with server rendering.
- **Vue:** single-page app with Vue Router and TanStack Query.

Requires Node.js 24.11+ and pnpm 11 or Bun 1.4.2. All starters include the same
Effect API and shared contracts. The framework picker requires **v0.2.0+**.

Prefer pnpm or Bun to launch the generator? See the
[CLI guide](packages/create-effect-starter/README.md#launch-with-pnpm-or-bun).
The launcher does not determine your app's package manager.

## Run your app

For a project named `my-app`:

```sh
cd my-app
```

If you skipped installation, run `pnpm install` or `bun install` now.
Set `DATABASE_URL` in `apps/api/.env` to a running PostgreSQL database, then:

| Action             | pnpm               | Bun                   |
| ------------------ | ------------------ | --------------------- |
| Generate migration | `pnpm db:generate` | `bun run db:generate` |
| Apply migration    | `pnpm db:migrate`  | `bun run db:migrate`  |
| Start web and API  | `pnpm dev`         | `bun run dev`         |

Web: http://localhost:5173 · API: http://localhost:3000 · API docs:
http://localhost:3000/docs.

The generator creates `.env` files; it does not create a database or initialize
Git. Commit your chosen lockfile before pushing—generated CI uses frozen installs.

## Verify your generated app

| Check            | pnpm                | Bun                    |
| ---------------- | ------------------- | ---------------------- |
| Lint             | `pnpm lint`         | `bun run lint`         |
| Formatting       | `pnpm format:check` | `bun run format:check` |
| Types            | `pnpm typecheck`    | `bun run typecheck`    |
| Tests            | `pnpm test`         | `bun run test`         |
| Production build | `pnpm build`        | `bun run build`        |

pnpm or Bun manages dependencies; these scripts run the included Vite+ toolchain.
No global `vp` installation is needed. Follow your generated README for API production deployment and
framework-specific notes.

## Develop the starter

For source changes or an unreleased generator, clone this repository:

```sh
git clone https://github.com/yuyays/effect-starter.git
cd effect-starter
pnpm install
pnpm create:app
```

Enter `../my-app` to generate a separate app beside the checkout.
`pnpm create:app` only works inside this repository.

See the [CLI and maintenance guide](packages/create-effect-starter/README.md) for
automation flags, source-app development, testing, dependency updates, and releases.

[MIT License](LICENSE)
