import { createDocument } from "@reveal-codes/engine";
import type { VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { lookup, planLookup, resultsForRecords } from "../src/lookup";
import { makeDeps } from "./support/make-deps";

function plan(text: string) {
  const doc = createDocument(text, "2026-11-02T12:00:00.000Z");
  if (!doc.ok) throw new Error("createDocument failed");
  return {
    p: planLookup(doc.value.citations),
    keys: doc.value.citations.flatMap((c) => ("key" in c ? [c.key] : [])),
  };
}

const verified = (id: string): VerificationResult => ({ status: "verified", clusterId: id });
const marker: VerificationResult = { status: "ambiguous", candidates: ["a", "b"] };

describe("planLookup", () => {
  it("plans unique lines in chunks and indexes every Full_Record", () => {
    const { p } = plan("410 U.S. 113. Id. at 5. 410 U.S. 113. 2024 WL 123456. 598 F.3d 1.");
    expect(p.lines).toEqual(["410 U.S. 113", "598 F.3d 1"]);
    expect(p.chunks).toEqual([{ lines: p.lines, oversize: false }]);
    expect(p.index.members.size).toBe(4);
  });
  it("plans nothing for text with no Full_Records", () => {
    const { p } = plan("No citations. Id. at 5.");
    expect(p.lines).toEqual([]);
    expect(p.chunks).toEqual([]);
  });
});

describe("resultsForRecords", () => {
  it("gives database records a bare unchecked and one-member records their line result", () => {
    const { p, keys } = plan("2024 WL 123456. 410 U.S. 113.");
    const r = resultsForRecords(p.index, new Map([["410 U.S. 113", verified("9")]]), () => marker);
    expect(r.get(keys[0] ?? "")).toEqual({ status: "unchecked" });
    expect(r.get(keys[1] ?? "")).toEqual(verified("9"));
  });
  it("calls combine with the member results, in member order, for a parallel record", () => {
    const { p, keys } = plan("Roe v. Wade, 410 U.S. 113, 93 S. Ct. 705 (1973).");
    let seen: readonly VerificationResult[] = [];
    const r = resultsForRecords(
      p.index,
      new Map([
        ["410 U.S. 113", verified("1")],
        ["93 S. Ct. 705", { status: "not_found" }],
      ]),
      (m) => {
        seen = m;
        return marker;
      },
    );
    expect(seen).toEqual([verified("1"), { status: "not_found" }]);
    expect(r.get(keys[0] ?? "")).toEqual(marker);
  });
  it("treats a line with no result as unchecked", () => {
    const { p, keys } = plan("410 U.S. 113.");
    expect(resultsForRecords(p.index, new Map(), () => marker).get(keys[0] ?? "")).toEqual({
      status: "unchecked",
    });
  });
});

// ---- lookup() end to end over a scripted fetch ----
function recordsOf(text: string) {
  const doc = createDocument(text, "2026-11-02T12:00:00.000Z");
  if (!doc.ok) throw new Error("createDocument failed");
  const keys = doc.value.citations.flatMap((c) => (c.kind === "full" ? [c.key] : []));
  return { records: doc.value.citations, keys };
}

const found = (id: number) => ({ status: 200, clusters: [{ id }] });
const missing = { status: 404, clusters: [] };
const okStep = (entries: readonly unknown[]) => ({ status: 200, body: entries });

function manyCitations(n: number): string {
  return Array.from({ length: n }, (_, i) => `100 U.S. ${String(i + 1)}.`).join(" ");
}

describe("lookup", () => {
  it("makes no call for zero Full_Records", async () => {
    const t = makeDeps();
    const { records } = recordsOf("No citations here. Id. at 5.");
    expect(await lookup(records, t.deps)).toEqual(new Map());
    expect(t.fetch.calls).toHaveLength(0);
    expect(t.clock.sleeps).toHaveLength(0);
  });

  it("keeps the results of chunks 1 and 3 when chunk 2 of 3 fails", async () => {
    const first = Array.from({ length: 60 }, (_, i) => found(i + 1));
    const third = Array.from({ length: 10 }, (_, i) => found(i + 101));
    const t = makeDeps([okStep(first), { reject: "boom" }, okStep(third)]);
    const { records, keys } = recordsOf(manyCitations(130));
    const results = await lookup(records, t.deps);
    expect(t.fetch.calls).toHaveLength(3);
    expect(results.size).toBe(130);
    keys.forEach((key, i) => {
      const expected: VerificationResult =
        i < 60
          ? verified(String(i + 1))
          : i < 120
            ? { status: "unchecked" }
            : verified(String(i - 120 + 101));
      expect(results.get(key)).toEqual(expected);
    });
  });

  it("does not resend cached lines", async () => {
    const t = makeDeps([okStep([found(1), missing]), okStep([found(3)])]);
    const a = recordsOf("100 U.S. 1. 100 U.S. 2.");
    await lookup(a.records, t.deps);
    const b = recordsOf("100 U.S. 1. 100 U.S. 2. 100 U.S. 3.");
    const results = await lookup(b.records, t.deps);
    expect(t.fetch.calls.map((c) => c.text)).toEqual(["100 U.S. 1\n100 U.S. 2", "100 U.S. 3"]);
    expect(results.get(b.keys[0] ?? "")).toEqual(verified("1"));
    expect(results.get(b.keys[1] ?? "")).toEqual({ status: "not_found" });
    expect(results.get(b.keys[2] ?? "")).toEqual(verified("3"));
  });

  it("makes zero calls for an all-database list", async () => {
    const t = makeDeps();
    const { records, keys } = recordsOf("See 2024 WL 123456 and 2023 U.S. Dist. LEXIS 98765.");
    const results = await lookup(records, t.deps);
    expect(keys.length).toBeGreaterThan(0);
    expect(t.fetch.calls).toHaveLength(0);
    for (const key of keys) expect(results.get(key)).toEqual({ status: "unchecked" });
  });

  it("gives equal maps for two equal calls", async () => {
    const run = async () => {
      const t = makeDeps([okStep([found(5), missing])]);
      return lookup(recordsOf("410 U.S. 113. 598 F.3d 1.").records, t.deps);
    };
    expect(await run()).toEqual(await run());
  });

  it("maps a 200 with two clusters to ambiguous", async () => {
    const t = makeDeps([okStep([{ status: 200, clusters: [{ id: 1 }, { id: 2 }] }])]);
    const { records, keys } = recordsOf("410 U.S. 113.");
    const results = await lookup(records, t.deps);
    expect(results.get(keys[0] ?? "")).toEqual({ status: "ambiguous", candidates: ["1", "2"] });
  });

  it("combines a parallel citation into one result", async () => {
    const t = makeDeps([okStep([found(5), missing])]);
    const { records, keys } = recordsOf("Roe v. Wade, 410 U.S. 113, 93 S. Ct. 705 (1973).");
    const results = await lookup(records, t.deps);
    expect(t.fetch.calls[0]?.text).toBe("410 U.S. 113\n93 S. Ct. 705");
    expect(keys).toHaveLength(1);
    expect(results.get(keys[0] ?? "")).toEqual(verified("5"));
  });
});
