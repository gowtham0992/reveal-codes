import { recordOverride, setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type { Document, IssueKey, VerificationResult } from "@reveal-codes/engine";
import { localDateTime } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { deriveFindings, unreadable } from "../src/findings.js";
import { firstDifferingLine, lineAt } from "../src/lines.js";
import type { ReverifyOutcome } from "../src/reverify.js";
import { quoteText, statusText } from "../src/status-text.js";
import { buildDemoDocument } from "./support/export-support.js";

const FILE = "motion.docx";
const NOW = "2026-11-20T10:00:00.000Z";

function must(doc: { ok: true; value: Document } | { ok: false }): Document {
  if (!doc.ok) throw new Error("engine rejected the setup");
  return doc.value;
}

function withCitation(doc: Document, key: IssueKey, result: VerificationResult): Document {
  return must(setVerification(doc, key, result));
}

function verifiedKeys(doc: Document): readonly IssueKey[] {
  return doc.citations.flatMap((c) =>
    c.kind === "full" && c.result.status === "verified" ? [c.key] : [],
  );
}

function outcome(document: Document, rest: Partial<ReverifyOutcome> = {}): ReverifyOutcome {
  return { document, unavailable: null, notRechecked: [], ...rest };
}

function derive(recorded: Document, out: ReverifyOutcome, bodyText = recorded.text) {
  return deriveFindings({ file: FILE, recorded, bodyText, outcome: out });
}

function firstVerified(doc: Document): { key: IssueKey; clusterId: string } {
  for (const c of doc.citations) {
    if (c.kind === "full" && c.result.status === "verified") {
      return { key: c.key, clusterId: c.result.clusterId };
    }
  }
  throw new Error("no verified citation in the demo");
}

describe("deriveFindings", () => {
  it("returns nothing when nothing differs", async () => {
    const doc = await buildDemoDocument();
    expect(derive(doc, outcome(doc))).toEqual([]);
  });

  it("orders body_edited, then citation changes by position, then recheck_unavailable", async () => {
    const doc = await buildDemoDocument();
    const keys = verifiedKeys(doc);
    const changed = keys.reduce((d, k) => withCitation(d, k, { status: "not_found" }), doc);
    const out = outcome(changed, { unavailable: { waitUntil: null } });
    const found = derive(doc, out, `${doc.text}!`);
    expect(found[0]?.kind).toBe("body_edited");
    expect(found.at(-1)?.kind).toBe("recheck_unavailable");
    const middle = found.slice(1, -1);
    expect(middle.length).toBe(keys.length);
    expect(middle.every((f) => f.kind === "citation_changed")).toBe(true);
    const lines = middle.map((f) => f.line ?? 0);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  it("uses the kind order at one position and sorts a recordless override last", async () => {
    const doc = await buildDemoDocument();
    const { key } = firstVerified(doc);
    const stale = withCitation(doc, key, { status: "not_found" });
    const overridden = must(recordOverride(stale, key, "checked by hand", NOW));
    const orphan = {
      ...overridden,
      overrides: [{ key: "k999", reason: "gone", timestamp: NOW }, ...overridden.overrides],
    };
    const found = derive(orphan, outcome(doc));
    expect(found.map((f) => f.kind)).toEqual([
      "citation_changed",
      "override_stale",
      "override_stale",
    ]);
    expect(found[1]?.before).toBe("checked by hand");
    expect(found[2]).toMatchObject({ line: null, before: "gone", after: "no longer an issue" });
  });

  it("computes override_stale from the recorded overrides although the reverified document dropped them", async () => {
    const doc = await buildDemoDocument();
    const { key } = firstVerified(doc);
    const recorded = must(
      recordOverride(withCitation(doc, key, { status: "not_found" }), key, "my reason", NOW),
    );
    const reverified = withCitation(recorded, key, { status: "verified", clusterId: "145875" });
    expect(reverified.overrides.some((o) => o.key === key)).toBe(false);
    expect(recorded.overrides.some((o) => o.key === key)).toBe(true);
    const kinds = derive(recorded, outcome(reverified)).map((f) => f.kind);
    expect(kinds).toEqual(["citation_changed", "override_stale"]);
  });

  it("reports verified to verified with another cluster as citation_changed", async () => {
    const doc = await buildDemoDocument();
    const { key, clusterId } = firstVerified(doc);
    const other = clusterId === "1" ? "2" : "1";
    const now = withCitation(doc, key, { status: "verified", clusterId: other });
    const found = derive(doc, outcome(now));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "citation_changed",
      before: `verified ${clusterId}`,
      after: `verified ${other}`,
    });
  });

  it("does not report an ambiguous result whose candidate count changed", async () => {
    const doc = await buildDemoDocument();
    const { key } = firstVerified(doc);
    const recorded = withCitation(doc, key, { status: "ambiguous", candidates: ["1", "2"] });
    const now = withCitation(doc, key, { status: "ambiguous", candidates: ["1", "2", "3"] });
    expect(derive(recorded, outcome(now))).toEqual([]);
  });

  it("reports nothing for a citation whose new status is unchecked", async () => {
    const doc = await buildDemoDocument();
    const { key } = firstVerified(doc);
    const now = withCitation(doc, key, { status: "unchecked" });
    expect(derive(doc, outcome(now))).toEqual([]);
  });

  it("reports a changed quote and nothing for a quote with an unverified owner", async () => {
    const doc = await buildDemoDocument();
    const quote = doc.quotes[0];
    if (quote === undefined) throw new Error("demo has no quote");
    const now = must(setQuoteCheck(doc, quote.key, { status: "mismatch", prefixLength: 0 }));
    const found = derive(doc, outcome(now));
    expect(found).toHaveLength(quote.result.status === "mismatch" ? 0 : 1);
    if (found[0] !== undefined) {
      expect(found[0]).toMatchObject({
        kind: "quote_changed",
        before: quoteText(quote.result),
        after: "mismatch",
        line: lineAt(doc.text, quote.quote.start),
      });
    }
    const unchecked = must(setQuoteCheck(doc, quote.key, { status: "unchecked" }));
    expect(derive(doc, outcome(unchecked))).toEqual([]);
    const { key } = firstVerified(doc);
    const lostOwner = withCitation(doc, key, { status: "not_found" });
    expect(derive(lostOwner, outcome(lostOwner)).map((f) => f.kind)).toEqual([]);
  });

  it("describes body_edited with the first differing line, cut at 80", async () => {
    const doc = await buildDemoDocument();
    const lines = doc.text.split("\n");
    const long = "x".repeat(200);
    const edited = [lines[0] ?? "", long, ...lines.slice(2)].join("\n");
    const found = derive(doc, outcome(doc), edited);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "body_edited", line: 2, after: `${"x".repeat(79)}…` });
    const truncated = lines.slice(0, 1).join("\n");
    const missing = derive(doc, outcome(doc), truncated);
    expect(missing[0]).toMatchObject({ kind: "body_edited", line: 2, after: "" });
  });

  it("describes recheck_unavailable with and without waitUntil", async () => {
    const doc = await buildDemoDocument();
    const wait = "2026-11-02T12:00:30.000Z";
    const withWait = derive(doc, outcome(doc, { unavailable: { waitUntil: wait } }));
    expect(withWait).toEqual([
      {
        kind: "recheck_unavailable",
        file: FILE,
        line: null,
        before: "",
        after: `retry after ${localDateTime(new Date(wait))}`,
        waitUntil: wait,
      },
    ]);
    const without = derive(doc, outcome(doc, { unavailable: { waitUntil: null } }));
    expect(without[0]).toMatchObject({ after: "unavailable", waitUntil: null });
  });

  it("builds a lone unreadable Finding", () => {
    expect(unreadable(FILE, "not_docx")).toEqual({
      kind: "unreadable",
      file: FILE,
      line: null,
      before: "",
      after: "not_docx",
    });
  });
});

