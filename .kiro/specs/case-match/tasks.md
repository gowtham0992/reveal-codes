# Implementation Plan: case-match

## Overview

The work follows the order of Requirement 16, criterion 4: the Engine, the Verifier, the Pane, page and Issues region, the Statement, the Sentinel, the Avianca sample, the recording script and its tests, the recording (a stop-and-report gate), the documentation, and one final checkpoint. All code is TypeScript 5.x in strict mode, as the design uses TypeScript throughout.

The spec files are committed by the orchestrator before any task runs (Requirement 16, criterion 2). No task commits or pushes.

Conventions for every task:

- Property tests use fast-check with vitest, one `fc.assert(fc.property(...))` per property, in `case-match.properties.test.ts` of the owning package, with `// Property N` above it and `_Requirements: x.y_` in the describe title (design D9). Property numbers are scoped to this spec.
- A failing property is fixed in the code, never weakened. A shrunk counterexample becomes a named example test.
- No `try/catch` that swallows errors, no snapshot tests of the Engine, no test that only imports a module.
- An existing test whose expected outcome changes is edited in the task that changes it and listed in that task's BUILD_LOG note (Requirement 13, criterion 9). Task 13.3 collects the list.
- Functions stay under 40 lines and modules under 300 lines. No `any`, named exports only.

## Tasks

- [ ] 1. Engine: cited name, `wrong_case` status and Reveal Codes form (Requirements 1 to 3)
  - [ ] 1.1 Record the cited name in the Extractor and in carry-over
    - Add `caseName?: string` to `ExtractedCitation` in `packages/engine/src/types.ts`.
    - Create `packages/engine/src/citations/cited-name.ts` with `citedNameFor(text, start)`, using `partyStartFor` and `isCaseName` plus the new In_Re_Name rule from the design.
    - In `citations/extract.ts`, set `caseName` with a conditional spread for Full_Citations only, inside `extractFromMatches`, so `matchesOf` and the incremental rescan are unchanged.
    - In `anchor.ts`, add `prev.caseName === c.caseName` to `citationCarries`.
    - Keep `extract` total and keep every other extracted field identical.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_

  - [ ] 1.2 Add the `wrong_case` status and `CIT ≠` Issue code
    - Add the `wrong_case` variant to `VerificationResult` and `"CIT ≠"` to `IssueCode` in `types.ts`.
    - In `verification.ts`, turn `badVerificationField` into a table keyed by status with no `default` branch, validate `clusterId`, `foundName` and `foundYear` (1000 to 9999), treat `wrong_case` like `verified` for `not_verifiable`, and keep `statusChanged` Override behaviour.
    - In `issues.ts`, retype `FULL_CODES` over the non-`verified` statuses and add `wrong_case: "CIT ≠"`.
    - Fix every other `switch` or table over the status or code union in the Engine so `pnpm typecheck` passes.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12_

  - [ ] 1.3 Add `CIT ≠` to the Reveal Codes form
    - `codes/syntax.ts`: `CODE_NAMES.citWrongCase = "CIT ≠"`.
    - `codes/lex.ts`: schema with required `k` and optional `cl`, `nm`, `yr`, and `OPENS` entry `cit`.
    - `codes/decode-types.ts`, `decode.ts`, `build.ts`: decode and build the `wrong_case` result, replacing the `default` branch of `decodeStatus` with explicit cases.
    - `codes/check-citations.ts`: `bad_field` for a bad `clusterId`, `foundName` or `foundYear`; `short_form_code` and unlisted-Lexis rules cover `wrong_case`.
    - `codes/render.ts`: full form `[CIT ≠{k=…;cl=…;nm=…;yr=…}]` (omit `yr` when absent), display form `[CIT ≠]`, Short_Form with key only, Override directly after the opener.
    - Update the existing engine tests that enumerate the code names or statuses, if any, and note them for BUILD_LOG.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 3.10_

  - [ ] 1.4 Extend the shared arbitraries and the engine inventory test
    - In `packages/engine/src/testing/arbitraries.ts` add `arbPartyWords(pool)`, `arbCaseName(pool)`, `arbInReName`, `arbLeadIn`, `arbNameVariant(name)` (excluding initialisms equal to a Dropped_Word or table key, design D10), `arbDisjointNames`, `arbFoundName` and `arbWrongCaseResult`.
    - Extend the existing document and verification-result arbitraries so some Full_Citations carry `wrong_case` results.
    - Update `packages/engine/test/inventory.test.ts` to skip files named `case-match.properties.test.ts`, and add `case-match-inventory.test.ts` that, when that file exists, checks its markers are a subset of the engine numbers 2 to 8, each marker has one `fc.assert`, and each describe title carries `_Requirements:`.
    - Confirm the existing extraction, strip, render-order and incremental-equals-full properties pass unedited.
    - _Requirements: 13.3, 13.9, 1.10, 3.3, 3.4_

  - [ ]* 1.5 Write property test for the cited name
    - Create `packages/engine/test/case-match.properties.test.ts`.
    - **Property 3: The cited name is read back**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**

  - [ ]* 1.6 Write property test for carry-over of `caseName`
    - **Property 4: A kept citation keeps its name**
    - **Validates: Requirements 1.9, 1.11**

  - [ ]* 1.7 Write property test for `wrong_case` blocking export
    - **Property 5: `wrong_case` blocks export until overridden**
    - **Validates: Requirements 2.6, 2.7, 2.8, 2.11**

  - [ ]* 1.8 Write property test for malformed `wrong_case` results
    - **Property 6: A malformed `wrong_case` result is rejected and named**
    - **Validates: Requirements 2.3, 2.4, 2.5**

  - [ ]* 1.9 Write property test for Override survival
    - **Property 7: An Override survives only an unchanged status**
    - **Validates: Requirements 2.9**

  - [ ]* 1.10 Write property test for Short_Forms of a `wrong_case` target
    - **Property 8: A Short_Form follows a `wrong_case` target**
    - **Validates: Requirements 2.10, 3.2**

  - [ ]* 1.11 Write property test for the Reveal Codes round trip
    - **Property 2: Reveal Codes round trip with `wrong_case`**
    - **Validates: Requirements 3.1, 3.5, 3.8**

  - [ ]* 1.12 Write engine example tests
    - An In_Re_Name with commas (`In re Air Crash Disaster Near New Orleans, LA`) read from text written for the test.
    - Exact full and display strings of `[CIT ≠]` for the Ashcroft payload, and the tamper cases `bad_field` and `short_form_code`.
    - A `caseName` change resets the result to `unchecked` and drops the Override.
    - `parse` of an appendix containing `[CIT ≠…]` succeeds.
    - _Requirements: 1.4, 1.11, 3.1, 3.6, 3.7, 13.5_

