# effect-starter

Full-stack TypeScript app with React, TanStack Router/Query, Effect v4, Drizzle,
PostgreSQL, and Vite+, managed with {{PACKAGE_MANAGER}}. {{RUNTIME_NOTE}}
See `engines` in `package.json` for required versions. [MIT License](LICENSE).

## Setup

Skip the install if the generator already installed dependencies.
Set `DATABASE_URL` in `apps/api/.env` to a running PostgreSQL database first.

```sh
{{PACKAGE_MANAGER}} install
{{RUN}} db:generate
{{RUN}} db:migrate
{{RUN}} dev
```

`{{RUN}} dev:web` or `{{RUN}} dev:api` starts one server. The web app proxies
`/api` and `/docs` to the API; ports are set in `apps/web/vite.config.ts` and
`apps/api/.env`.

## Verify changes

```sh
{{RUN}} lint
{{RUN}} format:check
{{RUN}} typecheck
{{RUN}} test
{{RUN}} build
```

Component tests that need a real browser (`*.browser.test.tsx`) run in Chromium:
`{{RUN}} browser:install` once per machine, then `{{RUN}} test:browser`.

{{BUN_CHECKS_NOTE}}The checks enforce the Effect rules in `AGENTS.md`, and `{{RUN}} test` proves that
invalid examples fail. Select the workspace TypeScript version in your editor to
see Effect diagnostics there.

{{LOCKFILE_NOTE}}

## API production build

Workspace packages export their TypeScript source, so nothing is compiled first. In
development, `{{RUNTIME_BIN}} --watch` runs `apps/api/src/main.ts` and restarts the API
when it or a workspace package changes.

`{{RUN}} build` typechecks the API and bundles it with its workspace packages into
`apps/api/dist/main.js`. The API's `dependencies` stay external and everything else is
bundled, so {{RUNTIME}} runs only JavaScript in production.

Start the API with `{{RUN}} start:api` from the project root, with `DATABASE_URL` and
`PORT` set. It runs `dist/main.js` on {{RUNTIME}} with `apps/api` as the working directory.
Deploy `apps/api/dist` with the API's production `dependencies`; workspace packages are
already in the bundle.
