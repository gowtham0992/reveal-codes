import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hookFileText } from "../../src/core/hook-file.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const HOOKS_DIR = join(ROOT, ".kiro/hooks");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

type Hook = {
  trigger: string;
  enabled?: unknown;
  timeout?: unknown;
  timeout_ms?: unknown;
  matcher?: unknown;
} & {
  action: { type: string; command: string };
};
const parsed = (text: string): { hooks: Hook[] } => JSON.parse(text) as { hooks: Hook[] };

describe("Hook_File 0-provenance.json (Req 8.1-8.3, 8.9, 7.11)", () => {
  it("equals hookFileText() byte for byte", () => {
    expect(read(".kiro/hooks/0-provenance.json")).toBe(hookFileText());
  });

  it("holds exactly four hooks with the four triggers, timeout 30, enabled true, no timeout_ms and no matcher", () => {
    const { hooks } = parsed(hookFileText());
    expect(hooks.map((h) => h.trigger)).toEqual([
      "UserPromptSubmit",
      "Stop",
      "PreTaskExec",
      "PostTaskExec",
    ]);
    for (const h of hooks) {
      expect(h.timeout).toBe(30);
      expect(h.enabled).toBe(true);
      expect("timeout_ms" in h).toBe(false);
      expect("matcher" in h).toBe(false);
      expect(h.action.type).toBe("command");
    }
  });

  it("runs record <event> with both streams to /dev/null, ends in || true and leaves stdin alone", () => {
    const events = ["promptSubmit", "agentStop", "preTask", "postTask"];
    parsed(hookFileText()).hooks.forEach((h, i) => {
      expect(h.action.command).toBe(
        `node .kiro/provenance/provenance.mjs record ${events[i] ?? ""} >/dev/null 2>&1 || true`,
      );
      expect(h.action.command).not.toContain("<");
    });
  });
});

describe("Hook order and other hooks (Req 8.4, 8.5, 8.7, 15.8, 15.9)", () => {
  it("sorts 0-provenance.json before commit-on-task.json byte-wise", () => {
    const a = Buffer.from("0-provenance.json");
    const b = Buffer.from("commit-on-task.json");
    expect(Buffer.compare(a, b)).toBeLessThan(0);
    const names = readdirSync(HOOKS_DIR).sort((x, y) =>
      Buffer.compare(Buffer.from(x), Buffer.from(y)),
    );
    expect(names[0]).toBe("0-provenance.json");
  });

  it("leaves scripts/commit-task.sh and commit-on-task.json unchanged", () => {
    execFileSync("git", ["diff", "--quiet", "--", "scripts/commit-task.sh"], { cwd: ROOT });
    execFileSync("git", ["diff", "--quiet", "--", ".kiro/hooks/commit-on-task.json"], {
      cwd: ROOT,
    });
  });

  it("keeps timeout 120 and no timeout_ms in the five test hooks", () => {
    const files = readdirSync(HOOKS_DIR).filter((f) => f.endsWith("-tests-on-save.json"));
    expect(files).toHaveLength(5);
    for (const f of files) {
      const text = read(`.kiro/hooks/${f}`);
      const { hooks } = parsed(text);
      expect(hooks.every((h) => h.timeout === 120)).toBe(true);
      expect(text).not.toContain("timeout_ms");
    }
  });

  it("gives commit-task.sh the same scope with and without a path under .kiro/provenance/", () => {
    const scope = (paths: string[]): string =>
      execFileSync("bash", [join(ROOT, "scripts/commit-task.sh"), "--print-scope"], {
        input: `${paths.join("\n")}\n`,
        encoding: "utf8",
      });
    const work = ["packages/provenance/src/core/hook-file.ts"];
    const record = ".kiro/provenance/records/packages/provenance/src/core/hook-file.ts.json";
    expect(scope([...work, record])).toBe(scope(work));
    expect(scope([record])).toBe("repo");
  });
});
