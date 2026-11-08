# Alchemy + Railway experiment

Deploy the starter's existing Node API and PostgreSQL with Alchemy v2. This is an
evaluation example, not a verified production deployment or a generator option.
It leaves the application runtime, API dependencies, and default CI unchanged.
Frontend hosting and the Bun runtime are outside this first experiment.

Alchemy and Railway are pinned to `2.0.0-beta.85`; Effect is `4.1.2`. Review
upgrades explicitly. The example has its own pnpm workspace and lockfile, so
normal starter installs do not install Alchemy.

## Build

From the repository root, install the starter, then install and build the example:

```sh
pnpm install --frozen-lockfile
cd examples/alchemy-railway
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

`build` compiles the existing API and prepares `.build/` using an allowlist:
the API's `dist/`, committed migrations, migration configuration, and Dockerfile.
It derives exact direct dependency versions from the starter's lockfile and adds
the same Drizzle Kit version for the pre-deploy step. The committed
`runtime-package-lock.json` pins transitive runtime dependencies; Docker installs
it with `npm ci`. A dependency mismatch fails packaging before replacing the
previous context. Local `.env` files and Alchemy state
are never copied. Inspect `.build/` before deploying.

When API dependency versions change, refresh the runtime lock deliberately:
update its root dependency entries to match the versions reported by `prepare.mjs`
and the API lockfile, then run `npm install --package-lock-only --ignore-scripts`
against a temporary directory containing that package manifest and lockfile.
Copy the resulting lockfile back to `runtime-package-lock.json`, review the diff,
and rebuild. Keep these tooling updates separate from a cloud deployment.

Schema changes use the API schema as their source:

```sh
pnpm db:generate
```

Run this before each build after changing the API schema; packaging checks for
migration files but does not detect schema drift. Review and commit the resulting
`migrations/` directory before building again.
This example owns a separate migration history; do not point it at an existing
application database or apply the API's other migration history to this database.

To build the same image locally, with access to a Docker daemon:

```sh
docker build -t effect-starter-alchemy-spike .build
```

The image includes Drizzle Kit for migrations, runs the API as the `node` user,
and starts `dist/main.js` on `PORT` (default 3000).

## Deploy a disposable stage

Use a Railway account/workspace with billing enabled. Configure authentication
through Alchemy's profile command:

```sh
pnpm exec alchemy profile edit --add Railway
pnpm plan
pnpm deploy
```

Both scripts target `alchemy-spike` explicitly. Review the plan before accepting.
The stack creates a separate Railway Project for the stage, a Postgres service
with persistent storage and no public database TCP proxy, and a public API service.
The API receives Railway's private `DATABASE_URL` reference. The service name
`Database` is explicit because Railway references resolve by physical name.

Railway builds the uploaded `.build/` context. Its pre-deploy container runs
`drizzle-kit migrate` with the private database URL before starting the new API.
A failed migration fails the deployment. Use backward-compatible schema changes:
app rollback does not undo a migration, and the previous app may still be running.
Railway checks `/api/health`; use `/api/users` to verify database access too.

The stack prints the API URL and project ID, never database credentials.
Run `plan`/`deploy` from this directory; context paths are relative to the command's
working directory. Re-run `pnpm build` before deploying changed application code.

## State and recovery

This solo experiment uses local state under `.alchemy/`, excluded from Git.
Keep a private backup of it and your Alchemy profile. Always operate from the same
state directory and serialize deploy/destroy commands. Do not use this local-state
recipe from CI, another machine, or multiple worktrees. Lost state is not a reason
to redeploy blindly: inspect Railway first and recover state before continuing.

Every resource is disposable, including the database and its volume. `destroy`
does not promise to retain data. Use only test data. A production recipe needs
shared state, serialized CI deployment, tested backups/restores, explicit retention
for data and its parent resources, and a reviewed upgrade/rollback procedure.

After a failed or cancelled deploy, inspect the Railway dashboard for migration
and build logs, preserve `.alchemy/`, and run `pnpm plan` before retrying. Do not
clear state to work around a failure. A provider-side rollback does not roll back
Alchemy state; the next deploy reconciles the checked-in stack again.

## Acceptance checklist

These cloud checks must be completed before promoting the example to a generator
option. Ordinary starter tests remain offline and require no cloud credentials.
The example is outside the root check scripts and CI: run its own frozen install,
typecheck, and build explicitly when changing it or updating API dependencies.

1. Deploy a fresh `alchemy-spike` stage; `/api/health` returns
   `{"ok":true,"service":"api"}` and `/api/users` returns `[]`.
2. In the Railway database console, insert a test user with a known name. Confirm
   `/api/users` returns it. Redeploy unchanged and confirm the user survives and
   migrations are not reapplied. Record whether Alchemy plans a no-op.
3. Make and deploy one additive migration; confirm existing data survives.
4. On this disposable stage, exercise a failing migration and cancelled deployment.
   Confirm logs explain the failure and a corrected deploy recovers with the same
   state. Do not race deploys against the same local-state directory.
5. Rebuild after changing code and confirm the new artifact is deployed.
6. Record package/install costs and any required provider workarounds.
7. Destroy only the disposable stage and confirm its Project, API, database, and
   volume disappear in the Railway dashboard:

```sh
pnpm destroy
```

Do not delete `.alchemy/` until cleanup has been verified. If a partial create left
resources behind, use the recorded project ID to inspect and remove them explicitly.

Provider references: [Railway setup](https://alchemy.run/railway/setup/),
[Services](https://alchemy.run/railway/compute/services/),
[Postgres](https://alchemy.run/railway/data/postgres/),
[state](https://alchemy.run/state-store/). The installed beta's types/source take
precedence over examples written for a newer version.
