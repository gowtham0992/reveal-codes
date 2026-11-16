# Implementation Plan: case-match

## Overview

The work follows the order of Requirement 16, criterion 4: the Engine, the Verifier and the MCP server, the Pane, page and Issues region, the Statement, the Sentinel, the Avianca sample, the recording script and its tests, the recording (a stop-and-report gate), the documentation, and one final checkpoint. All code is TypeScript 5.x in strict mode, as the design uses TypeScript throughout.

The spec files are committed by the orchestrator before any task runs (Requirement 16, criterion 2). No task commits or pushes.

Conventions for every task:

- Property tests use fast-check with vitest, one `fc.assert(fc.property(...))` per property, in `case-match.properties.test.ts` of the owning package, with `// Property N` above it and `_Requirements: x.y_` in the describe title (design D9). Property numbers are scoped to this spec.
- A failing property is fixed in the code, never weakened. A shrunk counterexample becomes a named example test.
- No `try/catch` that swallows errors, no snapshot tests of the Engine, no test that only imports a module.
- An existing test whose expected outcome changes is edited in the task that changes it and listed in that task's BUILD_LOG note (Requirement 13, criterion 9). Task 13.3 collects the list.
- Functions stay under 40 lines and modules under 300 lines. No `any`, named exports only.

## Tasks

