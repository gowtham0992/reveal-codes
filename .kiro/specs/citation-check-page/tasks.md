# Implementation Plan: citation-check-page

## Overview

This plan adds the public route `/check`. It follows the order set in the design's Verification order: extract Shared_Rows with the editor's tests green, then the `AppServices` change, CodeLabel, `runCheck` and the reducer, then the page, the Hand_Over and the small-screen changes, then the scans and docs, then the final checkpoint. The spec (requirements, design, this file) is already committed before any task starts, so no task commits it. Nothing is pushed.

Language: TypeScript 5.x, strict, as the design specifies. Tests use vitest and fast-check. Property tests live in `<module>.properties.test.ts` files, with `// Property N` above one `fc.assert(fc.property(...))` and `_Requirements: x.y_` in the `describe` title. No task changes the Engine (new arbitraries only go into `packages/engine/src/testing/`), the Verifier, the API routes or the Toolbar. No dependency, environment variable or route is added.

## Tasks

- [x] 1. Extract Shared_Rows with the editor unchanged
  - [x] 1.1 Create `apps/web/src/client/check-rows.ts` and re-point the editor at it
    - Move `SEVERITY` (as `STATUS_WORDS`, plus "found" and "match"), `shorten`, `MAX_ISSUE_TEXT`, `divergenceFor`, `WrongCase` and `wrongCaseFor` out of `issues-list.tsx`, and `foundText` out of `resolved.ts`. Move the tally words of `verify-summary.ts` into the shared word table.
    - Add `RowCode`, `CheckRow`, `NEXT_SENTENCES` (the six sentences of Decision 1, defined once), `checkRows(document, info)` and `displayFor(clusterId, info)`.
    - `checkRows` emits one row per full citation, per orphan short form and per quotation, sorted by `(start, kind)` with a citation before a quotation at an equal start. It calls `issues(document)` for the failing rows and adds the verified citations and matching quotes. It does not touch the Engine.
    - Leave re-exports of `shorten`, `MAX_ISSUE_TEXT`, `WrongCase` and `wrongCaseFor` in `issues-list.tsx`. `issueWords` reads `STATUS_WORDS` and returns the same strings. `resolvedRows` imports `foundText` and `displayFor`. `summaryLines` keeps its output.
    - The module has no React and no Store import. Run the existing `issues-list`, `resolved` and `verify-summary` tests and confirm they pass with no edit.
    - _Requirements: 6.11, 6.12, 7.3, 7.4, 8.4_

  - [x] 1.2 Add the shared arbitraries for check results
    - Create `packages/engine/src/testing/arb-check-results.ts` with arbitraries for verification results per citation, quote results per quotation, and Display_Info per cluster. Export it from `packages/engine/src/testing/arbitraries.ts`.
    - Reuse `arb-document.ts`, `arb-text-citations.ts` and `arb-quote-groups.ts` for Documents and text. Add no arbitrary that duplicates them.
    - _Requirements: 17.8_

  - [x]* 1.3 Write property test for Shared_Rows
    - **Property 1: One answer**
    - File `apps/web/test/check-rows.properties.test.ts`, one `fc.assert(fc.property(...))`, `// Property 1`, `_Requirements: 8.1, 8.2_` in the `describe` title, `numRuns` 200 locally and 500 in CI.
    - Assert, against independently derived values (`issues(document)`, `render(document, "display")`, `issueWords`, `mismatchLines(mismatchOf(...))`, the Resolved list's row text): one row per item and none for a linked short form; distinct keys in increasing `(start, kind)` order; failing rows equal `issues(document)` in order; `code` and `words` agree with the display rendering and `STATUS_WORDS`; `next` is non-null exactly for the six failing codes and equals `NEXT_SENTENCES[code]`, with no `!`, "fake", "fabricated" or "does not exist".
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9, 6.10, 7.1, 7.5, 8.1, 8.2**

  - [x]* 1.4 Write example tests for Shared_Rows
    - `displayFor` returns info only when `info.clusterId` matches; `NEXT_SENTENCES` has six entries and none contains an exclamation mark; a linked short form yields no row; a wrong-case row carries `mismatch` lines and an `href`.
    - _Requirements: 6.6, 6.7, 7.3, 7.4_

- [x] 2. Extend AppServices with `session` and `clipboard`
  - [x] 2.1 Add the two service fields and fix every complete fake
    - In `apps/web/src/services.ts` add `session: StorageLike` and `clipboard: { available(): boolean; write(text): Promise<void> }` to `AppServices`. `defaultServices` builds both lazily, reading `window.sessionStorage` and `navigator.clipboard` only inside the methods, so server rendering never touches `window`.
    - Update the shared test helpers so every fake `AppServices` has an in-memory `session` (from `memory-storage.ts`) and a controllable clipboard. Run `pnpm typecheck` and fix each object it names.
    - _Requirements: 10.2, 12.7_

- [x] 3. Create the Status_Label component
  - [x] 3.1 Create `apps/web/src/pane/code-label.tsx` and `code-label.module.css`
    - `CodeLabel({ code })` renders `<span>` with the code text unchanged. Family and failing flag come from `codeFamily` and `isFailingOpener`; the class from `codeClass`. The stylesheet adds only the `#0f2766` ground, the `--fail` ground with a 2px `--fail-ring` outline for failing codes, IBM Plex Mono at weight 600 (700 for failing), `display: inline-block` and `max-width: 100%`. No Token is added.
    - If the colour scan exempts `src/pane/` per file, add the new stylesheet to its list.
    - _Requirements: 6.5, 6.13, 15.3, 15.4_

  - [x]* 3.2 Write tests for CodeLabel
    - File `apps/web/test/code-label.test.tsx`: each of the eight codes renders its characters unchanged, and the four failing codes carry the failing class and the others do not.
    - _Requirements: 6.5, 6.13_

- [x] 4. Implement Check_Run and the state machine
  - [x] 4.1 Create `apps/web/src/check/run-check.ts`
    - Implement `runCheck({ text, api, now })` in the design's order: `docxSafe`; `MAX_TEXT_CHARS` check giving `DOCUMENT_TOO_LONG`; blank check giving "Add some text to check."; `pastedDocument` (a string result becomes the message); `hasFullRecord` false giving "No citations were found in this draft."; then a private `createStore(now)`, `replace`, and the unchanged `runVerifyFlow`.
    - Map `failed` to `{ kind: "message", text: outcome.failure }`, `discarded` to `{ kind: "discarded" }` and `completed` to `done` with the read-back Document, the info map and `checkedAt`. Export the two new sentences as constants. The function never rejects and has no `try/catch`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.5, 5.6, 5.9_

  - [x] 4.2 Create `apps/web/src/check/check-state.ts`
    - Implement `CheckState`, `CheckAction` and the pure `reduceCheck` with the rules of design section 4: an edit to different text bumps `generation` and sets `stale` when results exist, and `stale` survives a return to the checked text; `finish` for an older generation only clears `running`; a `done` finish clears `stale` and `message`; `clear` empties everything and bumps `generation`.
    - _Requirements: 9.1, 9.4, 9.5, 15.5_

  - [x]* 4.3 Write property test for the request surface
    - **Property 2: Nothing more is sent**
    - File `apps/web/test/check-request.properties.test.ts`, one `fc.assert(fc.property(...))`, `// Property 2`, `_Requirements: 11.3, 11.4_` in the `describe` title.
    - Run `runCheck` through a real `createApiClient` on a recording `fetch` (the only fake). Assert: only the four allowed URLs; no request for blank, too-long or citation-free text; otherwise exactly one `/api/verify` request whose body equals `JSON.stringify(buildVerifyBody(pastedDocument(docxSafe(text).text, iso)))`; opinion requests are body-less GETs on cluster ids taken from the verify response; a marker string in prose appears in no URL or body.
    - **Validates: Requirements 5.8, 11.3, 11.4**

  - [x]* 4.4 Write example tests for `runCheck`
    - Each refusal makes no request; 429 returns `CHECKS_BUSY`; another failure returns `FAILED_NOTICE`; a discarded flow returns `discarded`; a completed run returns the Document, info and `checkedAt`.
    - _Requirements: 4.2, 4.3, 4.4, 5.5, 5.6_

  - [x]* 4.5 Write example tests for the reducer
    - File `apps/web/test/check-state.test.ts`: every rule of section 4, including the stale flag after restoring the checked text, a dropped older `finish`, and `clear` during a run.
    - _Requirements: 9.1, 9.4, 9.5_

- [x] 5. Add Open messages and Copy_Text
  - [x] 5.1 Add the check-page Open sentence and the `hasNotes` field
    - In `open-messages.ts` add `checkOpenedMessage(name, characters, removed, hasNotes, restored)` reusing `removedSentence` and `NOTES_SENTENCE`. Do not edit `openedMessage`.
    - In `open-outcome.ts` export the notes test and add a `hasNotes` boolean to the `text` outcome. Update existing open-outcome tests only where whole outcomes are compared with `toEqual`.
    - _Requirements: 3.4, 3.5_

  - [x] 5.2 Create `apps/web/src/check/copy-text.ts` and add `localDate`
    - Add `localDate(iso)` beside `localTime` in `verify-summary.ts` (local `YYYY-MM-DD`, null when unparseable).
    - Implement `copyText(rows, citationsLine, date)`: first line the Citations line; one line per row, "<Status words, capitalised>: <text as written>." plus " On record: <case, year>. <address>" where present (for a wrong-case row the case is taken from the last `mismatch` line); last line "Checked on <date> with Reveal Codes against CourtListener." (or the date-free form when `date` is null). No pipe character, no doubled period.
    - _Requirements: 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x]* 5.3 Write example tests for Copy_Text
    - File `apps/web/test/copy-text.test.ts`: first line, one line per row in order, no pipe, the On record part, quotation lines without an address, the last line, the date from `localDate`, no doubled period.
    - _Requirements: 10.4, 10.5, 10.6, 10.7_

