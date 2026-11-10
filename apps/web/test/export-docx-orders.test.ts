import { describe, expect, it } from "vitest";
import { exportDocx } from "../src/client/export-docx";
import { EXPORT_NOW, storeWith } from "./support/export-fixtures";
import { readDocxParagraphs } from "./support/docx-text";
import { aiDocument, entryOf, humanDocument } from "./support/order-fixtures";

type Call = { bytes: Uint8Array; name: string };

function recorder(): { calls: Call[]; download: (bytes: Uint8Array, name: string) => void } {
  const calls: Call[] = [];
  return {
    calls,
    download: (bytes, name) => {
      calls.push({ bytes, name });
    },
  };
}

const SENTENCE =
  "The author certifies that no confidential or business proprietary information was entered into the program.";

describe("exportDocx with an order _Requirements: 5.2, 6.2, 6.7, 9.7, 9.8_", () => {
  it("returns blocked for a prohibition with AI text and touches nothing", async () => {
    const store = storeWith(aiDocument(), null);
    const before = store.getState();
    const rec = recorder();
    const outcome = await exportDocx(store, {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: { entry: entryOf("sdohio-newman"), confidentialityCertified: false },
    });
    expect(outcome).toEqual({ status: "blocked" });
    expect(rec.calls).toHaveLength(0);
    expect(store.getState()).toBe(before);
  });

  it("returns blocked for a prohibition with AI text even when the tick is set", async () => {
    const rec = recorder();
    const outcome = await exportDocx(storeWith(aiDocument(), null), {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: { entry: entryOf("sdohio-newman"), confidentialityCertified: true },
    });
    expect(outcome).toEqual({ status: "blocked" });
    expect(rec.calls).toHaveLength(0);
  });

  it("exports under a prohibition when the Document holds no AI text", async () => {
    const rec = recorder();
    const outcome = await exportDocx(storeWith(humanDocument(), null), {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: { entry: entryOf("sdohio-newman"), confidentialityCertified: false },
    });
    expect(outcome.status).toBe("exported");
    expect(rec.calls).toHaveLength(1);
  });

  it("returns blocked for a missing tick when the entry needs confidentiality and AI is used", async () => {
    const rec = recorder();
    const outcome = await exportDocx(storeWith(aiDocument(), null), {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: { entry: entryOf("cit-choe-groves-2025"), confidentialityCertified: false },
    });
    expect(outcome).toEqual({ status: "blocked" });
    expect(rec.calls).toHaveLength(0);
  });

  it("passes the context to buildStatement: citing paragraph, and the sentence only with the tick", async () => {
    const entry = entryOf("cit-choe-groves-2025");
    const rec = recorder();
    const outcome = await exportDocx(storeWith(aiDocument(), null), {
      now: () => EXPORT_NOW,
      download: rec.download,
      orderContext: { entry, confidentialityCertified: true },
    });
    expect(outcome.status).toBe("exported");
    const paragraphs = readDocxParagraphs(rec.calls[0]?.bytes ?? new Uint8Array());
    expect(
      paragraphs.some((p) => p.includes(entry.instrument) && p.includes(entry.source_url)),
    ).toBe(true);
    expect(paragraphs.some((p) => p.includes(SENTENCE))).toBe(true);
  });

  it("omits the sentence when the entry has no confidentiality element, and with no order cites nothing", async () => {
    const entry = entryOf("edtex-love-2025");
    const withOrder = recorder();
    await exportDocx(storeWith(aiDocument(), null), {
      now: () => EXPORT_NOW,
      download: withOrder.download,
      orderContext: { entry, confidentialityCertified: true },
    });
    const none = recorder();
    await exportDocx(storeWith(aiDocument(), null), {
      now: () => EXPORT_NOW,
      download: none.download,
      orderContext: null,
    });
    const text = (r: ReturnType<typeof recorder>): string[] =>
      readDocxParagraphs(r.calls[0]?.bytes ?? new Uint8Array());
    expect(text(withOrder).some((p) => p.includes(SENTENCE))).toBe(false);
    expect(text(withOrder).some((p) => p.includes(entry.instrument))).toBe(true);
    expect(text(none).some((p) => p.includes(entry.instrument))).toBe(false);
    expect(withOrder.calls[0]?.name).toBe(none.calls[0]?.name);
  });
});
