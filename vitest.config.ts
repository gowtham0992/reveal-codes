import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Gives `*.properties.test.ts` files a 60 s test timeout (see the file). */
const SETUP = fileURLToPath(new URL("./vitest.setup.ts", import.meta.url));

function project(name: string, root: string) {
  return {
    test: {
      name,
      root,
      environment: "node",
      include: ["test/**/*.test.ts"],
      setupFiles: [SETUP],
    },
  };
}

export default defineConfig({
  test: {
    projects: [
      project("engine", "packages/engine"),
      project("verifier", "packages/verifier"),
      project("courtlistener-mcp", "packages/courtlistener-mcp"),
      project("web", "apps/web"),
      project("sentinel", "crew/sentinel"),
    ],
  },
});
