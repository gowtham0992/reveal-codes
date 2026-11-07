# Implementation Plan: provenance-engine

## Overview

The plan builds `packages/engine` in TypeScript. The order is: scaffolding, document model and operations, segmentation, citations with re-anchoring, verification state, rendering and parsing, then the public API, purity checks, benchmark, and docs. Each arbitrary is built in the same group as the module it generates values for, right before the properties that use it.

How top-level tasks map to the requested groups:

| Task | Group |
|---|---|
| 1 | (0) scaffolding |
| 2, 3 | (1) document model and operations, then checkpoint |
| 4 | (2) segmentation |
| 5, 6 | (3) citations and re-anchoring, then checkpoint |
| 7 | (4) verification state, issues, overrides |
| 8, 9 | (5) rendering and parsing, then checkpoint |
| 10 | (6) public API and purity |
| 11 | (7) benchmark |
| 12 | (8) docs |

Some features depend on modules that land later. These are handled explicitly:

- **Segmentation before the Extractor.** Task 4 builds `boundary.ts` and an internal `segmentWith(text, spans, citationRanges)` that takes citation ranges as a parameter. Task 4 tests both with hand-placed and generated ranges. The public `segment(text, spans)` that calls `extract` lands in task 5.19. The citation-aware segmentation property (Property 15) and the `invalid_spans` property that covers `segment` (Property 5) land in task 5, once the Extractor exists.
- **Citation layer before the Extractor.** In task 2, `createDocument` and the Insert/Delete/Replace pipeline produce empty `citations` and `quotes` arrays and leave `keyCounter` at 0, through one named pipeline stage, `reanchorStage`. Task 5.41 replaces that stage with real re-extraction and re-anchoring (design A5, A6). Property 2 depends on the Extractor, so it lands in task 5.43.
- **Verification state before rendering.** Task 7.3 extends `arbDocument` with verification results, quote checks, and Overrides written through the engine's setters. Properties that need those states (26, 35, 43) land in task 7.

Property tests are mandatory in this repository (tech.md, testing.md), so none are marked optional. Only example tests whose requirements a property already covers are marked `*`.

## Tasks

- [x] 1. Package scaffolding and core types
  - [x] 1.1 Configure the engine package and test support
    - In `packages/engine/package.json`, keep `dependencies`, `peerDependencies`, and `optionalDependencies` absent. List only `fast-check` and `vitest` under `devDependencies`.
    - Add `packages/engine/test/tsconfig.json` with `"types": ["node"]`, used by tests only. The package tsconfig includes only `src`, so `src` cannot type-check against Node globals. Wire the test tsconfig into `tsc -b`.
    - Add `test/support/fc.ts` exporting `runs()`. It returns `{ numRuns: Number(process.env.FC_NUM_RUNS ?? "200") }`, so runs default to 200 and become 500 under `pnpm test:pbt`. Make failure output report `seed` and `path`, and document replay with `fc.assert(prop, { ...runs(), seed, path })`.
    - _Requirements: 1.1, 1.2, 22.3_
  - [x] 1.2 Create `result.ts`, `errors.ts`, and `types.ts`
    - `Result`, `ok()`, and `err()`.
    - The `EngineError` union with every kind and field in the design's Error Handling table, plus `MalformedRule`.
    - Every type in design "Data Models". Optional fields are absent, never `undefined`.
    - _Requirements: 1.7, 1.8, 2.4_
  - [x] 1.3 Implement `equal.ts` `structuralEqual(a, b)`
    - Compares primitives, keys, and array order, with a reference-equality fast path.
    - _Requirements: 1.4_
  - [x] 1.4 Implement `validate.ts`
    - `isTimestamp`: a regex plus integer calendar checks including leap years, with no `Date` (design A1 step 1).
    - `firstUnpairedSurrogate`, `isValidBoundary`, and `checkProvenance`, which enforces that a Run_Id is present if and only if the Origin is `AI` or `AI>HUM`.
    - _Requirements: 2.5, 2.6, 2.7, 7.3_
  - [x] 1.5 Write example tests in `test/validate.test.ts`
    - Timestamps: `2024-02-29` is valid, `2023-02-29` is invalid, and a missing `Z` is invalid.
    - Lone high and low surrogates are detected at their indexes.
    - Provenance shape rule.
    - `structuralEqual` on key order and array order.
    - _Requirements: 1.4, 2.5, 2.6, 2.7_

- [x] 2. Document model and edit operations
  - [x] 2.1 Implement `spans.ts`
    - `checkCoverage` returns `invalid_spans` with the first violation's Offset and kind.
    - `normaliseSpans` merges Mergeable runs and keeps the lowest-start Timestamp.
    - Also implement `mergeSeams`, `originAt`, and `runExtents`.
    - Per design A3 step 2.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 2.2 Create `src/testing/arb-text.ts` and `src/testing/arbitraries.ts`
    - Arbitraries: `arbText`, `arbAnyString`, `arbTimestamp`, `arbStringWithLoneSurrogate`, `arbSpanFragmentation`, and `arbSpanCorruption`. `arbSpanCorruption` records the expected Offset when it generates the value.
    - Build everything from fast-check combinators only, as in the design's Arbitraries table.
    - `arbitraries.ts` contains only `export * from "./arb-*"` lines. Later tasks add one line per new arbitrary file.
    - _Requirements: 22.1, 22.4_
  - [x] 2.3 Write Property 3 in `test/spans.properties.test.ts`
    - **Property 3: Normalisation merges exactly the Mergeable runs and is idempotent**
    - **Validates: Requirements 3.3, 3.4, 3.5**
    - _Requirements: 3.3, 3.4, 3.5_
  - [x] 2.4 Write Property 4 in `test/spans.properties.test.ts`
    - **Property 4: Canonical form is unique per provenance labelling**
    - **Validates: Requirements 3.7**
    - _Requirements: 3.7_
  - [x] 2.5 Implement `createDocument` and `normalise` in `document.ts`
    - Follows design A1 steps 1 to 3: timestamp check first, then surrogate check.
    - Citations and quotes come from `reanchorStage`, which returns empty arrays until task 5.41.
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 2.7, 3.4_
  - [x] 2.6 Write example tests in `test/document.test.ts`
    - Citation-free text gives one `PST` Span. Empty text gives zero Spans.
    - A lone surrogate returns `split_surrogate` at its Offset. A bad timestamp returns `invalid_timestamp`.
    - Validation order is timestamp, then surrogate.
    - _Requirements: 2.1, 2.2, 2.6, 2.7_
  - [x] 2.7 Implement `ops/validate.ts`
    - `validateConfig` accepts a threshold in (0, 1] and treats an absent one as 0.4.
    - `validateCallerOp` checks in this fixed order: `out_of_range` by field, `inverted_range`, `split_surrogate`, `invalid_provenance`, `invalid_timestamp`.
    - Per design A2.
    - _Requirements: 6.5, 6.6, 6.10, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8_
  - [x] 2.8 Implement `ops/splice.ts`
    - `spliceText` and `effectiveProvenance`. A relabelled Run turns `AI` into `AI>HUM`.
    - `spliceSpans` returns the deleted pieces and merges only at the two seams.
    - Per design A3 steps 1, 2, and 6.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.11, 4.12, 6.11_
  - [x] 2.9 Implement `relabel.ts`
    - `addOriginalLength`, `countDeleted` (`HUM` Actor, `AI` pieces only), `countInserted` (strictly inside the pre-insertion Run_Extent), and `relabelRuns` (sticky flag, full normalisation only on the relabel path).
    - Per design A3 steps 3 to 5.
    - _Requirements: 4.8, 4.9, 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 6.12_
  - [x] 2.10 Implement `ops/inverse.ts`
    - `makeInverse` uses shared arrays. `applyInverse` checks staleness with reference equality first, then `structuralEqual`, and returns a redo Inverse.
    - Applying an Inverse does not validate, relabel, or re-extract.
    - Per design A7.
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 2.11 Implement `ops/insert.ts`, `ops/delete.ts`, and `ops/replace.ts`
    - The Insert and Delete pipeline follows design A3 steps 1 to 8 and calls `reanchorStage` at step 7.
    - Replace builds its Text, Spans, and Run table as Delete then Insert, evaluates relabelling after the delete step and again after the insert step, calls `reanchorStage` once with the combined edit, and returns one combined Inverse (design A4).
    - _Requirements: 4.1, 4.4, 4.6, 4.8, 6.9, 6.11_
  - [x] 2.12 Implement `apply` in `document.ts` and the `ops.ts` facade
    - The dispatcher validates config, routes Inverses, validates Caller_Operations, returns a no-op Document with an Inverse, then dispatches (design A2).
    - `ops.ts` re-exports `ops/*`.
    - _Requirements: 4.7, 4.10, 5.1, 5.2, 7.7_
  - [x] 2.13 Create `src/testing/arb-ops.ts` and `src/testing/arb-document.ts`
    - `arb-ops.ts`: `arbOp`, `arbOpSequence(doc)` as a recursive `fc.chain` that snaps Offsets off surrogate interiors and never generates `AI>HUM`, `arbCallerInsertOrDelete`, `arbReplace`, `arbFaultyOp` with the expected error recorded, and `arbThreshold`.
    - `arb-document.ts`: a base `arbDocument` built only through `createDocument` and `apply`. It uses the Run_Id pool of 8, which includes `r[1]` and `a\b`, and two threshold settings so that relabelled Runs are common.
    - _Requirements: 22.1, 22.4_
  - [x] 2.14 Write Property 1 in `test/document.properties.test.ts`
    - **Property 1: Every returned Document is canonical and satisfies the Run invariant**
    - **Validates: Requirements 3.1, 3.2, 4.10, 6.12**
    - _Requirements: 3.1, 3.2, 4.10, 6.12_
  - [x] 2.15 Write Property 6 in `test/ops.properties.test.ts`
    - **Property 6: Insert and Delete agree with a per-code-unit model**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.11, 4.12**
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.11, 4.12_
  - [x] 2.16 Write Property 7 in `test/ops.properties.test.ts`
    - **Property 7: Replace equals Delete followed by Insert in Text, Spans, and Run table, and re-anchors once**
    - The citation layer after a non-no-op Replace equals `reanchorStage({ prev: d, draft, edit })` with the combined edit `{ from, oldTo: to, newTo: from + text.length }`; one Inverse returns to `d`.
    - **Validates: Requirements 4.6, 6.9, 15.3**
    - _Requirements: 4.6, 6.9, 15.3_
  - [x] 2.17 Write Property 8 in `test/ops.properties.test.ts`
    - **Property 8: Undo and redo restore documents exactly**
    - **Validates: Requirements 4.7, 5.1, 5.3, 5.4, 5.5, 5.6**
    - _Requirements: 4.7, 5.1, 5.3, 5.4, 5.5, 5.6_
  - [x] 2.18 Write Property 9 in `test/ops.properties.test.ts`
    - **Property 9: An Inverse applied to the wrong Document is rejected**
    - **Validates: Requirements 5.7**
    - _Requirements: 5.7_
  - [x] 2.19 Write Property 10 in `test/ops.properties.test.ts`
    - **Property 10: Rejected operations return the first error in precedence and change nothing**
    - **Validates: Requirements 2.5, 5.2, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8**
    - _Requirements: 2.5, 5.2, 6.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_
  - [x] 2.20 Write Property 11 in `test/relabel.properties.test.ts`
    - **Property 11: Run table accounting matches the edit model**
    - **Validates: Requirements 4.8, 4.9, 6.1, 6.2, 6.7**
    - _Requirements: 4.8, 4.9, 6.1, 6.2, 6.7_
  - [x] 2.21 Write Property 12 in `test/relabel.properties.test.ts`
    - **Property 12: A Run is relabelled exactly when its Edited_Proportion exceeds the threshold, and stays relabelled**
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.8, 6.10**
    - _Requirements: 6.3, 6.4, 6.5, 6.8, 6.10_
  - [x] 2.22 Write Property 13 in `test/relabel.properties.test.ts`
    - **Property 13: Only the Engine produces AI>HUM**
    - **Validates: Requirements 6.11, 6.12, 7.4**
    - _Requirements: 6.11, 6.12, 7.4_
  - [x] 2.23 Write example tests in `test/ops.test.ts` and `test/relabel.test.ts`
    - With the default threshold 0.4, a Run at exactly 40% is not relabelled, and a Run at 40% plus one code unit is.
    - Delete-all keeps every Run with its Original_Length.
    - Delete(0, 0) on an empty Document is a no-op.
    - An `AI>HUM` Insert returns `invalid_provenance`.
    - _Requirements: 4.5, 4.10, 6.10, 7.4_

