import { APPENDIX_TITLE, STATEMENT_TITLE, buildAppendix, buildDocx } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { readDocx } from "../src/docx-read.js";
import { splitExport } from "../src/split.js";
import { renameTitles } from "./support/docx-edit.js";
import { buildDemoDocument, buildDemoDocumentStatement } from "./support/export-support.js";

const NOT_EXPORT = { ok: false, error: { kind: "not_reveal_codes_export" } };

async function demoParagraphs(): Promise<{ list: readonly string[]; bytes: Uint8Array }> {
  const doc = await buildDemoDocument();
  const { statement } = await buildDemoDocumentStatement();
  const bytes = await buildDocx(doc, statement);
  const read = readDocx(bytes);
  if (!read.ok) throw new Error("demo export unreadable");
  return { list: read.value, bytes };
}

describe("splitExport", () => {
  it("returns the filing lines and the Appendix lines of the demo export", async () => {
    const doc = await buildDemoDocument();
    const { list } = await demoParagraphs();
    const result = splitExport(list);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.body).toEqual(doc.text.split("\n"));
    expect(result.value.appendix).toEqual(buildAppendix(doc).lines);
  });

  it("returns not_reveal_codes_export when the titles are renamed", async () => {
    const { bytes } = await demoParagraphs();
    const read = readDocx(renameTitles(bytes));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(splitExport(read.value)).toEqual(NOT_EXPORT);
  });

  it.each([
    ["an empty list", []],
    ["no Appendix title after the Statement title", ["a", STATEMENT_TITLE, "b"]],
    ["an Appendix title before the Statement title", [APPENDIX_TITLE, "x", STATEMENT_TITLE, "y"]],
    ["no Statement title", ["a", APPENDIX_TITLE, "i1", "i2", "l"]],
  ])("returns not_reveal_codes_export for %s", (_name, list) => {
    expect(splitExport(list)).toEqual(NOT_EXPORT);
  });

  it("gives an empty Appendix when the title is last or followed by too few paragraphs", () => {
    const intro = buildAppendix(
      // Only intro.length matters here.
      {
        text: "",
        spans: [],
        runs: [],
        citations: [],
        quotes: [],
        overrides: [],
        keyCounter: 0,
      },
    ).intro;
    const last = splitExport(["a", STATEMENT_TITLE, APPENDIX_TITLE]);
    expect(last).toEqual({ ok: true, value: { body: ["a"], appendix: [] } });
    const short = splitExport(["a", STATEMENT_TITLE, APPENDIX_TITLE, ...intro]);
    expect(short).toEqual({ ok: true, value: { body: ["a"], appendix: [] } });
  });

  it("leaves the input unchanged and keeps an empty last body paragraph", () => {
    const list = ["a", "", STATEMENT_TITLE, APPENDIX_TITLE, "i1", "i2", "line"];
    const copy = [...list];
    const result = splitExport(list);
    expect(list).toEqual(copy);
    expect(result).toEqual({ ok: true, value: { body: ["a", ""], appendix: ["line"] } });
  });
});
