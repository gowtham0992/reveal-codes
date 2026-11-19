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
    timeout?: number;
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
      "pnpm --filter @reveal-codes/sentinel run cli",
    );
  });
});

describe("sentinel-tests-on-save hook", () => {
  it("has the expected shape", () => {
    expect(hookFile.version).toBe("v1");
    expect(hookFile.hooks).toHaveLength(1);
    expect(hook.name).toBe("Sentinel tests on save");
    expect(hook.trigger).toBe("PostFileSave");
    expect(hook.timeout).toBe(120);
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
        if (h.timeout !== undefined) expect(h.timeout, name).toBe(hook.timeout);
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

function readRepoFile(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), "utf8");
}

function countMatches(text: string, pattern: RegExp): number {
  return text.split("\n").filter((line) => pattern.test(line)).length;
}

function sentinelSection(readme: string): string {
  const lines = readme.split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s+Sentinel\s*$/.test(line));
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

describe("README Sentinel section", () => {
  const readme = readRepoFile("README.md");
  const section = sentinelSection(readme);

  it("has exactly one Sentinel heading", () => {
    expect(countMatches(readme, /^#{1,6}\s+Sentinel\s*$/)).toBe(1);
  });

  it("names the four environment variables", () => {
    for (const name of [
      "COURTLISTENER_TOKEN",
      "REVEAL_CODES_FIXTURES_ONLY",
      "REVEAL_CODES_CACHE_DIR",
      "COURTLISTENER_BASE_URL",
    ]) {
      expect(section, name).toContain(name);
    }
  });

  it("shows the sweep command", () => {
    expect(section).toContain("pnpm sentinel sweep ~/Filings");
  });

  it("has no crew app repo placeholder and one line linking the crew app repository", () => {
    expect(readme).not.toContain("<crew app repo>");
    const linked = section
      .split("\n")
      .filter(
        (line) =>
          line.includes("https://github.com/gowtham0992/reveal-codes-sentinel") &&
          line.includes("separate repository"),
      );
    expect(linked).toHaveLength(1);
  });

  it("does not contain the two trimmed Court-specific sentences", () => {
    expect(readme).not.toContain("Long titles in the Picker are cut at 60 characters");
    expect(readme).not.toContain(
      'Counts use the right singular or plural ("1 prompt", "3 prompts").',
    );
  });
});

describe("docs/KIRO_USAGE.md rows", () => {
  const rows = readRepoFile("docs", "KIRO_USAGE.md")
    .split("\n")
    .filter((line) => line.startsWith("|") && /sentinel/i.test(line));

  it("holds exactly four sentinel rows", () => {
    expect(rows).toHaveLength(4);
  });

  it("has a spec row naming all five spec files", () => {
    const row = rows.find((r) => r.startsWith("| Spec | sentinel-sweep |")) ?? "";
    for (const file of [
      ".config.kiro",
      "requirements.md",
      "design.md",
      "tasks.md",
      "tasks.meta.json",
    ]) {
      expect(row, file).toContain(`.kiro/specs/sentinel-sweep/${file}`);
    }
  });

  it("has a hook row with the hook path", () => {
    const row = rows.find((r) => r.startsWith("| Hook |")) ?? "";
    expect(row).toContain(".kiro/hooks/sentinel-tests-on-save.json");
  });

  it("has a steering row for structure.md and tech.md", () => {
    const row = rows.find((r) => r.startsWith("| Steering |")) ?? "";
    expect(row).toContain(".kiro/steering/structure.md");
    expect(row).toContain(".kiro/steering/tech.md");
  });
});

describe("steering files", () => {
  it("structure.md carries the required crew/sentinel line", () => {
    const structure = readRepoFile(".kiro", "steering", "structure.md");
    expect(structure).toContain(
      "sentinel/                 the sweep CLI that the Reveal Codes Sentinel Crew app (separate repository) runs on a schedule",
    );
    expect(countMatches(structure, /crew\/sentinel.*Crew app|Crew app.*crew\/sentinel/)).toBe(0);
  });

  it("tech.md has pnpm sentinel once in the Commands block and no Crew app entry", () => {
    const tech = readRepoFile(".kiro", "steering", "tech.md");
    expect(tech).not.toContain("Crew app: `crew/sentinel`");
    const afterHeading = tech.slice(tech.indexOf("## Commands"));
    const block = afterHeading.split("```")[1] ?? "";
    expect(countMatches(block, /^pnpm sentinel\s+#\s+\S/)).toBe(1);
    expect(countMatches(tech, /^pnpm sentinel\b/)).toBe(1);
  });
});

describe(".env.example", () => {
  it("contains the four variable names", () => {
    const env = readRepoFile(".env.example");
    for (const name of [
      "COURTLISTENER_TOKEN",
      "COURTLISTENER_BASE_URL",
      "REVEAL_CODES_FIXTURES_ONLY",
      "REVEAL_CODES_CACHE_DIR",
    ]) {
      expect(env, name).toContain(name);
    }
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
