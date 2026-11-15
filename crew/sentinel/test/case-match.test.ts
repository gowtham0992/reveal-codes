import { buildDocx } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { analyseFile } from "../src/analyse.js";
import { editDocumentXml } from "./support/docx-edit.js";
import { buildDemoDocument, buildDemoDocumentStatement } from "./support/export-support.js";
import { recordedFetch } from "./support/recorded-fetch.js";
import { testDeps } from "./support/test-deps.js";

const FILE = "motion.docx";
const WRONG_NAME = "Henderson v. Pacific Housing Authority";
const VERIFIED_OPENER = "[CIT ✓{k=k0;cl=145875}]";
const WRONG_OPENER = `[CIT ≠{k=k0;cl=145875;nm=${WRONG_NAME};yr=2009}]`;
// k8 is the Short_Form of k0; its key-only code must follow its target's status.
const SHORT_VERIFIED = "[CIT ✓{k=k8}]";
const SHORT_WRONG = "[CIT ≠{k=k8}]";
const NEW_TERM = "0 resolved to a different case than the one named, ";

async function demoExport(): Promise<Uint8Array> {
  const { statement } = await buildDemoDocumentStatement();
  return buildDocx(await buildDemoDocument(), statement);
}

function replaceOnce(xml: string, from: string, to: string): string {
  expect(xml.split(from)).toHaveLength(2);
  return xml.replace(from, to);
}

describe("Sentinel case match _Requirements: 9.2, 9.3, 9.7, 9.8_", () => {
  it("reports verified to wrong_case when the recorded cited name no longer matches", async () => {
    const bytes = editDocumentXml(await demoExport(), (xml) =>
      replaceOnce(
        xml,
        `Ashcroft v. Iqbal, ${VERIFIED_OPENER}`,
        `${WRONG_NAME}, ${VERIFIED_OPENER}`,
      ),
    );
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    const changed = found.filter((f) => f.kind === "citation_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]?.before).toBe("verified 145875");
    expect(changed[0]?.after).toMatch(/^wrong_case 145875 Ashcroft v\. Iqbal/);
  });

  it("reports wrong_case to verified, and parses an appendix containing CIT ≠", async () => {
    const bytes = editDocumentXml(await demoExport(), (xml) =>
      replaceOnce(replaceOnce(xml, VERIFIED_OPENER, WRONG_OPENER), SHORT_VERIFIED, SHORT_WRONG),
    );
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    expect(found.filter((f) => f.kind === "unreadable")).toEqual([]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: "citation_changed",
      file: FILE,
      before: `wrong_case 145875 ${WRONG_NAME}`,
      after: "verified 145875",
    });
  });

  it("sweeps a filing exported before this spec without a finding or an error", async () => {
    const bytes = editDocumentXml(await demoExport(), (xml) => replaceOnce(xml, NEW_TERM, ""));
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    expect(found).toEqual([]);
  });
});