- [x] 1. Engine: cited name, `wrong_case` status and Reveal Codes form (Requirements 1 to 3)
  - [x] 1.1 Record the cited name in the Extractor and in carry-over
    - Add `caseName?: string` to `ExtractedCitation` in `packages/engine/src/types.ts`.
    - Create `packages/engine/src/citations/cited-name.ts` with `citedNameFor(text, start)`, built from `tailComma`, `strictName` and `tolerantName`. `strictName` uses `partyStartFor` and `isCaseName` plus the new In_Re_Name rule from the design. `tolerantName` is the Tolerant_Read of the design and runs only when `strictName` finds nothing: it scans left from the tail comma over Name_Tokens (with one trailing comma after a period-ending token), digits, the Connectors `of`, `the`, `and`, `for`, `&`, `de`, `la`, exactly one `v.` and the `In re` pair, stops at a line break, a second `v.` or any other token, trims leading `PARTY_STOP_LIST` entries and `CONNECTORS` (read from `party.ts`, which is not edited), and accepts only a result with `v.` and a token on each side or one that begins `In re` or `In Re`. Every `caseName` is at most 164 code units.
    - Edit no file in `citations/` other than `extract.ts` and the new module(s). `party.ts` and `case-name.ts` are not changed. If the module nears 300 lines, move `tolerantName` and its helpers to a new `cited-name-tolerant.ts`.
    - In `citations/extract.ts`, set `caseName` with a conditional spread for Full_Citations only, inside `extractFromMatches`, so `matchesOf` and the incremental rescan are unchanged.
    - In `anchor.ts`, add `prev.caseName === c.caseName` to `citationCarries`.
    - Keep `extract` total and keep every other extracted field identical.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15_

  - [x] 1.2 Add the `wrong_case` status and `CIT ≠` Issue code
    - Add the `wrong_case` variant to `VerificationResult` and `"CIT ≠"` to `IssueCode` in `types.ts`.
    - In `verification.ts`, turn `badVerificationField` into a table keyed by status with no `default` branch, validate `clusterId`, `foundName` and `foundYear` (1000 to 9999), treat `wrong_case` like `verified` for `not_verifiable`, and keep `statusChanged` Override behaviour.
    - In `issues.ts`, retype `FULL_CODES` over the non-`verified` statuses and add `wrong_case: "CIT ≠"`.
    - Fix every other `switch` or table over the status or code union in the Engine so `pnpm typecheck` passes.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [x] 1.3 Add `CIT ≠` to the Reveal Codes form
    - `codes/syntax.ts`: `CODE_NAMES.citWrongCase = "CIT ≠"`.
    - `codes/lex.ts`: schema with required `k` and optional `cl`, `nm`, `yr`, and `OPENS` entry `cit`.
    - `codes/decode-types.ts`, `decode.ts`, `build.ts`: decode and build the `wrong_case` result, replacing the `default` branch of `decodeStatus` with explicit cases.
    - `codes/check-citations.ts`: `bad_field` for a bad `clusterId`, `foundName` or `foundYear`; `short_form_code` and unlisted-Lexis rules cover `wrong_case`.
    - `codes/render.ts`: full form `[CIT ≠{k=…;cl=…;nm=…;yr=…}]` (omit `yr` when absent), display form `[CIT ≠]`, Short_Form with key only, Override directly after the opener.
    - Update the existing engine tests that enumerate the code names or statuses, if any, and note them for BUILD_LOG.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 3.10_

  - [x] 1.4 Extend the shared arbitraries and the engine inventory test
    - In `packages/engine/src/testing/arbitraries.ts` add `arbPartyWords(pool)`, `arbCaseName(pool)`, `arbInReName`, `arbLeadIn`, `arbNameVariant(name)` (excluding initialisms equal to a Dropped_Word or one of the thirty table keys, design D10), `arbDisjointNames`, `arbFoundName` and `arbWrongCaseResult`.
    - For Property 3 also add `arbUnlistedAbbreviation` (a capital, three to six lower-case letters and a period, filtered against the Engine's Legal_Abbreviation index, optionally followed by a comma when not the last word), `arbContraction` (`Dep't`, `Ass'n`, `Comm'r`, `Int'l`, `Nat'l`, `Gov't`, or a generated capital-apostrophe form), `arbTolerantCaseName(pool)` (party words from the three sources and the Tolerant_Read Connectors, at most 164 code units) and `arbNameBoundary` (empty, a line break, or a lowercase non-Connector word and a space, so the left edge of the scan is the left edge of the name).
    - Extend the existing document and verification-result arbitraries so some Full_Citations carry `wrong_case` results.
    - Update `packages/engine/test/inventory.test.ts` to skip files named `case-match.properties.test.ts`. The check of this spec's markers is the one aggregate inventory test of task 13.6, which requires all eighteen.
    - Confirm the existing extraction, strip, render-order and incremental-equals-full properties pass unedited.
    - _Requirements: 13.3, 13.9, 1.10, 3.3, 3.4_

  - [x]* 1.5 Write property test for the cited name
    - Create `packages/engine/test/case-match.properties.test.ts`.
    - **Property 3: The cited name is read back**
    - Generate names with `arbTolerantCaseName` (unlisted dotted abbreviations and apostrophe contractions as well as listed forms), `arbInReName`, `arbLeadIn` and `arbNameBoundary`, and assert the `caseName` equals the name as written, without lead-in and closing comma, and is at most 164 code units.
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.13, 1.14, 1.15**

  - [x]* 1.6 Write property test for carry-over of `caseName`
    - **Property 4: A kept citation keeps its name**
    - **Validates: Requirements 1.9, 1.11**

  - [x]* 1.7 Write property test for `wrong_case` blocking export
    - **Property 5: `wrong_case` blocks export until overridden**
    - **Validates: Requirements 2.6, 2.7, 2.8, 2.11**

  - [x]* 1.8 Write property test for malformed `wrong_case` results
    - **Property 6: A malformed `wrong_case` result is rejected and named**
    - **Validates: Requirements 2.3, 2.4, 2.5**

  - [x]* 1.9 Write property test for Override survival
    - **Property 7: An Override survives only an unchanged status**
    - **Validates: Requirements 2.9**

  - [x]* 1.10 Write property test for Short_Forms of a `wrong_case` target
    - **Property 8: A Short_Form follows a `wrong_case` target**
    - **Validates: Requirements 2.10, 3.2**

  - [x]* 1.11 Write property test for the Reveal Codes round trip
    - **Property 2: Reveal Codes round trip with `wrong_case`**
    - **Validates: Requirements 3.1, 3.5, 3.8**

  - [x]* 1.12 Write engine example tests
    - An In_Re_Name with commas (`In re Air Crash Disaster Near New Orleans, LA`) read from text written for the test.
    - Exact full and display strings of `[CIT ≠]` for the Ashcroft payload, and the tamper cases `bad_field` and `short_form_code`.
    - A `caseName` change resets the result to `unchecked` and drops the Override.
    - `parse` of an appendix containing `[CIT ≠…]` succeeds.
    - The Tolerant_Read on the Demo_Motion text: Alvarez gives `Alvarez v. Cascade Residential Mgmt., LLC` and Okafor gives `Okafor v. Lindqvist Props.`; Ashcroft, Haines and Brennan still give their Strict_Read names unchanged.
    - The Tolerant_Read on a name after a sentence that ends just before it (`The Court said so in Twombly. Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662, 678 (2009)`): the `caseName` is `Twombly. Alvarez v. Cascade Residential Mgmt., LLC`, so the extra word sits in the first party and the second party's words are those of the name as written.
    - The Tolerant_Read gives no `caseName` for: text with no `v.`, text with nothing left of `v.`, a name cut by a line break so that no `v.` remains, and a run longer than 164 code units. A second `v.` ends the scan (`Smith v. Jones v. Brown Mgmt.` gives `Jones v. Brown Mgmt.`). A name the Strict_Read reads is returned unchanged, unless the tolerant result is longer, ends with it, and the words it adds on the left contain no token ending in a period (rule A: `Aaaa. Aaaa v. Dep't` gives `Aaaa v. Dep't`, `Nnnn de Bbbb v. Nnnn` gives the full name, and a prior sentence inserted before `Intro. Roe v. Wade, …` leaves `Roe v. Wade`); a tolerant result that is not such an extension never replaces it.
    - `Dep't of Homeland Sec. v. Regents of the Univ. of Cal.` after a line break reads as that exact string.
    - _Requirements: 1.4, 1.11, 1.13, 1.14, 1.15, 3.1, 3.6, 3.7, 13.5_

- [x] 2. Checkpoint - Engine complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Verifier and MCP: name rule, lookup rule, cache, verify route and `lookup_citations` (Requirements 4 and 5)
  - [x] 3.1 Implement name matching
    - Create `packages/verifier/src/name-expansion.ts` (the thirty table entries of Requirement 4, criterion 4, that is the seventeen first listed and `mgmt`, `assn`, `intl`, `natl`, `bros`, `univ`, `hosp`, `auth`, `cnty`, `commn`, `props`, `cos` and `assocs`; Dropped_Words; Initials_Skip_Words), `name-normalise.ts` (`prepareName`, `splitParties`), `name-initials.ts` (`initialisms`, `initialismMatch`) and `name-match.ts` (`namesMatch(cited, found: readonly string[])`).
    - No I/O, no clock, no `node:` import. Each module under 300 lines.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.13_

  - [x] 3.2 Implement the verifier rule, Display_Info, link and cache change
    - Create `clusters.ts` (`ClusterData`, `clusterDataByIndex`, `foundNames`, `foundYear` per design D5), `judge.ts` (`judgeRecords`, `DisplayInfo`) and `link.ts` (`COURTLISTENER_ORIGIN`, `isSafeAbsoluteUrl`, `isDisplayInfo`, `courtListenerLink`).
    - In `lookup.ts` add `lookupWithInfo` and keep `lookup` as a wrapper returning `lookupWithInfo(records, deps).then((o) => o.results)`, so `lookup` applies the comparison and every caller of it (the MCP tool, the Sentinel) receives `wrong_case`. Add `isCachedLine` so a cached `verified` entry without `cluster` is a miss; leave `isTerminalResult`, `map-status.ts`, `combineParallel`, `chunk.ts`, `bucket.ts`, `transport.ts` and `request.ts` unchanged.
    - Export the new items from `index.ts` and add the browser-safe `@reveal-codes/verifier/link` subpath in `package.json` exports.
    - The request body stays the formatted Citation_Lines only.
    - Update existing verifier tests that assert exact cache entries, if any, and note them for BUILD_LOG.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.14, 7.4, 15.7_

  - [x] 3.3 Carry `caseName` and Display_Info through the verify route and client
    - In `apps/web/src/server/verify-route.ts` accept an optional `caseName` string of at most 200 code units (400 with the existing fixed message otherwise), call `lookupWithInfo`, and answer `{ results, info }` (design D4).
    - In `apps/web/src/client/api.ts` update the response guard to accept `wrong_case` with its field checks, reject other unknown statuses, and validate `info` items with `isDisplayInfo`.
    - Update the verify flow in `apps/web/src/client/verify-flow.ts` to send `caseName` from each record and return `info` beside the results.
    - Update any privacy copy that says only citation strings leave the browser (design D12).
    - Edit the existing verify-flow and api tests that build a verify response, and note them for BUILD_LOG.
    - _Requirements: 5.10, 5.11, 2.12, 13.9_

  - [x] 3.4 Update the verifier inventory test
    - Make `packages/verifier/test/inventory.test.ts` skip files named `case-match.properties.test.ts`.
    - The check of this spec's markers is the one aggregate inventory test of task 13.6, which requires all eighteen.
    - _Requirements: 13.1, 13.9_

  - [x]* 3.5 Write property test for name matching
    - Create `packages/verifier/test/case-match.properties.test.ts`.
    - **Property 1: Name matching**
    - **Validates: Requirements 4.2, 4.5, 4.6, 4.7, 4.8, 4.10, 4.12, 4.13**

  - [x]* 3.6 Write property test for the verifier rule
    - **Property 9: The verifier rule**
    - Include the clause that `lookup` returns a map equal to the `results` of `lookupWithInfo` for the same records and fixture `fetch`.
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.14**

  - [x]* 3.7 Write property test for cache hits
    - **Property 10: A cache hit gives the live result**
    - **Validates: Requirements 5.7**

  - [x]* 3.8 Write property test for the lookup request body
    - **Property 11: The lookup request carries no case name**
    - **Validates: Requirements 5.6, 15.7**

  - [x]* 3.9 Write property test for Display_Info derivation
    - **Property 12: Display_Info derivation**
    - **Validates: Requirements 5.8, 5.9**

  - [x]* 3.10 Write property test for link construction
    - **Property 13: CourtListener link construction**
    - **Validates: Requirements 7.4**

  - [x]* 3.11 Write verifier and route example tests
    - The three name pairs of Requirement 4 (NLRB, SEC, `U.S.`) and the spaced `U. S.` form.
    - A name that matches only through `case_name_full` or `case_name_short`.
    - Henderson and Ashcroft in one Document on one lookup line get separate results.
    - The lookup request body holds no case name; a cached `verified` entry without cluster data is a cache miss.
    - The route accepts an absent `caseName` and a 200-unit string, and answers 400 for a 201-unit string and for a number.
    - `Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662, 678 (2009)` read by the Extractor and looked up with `createFixtureFetch` gives `wrong_case` against the recorded Iqbal fixture (`foundName` `Ashcroft v. Iqbal`, `foundYear` 2009), and the same text without the name gives `verified`.
    - `namesMatch` of the `caseName` the Extractor reads from `See Dep't of Homeland Sec. v. Regents of the Univ. of Cal., 591 U.S. 1 (2020)` against `["Department of Homeland Security v. Regents of Univ. of Cal."]` is `true`. The hand work in the design found no gap; if this test fails, report the failing party and word and stop, do not change the rule to make it pass.
    - A name that follows a sentence ending just before it (`The Court said so in Twombly. Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662, 678 (2009)`) still gives `wrong_case` against the Iqbal fixture, with the second party's words unchanged in the `caseName`.
    - `lookup` called directly (not `lookupWithInfo`) returns `wrong_case` for the Henderson record.
    - _Requirements: 4.11, 5.4, 5.6, 5.7, 5.10, 5.14, 12.7, 13.5, 13.6_

  - [x] 3.12 Report the wrong case and the cited name from the MCP tool
    - In `packages/courtlistener-mcp/src/tools/lookup-citations.ts`, change `describeDoc` only: add `caseName` to each citation it describes with a conditional spread (`...(r.citation.caseName === undefined ? {} : { caseName: r.citation.caseName })`), so the key is absent when no name was read and is never present on a Short_Form or Other_Reference. Do not change `buildDocs`, `prefixed`, `applyResults` or the call to `lookup`: the records already carry `caseName`, and `lookup` applies the rule (task 3.2).
    - In `packages/courtlistener-mcp/src/server.ts`, extend the `lookup_citations` description with `and the case name read before each full citation`. Check that `server.test.ts` and `stdio.test.ts` do not assert the old description text, and note any edit for BUILD_LOG.
    - The package has no output schema and no `switch` over verification statuses, so no exhaustive-case edit is needed; confirm with `pnpm typecheck`.
    - _Requirements: 5.12, 5.13, 5.14_

  - [x] 3.13 Write MCP server tests for the wrong case and the cited name
    - In `packages/courtlistener-mcp/test/tools.test.ts`, add a describe titled `lookup_citations case match _Requirements: 5.12, 5.13_` that calls the tool through the existing harness with the recorded fixtures.
    - `Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009)` returns a Full_Citation whose `result` is `{ status: "wrong_case", clusterId: "145875", foundName: "Ashcroft v. Iqbal", foundYear: 2009 }` and whose `caseName` is `Henderson v. Pacific Housing Authority`.
    - `556 U.S. 662` alone returns `{ status: "verified", clusterId: "145875" }` and has no `caseName` key.
    - A text holding `Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009). Id. at 680.` returns `verified` with `caseName` `Ashcroft v. Iqbal` on the Full_Citation and no `caseName` key on the Short_Form.
    - Leave the existing tests of the package unedited; they must still pass.
    - _Requirements: 5.12, 5.13, 13.5_

- [x] 4. Checkpoint - Verifier and MCP complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Web: Pane, page underline, Issues region and Resolved list (Requirements 6 and 7)
  - [x] 5.1 Add `CIT ≠` to the Pane, the Legend and the page marks
    - `pane/failing.ts`: add `"CIT ≠"` to `FAILING_OPENERS`.
    - `pane/layout.ts`: family `failed` and the plain-words text `Citation is a different case`.
    - `pane/pane-header.tsx`: Legend entry `[CIT ≠]` `wrong case`, failing, directly after `[CIT ✘] not found`.
    - `editor/marks.ts`: add `"CIT ≠"` to the mark code and `isMarked`; hover title `This citation is <foundName> (<foundYear>)`, or without the year.
    - No colour literal, Token, icon or new style. Edit existing tests that enumerate the Legend or the failing opener set and note them for BUILD_LOG.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 13.9_

  - [x] 5.2 Add the Citations tally term, session state and Resolved list selection
    - `client/verify-summary.ts`: add `wrong_case` to `CitationTally`, `tallyDocument`, `NO_CITATIONS`, and the `Citations:` line order found, wrong case, not found, ambiguous, not checked, omitting zero terms.
    - `use-verify.ts`: keep `ResolvedSession` (`null` on mount, set on a `completed` run, unchanged otherwise) and expose `resolved` on `VerifyControl`.
    - Create `client/resolved.ts` with `resolvedRows(doc, session, currentEpoch)` as specified, using `courtListenerLink` from `@reveal-codes/verifier/link`.
    - Edit existing verify-summary tests and tests that enumerate the five statuses, and note them for BUILD_LOG.
    - _Requirements: 7.5, 7.6, 7.9, 7.12, 7.13, 7.14, 7.15, 7.17, 2.12, 13.9_

  - [x] 5.3 Show the `wrong_case` row, the link, the Export dialog words and the Resolved list
    - `components/issues-list.tsx`: `SEVERITY["CIT ≠"] = "wrong case"`, the `This citation is …` line, the CourtListener_Link (`target="_blank"`, `rel="noreferrer"`), exported `issueWords(code, blocking)`.
    - `components/export-issues.tsx`: use `issueWords` and show the chip `CIT ≠`.
    - Create `components/resolved-list.tsx` and its CSS module; render it below the Issues list in `issues-region.tsx` with heading `Resolved citations`, no `Override…`, no `Go`, no effect on the blocking count, Export button, Next_Step or `No issues.` line.
    - Use only existing Tokens and the existing link colour; no exclamation mark, icon or emoji.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7, 7.8, 7.10, 7.11, 7.13, 7.14, 7.16, 7.17, 7.18_

  - [x]* 5.4 Write property test for Resolved list selection
    - Create `apps/web/test/case-match.properties.test.ts`.
    - **Property 16: Resolved list selection**
    - **Validates: Requirements 7.5, 7.12, 7.13, 7.14, 7.15, 7.17**

  - [x]* 5.5 Write property test for the Citations line
    - **Property 17: The `wrong case` term of the Citations line**
    - **Validates: Requirements 7.9**

  - [x]* 5.6 Write web example tests
    - Legend entry and order, page mark title with and without year, plain-words description.
    - Issues row text, link `href`/`target`/`rel`, link built from `clusterId` with no `absoluteUrl`, the row after a reload, the Export dialog row.
    - Resolved list hidden before a Verify_Run, rows after, absent when no `verified` citation, no effect on blocking count, Export button, Next_Step or `No issues.`.
    - _Requirements: 6.3, 6.4, 6.5, 7.1, 7.2, 7.4, 7.7, 7.8, 7.10, 7.12, 7.13, 7.16, 7.17, 13.5_

- [x] 6. Checkpoint - Web display complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Statement and Appendix (Requirement 8)
  - [x] 7.1 Add `wrong_case` to the Statement
    - `packages/export/src/types.ts`: add `foundName?` and `foundYear?` to `StatementCitation`.
    - `wording.ts`: `CITATION_CODES` const object, `CitationCounts` with `wrongCase`, the new five-term sentence, `citationStatusCell`.
    - `statement-parts.ts` and `render-statement.ts`: fill the new fields from the Document, count `wrong_case` in its own term, use `citationStatusCell` and the cluster id cell. No new column, no network call.
    - Edit `packages/export/test/render-statement.test.ts`, `packages/export/test/null-order.test.ts` and `apps/web/test/export-flow.test.tsx` for the new paragraph, and note them for BUILD_LOG.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 3.9, 13.9_

  - [x]* 7.2 Write property test for Statement counts and the Status cell
    - Create `packages/export/test/case-match.properties.test.ts`.
    - **Property 14: Statement counts and status cell**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x]* 7.3 Write Statement example tests
    - Statement paragraph, Status cell with and without year, Overrides table row with `CIT ≠`, DOCX builder and `/print` view show the new blocks.
    - _Requirements: 8.1, 8.4, 8.5, 8.7, 13.5_

