import { apply, createDocument, holdsSubstantivePasted } from "@reveal-codes/engine";
import type { Declaration, Document } from "@reveal-codes/engine";
import { buildDocx, buildStatement } from "@reveal-codes/export";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { countVerifiableUnchecked, runVerifyFlow } from "../src/client/verify-flow";
import { needsCheckDate } from "../src/client/check-date";
import { openFile } from "../src/client/open-file";
import type { OpenOutcome } from "../src/client/open-outcome";
import { CHANGED_EXPORT_NOTE, reopenedMessage } from "../src/client/open-messages";
import { restoreNote } from "../src/client/open-note";
import { nextStep } from "../src/components/next-step";
import { serialise } from "../src/persist";
import { createStore } from "../src/store-runtime";
import type { Store } from "../src/store-runtime";
import { fakeVerifyApi } from "./support/check-date-fixtures";
import {
  EXPORT_NOW,
  EXPORT_VERIFIED_AT,
  gateClearDocument,
  pastedAiDeclaration,
} from "./support/export-fixtures";
import { ISO, freshDocument } from "./support/persist-fixtures";

const RUN_VERIFY = "Run Verify to check the citations again and record the date.";
const BOTH = `The tool names of the assistant runs and the check date were not in this file, so the next statement cannot give them. ${RUN_VERIFY}`;
const RUNS_ONLY =
  "The tool names of the assistant runs were not in this file, so the next statement cannot name them.";
const RESULTS_ONLY = `The check date was not in this file, so the next statement cannot give it. ${RUN_VERIFY}`;
const CHANGED =
  "This file was changed after it was exported, so its provenance record was not restored. The text is marked as pasted.";
