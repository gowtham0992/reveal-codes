import { readdirSync, readFileSync } from "node:fs";
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
    expect(manifest.dependencies?.["fflate"]).toBe("0.8.3");
    expect(manifest.devDependencies?.["fast-check"]).toBe("4.10.2");
  });

  it("uses the workspace protocol for Engine and Verifier", () => {
    expect(manifest.dependencies?.["@reveal-codes/engine"]).toBe("workspace:*");
    expect(manifest.devDependencies?.["@reveal-codes/verifier"]).toBe("workspace:*");
  });

  it("has docx and fflate as the only third-party runtime dependencies", () => {
    const runtime = Object.keys(manifest.dependencies ?? {}).filter((n) => !WORKSPACE.includes(n));
    expect(runtime.sort()).toEqual(["docx", "fflate"]);
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

type HookFile = {
  version: string;
  hooks: {
    name: string;
    trigger: string;
    matcher: string;
    timeout_ms?: number;
    action: { type: string; command: string };
  }[];
};

const HOOKS_DIR = fileURLToPath(new URL("../../../.kiro/hooks/", import.meta.url));
const readHook = (file: string): HookFile =>
  JSON.parse(readFileSync(`${HOOKS_DIR}${file}`, "utf8")) as HookFile;
const exportHook = readHook("export-tests-on-save.json").hooks[0];

describe("export-tests-on-save hook _Requirements: 10.2_", () => {
  it("parses with the expected name, trigger and version", () => {
    expect(readHook("export-tests-on-save.json").version).toBe("v1");
    expect(exportHook?.name).toBe("Export tests on save");
    expect(exportHook?.trigger).toBe("PostFileSave");
  });

  it("has the same timeout as every other hook file", () => {
    const others = readdirSync(HOOKS_DIR).filter(
      (f) => f.endsWith(".json") && f !== "export-tests-on-save.json",
    );
    expect(others.length).toBeGreaterThan(0);
    for (const file of others) {
      for (const hook of readHook(file).hooks) {
        if (hook.timeout_ms === undefined) continue;
        expect(exportHook?.timeout_ms, file).toBe(hook.timeout_ms);
      }
    }
    expect(exportHook?.timeout_ms).toBe(120000);
  });

  it("matches export src and test files only", () => {
    const re = new RegExp(exportHook?.matcher ?? "$^");
    expect(re.test("packages/export/src/a.ts")).toBe(true);
    expect(re.test("packages/export/test/a.ts")).toBe(true);
    expect(re.test("apps/web/src/a.ts")).toBe(false);
    expect(re.test("packages/engine/src/a.ts")).toBe(false);
  });

  it("runs the export project once, not in watch mode", () => {
    const command = exportHook?.action.command ?? "";
    expect(command).toContain("--project export");
    expect(command).not.toContain("--watch");
    expect(command).toContain("vitest run");
  });
});
