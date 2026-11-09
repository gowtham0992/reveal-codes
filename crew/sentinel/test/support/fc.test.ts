import { APPENDIX_TITLE, STATEMENT_TITLE, buildDocx } from "@reveal-codes/export";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { renameTitles, zipWithout } from "./docx-edit";
import { buildDemoDocument, buildDemoDocumentStatement } from "./export-support";
import { docxRuns, runs } from "./fc";

describe("docxRuns", () => {
  const table: readonly [string, Record<string, string | undefined>, number][] = [
    ["unset", {}, 50],
    ["empty", { FC_NUM_RUNS: "" }, 50],
    ["zero", { FC_NUM_RUNS: "0" }, 50],
    ["not a number", { FC_NUM_RUNS: "abc" }, 50],
    ["30", { FC_NUM_RUNS: "30" }, 30],
    ["100", { FC_NUM_RUNS: "100" }, 100],
    ["500", { FC_NUM_RUNS: "500" }, 100],
  ];
  it.each(table)("%s", (_name, env, expected) => {
    expect(docxRuns(env)).toBe(expected);
  });
});

describe("runs", () => {
  const table: readonly [string, Record<string, string | undefined>, number][] = [
    ["local", {}, 200],
    ["CI", { CI: "true" }, 500],
    ["empty CI", { CI: "" }, 200],
    ["FC_NUM_RUNS", { FC_NUM_RUNS: "30" }, 30],
    ["FC_NUM_RUNS beats CI", { CI: "true", FC_NUM_RUNS: "7" }, 7],
    ["invalid FC_NUM_RUNS", { FC_NUM_RUNS: "0" }, 200],
    ["invalid FC_NUM_RUNS in CI", { CI: "1", FC_NUM_RUNS: "abc" }, 500],
  ];
  it.each(table)("%s", (_name, env, expected) => {
    expect(runs(env)).toBe(expected);
  });
});

describe("docx-edit", () => {
  async function demo(): Promise<Uint8Array> {
    const { statement } = await buildDemoDocumentStatement();
    return buildDocx(await buildDemoDocument(), statement);
  }
  function documentXml(bytes: Uint8Array): string {
    const part = unzipSync(bytes)["word/document.xml"];
    if (part === undefined) throw new Error("missing word/document.xml");
    return strFromU8(part);
  }

  it("renameTitles output unzips and contains neither title", async () => {
    const original = documentXml(await demo());
    expect(original).toContain(STATEMENT_TITLE);
    expect(original).toContain(APPENDIX_TITLE);
    const renamed = documentXml(renameTitles(await demo()));
    expect(renamed).not.toContain(STATEMENT_TITLE);
    expect(renamed).not.toContain(APPENDIX_TITLE);
  });

  it("zipWithout output unzips and has no word/document.xml", async () => {
    const parts = unzipSync(zipWithout(await demo()));
    expect(Object.keys(parts)).not.toContain("word/document.xml");
    expect(Object.keys(parts).length).toBeGreaterThan(0);
  });
});
