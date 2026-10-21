# create-effect-starter

Create a full-stack Effect v4, Drizzle, and Vite+ project with React, TanStack Start, or Vue.
Requires Node.js 24.11+ and pnpm 11 or Bun 1.4.2. The API runs on Node.js with
either package manager.

## Recommended: run a GitHub Release

No checkout is required. Run this from the directory where you want your app:

```sh
npx --yes https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

The wizard asks for a project name, starter, and package manager. Use arrow keys
and Enter to choose:

- **React**: a single-page app with TanStack Router and Query.
- **TanStack Start**: React with server rendering and a separate Effect API.
- **Vue**: a single-page app with Vue Router and TanStack Query.

The React, TanStack Start, and Vue picker is available in **v0.2.0 and later**.
Older releases, including v0.1.0, provide the React starter only. The `latest`
URL points at the newest GitHub release, so new versions do not require a new
command.

Enter `my-app` to create a project in the current directory. Choose pnpm or Bun,
review the direct dependencies and development tools, then confirm whether to
run `pnpm install` or `bun install`. After installation, change into your project
and follow its README. If you decline, the CLI shows the manual install command.
The launcher does not choose your app's package manager. Ctrl+C at the install
prompt skips installation and keeps the generated project.

## Launch with pnpm or Bun

Choose any one of these launchers; they run the same release and wizard.

```sh
pnpm dlx https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

```sh
bunx --package https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz create-effect-starter
```

This package is not published to npm, so `pnpm create effect-starter` is not available.

## From a checkout: development and unreleased changes

Use this route when you need the source version rather than the published release.
From the repository root:

```sh
pnpm install
pnpm create:app
```

If you have not cloned the repository yet, see the
[main README](https://github.com/yuyays/effect-starter#start-here).
Once dependencies are installed, you only need `pnpm create:app`.

Enter `../my-app` to create your project beside the checkout. Change into the
new project and follow its README. `pnpm create:app` only works inside this
repository. You can also launch the local wizard with `bun run create:app`.

<details>
<summary>Specific releases and manual downloads</summary>

Use the `latest` URL for the current release, or replace `latest` with an
exact tag such as `v0.2.0` to pin one. Each release attaches
`create-effect-starter.tgz` to [GitHub
Releases](https://github.com/yuyays/effect-starter/releases) for offline or
manual use. Use the attached `.tgz`; automatic source archives do not contain
the built templates.

You can download `create-effect-starter.tgz` from Releases and extract it.
On macOS/Linux:

```sh
mkdir effect-starter-cli
tar -xzf create-effect-starter.tgz -C effect-starter-cli
npm install --prefix effect-starter-cli/package --omit=dev
node effect-starter-cli/package/cli.js
```

</details>

## Optional flags for automation

Interactive users can just pick from the menus. Flags skip individual prompts:

```sh
pnpm create:app ../my-app --framework vue --package-manager pnpm
```

Supported framework values are `react`, `tanstack-start`, and `vue`.
Noninteractive creation requires a directory and defaults to React and pnpm,
without installing dependencies. Use `--install` to explicitly install or
`--no-install` to skip the interactive install prompt. Installation runs inside
the generated project with the selected package manager. If it fails or that
package manager is missing, the CLI keeps the project, exits with an error, and
shows the install command to retry.
Existing empty directories and nested paths are supported; nonempty directories
are never overwritten.

The CLI renames workspace packages, imports, scripts, and the page title, and
copies environment examples into `.env` files. It offers to install dependencies
after showing the package list. It does not create a database or initialize Git.

pnpm projects include a lockfile. Bun projects generate `bun.lock` on their first
install. Commit the selected lockfile before pushing to your own repository,
because generated CI uses frozen installs.

## Develop the source apps

To work on the starter apps themselves, stay in the repository checkout:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `DATABASE_URL` in `apps/api/.env` to a running PostgreSQL database, then run
`pnpm db:generate`, `pnpm db:migrate`, and `pnpm dev`.
Use `pnpm dev:web` or `pnpm dev:api` to run one server. The API health endpoint
is http://localhost:3000/api/health.

The API and shared contracts compile with TypeScript and run on Node.js; the
[generated README](PROJECT_README.md#api-production-build) describes production
files and environment variables. `@effect/tsgo` adds Effect diagnostics to the
workspace type checks. Drizzle ORM and Kit retain their paired Effect v4 release
candidate pins. Keep the API's esbuild peer aligned with the Vite+ toolchain.

## Test or package the CLI

From the repository root:

```sh
pnpm install
pnpm --filter create-effect-starter test
pnpm --filter create-effect-starter pack --out /tmp/create-effect-starter.tgz
```

Packing builds the template from this repository. The generated app template
contains only the apps, shared contracts, and project configuration. Local
secrets, dependencies, build output, repository history, and the generator's
source files are excluded from generated apps.

Repository CI runs the workspace checks on every pull request. Generated-app
checks run in a separate workflow, only when generator-relevant files change,
and each framework runs in its own job. Inside a generated app, CI runs only
that app's lint, format, type, test, and build steps.

### `vp check` and type checking

`vp check` combines formatting and linting, but it only runs TypeScript type
checks when `lint.options.typeCheck` is enabled. The Vue starter needs
`vue-tsc` for single-file components, and enabling `typeCheck` makes `vp check`
fail on `.vue` imports. The check also needs a prebuilt contracts package.
Keep separate `lint`, `format:check`, and `typecheck` steps rather than
replacing them with `vp check` in CI.

## Publish a GitHub Release

Commit the changes and push a version tag, such as `v0.2.0`, pointing at that
commit. The package version in
`packages/create-effect-starter/package.json` must match the tag.

In GitHub Actions, run **Release generator** and enter the existing tag. The
workflow tests and packs the generator, smoke-tests all three starters, then
creates a GitHub release with `create-effect-starter.tgz` attached. It does not
publish to npm. The workflow must be on the default branch before it can be run
manually.

For a manual release from a checkout of the tagged commit, use the test and
pack commands above, then:

```sh
gh release create v0.2.0 /tmp/create-effect-starter.tgz --verify-tag --generate-notes
```

Choose the tag for the version being released. Generated apps include their own
CI workflow and exclude this repository's release workflow.

## Maintain frontend templates

The React frontend comes from `apps/web`. `frontends/tanstack-start` overlays it;
`frontends/vue` contains the Vue frontend. The API and contracts remain shared.
`build-template.js` assembles each complete project into `template/<framework>`.

All frontend manifests are part of the source pnpm workspace. Their source-only
package names keep them out of the app task filters; generated apps rename the
selected frontend to `@effect-starter/web`. Update dependencies with pnpm from
the repository root. Commit the manifests and root `pnpm-lock.yaml` together.

The builder selects the API, contracts, and chosen frontend importers from that
single lockfile and rebases workspace links. There are no separately maintained
template lockfiles. Run `pnpm test:generated` to verify all three starters with
pnpm and Bun. Pass a framework name (for example `pnpm test:generated vue`) to
check only that starter.

## Dependency updates

Dependabot checks the workspace and GitHub Actions every Monday. Related
Vite+/Vitest packages and Effect packages are grouped into reviewable PRs;
other minor and patch updates are grouped separately. Releases must be at least
one day old. Major migrations and the paired Drizzle release-candidate pins
require manual review. Vue's frontend stays on TypeScript 5.9 until its native
TypeScript integration is adopted.

Every dependency PR runs the repository checks and all six generated-app checks.
Dependabot configuration takes effect after it is merged into the default branch.
It does not merge PRs or publish releases automatically.
