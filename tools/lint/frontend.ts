/**
 * Lint configuration for the React frontend. The API-only starter replaces this
 * module with an empty one, so it never carries React rules it cannot use.
 *
 * Everything here needs JSX except `react/rules-of-hooks`, which also inspects
 * `.ts` helpers named `useX`.
 */
export const frontendPlugins = ["react", "jsx-a11y"];

export const frontendRules = {
  "react/exhaustive-deps": "warn",
  "react/rules-of-hooks": "error",
  "react/react-in-jsx-scope": "off",
  "react/purity": "error",
  "react/refs": "error",
  "react/set-state-in-effect": "error",
  "react/static-components": "error",
  "react/no-unstable-nested-components": "error",
  // The rest of the React Compiler's Rules-of-React checks.
  "react/capitalized-calls": "error",
  "react/exhaustive-effect-dependencies": "error",
  "react/globals": "error",
  "react/hooks": "error",
  "react/immutability": "error",
  "react/memo-dependencies": "error",
  "react/no-array-index-key": "error",
  "react/preserve-manual-memoization": "error",
  "react/set-state-in-render": "error",
  "react/unsupported-syntax": "error",
} as const;