- [ ] 2. Checkpoint - Engine complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Verifier: name rule, lookup rule, cache and verify route (Requirements 4 and 5)
  - [ ] 3.1 Implement name matching
    - Create `packages/verifier/src/name-expansion.ts` (the seventeen table entries, Dropped_Words, Initials_Skip_Words), `name-normalise.ts` (`prepareName`, `splitParties`), `name-initials.ts` (`initialisms`, `initialismMatch`) and `name-match.ts` (`namesMatch(cited, found: readonly string[])`).
    - No I/O, no clock, no `node:` import. Each module under 300 lines.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.13_

  - [ ] 3.2 Implement the verifier rule, Display_Info, link and cache change
    - Create `clusters.ts` (`ClusterData`, `clusterDataByIndex`, `foundNames`, `foundYear` per design D5), `judge.ts` (`judgeRecords`, `DisplayInfo`) and `link.ts` (`COURTLISTENER_ORIGIN`, `isSafeAbsoluteUrl`, `isDisplayInfo`, `courtListenerLink`).
    - In `lookup.ts` add `lookupWithInfo` and keep `lookup` as a wrapper returning `results`. Add `isCachedLine` so a cached `verified` entry without `cluster` is a miss; leave `isTerminalResult`, `map-status.ts`, `combineParallel`, `chunk.ts`, `bucket.ts`, `transport.ts` and `request.ts` unchanged.
    - Export the new items from `index.ts` and add the browser-safe `@reveal-codes/verifier/link` subpath in `package.json` exports.
    - The request body stays the formatted Citation_Lines only.
    - Update existing verifier tests that assert exact cache entries, if any, and note them for BUILD_LOG.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.12, 7.4, 15.7_

  - [ ] 3.3 Carry `caseName` and Display_Info through the verify route and client
    - In `apps/web/src/server/verify-route.ts` accept an optional `caseName` string of at most 200 code units (400 with the existing fixed message otherwise), call `lookupWithInfo`, and answer `{ results, info }` (design D4).
    - In `apps/web/src/client/api.ts` update the response guard to accept `wrong_case` with its field checks, reject other unknown statuses, and validate `info` items with `isDisplayInfo`.
    - Update the verify flow in `apps/web/src/client/verify-flow.ts` to send `caseName` from each record and return `info` beside the results.
    - Update any privacy copy that says only citation strings leave the browser (design D12).
    - Edit the existing verify-flow and api tests that build a verify response, and note them for BUILD_LOG.
    - _Requirements: 5.10, 5.11, 2.12, 13.9_

  - [ ] 3.4 Update the verifier inventory test
    - Make `packages/verifier/test/inventory.test.ts` skip files named `case-match.properties.test.ts`.
    - Add `packages/verifier/test/case-match-inventory.test.ts` that, when the property file exists, checks its markers are a subset of 1, 9, 10, 11, 12, 13 and 18, each with one `fc.assert` and `_Requirements:` in the describe title.
    - _Requirements: 13.1, 13.9_

  - [ ]* 3.5 Write property test for name matching
    - Create `packages/verifier/test/case-match.properties.test.ts`.
    - **Property 1: Name matching**
    - **Validates: Requirements 4.2, 4.5, 4.6, 4.7, 4.8, 4.10, 4.12, 4.13**

  - [ ]* 3.6 Write property test for the verifier rule
    - **Property 9: The verifier rule**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [ ]* 3.7 Write property test for cache hits
    - **Property 10: A cache hit gives the live result**
    - **Validates: Requirements 5.7**

  - [ ]* 3.8 Write property test for the lookup request body
    - **Property 11: The lookup request carries no case name**
    - **Validates: Requirements 5.6, 15.7**

  - [ ]* 3.9 Write property test for Display_Info derivation
    - **Property 12: Display_Info derivation**
    - **Validates: Requirements 5.8, 5.9**

  - [ ]* 3.10 Write property test for link construction
    - **Property 13: CourtListener link construction**
    - **Validates: Requirements 7.4**

  - [ ]* 3.11 Write verifier and route example tests
    - The three name pairs of Requirement 4 (NLRB, SEC, `U.S.`) and the spaced `U. S.` form.
    - A name that matches only through `case_name_full` or `case_name_short`.
    - Henderson and Ashcroft in one Document on one lookup line get separate results.
    - The lookup request body holds no case name; a cached `verified` entry without cluster data is a cache miss.
    - The route accepts an absent `caseName` and a 200-unit string, and answers 400 for a 201-unit string and for a number.
    - _Requirements: 4.11, 5.4, 5.6, 5.7, 5.10, 13.5, 13.6_

