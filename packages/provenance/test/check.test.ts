import { describe, expect, it } from "vitest";
import {
  checkWorkspace,
  recordName,
  RECORD_HINT,
  type CheckFacts,
  type CheckedFile,
} from "../src/core/check.js";

const D1 = "a".repeat(64);
const D2 = "b".repeat(64);

function file(path: string, text = "x", digest = D1): CheckedFile {
  return { path, digest, text };
}

function facts(over: Partial<CheckFacts>): CheckFacts {
  return { files: [], records: {}, entries: {}, strict: false, ...over };
}

describe("checkWorkspace (Req 11, 16.10)", () => {
  it("a clean workspace prints the count and exits 0", () => {
    const result = checkWorkspace(
      facts({
        files: [file("a.ts"), file("b.ts", "y")],
        records: { "a.ts": { ok: true, text: "x" } },
        entries: { "b.ts": D1 },
      }),
    );
    expect(result.lines).toEqual(["checked 2 files: ok"]);
    expect(result.status).toBe(0);
  });

  it("an unrecorded file with an unchanged baseline hash is not a fault", () => {
    const result = checkWorkspace(facts({ files: [file("a.ts")], entries: { "a.ts": D1 } }));
    expect(result.failures).toEqual([]);
    expect(result.reports).toEqual([]);
  });

  it("a tampered Record fails", () => {
    const result = checkWorkspace(
      facts({ files: [file("a.ts")], records: { "a.ts": { ok: false } } }),
    );
    expect(result.lines).toEqual([`fail tampered_record: ${recordName("a.ts")}`]);
    expect(result.status).toBe(1);
  });

  it("an orphan Record fails", () => {
    const result = checkWorkspace(facts({ records: { "gone.ts": { ok: true, text: "x" } } }));
    expect(result.lines).toEqual([`fail orphan_record: ${recordName("gone.ts")}`]);
    expect(result.status).toBe(1);
  });

  it("an orphan baseline entry fails", () => {
    const result = checkWorkspace(facts({ entries: { "gone.ts": D1 } }));
    expect(result.lines).toEqual(["fail orphan_baseline: gone.ts"]);
    expect(result.status).toBe(1);
  });

  it("a path with both a Record and an entry is orphan_baseline", () => {
    const result = checkWorkspace(
      facts({
        files: [file("a.ts")],
        records: { "a.ts": { ok: true, text: "x" } },
        entries: { "a.ts": D1 },
      }),
    );
    expect(result.lines).toEqual(["fail orphan_baseline: a.ts"]);
    expect(result.status).toBe(1);
  });

  it("a stale Record and a stale entry are reports with the hint, exit 0", () => {
    const result = checkWorkspace(
      facts({
        files: [file("a.ts", "new"), file("b.ts", "y", D2)],
        records: { "a.ts": { ok: true, text: "old" } },
        entries: { "b.ts": D1 },
      }),
    );
    expect(result.lines).toEqual(["report stale: a.ts", "report stale: b.ts", RECORD_HINT]);
    expect(result.status).toBe(0);
  });

  it("a no_record file is a report with the hint, exit 0", () => {
    const result = checkWorkspace(facts({ files: [file("a.ts")] }));
    expect(result.lines).toEqual(["report no_record: a.ts", RECORD_HINT]);
    expect(result.status).toBe(0);
  });

  it("both reports fail under --strict", () => {
    const base = { files: [file("a.ts", "new"), file("b.ts")] };
    const records = { "a.ts": { ok: true, text: "old" } } as const;
    const result = checkWorkspace(facts({ ...base, records, strict: true }));
    expect(result.reports).toHaveLength(2);
    expect(result.status).toBe(1);
    expect(result.lines.at(-1)).toBe(RECORD_HINT);
  });

  it("lists every problem in path order, with the hint last", () => {
    const result = checkWorkspace(
      facts({
        files: [file("c.ts"), file("a.ts", "new"), file("b.ts")],
        records: { "a.ts": { ok: true, text: "old" }, "b.ts": { ok: false } },
        entries: { "z.ts": D1 },
      }),
    );
    expect(result.lines).toEqual([
      "report stale: a.ts",
      `fail tampered_record: ${recordName("b.ts")}`,
      "report no_record: c.ts",
      "fail orphan_baseline: z.ts",
      RECORD_HINT,
    ]);
    expect(result.failures).toHaveLength(2);
    expect(result.status).toBe(1);
  });
});
