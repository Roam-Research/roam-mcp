import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve the core workspace package to its TypeScript SOURCE for tests.
//
// Published `exports` intentionally point only at dist/ (no `development`
// condition — see GitHub issue #30 and CLAUDE.md), so without this alias
// Vitest resolves @roam-research/roam-tools-core to packages/core/dist/,
// which doesn't exist on a clean checkout — every test file fails to collect
// until `npm run build` has run. This mirrors what tsconfig.dev.json does for
// `npm run mcp` / `npm run cli` (tsx), and is never published.
export default defineConfig({
  resolve: {
    alias: {
      "@roam-research/roam-tools-core": fileURLToPath(
        new URL("../core/src/index.ts", import.meta.url),
      ),
    },
  },
});