- [x] 6. Implement the Hand_Over
  - [x] 6.1 Create `apps/web/src/handover.ts`
    - Export `HANDOVER_KEY` (`reveal-codes:check-handover:v1`), `writeHandover(session, text): boolean` (false when the write throws) and `takeHandover(session): string | null` (read, then remove; null for a missing, empty or throwing read; the value is still returned if only the remove throws). This is the only module that calls `setItem` or `removeItem` with the key. No React.
    - _Requirements: 12.3, 12.7, 12.8_

  - [x] 6.2 Create `apps/web/src/components/use-handover.tsx` and wire it into the Shell
    - Export `installOutcome` from `use-open-draft.tsx`. `useHandover(store, svc, gate)` runs after `useAutosave`, calls `takeHandover` once on mount, builds `textOutcome("The draft from the checker", text, { notes: false, note: null })`, dispatches a refusal as the Open flow does, installs at once when the draft is empty, and otherwise opens `ConfirmDialog` with title "Open a draft", message "Discard the current draft and open the draft from the checker?" and confirm label "Discard and open". Cancel keeps the draft. Keep the result in state so a Strict Mode double effect shows one dialog.
    - _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x]* 6.3 Write tests for the Hand_Over
    - Files `apps/web/test/handover.test.ts` and `use-handover.test.tsx`: write then take returns the text and a second take returns null; a throwing store returns null or false; install at once on an empty draft as one PST span; the dialog wording on a non-empty draft; cancel keeps the draft and the key stays cleared; one dialog under Strict Mode.
    - _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 7. Build the Check_Page
  - [x] 7.1 Create `apps/web/src/check/use-draft-input.ts`
    - Implement Open a file through `openFile` unchanged (refusal `notice` and `note` shown unchanged, text kept; success sentence from `checkOpenedMessage`, provenance record ignored), Load the Avianca citations through `api.aviancaCitations()` with `docxSafe` (`AVIANCA_FAILED` on failure), and Clear without a dialog. When the box holds text, Open (after the reader accepts) and the sample open the editor's `ConfirmDialog` with the editor's wording, imported and not retyped. Typing, pasting, Open and Clear make no request.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11_

  - [x] 7.2 Create `apps/web/src/check/result-list.tsx`
    - Map `checkRows` to `<li>` blocks: `CodeLabel`, `row.words`, `shorten(row.text)`, `row.found`, the existing `MismatchLines`, "Diverges at: " plus `row.divergence`, `CourtListenerLink` for `row.href`, and `row.next`. A passing row shows no Next_Sentence. No string literal duplicates an Editor_Sentence or a status word.
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.1, 7.5, 8.3_

  - [x] 7.3 Create the route, the page and its stylesheet
    - Create `apps/web/app/check/page.tsx` (metadata title and description of Decision 12, imports only from `src/` and its own folder), `apps/web/app/check/check.module.css` (the Courts_Page structure, `.page { overflow-wrap: anywhere }`, `.group { max-width: 100% }`, wrapping action row, Tokens only, no width at-rule, no fixed width beyond `100%`, `auto`, `min-content`, `max-content`, `0`) and `apps/web/src/check/check-page.tsx`.
    - `CheckPage` uses `useReducer(reduceCheck, ...)` and `useState(defaultServices)`. Render, in order: header with the Mark and wordmark, the single `h1`, the what-it-does sentence, the privacy sentence, the not-stored sentence, the labelled Draft_Box, the actions (Check citations as the only `data-primary`), the single `role="status"` region, and the links to `/courts` and `/`.
    - The status region holds "Verifying…", `WAITING_TEXT` after `WAITING_AFTER_MS` through `svc.setTimer` (cleared on finish, unmount and clear), the refusal or failure message, `DEMO_MODE_LINE` from `useModeResult`, the Summary_Line from `summaryLines` and `furtherLine`, and the results, rendered in one commit. While stale it shows the out-of-date sentence, "Check again" and an "Earlier results" label, and withholds Copy results and the Editor_Link. The Draft_Box stays editable during a run.
    - Copy results renders only after mount when `svc.clipboard.available()` (via `useSyncExternalStore` with a false server snapshot), writes `copyText`, and shows "The results could not be copied." on rejection. The Editor_Link is a plain `<a href="/">` rendered only at `NARROW_WIDTH` or more, with text, and not stale; its click writes `writeHandover(svc.session, docxSafe text)` and cancels with the proposed sentence if the write fails. Put the privacy sentence's wording from Requirement 11.1 and Decision 2 in one constant.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.2, 5.3, 5.4, 5.7, 6.1, 9.1, 9.2, 9.3, 10.1, 10.2, 10.8, 10.9, 11.1, 11.6, 12.1, 12.2, 12.9, 15.1, 15.2, 15.3, 15.5_

  - [x]* 7.4 Write example tests for the page
    - File `apps/web/test/check-page.test.tsx`, mocking only `fetch`, the clipboard service and the timer service: typing and pasting; Open for `.docx`, `.txt` and `.md`; each Open refusal; Load the Avianca citations and its failure; Clear; the replace confirm; the Avianca end-to-end run on recorded responses (two found, two wrong case, two not found, each with the case on record); a quotation not in the opinion; 429; failed run; demo mode; waiting text at 5000 ms; the too-long and blank and no-citation refusals; staleness on edit including restored text; an edit during a run; no request on typing, opening and clearing; Copy results present, absent without a clipboard and absent from server HTML; write failure sentence; no request on copy.
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [x]* 7.5 Write example tests for the Editor_Link
    - File `apps/web/test/check-editor-link.test.tsx`: absent from server HTML, absent below 800px, present at 800px or more with text, absent while stale, gone after the viewport narrows; the address never holds text; a failed write cancels the click and shows the sentence.
    - _Requirements: 12.1, 12.2, 12.3, 12.8, 17.4_

