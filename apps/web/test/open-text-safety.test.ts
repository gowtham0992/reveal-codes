import { createDocument } from "@reveal-codes/engine";
import { buildDocx, buildStatement, holdsDocxUnsafe } from "@reveal-codes/export";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportDocx } from "../src/client/export-docx";
import { openFile } from "../src/client/open-file";
import { wordOutcome } from "../src/client/open-outcome";
import type { OpenOutcome } from "../src/client/open-outcome";
import { NOTES_SENTENCE, openedMessage, removedSentence } from "../src/client/open-messages";
import { EXPORT_UNSAFE_CHARACTER } from "../src/notices";
import {
  EXPORT_NOW,
  EXPORT_VERIFIED_AT,
  pastedAiDeclaration,
  storeWith,
} from "./support/export-fixtures";
import { ISO } from "./support/persist-fixtures";

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);
const NAME = "motion.txt";

function must<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`fixture rejected: ${JSON.stringify(r.error)}`);
  return r.value;
}

async function open(name: string, bytes: Uint8Array): Promise<OpenOutcome> {
  const copy = bytes.slice().buffer;
  return openFile({ name, size: bytes.length, arrayBuffer: () => Promise.resolve(copy) });
}

async function exportOf(text: string): Promise<Uint8Array> {
  const doc = must(createDocument(text, ISO));
  const meta = { now: EXPORT_NOW, verifiedAt: EXPORT_VERIFIED_AT };
  const built = must(buildStatement(doc, [], meta, null, pastedAiDeclaration()));
  return buildDocx(doc, built);
}

function bodyReplaced(bytes: Uint8Array, from: string, to: string): Uint8Array {
  const parts = unzipSync(bytes);
  const part = parts["word/document.xml"];
  if (part === undefined) throw new Error("no document part");
  const xml = strFromU8(part);
  if (!xml.includes(from)) throw new Error("body word not found");
  return zipSync({ ...parts, "word/document.xml": strToU8(xml.replace(from, to)) });
}

function textOf(out: OpenOutcome): Extract<OpenOutcome, { kind: "text" }> {
  if (out.kind !== "text") throw new Error(`expected text, got ${out.kind}`);
  return out;
}

describe("Open_Message removed sentence _Requirements: 22.5, 7.7_", () => {
  it("says nothing for 0, the singular for 1 and the count for more", () => {
    expect(openedMessage(NAME, 10, 0, false)).toBe(
      "Opened motion.txt: 10 characters, marked as pasted.",
    );
    expect(openedMessage(NAME, 10, 1, false)).toBe(
      "Opened motion.txt: 10 characters, marked as pasted. 1 character that Word files cannot store was removed.",
    );
    expect(openedMessage(NAME, 10, 3, false)).toBe(
      "Opened motion.txt: 10 characters, marked as pasted. 3 characters that Word files cannot store were removed.",
    );
  });

  it("orders opened, removed, then notes sentence", () => {
    const msg = openedMessage(NAME, 10, 2, true);
    const opened = msg.indexOf("marked as pasted.");
    const removed = msg.indexOf(removedSentence(2));
    const notes = msg.indexOf(NOTES_SENTENCE);
    expect(opened).toBeGreaterThan(0);
    expect(removed).toBeGreaterThan(opened);
    expect(notes).toBeGreaterThan(removed);
    expect(msg.endsWith(NOTES_SENTENCE)).toBe(true);
    expect(openedMessage(NAME, 10, 0, true)).toBe(
      `Opened motion.txt: 10 characters, marked as pasted.${NOTES_SENTENCE}`,
    );
  });
});

