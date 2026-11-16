import { setQuoteCheck, setVerification } from "@reveal-codes/engine";
import type { Document } from "@reveal-codes/engine";
import { docxSafe, holdsDocxUnsafe } from "@reveal-codes/export";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { openFile } from "../src/client/open-file";
import type { OpenInput } from "../src/client/open-file";
import { removedSentence } from "../src/client/open-messages";
import { textOutcome } from "../src/client/open-outcome";
import { restoreNote } from "../src/client/open-note";
import { decodeTextFile } from "../src/client/open-text";
import { pastedDocument } from "../src/client/pasted-document";
import { initialState, reduce } from "../src/store";
import { arbCitingDocument } from "./arbitraries";
import { runs } from "./support/fc";
import { simpleDocx, truncated } from "./support/word-fixtures";

const BOM_BYTES = [0xef, 0xbb, 0xbf];

/** Any Unicode text with no `\r` and no Docx_Unsafe_Character (so every string is valid UTF-8). */
const arbCleanText: fc.Arbitrary<string> = fc
  .string({ unit: "binary", maxLength: 80 })
  .map((s) => docxSafe(s).text.replace(/\r/g, ""))
  .filter((s) => !holdsDocxUnsafe(s));

/** A non-empty line with no `\r` or `\n`: the separators are the only line breaks, and an empty line cannot make `\r` and `\n` merge. */
const arbLine: fc.Arbitrary<string> = arbCleanText
  .map((s) => s.replace(/\n/g, ""))
  .filter((s) => s.length > 0);

const arbSeparator = fc.constantFrom("\r\n", "\r", "\n");

function encode(text: string, withBom: boolean): Uint8Array {
  const body = new TextEncoder().encode(text);
  return withBom ? Uint8Array.from([...BOM_BYTES, ...body]) : body;
}

describe("open-file: UTF-8 text round trip _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_", () => {
  // Property 10
  it("P10 decodeTextFile returns the string with or without a BOM, and turns \\r\\n and \\r into \\n", () => {
    fc.assert(
      fc.property(
        arbCleanText,
        fc.array(arbLine, { minLength: 1, maxLength: 6 }),
        fc.array(arbSeparator, { minLength: 6, maxLength: 6 }),
        fc.boolean(),
        (text, lines, separators, withBom) => {
          expect(decodeTextFile(encode(text, withBom))).toEqual({ ok: true, value: text });

          const raw = lines.reduce(
            (acc, line, i) => (i === 0 ? line : acc + (separators[i - 1] ?? "\n") + line),
            "",
          );
          expect(decodeTextFile(encode(raw, withBom))).toEqual({
            ok: true,
            value: lines.join("\n"),
          });
        },
      ),
      { numRuns: runs() },
    );
  });
});

/** Text with Docx_Unsafe_Characters mixed in (binary units cover the C0 controls) and a Unicode tail. */
const arbOpenedRaw: fc.Arbitrary<string> = fc
  .tuple(fc.string({ unit: "binary", maxLength: 60 }), fc.string({ maxLength: 40 }))
  .map(([a, b]) => `${a}${b}`);

const NOW = new Date("2026-11-07T12:00:00.000Z");

describe("open-file: opened text installs as one PST span _Requirements: 8.1, 8.2, 8.6, 22.3, 22.5_", () => {
  // Property 11
  it("P11 an accepted text installs as one PST span after docxSafe, with a clean Store and the removed sentence", () => {
    fc.assert(
      fc.property(arbOpenedRaw, (raw) => {
        const outcome = textOutcome("draft.txt", raw, { notes: false, note: null });
        fc.pre(outcome.kind === "text");
        const safe = docxSafe(raw);
        expect(outcome.text).toBe(safe.text);
        expect(outcome.removed).toBe(safe.removed);
        expect(outcome.notice.includes(removedSentence(safe.removed))).toBe(true);
        expect(outcome.notice.includes("removed")).toBe(safe.removed >= 1);
        if (safe.removed >= 1) expect(outcome.notice).toContain(String(safe.removed));

        const iso = NOW.toISOString();
        const doc = pastedDocument(outcome.text, iso);
        expect(typeof doc).not.toBe("string");
        if (typeof doc === "string") return;
        const { state } = reduce(
          initialState(() => NOW),
          { type: "replace", document: doc, runLog: [], verifiedAt: null, declaration: null },
          () => NOW,
        );
        expect(state.document.text).toBe(safe.text);
        expect(state.document.spans).toEqual([
          { start: 0, end: safe.text.length, provenance: { origin: "PST", timestamp: iso } },
        ]);
        expect(state.document.runs).toEqual([]);
        expect(state.document.overrides).toEqual([]);
        expect(state.document.quotes.every((q) => q.result.status === "unchecked")).toBe(true);
        expect(
          state.document.citations.every(
            (c) => c.kind !== "full" || c.result.status === "unchecked",
          ),
        ).toBe(true);
        expect(state.declaration).toBeNull();
        expect(state.runLog).toEqual([]);
        expect(state.verifiedAt).toBeNull();
      }),
      { numRuns: runs() },
    );
  });
});

