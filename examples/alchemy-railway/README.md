# Alchemy + Railway experiment

Deploy the starter's existing Node API and PostgreSQL with Alchemy v2. This is an
evaluation example, not a production hosting preset or a generator option.
It leaves the application runtime, API dependencies, and default CI unchanged.
Frontend hosting and the Bun runtime are outside this first experiment.

Alchemy and Railway are pinned to `2.0.0-beta.85`; Effect is `4.1.2`. Review
upgrades explicitly. The example has its own pnpm workspace and lockfile, so
normal starter installs do not install Alchemy.
`@effect/platform-bun` satisfies Alchemy's peer dependency; the deployed API
still runs on Node.

## Verification status

Verified on 2026-11-08 with the pinned dependencies: local Docker build and
non-root execution; live Railway provisioning; private database connectivity;
pre-deploy migrations; health and user reads; unchanged no-op planning; a
deliberately failed migration leaving the previous API available; recovery with
an additive migration and preserved data. The failure and additive-migration
probes changed only the disposable build context, not application source or
committed migrations. They invoked `alchemy deploy` directly so the package
script's rebuild would not overwrite the probes. The initial deployment used
`pnpm run deploy`.
Alchemy then deleted the four stack resources; Railway CLI independently
confirmed the project no longer existed.

Unchanged redeployment (as opposed to no-op planning), an application-code change
through the rebuild/deploy scripts, and package/install cost measurement remain
unverified. Mid-deploy cancellation, concurrent deploys, backup/restore, retention
policies, and beta upgrades also remain untested. This does not establish
production readiness.

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
Packaging relies on `apps/api/vite.config.ts` bundling workspace imports and
externalizing only the API's production dependencies. Recheck packaging when
changing that bundler contract.

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
pnpm run deploy
```

The plan/deploy scripts rebuild the context and target `alchemy-spike` explicitly.
Review the plan before accepting.
Use `pnpm run deploy`: plain `pnpm deploy` invokes pnpm's workspace packaging
command instead of the example's deployment script.
The stack creates a separate Railway Project for the stage, a Postgres service
with persistent storage and no public database TCP proxy, and a public API service.
The API receives Railway's private `DATABASE_URL` reference. The service name
`Database` is explicit because Railway references resolve by physical name.

Railway builds the uploaded `.build/` context. Its pre-deploy container runs
`drizzle-kit migrate` with the private database URL before starting the new API.
A failed migration fails the deployment. Use backward-compatible schema changes:
app rollback does not undo a migration, and the previous app may still be running.
Railway checks `/api/health`; use `/api/users` to verify database access too.
Alchemy may stop waiting while Railway is still building or migrating; inspect
the dashboard before retrying a pending deployment. Pre-deploy migrations have
no default timeout, so cancel a hung migration explicitly after inspecting it.

The stack's console outputs are the API URL and project ID, not database credentials.
Run `plan`/`deploy` from this directory; context paths are relative to the command's
working directory. Use the package scripts so changed application code is rebuilt.

## State and recovery

This solo experiment uses local state under `.alchemy/`, excluded from Git.
Keep a private backup of it and your Alchemy profile. Always operate from the same
state directory. State contains the generated database password: treat backups as
credentials and never commit or share them. Always serialize deploy/destroy commands
against the same stage. Do not use this local-state
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
Root lint and format include the example, but root typecheck/test/build and their
CI jobs do not check its independent dependencies. Run its own frozen install,
typecheck, and build explicitly when changing it or updating API dependencies.

Statuses below record the 2026-11-08 experiment; partial and pending items remain
requirements for promotion.

1. **Verified:** deploy a fresh `alchemy-spike` stage; `/api/health` returns
   `{"ok":true,"service":"api"}` and `/api/users` returns `[]`.
   Verify the database has no public TCP proxy in Railway and the API's resolved
   database hostname ends in `.railway.internal`; do not log the full connection URL.
2. **Partial:** in the Railway database console, insert a test user with a known name. Confirm
   `/api/users` returns it. Redeploy unchanged and confirm the user survives and
   migrations are not reapplied. Record whether Alchemy plans a no-op.
   The test user was inserted over SSH and returned by `/api/users`; unchanged
   planning was a no-op. An unchanged redeploy and its migration behavior were
   not tested. Data survived the separate recovery deployment in item 3.
3. **Verified via direct Alchemy invocation:** make and deploy one additive
   migration; confirm existing data survives.
4. **Partial:** on this disposable stage, exercise a failing migration and cancelled deployment.
   Confirm logs explain the failure and a corrected deploy recovers with the same
   state. Do not race deploys against the same local-state directory.
   Failure reporting and recovery passed; cancellation was not tested.
5. **Pending:** rebuild after changing application code and confirm the new artifact
   is deployed. The generated migration probe did not exercise this script path.
6. **Pending:** record package/install costs and any required provider workarounds.
   Cost measurements were not taken.
7. **Verified:** destroy only the disposable stage and confirm its Project, API,
   database, and volume are deleted. Alchemy reported all stack resources deleted,
   and Railway CLI confirmed the project was absent:

```sh
pnpm run destroy
```

Do not delete `.alchemy/` until cleanup has been verified. If a partial create left
resources behind, use the recorded project ID to inspect and remove them explicitly.

Provider references: [Railway setup](https://alchemy.run/railway/setup/),
[Services](https://alchemy.run/railway/compute/services/),
[Postgres](https://alchemy.run/railway/data/postgres/),
[state](https://alchemy.run/state-store/). The installed beta's types/source take
precedence over examples written for a newer version.