- [x] 3. Checkpoint: document model and operations
  - Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass. Ask the user if questions arise.

- [x] 4. Sentence segmentation (citation ranges passed in)
  - [x] 4.1 Implement `abbreviations.ts`
    - `LEGAL_ABBREVIATIONS` is the non-reporter list in Glossary order: `Id.`, `v.`, `Inc.`, `Corp.`, `Ltd.`, `Co.`, `L.P.`, `N.A.`, `L.L.C.`, `No.`, `Cir.`, `Dist.`, `Ct.`, `Fed.`, `Supp.`, `et al.`. `Ltd.`, `Co.`, `L.P.`, `N.A.`, and `L.L.C.` are new, so no boundary follows them (for example in `Acme Co. Then`).
    - `ENTITY_SUFFIX_WORDS`: `Inc.`, `LLC`, `L.L.C.`, `Ltd.`, `Co.`, `Corp.`, `L.P.`, `N.A.`, shared by `party.ts` and `case-name.ts`. Every entry except `LLC` is also a Legal_Abbreviation.
    - `isAbbreviationEndingAt` uses a length-indexed set and checks that the abbreviation is preceded by the start of the Text, whitespace, or `(`.
    - `abbreviationsStartingAt(text, at, limit)` returns the end of every Legal_Abbreviation occurrence that starts at `at` and ends by `limit`, using a first-code-unit index over the same entries. `isPartyName` uses it to mark inner periods (`L.L.C.`, `L.P.`, `N.A.`, `U.S.`).
    - The index builders take the extra reporter abbreviations as a parameter. They get an empty list here, and task 5.2 passes `REPORTERS` entries ending in `.`.
    - Per design A8.
    - _Requirements: 8.6, 9.2, 12.2, 13.1_
  - [x] 4.2 Implement `boundary.ts`
    - `isBoundaryAt(text, b, citationRanges)` and `countBoundaries(text, from, to, citationRanges, cap)`. Both take citation ranges as a parameter and do not import the Extractor.
    - Per design A8 step 3.
    - _Requirements: 8.3, 8.5, 8.6, 8.8_
  - [x] 4.3 Implement internal `segmentWith(text, spans, citationRanges)` in `segment.ts`
    - Checks coverage first, then finds boundaries, then computes the dominant origin (ties go to the earliest-starting span) and the origin set in fixed order.
    - The public `segment` is added in task 5.19.
    - _Requirements: 8.1, 8.2, 8.4, 8.7, 8.9_
  - [x] 4.4 Extend `src/testing/arb-text.ts`
    - `arbCitationRanges(t)`: sorted, non-overlapping ranges on Valid_Boundaries.
    - `arbAbbreviationProse`: prose with Legal_Abbreviations spliced in, drawn from the whole `LEGAL_ABBREVIATIONS` list (including `Ltd.`, `Co.`, `L.P.`, `N.A.`, and `L.L.C.`), each followed by a space and a capitalised word.
    - _Requirements: 22.1_
  - [x] 4.5 Write Property 14 in `test/segment.properties.test.ts`
    - **Property 14: Segmentation is a lossless partition at valid boundaries**
    - Here it runs on `arbText` with `arbCitationRanges` through `segmentWith`. Task 5.35 adds `arbTextWithCitations` through `segment`.
    - **Validates: Requirements 8.1, 8.2, 8.8**
    - _Requirements: 8.1, 8.2, 8.8_
  - [x] 4.6 Write Property 16 in `test/segment.properties.test.ts`
    - **Property 16: Dominant origin and origin set match a per-unit count**
    - **Validates: Requirements 8.7**
    - _Requirements: 8.7_
  - [x] 4.7 Write example tests in `test/boundary.test.ts`
    - Terminators followed by trailing `"`, `”`, `'`, `’`, `)`.
    - Whitespace belongs to the preceding Sentence.
    - No boundary after `v.`, `Inc.`, or `No.`, nor after `Ltd.`, `Co.`, `L.P.`, `N.A.`, or `L.L.C.` (`Acme Co. Then` is one Sentence).
    - No boundary inside a hand-placed citation range.
    - `countBoundaries` stops at its cap.
    - Text with no terminator is one Sentence.
    - _Requirements: 8.3, 8.4, 8.5, 8.6_