- [ ] 4. Checkpoint - Verifier complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Web: Pane, page underline, Issues region and Resolved list (Requirements 6 and 7)
  - [ ] 5.1 Add `CIT ≠` to the Pane, the Legend and the page marks
    - `pane/failing.ts`: add `"CIT ≠"` to `FAILING_OPENERS`.
    - `pane/layout.ts`: family `failed` and the plain-words text `Citation is a different case`.
    - `pane/pane-header.tsx`: Legend entry `[CIT ≠]` `wrong case`, failing, directly after `[CIT ✘] not found`.
    - `editor/marks.ts`: add `"CIT ≠"` to the mark code and `isMarked`; hover title `This citation is <foundName> (<foundYear>)`, or without the year.
    - No colour literal, Token, icon or new style. Edit existing tests that enumerate the Legend or the failing opener set and note them for BUILD_LOG.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 13.9_

  - [ ] 5.2 Add the Citations tally term, session state and Resolved list selection
    - `client/verify-summary.ts`: add `wrong_case` to `CitationTally`, `tallyDocument`, `NO_CITATIONS`, and the `Citations:` line order found, wrong case, not found, ambiguous, not checked, omitting zero terms.
    - `use-verify.ts`: keep `ResolvedSession` (`null` on mount, set on a `completed` run, unchanged otherwise) and expose `resolved` on `VerifyControl`.
    - Create `client/resolved.ts` with `resolvedRows(doc, session, currentEpoch)` as specified, using `courtListenerLink` from `@reveal-codes/verifier/link`.
    - Edit existing verify-summary tests and tests that enumerate the five statuses, and note them for BUILD_LOG.
    - _Requirements: 7.5, 7.6, 7.9, 7.12, 7.13, 7.14, 7.15, 7.17, 2.12, 13.9_

  - [ ] 5.3 Show the `wrong_case` row, the link, the Export dialog words and the Resolved list
    - `components/issues-list.tsx`: `SEVERITY["CIT ≠"] = "wrong case"`, the `This citation is …` line, the CourtListener_Link (`target="_blank"`, `rel="noreferrer"`), exported `issueWords(code, blocking)`.
    - `components/export-issues.tsx`: use `issueWords` and show the chip `CIT ≠`.
    - Create `components/resolved-list.tsx` and its CSS module; render it below the Issues list in `issues-region.tsx` with heading `Resolved citations`, no `Override…`, no `Go`, no effect on the blocking count, Export button, Next_Step or `No issues.` line.
    - Use only existing Tokens and the existing link colour; no exclamation mark, icon or emoji.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.7, 7.8, 7.10, 7.11, 7.13, 7.14, 7.16, 7.17, 7.18_

  - [ ]* 5.4 Write property test for Resolved list selection
    - Create `apps/web/test/case-match.properties.test.ts`.
    - **Property 16: Resolved list selection**
    - **Validates: Requirements 7.5, 7.12, 7.13, 7.14, 7.15, 7.17**

  - [ ]* 5.5 Write property test for the Citations line
    - **Property 17: The `wrong case` term of the Citations line**
    - **Validates: Requirements 7.9**

  - [ ]* 5.6 Write web example tests
    - Legend entry and order, page mark title with and without year, plain-words description.
    - Issues row text, link `href`/`target`/`rel`, link built from `clusterId` with no `absoluteUrl`, the row after a reload, the Export dialog row.
    - Resolved list hidden before a Verify_Run, rows after, absent when no `verified` citation, no effect on blocking count, Export button, Next_Step or `No issues.`.
    - _Requirements: 6.3, 6.4, 6.5, 7.1, 7.2, 7.4, 7.7, 7.8, 7.10, 7.12, 7.13, 7.16, 7.17, 13.5_

