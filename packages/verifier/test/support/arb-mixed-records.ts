import * as fc from "fast-check";
import type { CitationRecord, CitationValue, ExtractedCitation } from "@reveal-codes/engine";
// The engine's `testing/` folder is deliberately not exported from its index (engine Req 1.2).
import { arbReporterValue } from "../../../engine/src/testing/arb-citation";
import { arbOtherReference } from "../../../engine/src/testing/arb-text-citations";
import { arbRecords } from "./arb-records";
import type { LookupCase } from "./arb-records";

type FullRecord = Extract<CitationRecord, { kind: "full" }>;

/** Input of Property 12: engine records mixed with extra short and other records and duplicate Full_Records. */
export type MixedCase = Readonly<{
  /** Records in document order: engine records, extra short/other records, duplicates. */
  lookup: LookupCase;
  /** Keys of every short record in `lookup.records` (engine-made and inserted). */
  shortKeys: readonly string[];
  /** Texts derived from short and other records: their text and reporter forms rebuilt from their fields. */
  derivedTexts: readonly string[];
}>;

function citationOf(text: string, value: CitationValue): ExtractedCitation {
  return { start: 0, end: text.length, text, value };
}

const arbShortRecord = fc
  .tuple(arbReporterValue, fc.constantFrom("Roe", "Doe v. Roe", "Smith"), fc.boolean())
  .map(([v, party, isId]): { rec: CitationRecord; derived: string[] } => {
    const key = "s";
    const pin = v.pincite ?? v.page;
    const rebuilt = [
      `${String(v.volume)} ${v.reporter} ${String(pin)}`,
      `${String(v.volume)} ${v.reporter} ${String(v.page)}`,
    ];
    if (isId) {
      const text = `Id. at ${String(pin)}`;
      const value: CitationValue = { kind: "short", form: "id", pincite: pin, targetStart: null };
      return {
        rec: { kind: "short", key, citation: citationOf(text, value) },
        derived: [text, ...rebuilt],
      };
    }
    const text = `${party}, ${String(v.volume)} ${v.reporter} at ${String(pin)}`;
    const value: CitationValue = {
      kind: "short",
      form: "party",
      party,
      volume: v.volume,
      reporter: v.reporter,
      pincite: pin,
      targetStart: null,
    };
    return {
      rec: { kind: "short", key, citation: citationOf(text, value) },
      derived: [text, ...rebuilt],
    };
  });

const arbOtherRecord = arbOtherReference.map((o): { rec: CitationRecord; derived: string[] } => ({
  rec: { kind: "other", citation: citationOf(o.text, o.value) },
  derived: [o.text],
}));

function insertAll(
  base: readonly CitationRecord[],
  extra: readonly CitationRecord[],
  at: readonly number[],
): CitationRecord[] {
  const out = [...base];
  extra.forEach((rec, i) => out.splice((at[i] ?? 0) % (out.length + 1), 0, rec));
  return out;
}

/** A copy of a Full_Record under a fresh key: same Citation_Lines, so Req 1.6 applies. */
function duplicateOf(rec: FullRecord, i: number): FullRecord {
  return { ...rec, key: `d${String(i)}` };
}

function fullsOf(records: readonly CitationRecord[]): FullRecord[] {
  return records.flatMap((r) => (r.kind === "full" ? [r] : []));
}

export const arbMixedCase: fc.Arbitrary<MixedCase> = fc
  .record({
    base: arbRecords,
    shorts: fc.array(arbShortRecord, { maxLength: 5 }),
    others: fc.array(arbOtherRecord, { maxLength: 5 }),
    dupPicks: fc.array(fc.nat(50), { maxLength: 3 }),
    at: fc.array(fc.nat(50), { minLength: 13, maxLength: 13 }),
    token: fc.option(fc.stringMatching(/^[0-9a-f]{8,16}$/), { nil: undefined }),
  })
  .map(({ base, shorts, others, dupPicks, at, token }) => {
    const fulls = fullsOf(base);
    const dups =
      fulls.length === 0
        ? []
        : dupPicks.map((p, i) => duplicateOf(fulls[p % fulls.length] as FullRecord, i));
    const keyed = shorts.map((s, i) =>
      s.rec.kind === "short" ? { ...s, rec: { ...s.rec, key: `s${String(i)}` } } : s,
    );
    const extras = [...keyed, ...others];
    const records = insertAll(base, [...extras.map((e) => e.rec), ...dups], at);
    const baseShort = base.flatMap((r) => (r.kind === "short" ? [r.key] : []));
    const baseDerived = base.flatMap((r) => (r.kind === "full" ? [] : [r.citation.text]));
    return {
      lookup: { records, draft: "", token },
      shortKeys: [...baseShort, ...keyed.map((s) => (s.rec.kind === "short" ? s.rec.key : ""))],
      derivedTexts: [...baseDerived, ...extras.flatMap((e) => e.derived)],
    };
  });