- [x] 8. Small-screen page and other ways in
  - [x] 8.1 Change the Small_Screen_Page and the Courts_Page
    - Replace `SMALL_SCREEN_SENTENCES` with `SMALL_SCREEN_INTRO` and `SMALL_SCREEN_EDITOR_NOTE`. Order: intro sentence; `/check` link "Check the citations in a draft" (plain, not `data-primary`); `COURT_RULES_LONG`; video and source links when set; the editor note; the Selection_Line when set.
    - Add `<a href="/check">Check the citations in a draft</a>` beside "Open the editor" on the Courts_Page. Change nothing in the Toolbar.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.4_

  - [x] 8.2 Update the tests that name the old sentences
    - Update `small-screen.test.tsx`, `app-shell.test.tsx` and the Courts_Page test to the new order and wording, and add a Small_Screen_Page order example.
    - _Requirements: 13.6, 17.4_

- [x] 9. Static scans
  - [x] 9.1 Move shared scan helpers and extend the boundaries scan
    - Move `sheetViolations` from `static/courts.test.ts` into `static/page-css.ts`; `courts.test.ts` imports it and keeps its assertions, including `sheets` equal to the one Courts file.
    - In `static/boundaries.test.ts` change `COURTS_PAGE` to `/^app\/(?:courts|check)\//`, give `src/check/` `noServer`, `src/client/check-rows.ts` `noReact` and `noServer`, and `src/handover.ts` `noReact`.
    - Confirm the width at-rule count input list; the Check_Page sheets and `code-label.module.css` must contribute zero at-rules and the count of exactly one stays.
    - _Requirements: 16.1, 16.3, 16.4_

  - [x] 9.2 Add the Check_Page scans
    - Create `static/check.test.ts`: scan `app/check/*.css` and `src/check/*.css` with `sheetViolations` and `colourViolations`; assert `.page { overflow-wrap: anywhere }`, `.group { max-width: 100% }`, the desk and paper column, 34px links and the text-area focus border; fail on a width at-rule or `px` width; scan `app/check/` and `src/check/` sources for `<img`, `<svg`, Extended_Pictographic characters, `localStorage`, `sessionStorage`, `document.cookie` and `indexedDB`.
    - Create `static/check-literals.test.ts`: no literal in `app/check/` or `src/check/` equals or contains an Editor_Sentence or a `STATUS_WORDS` value, and the sources import the owning modules; include a planted-violation example.
    - Extend `static/draft-storage-writes.test.ts` so `HANDOVER_KEY` and its `setItem` and `removeItem` calls appear only in `src/handover.ts` and its tests, with a planted-violation example.
    - Add the new files and sentences to the inputs of `static/inventory.test.ts`, `docs.test.ts`, `kiro-usage-check.test.ts` and `copy-rules.test.ts` where they list directories.
    - _Requirements: 3.10, 8.3, 16.1, 16.2, 16.4, 16.5, 17.5_

