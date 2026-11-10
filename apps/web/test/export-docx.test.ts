import { describe, expect, it, vi } from "vitest";
import { exportDocx } from "../src/client/export-docx";
import { EXPORT_FAILED } from "../src/notices";
import {
  EXPORT_NOW,
  EXPORT_VERIFIED_AT,
  gateClearDocument,
  storeWith,
} from "./support/export-fixtures";
import { freshDocument, verifiedDemoDocument } from "./support/persist-fixtures";

function recorder(): { calls: { bytes: Uint8Array; name: string }[]; download: never } {
  const calls: { bytes: Uint8Array; name: string }[] = [];
  const download = ((bytes: Uint8Array, name: string) => {
    calls.push({ bytes, name });
  }) as never;
  return { calls, download };
}

describe("exportDocx _Requirements: 1.5, 5.5, 7.2, 7.3, 7.4, 9.2, 9.4_", () => {
  it("downloads a docx named from the caption and the local date, and posts a notice", async () => {
    const store = storeWith(await gateClearDocument(), EXPORT_VERIFIED_AT);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const rec = recorder();
    const outcome = await exportDocx(store, {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: null,
    });
    expect(outcome.status).toBe("exported");
    expect(rec.calls).toHaveLength(1);
    const name = rec.calls[0]?.name ?? "";
    expect(name).toMatch(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.docx$/);
    expect(outcome).toEqual({ status: "exported", fileName: name });
    expect(Array.from((rec.calls[0]?.bytes ?? new Uint8Array()).slice(0, 2))).toEqual([0x50, 0x4b]);
    expect(store.getState().notice).toBe(`Exported ${name}.`);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns blocked for a Document with blocking issues and touches nothing", async () => {
    const store = storeWith(await verifiedDemoDocument(), EXPORT_VERIFIED_AT);
    const before = store.getState();
    const rec = recorder();
    const outcome = await exportDocx(store, {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: null,
    });
    expect(outcome).toEqual({ status: "blocked" });
    expect(rec.calls).toHaveLength(0);
    expect(store.getState()).toBe(before);
  });

  it("fails with the notice when download throws, leaving the Document unchanged", async () => {
    const doc = await gateClearDocument();
    const store = storeWith(doc, EXPORT_VERIFIED_AT);
    const outcome = await exportDocx(store, {
      now: () => EXPORT_NOW,
      download: () => {
        throw new Error("no anchor");
      },
      orderContext: null,
    });
    expect(outcome).toEqual({ status: "failed" });
    expect(store.getState().notice).toBe(EXPORT_FAILED);
    expect(store.getState().document).toBe(doc);
  });

  it("fails when the clock gives an invalid Date (buildStatement Err)", async () => {
    const store = storeWith(await gateClearDocument(), EXPORT_VERIFIED_AT);
    const rec = recorder();
    const outcome = await exportDocx(store, {
      now: () => new Date(Number.NaN),
      download: rec.download,
      orderContext: null,
    });
    expect(outcome).toEqual({ status: "failed" });
    expect(rec.calls).toHaveLength(0);
    expect(store.getState().notice).toBe(EXPORT_FAILED);
  });

  it("fails when a Document does not segment (broken span coverage)", async () => {
    const broken = storeWith({ ...freshDocument(), text: "abc" }, null);
    const rec = recorder();
    const outcome = await exportDocx(broken, {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: null,
    });
    expect(outcome).toEqual({ status: "failed" });
    expect(rec.calls).toHaveLength(0);
    expect(broken.getState().notice).toBe(EXPORT_FAILED);
  });

  it("exports an empty Document", async () => {
    const store = storeWith(freshDocument(), null);
    const rec = recorder();
    const outcome = await exportDocx(store, {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: null,
    });
    expect(outcome.status).toBe("exported");
    expect(rec.calls[0]?.name).toBe("filing-2026-11-20.docx");
  });
});
