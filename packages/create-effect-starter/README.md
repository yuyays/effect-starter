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

**Release status:** the existing `v0.1.0` release is React-only. The three-starter
picker needs a new release built from this source. Use the checkout workflow
below to try it before that release.

Enter `my-app` to create a project in the current directory. Choose pnpm or Bun,
review the direct dependencies and development tools, then confirm whether to
run `pnpm install` or `bun install`. After installation, change into your project
and follow its README. If you decline, the CLI shows the manual install command.
The launcher does not choose your app's package manager. Ctrl+C at the install
prompt skips installation and keeps the generated project.

<details>
<summary>Launch with pnpm or Bun instead of npx</summary>

Choose any one of these launchers; they run the same release and wizard.

```sh
pnpm dlx https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz
```

```sh
bunx --package https://github.com/yuyays/effect-starter/releases/latest/download/create-effect-starter.tgz create-effect-starter
```

This package is not published to npm, so `pnpm create effect-starter` is not available.

</details>

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

For a specific version, replace `latest/download` with `download/<tag>` in the
URL. Use the attached `.tgz`, since GitHub's automatic source archives do not
contain the built templates.

You can also download `create-effect-starter.tgz` from
[Releases](https://github.com/yuyays/effect-starter/releases) and extract it.
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

## Publish a GitHub Release

Commit the changes and push a version tag, such as `v0.1.0`, pointing at that
commit. In GitHub Actions, run **Release generator** and enter the existing tag.
The workflow tests and packs the generator, then creates a release with
`create-effect-starter.tgz` attached. It does not publish to npm. The workflow
must be on the default branch before it can be run manually.

For a manual release from a checkout of the tagged commit, use the test and
pack commands above, then:

```sh
gh release create v0.1.0 /tmp/create-effect-starter.tgz --verify-tag --generate-notes
```

Choose the tag for the version being released. Generated apps include their own
CI workflow and exclude this repository's release workflow.

## Maintain frontend templates

The React frontend comes from `apps/web`. `frontends/tanstack-start` overlays it;
`frontends/vue` contains the Vue frontend. The API and contracts remain shared.
`build-template.js` assembles each complete project into `template/<framework>`.

After changing template dependencies or shared workspace configuration, rebuild,
run `pnpm install --lockfile-only --ignore-scripts` in each assembled variant,
and copy its lockfile back to `frontends/<framework>/pnpm-lock.yaml` for Vue and
TanStack Start. For a new variant without a lockfile, bootstrap the build with
`UPDATE_TEMPLATE_LOCKFILES=1 node packages/create-effect-starter/build-template.js`.
Run `pnpm test:generated` to verify all three starters with pnpm and Bun.
Pass a framework name (for example `pnpm test:generated vue`) to check only that starter.