- [x] 10. Documentation
  - [x] 10.1 Update `README.md`
    - "What it does": one line about the Check_Page. "Demo path": one line, on a phone open `/check`. "What leaves your machine": one line consistent with Requirement 11.1. "Limits": reword the desktop-editor line to say the editor needs 1150 pixels and the Check_Page reads from 320px. No exclamation mark; `docs.test.ts` stays green.
    - _Requirements: 11.5, 13.7, 18.1, 18.2, 18.3, 18.4_

  - [x] 10.2 Update `.kiro/steering/ui.md`
    - Describe `/courts` and `/check` together: the column, the header with the Mark, the links, the Status_Label on the dark ground (CodeLabel in `src/pane/`), and the absence of a width at-rule. Add no Token.
    - _Requirements: 15.3, 18.7_

  - [x] 10.3 Update `docs/KIRO_USAGE.md`
    - Add a row for this spec listing `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`, and a row for `ui.md`. Run `pnpm kiro:check` for the inventory.
    - _Requirements: 18.5_

  - [x] 10.4 Add the `BUILD_LOG.md` entry
    - A dated entry recording the Shared_Rows extraction, the `sessionStorage` Hand_Over choice (and the rejected `window.name` and `postMessage`), the `AppServices` additions, and what Kiro got wrong in the requirements pass, or "No Kiro errors".
    - _Requirements: 18.6_