- [x] 5. Citations, extraction, and re-anchoring
  - [x] 5.1 Add the reporter list generator and commit its output
    - `packages/engine/scripts/generate-reporters.ts` sits outside `src` and may use `node:fs`. It runs offline against a local reporters-db checkout path and a generation date, both passed as arguments.
    - It keeps edition keys in file order, de-duplicates by first occurrence, and drops grammar-breaking entries.
    - The artefacts are the committed `src/citations/reporters.json` and `src/citations/REPORTERS_LICENSE.md`. The licence note records the BSD licence, the repository URL, the release tag or commit, the date, and the dropped entries.
    - No test or build step runs the generator or touches the network.
    - _Requirements: 14.2, 14.4_
  - [x] 5.2 Implement `citations/reporters.ts`
    - `REPORTERS` is a static JSON import (`with { type: "json" }`).
    - `exactIndex` and `collapsedIndex` are built once, and the first entry wins.
    - `lookupReporter` tries an exact match, then the collapsed form.
    - Pass the `REPORTERS` entries that end in `.` into the `abbreviations.ts` index.
    - _Requirements: 8.6, 11.5, 14.1, 14.3, 14.5, 14.6_
  - [x] 5.3 Implement `citations/lex.ts`
    - Bounded readers for integers with no leading zeros and range checks, spaces, and word characters.
    - _Requirements: 9.8, 10.1_
  - [x] 5.4 Implement `citations/grammar.ts`
    - Reporter citations, parallel tails with up to 4 members and per-member pincites (D1, D2), and parentheticals under the tightened court rule (D3).
    - The reporter token is resolved longest first.
    - Per design A9 step 3.
    - _Requirements: 9.3, 9.5, 11.1, 11.5, 11.6_
  - [x] 5.5 Implement `citations/grammar-db.ts`
    - `WL` and `<court> LEXIS` forms with an optional `, at *<pincite>`.
    - Per design A9 step 2.
    - _Requirements: 9.4_
  - [x] 5.6 Implement `citations/grammar-other.ts`
    - U.S.C., C.F.R., and Federal Rules forms (D8).
    - Per design A9 step 5.
    - _Requirements: 9.6_
  - [x] 5.7 Implement `citations/signals.ts` and `citations/party.ts`
    - `signals.ts`: `SIGNALS` holds the 14 capitalised Signals in Glossary order (`See`, `See also`, `See, e.g.,`, `E.g.,`, `Accord`, `Cf.`, `But see`, `Compare`, `Citing`, `Quoting`, `But cf.`, `Contra`, `E.g.`, `See generally`), compared case-sensitively. `GAP_SIGNALS` holds 20 entries: the first ten Signals plus each with only its first letter lowercased, built with a `lowerFirst` map rather than typed twice. `with` is in neither list. `MAX_GAP_SIGNAL = 10` (`See, e.g.,`).
    - `startsWithSignal` uses `SIGNALS` and tests each Signal followed by a space, `,`, or the end of the range. `gapSignalsAt(text, at, limit)` returns the end of every `GAP_SIGNALS` entry that starts at `at` and ends by `limit` (at most three).
    - `party.ts`: `PARTY_STOP_LIST` as word arrays, built from `SIGNALS` split on spaces plus `In`, `As`, `Under`, `Following`, `Applying`, `The court in`, `The Court in`. `CONNECTORS` (`&`, `of`, `the`, `and`, `ex rel.`). `isCapitalisedWord`, which rejects `v.`.
    - `partyStartFor(text, c)` runs the right-to-left token automaton with states `E`, `S`, `R`, `K` (design A9). Tokens are maximal runs of letters, ASCII digits, `.`, `'`, `’`, `-`, or a lone `&` with a space on each side (its own token, not part of a word). It accepts an Entity_Suffix word after `, ` in state `E`, consumes one ` v. ` in state `R` to read the left Party_Side, and stops at a second `v.`.
    - The scan reads only `text[c − PARTY_SCAN .. c)` with `PARTY_SCAN = 161`, and a token or predecessor outside that window counts as a stop (D17). It returns `null` when an accepted start lies more than `MAX_PARTY` before `c`, takes the leftmost accepted start, strips stop-list entries and leading Connectors in a loop, and returns `null` if the remainder starts with `v.`.
    - Per design A9 and D12 to D18.
    - _Requirements: 9.2, 12.2, 12.8, 13.1_
  - [x] 5.8 Implement `citations/grammar-short.ts`
    - `matchIdAt` checks the left context.
    - `matchPartyShortAt(text, p)` is tail-anchored. It fast-rejects unless `text[p]` can start a Capitalised_Word and `text[p − 1]` is outside the word-token set. It then walks the commas in `(p, p + MAX_PARTY]` left to right and takes the first comma `c` whose `, <volume> <reporter> at <page>` tail matches, skipping commas that start an Entity_Suffix (`Smith, Inc., …`) and prose commas. It matches only when `partyStartFor(text, c) === p`.
    - At the same `p`, `Id.` and the party form are one class and the longer wins (D16).
    - Per design A9 step 4.
    - _Requirements: 9.2, 12.1, 12.2, 12.8_
  - [x] 5.9 Implement `citations/scan.ts`
    - `matchAt` checks the word boundary first, then tries the classes in order, longest within a class, with the Other_Reference precedence look-ahead.
    - `scanRange` moves a leftmost-longest cursor.
    - Enforce `MAX_MATCH`, `LOOKAHEAD`, and `LOOKBEHIND = 162` (`PARTY_SCAN + 1`; the earlier 82 was too small for the party scan). Every read of `matchAt(p)` lies in `[p − LOOKBEHIND, p + LOOKAHEAD)`.
    - _Requirements: 9.1, 9.7, 9.8_
  - [x] 5.10 Implement `citations/format.ts`
    - `validateFullValue` checks fields in a fixed order and returns `invalid_citation { field }`. Short_Form and Other values are rejected.
    - `format` lays out the Canonical_Form with per-member parallel pincites (D1).
    - Per design A13.
    - _Requirements: 10.1, 10.2, 10.5, 11.4_
  - [x] 5.11 Create `src/testing/arb-citation.ts`
    - `arbCourt`, `arbCitation`, `arbNearMissCitation` returning the string and the expected value, `arbGarbageCitation`, and `arbValueCorruption` with the field recorded.
    - Add an export line to `arbitraries.ts`.
    - _Requirements: 22.1, 22.4_
  - [x] 5.12 Write Property 21 in `test/format.properties.test.ts`
    - **Property 21: Canonical format round trips and is idempotent**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 11.2, 14.3, 14.5**
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 11.2, 14.3, 14.5_
  - [x] 5.13 Write Property 22 in `test/format.properties.test.ts`
    - **Property 22: Invalid citation values are rejected at the first failing field**
    - **Validates: Requirements 10.5**
    - _Requirements: 10.5_
  - [x] 5.14 Implement `citations/case-name.ts`
    - `isPartyName` follows the Glossary rules, D9, and D10. It allows an Entity_Suffix (`,` and space are in the character set), and accepts every `.` that belongs to a Legal_Abbreviation occurrence found with `abbreviationsStartingAt` at a word start (including the inner periods of `L.L.C.`, `L.P.`, `N.A.`) or closes a Single_Capital_Initial. It rejects an inner ` v. ` and a leading Signal (`startsWithSignal`).
    - `isCaseName` splits on exactly one ` v. `.
    - `isGapCaseName` is `isCaseName` plus the D19 rule: neither Party_Name begins with `with` or with a lowercase-first `GAP_SIGNALS` entry followed by a space, `,`, or the end of that Party_Name.
    - `matchPrecedingGap(text, g0, g1)` matches `P1 + S? + P2 + C? + P3`. It tries `S` empty, then only the last (longest) end from `gapSignalsAt` at the end of `P1` (D21), takes `P2` as the maximal punctuation run after `S`, and tests `C` with `caseAt`, which tries candidate ends ending in `,` bounded by `MIN_CASE_NAME` and `MAX_CASE_NAME` and checks each with `isGapCaseName`. At most two `caseAt` calls per gap.
    - _Requirements: 13.1, 13.9_
  - [x] 5.15 Create `src/testing/arb-case-name.ts`
    - `arbPartyName`, `arbCaseName`, `arbSignal`, `arbGapSignal`, `arbLongParty`, `arbShortFormParty`, `arbStopListPrefix`, and `arbPartyLeftContext`, as specified in the design's Arbitraries table.
    - `arbPartyName` appends an Entity_Suffix with probability ½, draws Legal_Abbreviations including `Ltd.`, `Co.`, `L.P.`, `N.A.`, and `L.L.C.`, and never uses `with` or a lowercase Gap_Signal as a token.
    - `arbSignal` draws from the 14 `SIGNALS`. `arbGapSignal` draws from the 20 `GAP_SIGNALS` entries, capitalised and lowercase-first.
    - `arbShortFormParty` builds one Party_Side or two joined by ` v. `. Each side is a Word_Run with optional Connectors, followed with probability ½ by one Entity_Suffix. Word_Runs are truncated to 44 code units in a one-side party and 16 per side in a two-side party. A leading live stop-list word is replaced by `Smith`, and `Id.` is excluded.
    - Add an export line to `arbitraries.ts`.
    - _Requirements: 22.1, 22.4_
  - [x] 5.16 Write Property 48 in `test/arbitraries.properties.test.ts`
    - **Property 48: arbCaseName generates only Case_Names**
    - The test-local Glossary checker, `isCaseName`, and `isGapCaseName` all accept every value, and `extract(n).citations` is empty.
    - Include the companion `fc.statistics` example test, which also checks that every one of the eight Entity_Suffix words and the abbreviations `Ltd.`, `Co.`, `L.P.`, `N.A.`, `L.L.C.` occur.
    - **Validates: Requirements 22.1, 22.4**
    - _Requirements: 22.1, 22.4_
  - [x] 5.17 Implement `citations/quotes.ts`
    - `pairQuoteMarks` pairs straight and curly marks independently, drops empty pairs, and then, taking pairs in ascending order of `open`, keeps a pair only when its `open` exceeds the `close` of the last kept pair (`dropOpeningInsideKept`), so the earlier-opening pair wins over nested and crossing pairs (Req 13.10, design A9 "Quote pairing", D20).
    - `attachQuotes` applies the preceding rule first: the first citation after the closing mark must be a Full_Citation or Short_Form (no skipping past an Other_Reference), `matchPrecedingGap` must accept the gap, which may hold one Gap_Signal and one Case_Name, and `countBoundaries` (cap 2) must be ≤ 1.
    - It then applies the following rule: every code unit between the citation's end and the opening mark is whitespace or `, ; : (`, so a Gap_Signal such as `quoting` rejects it (Req 13.8, D18), and `countBoundaries` (cap 1) is 0.
    - The preceding rule takes precedence.
    - Per design A9 "Attachment".
    - _Requirements: 13.1, 13.2, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_
  - [x] 5.18 Implement `citations/link.ts` `linkShortForms`
    - `Id.` links to the previous citation. It becomes an Orphan after an Other_Reference or an Orphan.
    - A party form looks up the last Full_Citation with the same volume and normalised reporter.
    - _Requirements: 12.1, 12.2, 12.3, 12.6, 12.7_
  - [x] 5.19 Implement `citations/extract.ts` and the public `segment`
    - `extract(text)` is total: it scans, links, then pairs and attaches quotes, and computes Normalised_Forms.
    - Add `segment(text, spans)` to `segment.ts`. It calls `segmentWith(text, spans, extract(text).citations)`.
    - _Requirements: 8.5, 9.1, 9.9, 11.2, 11.3, 11.4_
  - [x] 5.20 Create `src/testing/arb-text-citations.ts` and `src/testing/arb-opinion.ts`
    - `arb-text-citations.ts`: `arbTextWithCitations` with every tagged quote group from the design table and its expected `Extraction`, plus `arbGapPunct`, `arbFollowGap`, `arbQuoteContent`, `arbProseWords`, `arbCitingString`, `arbOffsetPair`, and `arbQuoteNoise`.
    - No quote group places one Quotation_Pair inside or across another, so the expected `Extraction` needs no pair-dropping step. `arbQuoteNoise` may create pairs that open inside other pairs (nested or crossing); Property 20's reference model drops them (Req 13.10).
    - Party Short_Form fragments use `arbStopListPrefix` + `arbShortFormParty`, with and without ` v. ` and Entity_Suffixes, and are preceded by `; `, `(`, a lower-case non-Connector prose word, or a Gap_Signal and a space. The prose vocabulary contains neither `with` nor any lowercase Gap_Signal.
    - Quote tags include: preceding with a Gap_Signal (every `GAP_SIGNALS` entry, before a Full_Citation or a party Short_Form, and `"q." ` + Gap_Signal + Case_Name + Full_Citation); preceding with a parenthetical signal (`(quoting Roe v. Wade, 410 U.S. 113)` shape); and unattached groups for `In` before a party Short_Form, `with` before a Case_Name, two Gap_Signals, a Party_Name over 80 code units, and a following gap holding a Gap_Signal (`(quoting "q")`).
    - The builder counts the boundaries each group's own words add (one after `Cf.` or `cf.`; one after each Case_Name Single_Capital_Initial that Req 8.10 does not exclude, that is, one followed by ` v. `, ` et al.`, or a space and a digit-run token; none after an initial followed by a space and a Capitalised_Word other than `Id.` or by `,`; none after `v.`, an Entity_Suffix, or the periods of `E.g.,`; none inside a Citation range). See the design's `arbTextWithCitations` row.
    - `arb-opinion.ts`: `arbOpinionWithQuotes`.
    - Add export lines to `arbitraries.ts`.
    - _Requirements: 22.1, 22.4_
  - [x] 5.21 Write Property 17 in `test/extract.properties.test.ts`
    - **Property 17: Extraction offsets are exact on any string**
    - **Validates: Requirements 9.2, 9.7, 9.9, 13.2, 13.7**
    - _Requirements: 9.2, 9.7, 9.9, 13.2, 13.7_
  - [x] 5.22 Write Property 18 in `test/extract.properties.test.ts`
    - **Property 18: Extraction finds exactly the constructed citations, links, and quotes**
    - Covers party Short_Forms with and without ` v. ` and Entity_Suffixes, Preceding_Quotes with every Gap_Signal in both cases (including `(quoting …)`), and the unattached `In`, `with`, two-Gap_Signal, and over-80 cases.
    - 400 seeded coverage examples run as fast-check `examples` before the `runs()` random runs (`numRuns` raised by their count), so the coverage clause holds on every run.
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.6, 12.1, 12.2, 12.3, 12.6, 12.7, 13.1, 13.5, 13.7, 13.8, 13.9**
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.6, 12.1, 12.2, 12.3, 12.6, 12.7, 13.1, 13.5, 13.7, 13.8, 13.9_
  - [x] 5.23 Write Property 19 in `test/extract.properties.test.ts`
    - **Property 19: Citations glued to letters or digits are not extracted**
    - **Validates: Requirements 9.8**
    - _Requirements: 9.8_
  - [x] 5.24 Write Property 20 in `test/extract.properties.test.ts`
    - **Property 20: Quote pairing and attachment agree with a reference model**
    - Uses a test-local naive reference model that pairs marks per family, drops blank pairs, then, in a left-to-right pass by opening mark, drops every pair whose opening mark lies inside the last kept pair (Req 13.10), and takes Sentences from `segment`. It tries every split `P1 + S + P2 + C + P3` of a preceding gap, with `S` empty or the longest entry of a test-local Gap_Signal list typed from the Glossary (ten forms plus their lowercase-first forms, no `with`) that starts at that position and fits in the gap (D21), and checks `C` with a test-local Case_Name checker (Entity_Suffixes, inner periods of `L.L.C.`, `L.P.`, `N.A.`, and the D19 leading-word rule). Following gaps accept only whitespace and `, ; : (`.
    - **Validates: Requirements 13.1, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10**
    - _Requirements: 13.1, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10_
  - [x] 5.25 Write Property 44 in `test/extract.properties.test.ts`
    - **Property 44: Boundary counting agrees with the Segmenter's Sentences**
    - **Validates: Requirements 13.1, 13.8**
    - _Requirements: 13.1, 13.8_
  - [x] 5.26 Write Property 45 in `test/extract.properties.test.ts`
    - **Property 45: Case_Name and Gap_Signal gaps attach, and `In`, `with`, doubled-signal, or over-long gaps do not**
    - Uses `arbQuoteContent`, `arbCaseName`, `arbGapPunct`, `arbGapSignal`, `arbCitation`, `arbShortFormParty`, and `arbLongParty`.
    - **Validates: Requirements 13.1, 13.9**
    - _Requirements: 13.1, 13.9_
  - [x] 5.27 Write Property 46 in `test/extract.properties.test.ts`
    - **Property 46: Following quotes attach to the citation before them in the same Sentence**
    - Also asserts that inserting `s + " "` for any `arbGapSignal` `s` into the following gap leaves no quote.
    - **Validates: Requirements 13.8, 13.9**
    - _Requirements: 13.8, 13.9_
  - [x] 5.28 Write Property 47 in `test/extract.properties.test.ts`
    - **Property 47: The preceding rule wins, and one citation can carry several quotes**
    - **Validates: Requirements 13.5, 13.7**
    - _Requirements: 13.5, 13.7_
  - [x] 5.29 Write Property 49 in `test/extract.properties.test.ts`
    - **Property 49: Party Short_Forms start with a Capitalised_Word and never with a stop-list entry**
    - The test-local Party_Run checker allows at most one ` v. ` between two Party_Sides and at most one Entity_Suffix per side. The tail is located from `party.length`, not from the first `,`.
    - **Validates: Requirements 9.2, 12.2, 12.8**
    - _Requirements: 9.2, 12.2, 12.8_
  - [x] 5.30 Write Property 50 in `test/extract.properties.test.ts`
    - **Property 50: The party is the longest Party_Run with stop-list entries and Connectors stripped**
    - Uses a test-local word-list reference model that shares no code with `party.ts`. It accepts the first word start whose words parse as one Party_Side or two joined by ` v. `, each side a Word_Run optionally followed by `, ` and one Entity_Suffix word, and yields no party if stripping leaves `v.` first.
    - **Validates: Requirements 9.2, 12.2**
    - _Requirements: 9.2, 12.2_
  - [x] 5.31 Add Short_Form_Party named examples to `test/extract.properties.test.ts`
    - Each example follows a Full_Citation it can link to.
    - `In Casey` gives `Casey`.
    - `Planned Parenthood` and `See Planned Parenthood` give `Planned Parenthood`.
    - `In the Matter of Smith` gives `Matter of Smith`.
    - `The Smith Corp.` keeps `The`.
    - `Smith, Inc., 5 U.S. at 9` gives `Smith, Inc.`, starting at `S` (D14 reversed). `foo, Inc., 5 U.S. at 9` gives `Inc.`.
    - `Roe v. Wade, 410 U.S. at 153` gives `Roe v. Wade`, with the Short_Form's start Offset at `R` (after `410 U.S. 113 (1973)`). `See Roe v. Wade, 410 U.S. at 153` gives the same party and start.
    - `Acme, Inc. v. Smith, 5 U.S. at 9` gives `Acme, Inc. v. Smith`, and `Acme, Inc. v. Smith, LLC, 5 U.S. at 9` gives `Acme, Inc. v. Smith, LLC`.
    - `A v. B v. C` gives `B v. C`, `foo v. Wade` gives `Wade`, and `In v. Wade` gives no party Short_Form.
    - `Id. Smith` gives the party `Id. Smith` starting at `I`, with no separate `Id.` Short_Form (D16).
    - `Cf. Casey` and `E.g., Casey` give `Casey` (D15).
    - `United States ex rel. Smith` gives the whole run, and `Smith&Jones` gives `Jones`.
    - An 81-code-unit Party_Run gives no Short_Form, including one that reaches 81 only through ` v. ` and an Entity_Suffix.
    - A 76-code-unit party preceded by ` extensively ` gives the party, and one preceded by a 90-code-unit Capitalised_Word also gives the party (D17).
    - The preceding-quote examples with `Planned Parenthood`, `See Planned Parenthood`, and `In Casey`.
    - _Requirements: 9.2, 12.2, 12.8, 13.1_
  - [x] 5.32 Write example tests in `test/extract.test.ts`
    - Preceding-quote examples that attach (13.1): `"… ." Roe, 410 U.S. at 153.`; `"…," Roe v. Wade, 410 U.S. 113 (1973)`; `"…." See Roe v. Wade, 410 U.S. 113` and `"…," See Roe v. Wade, 410 U.S. 113 (1973)`; `"…" See Planned Parenthood, 505 U.S. at 833`; `"…" (quoting Roe v. Wade, 410 U.S. 113)` and `"…" (citing Casey, 505 U.S. at 833)`; `"…" See, e.g., Roe v. Wade, 410 U.S. 113`; `"…" Cf. Roe v. Wade, 410 U.S. 113`; and `"…." Compare Roe v. Wade, 410 U.S. 113, with Casey, 505 U.S. at 833`, which attaches to `410 U.S. 113`.
    - Preceding-quote examples that do not attach (13.1, 13.9): `"…" In Casey, 505 U.S. at 833`; `"…," with Casey v. Smith, 5 U.S. 1 (1801)` (D19); two Gap_Signals, `"…" See accord Roe v. Wade, 410 U.S. 113` and `"…" See Accord Roe v. Wade, 410 U.S. 113`; `"… ." Cf. Roe v. Wade, 410 U.S. 113` (two boundaries); and any other gap spanning two boundaries.
    - Following-quote examples (13.8): `Roe, 410 U.S. at 153 ("quoted text")` and `410 U.S. 113, 116: "quoted text"` attach, and `Roe, 410 U.S. at 153 (quoting "quoted text")` does not attach to `Roe`.
    - A quote between two citations attaches to the following one (13.5).
    - A quote followed first by an Other_Reference does not skip ahead (13.1).
    - `Id.` after `42 U.S.C. § 1983` is an Orphan (12.6). `Id.` after an Orphan is an Orphan (12.7).
    - A `“…"` mixture gives no quote (13.6).
    - The empty string and a string with only lone surrogates return empty lists (9.9).
    - _Requirements: 9.9, 12.6, 12.7, 13.1, 13.5, 13.6, 13.8, 13.9_
  - [x] 5.33 Write Property 23 in `test/format.properties.test.ts`
    - **Property 23: Near misses are extracted and normalised to the first matching reporter**
    - Also covers near-miss LEXIS courts: a LEXIS Database_Citation whose court collapsed-matches a `lexis-courts.json` entry extracts with `lexisCourtListed: true`, that list entry as `lexisCourt`, and Normalised_Form `format(value)`; re-extracting the Normalised_Form gives the same value and no Normalised_Form. Cases come from `arbNearMissLexisCitation` (`src/testing/arb-lexis-near-miss.ts`, built on `arbNearMissLexisCourt`, optional `, at *<pin>`) as a third `fc.oneof` branch under the one `fc.assert`; the expected entry is computed test-locally from `lexis-courts.json` in file order with the test's own collapse key.
    - Named example: `2020 Phila.Ct. Com. Pl. LEXIS 5`.
    - **Validates: Requirements 9.4, 10.6, 11.1, 11.2, 11.4, 11.5, 11.6, 14.6**
    - _Requirements: 9.4, 10.6, 11.1, 11.2, 11.4, 11.5, 11.6, 14.6_
  - [x] 5.34 Write Property 24 in `test/format.properties.test.ts`
    - **Property 24: Garbage citations are never extracted and do not disturb the rest**
    - Inserts garbage at neutral positions only (D4).
    - **Validates: Requirements 11.3, 14.3**
    - _Requirements: 11.3, 14.3_
  - [x] 5.35 Write Property 15 in `test/segment.properties.test.ts` and widen Property 14
    - **Property 15: Sentence boundaries are exactly the rule's positions**
    - This is the citation-aware segmentation property. It runs `segment` against `extract(t)` ranges on `arbTextWithCitations` with `arbAbbreviationProse` spliced in, drawn from the whole `LEGAL_ABBREVIATIONS` list (including `Ltd.`, `Co.`, `L.P.`, `N.A.`, `L.L.C.`) plus reporter abbreviations, and with `arbInitialProse` fragments spliced in, so that initials followed by one space and a Capitalised_Word (no boundary, Req 8.10) and the near cases that still split both occur.
    - Also add `arbTextWithCitations` through `segment` to the Property 14 generator from task 4.5. Do not add a second `fc.assert` for Property 14.
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.10**
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.10_
  - [x] 5.36 Write Property 5 in `test/spans.properties.test.ts`
    - **Property 5: Invalid span lists are rejected at the first violation**
    - It asserts both `normaliseSpans` and the public `segment`, so it lands here rather than in task 2.
    - **Validates: Requirements 3.6, 8.9**
    - _Requirements: 3.6, 8.9_
  - [ ]* 5.37 Write example tests for the Req 10.2 layouts in `test/format.test.ts`
    - `410 U.S. 113, 116 (1973)`, `598 F.3d 1, 7 (2d Cir. 2010)`, `2024 WL 123456`, and `2023 U.S. Dist. LEXIS 98765`. Property 21 already covers these.
    - _Requirements: 10.2_
  - [x] 5.38 Add the demo-motion fixture and its extraction test
    - Add `packages/engine/fixtures/demo-motion.txt`, a motion with three fabricated citations and one fabricated quote, and `fixtures/README.md` with one line naming its source and date.
    - If `apps/web/demo/` does not exist yet, author the fixture here and note in the README that `apps/web/demo/` must reuse it.
    - `test/demo.test.ts` asserts the planted items extract at known Offsets.
    - _Requirements: 9.1, 9.2, 13.1_
  - [x] 5.39 Implement `citations/incremental.ts` `rescan`
    - Finds the left resync landing position at or before `from − LOOKAHEAD − 1`.
    - Scans until the right resync point `q ≥ newTo + LOOKBEHIND`, with `LOOKBEHIND = 162`, where `q − delta` is an old landing position. This window covers party matches whose `partyStartFor` scan (up to `PARTY_SCAN = 161` before the tail comma) reaches into the edit, such as inserting `In ` or `Roe v. ` before a party.
    - Splices the kept, new, and shifted matches.
    - Per design A5.
    - _Requirements: 15.1, 21.1_
  - [x] 5.40 Implement `anchor.ts`
    - `mapRange` follows Req 15.3.
    - Carries over Full_Citations, Short_Forms (link target compared through the mapping, D5), and quotes (conditions a to d, comparing `citationStart` and `rule`).
    - `assignKeys` issues `k<n>` in `(start, citation first)` order and skips Other_References.
    - Cleans up Overrides.
    - Per design A6.
    - _Requirements: 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_
  - [x] 5.41 Wire the citation layer into `createDocument` and the operation pipeline
    - Replace `reanchorStage` with real stages. `createDocument` runs `extract` and then `assignKeys` with every result `unchecked` (design A1 step 4).
    - Insert and Delete run `rescan`, `linkShortForms`, `pairQuoteMarks` and `attachQuotes`, then `reanchor` (A3 step 7, A5).
    - Replace re-extracts and re-anchors once, against the original Document, with the combined edit `[from, to) → [from, from + text.length)` (A4).
    - _Requirements: 2.3, 4.6, 15.1, 15.4_
  - [x] 5.42 Extend `src/testing/arb-ops.ts` and `src/testing/arb-document.ts`
    - `arbEdit(t)` lives in `src/testing/arb-edit.ts` with `applyTextEdit` and `editTargets`. It biases edit positions into citation ranges, party names, and stop-list prefixes, up to `LOOKBEHIND` (162) code units before them, into Entity_Suffixes and the ` v. ` of a party, and into quote-to-citation gaps. It biases inserted text toward `arbStopListPrefix` values, Connectors, Capitalised_Words, `arbGapSignal` values, Entity_Suffixes (`, Inc.`, `, L.L.C.`), ` v. ` and `v. ` + a Capitalised_Word, `, `, and `; `.
    - `arbCitationTargetedOp(d)` also targets quote-to-citation gaps.
    - `arbDocument` text now comes from `arbDocumentText`, which draws `arbTextWithCitations` and `arbText` at 3:1, and `arbOpSequence` biases Offsets into citation and quote ranges.
    - _Requirements: 22.1, 22.4_
  - [x] 5.43 Write Property 2 in `test/document.properties.test.ts`
    - **Property 2: Creation preserves text and starts as one PST span with extracted, unchecked citations**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.6**
    - _Requirements: 2.1, 2.2, 2.3, 2.6_
  - [x] 5.44 Write Property 25 in `test/anchor.properties.test.ts`
    - **Property 25: Incremental re-extraction equals full extraction**
    - Uses `arbEdit(t)` from task 5.42, so edits change a party's canonical start or tail comma from outside its range, split a Party_Side, or add and remove a Gap_Signal in a gap.
    - **Validates: Requirements 15.1**
    - _Requirements: 15.1_
  - [x] 5.45 Write Property 27 in `test/anchor.properties.test.ts`
    - **Property 27: Issue_Keys are fresh, unique, and assigned in document order**
    - Holds for Replace because a Replace re-anchors once over its combined edit (A4), so it issues no key that no item keeps: `See 410 U.S. 113.` with `Replace(4, 5, "4")` gives the citation `k1` and `keyCounter` 2.
    - **Validates: Requirements 15.5, 15.7**
    - _Requirements: 15.5, 15.7_
  - [x] 5.46 Write Property 51 in `test/extract.properties.test.ts`
    - **Property 51: A Gap_Signal before a citation never prevents an attachment that holds without it**
    - Builds `t` and `t′` (with `g + " "` inserted before `m + x`) from `arbQuoteContent`, `arbGapPunct`, `arbCaseName`, `arbCitation`, `arbShortFormParty`, and `arbGapSignal`, and checks the attachment under the Sentence condition and the shifted citations.
    - **Validates: Requirements 12.2, 13.1**
    - _Requirements: 12.2, 13.1_
  - [x] 5.47 Add `citations/lexis-courts.ts` and the `lexisCourtListed` value field, and update `format.ts`
    - Depends on regenerated data: start only after the maintainer has re-run `scripts/generate-reporters.ts` against reporters-db and committed `src/citations/lexis-courts.json` and the updated `REPORTERS_LICENSE.md`. Do not hand-write the list.
    - `lexis-courts.ts`: `LEXIS_COURTS` as a static JSON import (`with { type: "json" }`), exact and collapsed indexes built once (first entry wins), `lookupLexisCourt` (exact, then collapsed), and `isUnlistedLexisCourt` (the Glossary Unlisted_Lexis_Court rule). It is the only importer of `lexis-courts.json` (Req 14.8).
    - `types.ts`: `DatabaseValue` gains `lexisCourtListed?: boolean`, present iff the designator is `LEXIS`, `true` for a listed court (the list entry) and `false` for an unlisted court (as written).
    - `format.ts`: `validateFullValue` checks `lexisCourtListed` after `court` and before `lexisCourt`; a listed court must be an exact entry, and an unlisted court must satisfy the tight rule and match no entry exactly or collapsed. `format` prints the court as recorded.
    - Per design A13 and D22.
    - _Requirements: 9.4, 10.1, 10.5, 14.8_
  - [x] 5.48 Update `citations/grammar-db.ts` for listed and unlisted LEXIS courts
    - Depends on 5.47 and on the regenerated `lexis-courts.json`.
    - The court starts one space after the year and runs to the first `LEXIS` token. Fail if any court token is a year in 1600–2999. Then try `lookupLexisCourt` (exact, then collapsed) for `lexisCourtListed: true` with the list entry, else `isUnlistedLexisCourt` for `lexisCourtListed: false` with the court as written, else fail. Keep every read inside `[p − 2, p + 140)`.
    - Add the design's named example tests to `test/grammar-db.test.ts` and `test/extract.test.ts`: `under 42 U.S.C. § 1983 and the court in 2023 U.S. Dist. LEXIS 5` keeps the Other_Reference and starts the Database_Citation at `2023`, and `Smith v. Local 2092 Union, 2023 U.S. Dist. LEXIS 5` starts it at `2023`; also the near-miss, unlisted, and rejected-court examples.
    - Per design A9 step 2 and D22.
    - _Requirements: 9.4, 9.7, 11.2, 11.3, 14.8_
  - [x] 5.49 Update the citation arbitraries for LEXIS courts
    - Depends on 5.47 and 5.48, and on the regenerated `lexis-courts.json`.
    - `arb-citation.ts`: add `arbLexisCourt` and `arbDatabaseValue` (listed courts from `LEXIS_COURTS`, unlisted courts under the tight rule and filtered against both indexes, equal weight), and use them in `arbCitation`.
    - `arb-citation-corrupt.ts`: `arbValueCorruption` gains the `lexisCourtListed` and `lexisCourt`-consistency corruptions from the design's Arbitraries table, each with its expected field.
    - `arb-text-citations.ts` and `arb-text-builder.ts`: remove the `\n`-before-LEXIS workaround from `putFull` and from the module comment, so a LEXIS fragment is joined like any other.
    - _Requirements: 22.1, 22.4_
  - [x] 5.50 Re-run Properties 21 and 22 and the 5.20 preview test against the LEXIS changes
    - Depends on 5.47 to 5.49 and on the regenerated `lexis-courts.json`.
    - Update the Property 21 and Property 22 statements in `test/format.properties.test.ts` to the design's new wording (round trip keeps `lexisCourtListed`; corruptions of the flag and court consistency). Do not add a second `fc.assert` for either property.
    - Re-run `test/arb-text-citations.test.ts` ("the constructed Extraction equals extract(text)") with the workaround removed.
    - Record any counterexample as a named example (Req 22.5).
    - _Requirements: 9.4, 10.1, 10.3, 10.4, 10.5_

