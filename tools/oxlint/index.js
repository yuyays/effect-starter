import { workspaceImports } from "./workspace-imports.js";

function memberName(node) {
  return node.computed ? node.property.value : node.property.name;
}

const packages = new Set(["effect", "@effect/platform-node", "@effect/platform-bun"]);
const modules = new Map([
  ["effect/Effect", "Effect"],
  ["effect/ManagedRuntime", "ManagedRuntime"],
  ["effect/Schema", "Schema"],
  ["@effect/platform-node/NodeRuntime", "NodeRuntime"],
  ["@effect/platform-bun/BunRuntime", "BunRuntime"],
]);

function importedModule(context, node) {
  if (node.type === "MemberExpression" && node.object.type === "Identifier") {
    if (packages.has(importedModule(context, node.object))) return memberName(node);
    return undefined;
  }
  if (node.type !== "Identifier") return undefined;
  let scope = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(node.name);
    if (variable) {
      for (const definition of variable.defs) {
        if (definition.type !== "ImportBinding") continue;
        const source = definition.parent.source.value;
        if (definition.node.type === "ImportNamespaceSpecifier") {
          return packages.has(source) ? source : modules.get(source);
        }
        if (packages.has(source) && definition.node.type === "ImportSpecifier") {
          return definition.node.imported.name ?? definition.node.imported.value;
        }
      }
      return undefined;
    }
    scope = scope.upper;
  }
  return undefined;
}

function isRuntime(module, name) {
  return (
    (["Effect", "NodeRuntime", "BunRuntime"].includes(module) &&
      typeof name === "string" &&
      name.startsWith("run")) ||
    (module === "ManagedRuntime" && name === "make")
  );
}

const testFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

function runtimeRule(message, applies = () => true) {
  return {
    meta: { type: "problem", schema: [] },
    create(context) {
      if (!applies(context.filename)) return {};
      return runtimeVisitors(context, (node) => context.report({ node, message }));
    },
  };
}

function runtimeVisitors(context, report) {
  return {
    MemberExpression(node) {
      if (isRuntime(importedModule(context, node.object), memberName(node))) report(node);
    },
    ImportDeclaration(node) {
      const module = modules.get(node.source.value);
      for (const specifier of node.specifiers) {
        if (
          specifier.type === "ImportSpecifier" &&
          isRuntime(module, specifier.imported.name ?? specifier.imported.value)
        )
          report(specifier);
      }
    },
    VariableDeclarator(node) {
      if (node.id.type !== "ObjectPattern" || !node.init) return;
      const module = importedModule(context, node.init);
      for (const property of node.id.properties) {
        if (
          property.type === "Property" &&
          isRuntime(module, property.key.name ?? property.key.value)
        )
          report(property);
      }
    },
  };
}

const runtimeBoundary = runtimeRule(
  "Execute Effects only in an entrypoint or framework adapter. Compose Effects and yield services here; tests use it.effect.",
);

// Ported from t3code's no-manual-effect-runtime-in-tests (MIT), using import resolution.
const testRuntime = runtimeRule(
  "Run test Effects with it.effect from @effect/vitest and provide test layers instead of running a runtime manually.",
  (filename) => testFile.test(filename),
);

function unwrap(node) {
  while (
    node &&
    [
      "ChainExpression",
      "ParenthesizedExpression",
      "TSNonNullExpression",
      "TSAsExpression",
    ].includes(node.type)
  )
    node = node.expression;
  return node;
}

const schemaCompilers = new Set(
  ["is", "asserts"].concat(
    ...["decode", "decodeUnknown", "encode", "encodeUnknown"].map((prefix) =>
      ["Effect", "Exit", "Option", "Promise", "Result", "Sync"].map((kind) => prefix + kind),
    ),
  ),
);

function resolve(context, identifier) {
  for (let scope = context.sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable) return { scope, variable };
  }
  return undefined;
}

// A module-level or imported binding can be referenced from module scope.
function isModuleBinding(context, node) {
  while (node?.type === "MemberExpression") node = unwrap(node.object);
  if (node?.type !== "Identifier") return false;
  const binding = resolve(context, node);
  return (
    binding !== undefined &&
    (binding.scope.type === "module" ||
      binding.variable.defs.some((definition) => definition.type === "ImportBinding"))
  );
}

// A schema can be hoisted when it is a module binding or built from Schema constructors.
function isStaticSchema(context, node) {
  node = unwrap(node);
  if (node?.type === "Identifier" || node?.type === "MemberExpression")
    return isModuleBinding(context, node);
  const callee = unwrap(node?.callee);
  return (
    callee?.type === "MemberExpression" &&
    importedModule(context, unwrap(callee.object)) === "Schema"
  );
}

function schemaCompiler(context, callee) {
  callee = unwrap(callee);
  if (callee?.type === "MemberExpression") {
    if (importedModule(context, unwrap(callee.object)) !== "Schema") return undefined;
    const method = memberName(callee);
    return schemaCompilers.has(method) ? method : undefined;
  }
  if (callee?.type !== "Identifier") return undefined;
  const definition = resolve(context, callee)?.variable.defs[0];
  if (
    definition?.type !== "ImportBinding" ||
    definition.node.type !== "ImportSpecifier" ||
    definition.parent.source.value !== "effect/Schema"
  )
    return undefined;
  const method = definition.node.imported.name ?? definition.node.imported.value;
  return schemaCompilers.has(method) ? method : undefined;
}

