import { describe, expect, it } from "vitest";
import {
  DEFAULT_RELABEL_THRESHOLD,
  apply,
  blockingIssues,
  createDocument,
  extract,
  format,
  issues,
  overrides,
  parse,
  recordOverride,
  render,
  segment,
  setVerification,
  strip,
  verificationOf,
  type Document,
} from "../src/index";

const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-01-02T00:00:00.000Z";
const TEXT = "Roe held as much. See 410 U.S. 113 (1973).";

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`unexpected engine error: ${JSON.stringify(r.error)}`);
  return r.value;
}

describe("engine public entry point", () => {
  it("exposes the default relabel threshold", () => {
    expect(DEFAULT_RELABEL_THRESHOLD).toBe(0.4);
  });

  it("extracts and formats a citation", () => {
    const { citations } = extract(TEXT);
    expect(citations).toHaveLength(1);
    expect(citations[0]?.value.kind).toBe("reporter");
    const value = citations[0]?.value;
    if (value?.kind !== "reporter") throw new Error("expected reporter citation");
    expect(must(format(value))).toContain("410 U.S. 113");
  });

  it("runs create, insert, verify, override, render, and parse end to end", () => {
    const empty = must(createDocument("", T0));
    const inserted = must(
      apply(empty, {
        kind: "insert",
        at: 0,
        text: TEXT,
        provenance: { origin: "PST", timestamp: T0 },
      }),
    );
    let doc: Document = inserted.document;
    expect(doc.text).toBe(TEXT);
    expect(segment(doc.text, doc.spans).ok).toBe(true);

    const unchecked = issues(doc);
    expect(unchecked.map((i) => i.code)).toEqual(["CIT …"]);
    const key = unchecked[0]?.key ?? "";
    expect(key).toMatch(/^k(0|[1-9][0-9]*)$/);

    doc = must(setVerification(doc, key, { status: "not_found" }));
    expect(verificationOf(doc, key)).toEqual({ status: "not_found" });
    expect(issues(doc).map((i) => i.code)).toEqual(["CIT ✘"]);
    expect(blockingIssues(doc)).toHaveLength(1);

    doc = must(recordOverride(doc, key, "Checked by hand against the reporter.", T1));
    expect(blockingIssues(doc)).toHaveLength(0);
    expect(overrides(doc)).toEqual([
      { key, reason: "Checked by hand against the reporter.", timestamp: T1 },
    ]);

    const full = render(doc, "full");
    expect(full.text).toContain("[DOC");
    expect(must(parse(full.text))).toEqual(doc);

    const display = render(doc, "display");
    expect(display.text).toContain("[CIT ✘]");
    expect(display.text).not.toContain("[DOC");
    expect(strip(full.text)).toBe(display.text);
  });

  it("returns a value-level error for an unknown issue key", () => {
    const doc = must(createDocument(TEXT, T0));
    const r = recordOverride(doc, "k999", "reason", T1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("unknown_issue");
  });
});