- [x] 6. Checkpoint: citations and re-anchoring
  - Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass. Ask the user if questions arise.

- [x] 7. Verification state, issues, and overrides
  - [x] 7.1 Implement `verification.ts`
    - `setVerification` checks `unknown_citation`, then `not_verifiable`, then `invalid_verification_result`. It keeps the Override when the status is unchanged and drops it when the status changes.
    - `not_verifiable` covers a Short_Form key and, after task 5.47, a `verified` result (well-formed or not; only `r.status` is read) on a Database_Citation with `lexisCourtListed: false`, returning the input Document unchanged. `not_found`, `ambiguous`, and `unchecked` on such a citation are recorded as usual, so it stays an Issue until overridden (Req 16.5, 18.2, D22).
    - `setQuoteCheck` checks `unknown_quote`, then `not_verifiable` (quote on an Orphan), then `invalid_quote_result`. It drops the Override when the result differs.
    - `verificationOf` derives the result for a Short_Form from its target, and returns `unchecked` for an Orphan.
    - Per design A10.
    - _Requirements: 12.4, 12.5, 13.3, 13.4, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 17.1, 17.2, 17.3, 17.4, 17.5, 17.8_
  - [x] 7.2 Implement `issues.ts`
    - `issues` returns items in `(start, citation first)` order, each with its IssueCode.
    - `blockingIssues`, `overrides`, and `recordOverride`. `recordOverride` checks `unknown_issue`, then `empty_override_reason` using `trim`, then `invalid_timestamp`. It stores the reason verbatim and keeps one Override per key.
    - Per design A10.
    - _Requirements: 12.5, 13.4, 17.6, 17.7, 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_
  - [x] 7.3 Create `src/testing/arb-state.ts` and extend `arbDocument`
    - Arbitraries: `arbVerificationResult`, `arbQuoteCheckResult(len)`, `arbReason` (including `[ ] \ { } ; = ,`), `arbBlankReason`, `arbStateWrites`, `arbBadVerificationWrite`, `arbBadQuoteWrite`, and `arbStateOpSequence`. Each bad-write arbitrary records its expected error.
    - `arbBadVerificationWrite` includes a `verified` write (well-formed or malformed) on an unlisted LEXIS key, expecting `not_verifiable`. `arbStateOpSequence` uses texts with unlisted LEXIS citations, weights `verified` writes toward their keys, and biases edits into and next to them (design Arbitraries table, D22).
    - `arbDocument` applies `arbStateWrites` through `setVerification`, `setQuoteCheck`, and `recordOverride`, weighted across every status. A write that returns an error is skipped, not filtered.
    - _Requirements: 22.1, 22.4_
  - [x] 7.4 Write Property 28 in `test/verification.properties.test.ts`
    - **Property 28: Writing a verification result updates the citation and its Short_Forms only**
    - Excludes a `verified` result on an unlisted LEXIS key, which Property 29 covers.
    - **Validates: Requirements 12.4, 16.1, 16.6, 16.7**
    - _Requirements: 12.4, 16.1, 16.6, 16.7_
  - [x] 7.5 Write Property 29 in `test/verification.properties.test.ts`
    - **Property 29: Invalid verification writes are rejected without change**
    - Includes the Req 16.5 extension: a `verified` result on a Database_Citation with `lexisCourtListed: false` returns `not_verifiable`, before any payload check.
    - **Validates: Requirements 16.2, 16.3, 16.4, 16.5**
    - _Requirements: 16.2, 16.3, 16.4, 16.5_
  - [x] 7.6 Write Property 30 in `test/verification.properties.test.ts`
    - **Property 30: Writing a quote-check result updates that quote only**
    - **Validates: Requirements 17.1, 17.2, 17.4**
    - _Requirements: 17.1, 17.2, 17.4_
  - [x] 7.7 Write Property 31 in `test/verification.properties.test.ts`
    - **Property 31: Invalid quote-check writes are rejected without change**
    - **Validates: Requirements 13.4, 17.3, 17.5, 17.8**
    - _Requirements: 13.4, 17.3, 17.5, 17.8_
  - [x] 7.8 Write Property 32 in `test/issues.properties.test.ts`
    - **Property 32: The Issue set is exactly the non-passing items**
    - **Validates: Requirements 12.5, 13.4, 17.6, 17.7, 18.2**
    - _Requirements: 12.5, 13.4, 17.6, 17.7, 18.2_
  - [x] 7.9 Write Property 33 in `test/issues.properties.test.ts`
    - **Property 33: blockingIssues are the un-overridden Issues in order**
    - **Validates: Requirements 18.1, 18.8**
    - _Requirements: 18.1, 18.8_
  - [x] 7.10 Write Property 34 in `test/issues.properties.test.ts`
    - **Property 34: Recording an Override follows the reason and target rules**
    - **Validates: Requirements 18.3, 18.4, 18.5, 18.6, 18.7**
    - _Requirements: 18.3, 18.4, 18.5, 18.6, 18.7_
  - [x] 7.11 Write Property 35 in `test/issues.properties.test.ts`
    - **Property 35: Overrides only ever belong to current Issues**
    - Also asserts that no sequence of operations and verification results ever puts a citation with `lexisCourtListed: false` in the `verified` state: in every intermediate Document every such Full_Citation has a status other than `verified`. `arbStateOpSequence` generates unlisted LEXIS citations and `verified` writes aimed at them. Same `fc.assert`; no new Property number.
    - **Validates: Requirements 15.8, 16.5, 16.6, 17.4**
    - _Requirements: 15.8, 16.5, 16.6, 17.4_
  - [x] 7.12 Write Property 26 in `test/anchor.properties.test.ts`
    - **Property 26: Touched citations reset, untouched ones carry over with shifted offsets**
    - This lands here because it needs `arbDocument` with verification results and Overrides from task 7.3.
    - **Validates: Requirements 15.2, 15.3, 15.4, 15.6, 15.7**
    - _Requirements: 15.2, 15.3, 15.4, 15.6, 15.7_
  - [x] 7.13 Write Property 43 in `test/arbitraries.properties.test.ts`
    - **Property 43: The shared arbitraries generate only valid values**
    - Covers the full `arbDocument`, `arbOpSequence`, near-miss, garbage, text-with-citations, opinion, `arbShortFormParty`, `arbGapSignal`, and `arbStopListPrefix` arbitraries. `arbShortFormParty` values are checked as Party_Runs of at most `MAX_PARTY` with at most one ` v. ` and at most one Entity_Suffix per side, and `arbGapSignal` values against a test-local Glossary list that excludes `with`.
    - **Validates: Requirements 22.4**
    - _Requirements: 22.4_
  - [ ]* 7.14 Write example tests in `test/verification.test.ts`
    - An `ambiguous` result with one candidate is rejected.
    - A quote result on an Orphan's quote returns `not_verifiable`.
    - A whitespace-only Override reason is rejected. Properties 29, 31, and 34 already cover these.
    - _Requirements: 16.3, 17.8, 18.5_