const AI_TEXT = "\n\nThe Court may consider the facts stated above.";
const RUN_LOG = [{ runId: "run-1", provider: "fixture", modelId: null }] as const;

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${JSON.stringify(r.error)}`);
  return r.value;
}

function withAi(doc: Document): Document {
  const at = doc.text.length;
  const provenance = { origin: "AI", runId: "run-1", timestamp: ISO } as const;
  return must(apply(doc, { kind: "insert", at, text: AI_TEXT, provenance })).document;
}

function plainDocument(text: string): Document {
  return must(createDocument(text, ISO));
}

/** The package's own buildStatement and buildDocx, as the Export flow calls them. */
async function exportBytes(
  document: Document,
  verifiedAt: string | null,
  declaration: Declaration | null = pastedAiDeclaration(),
): Promise<Uint8Array> {
  const meta = { now: EXPORT_NOW, verifiedAt };
  const built = must(buildStatement(document, RUN_LOG, meta, null, declaration));
  return buildDocx(document, built);
}

/** The export with one body letter changed, which keeps its length. */
function editedBody(bytes: Uint8Array, from: string, to: string): Uint8Array {
  const parts = unzipSync(bytes);
  const part = parts["word/document.xml"];
  if (part === undefined) throw new Error("no document part");
  const xml = strFromU8(part);
  if (!xml.includes(from)) throw new Error("body word not found");
  return zipSync({ ...parts, "word/document.xml": strToU8(xml.replace(from, to)) });
}

async function open(name: string, bytes: Uint8Array): Promise<OpenOutcome> {
  const copy = bytes.slice().buffer;
  return openFile({ name, size: bytes.length, arrayBuffer: () => Promise.resolve(copy) });
}

async function restored(doc: Document, declaration?: Declaration | null) {
  const out = await open("filing.docx", await exportBytes(doc, EXPORT_VERIFIED_AT, declaration));
  if (out.kind !== "restored") throw new Error(`expected restored, got ${out.kind}`);
  return out;
}

/** What the open flow dispatches after a confirmed restore (Requirement 19 criterion 7). */
function install(store: Store, out: Extract<OpenOutcome, { kind: "restored" }>): void {
  store.dispatch({
    type: "replace",
    document: out.document,
    runLog: [],
    verifiedAt: null,
    declaration: out.declaration,
  });
  store.dispatch({ type: "notice", text: out.notice });
  store.dispatch({ type: "openNote", text: out.note });
}

function stepOf(store: Store): string {
  const { document, verifiedAt } = store.getState();
  return nextStep({
    empty: document.text.length === 0,
    verifying: false,
    verifiableUnchecked: countVerifiableUnchecked(document),
    needsCheckDate: needsCheckDate(document, verifiedAt),
    blocking: 0,
  });
}

describe("restoreNote _Requirements: 13.4, 13.5_", () => {
  it("words each of the three cases exactly, and says nothing for neither", async () => {
    const results = await gateClearDocument();
    expect(restoreNote(withAi(plainDocument("One sentence here.")))).toBe(RUNS_ONLY);
    expect(restoreNote(results)).toBe(RESULTS_ONLY);
    expect(restoreNote(withAi(results))).toBe(BOTH);
    expect(restoreNote(plainDocument("One sentence here."))).toBeNull();
    expect(RUNS_ONLY).not.toContain(RUN_VERIFY);
  });
});

describe("a restored export _Requirements: 13.1, 13.2, 13.3, 13.6, 13.7, 19.7_", () => {
  it("carries the note of its case through the open outcome", async () => {
    const results = await gateClearDocument();
    expect((await restored(withAi(plainDocument("One sentence here.")))).note).toBe(RUNS_ONLY);
    expect((await restored(results)).note).toBe(RESULTS_ONLY);
    expect((await restored(withAi(results))).note).toBe(BOTH);
    expect((await restored(plainDocument("One sentence here."))).note).toBeNull();
  });

  it("installs the Document and Declaration with an empty run log and no check date", async () => {
    const doc = withAi(await gateClearDocument());
    const out = await restored(doc);
    expect(out.notice).toBe(reopenedMessage("filing.docx", "2026-11-20"));
    const store = createStore(() => EXPORT_NOW);
    install(store, out);
    const state = store.getState();
    expect(state.document.text).toBe(doc.text);
    expect(state.document.spans).toEqual(doc.spans);
    expect(state.document.overrides).toEqual(doc.overrides);
    expect(state.runLog).toEqual([]);
    expect(state.verifiedAt).toBeNull();
    expect(state.declaration).toEqual(pastedAiDeclaration());
    expect(state.openNote).toBe(BOTH);
  });

  it("keeps the recorded span and override timestamps", async () => {
    const doc = withAi(await gateClearDocument());
    const out = await restored(doc);
    expect(out.document.overrides.map((o) => o.timestamp)).toEqual(
      doc.overrides.map((o) => o.timestamp),
    );
    expect(out.document.spans.map((s) => s.provenance.timestamp)).toEqual(
      doc.spans.map((s) => s.provenance.timestamp),
    );
  });

  it("is accepted by replace with runLog [] and verifiedAt null, and the statement prints not recorded", async () => {
    const out = await restored(withAi(plainDocument("One sentence here.")));
    const store = createStore(() => EXPORT_NOW);
    install(store, out);
    const state = store.getState();
    expect(state.document.runs.length).toBeGreaterThan(0);
    const built = must(
      buildStatement(
        state.document,
        state.runLog,
        { now: EXPORT_NOW, verifiedAt: state.verifiedAt },
        null,
        state.declaration,
      ),
    );
    expect(built.verifiedAt).toBeNull();
    expect(built.verifiedDate).toBeNull();
    expect(built.tools).toEqual([]);
    expect(built.runCount).toBe(0);
    const text = JSON.stringify(built);
    expect(text).not.toContain("Prompt records are retained");
  });

  it("restores the recorded Declaration with its subject and tool name", async () => {
    const doc = plainDocument("A pasted sentence is here.");
    expect(holdsSubstantivePasted(doc)).toBe(true);
    const out = await restored(doc, pastedAiDeclaration());
    expect(out.declaration).toMatchObject({
      subject: "pasted_text",
      choice: "declared_ai",
      toolName: "ChatGPT",
    });
  });

  it("leaves Next_Step at verify for the gap, and at export after a completed run", async () => {
    const out = await restored(await gateClearDocument());
    const store = createStore(() => EXPORT_NOW);
    install(store, out);
    expect(stepOf(store)).toBe("verify");
    const { api } = fakeVerifyApi();
    await runVerifyFlow(api, store, () => EXPORT_NOW);
    expect(store.getState().verifiedAt).toBe(EXPORT_NOW.toISOString());
    expect(stepOf(store)).toBe("export");
  });

  it("restores no court, judge or confidentiality tick", async () => {
    const out = await restored(await gateClearDocument());
    expect(Object.keys(out).sort()).toEqual(["declaration", "document", "kind", "note", "notice"]);
    const store = createStore(() => EXPORT_NOW);
    install(store, out);
    expect(Object.keys(store.getState()).sort()).toEqual([
      "declaration",
      "document",
      "epoch",
      "notice",
      "openNote",
      "redo",
      "runLog",
      "undo",
      "verifiedAt",
    ]);
  });
});

describe("a changed export _Requirements: 9.7, 13.8, 15.1, 15.2_", () => {
  async function changed(): Promise<Extract<OpenOutcome, { kind: "text" }>> {
    const bytes = await exportBytes(plainDocument("Hello world sentence."), EXPORT_VERIFIED_AT);
    const out = await open("changed.docx", editedBody(bytes, "Hello", "Hellp"));
    if (out.kind !== "text") throw new Error(`expected text, got ${out.kind}`);
    return out;
  }

  it("opens as text with the exact note and no Declaration", async () => {
    const out = await changed();
    expect(out.note).toBe(CHANGED);
    expect(CHANGED_EXPORT_NOTE).toBe(CHANGED);
    expect(out.text).toContain("Hellp world sentence.");
    const store = createStore(() => EXPORT_NOW);
    const doc = plainDocument(out.text);
    store.dispatch({ type: "replace", document: doc, runLog: [], verifiedAt: null });
    store.dispatch({ type: "openNote", text: out.note });
    const state = store.getState();
    expect(state.declaration).toBeNull();
    expect(state.document.spans).toHaveLength(1);
    expect(state.document.spans[0]?.provenance.origin).toBe("PST");
  });
});

describe("the Open_Note lifetime _Requirements: 15.3, 15.4, 15.5, 15.6_", () => {
  it("is replaced by the next restore and cleared by the next open without a note", async () => {
    const store = createStore(() => EXPORT_NOW);
    install(store, await restored(withAi(plainDocument("One sentence here."))));
    expect(store.getState().openNote).toBe(RUNS_ONLY);
    install(store, await restored(plainDocument("Another sentence here.")));
    expect(store.getState().openNote).toBeNull();
  });

  it("is cleared by replace (New, Load demo motion, Load the Avianca citations)", () => {
    for (const document of [freshDocument(), plainDocument("Demo text here.")]) {
      const store = createStore(() => EXPORT_NOW);
      store.dispatch({ type: "openNote", text: CHANGED });
      store.dispatch({ type: "replace", document });
      expect(store.getState().openNote).toBeNull();
    }
  });

  it("is cleared when a Verify run starts", async () => {
    const store = createStore(() => EXPORT_NOW);
    store.dispatch({ type: "replace", document: await gateClearDocument() });
    store.dispatch({ type: "openNote", text: RESULTS_ONLY });
    const { api } = fakeVerifyApi();
    const run = runVerifyFlow(api, store, () => EXPORT_NOW);
    expect(store.getState().openNote).toBeNull();
    await run;
  });

  it("is not persisted", () => {
    const store = createStore(() => EXPORT_NOW);
    store.dispatch({ type: "openNote", text: CHANGED });
    const s = store.getState();
    const stored = serialise(s.document, s.runLog, s.verifiedAt, s.declaration);
    expect(stored).not.toContain("changed after it was exported");
  });
});