- [x] 8. Sentinel (Requirement 9)
  - [x] 8.1 Report `wrong_case` drift in the Sentinel
    - `crew/sentinel/src/status-text.ts`: `wrong_case <clusterId> <foundName>`.
    - `findings.ts`: export `citationDiffers` with the rule that a status change is a finding, and two `verified` or two `wrong_case` results differ only by cluster id.
    - Leave `reverify.ts`, `recorded.ts`, `split.ts` and `analyse.ts` unchanged.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 2.12_

  - [x]* 8.2 Write property test for the Sentinel finding rule
    - Create `crew/sentinel/test/case-match.properties.test.ts`.
    - **Property 15: Sentinel finding rule**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5**

  - [x]* 8.3 Write Sentinel example tests
    - `verified` to `wrong_case`, `wrong_case` to `verified`, an appendix containing `CIT ≠` parses, and a pre-spec filing yields no finding and no error.
    - _Requirements: 9.2, 9.3, 9.7, 9.8, 13.5_

- [x] 9. Avianca sample and empty-page links (Requirement 10)
  - [x] 9.1 Add the Avianca sample and copy it to `public`
    - Create `packages/engine/fixtures/avianca-citations.txt` with exactly the text in the design: the first paragraph (one line, exactly as Requirement 10, criterion 1) and one blank line, the four citation lines, the paragraph `The citation above and the one below share a name. The one above is invented. The one below is the real decision of the Supreme Court.`, the Zicherman 516 U.S. 217 line, the line `A second real decision, for comparison:`, and the Chambers line, with the blank lines the design shows.
    - If the extraction example test of task 9.3 shows that any line reads differently from the six expected Full_Citations and their `caseName` values, report which line and why BEFORE changing the sample text, and do not change the Extractor, the Tolerant_Read or the text to make it pass without that report.
    - Update `apps/web/scripts/copy-demo.ts` to copy both files byte for byte when called with no argument, keeping the explicit-argument behaviour; add `apps/web/public/avianca-citations.txt` to `.gitignore`.
    - Add a line for the new fixture in the engine fixtures README, with source and date.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.15_

  - [x] 9.2 Add the sample action and the empty-page links
    - `client/api.ts`: add `aviancaCitations` next to `demoMotion`.
    - `use-document-actions.tsx`: generalise the demo action to a `sample` action keyed `"demo" | "avianca"`, same one-`PST`-span path, and the failure notice `The Avianca citations could not be loaded. Your document is unchanged.`
    - `components/editor-surface.tsx` (and its CSS module): while the text is empty show the two links `Load demo motion` and `Load the Avianca citations` as focusable `a` elements outside the `aria-hidden` placeholder, with the link colour and no icon; render neither when text exists.
    - Leave the Toolbar unchanged.
    - _Requirements: 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13_

  - [x]* 9.3 Write Avianca example tests
    - The Extractor returns exactly six Full_Citations from the sample, each with its own `caseName` (`Varghese v. China Southern Airlines Co., Ltd.`, `Petersen v. Iran Air`, `Miller v. United Airlines, Inc.`, `Zicherman v. Korean Air Lines Co., Ltd.`, `Zicherman v. Korean Air Lines Co.`, `Chambers v. NASCO, Inc.`), and none from the first paragraph: `Mata v. Avianca, Inc., No. 22-cv-1461 (S.D.N.Y. 2023)` and `ECF 54 at 7` yield no citation, and no `caseName` begins in or reaches back across a blank line into the explanatory sentences. If any line reads differently, stop and report which line and why before changing the text (Requirement 10, criterion 15).
    - `copy-demo.ts` copies the sample byte for byte.
    - Empty-page links: order, keyboard focus, not `aria-hidden`, absent when text exists, load behaviour, failure notice.
    - _Requirements: 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.15, 13.5_

