export const frameworks = {
  // `react: true` marks the React starters: React Compiler and Chromium component tests.
  react: { label: "React", hint: "Single-page app with TanStack Router and Query", react: true },
  "tanstack-start": { label: "TanStack Start", hint: "React with server rendering", react: true },
  vue: { label: "Vue", hint: "Single-page app with Vue Router and TanStack Query" },
  // API servers, agent backends, and services that other clients call.
  none: { label: "No frontend", hint: "Effect API and shared contracts only", frontend: false },
};

export function getFramework(name) {
  if (!Object.hasOwn(frameworks, name)) {
    throw new Error(
      `Unsupported framework: ${name}. Choose ${Object.keys(frameworks).join(", ")}.`,
    );
  }
  return frameworks[name];
}

export function hasFrontend(name) {
  return getFramework(name).frontend !== false;
}

export function isReact(name) {
  return getFramework(name).react === true;
}
