import { defineConfig } from "vitest/config";

function project(name: string, root: string) {
  return {
    test: {
      name,
      root,
      environment: "node",
      include: ["test/**/*.test.ts"],
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