const RUN_VERIFY_SENTENCE = "Run Verify to check the citations again and record the date.";
const NOTE_BOTH =
  "The tool names of the assistant runs and the check date were not in this file, so the next statement cannot give them. Run Verify to check the citations again and record the date.";
const NOTE_RUNS_ONLY =
  "The tool names of the assistant runs were not in this file, so the next statement cannot name them.";
const NOTE_RESULTS_ONLY =
  "The check date was not in this file, so the next statement cannot give it. Run Verify to check the citations again and record the date.";

type RestoreCase = Readonly<{ document: Document; withRuns: boolean; withResult: boolean }>;

/** Writes a result onto the first full citation, else the first quote; reports whether one was written. */
function withOneResult(doc: Document): { document: Document; written: boolean } {
  const full = doc.citations.find((c) => c.kind === "full");
  if (full !== undefined) {
    const set = setVerification(doc, full.key, { status: "not_found" });
    if (set.ok) return { document: set.value, written: true };
  }
  const quote = doc.quotes[0];
  if (quote !== undefined) {
    const set = setQuoteCheck(doc, quote.key, { status: "match" });
    if (set.ok) return { document: set.value, written: true };
  }
  return { document: doc, written: false };
}

/** Documents with and without AI runs, and with and without a result; the flags come from the generator. */
const arbRestoreCase: fc.Arbitrary<RestoreCase> = fc
  .tuple(arbCitingDocument, fc.boolean(), fc.boolean())
  .map(([cited, wantRuns, wantResult]) => {
    const resulted = wantResult ? withOneResult(cited) : { document: cited, written: false };
    const run = { runId: "r1", originalLength: 5, editedCount: 0, relabelled: false };
    const document = wantRuns ? { ...resulted.document, runs: [run] } : resulted.document;
    return { document, withRuns: wantRuns, withResult: resulted.written };
  });

function expectedNote(c: RestoreCase): string | null {
  if (c.withRuns && c.withResult) return NOTE_BOTH;
  if (c.withRuns) return NOTE_RUNS_ONLY;
  return c.withResult ? NOTE_RESULTS_ONLY : null;
}

describe("open-file: the restore note follows AI runs and verification results _Requirements: 13.2, 13.3, 13.4, 13.5_", () => {
  // Property 13
  it("P13 restoreNote gives the exact note of the case, and the Run Verify sentence ends it exactly when a result exists", () => {
    fc.assert(
      fc.property(arbRestoreCase, (c) => {
        const note = restoreNote(c.document);
        expect(note).toBe(expectedNote(c));
        if (note === null) return;
        expect(note.endsWith(RUN_VERIFY_SENTENCE)).toBe(c.withResult);
        expect(note.includes(RUN_VERIFY_SENTENCE)).toBe(c.withResult);
      }),
      { numRuns: runs() },
    );
  });
});

type Refusal = Readonly<{ file: OpenInput; reads: () => number }>;

const arbStem: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...Array.from("abcdefghijklmnopqrstuvwxyz0123456789_-")), {
    minLength: 1,
    maxLength: 8,
  })
  .map((cs) => cs.join(""));

