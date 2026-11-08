import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Manifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  exports?: unknown;
};

function readManifest(relative: string): Manifest {
  const url = new URL(relative, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Manifest;
}

const web = readManifest("../../package.json");
const verifier = readManifest("../../../../packages/verifier/package.json");
const deps = { ...web.dependencies, ...web.devDependencies };
const WORKSPACE = ["@reveal-codes/engine", "@reveal-codes/verifier", "@reveal-codes/export"];
const COPY_STEP = "node --import jiti/register scripts/copy-demo.ts";
const BANNED =
  /^(tailwindcss|@tailwindcss\/.*|styled-components|@emotion\/.*|@mui\/.*|@chakra-ui\/.*|@radix-ui\/.*|antd|@mantine\/.*|lucide-react|react-icons|@heroicons\/.*|@stitches\/.*|@vanilla-extract\/.*|@tiptap\/starter-kit)$/;

describe("apps/web package.json _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10_", () => {
  it("pins every third-party dependency exactly, with no range operator", () => {
    for (const [name, version] of Object.entries(deps)) {
      if (WORKSPACE.includes(name)) continue;
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("uses the workspace protocol for the Engine and Verifier", () => {
    for (const name of WORKSPACE) expect(deps[name], name).toBe("workspace:*");
  });

  it("runs the demo copy step before dev and build", () => {
    expect(web.scripts?.["predev"]).toBe(COPY_STEP);
    expect(web.scripts?.["prebuild"]).toBe(COPY_STEP);
  });

  it("uses webpack for dev and build", () => {
    expect(web.scripts?.["dev"]).toBe("next dev --port 3000 --webpack");
    expect(web.scripts?.["build"]).toBe("next build --webpack");
    expect(web.scripts?.["start"]).toContain("next start");
  });

  it("has no UI library, Tailwind, or CSS-in-JS dependency", () => {
    for (const name of Object.keys(deps)) expect(name, name).not.toMatch(BANNED);
  });
});

describe("verifier package.json _Requirements: 1.8_", () => {
  it("exports the root and the quote subpath", () => {
    expect(verifier.exports).toEqual({ ".": "./src/index.ts", "./quote": "./src/quote.ts" });
  });
});
