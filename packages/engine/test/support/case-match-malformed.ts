import { expect } from "vitest";
import { createDocument } from "../../src/document";
import { recordOverride } from "../../src/issues";
import type { Document, VerificationResult } from "../../src/types";
import { setVerification } from "../../src/verification";
import type { WrongCaseResult } from "../../src/testing/arbitraries";
import { firstBadField, SHORT_FORM_TEXT } from "./case-match-results";
import { fullRecords, TIMESTAMP } from "./case-match-scenario";

type Payload = Readonly<Record<string, unknown>>;

/** A Document holding one Full_Citation and linked Short_Forms. */
export function shortFormDocument(): Document {
  const created = createDocument(SHORT_FORM_TEXT, TIMESTAMP);
  if (!created.ok) throw new Error("shortFormDocument: createDocument rejected the text");
  return created.value;
}

function assertShortsNotVerifiable(shortDoc: Document, payload: Payload): void {
  const shorts = shortDoc.citations.filter((r) => r.kind === "short");
  expect(shorts.length).toBeGreaterThan(0);
  const shortBefore = structuredClone(shortDoc);
  for (const s of shorts) {
    const set = setVerification(shortDoc, s.key, payload as unknown as WrongCaseResult);
    expect(set.ok).toBe(false);
    if (set.ok) continue;
    expect(set.error).toEqual({ kind: "not_verifiable", key: s.key });
  }
  expect(shortDoc).toEqual(shortBefore);
}

/** Property 6 body: a Short_Form key is never verifiable; a Full_Citation takes a good payload or names the bad field. */
export function checkMalformed(
  shortDoc: Document,
  doc: Document,
  payload: Payload,
  tally: { stored: number; rejected: number },
): void {
  assertShortsNotVerifiable(shortDoc, payload);
  const before = structuredClone(doc);
  const expectedField = firstBadField(payload);
  for (const rec of fullRecords(doc)) {
    const set = setVerification(doc, rec.key, payload as unknown as WrongCaseResult);
    const v = rec.citation.value;
    if (!set.ok && set.error.kind === "not_verifiable") {
      // Only an unlisted Database_Citation is not verifiable among Full_Citations.
      expect(v.kind === "database" && v.lexisCourtListed === false).toBe(true);
      expect(doc).toEqual(before);
      continue;
    }
    if (expectedField === null) {
      expect(set.ok).toBe(true);
      if (!set.ok) continue;
      tally.stored += 1;
      const written = fullRecords(set.value).find((r) => r.key === rec.key);
      expect(written?.result).toEqual(payload);
    } else {
      tally.rejected += 1;
      expect(set.ok).toBe(false);
      if (set.ok) continue;
      expect(set.error).toEqual({ kind: "invalid_verification_result", field: expectedField });
    }
    expect(doc).toEqual(before);
  }
}

/** Property 7 body: the Override on one citation survives iff the status is unchanged. */
export function checkOverrideSurvival(
  start: Document,
  pick: number,
  previous: VerificationResult,
  next: VerificationResult,
  reason: string,
  tally: { kept: number; dropped: number; wrongToWrong: number },
): void {
  const records = fullRecords(start);
  const rec = records[pick % records.length];
  if (rec === undefined) return;
  const first = setVerification(start, rec.key, previous);
  if (!first.ok) return; // an unlisted Database_Citation is not verifiable
  const overridden = recordOverride(first.value, rec.key, reason, TIMESTAMP);
  expect(overridden.ok).toBe(true);
  if (!overridden.ok) return;
  const before = overridden.value;
  expect(before.overrides.some((o) => o.key === rec.key)).toBe(true);
  const second = setVerification(before, rec.key, next);
  expect(second.ok).toBe(true);
  if (!second.ok) return;
  const survives = second.value.overrides.some((o) => o.key === rec.key);
  expect(survives).toBe(previous.status === next.status);
  if (survives) {
    tally.kept += 1;
    const original = before.overrides.find((o) => o.key === rec.key);
    expect(second.value.overrides.find((o) => o.key === rec.key)).toEqual(original);
    if (previous.status === "wrong_case" && JSON.stringify(previous) !== JSON.stringify(next))
      tally.wrongToWrong += 1;
  } else tally.dropped += 1;
  // Overrides on the other citations are untouched.
  expect(second.value.overrides.filter((o) => o.key !== rec.key)).toEqual(
    before.overrides.filter((o) => o.key !== rec.key),
  );
}
