import { buildDocx } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { analyseFile } from "../src/analyse.js";
import { readDocx } from "@reveal-codes/export";
import { recordedRecord } from "@reveal-codes/export";
import { renderReport } from "../src/report.js";
import { splitExport } from "@reveal-codes/export";
import { editDocumentXml } from "./support/docx-edit.js";
import {
  DEMO_DECLARATION,
  buildDemoDocument,
  buildDemoDocumentStatement,
  noneFor,
} from "./support/export-support.js";
import { recordedFetch } from "./support/recorded-fetch.js";
import { testDeps } from "./support/test-deps.js";

const FILE = "declaration-motion.docx";
const SWEPT_AT = new Date(2026, 10, 20, 10, 30);
// The `d` field of the [DOC] line, with the separator that precedes it.
const DECLARATION_FIELD = /;d=[^;}\]]*/g;

async function declaredAiExport(): Promise<Uint8Array> {
  const { statement } = await buildDemoDocumentStatement();
  return buildDocx(await buildDemoDocument(), statement);
}

async function noneExport(): Promise<Uint8Array> {
  const { statement } = await buildDemoDocumentStatement(null, noneFor("pasted_text"));
  return buildDocx(await buildDemoDocument(), statement);
}

/** The Declaration recorded in the Appendix of a .docx. */
function recordedDeclaration(bytes: Uint8Array) {
  const read = readDocx(bytes);
  if (!read.ok) throw new Error(read.error.kind);
  const split = splitExport(read.value);
  if (!split.ok) throw new Error(split.error.kind);
  const record = recordedRecord(split.value.appendix);
  if (!record.ok) throw new Error(record.error.kind);
  return record.value.declaration;
}

async function reportOf(bytes: Uint8Array): Promise<string> {
  const findings = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
  expect(findings).toEqual([]);
  return renderReport({ sweptAt: SWEPT_AT, mode: "fixtures", files: [{ file: FILE, findings }] });
}

describe("Sentinel sweep of a filing with a Declaration _Requirements: 8.6, 8.9, 12.9_", () => {
  it("reads a Declared_AI export as No drift. and keeps the Declaration", async () => {
    const bytes = await declaredAiExport();
    expect(await reportOf(bytes)).toContain(`## ${FILE}\n\nNo drift.`);
    expect(recordedDeclaration(bytes)).toEqual(DEMO_DECLARATION);
  });

  it("reads a None export as No drift. and keeps the Declaration", async () => {
    const bytes = await noneExport();
    expect(await reportOf(bytes)).toContain(`## ${FILE}\n\nNo drift.`);
    expect(recordedDeclaration(bytes)).toEqual(noneFor("pasted_text"));
  });

  it("reads an export made before the Declaration existed as No drift. with declaration null", async () => {
    let stripped = 0;
    const bytes = editDocumentXml(await declaredAiExport(), (xml) =>
      xml.replace(DECLARATION_FIELD, () => {
        stripped += 1;
        return "";
      }),
    );
    expect(stripped).toBe(1);
    expect(recordedDeclaration(bytes)).toBeNull();
    expect(await reportOf(bytes)).toContain(`## ${FILE}\n\nNo drift.`);
  });
});
