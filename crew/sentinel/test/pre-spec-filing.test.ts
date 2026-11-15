import { buildDocx } from "@reveal-codes/export";
import { describe, expect, it } from "vitest";
import { analyseFile } from "../src/analyse.js";
import { editDocumentXml } from "./support/docx-edit.js";
import { buildDemoDocument, buildDemoDocumentStatement } from "./support/export-support.js";
import { recordedFetch } from "./support/recorded-fetch.js";
import { testDeps } from "./support/test-deps.js";

const FILE = "pre-spec-motion.docx";
const WRONG_NAME = "Henderson v. Pacific Housing Authority";
const VERIFIED_OPENER = "[CIT ✓{k=k0;cl=145875}]";
// The wrong-case term that the Statement citation paragraph gained with this spec.
const NEW_TERM = "0 resolved to a different case than the one named, ";

async function demoExport(): Promise<Uint8Array> {
  const { statement } = await buildDemoDocumentStatement();
  return buildDocx(await buildDemoDocument(), statement);
}

function replaceOnce(xml: string, from: string, to: string): string {
  expect(xml.split(from)).toHaveLength(2);
  return xml.replace(from, to);
}

/** A filing as exported before this spec: no wrong-case term, no `CIT ≠` in the appendix. */
async function preSpecFiling(edit: (xml: string) => string): Promise<Uint8Array> {
  return editDocumentXml(await demoExport(), (xml) => edit(replaceOnce(xml, NEW_TERM, "")));
}

describe("Sentinel sweep of a filing exported before this spec _Requirements: 9.8, 13.5_", () => {
  it("reports no finding and no error when each recorded verified name matches the re-check data", async () => {
    const bytes = await preSpecFiling((xml) => xml);
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    expect(found).toEqual([]);
  });

  it("reports one citation_changed finding for a verified citation whose written name now resolves to a different case", async () => {
    const bytes = await preSpecFiling((xml) =>
      replaceOnce(
        xml,
        `Ashcroft v. Iqbal, ${VERIFIED_OPENER}`,
        `${WRONG_NAME}, ${VERIFIED_OPENER}`,
      ),
    );
    const found = await analyseFile(FILE, bytes, testDeps(recordedFetch().fetch));
    // Editing the written name also edits the body, so a body_edited finding is expected too.
    expect(found.filter((f) => f.kind === "unreadable")).toEqual([]);
    const changed = found.filter((f) => f.kind === "citation_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ file: FILE, before: "verified 145875" });
    expect(changed[0]?.after).toMatch(/^wrong_case 145875 Ashcroft v\. Iqbal/);
  });
});
