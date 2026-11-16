// Open-draft task 2.12: reader and readWordDraft examples (Requirement 19 criteria 3, 8, 13).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  APPENDIX_TITLE,
  STATEMENT_TITLE,
  notesBlock,
  readDocx,
  readDocxWithNotes,
  readWordDraft,
  splitExport,
} from "../src/index.js";
import { addEndnotes } from "./support/docx-endnotes.js";
import {
  FIXTURE_TEXT,
  buildFixtureDocx,
  editOneCharacter,
  exportAndEditedExport,
  oversizePartZip,
  passwordProtectedStandIn,
  truncatedZip,
  zipFixed,
  zipWithoutDocumentXml,
} from "./support/docx-fixtures.js";
const LIMITS = { maxPartBytes: 50_000_000 };
const ENDNOTE = "The one endnote.";
const REPO = join(import.meta.dirname, "..", "..", "..");
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const BODY_LINES = [
  "First paragraph.",
  "Cell A1",
  "Cell B1",
  "Cell A2",
  "Cell B2",
  "Kept inserted text",
  "Second paragraph with a footnote.",
];
const NOTES_BLOCK = "\n\nFootnotes\n1. First footnote.\n2. Second footnote.\n3. The one endnote.";
async function fixtureWithEndnote(): Promise<Uint8Array> {
  return addEndnotes(await buildFixtureDocx(), [ENDNOTE]);
}
function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO, path), "utf8")) as Record<string, unknown>;
}
describe("the Requirement 19 criterion 3 fixture", () => {
  it("reads the body in order, with the tracked deletion dropped and the insertion kept", async () => {
    const read = readDocx(await fixtureWithEndnote());
    expect(read).toEqual({ ok: true, value: BODY_LINES });
    expect(FIXTURE_TEXT.deleted).toBe("deleted text");
    expect(BODY_LINES.join("\n")).not.toContain(FIXTURE_TEXT.deleted);
  });
  it("reads footnotes then the endnote, never numbering Word's separator notes", async () => {
    const read = readDocxWithNotes(await fixtureWithEndnote(), LIMITS);
    expect(read).toEqual({
      ok: true,
      value: {
        paragraphs: BODY_LINES,
        notes: ["First footnote.", "Second footnote.", ENDNOTE],
      },
    });
  });
  it("gives the exact text and Notes_Block through readWordDraft", async () => {
    const draft = readWordDraft(await fixtureWithEndnote(), LIMITS);
    expect(draft).toEqual({ kind: "plain", text: BODY_LINES.join("\n") + NOTES_BLOCK });
    expect(notesBlock(["First footnote.", "Second footnote.", ENDNOTE])).toBe(NOTES_BLOCK);
  });
  it("reads a file with no endnote to the same body and only its footnotes", async () => {
    const draft = readWordDraft(await buildFixtureDocx(), LIMITS);
    expect(draft).toEqual({
      kind: "plain",
      text: BODY_LINES.join("\n") + "\n\nFootnotes\n1. First footnote.\n2. Second footnote.",
    });
  });
  it("keeps readDocx on document.xml only, so the Sentinel sees no notes", async () => {
    const withNotes = await fixtureWithEndnote();
    const without = zipFixed({ "word/document.xml": strToU8(documentXml(BODY_LINES)) });
    expect(readDocx(withNotes)).toEqual(readDocx(without));
  });
});
function documentXml(lines: readonly string[]): string {
  const ps = lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join("");
  return `<w:document ${W}><w:body>${ps}</w:body></w:document>`;
}
describe("statement pages are never imported", () => {
  it("drops the statement and the appendix from the text of a changed export", async () => {
    const { edited } = await exportAndEditedExport();
    const draft = readWordDraft(edited, LIMITS);
    expect(draft.kind).toBe("changed");
    if (draft.kind !== "changed") return;
    expect(draft.text).not.toContain(STATEMENT_TITLE);
    expect(draft.text).not.toContain(APPENDIX_TITLE);
  });
  it("keeps a body line equal to a statement title and cuts at the last one", () => {
    const lines = [
      "Intro.",
      STATEMENT_TITLE,
      "Body after.",
      STATEMENT_TITLE,
      "Statement",
      APPENDIX_TITLE,
    ];
    const split = splitExport(lines);
    expect(split.ok).toBe(true);
    if (split.ok) expect(split.value.body).toEqual(["Intro.", STATEMENT_TITLE, "Body after."]);
  });
});
describe("the Sentinel reader and readWordDraft agree", () => {
  it("give the same body for an edited export", async () => {
    const { edited } = await exportAndEditedExport();
    const read = readDocx(edited);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const split = splitExport(read.value);
    expect(split.ok).toBe(true);
    const draft = readWordDraft(edited, LIMITS);
    expect(draft.kind).toBe("changed");
    if (split.ok && draft.kind === "changed") {
      expect(draft.text).toBe(split.value.body.join("\n"));
    }
  });
  it("reads the edited export to one changed character against the original", async () => {
    const { original, edited } = await exportAndEditedExport();
    expect(editOneCharacter(original)).toEqual(edited);
    const a = readDocx(original);
    const b = readDocx(edited);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      const x = a.value.join("\n");
      const y = b.value.join("\n");
      expect(y).toHaveLength(x.length);
      expect(Array.from(x).filter((c, i) => c !== y[i])).toHaveLength(1);
    }
  });
});
describe("each readWordDraft refusal", () => {
  it("refuses a password-protected stand-in as encrypted", () => {
    expect(readWordDraft(passwordProtectedStandIn(), LIMITS)).toEqual({
      kind: "refused",
      reason: "encrypted",
    });
  });
  it.each([
    ["a compound file that is not encrypted", () => passwordProtectedStandIn().fill(0, 1024)],
    ["a truncated zip", () => truncatedZip(new Uint8Array(400).fill(7))],
    ["bytes that are not a zip", () => strToU8("not a word file")],
    ["no bytes", () => new Uint8Array(0)],
  ])("refuses %s as damaged", (_name, make) => {
    expect(readWordDraft(make(), LIMITS)).toEqual({ kind: "refused", reason: "damaged" });
  });
  it("refuses a truncated real .docx and a zip with no word/document.xml as damaged", async () => {
    const bytes = await buildFixtureDocx();
    const damaged = { kind: "refused", reason: "damaged" };
    expect(readWordDraft(truncatedZip(bytes), LIMITS)).toEqual(damaged);
    expect(readWordDraft(zipWithoutDocumentXml(bytes), LIMITS)).toEqual(damaged);
  });
  it("refuses a part whose declared size is over the limit before inflating it", () => {
    expect(readWordDraft(oversizePartZip(), { maxPartBytes: 5 })).toEqual({
      kind: "refused",
      reason: "damaged",
    });
    expect(readDocxWithNotes(oversizePartZip(), { maxPartBytes: 5 })).toEqual({
      ok: false,
      error: { kind: "part_too_large" },
    });
  });
  it("shows the unlimited Sentinel reader inflates the oversize part whatever its header says", () => {
    const read = readDocx(oversizePartZip(10, 2000));
    expect(read.ok).toBe(true);
  });
  it("refuses an Appendix title with no statement title before it as no_filing_end", () => {
    const bytes = zipFixed({
      "word/document.xml": strToU8(documentXml(["Body.", APPENDIX_TITLE, "Line."])),
    });
    expect(readWordDraft(bytes, LIMITS)).toEqual({ kind: "refused", reason: "no_filing_end" });
  });
});
describe("shared reader boundaries", () => {
  it("keeps no copy of the moved reader modules in the Sentinel", () => {
    const names = readdirSync(join(REPO, "crew", "sentinel", "src"));
    for (const moved of ["docx-read.ts", "xml-text.ts", "export-split.ts", "appendix-parse.ts"]) {
      expect(names).not.toContain(moved);
    }
    const analyse = readFileSync(join(REPO, "crew", "sentinel", "src", "analyse.ts"), "utf8");
    expect(analyse).toContain('from "@reveal-codes/export"');
    expect(analyse).not.toContain("unzipSync");
  });
  it("declares fflate as a pinned runtime dependency of the Export_Package and none in the Engine", () => {
    const exp = json("packages/export/package.json");
    const engine = json("packages/engine/package.json");
    expect((exp["dependencies"] as Record<string, string>)["fflate"]).toBe("0.8.3");
    expect(engine["dependencies"]).toBeUndefined();
  });
});