- [x] 11. Final checkpoint
  - Run, in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build` from a clean clone after `pnpm install`), and `pnpm kiro:check`. Fix any failure. Do not push. Ask the user if questions arise.
  - The author then walks `/check` at 375px and 1280px, on the demo server and then live. That step is manual and not a coding task.
  - _Requirements: 18.8, 18.9_

- [x] 12. Follow-up: findings from the 375px, 320px and 1280px walk
  - [x] 12.1 Add the Case_Name_Option to `checkRows`
    - In `src/client/mismatch.ts` export `citedAsLine(name)` and make `mismatchLines` call it. In `src/client/check-rows.ts` add the optional `caseName` field to `CheckRow` and the third argument `{ caseNames: boolean }` (default off) to `checkRows`, set through one helper on the citation and failing-row builders. With the option off no field is added. Quotation and orphan rows never get it.
    - Do not edit `issues-list.tsx`, `resolved.ts` or their tests. Run the existing `issues-list`, `resolved`, `verify-summary` and `check-rows` tests and confirm they pass with no edit.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.9, 19.10_

  - [x] 12.2 Show the case name on `/check` and in Copy_Text
    - `result-list.tsx` and `CopyButton` call `checkRows(document, info, { caseNames: true })`. `ResultItem` shows `citedAsLine(row.caseName)` under the status line when `caseName` is set and `mismatch` is empty. `copy-text.ts` writes `<Status words>: <caseName>, <text>.` when `caseName` is set, for wrong-case rows too.
    - _Requirements: 19.5, 19.6, 19.7, 19.8, 19.11, 19.12_

  - [x]* 12.3 Extend Property 1 for the option
    - **Property 1: One answer** (extended). In `apps/web/test/check-rows.properties.test.ts` keep one `fc.assert(fc.property(...))` and `// Property 1`, add `fc.boolean()` for `caseNames`, and add clauses 7 and 8 of design F2. Add 19.13 to the `describe` title and to **Validates**. Expected names are read from `document.citations`, never from the rows.
    - **Validates: Requirements 8.1, 8.2, 19.13**

  - [x]* 12.4 Write example tests for the case name
    - `check-rows.test.ts`: option off equals rows without the argument; option on on found, not-found, ambiguous and unchecked rows; one "Cited as" line on a wrong-case row; no extra text with no `caseName`; no field on a quotation or orphan row.
    - `check-page.test.tsx` and `copy-text.test.ts`: the Varghese not-found row shows "Cited as Varghese v. China Southern Airlines Co., Ltd."; the Copy results line reads "Not found: Varghese v. China Southern Airlines Co., Ltd., 925 F.3d 1339 (11th Cir. 2019)."; a wrong-case copy line carries the name once before the citation.
    - _Requirements: 19.2, 19.3, 19.4, 19.6, 19.8, 19.10, 19.11, 19.12_

  - [x] 12.5 Record the touch rule and extend the scans
    - Before any stylesheet change, confirm against `ui.md` and the scans what design F3 states: `@media (pointer: coarse)` is allowed (no scan counts it as a width at-rule) and 16px is not in the allowed sizes. If a rule or scan turns out to forbid the query, stop and write the finding and a proposal under a heading "Open question" in `requirements.md` instead of building it.
    - `ui.md`: add the touch rule (44px buttons and links inside `@media (pointer: coarse)` on `/check`, the Small_Screen_Page and the two `/courts` rule links), that the desktop look is unchanged, and 16px for the Draft_Box text only.
    - `static/page-css.ts` and `static/css-rules.test.ts`: allow only `@media (pointer: coarse)` as a non-width media query, fail on any other, keep the exactly-one-width-at-rule count, and allow `font-size: 16px` only on `.draft` or `textarea`. Add the planted-violation examples of design F3.
    - _Requirements: 20.6, 20.8, 20.9, 20.10, 20.11_

  - [x] 12.6 Apply the touch rules to the stylesheets
    - `app/check/check.module.css`: `.draft` at 16px / 22px; `@media (pointer: coarse)` block for `.page button` (44px height) and `.page a` (inline-flex, 44px min-height). `src/components/small-screen-page.module.css` and `app/courts/courts.module.css` (`.links a`): `@media (pointer: coarse)` blocks with a 44px minimum. Keep every existing desktop rule outside the query unchanged. Do not touch the shared confirm dialog.
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.12_

  - [x]* 12.7 Write tests for the touch rules
    - In `static/check.test.ts` and `static/courts.test.ts` and a small-screen sheet test: the 44px declarations sit under `@media (pointer: coarse)` and the 34px and 30px desktop declarations sit outside it; `.draft` is 16px; the query is not counted as a width at-rule; the planted violations of 12.5 fail as expected.
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.7, 20.8, 20.9, 20.10_

  - [x] 12.8 Fix the Hand_Over notice case
    - In `use-handover.tsx` set `HANDOVER_NAME` to "the draft from the checker" and capitalise the first letter of a refused hand-over's notice and note. Leave `textOutcome`, `openedMessage` and the file-name path unchanged.
    - Add example tests to `use-handover.test.tsx`: the notice reads "Opened the draft from the checker: 807 characters, marked as pasted."; a refusal starts with a capital letter; opening a file named `Motion.docx` through the Open flow keeps its name unchanged.
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [x] 12.9 Diagnose and fix the frozen Editor_Link
    - First write a failing test that reproduces the walk: `renderToString` at the narrow default, `hydrateRoot` at 375px, type text, then widen through the real `resize` event on `window` using `defaultServices().viewport`. If it passes, reproduce by hand in a browser at 375px then 1280px and log the `resize` events. Write the confirmed root cause into design section F6 in place of its last paragraph, then fix it. If the cause is a missing `resize` event, add a `matchMedia("(min-width: 800px)")` change subscription inside `browserViewport`.
    - Move the width read into `src/check/use-wide.ts` (`useWide`, design F5) and use it in `CheckPage` for both the Editor_Link and the Storage_Statement.
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.6_

  - [x] 12.10 Make one Storage_Statement
    - In `check-text.ts` drop the last sentence of `PRIVACY_SENTENCE`, replace `NOT_STORED_SENTENCE` with `STORAGE_STATEMENT` and `STORAGE_STATEMENT_WIDE`, and render one of them in `PageTop` from `useWide`. Below 800px the page and the server HTML must not mention the editor link or storing in the editor. No exclamation mark.
    - Update the existing tests that name the two old sentences. Run `copy-rules` and `check-literals` scans.
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.8_

  - [x]* 12.11 Write tests for the statement and the live width
    - `check-page.test.tsx`: the Storage_Statement text at a viewport of 375px and at 1280px; the server HTML at the narrow default holds the narrow statement and no editor mention; one storage sentence only.
    - `check-editor-link.test.tsx`: load narrow, widen, the link and the extra clause appear; narrow again, both are gone; the same through the real `resize` event with `defaultServices().viewport`.
    - _Requirements: 22.4, 22.5, 22.9, 23.1, 23.2, 23.3, 23.5_

  - [x] 12.12 Update the docs
    - `README.md` "What leaves your machine": reword the `/check` line to say the draft is not stored and, on a screen 800 pixels or wider, that opening it in the editor stores it there; keep the other claims. No exclamation mark; `docs.test.ts` stays green. Requirement 2.4 and 11.1 are superseded by 22 as the requirements follow-up records; edit no earlier requirement text.
    - Run `pnpm kiro:check` for `docs/KIRO_USAGE.md` and add a row only if the inventory asks for one.
    - _Requirements: 22.7, 20.11_

  - [x] 12.13 Add the walk findings to `BUILD_LOG.md`
    - Under the citation-check-page entry, in "What Kiro got wrong, and what fixed it", add plain, third-person lines for what the walk at 375px, 320px and 1280px found: no case name on a row, because the page had no document beside the row; the 13px draft box and the 30px buttons and 29px links, never checked on a phone; the capital "The" from reusing a sentence as a file name; the two sentences saying the draft is not stored; and the Editor_Link frozen at load, with the root cause found in 12.9. Add the confirm dialog to a "Left out" line. Make no first-person claim as the user.
    - _Requirements: 18.6_