describe("a Text_File _Requirements: 22.3, 22.5_", () => {
  it("turns U+000B and U+000C into line breaks without counting them", async () => {
    const out = textOf(await open(NAME, utf8("one\u000btwo\u000cthree")));
    expect(out.text).toBe("one\ntwo\nthree");
    expect(out.removed).toBe(0);
    expect(out.notice).toBe("Opened motion.txt: 13 characters, marked as pasted.");
  });

  it("removes the other forbidden characters and counts them in the message", async () => {
    const out = textOf(await open(NAME, utf8("a\u0000b\u0001c\ufffed\u000be")));
    expect(out.text).toBe("abcd\ne");
    expect(out.removed).toBe(3);
    expect(out.notice).toBe(
      "Opened motion.txt: 6 characters, marked as pasted. 3 characters that Word files cannot store were removed.",
    );
    expect(holdsDocxUnsafe(out.text)).toBe(false);
  });

  it("states one removed character in the singular", async () => {
    const out = textOf(await open(NAME, utf8("ab\u0001c")));
    expect(out.removed).toBe(1);
    expect(out.notice).toBe(
      "Opened motion.txt: 3 characters, marked as pasted. 1 character that Word files cannot store was removed.",
    );
  });

  it("refuses a file that holds only control characters as empty", async () => {
    const out = await open(NAME, utf8("\u0000\u0001\ufffe \n"));
    expect(out).toMatchObject({
      kind: "refused",
      notice: "Could not open motion.txt.",
      note: "motion.txt is empty. Choose a file that has text in it.",
    });
  });
});

describe("a Word file _Requirements: 22.3, 22.5_", () => {
  it("removes forbidden characters from the body and counts them", async () => {
    const plain = bodyReplaced(
      await exportOf("Hello world sentence."),
      "Hello world sentence.",
      "Hello\ufffe wor\ufffeld sentence.",
    );
    const out = textOf(await open("plain.docx", plain));
    expect(out.text).not.toMatch(/\ufffe/);
    expect(out.removed).toBeGreaterThanOrEqual(2);
    expect(out.notice).toContain(removedSentence(out.removed));
  });

  it("imports a changed export sanitised", async () => {
    const changed = bodyReplaced(await exportOf("Hello world sentence."), "Hello", "Hellp\ufffe");
    const out = textOf(await open("changed.docx", changed));
    expect(out.text).toContain("Hellp world sentence.");
    expect(holdsDocxUnsafe(out.text)).toBe(false);
    expect(out.removed).toBe(1);
    expect(out.notice).toContain(removedSentence(1));
  });
});

describe("a restored export _Requirements: 22.4, 19.15_", () => {
  it("is not sanitised: the Document text equals the record", () => {
    // A written Word file cannot carry these characters, so the record is handed to wordOutcome directly.
    const text = "I ask the Court to deny\u0001 the\u000bmotion.";
    const document = must(createDocument(text, ISO));
    const out = wordOutcome("filing.docx", {
      kind: "restored",
      record: { document, declaration: null },
      exportedOn: "2026-11-20",
    } as unknown as Parameters<typeof wordOutcome>[1]);
    if (out.kind !== "restored") throw new Error(`expected restored, got ${out.kind}`);
    expect(out.document.text).toBe(text);
    expect(out.notice).toBe(
      "Reopened filing.docx with its provenance record (exported 2026-11-20).",
    );
  });

  it("restores the text of an exported file unchanged", async () => {
    const text = "I ask the Court to deny the motion.\nIt is so.";
    const out = await open("filing.docx", await exportOf(text));
    if (out.kind !== "restored") throw new Error(`expected restored, got ${out.kind}`);
    expect(out.document.text).toBe(text);
  });

  it("exports a restored Document that holds no unsafe character", async () => {
    const text = "I ask the Court to deny the motion.";
    const out = await open("filing.docx", await exportOf(text));
    if (out.kind !== "restored") throw new Error(`expected restored, got ${out.kind}`);
    const store = storeWith(out.document, null);
    const downloads: string[] = [];
    const outcome = await exportDocx(store, {
      now: () => EXPORT_NOW,
      download: (_bytes: Uint8Array, name: string) => void downloads.push(name),
      orderContext: null,
    });
    expect(outcome.status).toBe("exported");
    expect(downloads).toHaveLength(1);
  });

  it("refuses to export a restored Document that holds an unsafe character", async () => {
    const document = must(createDocument("Deny\u0001 it.", ISO));
    const store = storeWith(document, null);
    const outcome = await exportDocx(store, {
      now: () => EXPORT_NOW,
      download: () => {
        throw new Error("must not download");
      },
      orderContext: null,
    });
    expect(outcome).toEqual({ status: "failed" });
    expect(store.getState().notice).toBe(EXPORT_UNSAFE_CHARACTER);
  });
});
