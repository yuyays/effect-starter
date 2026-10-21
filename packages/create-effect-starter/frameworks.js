export const frameworks = {
  react: { label: "React", hint: "Single-page app with TanStack Router and Query" },
  "tanstack-start": { label: "TanStack Start", hint: "React with server rendering" },
  vue: { label: "Vue", hint: "Single-page app with Vue Router and TanStack Query" },
};

export function getFramework(name) {
  if (!Object.hasOwn(frameworks, name)) {
    throw new Error(`Unsupported framework: ${name}. Choose react, tanstack-start, or vue.`);
  }
  return frameworks[name];
}