- [x] 10. Recording script and its tests (Requirement 11)
  - [x] 10.1 Write the recording script
    - Create `packages/verifier/scripts/record-lookups.ts` with `trimEntry`, `recordLookups`, `checkExpected` and `main`; add `scripts` to `packages/verifier/tsconfig.json` `include`.
    - `main` is the only reader of `COURTLISTENER_TOKEN`; it prints one line and exits 1 before any request when it is unset. The token is never printed, logged or written.
    - Request the seven lines in one chunk using `buildLookupRequest`. Dry run by default; with differences exit 2 and write nothing; with `--write` and no differences write `fixtures/lookup/<slug>.json` for the six new lines only. Never record `360 N.J. Super. 360` or `821 F.2d 1147`.
    - Report, for each of the seven lines, status, cluster id, found name, rule outcome, and for `556 U.S. 662` whether the live entry `matches` or `differs` from the committed fixture.
    - `fetch` is injected; no network in tests.
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6, 11.8, 11.9, 11.10, 11.11_

  - [x] 10.2 Add the fixture credential scan
    - Add a test under `packages/verifier/test/` that reads every file under `packages/verifier/fixtures/` and fails when any contains a `Token ` or `Bearer ` credential value or the word `authorization` in any case.
    - _Requirements: 11.3_

  - [x]* 10.3 Write property test for credential-free recordings
    - **Property 18: Recorded fixtures carry no credentials**
    - **Validates: Requirements 11.2, 11.5, 11.11**

  - [x]* 10.4 Write recording script example tests
    - A missing token exits with code 1 and makes no request.
    - `checkExpected` reports a changed status, cluster id or rule outcome.
    - The `556 U.S. 662` comparison reports `matches` and `differs`.
    - `trimEntry` keeps exactly the identifying fields.
    - _Requirements: 11.2, 11.4, 11.5, 11.8, 11.10, 13.5_

- [x] 11. Checkpoint - Everything before the recording passes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Recording gate (Requirement 11, Requirement 12)
  - [x] 12.1 Run the recording dry run and stop or report
    - This task is a stop-and-report gate. Do not edit code, the sample, the rule, the Expected_Outcomes or any fixture in it.
    - Check whether `COURTLISTENER_TOKEN` is set in the shell. If it is absent, stop and tell the user to run `pnpm --filter @reveal-codes/verifier exec tsx scripts/record-lookups.ts` (dry run first, then `--write`) in their own terminal, with the token in their environment. Do not ask for the token and do not read `.env`.
    - If the token is present, run the script as a dry run and report, for each of the seven lines, the status, cluster id and found name. If any result differs from the Requirement 12 table (a status, a cluster, or a name that makes the rule give a different outcome, including a Petersen or Miller name that would give `verified`), report the difference and stop. Do not change the sample, the rule, the Expected_Outcomes or the fixtures to make a result fit.
    - _Requirements: 11.4, 11.9, 11.10, 11.11, 12.2, 12.5_

  - [x] 12.2 Write and wire the six recorded fixtures
    - Only after 12.1 reports no difference: run the script with `--write` (or commit the fixtures the user recorded).
    - Add one manifest entry per fixture (`source` `courtlistener-live`, recording date, note), one line each in `packages/verifier/fixtures/README.md`, and route each in `fixtures.ts`.
    - Re-check every count asserted by `packages/verifier/test/fixtures.test.ts` and `demo-corpus.test.ts` and edit them for the six added entries; note the edit for BUILD_LOG. Confirm the credential scan of 10.2 still passes.
    - _Requirements: 11.5, 11.7, 10.14, 13.9_

  - [x]* 12.3 Write worked-outcome example tests
    - One example per row of the design's worked-outcome tables, run against `createFixtureFetch` and the routed fixtures: the five Introduction rows, every Full_Citation and Short_Form of the Demo_Motion, the six Avianca citations, and every existing fixture line.
    - Henderson gives `wrong_case` and Ashcroft gives `verified` on `556 U.S. 662`; `1 Hill 150`, `576 U.S. 644` and the 404 lines keep their results with no name comparison.
    - The Demo_Motion's Alvarez and Okafor rows assert that each carries a `caseName` (`Alvarez v. Cascade Residential Mgmt., LLC` and `Okafor v. Lindqvist Props.`) and still gives `not_found`.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 13.5_

- [x] 13. Documentation and steering (Requirements 6, 8, 14)
  - [x] 13.1 Update the README
    - Add one line under "It checks citations and quotations" saying a citation must also name the case it points to, and one line in the demo path naming the Avianca sample. No exclamation mark or marketing text.
    - Edit the first bullet under "What leaves your machine" (the heading stays verbatim) to read: `Verify sends only citation records to this app's own server, and each record includes the case name written before the citation; from there only citation strings go to CourtListener. The rest of your draft text is not sent.` Keep the other bullets of the section as they are.
    - Check `apps/web/test/static/docs.test.ts` first: it matches `Verify sends only citation records to this app's own server` and `from there only citation strings go to CourtListener`, and both must still match. Add one assertion there that the section matches `each record includes the case name written before the citation`. Do not edit any other README test, and confirm the export-certification README test (one line saying exporting and printing send nothing) still passes.
    - _Requirements: 14.1, 14.6, 14.7_

  - [x] 13.2 Update `docs/CERTIFICATION.md`
    - Update the statement paragraph to the new five-term sentence and name the count of citations that resolved to a different case than the one named.
    - _Requirements: 8.9, 14.2, 14.6_

  - [x] 13.3 Add the BUILD_LOG entry
    - Add a dated entry that begins with the five-row table of the Introduction as the reason for the spec, then lists every existing test changed under Requirement 13, criterion 9 (collected from tasks 1.3, 3.2, 3.3, 3.12, 5.1, 5.2, 7.1, 12.2 and 13.1), and any finding of the recording task.
    - _Requirements: 14.3, 13.9_

  - [x] 13.4 Update `docs/KIRO_USAGE.md`
    - Add a row for this spec, a row for its `.config.kiro` and `tasks.meta.json` (where present), and a row for each steering file this feature edits (`product.md`, `citations.md`, `structure.md`).
    - Edit the `MCP | courtlistener` row: `lookup_citations` now reports `wrong_case` and returns the `caseName` it read, because `structure.md` asks for a line when an MCP tool changes.
    - _Requirements: 14.4_

  - [x] 13.5 Update the steering files
    - `.kiro/steering/product.md`: add the `[CIT ≠]` code line to the Citation codes, `wrong_case` to the verification status vocabulary, `CIT ≠` to the codes named in principle 4, and `CIT ≠` to the Failing_Block row of the Pane palette.
    - `.kiro/steering/citations.md`: add the comparison rule and the `wrong_case` mapping to the verification contract, and say that `lookup` applies the rule, so the MCP `lookup_citations` tool reports `wrong_case` too.
    - `.kiro/steering/structure.md`: add `scripts/` under `packages/verifier/` naming `record-lookups.ts`.
    - _Requirements: 6.7, 6.8, 14.5_

  - [x] 13.6 Add the aggregate property inventory test
    - Create `apps/web/test/static/case-match-inventory.test.ts`. It reads `.kiro/specs/case-match/design.md` and the five files `packages/engine/test/case-match.properties.test.ts`, `packages/verifier/test/case-match.properties.test.ts`, `packages/export/test/case-match.properties.test.ts`, `crew/sentinel/test/case-match.properties.test.ts` and `apps/web/test/case-match.properties.test.ts`.
    - It requires that the design holds exactly eighteen `### Property N` headings numbered 1 to 18 once each; that all eighteen `// Property N` markers are present across the five files, each exactly once, in the package the design's table assigns it to (engine 2 to 8, verifier 1, 9 to 13 and 18, export 14, Sentinel 15, web 16 and 17); that each marker is followed by exactly one `fc.assert(fc.property(...))`; and that each describe title ends in `_Requirements: x.y_`.
    - The test fails when any marker is missing, so skipping an optional property sub-task is caught here and at the final checkpoint, never silently.
    - _Requirements: 13.1, 13.2, 13.4_

- [x] 14. Final checkpoint
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `pnpm --filter @reveal-codes/web build` (the clean-checkout web build) and `pnpm kiro:check`, and fix any failure in the code, never in a test's meaning.
  - State in the report that the browser check and the push are left to the author. Do not push.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 16.5_

