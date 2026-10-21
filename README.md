# effect-starter

Full-stack TypeScript starter with your choice of React, TanStack Start, or Vue, Effect v4,
Drizzle, PostgreSQL, and Vite+ (Vite, Vitest, Oxlint, and Oxfmt).

Licensed under the [MIT License](LICENSE).

## Start here

**Run the generator directly from a GitHub Release.** No clone or generator
installation is needed:

```sh
npx --yes https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

You need Node.js 24.11+. The wizard asks you to:

1. Name your project, for example `my-app`.
2. Pick **React**, **TanStack Start**, or **Vue** with arrow keys and Enter.
3. Pick **pnpm** or **Bun** for your app.
4. Review the dependency list and choose whether to run `pnpm install` or `bun install`.

**Release status:** the existing `v0.1.0` release is React-only. The three-starter
picker requires a new release built from this source. To try it before that
release, use the checkout workflow below.

React and Vue create single-page apps. TanStack Start adds React server rendering.
Every choice includes the Effect API, Drizzle, PostgreSQL, and shared contracts.
The API runs on Node.js with either package manager.

`npx` only downloads and launches the generator. It does not select npm for your
app. Choose pnpm 11 or Bun 1.4.2, then accept the install prompt to have the
wizard install dependencies for you. After it finishes, enter your project:

```sh
cd my-app
```

If you skipped installation, run `pnpm install` or `bun install` inside your
project first. Then continue with
[Configure and run your generated app](#configure-and-run-your-generated-app).
You will need a running PostgreSQL database for that step.

The generator creates your project and `.env` files, shows its direct dependencies
and development tools, then offers to install them. It does not create a database
or initialize Git. Existing nonempty directories are never overwritten. Ctrl+C
cancels the wizard; at the install prompt, it skips installation and keeps your project.

<details>
<summary>Prefer launching with pnpm or Bun?</summary>

These launch the same release and wizard. Choose any one launcher; the package
manager you pick inside the wizard is independent of how you launched it.

With pnpm:

```sh
pnpm dlx https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

With Bun:

```sh
bunx --package https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz create-effect-starter
```

The generator is distributed through GitHub Releases, without publishing to npm.
`pnpm create effect-starter` is not available. See the
[CLI README](packages/create-effect-starter/README.md) for version pinning,
manual downloads, and automation flags.

</details>

<details>
<summary>Develop the generator or try unreleased changes from a checkout</summary>

Use this workflow when you need the source version instead of a published release:

```sh
git clone https://github.com/yuyays/effect-starter.git
cd effect-starter
pnpm install
pnpm create:app
```

`pnpm create:app` runs the local generator and opens the same wizard. It only
works inside this repository. Enter `../my-app` to create your app beside the
checkout, review the dependency list, and accept or skip installation. Then run
`cd ../my-app`.

</details>

## Where Vite+ fits

Vite+ is the app's development toolchain: it runs the dev servers, builds,
tests, linting, formatting, and workspace tasks. The `dev`, `build`, `test`,
`lint`, and `format:check` scripts call Vite+ through `vp`.

pnpm or Bun handles dependencies and lockfiles. Vite+ is installed locally in
both choices; neither choice opts out of Vite+. A global `vp` installation is
optional. If you use it, `vp install` delegates to the package manager selected
for your project. See the [Vite+ guide](https://viteplus.dev/guide/).

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
managers for all three starters, including startup, API proxying, and shutdown,
install Bun 1.4.2 and run:

```sh
pnpm test:generated
```

The API declares an esbuild peer explicitly so pnpm resolves one shared Vite+
and Vitest instance across the workspaces. Keep it aligned when upgrading tooling.

See [the CLI README](packages/create-effect-starter/README.md) for generator
usage and local packaging instructions.
