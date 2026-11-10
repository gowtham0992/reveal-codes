import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WEB_ROOT } from "../support/scan";

const SCRIPT = join(WEB_ROOT, "..", "..", "scripts", "kiro-usage-check.mjs");
const HEADER = "| Kind | Name | Path | Why it exists |\n| ---- | ---- | ---- | ------------- |\n";
const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A temp repository holding `files` (path to text), with `rows` as the KIRO_USAGE table body. */
function repo(files: readonly string[], rows: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "kiro-check-"));
  made.push(dir);
  for (const file of [...files, "docs/KIRO_USAGE.md"]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), file === "docs/KIRO_USAGE.md" ? HEADER + rows.join("\n") : "x");
  }
  return dir;
}

function run(dir: string): { status: number | null; lines: string[] } {
  const out = spawnSync("node", [SCRIPT, dir], { encoding: "utf8" });
  return { status: out.status, lines: out.stdout.split("\n").filter((l) => l !== "") };
}

const FILES = [".kiro/hooks/a.json", ".kiro/agents/b.md", ".kiro/skills/c/SKILL.md"];
const ROWS = [
  "| Hook | A | .kiro/hooks/a.json | one |",
  "| Agent | B | .kiro/agents/b.md | two |",
  "| Skill | C | .kiro/skills/c/SKILL.md | three |",
];

describe("kiro-usage-check script", () => {
  it("exits 0 and prints counts by kind for a complete table", () => {
    const result = run(
      repo(
        [...FILES, ".kiro/specs/s/design.md"],
        [...ROWS, "| Spec | S | .kiro/specs/s/design.md | four |"],
      ),
    );
    expect(result.status).toBe(0);
    expect(result.lines).toEqual([
      "docs/KIRO_USAGE.md: 4 rows. Hook: 1, Agent: 1, Skill: 1, Spec: 1",
    ]);
  });

  it("exits 1 with one line for a file that has no row", () => {
    const result = run(repo(FILES, ROWS.slice(0, 2)));
    expect(result.status).toBe(1);
    expect(result.lines).toEqual(["not in docs/KIRO_USAGE.md: .kiro/skills/c/SKILL.md"]);
  });

  it("exits 1 with one line for a spec directory that has no row", () => {
    const result = run(repo([...FILES, ".kiro/specs/s/design.md"], ROWS));
    expect(result.status).toBe(1);
    expect(result.lines).toEqual(["not in docs/KIRO_USAGE.md: .kiro/specs/s/ (spec directory)"]);
  });

  it("exits 1 with one line for a named path that does not exist", () => {
    const dead = "| Steering | D | .kiro/steering/dead.md | five |";
    const result = run(repo(FILES, [...ROWS, dead]));
    expect(result.status).toBe(1);
    expect(result.lines).toEqual([
      "docs/KIRO_USAGE.md names a path that does not exist: .kiro/steering/dead.md",
    ]);
  });
});
