# effect-starter

Licensed under the [MIT License](LICENSE).

Full-stack TypeScript app with React, TanStack Router/Query, Effect v4, Drizzle,
PostgreSQL, and Vite+ (Vite, Vitest, Oxlint, and Oxfmt). Requires Node.js 24.11+
and {{PACKAGE_MANAGER}}. {{RUNTIME_NOTE}}

## Setup

Run these commands from this project’s root directory. If you accepted dependency
installation in the generator and it succeeded, skip this install command.

```sh
{{PACKAGE_MANAGER}} install
```

Set `DATABASE_URL` in `apps/api/.env` to a running PostgreSQL database. The
example URL points to a local database; editing this file does not create a
database. A Supabase PostgreSQL connection string also works. Generate and apply
the migration for the example `users` table, then start both servers:

```sh
{{RUN}} db:generate
{{RUN}} db:migrate
{{RUN}} dev
```

The environment files have already been created from the included examples.
The generator offered to install dependencies; it has not initialized Git.

Web runs on http://localhost:5173. API runs on http://localhost:3000.
API docs are at http://localhost:3000/docs.
The health endpoint is http://localhost:3000/api/health.
Use `{{RUN}} dev:web` or `{{RUN}} dev:api` to run only one server.
Vite+ is included in the project and powers its scripts. No separate global
`vp` installation is needed. With global Vite+, use `vp install` and
`vp run <script>` instead.

Drizzle ORM and Kit are pinned to `1.0.0-rc.5-5935859` for stable Effect v4 compatibility.
API and contract checks invoke `@effect/tsgo` directly, so Effect diagnostics work
without install-time compiler patching. The API profile makes Effect composition
mistakes fail typechecking. Lint restricts runtime execution to entrypoints,
framework adapters, and tests; suppressions need a `-- reason` suffix.
These checks work independently of `AGENTS.md`, and `{{RUN}} test` verifies that
invalid examples are rejected. Select the workspace TypeScript version in your
editor to use the patched compiler's Effect diagnostics and refactors there too.

## Verify changes

```sh
{{RUN}} lint
{{RUN}} format:check
{{RUN}} typecheck
{{RUN}} test
{{RUN}} build
```
{{BUN_CHECKS_NOTE}}
{{LOCKFILE_NOTE}}
Use {{PACKAGE_MANAGER}} directly or through `vp install` so installs and CI use the same lockfile.

## API production build

The API and shared contracts compile with `effect-tsgo tsc`; {{RUNTIME}} runs the emitted JavaScript.
Root development, typecheck, and test commands build contracts first. Development
watches the API and contracts with `effect-tsgo tsc --watch`; `{{RUNTIME_BIN}} --watch` restarts the API
when the emitted JavaScript changes.

After building the workspace, start the API with `{{RUN}} start:api` from the project
root. It runs `{{RUNTIME_BIN}} dist/main.js` with `apps/api` as the working directory.
Set `DATABASE_URL` and `PORT` in the process environment.
Keep `packages/contracts/dist`, the workspace package manifests, and production
dependencies alongside `apps/api/dist`; the API is not bundled.