- [ ] 6. Checkpoint - Web display complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Statement and Appendix (Requirement 8)
  - [ ] 7.1 Add `wrong_case` to the Statement
    - `packages/export/src/types.ts`: add `foundName?` and `foundYear?` to `StatementCitation`.
    - `wording.ts`: `CITATION_CODES` const object, `CitationCounts` with `wrongCase`, the new five-term sentence, `citationStatusCell`.
    - `statement-parts.ts` and `render-statement.ts`: fill the new fields from the Document, count `wrong_case` in its own term, use `citationStatusCell` and the cluster id cell. No new column, no network call.
    - Edit `packages/export/test/render-statement.test.ts`, `packages/export/test/null-order.test.ts` and `apps/web/test/export-flow.test.tsx` for the new paragraph, and note them for BUILD_LOG.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 3.9, 13.9_

  - [ ]* 7.2 Write property test for Statement counts and the Status cell
    - Create `packages/export/test/case-match.properties.test.ts`.
    - **Property 14: Statement counts and status cell**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [ ]* 7.3 Write Statement example tests
    - Statement paragraph, Status cell with and without year, Overrides table row with `CIT ≠`, DOCX builder and `/print` view show the new blocks.
    - _Requirements: 8.1, 8.4, 8.5, 8.7, 13.5_

- [ ] 8. Sentinel (Requirement 9)
  - [ ] 8.1 Report `wrong_case` drift in the Sentinel
    - `crew/sentinel/src/status-text.ts`: `wrong_case <clusterId> <foundName>`.
    - `findings.ts`: export `citationDiffers` with the rule that a status change is a finding, and two `verified` or two `wrong_case` results differ only by cluster id.
    - Leave `reverify.ts`, `recorded.ts`, `split.ts` and `analyse.ts` unchanged.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 2.12_

  - [ ]* 8.2 Write property test for the Sentinel finding rule
    - Create `crew/sentinel/test/case-match.properties.test.ts`.
    - **Property 15: Sentinel finding rule**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5**

  - [ ]* 8.3 Write Sentinel example tests
    - `verified` to `wrong_case`, `wrong_case` to `verified`, an appendix containing `CIT ≠` parses, and a pre-spec filing yields no finding and no error.
    - _Requirements: 9.2, 9.3, 9.7, 9.8, 13.5_

