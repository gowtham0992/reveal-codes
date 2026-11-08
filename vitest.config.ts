import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Gives `*.properties.test.ts` files a 60 s test timeout (see the file). */
const SETUP = fileURLToPath(new URL("./vitest.setup.ts", import.meta.url));

function project(name: string, root: string, include: string[] = ["test/**/*.test.ts"]) {
  return {
    test: {
      name,
      root,
      environment: "node",
      include,
      setupFiles: [SETUP],
    },
  };
}

/** The web project also runs component tests and compiles JSX with the automatic runtime. */
const WEB = {
  ...project("web", "apps/web", ["test/**/*.test.ts", "test/**/*.test.tsx"]),
  oxc: { jsx: { runtime: "automatic" } },
};

export default defineConfig({
  test: {
    projects: [
      project("engine", "packages/engine"),
      project("verifier", "packages/verifier"),
      project("courtlistener-mcp", "packages/courtlistener-mcp"),
      WEB,
      project("sentinel", "crew/sentinel"),
    ],
  },
});