- [x] 8. Reveal Codes rendering and parsing
  - [x] 8.1 Implement `codes/syntax.ts`
    - `CODE_NAMES` with the exact glyphs from product.md.
    - `escapeText`, `escapeRetained`, `escapePayload`, and `unescape`, using the per-context escape sets in the design.
    - `codeString(name, retained, fields, mode)`.
    - _Requirements: 19.2, 19.3, 19.11_
  - [x] 8.2 Implement `codes/render.ts`
    - Builds per-offset close and open events in the Req 19.6 order, with `[DOC]` first in full mode.
    - Writes the Payload_Section fields from the design table, places `[OVR]` after its opening Code, and builds positions in the same pass.
    - In display mode it omits fields and `[DOC]`.
    - Per design A11.
    - _Requirements: 19.1, 19.2, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9, 19.10, 19.12_
  - [x] 8.3 Implement `codes/strip.ts`
    - `strip` is a text-only two-state scanner that drops `[DOC]` and every `{…}` section.
    - `stripPositions`.
    - Per design A11 "Strip".
    - _Requirements: 19.11, 19.12, 19.13_
  - [x] 8.4 Implement `codes/lex.ts` `lexCodes`
    - A single pass that records every syntax fault at its input index and returns the lowest one.
    - Per design A12 step 1.
    - _Requirements: 20.3, 20.6_
  - [x] 8.5 Implement `codes/decode.ts`
    - Turns tokens into a draft Document: header, spans, citation and quote ranges, and `[OVR]` attachment (`ovr_position`).
    - Field decoders.
    - Per design A12 step 2.
    - _Requirements: 20.1, 20.3_
  - [x] 8.6 Implement `codes/check.ts`
    - Runs the Req 20.4 semantic rules, each reported with its `rule` tag.
    - Includes `unverifiable_status`: a `[CIT ✓]` on a Database_Citation whose Extractor value has `lexisCourtListed: false` is rejected at that Code's input index, the same treatment as a `[CIT ✓]` on an Orphan, never a downgrade (Req 16.5, 20.4, D23). Add the design's named example test "Parse rejects a verified code on an unlisted LEXIS citation" to `test/codes.test.ts`, with its listed-court counterpart that parses `ok`.
    - Cross-checks against the Extractor (`extractor_mismatch`), including `[REF]` pairs and quote attachment.
    - Per design A12 step 3.
    - _Requirements: 20.4, 20.5_
  - [x] 8.7 Implement the `codes.ts` facade
    - Exports `render`, `parse` (lex, decode, check, build, and never throws), `strip`, and `stripPositions`.
    - _Requirements: 20.1, 20.2, 20.6_
  - [x] 8.8 Create `src/testing/arb-codes.ts`
    - `arbSyntaxFault` records the injected index. `arbSemanticTamper` records the expected `MalformedRule`.
    - Add an export line to `arbitraries.ts`.
    - _Requirements: 22.1_
  - [x] 8.9 Write Property 36 in `test/codes.properties.test.ts`
    - **Property 36: Full Reveal Codes round trip**
    - **Validates: Requirements 19.2, 19.3, 20.1, 20.2**
    - _Requirements: 19.2, 19.3, 20.1, 20.2_
  - [x] 8.10 Write Property 37 in `test/codes.properties.test.ts`
    - **Property 37: Display is the Strip projection of full**
    - **Validates: Requirements 19.10, 19.11, 19.12, 19.13**
    - _Requirements: 19.10, 19.11, 19.12, 19.13_
  - [x] 8.11 Write Property 38 in `test/codes.properties.test.ts`
    - **Property 38: Removing Codes and unescaping yields the Text**
    - **Validates: Requirements 19.3, 19.5**
    - _Requirements: 19.3, 19.5_
  - [x] 8.12 Write Property 39 in `test/codes.properties.test.ts`
    - **Property 39: Codes match the document structure**
    - **Validates: Requirements 19.1, 19.2, 19.4, 19.6, 19.7, 19.8**
    - _Requirements: 19.1, 19.2, 19.4, 19.6, 19.7, 19.8_
  - [x] 8.13 Write Property 40 in `test/codes.properties.test.ts`
    - **Property 40: Malformed text is rejected at the lowest fault index, and parse never throws**
    - **Validates: Requirements 20.3, 20.6**
    - _Requirements: 20.3, 20.6_
  - [x] 8.14 Write Property 41 in `test/codes.properties.test.ts`
    - **Property 41: Semantically tampered renderings are rejected with the violated rule**
    - `arbSemanticTamper` includes replacing the opening citation code of an unlisted LEXIS Database_Citation with `[CIT ✓{k=<same key>;cl=<id>}]`, expecting `unverifiable_status` (D23). Same `fc.assert`; no new Property number.
    - **Validates: Requirements 20.4, 20.5**
    - _Requirements: 20.4, 20.5_
  - [x] 8.15 Write example tests in `test/codes.test.ts`
    - Empty Document: full mode renders only `[DOC]` with one position, and display mode renders `""` with none (19.9).
    - Parsing a display rendering, or `""`, returns `malformed_codes` with `missing_doc` at 0 (20.3).
    - The design's full and display example strings.
    - Every Code from product.md appears in at least one rendering.
    - _Requirements: 19.1, 19.9, 19.10, 20.3_

