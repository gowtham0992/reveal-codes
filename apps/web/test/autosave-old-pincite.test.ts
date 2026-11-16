import { createDocument, render } from "@reveal-codes/engine";
import { describe, expect, it } from "vitest";
import { loadAutosave } from "../src/components/use-autosave";
import { AUTOSAVE_KEY, deserialise, savedDraftExists } from "../src/persist";
import { printModel } from "../src/print-model";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import { createMemoryStorage } from "./support/memory-storage";

/** A draft saved before the pincite change: `[/CIT]` closes inside `371-72` (design D20, no migration). */
function oldDraft(): string {
  const doc = createDocument(
    "See 174 F.3d 366, 371-72 (2d Cir. 1999).",
    "2026-11-02T12:00:00.000Z",
  );
  if (!doc.ok) throw new Error("createDocument failed");
  const full = render(doc.value, "full").text;
  const old = full.replace(
    "174 F.3d 366, 371-72 (2d Cir. 1999)[/CIT]",
    "174 F.3d 366, 371[/CIT]-72 (2d Cir. 1999)",
  );
  expect(old).not.toBe(full);
  return JSON.stringify({ version: 1, codes: old, runLog: [], verifiedAt: null });
}

describe("loading an old draft with [/CIT] inside a range _Requirements: 18.16_", () => {
  it("deserialise reports bad_codes", () => {
    const r = deserialise(oldDraft());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("bad_codes");
  });

  it("the mount-time load leaves the empty Document, with no notice, and keeps the stored value", () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, oldDraft());
    const store = createStore(() => new Date("2026-11-02T12:00:00.000Z"));
    const before = store.getState();
    loadAutosave({ storage } as unknown as AppServices, store);
    const after = store.getState();
    expect(after.document.text).toBe("");
    expect(after.document).toBe(before.document);
    expect(after.notices).toEqual(before.notices);
    expect(storage.getItem(AUTOSAVE_KEY)).toBe(oldDraft());
  });

  it("the draft does not count as a saved draft, and the print view says unreadable", () => {
    const storage = createMemoryStorage();
    storage.setItem(AUTOSAVE_KEY, oldDraft());
    expect(savedDraftExists(storage)).toBe(false);
    expect(printModel(oldDraft(), new Date("2026-11-02T12:00:00.000Z"), null)).toEqual({
      kind: "unreadable",
    });
  });
});