describe("statusText and quoteText", () => {
  it.each([
    [{ status: "verified", clusterId: "42" } as const, "verified 42"],
    [{ status: "not_found" } as const, "not_found"],
    [{ status: "ambiguous", candidates: ["a", "b"] } as const, "ambiguous 2"],
    [{ status: "unchecked" } as const, "unchecked"],
  ])("statusText %j", (result, expected) => {
    expect(statusText(result)).toBe(expected);
  });

  it.each([
    [{ status: "match" } as const, "match"],
    [{ status: "mismatch", prefixLength: 3 } as const, "mismatch"],
    [{ status: "unchecked" } as const, "unchecked"],
  ])("quoteText %j", (result, expected) => {
    expect(quoteText(result)).toBe(expected);
  });
});

describe("lineAt and firstDifferingLine", () => {
  it.each([
    ["a\nb\nc", 0, 1],
    ["a\nb\nc", 2, 2],
    ["a\nb\nc", 4, 3],
    ["a\n", 2, 2],
  ])("lineAt(%j, %i) is %i", (text, offset, expected) => {
    expect(lineAt(text, offset)).toBe(expected);
  });

  it.each([
    ["a\nb", "a\nb", null],
    ["a\nb", "a\nc", 2],
    ["a\nb", "a", 2],
    ["a", "a\n", 2],
    ["", "x", 1],
  ])("firstDifferingLine(%j, %j) is %j", (a, b, expected) => {
    expect(firstDifferingLine(a, b)).toBe(expected);
  });
});