- [x] 9. Checkpoint: rendering and parsing
  - Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass. Ask the user if questions arise.

- [x] 10. Public API and purity checks
  - [x] 10.1 Write `src/index.ts`
    - Named re-exports of the design's Public API and `DEFAULT_RELABEL_THRESHOLD`, plus the public types.
    - Do not export `testing/`.
    - Remove the `PACKAGE_NAME` placeholder and replace `test/index.test.ts` with a test that calls exported functions and asserts their results.
    - _Requirements: 1.2, 1.9_
  - [x] 10.2 Write static checks in `test/purity.test.ts`
    - The engine `package.json` dependency fields are empty or absent (1.1).
    - No file in `src` contains `node:` imports, DOM globals, `Date`, `performance`, `Math.random`, `crypto`, `fetch`, `XMLHttpRequest`, `setTimeout`, `setInterval`, imports from outside the package, `export default`, or `try`/`catch` (1.2, 1.3, 1.9). `testing/` may import fast-check.
    - `index.ts` does not re-export `testing/` (1.2).
    - `reporters.json` is the only reporter list, its entries are non-empty, trimmed, and unique, and the licence note has the licence name, repository, version or commit, and date (14.1, 14.2, 14.4).
    - _Requirements: 1.1, 1.2, 1.3, 1.9, 14.1, 14.2, 14.4_
  - [x] 10.3 Create `src/testing/arb-api.ts` `arbApiCall(d)`
    - One call to any exported function with generated arguments, including failing ones.
    - Add an export line to `arbitraries.ts`.
    - _Requirements: 22.1_
  - [x] 10.4 Write Property 42 in `test/purity.properties.test.ts`
    - **Property 42: Engine functions are deterministic, pure, and invent no values**
    - Calls run on deep-frozen arguments.
    - **Validates: Requirements 1.4, 1.5, 1.6, 1.7**
    - _Requirements: 1.4, 1.5, 1.6, 1.7_
  - [x] 10.5 Write `test/inventory.test.ts`
    - Parse the `### Property N` headings in `design.md` and assert that each N appears exactly once as `// Property N` with one `fc.assert`, in a `*.properties.test.ts` file whose describe title contains `_Requirements:`.
    - Assert that no test file contains `vi.mock` of an engine module or `try {`.
    - _Requirements: 22.2, 22.6_

