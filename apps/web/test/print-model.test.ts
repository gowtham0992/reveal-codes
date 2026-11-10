import { blockingIssues, createDocument, render } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { serialise } from "../src/persist";
import { printModel } from "../src/print-model";
import { EXPORT_NOW, EXPORT_VERIFIED_AT, gateClearDocument } from "./support/export-fixtures";
import { ISO, verifiedDemoDocument } from "./support/persist-fixtures";

const pad = (n: number): string => String(n).padStart(2, "0");
const localDay = (d: Date): string =>
  `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function clean(text: string) {
  const created = createDocument(text, ISO);
  if (!created.ok) throw new Error("fixture rejected");
  return created.value;
}

describe("printModel _Requirements: 8.1, 8.6, 8.7, 8.8_", () => {
  it("returns absent for a missing value", () => {
    expect(printModel(null, EXPORT_NOW, null)).toEqual({ kind: "absent" });
  });

  it("returns unreadable for a throwing read", () => {
    expect(printModel({ thrown: new Error("denied") }, EXPORT_NOW, null)).toEqual({
      kind: "unreadable",
    });
  });

  it("returns unreadable for bad JSON, bad shape and bad codes", () => {
    const unreadable = { kind: "unreadable" };
    expect(printModel("{not json", EXPORT_NOW, null)).toEqual(unreadable);
    expect(printModel(JSON.stringify({ version: 2 }), EXPORT_NOW, null)).toEqual(unreadable);
    expect(
      printModel(JSON.stringify({ version: 1, codes: "[PST]x[CIT", runLog: [] }), EXPORT_NOW, null),
    ).toEqual(unreadable);
    expect(
      printModel(
        JSON.stringify({ version: 1, codes: "", runLog: [], verifiedAt: 5 }),
        EXPORT_NOW,
        null,
      ),
    ).toEqual(unreadable);
  });

  it("returns unreadable when the statement cannot be built", () => {
    const raw = serialise(clean("Plain text."), [], "not a date");
    expect(printModel(raw, EXPORT_NOW, null)).toEqual({ kind: "unreadable" });
    expect(
      printModel(serialise(clean("Plain text."), [], null), new Date(Number.NaN), null),
    ).toEqual({
      kind: "unreadable",
    });
  });

  it("returns blocked with the count and the full item text in document order", async () => {
    const doc = await verifiedDemoDocument();
    const expected = blockingIssues(doc).map((i) => ({
      code: i.code,
      text: doc.text.slice(i.start, i.end),
    }));
    const model = printModel(serialise(doc, [], EXPORT_VERIFIED_AT), EXPORT_NOW, null);
    expect(model).toEqual({ kind: "blocked", blocking: expected });
    expect(expected.length).toBe(4);
  });

  it("returns ready with filing paragraphs, titles and local dates", async () => {
    const doc = await gateClearDocument();
    const model = printModel(serialise(doc, [], EXPORT_VERIFIED_AT), EXPORT_NOW, null);
    if (model.kind !== "ready") throw new Error(`expected ready, got ${model.kind}`);
    expect(model.paragraphs).toEqual(doc.text.split("\n"));
    const first = model.blocks[0];
    expect(first).toEqual({ kind: "title", text: "AI-Use and Verification Statement" });
    const last = model.blocks[model.blocks.length - 1];
    expect(last).toMatchObject({ kind: "signature", date: localDay(EXPORT_NOW) });
    const para3 = model.blocks.find((b) => b.kind === "paragraph" && b.number === 3);
    const para3Text = para3 !== undefined && para3.kind === "paragraph" ? para3.text : "";
    expect(para3Text).toContain(localDay(new Date(EXPORT_VERIFIED_AT)));
    expect(model.appendix.title).toBe("Provenance Appendix");
    expect(model.appendix.lines.join("\n")).toBe(render(doc, "full").text);
  });
});
