import { eslintCompatPlugin } from "@oxlint/plugins";

import { noManualEffectErrorTagRule } from "./rules/no-manual-effect-error-tag.ts";
import { noManualTaggedConstructionRule } from "./rules/no-manual-tagged-construction.ts";

/** The vendored subset of anti-slop's Effect rules. See ../UPSTREAM.md. */
export default eslintCompatPlugin({
  meta: { name: "anti-slop-effect" },
  rules: {
    "no-manual-effect-error-tag": noManualEffectErrorTagRule,
    "no-manual-tagged-construction": noManualTaggedConstructionRule,
  },
});