- [ ] 11. Benchmark (manual, outside CI)
  - [~] 11.1 Create the benchmark in `packages/engine/bench/`
    - `fixture.ts` builds the Document deterministically from `BENCH_SEED = 20261103` with a local mulberry32 PRNG. The Document has exactly 50,000 code units, 500 Spans, at least 10 Runs, 100 Full_Citations, and at least 20 quotes. The fixture asserts these counts.
    - `apply.bench.test.ts` runs the four scenarios from Req 21.1 to 21.3. Each gets 100 warm-ups and 1,000 timed runs from the same input. It prints the median and p95, and on failure reports one message listing every failing scenario with its times.
    - `bench/vitest.config.ts` includes only `bench/**/*.bench.test.ts`.
    - Add the engine package script `"bench": "vitest run --config bench/vitest.config.ts"`. Do not reference it from the root scripts or `ci.yml`.
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.7_
  - [~] 11.2 Add a check to `test/purity.test.ts` that the root `package.json` scripts and `.github/workflows/ci.yml` never invoke the benchmark
    - _Requirements: 21.7_
  - [~] 11.3 Run `pnpm --filter @reveal-codes/engine bench` by hand on the Reference_Machine and record the results in `BUILD_LOG.md`
    - Record the median and p95 for each scenario, the seed, and the machine's CPU, memory, OS, and Node version.
    - _Requirements: 21.6_