- [x] 13. Final checkpoint
  - After the last edit, run in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build` from a clean clone after `pnpm install`) and `pnpm kiro:check`. Fix any failure and rerun all of them.
  - Confirm `git status` shows a clean working tree with everything committed. Do not push. Ask the user if questions arise.
  - _Requirements: 18.8, 18.9_

## Notes

- Tasks marked with `*` are optional test sub-tasks. Skipping them leaves Requirement 17 unmet, so run them before the final checkpoint unless the author decides otherwise.
- The spec is committed before task 1 starts. No task commits it and no task pushes.
- `tasks.meta.json` is listed in the KIRO_USAGE row (Requirement 18.5). The tooling that runs tasks creates it; this plan does not create it by hand.
- The Editor_Link write-failure sentence ("The draft could not be passed to the editor. Copy it and paste it into the editor.") is a design proposal that needs the author's agreement before task 7.3 uses it.
- Property tests are tagged with their numbers and requirement clauses. Unit tests cover the DOM, timer, clipboard and storage paths where properties do not apply.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "5.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "4.1", "5.2", "6.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "4.2", "4.3", "4.4", "5.3", "6.3", "7.2"] },
    { "id": 3, "tasks": ["4.5", "7.1"] },
    { "id": 4, "tasks": ["7.3"] },
    { "id": 5, "tasks": ["7.4", "7.5", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3"] },
    { "id": 9, "tasks": ["10.4"] }
  ]
}
```

## Follow-up Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["12.1", "12.5", "12.8", "12.9"] },
    { "id": 1, "tasks": ["12.2", "12.3", "12.6", "12.10"] },
    { "id": 2, "tasks": ["12.4", "12.7", "12.11"] },
    { "id": 3, "tasks": ["12.12", "12.13"] },
    { "id": 4, "tasks": ["13"] }
  ]
}
```
