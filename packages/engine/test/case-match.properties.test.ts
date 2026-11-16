import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extract } from "../src/citations/extract";
import { parse, render } from "../src/codes";
import { structuralEqual } from "../src/equal";
import { arbDocument, arbExpressionDocument } from "../src/testing/arbitraries";
import { runs } from "./support/fc";
import {
  arbHistory,
  arbNameless,
  arbNamedDocument,
  arbScenario,
  fullRecords,
  prefixOf,
} from "./support/case-match-scenario";
import {
  arbAnyResult,
  arbGroup,
  arbIssueResult,
  arbPayload,
  arbPlan,
  arbWrongCaseDocument,
  checkShortFollows,
  checkWrongCaseBlocks,
} from "./support/case-match-results";
import {
  checkMalformed,
  checkOverrideSurvival,
  shortFormDocument,
} from "./support/case-match-malformed";

// Property 3
describe("case-match cited name _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.13, 1.14, 1.15_", () => {
  it("reads back the name as written, and leaves it absent where no name or a Short_Form applies", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          arbScenario.map((s) => ({ s }) as const),
          arbNameless.map((n) => ({ n }) as const),
        ),
        (input) => {
          if ("s" in input) {
            const s = input.s;
            const text = `${prefixOf(s)}${s.name},${s.gap}${s.citation}`;
            const start = text.length - s.citation.length;
            const hit = extract(text).citations.find((c) => c.start === start);
            expect(hit).toBeDefined();
            expect(hit?.caseName).toBe(s.name);
            expect((hit?.caseName ?? "").length).toBeLessThanOrEqual(164);
            return;
          }
          const n = input.n;
          const found = extract(`${n.boundary}${n.lead}${n.citation}. ${n.short}`).citations;
          expect(found.length).toBeGreaterThanOrEqual(2);
          for (const c of found) {
            expect(Object.prototype.hasOwnProperty.call(c, "caseName")).toBe(false);
          }
        },
      ),
      runs(),
    );
  });
});

// Property 4
describe("case-match carry-over of caseName _Requirements: 1.9, 1.11_", () => {
  it("a kept citation keeps its name, and every record's name is the one extract reads at its start", () => {
    let keptSeen = 0;
    fc.assert(
      fc.property(arbHistory, (history) => {
        history.forEach((doc, i) => {
          const extracted = extract(doc.text).citations;
          for (const rec of fullRecords(doc)) {
            const at = extracted.find((c) => c.start === rec.citation.start);
            expect(at).toBeDefined();
            expect(rec.citation.caseName).toBe(at?.caseName);
          }
          const prev = i === 0 ? undefined : history[i - 1];
          if (prev === undefined) return;
          const before = new Map(fullRecords(prev).map((r) => [r.key, r] as const));
          for (const rec of fullRecords(doc)) {
            const old = before.get(rec.key);
            if (old === undefined) continue;
            keptSeen += 1;
            expect(rec.citation.caseName).toBe(old.citation.caseName);
          }
        });
      }),
      runs(),
    );
    expect(keptSeen).toBeGreaterThan(0);
  });
});

// Property 5
describe("case-match wrong_case blocks export _Requirements: 2.6, 2.7, 2.8, 2.11_", () => {
  it("lists each wrong_case citation once as CIT ≠, blocks exactly the ones without an Override, and blocking is empty iff all are overridden", () => {
    let wrongSeen = 0;
    fc.assert(
      fc.property(
        arbNamedDocument,
        fc.array(arbPlan, { minLength: 6, maxLength: 6 }),
        (start, plans) => {
          wrongSeen += checkWrongCaseBlocks(start, plans);
        },
      ),
      runs(),
    );
    expect(wrongSeen).toBeGreaterThan(0);
  });
});

// Property 6
describe("case-match malformed wrong_case is rejected and named _Requirements: 2.3, 2.4, 2.5_", () => {
  it("stores a well-formed payload, otherwise names the first failing field and leaves the Document unchanged", () => {
    const tally = { stored: 0, rejected: 0 };
    const shortDoc = shortFormDocument();
    fc.assert(
      fc.property(arbNamedDocument, arbPayload, (doc, payload) => {
        checkMalformed(shortDoc, doc, payload, tally);
      }),
      runs(),
    );
    expect(tally.stored).toBeGreaterThan(0);
    expect(tally.rejected).toBeGreaterThan(0);
  });
});

// Property 7
describe("case-match an Override survives only an unchanged status _Requirements: 2.9_", () => {
  it("keeps the Override iff the new result has the previous status, including wrong_case to wrong_case with a new cluster or name", () => {
    const tally = { kept: 0, dropped: 0, wrongToWrong: 0 };
    fc.assert(
      fc.property(
        arbNamedDocument,
        fc.nat(),
        arbIssueResult,
        arbAnyResult,
        fc.string({ minLength: 1, maxLength: 20 }).filter((r) => r.trim() !== ""),
        (start, pick, previous, next, reason) => {
          checkOverrideSurvival(start, pick, previous, next, reason, tally);
        },
      ),
      runs(),
    );
    expect(tally.kept).toBeGreaterThan(0);
    expect(tally.dropped).toBeGreaterThan(0);
    expect(tally.wrongToWrong).toBeGreaterThan(0);
  });
});

// Property 8
describe("case-match a Short_Form follows a wrong_case target _Requirements: 2.10, 3.2_", () => {
  it("reports the target's wrong_case result, lists no Issue, and renders [CIT ≠{k=<key>}] in full form and [CIT ≠] in display form", () => {
    let shortsSeen = 0;
    fc.assert(
      fc.property(fc.array(arbGroup, { minLength: 1, maxLength: 2 }), (groups) => {
        shortsSeen += checkShortFollows(groups);
      }),
      runs(),
    );
    expect(shortsSeen).toBeGreaterThan(0);
  });
});

// Property 2
describe("case-match Reveal Codes round trip with wrong_case _Requirements: 3.1, 3.5, 3.8_", () => {
  it("parse(render(d, full).text) is ok and structurally equals d, and re-renders to the same text", () => {
    let wrongSeen = 0;
    fc.assert(
      fc.property(fc.oneof(arbDocument, arbExpressionDocument, arbWrongCaseDocument), (d) => {
        wrongSeen += fullRecords(d).filter((r) => r.result.status === "wrong_case").length;
        const text = render(d, "full").text;
        const parsed = parse(text);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(structuralEqual(parsed.value, d)).toBe(true);
        expect(render(parsed.value, "full").text).toBe(text);
      }),
      runs(),
    );
    expect(wrongSeen).toBeGreaterThan(0);
  });
});
