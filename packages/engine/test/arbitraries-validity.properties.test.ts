import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { format } from "../src/citations/format";
import { LEXIS_COURTS } from "../src/citations/lexis-courts";
import { REPORTERS } from "../src/citations/reporters";
import { MAX_PARTY } from "../src/citations/party";
import { apply } from "../src/document";
import {
  arbDocument,
  arbGapSignal,
  arbGarbageCitation,
  arbLexisCourt,
  arbNearMissCitation,
  arbOpinionWithQuotes,
  arbOpSequence,
  arbShortFormParty,
  arbStopListPrefix,
  arbTextWithCitations,
  arbThreshold,
  MAX_OPINION,
} from "../src/testing/arbitraries";
import {
  documentFaults,
  GLOSSARY_GAP_SIGNALS,
  isGlossaryUnlistedShape,
  isStopListPrefix,
  partyFaults,
} from "./support/arb-validity";
import { runs } from "./support/fc";

/** Test-local Near_Miss key: every `.` and ASCII space removed (Glossary). */
const collapse = (t: string): string => t.replace(/[. ]/g, "");

describe("arbitraries: the shared arbitraries generate only valid values _Requirements: 22.4_", () => {
  // Property 43
  it("arbDocument is canonical and passes Req 2.5 and 6.12", () => {
    fc.assert(
      fc.property(arbDocument, (doc) => {
        expect(documentFaults(doc)).toEqual([]);
      }),
      runs(),
    );
  });

  // Property 43
  it("every op of arbOpSequence(doc) applies with ok: true", () => {
    const arbCase = fc
      .tuple(arbDocument, arbThreshold)
      .chain(([doc, { config }]) =>
        arbOpSequence(doc, config).map((ops) => ({ doc, config, ops })),
      );
    fc.assert(
      fc.property(arbCase, ({ doc, config, ops }) => {
        let current = doc;
        ops.forEach((op, i) => {
          const r = apply(current, op, config);
          expect(r.ok, `op ${String(i)} ${op.kind}`).toBe(true);
          if (r.ok) current = r.value.document;
        });
      }),
      runs(),
    );
  });

  // Property 43
  it("arbNearMissCitation differs from its Canonical_Form and names a Reporter_List entry", () => {
    fc.assert(
      fc.property(arbNearMissCitation, (n) => {
        const canon = format(n.value);
        expect(canon.ok).toBe(true);
        if (canon.ok) expect(n.text).not.toBe(canon.value);
        expect(REPORTERS).toContain(n.value.reporter);
        expect(REPORTERS.includes(n.token)).toBe(false);
        expect(collapse(n.token)).toBe(collapse(n.value.reporter));
        expect(REPORTERS.find((e) => collapse(e) === collapse(n.token))).toBe(n.value.reporter);
      }),
      runs(),
    );
  });

  // Property 43
  it("arbGarbageCitation tokens match no entry, exactly or collapsed, and hold no word Id.", () => {
    fc.assert(
      fc.property(arbGarbageCitation, (g) => {
        const m = /^\d+ (.+) \d+$/.exec(g);
        expect(m).not.toBeNull();
        const token = m?.[1] ?? "";
        expect(REPORTERS.includes(token)).toBe(false);
        expect(REPORTERS.some((e) => collapse(e) === collapse(token))).toBe(false);
        expect(token.split(" ")).not.toContain("Id.");
      }),
      runs(),
    );
  });

  // Property 43
  it("arbLexisCourt listed values are exact lexis-courts.json entries; unlisted ones meet the Glossary and match no entry", () => {
    fc.assert(
      fc.property(arbLexisCourt, ({ lexisCourtListed, lexisCourt }) => {
        if (lexisCourtListed) {
          expect(LEXIS_COURTS.includes(lexisCourt)).toBe(true);
          return;
        }
        expect(isGlossaryUnlistedShape(lexisCourt)).toBe(true);
        expect(LEXIS_COURTS.includes(lexisCourt)).toBe(false);
        expect(LEXIS_COURTS.some((e) => collapse(e) === collapse(lexisCourt))).toBe(false);
      }),
      runs(),
    );
  });

  // Property 43
  it("arbTextWithCitations offsets slice to their recorded strings", () => {
    fc.assert(
      fc.property(arbTextWithCitations, ({ text, expected }) => {
        for (const c of expected.citations) {
          expect(c.start).toBeGreaterThanOrEqual(0);
          expect(c.end).toBeLessThanOrEqual(text.length);
          expect(text.slice(c.start, c.end)).toBe(c.text);
        }
        for (const q of expected.quotes) {
          expect(q.start).toBeGreaterThanOrEqual(0);
          expect(q.end).toBeLessThanOrEqual(text.length);
          expect(text.slice(q.start, q.end)).toBe(q.text);
        }
      }),
      runs(),
    );
  });

  // Property 43
  it("arbOpinionWithQuotes offsets slice to their recorded strings", () => {
    fc.assert(
      fc.property(arbOpinionWithQuotes, ({ text, quotations }) => {
        expect(text.length).toBeLessThanOrEqual(MAX_OPINION);
        expect(quotations.length).toBeGreaterThanOrEqual(1);
        expect(quotations.length).toBeLessThanOrEqual(10);
        for (const q of quotations) {
          expect(text.slice(q.start, q.end)).toBe(q.text);
        }
      }),
      runs(),
    );
  });

  // Property 43
  it("arbShortFormParty values are Party_Runs within MAX_PARTY", () => {
    fc.assert(
      fc.property(arbShortFormParty, (p) => {
        expect(partyFaults(p, MAX_PARTY)).toEqual([]);
      }),
      runs(),
    );
  });

  // Property 43
  it("arbGapSignal values are in the Gap_Signal list, which excludes with", () => {
    expect(GLOSSARY_GAP_SIGNALS).toHaveLength(20);
    expect(GLOSSARY_GAP_SIGNALS.some((s) => s.toLowerCase() === "with")).toBe(false);
    fc.assert(
      fc.property(arbGapSignal, (s) => {
        expect(GLOSSARY_GAP_SIGNALS).toContain(s);
      }),
      runs(),
    );
  });

  // Property 43
  it("arbStopListPrefix values are whole stop-list entries and Connectors, each then one space", () => {
    fc.assert(
      fc.property(arbStopListPrefix, (s) => {
        expect(isStopListPrefix(s)).toBe(true);
      }),
      runs(),
    );
  });

  it("the validity checks reject invalid values", () => {
    expect(partyFaults("See Smith", MAX_PARTY)).not.toEqual([]);
    expect(partyFaults("A v. B v. C", MAX_PARTY)).not.toEqual([]);
    expect(partyFaults("Acme, Inc., Ltd.", MAX_PARTY)).not.toEqual([]);
    expect(partyFaults("A".repeat(81), MAX_PARTY)).not.toEqual([]);
    expect(partyFaults("Acme, Inc. v. Smith", MAX_PARTY)).toEqual([]);
    expect(isStopListPrefix("See ")).toBe(true);
    expect(isStopListPrefix("See also the ")).toBe(true);
    expect(isStopListPrefix("the ")).toBe(false);
    expect(isStopListPrefix("See")).toBe(false);
    expect(isStopListPrefix("See  ")).toBe(false);
    expect(isGlossaryUnlistedShape("Foo Cty. Ct.")).toBe(true);
    for (const bad of [
      "",
      "and the court in 2023 U.S. Dist.",
      "Union, 2023 U.S. Dist.",
      "Foo  Cty.",
      "WL Foo",
      "Foo LEXIS",
      "Foo (Ct.)",
      "Foo “Ct.”",
      "A".repeat(41),
    ]) {
      expect(isGlossaryUnlistedShape(bad), bad).toBe(false);
    }
  });
});
