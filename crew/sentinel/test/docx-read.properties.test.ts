import { parseRecord } from "@reveal-codes/engine";
import { APPENDIX_TITLE, STATEMENT_TITLE, buildDocx, buildStatement } from "@reveal-codes/export";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arbDocument } from "../../../packages/engine/src/testing/arb-document";
import { readDocx } from "../src/docx-read.js";
import { splitExport } from "../src/split.js";
import { declarationFor } from "./support/export-support.js";
import { docxRuns } from "./support/fc.js";

const META = {
  now: new Date("2026-11-20T18:30:00.000Z"),
  verifiedAt: "2026-11-20T18:25:00.000Z",
};

// Guard: the filter drops no generated Document (arbDocument has no such characters).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f]/;

describe("docx round trip _Requirements: 2.14, 4.6_", () => {
  // Property 1
  it("P1 readDocx, splitExport and parse recover the Document", async () => {
    // The run count is low because packing a .docx is slow.
    await fc.assert(
      fc.asyncProperty(
        arbDocument.filter((d) => !CONTROL.test(d.text)),
        async (d) => {
          const st = buildStatement(d, [], META, null, declarationFor(d, null));
          expect(st.ok).toBe(true);
          if (!st.ok) return;
          const read = readDocx(await buildDocx(d, st.value));
          expect(read.ok).toBe(true);
          if (!read.ok) return;
          const list = read.value;
          const body = d.text.split("\n");
          expect(list.slice(0, body.length)).toEqual(body);
          const s = list.indexOf(STATEMENT_TITLE);
          expect(s).toBe(body.length);
          expect(list.indexOf(APPENDIX_TITLE, s + 1)).toBeGreaterThan(s);
          const parts = splitExport(list);
          expect(parts.ok).toBe(true);
          if (!parts.ok) return;
          expect(parts.value.body.join("\n")).toBe(d.text);
          const parsed = parseRecord(parts.value.appendix.join("\n"));
          expect(parsed.ok).toBe(true);
          if (!parsed.ok) return;
          expect(parsed.value.document).toEqual(d);
          expect(parsed.value.declaration).toEqual(declarationFor(d, null));
        },
      ),
      { numRuns: docxRuns(process.env) },
    );
  }, 300_000);
});
