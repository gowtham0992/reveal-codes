import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

type Manifest = {
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const manifest = JSON.parse(read("../package.json")) as Manifest;
const WORKSPACE = ["@reveal-codes/engine", "@reveal-codes/verifier"];
const external = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
  ([name]) => !WORKSPACE.includes(name),
);

describe("packages/export package.json _Requirements: 10.1, 10.2, 9.1_", () => {
  it("pins every external version exactly, with no range operator", () => {
    expect(external.length).toBeGreaterThan(0);
    for (const [name, version] of external) {
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
      expect(version, name).not.toMatch(/[\^~><*x]/);
    }
  });

  it("pins the expected versions", () => {
    expect(manifest.dependencies?.["docx"]).toBe("9.15.3");
    expect(manifest.devDependencies?.["fflate"]).toBe("0.8.3");
    expect(manifest.devDependencies?.["fast-check"]).toBe("4.10.2");
  });

  it("uses the workspace protocol for Engine and Verifier", () => {
    expect(manifest.dependencies?.["@reveal-codes/engine"]).toBe("workspace:*");
    expect(manifest.devDependencies?.["@reveal-codes/verifier"]).toBe("workspace:*");
  });

  it("has docx as the only third-party runtime dependency", () => {
    const runtime = Object.keys(manifest.dependencies ?? {}).filter((n) => !WORKSPACE.includes(n));
    expect(runtime).toEqual(["docx"]);
  });

  it("exports ./src/index.ts", () => {
    expect(manifest.exports).toBe("./src/index.ts");
  });
});

describe("root vitest.config.ts _Requirements: 10.2_", () => {
  const config = read("../../../vitest.config.ts");

  it("names an export project rooted at packages/export with the default include", () => {
    expect(config).toMatch(/project\(\s*"export"\s*,\s*"packages\/export"/);
    expect(config).toMatch(
      /project\(\s*"export"\s*,\s*"packages\/export"\s*,\s*\["test\/\*\*\/\*\.test\.ts"\]/,
    );
  });

  it("pins TZ to America/Los_Angeles for the process and the project env", () => {
    expect(config).toContain('const EXPORT_TZ = "America/Los_Angeles"');
    expect(config).toContain("process.env.TZ = EXPORT_TZ");
    expect(config).toMatch(/\{\s*TZ:\s*EXPORT_TZ\s*\}/);
  });
});
