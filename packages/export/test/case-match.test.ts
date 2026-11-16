import { createDocument, issues, recordOverride, setVerification } from "@reveal-codes/engine";
import type { Document, VerificationResult } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { buildDocx, buildStatement, renderStatement } from "../src/index.js";
import type { StatementBlock } from "../src/index.js";
import { DEMO_NOW } from "./support/demo-document.js";
import { noneFor } from "./support/declarations.js";
import { readDocxParagraphs } from "./support/docx-text.js";

const AT = "2026-11-20T18:25:00.000Z";
const OVERRIDE_AT = "2026-11-20T18:26:00.000Z";
const REASON = "The case name was a drafting slip; the reporter cite is correct.";
/** The text is pasted, so the author declares that no AI was used. */
const DECLARATION = noneFor("pasted_text");
const META = { now: DEMO_NOW, verifiedAt: AT };
const TEXT = "See Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009).";

const WITH_YEAR: VerificationResult = {
  status: "wrong_case",
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
  foundYear: 2009,
};
const NO_YEAR: VerificationResult = {
  status: "wrong_case",
  clusterId: "145875",
  foundName: "Ashcroft v. Iqbal",
};

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${JSON.stringify(r.error)}`);
  return r.value;
}

function wrongCaseDoc(result: VerificationResult, override: boolean): Document {
  const created = must(createDocument(TEXT, AT));
  const full = created.citations.find((c) => c.kind === "full");
  if (full === undefined) throw new Error("no citation");
  const marked = must(setVerification(created, full.key, result));
  if (!override) return marked;
  const issue = issues(marked).find((i) => i.code === "CIT ≠");
  if (issue === undefined) throw new Error("no CIT ≠ issue");
  return must(recordOverride(marked, issue.key, REASON, OVERRIDE_AT));
}

function blocksOf(doc: Document): readonly StatementBlock[] {
  return renderStatement(must(buildStatement(doc, [], META, null, DECLARATION)));
}

function citationRows(blocks: readonly StatementBlock[]): readonly (readonly string[])[] {
  const t = blocks.find((b) => b.kind === "table" && b.columns[0] === "Citation");
  return t?.kind === "table" ? t.rows : [];
}

describe("Statement wrong_case blocks _Requirements: 8.1, 8.4, 8.5, 8.7_", () => {
  it("words the citation paragraph with the wrong-case term and the date", () => {
    const paras = blocksOf(wrongCaseDoc(WITH_YEAR, false)).flatMap((b) =>
      b.kind === "paragraph" ? [b.text] : [],
    );
    const p = paras.find((t) => t.startsWith("Every legal citation"));
    expect(p).toBe(
      "Every legal citation in this filing was checked against the CourtListener database on " +
        `${String(must(buildStatement(wrongCaseDoc(WITH_YEAR, false), [], META, null, DECLARATION)).verifiedDate)}. ` +
        "0 resolved to a single reported decision, 1 resolved to a different case than the one named, " +
        "0 could not be found, 0 matched more than one decision, and 0 were not checked.",
    );
  });

  it("shows the found case and year in the Status cell, with the cluster id", () => {
    expect(citationRows(blocksOf(wrongCaseDoc(WITH_YEAR, false)))).toEqual([
      ["556 U.S. 662, 678 (2009)", "CIT ≠ (Ashcroft v. Iqbal, 2009)", "145875"],
    ]);
  });

  it("omits the year from the Status cell when the result has none", () => {
    expect(citationRows(blocksOf(wrongCaseDoc(NO_YEAR, false)))).toEqual([
      ["556 U.S. 662, 678 (2009)", "CIT ≠ (Ashcroft v. Iqbal)", "145875"],
    ]);
  });

  it("lists a CIT ≠ Override in the Overrides table with code, citation, reason and timestamp", () => {
    const blocks = blocksOf(wrongCaseDoc(WITH_YEAR, true));
    const t = blocks.find((b) => b.kind === "table" && b.columns[0] === "Code");
    expect(t?.kind).toBe("table");
    if (t?.kind !== "table") return;
    expect(t.rows).toHaveLength(1);
    const row = t.rows[0] ?? [];
    expect(row[0]).toBe("CIT ≠");
    expect(row[1]).toBe("556 U.S. 662, 678 (2009)");
    expect(row[2]).toBe(REASON);
    expect(row[3]).toMatch(/2026/);
  });
});

describe("DOCX wrong_case blocks _Requirements: 8.7_", () => {
  it("carries the new paragraph, Status cell and Overrides row", async () => {
    const doc = wrongCaseDoc(WITH_YEAR, true);
    const statement = must(buildStatement(doc, [], META, null, DECLARATION));
    const text = readDocxParagraphs(await buildDocx(doc, statement)).join("\n");
    expect(text).toContain("1 resolved to a different case than the one named");
    expect(text).toContain("CIT ≠ (Ashcroft v. Iqbal, 2009)");
    expect(text).toContain("145875");
    expect(text).toContain(REASON);
  });
});
