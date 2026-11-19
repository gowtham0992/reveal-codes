import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
/** Pinned before any worker starts so worker processes inherit it (export dates are local dates). */
const EXPORT_TZ = "America/Los_Angeles";
process.env.TZ = EXPORT_TZ;

/** Gives `*.properties.test.ts` files a 60 s test timeout (see the file). */
const SETUP = fileURLToPath(new URL("./vitest.setup.ts", import.meta.url));

function project(
  name: string,
  root: string,
  include: string[] = ["test/**/*.test.ts"],
  env: Record<string, string> = {},
) {
  return {
    test: {
      name,
      root,
      environment: "node",
      include,
      setupFiles: [SETUP],
      env,
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
      project("provenance", "packages/provenance"),
      project("export", "packages/export", ["test/**/*.test.ts"], { TZ: EXPORT_TZ }),
      project("courtlistener-mcp", "packages/courtlistener-mcp"),
      WEB,
      project("sentinel", "crew/sentinel"),
    ],
  },
});
