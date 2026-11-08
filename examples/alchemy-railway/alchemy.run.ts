import * as Alchemy from "alchemy";
import * as Railway from "@alchemy.run/railway";
import { Effect } from "effect";

export default Alchemy.Stack(
  "effect-starter-railway",
  { providers: Railway.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const project = yield* Railway.Project("Project");
    const database = yield* Railway.Postgres("Database", {
      project,
      // Railway.ref uses the logical ID; keep the physical name identical.
      name: "Database",
      public: false,
    });
    const api = yield* Railway.Service("Api", {
      project,
      context: "./.build",
      port: 3000,
      env: { DATABASE_URL: Railway.ref(database, "DATABASE_URL") },
      preDeploy: { command: "./node_modules/.bin/drizzle-kit migrate" },
      healthcheck: "/api/health",
      healthcheckTimeout: 120,
    });
    return { url: api.url, projectId: project.projectId };
  }),
);
