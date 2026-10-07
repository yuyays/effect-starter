# effect-starter

Licensed under the [MIT License](LICENSE).

Full-stack TypeScript app with React, TanStack Router/Query, Effect v4, Drizzle,
PostgreSQL, and Vite+ (Vite, Vitest, Oxlint, and Oxfmt). Requires Node.js 24.11+
and {{PACKAGE_MANAGER}}. The API runs on Node.js with either package manager.

## Setup

Run these commands from this project’s root directory.

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
The generator has not installed dependencies or initialized Git.

Web runs on http://localhost:5173. API runs on http://localhost:3000.
API docs are at http://localhost:3000/docs.
The health endpoint is http://localhost:3000/api/health.
Use `{{RUN}} dev:web` or `{{RUN}} dev:api` to run only one server.
Vite+ is installed locally; a global `vp` installation is optional.

Drizzle ORM and Kit are pinned to `1.0.0-rc.5-5935859` for stable Effect v4 compatibility.
`@effect/tsgo` adds Effect diagnostics to `{{RUN}} typecheck`. Select the workspace
TypeScript version in your editor to use its Effect diagnostics and refactors there too.

## Verify changes

```sh
{{RUN}} lint
{{RUN}} format:check
{{RUN}} typecheck
{{RUN}} test
{{RUN}} build
```

{{LOCKFILE_NOTE}}
Use {{PACKAGE_MANAGER}} for this project so installs and CI use the same lockfile.