### Follow-up group: the browser walkthrough findings (Requirements 17 to 21)

Tasks 1 to 14 are complete and keep their checkboxes. The tasks below are new. They are written from the design section "Follow-up: walkthrough findings". No task commits or pushes. Each existing test that changes is edited in the task that changes it and listed in the BUILD_LOG entry of task 20.3.

- [x] 15. Empty-page links take a pointer click (Requirement 17)
  - [x] 15.1 Make the links the hit target and keep focus in the editor
    - In `apps/web/src/components/editor-surface.tsx` render the `samples` list after `<EditorContent>` inside `.page`, still only while `empty` and `onLoadSample` is given.
    - Add `onMouseDown` on each link that calls `e.preventDefault()`. Keep `onClick`'s `preventDefault` and the load call.
    - In `editor-surface.module.css` add `pointer-events: none` to `.samples` and a rule `.samples a { pointer-events: auto; display: inline-block; }`. Add no `z-index` anywhere (design D15: the Modal overlay has none, and a `z-index` on the list would lift it above the overlay). Add no colour literal, Token, outline or transition.
    - Before editing, confirm the cause by reading the stylesheet and TipTap's injected `.ProseMirror { position: relative }`, and record the one-sentence cause in the BUILD_LOG entry of task 20.3.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.9_

  - [x] 15.2 Add the static stylesheet test
    - In `apps/web/test/static/editor-surface-css.test.ts` add a describe titled `static: empty-page links _Requirements: 17.6_` with cases: `.samples` is `position: absolute` and has `pointer-events: none`; `.samples a` has `pointer-events: auto`; no declaration in `editor-surface.module.css` or `modal.module.css` sets `z-index`; no new `outline` or colour literal. Add a planted-violation case so the check is shown to fail on a `z-index` or a missing `pointer-events` rule.
    - State in a comment what the test cannot prove (that the browser applies the rules).
    - _Requirements: 17.6, 17.7_

  - [x] 15.3 Add the structure and event tests
    - In a new `apps/web/test/editor-surface-links.test.tsx` render `EditorSurface` (with the stub editor the existing editor-surface tests use) and assert: the list is not a descendant of the editor content element; it follows the editor content element in DOM order (`compareDocumentPosition`); it renders only while `empty` is true and `onLoadSample` is given; the two links are `a` elements named `Load demo motion` and `Load the Avianca citations` in that order.
    - Assert `fireEvent.mouseDown` on each link is default-prevented and `document.activeElement` is unchanged; a `click` and a keyboard activation each call `onLoadSample` with `"demo"` and `"avianca"`.
    - Add a comment that jsdom does no layout, so these tests cannot prove paint order, hit testing or a real browser's focus handling.
    - _Requirements: 17.3, 17.4, 17.5, 17.7_

