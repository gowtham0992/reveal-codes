import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APPENDIX_TITLE, STATEMENT_TITLE } from "@reveal-codes/export";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const HOOKS_DIR = join(REPO_ROOT, ".kiro", "hooks");

type Json = Record<string, unknown>;

function readJson(path: string): Json {
  return JSON.parse(readFileSync(path, "utf8")) as Json;
}

function stringMap(value: unknown): Record<string, string> {
  return value as Record<string, string>;
}

function thrown(message: string): never {
  throw new Error(message);
}
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

const manifest = readJson(join(REPO_ROOT, "crew", "sentinel", "package.json"));
const rootManifest = readJson(join(REPO_ROOT, "package.json"));
const hookFile = readJson(join(HOOKS_DIR, "sentinel-tests-on-save.json")) as unknown as HookFile;
const hook = hookFile.hooks.at(0) ?? thrown("sentinel-tests-on-save.json holds no hook");
const matcher = new RegExp(hook.matcher);

describe("sentinel package manifest", () => {
  it("lists exactly the dependencies of the design", () => {
    expect(stringMap(manifest["dependencies"])).toEqual({
      "@reveal-codes/engine": "workspace:*",
      "@reveal-codes/export": "workspace:*",
      "@reveal-codes/verifier": "workspace:*",
      fflate: "0.8.3",
    });
  });

  it("lists exactly the devDependencies of the design", () => {
    expect(stringMap(manifest["devDependencies"])).toEqual({
      "fast-check": "4.10.2",
      vitest: "5.1.0",
    });
  });

  it("uses pinned versions and no docx entry", () => {
    const all = {
      ...stringMap(manifest["dependencies"]),
      ...stringMap(manifest["devDependencies"]),
    };
    expect(Object.keys(all)).not.toContain("docx");
    for (const [name, version] of Object.entries(all)) {
      if (version === "workspace:*") continue;
      expect(version, name).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("defines the cli script and the root sentinel script", () => {
    expect(stringMap(manifest["scripts"])["cli"]).toBe("node --import jiti/register src/cli.ts");
    expect(stringMap(rootManifest["scripts"])["sentinel"]).toBe(
      "pnpm --filter @reveal-codes/sentinel run cli --",
    );
  });
});

describe("sentinel-tests-on-save hook", () => {
  it("has the expected shape", () => {
    expect(hookFile.version).toBe("v1");
    expect(hookFile.hooks).toHaveLength(1);
    expect(hook.name).toBe("Sentinel tests on save");
    expect(hook.trigger).toBe("PostFileSave");
    expect(hook.timeout_ms).toBe(120000);
    expect(hook.action.type).toBe("command");
    expect(hook.action.command).toBe(
      "perl -e 'alarm shift; exec @ARGV' 120 pnpm vitest run --project sentinel --passWithNoTests",
    );
  });

  it("uses the same timeout as every other hook file", () => {
    const files = readdirSync(HOOKS_DIR).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThan(1);
    for (const name of files) {
      const other = readJson(join(HOOKS_DIR, name)) as unknown as HookFile;
      for (const h of other.hooks) {
        if (h.timeout_ms !== undefined) expect(h.timeout_ms, name).toBe(hook.timeout_ms);
      }
    }
  });

  it("matches sentinel sources and tests only", () => {
    expect(matcher.test("crew/sentinel/src/run.ts")).toBe(true);
    expect(matcher.test("crew/sentinel/test/report.test.ts")).toBe(true);
    expect(matcher.test("crew/sentinel/package.json")).toBe(false);
    expect(matcher.test("packages/export/src/index.ts")).toBe(false);
    expect(matcher.test("apps/web/src/a.ts")).toBe(false);
  });

  it("runs the sentinel project once, without watch", () => {
    expect(hook.action.command).toContain("--project sentinel");
    expect(hook.action.command).not.toContain("--watch");
  });
});

describe("export package titles", () => {
  it("exports STATEMENT_TITLE and APPENDIX_TITLE with their values", () => {
    expect(STATEMENT_TITLE).toBe("AI-Use and Verification Statement");
    expect(APPENDIX_TITLE).toBe("Provenance Appendix");
  });
});

describe("BUILD_LOG entry", () => {
  it("names the criterion-17 outcome for sentinel-sweep", () => {
    const log = readFileSync(join(REPO_ROOT, "BUILD_LOG.md"), "utf8");
    const start = log.indexOf("## 2026-11-08 sentinel-sweep");
    expect(start).toBeGreaterThanOrEqual(0);
    const entry = log.slice(start);
    expect(entry).toContain("Criterion 17 outcome");
    expect(entry).toContain("src/testing");
  });
});