- [ ] 9. Avianca sample and empty-page links (Requirement 10)
  - [ ] 9.1 Add the Avianca sample and copy it to `public`
    - Create `packages/engine/fixtures/avianca-citations.txt` with the text in the design, first line exactly as Requirement 10, criterion 1.
    - Update `apps/web/scripts/copy-demo.ts` to copy both files byte for byte when called with no argument, keeping the explicit-argument behaviour; add `apps/web/public/avianca-citations.txt` to `.gitignore`.
    - Add a line for the new fixture in the engine fixtures README, with source and date.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

  - [ ] 9.2 Add the sample action and the empty-page links
    - `client/api.ts`: add `aviancaCitations` next to `demoMotion`.
    - `use-document-actions.tsx`: generalise the demo action to a `sample` action keyed `"demo" | "avianca"`, same one-`PST`-span path, and the failure notice `The Avianca citations could not be loaded. Your document is unchanged.`
    - `components/editor-surface.tsx` (and its CSS module): while the text is empty show the two links `Load demo motion` and `Load the Avianca citations` as focusable `a` elements outside the `aria-hidden` placeholder, with the link colour and no icon; render neither when text exists.
    - Leave the Toolbar unchanged.
    - _Requirements: 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13_

  - [ ]* 9.3 Write Avianca example tests
    - The Extractor returns exactly six Full_Citations from the sample, each with its own `caseName`, and none from the first line.
    - `copy-demo.ts` copies the sample byte for byte.
    - Empty-page links: order, keyboard focus, not `aria-hidden`, absent when text exists, load behaviour, failure notice.
    - _Requirements: 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 13.5_

- [ ] 10. Recording script and its tests (Requirement 11)
  - [ ] 10.1 Write the recording script
    - Create `packages/verifier/scripts/record-lookups.ts` with `trimEntry`, `recordLookups`, `checkExpected` and `main`; add `scripts` to `packages/verifier/tsconfig.json` `include`.
    - `main` is the only reader of `COURTLISTENER_TOKEN`; it prints one line and exits 1 before any request when it is unset. The token is never printed, logged or written.
    - Request the seven lines in one chunk using `buildLookupRequest`. Dry run by default; with differences exit 2 and write nothing; with `--write` and no differences write `fixtures/lookup/<slug>.json` for the six new lines only. Never record `360 N.J. Super. 360` or `821 F.2d 1147`.
    - Report, for each of the seven lines, status, cluster id, found name, rule outcome, and for `556 U.S. 662` whether the live entry `matches` or `differs` from the committed fixture.
    - `fetch` is injected; no network in tests.
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6, 11.8, 11.9, 11.10, 11.11_

  - [ ] 10.2 Add the fixture credential scan
    - Add a test under `packages/verifier/test/` that reads every file under `packages/verifier/fixtures/` and fails when any contains a `Token ` or `Bearer ` credential value or the word `authorization` in any case.
    - _Requirements: 11.3_

  - [ ]* 10.3 Write property test for credential-free recordings
    - **Property 18: Recorded fixtures carry no credentials**
    - **Validates: Requirements 11.2, 11.5, 11.11**

  - [ ]* 10.4 Write recording script example tests
    - A missing token exits with code 1 and makes no request.
    - `checkExpected` reports a changed status, cluster id or rule outcome.
    - The `556 U.S. 662` comparison reports `matches` and `differs`.
    - `trimEntry` keeps exactly the identifying fields.
    - _Requirements: 11.2, 11.4, 11.5, 11.8, 11.10, 13.5_

- [ ] 11. Checkpoint - Everything before the recording passes
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Recording gate (Requirement 11, Requirement 12)
  - [ ] 12.1 Run the recording dry run and stop or report
    - This task is a stop-and-report gate. Do not edit code, the sample, the rule, the Expected_Outcomes or any fixture in it.
    - Check whether `COURTLISTENER_TOKEN` is set in the shell. If it is absent, stop and tell the user to run `pnpm --filter @reveal-codes/verifier exec tsx scripts/record-lookups.ts` (dry run first, then `--write`) in their own terminal, with the token in their environment. Do not ask for the token and do not read `.env`.
    - If the token is present, run the script as a dry run and report, for each of the seven lines, the status, cluster id and found name. If any result differs from the Requirement 12 table (a status, a cluster, or a name that makes the rule give a different outcome, including a Petersen or Miller name that would give `verified`), report the difference and stop. Do not change the sample, the rule, the Expected_Outcomes or the fixtures to make a result fit.
    - _Requirements: 11.4, 11.9, 11.10, 11.11, 12.2, 12.5_

  - [ ] 12.2 Write and wire the six recorded fixtures
    - Only after 12.1 reports no difference: run the script with `--write` (or commit the fixtures the user recorded).
    - Add one manifest entry per fixture (`source` `courtlistener-live`, recording date, note), one line each in `packages/verifier/fixtures/README.md`, and route each in `fixtures.ts`.
    - Re-check every count asserted by `packages/verifier/test/fixtures.test.ts` and `demo-corpus.test.ts` and edit them for the six added entries; note the edit for BUILD_LOG. Confirm the credential scan of 10.2 still passes.
    - _Requirements: 11.5, 11.7, 10.14, 13.9_

  - [ ]* 12.3 Write worked-outcome example tests
    - One example per row of the design's worked-outcome tables, run against `createFixtureFetch` and the routed fixtures: the five Introduction rows, every Full_Citation and Short_Form of the Demo_Motion, the six Avianca citations, and every existing fixture line.
    - Henderson gives `wrong_case` and Ashcroft gives `verified` on `556 U.S. 662`; `1 Hill 150`, `576 U.S. 644` and the 404 lines keep their results with no name comparison.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 13.5_

