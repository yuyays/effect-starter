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

{{BUN_CHECKS_NOTE}}The checks enforce the Effect rules in `AGENTS.md`, and `{{RUN}} test` proves that
invalid examples fail. Select the workspace TypeScript version in your editor to
see Effect diagnostics there.

{{LOCKFILE_NOTE}}

## API production build

`{{RUN}} build` compiles the API and contracts; {{RUNTIME}} runs the emitted JavaScript.
In development, `{{RUNTIME_BIN}} --watch` restarts the API when it is recompiled.

Start the API with `{{RUNTIME_BIN}} apps/api/dist/main.js` from the project root, with
`DATABASE_URL` and `PORT` set. The API is not bundled: deploy it with
`packages/contracts/dist`, the workspace manifests, and production dependencies.
