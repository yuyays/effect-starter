/**
 * Paths that exist only in this repository: the generator's own template output, its
 * frontend overlays, and the standalone examples. Generated projects replace this
 * module with an empty one, so their lint config never mentions the generator.
 */
export const repositoryOnlyLintPaths = [
  "packages/create-effect-starter/template/**",
  "packages/create-effect-starter/frontends/**",
  // These standalone workspaces have separate installs, absent from root CI.
  "examples/alchemy-durable-object/**",
];

/** The same paths, as the formatter sees them. */
export const repositoryOnlyFormatPaths = [
  "packages/create-effect-starter/template/**",
  "packages/create-effect-starter/frontends/**/pnpm-lock.yaml",
];
