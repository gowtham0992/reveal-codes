/**
 * Citation, quote, and reference Req 20.4 rules (design A12 step 3). Rules
 * that need a Citation_Value read it from the Extractor output by range; a
 * Code with no Extractor range is skipped here and rejected by
 * `extractor_mismatch` (check-extractor.ts).
 */
import type { CitationValue } from "../types.js";
import { fault, rangeKey } from "./check-types.js";
import type { CheckFault, CheckInput } from "./check-types.js";
import type { DraftCitation, DraftStatus } from "./decode-types.js";

const isNonEmpty = (s: string | undefined): boolean => s !== undefined && s !== "";

/** Req 16.2 payload form of a Full_Citation's status; false when unusable. */
function fullPayloadOk(s: DraftStatus): boolean {
  switch (s.status) {
    case "verified":
      return isNonEmpty(s.clusterId);
    case "ambiguous": {
      const c = s.candidates;
      return (
        c !== undefined &&
        c.length >= 2 &&
        c.length === s.count &&
        c.every((x) => x !== "") &&
        new Set(c).size === c.length
      );
    }
    case "not_found":
      return s.reason === undefined || s.reason !== "";
    case "unchecked":
      return true;
  }
}

const hasPayload = (s: DraftStatus): boolean =>
  "clusterId" in s || "candidates" in s || "reason" in s || "waitUntil" in s;

const valueOf = (i: CheckInput, c: DraftCitation): CitationValue | undefined =>
  i.byRange.get(rangeKey(c.start, c.end))?.value;

/**
 * A Full_Citation Code must carry a usable Verification_Result payload. A
 * missing or ill-formed payload is a field that cannot be decoded
 * (`bad_field`, Req 20.3). A Short_Form is handled by `checkShortForms`.
 */
export function checkFullPayloads(i: CheckInput): CheckFault | undefined {
  for (const c of i.draft.citations) {
    const v = valueOf(i, c);
    if (v === undefined || v.kind === "short" || v.kind === "other") continue;
    if (!fullPayloadOk(c.status)) return fault(c.index, "bad_field");
  }
  return undefined;
}

/** Req 17.3: a `mismatch` prefix length is below the quote's length. */
export function checkQuotePrefix(i: CheckInput): CheckFault | undefined {
  for (const q of i.draft.quotes) {
    if (q.result.status === "mismatch" && q.result.prefixLength >= q.end - q.start) {
      return fault(q.index, "quote_prefix");
    }
  }
  return undefined;
}

/** The status Req 12.4, 12.5 and 19.1 derive for a Short_Form, or undefined to skip. */
function derivedStatus(i: CheckInput, targetStart: number | null): DraftStatus | undefined {
  if (targetStart === null) return { status: "unchecked" };
  return i.draft.citations.find((c) => c.start === targetStart)?.status;
}

/** Req 19.1, 19.2: a Short_Form shows its target's status (and `[CIT ?]` count), with no payload. */
export function checkShortForms(i: CheckInput): CheckFault | undefined {
  for (const c of i.draft.citations) {
    const v = valueOf(i, c);
    if (v?.kind !== "short") continue;
    const want = derivedStatus(i, v.targetStart);
    if (want === undefined) continue;
    const countOk =
      want.status !== "ambiguous" ||
      (c.status.status === "ambiguous" && c.status.count === want.count);
    if (c.status.status !== want.status || !countOk || hasPayload(c.status)) {
      return fault(c.index, "short_form_code");
    }
  }
  return undefined;
}

/** Req 16.5, D23: no `[CIT ✓]` on a Database_Citation with `lexisCourtListed: false`. */
export function checkUnverifiable(i: CheckInput): CheckFault | undefined {
  for (const c of i.draft.citations) {
    const v = valueOf(i, c);
    if (c.status.status === "verified" && v?.kind === "database" && v.lexisCourtListed === false) {
      return fault(c.index, "unverifiable_status");
    }
  }
  return undefined;
}

/** A citation Code at an Other_Reference range, or a `[REF]` followed by `[OVR]`. */
export function checkRefCodes(i: CheckInput): CheckFault | undefined {
  const found: CheckFault[] = [];
  for (const c of i.draft.citations) {
    if (valueOf(i, c)?.kind === "other") found.push(fault(c.index, "ref_code"));
  }
  for (const r of i.draft.refs) {
    if (r.override !== undefined) found.push(fault(r.override.index, "ref_code"));
  }
  return found.sort((a, b) => a.index - b.index)[0];
}

/** Whether a decoded citation Code stands for a current Issue (Req 18.2), or undefined to skip. */
function citationIsIssue(i: CheckInput, c: DraftCitation): boolean | undefined {
  const v = valueOf(i, c);
  if (v === undefined || v.kind === "other") return undefined;
  if (v.kind === "short") return v.targetStart === null;
  return c.status.status !== "verified";
}

/** Every Override sits on a current Issue. */
export function checkOverrideTargets(i: CheckInput): CheckFault | undefined {
  const found: CheckFault[] = [];
  for (const c of i.draft.citations) {
    if (c.override !== undefined && citationIsIssue(i, c) === false) {
      found.push(fault(c.override.index, "override_target"));
    }
  }
  for (const q of i.draft.quotes) {
    if (q.override !== undefined && q.result.status === "match") {
      found.push(fault(q.override.index, "override_target"));
    }
  }
  return found.sort((a, b) => a.index - b.index)[0];
}

/** Keys are unique and below the Issue_Key_Counter. */
export function checkIssueKeys(i: CheckInput): CheckFault | undefined {
  const keyed = [...i.draft.citations, ...i.draft.quotes].sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  for (const k of keyed) {
    const n = Number(k.key.slice(1));
    if (n >= i.draft.keyCounter || seen.has(k.key)) return fault(k.index, "issue_key");
    seen.add(k.key);
  }
  return undefined;
}
