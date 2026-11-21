// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createAutosave } from "../src/autosave";
import type { ApiClient } from "../src/client/api";
import { exportDocx } from "../src/client/export-docx";
import { runDraft } from "../src/components/use-assistant";
import { useDocumentActions } from "../src/components/use-document-actions";
import { createDraftGate } from "../src/draft-gate";
import { buildDropTransaction, buildPasteTransaction, plainTextOf } from "../src/editor/clipboard";
import { PROVENANCE_META } from "../src/editor/meta";
import { docText } from "../src/editor/offsets";
import { EXPORT_UNSAFE_CHARACTER } from "../src/notices";
import { defaultServices } from "../src/services";
import type { AppServices } from "../src/services";
import { createStore } from "../src/store-runtime";
import { EXPORT_NOW, EXPORT_VERIFIED_AT, storeWith } from "./support/export-fixtures";
import { createMemoryStorage } from "./support/memory-storage";
import { ISO, overriddenDocument } from "./support/persist-fixtures";
import { stateFromText, withSelection } from "./support/pm";
import { createDocument } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import "./support/dom-shims";

const data = (map: Record<string, string>) => ({ getData: (type: string) => map[type] ?? "" });

// U+000B and U+000C become line breaks; U+0000, U+0001 and U+FFFE are removed; CRLF is one break.
const UNSAFE = "Roe\u000bv. Wade,\u0000 410\u0001 U.S.\u000c113\r\n(1973)\ufffe.";
const SAFE = "Roev. Wade, 410 U.S.113(1973).";
const SAFE_LINES = "Roe\nv. Wade, 410 U.S.\n113\n(1973).";

describe("Entry_Points: paste and drop _Requirements: 22.3_", () => {
  it("plainTextOf turns U+000B and U+000C into line breaks and removes forbidden characters", () => {
    expect(plainTextOf(data({ "text/plain": UNSAFE }))).toBe(SAFE_LINES);
    expect(SAFE_LINES).not.toBe(SAFE);
  });

  it("is null when the text holds nothing but forbidden characters", () => {
    expect(plainTextOf(data({ "text/plain": "\u0000\u0001\ufffe" }))).toBeNull();
  });

  it("a paste inserts the safe text as PST", () => {
    const text = plainTextOf(data({ "text/plain": UNSAFE }));
    if (text === null) throw new Error("no text");
    const tr = buildPasteTransaction(withSelection(stateFromText("ab"), 2), text);
    expect(docText(tr.doc)).toBe(`a${SAFE_LINES}b`);
    expect(tr.getMeta(PROVENANCE_META)).toEqual({ origin: "PST" });
  });

  it("a drop inserts the same safe text as PST", () => {
    const text = plainTextOf(data({ "text/plain": UNSAFE }));
    if (text === null) throw new Error("no text");
    const tr = buildDropTransaction(stateFromText("ab"), text, 2, false);
    expect(docText(tr.doc)).toBe(`a${SAFE_LINES}b`);
    expect(tr.getMeta("uiEvent")).toBe("drop");
    expect(tr.getMeta(PROVENANCE_META)).toEqual({ origin: "PST" });
  });
});

type Fake = Readonly<{ demo: string; avianca: string; chunks: readonly string[] }>;

function fakeApi(fake: Fake): ApiClient {
  const network = { ok: false, error: { kind: "network" } } as const;
  return {
    verify: () => Promise.resolve(network),
    opinion: () => Promise.resolve(network),
    mode: () => Promise.resolve(network),
    demoMotion: () => Promise.resolve({ ok: true, value: fake.demo }),
    aviancaCitations: () => Promise.resolve({ ok: true, value: fake.avianca }),
    recordedSample: () => Promise.resolve(network),
    draft: (_prompt, _context, onChunk) => {
      for (const c of fake.chunks) onChunk(c);
      return Promise.resolve({ ok: true, value: undefined });
    },
  };
}