- [ ] 13. Documentation and steering (Requirements 6, 8, 14)
  - [ ] 13.1 Update the README
    - Add one line under "It checks citations and quotations" saying a citation must also name the case it points to, and one line in the demo path naming the Avianca sample. No exclamation mark or marketing text.
    - _Requirements: 14.1, 14.6_

  - [ ] 13.2 Update `docs/CERTIFICATION.md`
    - Update the statement paragraph to the new five-term sentence and name the count of citations that resolved to a different case than the one named.
    - _Requirements: 8.9, 14.2, 14.6_

  - [ ] 13.3 Add the BUILD_LOG entry
    - Add a dated entry that begins with the five-row table of the Introduction as the reason for the spec, then lists every existing test changed under Requirement 13, criterion 9 (collected from tasks 1.3, 3.2, 3.3, 5.1, 5.2, 7.1 and 12.2), and any finding of the recording task.
    - _Requirements: 14.3, 13.9_

  - [ ] 13.4 Update `docs/KIRO_USAGE.md`
    - Add a row for this spec, a row for its `.config.kiro` and `tasks.meta.json` (where present), and a row for each steering file this feature edits (`product.md`, `citations.md`, `structure.md`).
    - _Requirements: 14.4_

  - [ ] 13.5 Update the steering files
    - `.kiro/steering/product.md`: add the `[CIT ≠]` code line to the Citation codes, `wrong_case` to the verification status vocabulary, `CIT ≠` to the codes named in principle 4, and `CIT ≠` to the Failing_Block row of the Pane palette.
    - `.kiro/steering/citations.md`: add the comparison rule and the `wrong_case` mapping to the verification contract.
    - `.kiro/steering/structure.md`: add `scripts/` under `packages/verifier/` naming `record-lookups.ts`.
    - _Requirements: 6.7, 6.8, 14.5_

- [ ] 14. Final checkpoint
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `pnpm --filter @reveal-codes/web build` (the clean-checkout web build) and `pnpm kiro:check`, and fix any failure in the code, never in a test's meaning.
  - State in the report that the browser check and the push are left to the author. Do not push.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 16.5_

## Notes

- Tasks marked with `*` are optional test sub-tasks. Several requirements say tests "SHALL" exist (13.1, 13.2, 12.6), so skip them only knowingly.
- Task 12.1 is a gate. It never edits anything to make a recording fit.
- Property tests of one package share one `case-match.properties.test.ts`, so their tasks sit in different waves.
- Each task references granular acceptance criteria for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "3.4"] },
    { "id": 2, "tasks": ["1.3", "1.4", "3.2", "5.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["1.5", "1.12", "3.3", "3.5", "7.2", "7.3", "8.2", "8.3", "10.1", "10.2"] },
    { "id": 4, "tasks": ["1.6", "3.6", "3.11", "5.2", "9.2", "10.4"] },
    { "id": 5, "tasks": ["1.7", "3.7", "5.3", "9.3"] },
    { "id": 6, "tasks": ["1.8", "3.8", "5.4", "5.6"] },
    { "id": 7, "tasks": ["1.9", "3.9", "5.5"] },
    { "id": 8, "tasks": ["1.10", "3.10"] },
    { "id": 9, "tasks": ["1.11", "10.3"] },
    { "id": 10, "tasks": ["12.1"] },
    { "id": 11, "tasks": ["12.2"] },
    { "id": 12, "tasks": ["12.3", "13.1", "13.2", "13.3", "13.4", "13.5"] }
  ]
}
```
