import { createDocument } from "@reveal-codes/engine";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { docxSafe, holdsDocxUnsafe } from "../src/index.js";
import { arbDocxHostileText, runs } from "./support/arbitraries.js";
import { DEMO_DECLARATION } from "./support/demo-statement.js";
import { exportAndRestore } from "./support/restore.js";

const ISO = "2026-11-20T18:25:00.000Z";

describe("DOCX-safe text _Requirements: 22.1, 22.2, 22.3, 22.6, 22.7_", () => {
  // Property 4
  it("P4 docxSafe output is safe and idempotent, is the identity on safe input without CR, and exports and reopens equal", async () => {
    await fc.assert(
      fc.asyncProperty(arbDocxHostileText, async (s) => {
        const once = docxSafe(s);
        expect(holdsDocxUnsafe(once.text)).toBe(false);
        expect(docxSafe(once.text)).toEqual({ text: once.text, removed: 0 });
        if (!holdsDocxUnsafe(s) && !s.includes("\r")) {
          expect(once).toEqual({ text: s, removed: 0 });
        }
        const made = createDocument(once.text, ISO);
        expect(made.ok).toBe(true);
        if (!made.ok) return;
        const restored = await exportAndRestore(made.value, { declaration: DEMO_DECLARATION });
        expect(restored.draft.kind).toBe("restored");
        expect(restored.documentEqual).toBe(true);
      }),
      { numRuns: runs() },
    );
  });
});