function services(fake: Fake): AppServices {
  return { ...defaultServices(), api: fakeApi(fake), now: () => new Date(ISO) };
}

describe("Entry_Points: the two samples _Requirements: 22.3_", () => {
  it.each(["demo", "avianca"] as const)("loads the %s sample as Docx_Safe_Text", async (key) => {
    const svc = services({ demo: UNSAFE, avianca: UNSAFE, chunks: [] });
    const store = createStore(() => new Date(ISO));
    const autosave = createAutosave({
      storage: createMemoryStorage(),
      setTimer: () => 0,
      clearTimer: () => {},
      onError: () => {},
    });
    const { result } = renderHook(() =>
      useDocumentActions({
        store,
        svc,
        autosave,
        gate: createDraftGate(),
        doc: store.getState().document,
      }),
    );
    result.current.onLoadSample(key);
    await waitFor(() => {
      expect(store.getState().document.text).not.toBe("");
    });
    const doc = store.getState().document;
    expect(doc.text).toBe(SAFE_LINES);
    expect(doc.spans.every((s) => s.provenance.origin === "PST")).toBe(true);
  });
});

describe("Entry_Points: assistant insertion _Requirements: 22.3_", () => {
  it("inserts the whole reply once, cutting no surrogate pair split across chunks", async () => {
    const chunks = ["a\u000bb\u0000c\ud83d", "\ude00d\u0001e"];
    const svc = services({ demo: "", avianca: "", chunks });
    const store = createStore(() => new Date(ISO));
    const outcome = await runDraft({
      svc,
      store,
      info: { provider: "fixture", modelId: null },
      prompt: "Draft it.",
      getCaret: () => 0,
      signal: new AbortController().signal,
      onText: () => {},
    });
    expect(outcome.message).toBeNull();
    const text = store.getState().document.text;
    expect(text).toContain("a\nbc\u{1F600}de");
    const banned = new Set([0x00, 0x01, 0x0b, 0x0c]);
    const codes = Array.from({ length: text.length }, (_, i) => text.charCodeAt(i));
    expect(codes.some((code) => banned.has(code))).toBe(false);
    expect(store.getState().document.spans.some((s) => s.provenance.origin === "AI")).toBe(true);
  });
});

function unsafeBodyDocument(): Document {
  const made = createDocument("I ask the Court to deny\u0001 the motion.", ISO);
  if (!made.ok) throw new Error(`fixture rejected: ${made.error.kind}`);
  return made.value;
}

function unsafeReasonDocument(): Document {
  const doc = overriddenDocument();
  expect(doc.overrides.length).toBeGreaterThan(0);
  return {
    ...doc,
    overrides: doc.overrides.map((o) => ({ ...o, reason: `Cited from\u0000 notes` })),
  };
}

async function refuse(document: Document): Promise<void> {
  const store = storeWith(document, EXPORT_VERIFIED_AT);
  const before = store.getState();
  const downloads: string[] = [];
  const outcome = await exportDocx(store, {
    now: () => EXPORT_NOW,
    download: (_bytes, name) => {
      downloads.push(name);
    },
    orderContext: null,
  });
  expect(outcome).toEqual({ status: "failed" });
  expect(downloads).toEqual([]);
  expect(store.getState().notice).toBe(EXPORT_UNSAFE_CHARACTER);
  expect(store.getState().document).toBe(before.document);
  expect(EXPORT_UNSAFE_CHARACTER).toBe(
    "This draft holds a character that Word files cannot store, so it was not exported. Paste the text again or remove the character.",
  );
}

describe("Export refusal for a stored unsafe character _Requirements: 22.8, 19.15_", () => {
  it("refuses a body holding one, with the exact message", async () => {
    await refuse(unsafeBodyDocument());
  });

  it("refuses an override reason holding one, with the exact message", async () => {
    await refuse(unsafeReasonDocument());
  });
});
