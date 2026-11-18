import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createDocument, renderRecord, setQuoteCheck } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import {
  buildAppendix,
  buildDocx,
  buildStatement,
  readDocx,
  renderStatement,
} from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { copyText } from "../src/check/copy-text";
import { checkRows } from "../src/client/check-rows";
import { composeStatus } from "../src/components/use-pane";
import { statusText } from "../src/pane/layout";
import { parseCss } from "./support/css";
import { EXPORT_NOW, EXPORT_VERIFIED_AT, pastedAiDeclaration } from "./support/export-fixtures";
import { WEB_ROOT } from "./support/scan";

const ISO = "2026-01-01T00:00:00.000Z";
const TEXT =
  'See Roe v. Wade, 410 U.S. 113, 120 (1973) ("the quick brown fox jumps over the lazy dog").';
const SENTENCE = 'Matches the opinion up to "the", then differs: "quick brown fox jumps over the…"';

function mismatched(): Document {
  const created = createDocument(TEXT, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  const quote = created.value.quotes[0];
  if (quote === undefined) throw new Error("fixture has no quote");
  const set = setQuoteCheck(created.value, quote.key, { status: "mismatch", prefixLength: 4 });
  if (!set.ok) throw new Error("quote check rejected");
  return set.value;
}

describe("Pane status text _Requirements: 27.2, 27.3_", () => {
  it("is statusText, two spaces, then the sentence, inside a mismatched quotation", () => {
    const doc = mismatched();
    const cursor = TEXT.indexOf("quick") + 1;
    expect(composeStatus(doc, cursor, null)).toBe(`${statusText(doc.text, cursor)}  ${SENTENCE}`);
  });

  it("is null outside the quotation and gives way to the F7 message", () => {
    const doc = mismatched();
    expect(composeStatus(doc, 0, null)).toBeNull();
    expect(composeStatus(doc, TEXT.indexOf("quick"), "Save document? Yes (No)")).toBe(
      "Save document? Yes (No)",
    );
  });

  it("keeps the status element on one line with the three declarations", () => {
    const css = parseCss(readFileSync(join(WEB_ROOT, "src/pane/status-bar.module.css"), "utf8"));
    const value = (prop: string): string | undefined =>
      css.declarations.find((d) => d.selector === ".text" && d.prop === prop)?.value;
    expect(value("white-space")).toBe("nowrap");
    expect(value("overflow")).toBe("hidden");
    expect(value("text-overflow")).toBe("ellipsis");
  });
});

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Hashes taken from the unchanged export packages; the sentence work edits none of them. */
const GOLDEN = {
  statement: "802a94324d640c2165ef18a0e66595cc6d2d8cd6355f9f037b80f17e866e066e",
  appendix: "b9695849c8af6af398edd00daeb29f959a9bcbfe38227faaa152440c12bc2aad",
  serialisation: "de1b8de97f331c7868b2c7f91a55ecb29b8e5c43145fb2ff038b1be2c4446bb6",
  docx: "18ef8139ad55035eadda87708ce2730fd3667f6e8893445ef9930eeb0943bce7",
  copyText: "a6b28b5c9e108d4ebfda12291691c5ba3e340eea5498af710cf3b134b85ef667",
} as const;

async function outputs(doc: Document): Promise<Record<keyof typeof GOLDEN, string>> {
  const meta = { now: EXPORT_NOW, verifiedAt: EXPORT_VERIFIED_AT };
  const built = buildStatement(doc, [], meta, null, pastedAiDeclaration());
  if (!built.ok) throw new Error(`statement rejected: ${JSON.stringify(built.error)}`);
  const docx = readDocx(await buildDocx(doc, built.value));
  if (!docx.ok) throw new Error("docx unreadable");
  const rows = checkRows(doc, undefined);
  return {
    statement: sha(JSON.stringify(renderStatement(built.value))),
    appendix: sha(JSON.stringify(buildAppendix(doc, pastedAiDeclaration()))),
    serialisation: sha(renderRecord(doc, null, "full").text),
    docx: sha(JSON.stringify(docx.value)),
    copyText: sha(copyText(rows, "Citations: 1 found", "2026-11-20")),
  };
}

describe("Exports do not change with the divergence sentence _Requirements: 27.15_", () => {
  it("leaves the DOCX, Statement, Appendix, full serialisation and Copy_Text as they were", async () => {
    expect(await outputs(mismatched())).toEqual(GOLDEN);
  });

  it("prints neither the sentence nor the old label anywhere in them", () => {
    const doc = mismatched();
    const built = buildStatement(
      doc,
      [],
      { now: EXPORT_NOW, verifiedAt: EXPORT_VERIFIED_AT },
      null,
      pastedAiDeclaration(),
    );
    if (!built.ok) throw new Error("statement rejected");
    const all = [
      JSON.stringify(renderStatement(built.value)),
      JSON.stringify(buildAppendix(doc, pastedAiDeclaration())),
      renderRecord(doc, null, "full").text,
      copyText(checkRows(doc, undefined), "Citations: 1 found", null),
    ].join("\n");
    expect(all).not.toContain("Matches the opinion up to");
    expect(all).not.toContain("Diverges at");
  });
});
