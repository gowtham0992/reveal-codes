import { declareNone } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { buildStatement, firstPageHeading, renderStatement } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { serialise } from "../src/persist";
import { printModel } from "../src/print-model";
import type { PrintModel } from "../src/print-model";
import { EXPORT_NOW, EXPORT_VERIFIED_AT } from "./support/export-fixtures";
import {
  printAiDocument,
  printBlockedDocument,
  printEntry,
  printHumanDocument,
} from "./support/print-fixtures";

const META = { now: EXPORT_NOW, verifiedAt: EXPORT_VERIFIED_AT };

function ready(model: PrintModel): Extract<PrintModel, { kind: "ready" }> {
  if (model.kind !== "ready") throw new Error(`expected ready, got ${model.kind}`);
  return model;
}

function expectedStatement(document: Document, id: string | null, certified: boolean) {
  const context =
    id === null ? null : { entry: printEntry(id), confidentialityCertified: certified };
  const built = buildStatement(document, [], META, context);
  if (!built.ok) throw new Error("statement rejected");
  return built.value;
}

describe("printModel with an order _Requirements: 3.12, 5.11, 6.8, 6.9, 7.6_", () => {
  it("ready carries the heading and no certified blocks for a first-page-header order", () => {
    const doc = printAiDocument();
    const raw = serialise(doc, [], EXPORT_VERIFIED_AT, null);
    const model = ready(printModel(raw, EXPORT_NOW, printEntry("ndtex-lr-7-2-f")));
    const expected = expectedStatement(doc, "ndtex-lr-7-2-f", false);
    expect(model.heading).not.toBeNull();
    expect(model.heading).toEqual(firstPageHeading(expected));
    expect(model.blocks).toEqual(renderStatement(expected));
    expect(model.certifiedBlocks).toBeNull();
  });

  it("ready has no heading when the document has no AI text", () => {
    const raw = serialise(printHumanDocument(), [], EXPORT_VERIFIED_AT, declareNone("this_filing"));
    const model = ready(printModel(raw, EXPORT_NOW, printEntry("ndtex-lr-7-2-f")));
    expect(model.heading).toBeNull();
    expect(model.certifiedBlocks).toBeNull();
  });

  it("ready carries both block lists when the order needs the confidentiality tick", () => {
    const doc = printAiDocument();
    const raw = serialise(doc, [], EXPORT_VERIFIED_AT, null);
    const model = ready(printModel(raw, EXPORT_NOW, printEntry("cit-choe-groves-2025")));
    const plain = renderStatement(expectedStatement(doc, "cit-choe-groves-2025", false));
    const certified = renderStatement(expectedStatement(doc, "cit-choe-groves-2025", true));
    expect(model.blocks).toEqual(plain);
    expect(model.certifiedBlocks).toEqual(certified);
    expect(certified).not.toEqual(plain);
  });

  it("certifiedBlocks is null for the same order when no AI text is present", () => {
    const raw = serialise(printHumanDocument(), [], EXPORT_VERIFIED_AT, null);
    const model = ready(printModel(raw, EXPORT_NOW, printEntry("cit-choe-groves-2025")));
    expect(model.certifiedBlocks).toBeNull();
  });

  it("returns prohibited for sdohio-newman with AI text", () => {
    const raw = serialise(printAiDocument(), [], EXPORT_VERIFIED_AT, null);
    const entry = printEntry("sdohio-newman");
    const model = printModel(raw, EXPORT_NOW, entry);
    if (model.kind !== "prohibited") throw new Error(`expected prohibited, got ${model.kind}`);
    expect(model.blocking).toEqual([]);
    expect(model.notice.keyLanguage).toBe(entry.key_language);
    expect(model.notice.line).toBe(
      'Judge Newman\'s order prohibits AI-drafted text. 1 AI-origin passage remains: paragraph 2, beginning "The Court has discretion to extend the period.\u2026".',
    );
    expect(model.notice.line).not.toContain("lines");
  });

  it("is ready for sdohio-newman when the document has no AI text", () => {
    const raw = serialise(printHumanDocument(), [], EXPORT_VERIFIED_AT, null);
    expect(printModel(raw, EXPORT_NOW, printEntry("sdohio-newman")).kind).toBe("ready");
  });

  it("keeps the blocked shape for an unresolved citation under any order", () => {
    const raw = serialise(printBlockedDocument(), [], EXPORT_VERIFIED_AT, null);
    const model = printModel(raw, EXPORT_NOW, printEntry("sdohio-newman"));
    expect(model.kind).toBe("blocked");
    expect(Object.keys(model).sort()).toEqual(["blocking", "kind"]);
    expect(printModel(raw, EXPORT_NOW, null)).toEqual(model);
  });
});

describe("printModel with no order _Requirements: 3.12, 9.8_", () => {
  it("gives today's model plus heading null and certifiedBlocks null", () => {
    const doc = printAiDocument();
    const raw = serialise(doc, [], EXPORT_VERIFIED_AT, null);
    const model = ready(printModel(raw, EXPORT_NOW, null));
    const expected = expectedStatement(doc, null, false);
    expect(model.heading).toBeNull();
    expect(model.certifiedBlocks).toBeNull();
    expect(model.blocks).toEqual(renderStatement(expected));
    expect(model.paragraphs).toEqual(doc.text.split("\n"));
    expect(Object.keys(model).sort()).toEqual([
      "appendix",
      "blocks",
      "certifiedBlocks",
      "heading",
      "kind",
      "paragraphs",
    ]);
  });
});
