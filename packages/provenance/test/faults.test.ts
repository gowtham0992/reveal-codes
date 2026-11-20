import { describe, expect, it } from "vitest";
import {
  LOG_KEEP_BYTES,
  LOG_MAX_BYTES,
  cutLog,
  createFaultLog,
  formatFaultLine,
  shouldLogOverLimit,
} from "../src/io/faults.js";
import { memoryDeps } from "./support/memory-deps.js";

const LOG = "/ws/.kiro/provenance/errors.log";

function setup() {
  const deps = memoryDeps();
  deps.fs.put("/ws/.kiro/provenance/keep", "x");
  return { deps, log: createFaultLog(deps, LOG) };
}

describe("Fault_Log line", () => {
  it("is `<ISO time> <event> <path or -> <reason>` and nothing else", async () => {
    const { deps, log } = setup();
    await log.fault({ event: "agentStop", path: "src/a.ts", reason: "over_limit" });
    await log.fault({ event: "manual", path: null, reason: "deadline_reached:7" });
    expect(deps.fs.text(LOG)).toBe(
      "2026-01-01T00:00:00.000Z agentStop src/a.ts over_limit\n" +
        "2026-01-01T00:00:00.000Z manual - deadline_reached:7\n",
    );
  });

  it("keeps a path with spaces or line breaks on one line", () => {
    const line = formatFaultLine("T", { event: "e", path: "a b\nc", reason: "read_failed" });
    expect(line).toBe("T e a_b_c read_failed");
  });

  it("knows no_prompt_events and bad_sessions", async () => {
    const { deps, log } = setup();
    await log.fault({ event: "agentStop", path: null, reason: "no_prompt_events" });
    await log.fault({ event: "agentStop", path: null, reason: "bad_sessions" });
    expect(deps.fs.text(LOG)).toContain(" - no_prompt_events\n");
    expect(deps.fs.text(LOG)).toContain(" - bad_sessions\n");
  });
});

describe("trim at 256 KiB", () => {
  it("keeps the last 128 KiB at a line boundary, then appends", async () => {
    const { deps, log } = setup();
    const line = `${"x".repeat(99)}\n`;
    const count = Math.ceil((LOG_MAX_BYTES + 1) / line.length);
    deps.fs.put(LOG, line.repeat(count));
    await log.fault({ event: "e", path: null, reason: "exception" });
    const after = deps.fs.text(LOG) ?? "";
    const lines = after.split("\n");
    expect(after.length).toBeLessThanOrEqual(LOG_KEEP_BYTES + 100);
    expect(after.length).toBeGreaterThan(LOG_KEEP_BYTES - 200);
    expect(lines.slice(0, -2).every((l) => l === "x".repeat(99))).toBe(true);
    expect(lines.at(-2)).toMatch(/^\S+ e - exception$/);
  });

  it("does not trim a log of exactly 256 KiB", async () => {
    const { deps, log } = setup();
    deps.fs.put(LOG, "y".repeat(LOG_MAX_BYTES));
    await log.fault({ event: "e", path: null, reason: "exception" });
    expect((deps.fs.text(LOG) ?? "").startsWith("yyyy")).toBe(true);
    expect(deps.fs.text(LOG)?.length).toBeGreaterThan(LOG_MAX_BYTES);
  });

  it("cutLog keeps the whole tail when the cut falls on a line boundary", () => {
    const enc = new TextEncoder();
    const bytes = enc.encode(`${"b".repeat(9)}\n${"c".repeat(LOG_KEEP_BYTES)}`);
    expect(cutLog(bytes).length).toBe(LOG_KEEP_BYTES);
  });

  it("cutLog starts after the first line feed of the tail when the cut is inside a line", () => {
    const enc = new TextEncoder();
    const bytes = enc.encode(`${"z".repeat(10)}abc\nrest\n${"q".repeat(LOG_KEEP_BYTES - 9)}`);
    expect(new TextDecoder().decode(cutLog(bytes))).toBe(`rest\n${"q".repeat(LOG_KEEP_BYTES - 9)}`);
  });

  it("returns the empty log when the tail holds no line feed", () => {
    expect(cutLog(new Uint8Array(LOG_KEEP_BYTES + 5).fill(97)).length).toBe(0);
  });
});

describe("an unwritable log", () => {
  it("discards the line and does not throw or change the file", async () => {
    const { deps, log } = setup();
    deps.fs.put(LOG, "old\n");
    deps.fs.failWhen((op) => (op === "append" ? "EACCES" : null));
    await expect(
      log.fault({ event: "e", path: null, reason: "exception" }),
    ).resolves.toBeUndefined();
    expect(deps.fs.text(LOG)).toBe("old\n");
  });

  it("discards the trim when the rewrite fails and still appends nothing it cannot write", async () => {
    const { deps, log } = setup();
    deps.fs.put(LOG, "z\n".repeat(LOG_MAX_BYTES / 2 + 1));
    const before = deps.fs.text(LOG);
    deps.fs.failWhen((op) => (op === "rename" || op === "append" ? "EIO" : null));
    await log.fault({ event: "e", path: null, reason: "exception" });
    expect(deps.fs.text(LOG)).toBe(before);
    expect([...deps.fs.files.keys()].some((k) => k.includes(".tmp-"))).toBe(false);
  });
});

describe("over_limit once for each file (M10)", () => {
  const skipped = { "a.json": { size: 5, mtimeMs: 9, reason: "over_limit" as const } };
  it("logs a file that was not skipped before", () => {
    expect(shouldLogOverLimit({}, "a.json", 5, 9)).toBe(true);
  });
  it("does not log it again while size and modification time are the same", () => {
    expect(shouldLogOverLimit(skipped, "a.json", 5, 9)).toBe(false);
  });
  it("logs it again when the size or the modification time changed", () => {
    expect(shouldLogOverLimit(skipped, "a.json", 6, 9)).toBe(true);
    expect(shouldLogOverLimit(skipped, "a.json", 5, 10)).toBe(true);
  });
});