- [ ] 12. Documentation
  - [~] 12.1 Add a dated `BUILD_LOG.md` entry
    - What the engine build delivered.
    - Where Kiro produced something wrong and what spec or steering change fixed it (for example the deviations D1 to D19, the `LOOKBEHIND` correction from 82 to 162, and the quote-attachment and Short_Form_Party rewrites).
    - Any test that was hard to write, with the requirement it points to.
    - Counterexample regressions recorded under Req 22.5.
    - _Requirements: 21.6, 22.5_
  - [~] 12.2 Add rows to `docs/KIRO_USAGE.md`
    - The spec `.kiro/specs/provenance-engine/` (requirements.md, design.md, tasks.md).
    - The steering edits made during this spec: `.kiro/steering/product.md` (binding Code list including `[REF]`, and principle 4 blocking codes) and `.kiro/steering/structure.md` (`codes.ts` render modes and parse).
    - Each row gives the path and one line on why it exists, as structure.md requires.
    - _Requirements: 22.2_

## Notes

- Property tests are mandatory in this repository and none are marked optional. The only optional (`*`) tasks are example tests whose requirements a property already covers (5.37, 7.14).
- Each `Property N` from design.md (1 to 51) is assigned to exactly one sub-task:
  - Task 2: 1, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13
  - Task 4: 14, 16
  - Task 5: 2, 5, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 44, 45, 46, 47, 48, 49, 50, 51
  - Task 7: 26, 28, 29, 30, 31, 32, 33, 34, 35, 43
  - Task 8: 36, 37, 38, 39, 40, 41
  - Task 10: 42
- Properties 7 and 8 land in task 2, while the citation layer is still empty, so they check Issue_Keys and `keyCounter` only trivially at first. After task 5.41 they run against Documents with citations without any change to the test, because `arbDocument` gains citation text in task 5.42.
- The reporters-db generator runs offline against a maintainer's local checkout. Only the committed `reporters.json`, `lexis-courts.json`, and `REPORTERS_LICENSE.md` are used at run time. No test touches the network. Tasks 5.47 to 5.50 wait for the maintainer to regenerate these files with the updated generator.
- Task 11.3 is a manual measurement on the Reference_Machine, as Req 21.6 and 21.7 require. It is never run by `pnpm test`, `pnpm test:pbt`, or CI.
- If a property fails, add the shrunk counterexample as a named example in the same properties file and fix the code, or record the faulty requirement in `BUILD_LOG.md`. Do not weaken the property (Req 22.5).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.7"] },
    { "id": 4, "tasks": ["2.3", "2.5", "2.8"] },
    { "id": 5, "tasks": ["2.4", "2.6", "2.9", "2.10"] },
    { "id": 6, "tasks": ["2.11"] },
    { "id": 7, "tasks": ["2.12"] },
    { "id": 8, "tasks": ["2.13"] },
    { "id": 9, "tasks": ["2.14", "2.15", "2.20", "2.23"] },
    { "id": 10, "tasks": ["2.16", "2.21"] },
    { "id": 11, "tasks": ["2.17", "2.22"] },
    { "id": 12, "tasks": ["2.18"] },
    { "id": 13, "tasks": ["2.19"] },
    { "id": 14, "tasks": ["4.1"] },
    { "id": 15, "tasks": ["4.2", "4.4"] },
    { "id": 16, "tasks": ["4.3"] },
    { "id": 17, "tasks": ["4.5", "4.7"] },
    { "id": 18, "tasks": ["4.6"] },
    { "id": 19, "tasks": ["5.1", "5.3"] },
    { "id": 20, "tasks": ["5.2"] },
    { "id": 21, "tasks": ["5.4", "5.5", "5.6", "5.7"] },
    { "id": 22, "tasks": ["5.8", "5.10", "5.14"] },
    { "id": 23, "tasks": ["5.9", "5.11"] },
    { "id": 24, "tasks": ["5.12", "5.15"] },
    { "id": 25, "tasks": ["5.13", "5.16", "5.17", "5.18"] },
    { "id": 26, "tasks": ["5.19"] },
    { "id": 27, "tasks": ["5.20", "5.39"] },
    { "id": 28, "tasks": ["5.21", "5.32", "5.33", "5.35", "5.36", "5.38", "5.40"] },
    { "id": 29, "tasks": ["5.22", "5.34", "5.37", "5.41"] },
    { "id": 30, "tasks": ["5.23", "5.42"] },
    { "id": 31, "tasks": ["5.24", "5.43", "5.44"] },
    { "id": 32, "tasks": ["5.25", "5.45"] },
    { "id": 33, "tasks": ["5.26"] },
    { "id": 34, "tasks": ["5.27"] },
    { "id": 35, "tasks": ["5.28"] },
    { "id": 36, "tasks": ["5.29"] },
    { "id": 37, "tasks": ["5.30"] },
    { "id": 38, "tasks": ["5.31"] },
    { "id": 39, "tasks": ["5.46", "5.47"] },
    { "id": 40, "tasks": ["5.48", "7.1"] },
    { "id": 41, "tasks": ["5.49", "7.2"] },
    { "id": 42, "tasks": ["5.50", "7.3"] },
    { "id": 43, "tasks": ["7.4", "7.8", "7.12", "7.13", "7.14"] },
    { "id": 44, "tasks": ["7.5", "7.9"] },
    { "id": 45, "tasks": ["7.6", "7.10"] },
    { "id": 46, "tasks": ["7.7", "7.11"] },
    { "id": 47, "tasks": ["8.1"] },
    { "id": 48, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 49, "tasks": ["8.5"] },
    { "id": 50, "tasks": ["8.6"] },
    { "id": 51, "tasks": ["8.7"] },
    { "id": 52, "tasks": ["8.8"] },
    { "id": 53, "tasks": ["8.9", "8.15"] },
    { "id": 54, "tasks": ["8.10"] },
    { "id": 55, "tasks": ["8.11"] },
    { "id": 56, "tasks": ["8.12"] },
    { "id": 57, "tasks": ["8.13"] },
    { "id": 58, "tasks": ["8.14"] },
    { "id": 59, "tasks": ["10.1", "10.3"] },
    { "id": 60, "tasks": ["10.2", "10.4", "10.5"] },
    { "id": 61, "tasks": ["11.1"] },
    { "id": 62, "tasks": ["11.2"] },
    { "id": 63, "tasks": ["11.3"] },
    { "id": 64, "tasks": ["12.1", "12.2"] }
  ]
}
```
