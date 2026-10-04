import { defineConfig } from "tsup";

export default defineConfig({
  noExternal: ["@effect-starter/contracts"],
});