// Ported from t3code's no-inline-schema-compile (MIT), using import resolution.
const schemaCompileScope = {
  meta: { type: "problem", schema: [] },
  create(context) {
    let depth = 0;
    const enter = () => depth++;
    const exit = () => depth--;
    return {
      FunctionDeclaration: enter,
      "FunctionDeclaration:exit": exit,
      FunctionExpression: enter,
      "FunctionExpression:exit": exit,
      ArrowFunctionExpression: enter,
      "ArrowFunctionExpression:exit": exit,
      CallExpression(node) {
        if (depth === 0) return;
        const method = schemaCompiler(context, node.callee);
        if (!method || !isStaticSchema(context, node.arguments[0])) return;
        context.report({
          node: node.callee,
          message: `Hoist Schema.${method}(...) to a module-level const; it compiles the schema on every call.`,
        });
      },
    };
  },
};

const wallClockCalls = new Set([
  "Date.now",
  "performance.now",
  "process.hrtime",
  "process.hrtime.bigint",
]);

function memberPath(node) {
  node = unwrap(node);
  if (node?.type === "Identifier") return node.name;
  if (node?.type !== "MemberExpression") return undefined;
  if (node.computed && typeof node.property.value !== "string") return undefined;
  const object = memberPath(node.object);
  return object && `${object}.${memberName(node)}`;
}

// Global object prefixes name the same clock, as in globalThis.Date.now().
function globalPath(node) {
  return memberPath(node)?.replace(/^(?:globalThis|window|self|global)\./, "");
}

// Ported from t3code's no-wall-clock-in-tests (MIT); mocking helpers may still seed fake time.
const noWallClockInTests = {
  meta: { type: "problem", schema: [] },
  create(context) {
    if (!testFile.test(context.filename)) return {};
    const seedsMock = (node) => {
      for (let child = node, parent = node.parent; parent; child = parent, parent = parent.parent) {
        if (parent.type !== "CallExpression" || parent.callee === child) continue;
        const path = memberPath(parent.callee) ?? "";
        if (
          /^vi\.(?:fn|mock|setSystemTime|spyOn)$|\.mock(?:Implementation|ResolvedValue|ReturnValue)(?:Once)?$/.test(
            path,
          )
        )
          return true;
      }
      return false;
    };
    const report = (node) => {
      if (!seedsMock(node))
        context.report({
          node,
          message:
            "Do not read the wall clock in tests. Use TestClock under it.effect, vi.setSystemTime, or a fixed date.",
        });
    };
    return {
      CallExpression(node) {
        const path = globalPath(node.callee);
        // Date() ignores its arguments and always returns the current time.
        if (wallClockCalls.has(path) || path === "Date") report(node);
      },
      NewExpression(node) {
        if (node.arguments.length === 0 && globalPath(node.callee) === "Date") report(node);
      },
    };
  },
};

// Check bindings so local functions named Promise or setTimeout remain ordinary code.
function globalReference(context, node, name) {
  node = unwrap(node);
  if (node?.type === "MemberExpression" && memberName(node) === name) {
    node = unwrap(node.object);
    if (!["globalThis", "window", "self", "global"].includes(node?.name)) return false;
  } else if (node?.type !== "Identifier" || node.name !== name) return false;
  return node.type === "Identifier" && !resolve(context, node)?.variable.defs.length;
}

function timerKind(context, callee) {
  callee = unwrap(callee);
  if (globalReference(context, callee, "setTimeout")) return "callback";
  let binding = callee;
  let method;
  if (callee?.type === "MemberExpression") {
    method = memberName(callee);
    binding = unwrap(callee.object);
  }
  if (binding?.type !== "Identifier") return undefined;
  const definition = resolve(context, binding)?.variable.defs[0];
  if (definition?.type !== "ImportBinding") return undefined;
  if (definition.node.type === "ImportSpecifier") {
    if (method) return undefined;
    method = definition.node.imported.name ?? definition.node.imported.value;
  }
  if (method !== "setTimeout") return undefined;
  const source = definition.parent.source.value;
  if (source === "node:timers/promises" || source === "timers/promises") return "promise";
  if (source === "node:timers" || source === "timers") return "callback";
  return undefined;
}

// Only direct Promise executors are inspected; this rule does not follow helper calls.
function inPromiseExecutor(context, node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      !["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"].includes(
        parent.type,
      )
    )
      continue;
    const constructor = parent.parent;
    return (
      constructor?.type === "NewExpression" &&
      constructor.arguments[0] === parent &&
      globalReference(context, constructor.callee, "Promise")
    );
  }
  return false;
}

const noTimerWaitsInTests = {
  meta: { type: "problem", schema: [] },
  create(context) {
    if (!testFile.test(context.filename) || /\.integration\.(?:test|spec)\./.test(context.filename))
      return {};
    return {
      CallExpression(node) {
        const kind = timerKind(context, node.callee);
        if (kind === "promise" || (kind === "callback" && inPromiseExecutor(context, node))) {
          context.report({
            node,
            message:
              "Replace timer waits with TestClock, an event signal, or a retry assertion. Live socket/process tests belong in *.integration.test.ts.",
          });
        }
      },
    };
  },
};

const suppressionReason = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const directive =
            /^\s*(?:(?:eslint|oxlint)-disable(?:-next-line|-line)?\b|@ts-(?:ignore|expect-error|nocheck)\b|@effect-diagnostics(?:-next-line)?\b)/;
          if (directive.test(comment.value) && !/--\s*\S/.test(comment.value)) {
            context.report({
              loc: comment.loc,
              message: "Explain this suppression with a '-- reason' suffix.",
            });
          }
        }
      },
    };
  },
};

export default {
  meta: { name: "starter" },
  rules: {
    "workspace-imports": workspaceImports,
    "no-wall-clock-in-tests": noWallClockInTests,
    "no-timer-waits-in-tests": noTimerWaitsInTests,
    "runtime-boundary": runtimeBoundary,
    "schema-compile-scope": schemaCompileScope,
    "suppression-reason": suppressionReason,
    "test-runtime": testRuntime,
  },
};