- [x] 16. Page ranges and lists in a pincite (Requirement 18)
  - [x] 16.1 Read the Pincite_Expression and keep the value
    - Create `packages/engine/src/citations/pincite.ts` with `readPinciteExpression(text, at, { list, startsMember })` as designed: items `page [dash short]` with `-` or `–`, a shortened second number of one to five ASCII digits, at most five items and 24 code units, items after the first refused when `startsMember` is true or when they are a four-digit number from 1600 to 2999 followed by a space and an uppercase letter, an item accepted only when its last digit is not followed by a letter or number, and a failed `dash short` leaving the item as the page alone. No import from the other grammar modules.
    - Export `startsMember` from `grammar.ts` and use the new reader in `grammar.ts#readPincite` (`list: true`), in `grammar-short.ts` for `Id. at` and for the party tail (`list: true`; `first` becomes `pincite`, `end` the tail end), and in `grammar-db.ts#readPincite` (`list: false`, `startsMember: () => false`). Keep the existing `startsMember` check for the first item.
    - The value's `pincite` stays the First_Page. Do not change `types.ts`, `format.ts`, `codes/*` or `packages/verifier/src/lines.ts`. If an edit to any of them looks necessary, stop and report why before making it.
    - Update the header comments of the three grammar files with the new read bounds. Keep every function under 40 lines and each module under 300.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9, 18.10, 18.11, 18.17_

  - [x] 16.2 Extend the citation arbitraries
    - In `packages/engine/src/testing/arb-citation.ts` and `arb-text-builder.ts` add `arbPinciteExpression` returning `{ text, first }` (single page, range with `-` or `–` and a full or shortened second number, list of two to five items with items that would start a member or a database citation filtered out) and an option `pinciteStyle: "single" | "expression"` on the Full and Short_Form builders, defaulting to `"single"` so every existing property keeps its domain.
    - Opt the round-trip property (Property 2's domain) and the incremental-equals-full property in to `"expression"`. List both edits for the BUILD_LOG. Confirm the other existing extraction properties pass unedited.
    - _Requirements: 18.10, 18.11, 18.14_

  - [x]* 16.3 Write property test for the pincite expression
    - In `packages/engine/test/case-match.properties.test.ts` add `// Property 19` above one `fc.assert(fc.property(...))` and a describe title ending `_Requirements: 18.15_`.
    - **Property 19: A pincite expression extends the citation and leaves its value**
    - Generate a citation (reporter, parallel, database with a range, `Id.`, party Short_Form) with `arbPinciteExpression`, an optional parenthetical, and the single-page twin; assert equal citation counts, `c.text` equal to the whole written citation, and `c.value` structurally equal to the twin's value.
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5, 18.14, 18.15**

  - [x] 16.4 Write the pincite example tests
    - In a new `packages/engine/test/pincite.test.ts`: Miller (`Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999)` is one citation whose text is `174 F.3d 366, 371-72 (2d Cir. 1999)`, pincite 371, and `render(…, "display")` closes `[/CIT]` after `1999)`); `501 U.S. 32, 45-46 (1991)`; `516 U.S. 217, 220-21 (1996)`; an en dash with a full second number (`371–372`); a list (`678, 680-81`); `Id. at 678-79`; `Roe, 556 U.S. at 678-79`; a parallel citation with a range in two members; a list that stops before `, 93 S. Ct. 705` and before `, 2010 WL 123456`; `371-A`, `371-` and `371-72a` ending where they ended before the follow-up; a database `, at *5-6` read and `, at *5, 7` read as `, at *5` only; `normalised` recorded for a range; the incremental rescan equal to a full scan on a ranged text; the maximal four-member parallel citation with 40-code-unit reporters, five-item expressions and a parenthetical extracted whole and under 512 code units (if it is not, lower the 24 cap and report; do not raise `MAX_MATCH`).
    - Add a verifier example (`packages/verifier/test/lines.test.ts` or a new file) that `memberLines` of the ranged Miller text equals that of the single-page text.
    - Add an engine example that Reveal Codes written the old way (`[CIT ≠…]174 F.3d 366, 371[/CIT]-72 (2d Cir. 1999)`, with a valid `[DOC]` and spans) fail `parse` with `malformed_codes` and rule `extractor_mismatch`. Read the autosave load path from `persist.ts` onward and record in the BUILD_LOG what the author sees for a `bad_codes` draft.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 18.9, 18.11, 18.12, 18.16_

  - [x] 16.5 Re-check the Avianca sample and the worked outcomes
    - Edit `packages/engine/test/avianca.test.ts` so the Miller citation's text is `174 F.3d 366, 371-72 (2d Cir. 1999)` and the other five are unchanged, and edit `packages/verifier/test/worked-outcomes.test.ts` wherever it compares the Miller text. The lookup outcomes (`wrong_case`, cluster 3011108) do not change.
    - Check that `packages/engine/fixtures/avianca-citations.txt` is unchanged and that `501 U.S. 32` and `516 U.S. 217` in it still extract as before (the sample holds no range for them; the ranged forms are covered by task 16.4).
    - Run the engine and verifier suites and list every other test that fails because a citation now ends later. Edit only those whose expected text is wrong for the right reason, and list them for the BUILD_LOG; stop and report any test that fails for another reason.
    - _Requirements: 18.12, 18.13, 18.10_

- [x] 17. Checkpoint - Links and pincite complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Say what the mismatch is where the author decides (Requirement 19)
  - [x] 18.1 Add the shared lines and use them in the Issues row
    - Create `apps/web/src/client/mismatch.ts` with `mismatchOf(document, key)` and `mismatchLines(m)` and `apps/web/src/components/mismatch-lines.tsx` rendering the lines as `p` elements with a `className` prop.
    - `mismatchOf` returns `null` unless the key is a Full record with the status `wrong_case`; `cited` is `rec.citation.caseName ?? null` from the Document passed in; `found` is `<foundName> (<foundYear>)` or `<foundName>`. `mismatchLines` returns `Cited as <cited>` (only when not null) then `This citation is <found>`, with no trailing full stop.
    - In `issues-list.tsx` replace the `wrongCaseFor` line with these, keep the `CourtListenerLink` and `courtListenerLink` use, and place the two lines directly under the citation text. Keep the buttons, the severity words and the `Overridden:` line.
    - _Requirements: 19.1, 19.4, 19.5, 19.6, 19.7, 19.8_

  - [x] 18.2 Show the lines and the link in the Export dialog row
    - In `export-issues.tsx` render `MismatchLines` and the `CourtListenerLink` for a `wrong_case` row, after the severity words and before the actions. Add an optional `info` prop (the session's usable Display_Info) passed from `export-dialog.tsx` only if the dialog already has it; otherwise use the link built from `clusterId`. Add no new state.
    - Use the existing `text` class of `export-dialog.module.css`; add no colour literal.
    - _Requirements: 19.2, 19.7, 19.8_

  - [x] 18.3 Show the lines in the Override dialog
    - Add the prop `mismatch: readonly string[] | null` to `OverrideDialog` and render the lines inside the `describedBy` block between the issue text and the printed-statement line, above the reason box.
    - Compute it with `mismatchOf` and `mismatchLines` from the current Document in both `OverrideSlot` sites (`issues-region.tsx` and `export-dialog.tsx`), passing `null` when `mismatchOf` returns `null`.
    - _Requirements: 19.3, 19.4, 19.7, 19.8_

  - [x] 18.4 Write the mismatch tests
    - Add example tests: an Issues row shows `Cited as Henderson v. Pacific Housing Authority` then `This citation is Ashcroft v. Iqbal (2009)` under the citation text; the lines drop the year when `foundYear` is absent and drop the first line when the citation has no `caseName`; the Export dialog row shows both lines and the `View on CourtListener` link; the Override dialog for `CIT ≠` shows both lines before the reason textarea in DOM order; no line ends in a full stop; `mismatchOf` reads `caseName` from the Document passed in and returns `null` for a non-`wrong_case` key.
    - Edit the existing tests that match the exact paragraphs of a `wrong_case` row and list them for the BUILD_LOG. Run `copy-rules.test.ts` and `limits.test.ts` and keep them passing.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.8, 19.9_

- [x] 19. Role words do not count as shared words (Requirement 20)
  - [x] 19.1 Add the Role_Words to the Dropped_Words
    - In `packages/verifier/src/name-expansion.ts` add `plaintiff, plaintiffs, defendant, defendants, appellant, appellants, appellee, appellees, petitioner, petitioners, respondent, respondents, individually, deceased, no` to `DROPPED_WORDS`. Change no other word and no `NAME_EXPANSION_TABLE` entry.
    - _Requirements: 20.1, 20.2, 20.3_

  - [x] 19.2 Mirror the words in the engine arbitraries
    - In `packages/engine/src/testing/arb-case-match.ts` add the same fifteen words to `DROPPED`, export it, and keep the existing exclusion of initialisms equal to a Dropped_Word or table key (design D10) so Property 1's generator stays clear of the new words. Do not edit Property 1.
    - _Requirements: 20.4, 20.5_

  - [x] 19.3 Add the list-drift test
    - In the verifier tests add a test that the exported engine `DROPPED` list and `DROPPED_WORDS` hold exactly the same words (import the engine testing module the way `packages/verifier/test/case-match.properties.test.ts` does), with a planted-difference case showing it fails.
    - _Requirements: 20.4_

  - [x] 19.4 Write the role-word examples and re-run the worked outcomes
    - In a new `packages/verifier/test/role-words.test.ts`: `namesMatch("Kowalski, Appellant v. Quimby, Defendants", [the three names of the recorded 174 F.3d 366 fixture])` is `false`; a `lookupWithInfo` over the recorded fixture for a record whose `caseName` the Extractor reads from `Kowalski Appellant v. Quimby Defendants, 174 F.3d 366 (3d Cir. 1999)` gives `wrong_case` with cluster 3011108 (if the Extractor reads no name for that text, pick a text it reads and report the change); a cited party made only of Role_Words is skipped and the other party decides; `No.` in a cited name is dropped.
    - Run `worked-outcomes.test.ts` and `case-match.properties.test.ts` of the verifier. Report in the BUILD_LOG that Henderson, Petersen and Miller stay `wrong_case` and Ashcroft v. Iqbal, Haines v. Kerner, Zicherman (516 U.S. 217) and Chambers stay `verified`, or report any outcome that changes and stop.
    - _Requirements: 20.2, 20.3, 20.6, 20.7_

- [x] 20. Sentinel examples, inventory and documentation (Requirements 9, 21)
  - [x] 20.1 Add the two Sentinel examples for Requirement 9, criterion 8
    - In a new `crew/sentinel/test/pre-spec-filing.test.ts` (tests only; no Sentinel source changes) sweep a filing exported before this spec: one whose recorded `verified` citations still match the re-check data gives no finding and no error, and one whose recorded `verified` citation has a written name that now resolves to a different case gives one `citation_changed` finding with Before `verified <clusterId>` and After `wrong_case <clusterId> <foundName>`. Build both from the existing Sentinel test support and the recorded fixtures.
    - _Requirements: 9.8, 13.5_

  - [x] 20.2 Update the aggregate inventory test
    - In `apps/web/test/static/case-match-inventory.test.ts` change the engine entry of `OWNERS` to `[2, 3, 4, 5, 6, 7, 8, 19]`, and change every `18`, `eighteen` and `"1 to 18"` check and test title to nineteen and 1 to 19 (design headings, the table, the all-files list). Keep the self-test.
    - Confirm the design holds the heading `### Property 19:` and that the test fails if Property 19's marker or its engine file entry is removed.
    - _Requirements: 21.3_

  - [x] 20.3 Write the BUILD_LOG entry and update the steering file and usage doc
    - Add a dated BUILD_LOG entry: the four findings; the cause of the links (two positioned elements with `z-index: auto` painted in tree order, TipTap's `.ProseMirror { position: relative }`, and why jsdom tests could not see it); the fix and why no `z-index` was used; what the new link tests prove and cannot prove; whether any real-browser tooling exists in the repository (none was found in `apps/web/package.json`, and no dependency was added) and the manual check for the author (`pnpm dev`, `document.elementFromPoint` at the centre of each link returns an `A` element, click each link, click blank page next to the links and see the caret, press the mouse on a link with the caret in the page and see the caret stay); the pincite decision (the value does not change; only `end` moves; `normalised` is now set for a ranged citation); the old-codes consequence and what the author sees for a `bad_codes` draft; the role words and the unchanged outcomes; and every existing test edited in tasks 16.2, 16.5 and 18.4.
    - In `.kiro/steering/citations.md` add the Pincite_Expression rule (page, range with hyphen or en dash, list; value keeps the first page) and the Role_Words to the dropped words of the comparison rule.
    - In `docs/KIRO_USAGE.md` update the existing `citations.md` row to say the file now also records the Pincite_Expression rule and the Role_Words.
    - _Requirements: 17.8, 18.16, 21.4, 21.5_

- [x] 21. Final checkpoint
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `pnpm --filter @reveal-codes/web build` (the clean-checkout web build) and `pnpm kiro:check`, and fix any failure in the code, never in a test's meaning.
  - State in the report that the browser check (task 20.3's manual steps) and the push are left to the author. Do not push.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 21.6_

### Second follow-up group: CI reachability failure and the unreadable draft (Requirements 22 to 24)

Tasks 1 to 21 are complete and keep their checkboxes. The tasks below are new and written from the design section "Second follow-up". No task commits or pushes.

- [ ] 22. Reachability tests without a seed (Requirement 22)
  - [x] 22.1 Measure the kind frequencies before changing anything
    - Do this first, with no code changed. Write a throwaway script under `packages/engine/` (for example `measure-kinds.tmp.ts`), run it with the package's `tsx` runner, and delete it before the task ends. Do not commit it.
    - Draw 100,000 values of `arbTamperDocument.chain((d) => arbSemanticTamper(d))` with `fc.sample` (use 20,000 and say so if 100,000 takes more than about ten minutes). Print each `TamperKind` with its count and rate, sorted ascending, the number of members of `TAMPER_KINDS`, and `(1 - p)^1500` for the rarest kind. Print the same for the Syntax_Fault_Kinds over `arbDocument.chain((d) => arbSyntaxFault(render(d, "full").text))` and the share of draws with more than one fault.
    - Keep the numbers for the BUILD_LOG entry of task 24.2: the Rare_Kind, its count and rate, the miss probability over 1,500 draws, the kind count found in the tree (the author counted 22 in the failing run; report the difference if there is one), the fact that 1,500 is a literal `numRuns`, and that the syntax test used `max(runs().numRuns, 400)`.
    - _Requirements: 22.10, 22.11, 22.12_

  - [x] 22.2 Add the per-kind arbitraries
    - In `packages/engine/src/testing/arb-codes.ts` export `arbTamperOfKind(kind, doc)` (the builder's arbitrary for the Document, or `undefined`) and rewrite `arbSemanticTamper` to call it for each kind of `TAMPER_KINDS`, with the same distribution. Do not change the weights of `arbTamperDocument`.
    - In `arb-codes-syntax.ts` add `arbSyntaxFaultOf(rendering, kinds, { minFaults, maxFaults })` and make `arbSyntaxFault(rendering, maxFaults)` call it with all kinds and `minFaults` 1. Export both from `arbitraries.ts`. Keep each function under 40 lines and each module under 300.
    - Run the existing engine properties and confirm they pass unedited.
    - _Requirements: 22.1, 22.5, 22.9_

  - [-] 22.3 Add the Witness_Documents
    - Create `packages/engine/test/support/tamper-witnesses.ts` with `TAMPER_WITNESSES: Readonly<Record<TamperKind, Document>>` and a pure `missingWitnesses(kinds, witnesses)`. Read each builder in `arb-codes-tampers.ts`, `arb-codes-citations.ts` and `arb-codes-extractor.ts`, choose the smallest fixed Document on which it returns an arbitrary, and build it from fixed text with `createDocument` and fixed `setVerification` and `recordOverride` calls, not drawn state writes.
    - Add a second fixed Document with at least three cut points for the multi-fault test.
    - If the builder of any kind returns `undefined` for every Document you can construct, stop and report that kind. Do not drop it, lower the assertion or change the builder without the author's decision (Requirement 22, criterion 14).
    - _Requirements: 22.2, 22.14_

  - [~] 22.4 Rewrite the reachability tests
    - In `packages/engine/test/arb-codes.test.ts` keep the two random rejection properties and remove the `seen`, `kinds` and `multi` set assertions from them. Add `it.each(TAMPER_KINDS)` that asserts `arbTamperOfKind(k, TAMPER_WITNESSES[k])` is defined and, over `fc.assert` with `runs()`, that every value has `kind` `k` and that `parse` rejects with the recorded `index` and `rule`. Add `it.each(SYNTAX_FAULT_KINDS)` over `arbSyntaxFaultOf(..., [kind], { maxFaults: 1 })` asserting that every injected fault has that kind and that `parse` rejects with the recorded `index` and `rule`. Add the multi-fault test (`minFaults: 2` on the fixed Document, at least two injected faults).
    - Add the test that `Object.keys(TAMPER_WITNESSES)` equals `TAMPER_KINDS` as sorted lists, and an example test that `missingWitnesses` names a kind removed from a copy of the table.
    - Replace the seeded `ref_payload` test with the per-kind case for `ref_payload` (rule `bad_field`, text starting `[REF{k=k0}]` at the index), and replace the seeded reachability test in `packages/engine/test/codes.properties.test.ts` (line near 202) with a reference to the per-kind test. Do not weaken any assertion: every member of both exported lists must still be shown reachable.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7, 22.8_

  - [~] 22.5 Audit the other reachability tests
    - Search every package, `apps/web` and `crew/sentinel` for tests that collect kinds, statuses or codes over random runs and compare them with a list: `fc.sample(`, `new Set<` followed by an `fc.assert` callback that adds to it, and `.sort()).toEqual(` against an exported list. Read each hit.
    - Convert any whose draw is not seeded to per-kind draws as in task 22.4. Leave the seeded `fc.sample` checks (known: `arb-edit.test.ts` seeds 42, 7, 3 and 11, 13; `arbitraries.test.ts` seed 1; `arb-citation.test.ts`; `arb-segment-inputs.test.ts`; `arb-text-citations.test.ts`; `arb-api.test.ts`; `incremental.test.ts`; `rate-limit.properties.test.ts`) unless the audit shows one that is not deterministic.
    - Record in the BUILD_LOG entry of task 24.2 every test examined, with its seed or "unseeded", and what was done.
    - _Requirements: 22.8, 22.13_

- [ ] 23. An unreadable saved draft is never silently replaced (Requirement 23)
  - [x] 23.1 Add the Draft_Gate and make Autosave respect it
    - Create `apps/web/src/draft-gate.ts` with `createDraftGate()` (`blocked`, `block`, `release`, `subscribe`; notify only on a change).
    - In `apps/web/src/autosave.ts` add the optional `gate` dependency: `schedule` starts no timer and keeps no pending job while blocked, `write` drops a pending job while blocked, and `clear()` returns `boolean` (true when the key was removed; false after calling `onError`). With no gate the behaviour is unchanged.
    - _Requirements: 23.4, 23.20_

  - [x] 23.2 Block on load and move the autosave wiring into a plain function
    - In `apps/web/src/components/use-autosave.ts` give `loadAutosave(services, store, gate?)` the rule: a value is present and `deserialise` fails with any kind other than `absent` (`not_json`, `bad_shape`, `bad_codes`), call `gate?.block()`, leave the empty Document and write nothing. A thrown read leaves the gate open.
    - Move the subscription, the `visibilitychange` and `pagehide` listeners and the cleanup into an exported `startAutosave(services, store, autosave, gate)` that returns its stop function. `useAutosave(store, services, autosave, gate)` calls it from its effect. Below `NARROW_WIDTH` nothing is read or blocked.
    - In `app-shell.tsx`, `useShellParts` creates the gate, passes it to `createAutosave` and `useAutosave`, and returns it.
    - _Requirements: 23.1, 23.2, 23.3, 23.19, 23.20_

  - [x] 23.3 Add the saved-copy helper, the download media type and the notices
    - In `apps/web/src/client/download.ts` give `browserDownload` an optional `mime` argument (default `DOCX_MIME`), and give `AppServices["download"]` in `services.ts` the same optional third parameter; pass it through in `defaultServices`.
    - Create `apps/web/src/saved-draft.ts` with `SAVED_DRAFT_FILE` (`reveal-codes-saved-draft.txt`), `SAVED_DRAFT_MIME` (`text/plain;charset=utf-8`) and `saveDraftCopy(svc)`, which reads `AUTOSAVE_KEY` with `readRaw`, encodes the string with `TextEncoder`, calls `svc.download`, and returns `false` for a thrown read, a `null` value or a thrown download (converted at the boundary, as `use-export` does).
    - In `notices.ts` add `UNREADABLE_DRAFT`, `SAVE_COPY_FAILED` and `PRINT_BLOCKED` with the texts of the design.
    - _Requirements: 23.9, 23.11, 23.18, 23.21, 23.22_

  - [x] 23.4 Show the Draft_Notice in the Issues region
    - Create `apps/web/src/components/unreadable-draft.tsx` and `unreadable-draft.module.css`: a paragraph in a `role="status"` element holding `UNREADABLE_DRAFT`, then two `button type="button"` elements `Save a copy` and `Start a new document` outside it, 24px high, existing Tokens only, no colour literal, no icon.
    - In `issues-region.tsx` add the optional `draft` prop and render the notice first in the body while `draft.blocked`. It does not change `issuesHeading`, the list or the Resolved list.
    - In `app-shell.tsx` read the gate with `useSyncExternalStore` and pass `draft` through `IssuesSlot`.
    - _Requirements: 23.6, 23.7, 23.8, 23.22_

  - [~] 23.5 Start a new document, Toolbar New and the print guard
    - In `use-document-actions.tsx` add the pending kind `"newBlocked"` with the confirm copy of Requirement 23, criterion 12. `onNew` asks `"newBlocked"` when the gate is blocked. A confirmed `"newBlocked"` runs `startNew` and releases the gate only when `autosave.clear()` returned `true`; otherwise the gate stays blocked. Return `onStartNewDraft` and `onSaveDraftCopy` (dispatching `SAVE_COPY_FAILED` when `saveDraftCopy` returns `false`) and wire them to the Draft_Notice in `app-shell.tsx`. Sample loads do not touch the gate.
    - In `use-export.tsx`, `printFlow` checks the gate first and dispatches `PRINT_BLOCKED` without calling `autosave` or `openPrint`.
    - _Requirements: 23.10, 23.12, 23.13, 23.14, 23.15, 23.16, 23.17, 23.18_

  - [~] 23.6 Write the example tests for the unreadable draft
    - New `apps/web/test/unreadable-draft.test.tsx`, rendering `AppShell` with the memory storage and the manual timers of `test/support`: for each of `not_json`, `bad_shape` and `bad_codes` (the last from the old pincite draft of `autosave-old-pincite.test.ts`), the stored value survives the load, typing and a 300 ms wait (compare `storage.getItem` and `storage.writes()` before and after); the notice text and the two buttons are present, the notice sits in a polite status region and the buttons are outside it; the notice leaves the blocking count, the Issues heading, the Export button, the Next_Step and `No issues.` as they are.
    - Save a copy: the `download` double receives the stored bytes unchanged (an ASCII value, a non-ASCII value, the old pincite draft), the name `reveal-codes-saved-draft.txt` and the type `text/plain;charset=utf-8`, and the stored value and the notice stay; with `getItem` returning `null` or `download` throwing, `SAVE_COPY_FAILED` shows.
    - Start a new document: the confirm dialog shows the title, message and label of the design; cancelling changes nothing; confirming clears the stored value, empties the page, removes the notice and a later edit is saved after 300 ms; with a storage whose `removeItem` throws, `AUTOSAVE_FAILED` shows, the notice stays and nothing is written. The Toolbar's New button while blocked opens the same dialog.
    - A sample load while blocked leaves the notice and the stored value. Open print view while blocked shows `PRINT_BLOCKED` and does not call `openPrint`. A mount at width 799 neither reads nor blocks (extend the pattern of `narrow-guard.test.tsx`).
    - A static test that the only calls of `setItem` and `removeItem` on `AUTOSAVE_KEY` under `apps/web/src` are in `autosave.ts`, and that the copy files hold no exclamation mark (run `copy-rules.test.ts`).
    - Edit any existing test that breaks because `clear()` returns `boolean` or `download` has a third parameter, and list it for the BUILD_LOG. `autosave-old-pincite.test.ts` must pass unedited.
    - _Requirements: 23.1, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.9, 23.10, 23.11, 23.12, 23.13, 23.14, 23.15, 23.16, 23.17, 23.18, 23.19, 23.22, 23.25_

  - [~]* 23.7 Write property test for the unreadable stored draft
    - In `apps/web/test/case-match.properties.test.ts` add `// Property 20` above one `fc.assert(fc.property(...))`, a describe title ending `_Requirements: 23.23_`, and `numRuns` from the web `runs()` helper.
    - **Property 20: An unreadable stored draft is never changed by load, typing or saving**
    - Add `arbUnreadableStored` to `apps/web/test/arbitraries.ts` with three branches: text that is not JSON, JSON of the wrong shape or version (built from `fc.jsonValue()` and forced fields), and a well-formed envelope whose `codes` come from the engine's `arbSemanticTamper` or `arbSyntaxFault`. Inside the property, assert `deserialise(raw)` is an error other than `absent`, then run `loadAutosave` and `startAutosave` over `createMemoryStorage`, the manual timers and a `createDraftGate`, dispatch edits from `arbOpSequence` to the store, advance 300 ms or more, call `flush`, fire a hidden visibility change and stop; assert the stored value equals `raw` and `setItem` was not called after the seed.
    - **Validates: Requirements 23.1, 23.3, 23.4, 23.23**

- [ ] 24. Inventory and documentation (Requirements 21, 23, 24)
  - [~] 24.1 Update the aggregate inventory test to twenty
    - In `apps/web/test/static/case-match-inventory.test.ts` change the web entry of `OWNERS` to `[16, 17, 20]`, and change every `19`, `nineteen` and `1 to 19` check and test title to twenty and 1 to 20. Keep the self-test.
    - Confirm the design holds the heading `### Property 20:` and that the test fails if Property 20's marker is removed.
    - _Requirements: 24.3_

  - [~] 24.2 Write the documentation and the BUILD_LOG entry
    - README `Limits`: remove the bullet that says an old draft is overwritten by the first autosave, and add no replacement bullet.
    - BUILD_LOG: add a dated entry with the CI failure of aef6d70 and its cause; the measurement of task 22.1 (Rare_Kind, count, rate, miss probability over 1,500 draws, kind count found against the 22 the author counted, 1,500 as a literal `numRuns`, `max(runs().numRuns, 400)` for the syntax test); the audit of task 22.5 with each test examined, its seed and what was done; the unreadable-draft change and its decisions (only Start a new document opens the gate; Save a copy and sample loads do not; the Toolbar's New while blocked is the same action; print is blocked; UTF-8 encoding of the saved copy and the lone-surrogate limit; multiple tabs out of scope); and every existing test edited in tasks 23.6 and 22.4. Keep the earlier entry that records the old behaviour.
    - `.kiro/steering/structure.md`: add `draft-gate.ts` and `saved-draft.ts` to the listing of `apps/web/src/`, and `tamper-witnesses.ts` under `packages/engine/test/support/` if the listing names that folder. Update `docs/KIRO_USAGE.md` only if a row names a file that this task changes.
    - No exclamation mark and no marketing text.
    - _Requirements: 22.10, 22.11, 22.13, 23.24, 24.4_

- [~] 25. Final checkpoint
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` three times in a row and report each result (the three runs show that the reachability tests are stable), `pnpm test:pbt`, `pnpm --filter @reveal-codes/web build` (the clean-checkout web build) and `pnpm kiro:check`. Fix any failure in the code, never in a test's meaning.
  - State in the report that the push and the check of CI are left to the author. Do not push.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 22.15, 24.5, 24.6_

## Notes

- Tasks marked with `*` are optional test sub-tasks. Several requirements say tests "SHALL" exist (13.1, 13.2, 12.6), so skip them only knowingly. Skipping a property sub-task makes the aggregate inventory test of task 13.6 fail.
- Second follow-up (tasks 22 to 25): task 22.1 runs before any code change; task 23.7 (Property 20) is optional like the other property sub-tasks, and task 24.1 makes the inventory test require it. Tasks 24.1 and 25 are the last two steps.
- Task 12.1 is a gate. It never edits anything to make a recording fit.
- Tasks 3.13 (MCP tests) and 13.6 (aggregate inventory) are not optional. Task 13.6 requires all eighteen property markers, so every `*` property sub-task must be done before the final checkpoint.
- Task 9.3 and Requirement 10, criterion 15: if any line of the Avianca sample reads differently from the six expected citations, report which line and why before changing the text.
- Property tests of one package share one `case-match.properties.test.ts`, so their tasks sit in different waves.
- Follow-up group (tasks 15 to 21): Property 19 (task 16.3) is optional like the other property sub-tasks, and task 20.2 makes the inventory test require it, so skipping 16.3 fails the inventory test and the final checkpoint.
- The follow-up checkpoints (17 and 21) and the top-level tasks are not in the dependency graph.
- Task 16.1 stops and reports before changing `types.ts`, `format.ts`, `codes/*` or `lines.ts`; the design expects none of them to change.
- Task 20.3 states what the link tests cannot prove and lists the manual real-browser check; the repository has no browser driver and no dependency is added.
- Each task references granular acceptance criteria for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "3.4"] },
    { "id": 2, "tasks": ["1.3", "1.4", "3.2", "5.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["1.5", "1.12", "3.3", "3.5", "3.12", "7.2", "7.3", "8.2", "8.3", "10.1", "10.2"] },
    { "id": 4, "tasks": ["1.6", "3.6", "3.11", "3.13", "5.2", "9.2", "10.4"] },
    { "id": 5, "tasks": ["1.7", "3.7", "5.3", "9.3"] },
    { "id": 6, "tasks": ["1.8", "3.8", "5.4", "5.6"] },
    { "id": 7, "tasks": ["1.9", "3.9", "5.5"] },
    { "id": 8, "tasks": ["1.10", "3.10"] },
    { "id": 9, "tasks": ["1.11", "10.3"] },
    { "id": 10, "tasks": ["12.1"] },
    { "id": 11, "tasks": ["12.2"] },
    { "id": 12, "tasks": ["12.3", "13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 13, "tasks": ["15.1", "16.1", "19.1", "20.1"] },
    { "id": 14, "tasks": ["15.2", "15.3", "16.2", "18.1", "19.2"] },
    { "id": 15, "tasks": ["16.3", "16.4", "18.2", "19.3", "19.4"] },
    { "id": 16, "tasks": ["16.5", "18.3"] },
    { "id": 17, "tasks": ["18.4"] },
    { "id": 18, "tasks": ["20.2", "20.3"] },
    { "id": 19, "tasks": ["22.1", "23.1"] },
    { "id": 20, "tasks": ["22.2", "23.2", "23.3"] },
    { "id": 21, "tasks": ["22.3", "23.4"] },
    { "id": 22, "tasks": ["22.4", "23.5"] },
    { "id": 23, "tasks": ["22.5", "23.6"] },
    { "id": 24, "tasks": ["23.7", "24.2"] },
    { "id": 25, "tasks": ["24.1"] }
  ]
}
```
