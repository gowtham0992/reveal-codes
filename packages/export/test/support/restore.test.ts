import { createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { editOneCharacter } from "./docx-fixtures.js";
import { DEMO_DECLARATION } from "./demo-statement.js";
import { compareRestored, exportAndRestore, exportBytes, reopen } from "./restore.js";

const ISO = "2026-11-20T18:25:00.000Z";

function small(text: string): Document {
  const made = createDocument(text, ISO);
  if (!made.ok) throw new Error(`fixture rejected: ${made.error.kind}`);
  return made.value;
}

const FIXED = small("The motion is filed today.\nIt asks for nothing more.");
const OPTIONS = { declaration: DEMO_DECLARATION } as const;

describe("restore helpers self-test _Requirements: 9.10, 18.4, 18.5_", () => {
  it("restores a small fixed Document and reports equality", async () => {
    const result = await exportAndRestore(FIXED, OPTIONS);
    expect(result.draft.kind).toBe("restored");
    expect(result.documentEqual).toBe(true);
    expect(result.declarationEqual).toBe(true);
  });

  it("reports inequality for a one-character change in the Document", async () => {
    const changed = small("The motion is filed todax.\nIt asks for nothing more.");
    const bytes = await exportBytes(FIXED, OPTIONS);
    const result = compareRestored(reopen(bytes), changed, DEMO_DECLARATION);
    expect(result.draft.kind).toBe("restored");
    expect(result.documentEqual).toBe(false);
  });

  it("reports inequality for a different Declaration", async () => {
    const bytes = await exportBytes(FIXED, OPTIONS);
    expect(compareRestored(reopen(bytes), FIXED, null).declarationEqual).toBe(false);
  });

  it("reports a one-character edit of the exported bytes as a changed draft, not equal", async () => {
    const bytes = await exportBytes(FIXED, OPTIONS);
    const result = compareRestored(reopen(editOneCharacter(bytes)), FIXED, DEMO_DECLARATION);
    expect(result.draft.kind).toBe("changed");
    expect(result.documentEqual).toBe(false);
  });
});