function refusal(name: string, size: number | null, bytes: Uint8Array): Refusal {
  let reads = 0;
  const copy = bytes.slice().buffer;
  const file: OpenInput = {
    name,
    size: size ?? bytes.length,
    arrayBuffer: () => {
      reads += 1;
      return Promise.resolve(copy);
    },
  };
  return { file, reads: () => reads };
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Files the Open_Flow must refuse: each of the refusals of Requirement 14 that needs no fixture beyond bytes. */
const arbRefused: fc.Arbitrary<Refusal> = fc.oneof(
  fc
    .tuple(arbStem, fc.constantFrom(".pdf", ".doc", ".rtf", ".bak", ".docx.bak", ""))
    .map(([stem, ext]) => refusal(`${stem}${ext}`, null, utf8("x"))),
  fc
    .tuple(
      arbStem,
      fc.constantFrom(".txt", ".md", ".docx"),
      fc.integer({ min: 5_242_881, max: 50_000_000 }),
    )
    .map(([stem, ext, size]) => refusal(`${stem}${ext}`, size, utf8("x"))),
  fc
    .tuple(
      arbStem,
      fc.constantFrom(".txt", ".md"),
      fc.constantFrom([0xc3, 0x28], [0xff, 0xfe, 0x41, 0x00], [0xfe, 0xff, 0x00, 0x41], [0x80]),
      fc.string({ unit: "grapheme-ascii", maxLength: 10 }),
    )
    .map(([stem, ext, bad, tail]) =>
      refusal(`${stem}${ext}`, null, Uint8Array.from([...utf8(tail), ...bad])),
    ),
  fc
    .tuple(
      arbStem,
      fc.constantFrom(".txt", ".md"),
      fc.array(fc.constantFrom(" ", "\n", "\t", "\r", "\uFEFF"), { maxLength: 12 }),
    )
    .map(([stem, ext, ws]) => refusal(`${stem}${ext}`, null, utf8(ws.join("")))),
  fc
    .tuple(arbStem, fc.constantFrom(".txt", ".md"), fc.integer({ min: 200_001, max: 200_040 }))
    .map(([stem, ext, n]) => refusal(`${stem}${ext}`, null, utf8("a".repeat(n)))),
  fc
    .tuple(
      arbStem,
      fc.array(fc.constantFrom(...Array.from("abcdef \n")), { minLength: 1, maxLength: 20 }),
      fc.boolean(),
    )
    .map(([stem, cs, cut]) =>
      refusal(
        `${stem}.docx`,
        null,
        cut ? truncated(simpleDocx([cs.join(""), "Second.", "Third."])) : utf8(cs.join("")),
      ),
    ),
);

describe("open-file: a refusal changes nothing but the note and the message _Requirements: 4.6, 4.7, 14.11, 19.1_", () => {
  // Property 14
  it("P14 a refused file names itself, says what to do, and leaves the Store as it was apart from notice and openNote", async () => {
    await fc.assert(
      fc.asyncProperty(arbRefused, arbCitingDocument, async ({ file, reads }, prior) => {
        const clock = (): Date => NOW;
        const before = reduce(
          initialState(clock),
          { type: "replace", document: prior, runLog: [], verifiedAt: null, declaration: null },
          clock,
        ).state;

        const out = await openFile(file);
        expect(out.kind).toBe("refused");
        if (out.kind !== "refused") return;
        expect(out.notice).toBe(`Could not open ${file.name}.`);
        expect(out.note.includes(file.name)).toBe(true);
        expect(out.note).toMatch(/\b(Choose|Save|Open|Split|Remove|paste)\b/);
        if (file.size > 5_242_880) expect(reads()).toBe(0);

        const cleared = reduce(before, { type: "openNote", text: null }, clock).state;
        const withNotice = reduce(cleared, { type: "notice", text: out.notice }, clock).state;
        const after = reduce(withNotice, { type: "openNote", text: out.note }, clock).state;

        expect(after.notice).toBe(out.notice);
        expect(after.openNote).toBe(out.note);
        expect({ ...after, notice: null, openNote: null }).toEqual({
          ...before,
          notice: null,
          openNote: null,
        });
        expect(after.document).toBe(before.document);
        expect(after.declaration).toBe(before.declaration);
      }),
      { numRuns: runs() },
    );
  });
});
