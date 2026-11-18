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

- [x] 14. Second follow-up (a): read-only cache test in the Verifier
  - [x] 14.1 Add `cachePeek` and `missingLines`
    - Read `packages/verifier/src/cache-access.ts`, `lookup.ts` and `index.ts` first. In `cache-access.ts` add `cachePeek(deps, key, guard)`: it reads through the existing `readStore`, applies the guard and bumps no counter. In `lookup.ts` add `missingLines(records, deps): Promise<readonly string[]>`, which returns the Citation_Lines of `planLookup(records).lines` for which `cachePeek(deps, line, isCachedLine)` is `undefined`. It never calls `cacheGet` or `cacheSet`. Export `missingLines` from `index.ts`. Change no existing export, type or result; do not touch `packages/courtlistener-mcp`.
    - _Requirements: 24.7, 24.8, 24.9, 24.14_

  - [x]* 14.2 Write property test for missing lines
    - **Property 5: Missing lines agree with the lookup**
    - Create `packages/verifier/test/missing-lines.properties.test.ts` with one `fc.assert(fc.property(...))`, `// Property 5` above it and `_Requirements: 24.7, 24.8, 24.9, 24.14_` in the `describe` title. Build the records, the seeded memory cache (valid entries, entries that fail `isCachedLine`, absent lines) and the recording `fetch` with fast-check combinators in the verifier test support folder, not in the shared engine arbitraries. Assert the three clauses of design S7 (set equality with the lines `lookupWithInfo` sends and empty exactly when it sends none; store contents and `hits`, `misses` and `writes` unchanged; `lookupWithInfo` result equal whether or not `missingLines` ran first). Run `packages/verifier/test/inventory.test.ts` and keep it green; update it only if it lists files.
    - **Validates: Requirements 24.7, 24.8, 24.9, 24.14**

  - [x]* 14.3 Write example tests for `missingLines`
    - In `packages/verifier/test/lookup.test.ts` or a new `missing-lines.test.ts`: all lines cached gives `[]`; a partly cached list gives only the missing lines; `{records: []}` and short-form-only records give `[]`; an `unchecked` line is never cached so it is listed; a store whose `get` rejects lists the line as missing; the file store gives the same answer as the memory store.
    - _Requirements: 24.7, 24.8, 24.14_

- [x] 15. Second follow-up (b): the verify route and its rate limit
  - [x] 15.1 Change `handleVerify` and the limiter
    - Read `src/server/rate-limit.ts`, `src/server/verify-route.ts` and `app/api/verify/route.ts` first. In `rate-limit.ts` export `VERIFY_LIMIT = 10` and `VERIFY_CEILING = 60`, each built with `createFixedWindowLimiter` and `routeGuard`, one limiter per constant; `OPINION_LIMIT` stays 30. In `handleVerify` follow design S1: method check; in live mode the ceiling before the body is read; the unchanged body, text, shape, record count and record checks; in live mode `missingLines`, and when it returns at least one line the Verify_Limit count once; then `lookupWithInfo`. Fixtures mode applies neither limit and reads no cache for limiting. The 429 sentence `CHECKS_BUSY` and the headers from `tooManyRequests` stay as they are. Update the comments in `rate-limit.ts` and `verify-route.ts` ("6 requests per address per minute", "429 before the body is read") to state the new rule.
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.10, 24.11, 24.12, 24.13, 24.14, 24.15, 24.16, 24.17, 24.18, 24.19, 24.25_

  - [x]* 15.2 Write tests for the route and the limit
    - In `apps/web/test/route-limits.test.ts` replace the test "refuses before the body is read or any lookup is made" with tests of 24.3, 24.16 and 24.17, and rewrite the tests that call `handleVerify` six or seven times with `fixturesDeps()` so that they count Service_Requests. Add one example per row of the S1 table, built with a live guard, a memory cache and a recording `fetch`, a clock for the window and separate addresses: a cache that holds every line of a draft answers 200 on every repeat up to the ceiling and calls the service once (cached draft never trips the limit); uncached requests answer 200 up to 10 and 429 at the eleventh, 200 again in the next window, and each address counts alone; a partly cached request, `{"records":[]}`, an `unchecked` line that is never cached, and a request refused by the limit count as 24.13, 24.14, 24.12 and 24.3 say; the 61st request of any kind answers 429 before the body is read; a cache entry that vanishes between the two reads neither refuses nor double counts; a malformed or oversize body at the limit answers 400 or 413; the 429 sentence and headers equal the earlier tests; fixtures mode never limits; `/api/opinion/[clusterId]` still allows 30. Keep `apps/web/test/rate-limit.properties.test.ts` green with no edit unless it names the old constant.
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.11, 24.12, 24.13, 24.14, 24.15, 24.16, 24.17, 24.18, 24.20, 24.21, 24.22, 24.23, 24.24_

  - [x] 15.3 Update `docs/DEVELOPMENT.md`
    - Replace "In live mode `/api/verify` allows 6 requests" with the new rule: 10 requests per client address per minute that reach the citation service, answered-from-cache requests not counted, and a ceiling of 60 requests of any kind per address per minute; `/api/opinion/[clusterId]` stays 30; demo mode is never limited. State the README line about request limits too if it gives the number.
    - _Requirements: 24.25_

- [x] 16. Second follow-up (c): the divergence sentence
  - [x] 16.1 Add `divergenceSentence`
    - Read `src/client/divergence.ts`. Add the export `divergenceSentence(quoteText, prefixLength)` as design S4 gives it, built on `divergenceWords`, `wordsOf` and `firstWordIndex`, which keep their signatures. It returns "" for a quotation with no word, `Differs from the opinion from the first word: "<words>"` when the divergence falls at the first word, and otherwise `Matches the opinion up to "<lead><tail>", then differs: "<words>"` with a leading "… " only when more than three words precede the tail. Straight `"`, U+2026, no exclamation mark.
    - _Requirements: 27.1, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10, 27.11, 27.12, 27.13_

  - [x] 16.2 Use it in every caller
    - Read `src/client/check-rows.ts`, `issues-list.tsx`, `src/check/result-list.tsx`, `src/components/use-pane.ts` and the Status_Bar stylesheet in `src/pane/`. `divergenceFor` in `check-rows.ts` returns `divergenceSentence(...)` or `null` when it is empty. The Issues row and the result list show the sentence alone with no "Diverges at: " prefix. `composeStatus` in `use-pane.ts` shows `statusText`, two spaces, then the sentence, and calls no other function. Make sure the status element has `white-space: nowrap`, `overflow: hidden` and `text-overflow: ellipsis`, adding the missing ones in the Pane stylesheet. No caller builds any part of the sentence. The Export dialog, Copy_Text, Statement, Appendix and DOCX are not edited.
    - _Requirements: 27.2, 27.3, 27.11, 27.15, 27.16_

  - [x]* 16.3 Write property test for the divergence sentence
    - **Property 4: Divergence sentence**
    - Create `apps/web/test/divergence.properties.test.ts` with one `fc.assert(fc.property(...))`, `// Property 4` and `_Requirements: 27.1, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10, 27.11, 27.12, 27.14_` in the `describe` title, `numRuns: runs()`. Compute the expected word index by scanning code units, independently of `wordsOf`. Assert clauses 1 to 5 of design S7 (empty for no words and the character set; the first-word form; the tail form with the leading ellipsis only above three words; at most three tail words and six differing words; adding words after the divergence or changing white space between words leaves the part before "then differs" unchanged). Add the quotation-text arbitrary (Unicode words, curly marks, runs of white space) to `packages/engine/src/testing/arbitraries.ts` through `arb-check-results.ts`.
    - In `apps/web/test/static/inventory.test.ts` add "4" to the expected sorted list, change the title and the count (eighteen), and add Property 4 of citation-check-page to the comment above it. The inventory scan lists numbers across all files by the `// Property N` marker, so a number may repeat across specs; keep the sorted list exact.
    - **Validates: Requirements 27.1, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10, 27.11, 27.12, 27.14**

  - [x]* 16.4 Update Property 1 for the sentence
    - **Property 1: One answer** (updated). In `apps/web/test/check-rows.properties.test.ts` keep one `fc.assert(fc.property(...))` and `// Property 1`. Clause 5 now says that for each failing quotation row with a mismatch result, `row.divergence` equals `divergenceSentence(quote text, prefixLength)` and is `null` when that sentence is empty or the row is not a mismatch; `mismatch` and `href` as before. Add 27.16 to the `describe` title and to **Validates**. The expected sentence is computed from `document.quotations`, never from the rows. The inventory count does not change.
    - **Validates: Requirements 6.9 as replaced by 27.2 and 27.16, 8.1, 19.13**

  - [x]* 16.5 Write example tests for the sentence and its callers
    - `divergence.test.ts`: examples for the first-word, short-quote (fewer than three words, no ellipsis), mid-word, no-word and long-quote (leading ellipsis) cases, and the demo motion quotation reading `Matches the opinion up to "a pro", then differs: "se plaintiff who alleges retaliation is…"`.
    - Update `issues-list.test.tsx`, `check-page.test.tsx`, `demo-path.test.tsx` and `app-shell.test.tsx` to the new text. Add a test that the Pane status text is `statusText`, two spaces and the sentence, and that the status element carries the three single-line declarations. Add a test that the DOCX, Statement, Appendix, full serialisation and Copy_Text of a document with a mismatch quotation are byte-equal to the values before this change.
    - _Requirements: 27.2, 27.3, 27.11, 27.15, 27.17_

- [x] 17. Second follow-up (d): saved display information
  - [x] 17.1 Add `storableInfo` and the `resolved` field to the Persisted_Value
    - Read `src/persist.ts`, `src/client/resolved.ts` and `src/client/link.ts`. In `resolved.ts` add `storableInfo(document, info)`, which keeps an entry only when the Document has a Full_Citation with that key whose result is `verified` or `wrong_case` and whose `clusterId` equals the entry's. In `persist.ts` add `SavedInfo` and the optional `resolved` field (version stays 1), give `serialise` a fifth argument `ReadonlyMap<IssueKey, DisplayInfo> | null` that writes the field in key order through `storableInfo` only when it is not empty, add `asResolved` that returns an empty map for an absent or non-array field and drops each invalid entry, and add `resolved` to `Restored`. `deserialise` gains no new `PersistError` kind.
    - _Requirements: 25.1, 25.2, 25.7, 25.8, 25.9, 25.10, 25.12, 25.15, 25.19_

  - [x] 17.2 Seed on restore, clear on edit and replacement, write on change
    - Read `src/autosave.ts`, `src/components/use-autosave.ts`, `src/components/use-verify.ts`, `src/client/verify-flow.ts`, `src/draft-gate.ts` and `src/saved-draft.ts`. The mount-time load returns `resolved` with the Document, and `use-verify.ts` seeds its session with the epoch of the store after the restore. New, Open, a sample, a Hand_Over and a restore bump the epoch as today, so only a restore seeds entries. Prune the session with `storableInfo` on each store change so an edit that clears a citation's result drops its entry in memory and in the same write. `use-autosave.ts` adds the session's info to the values that schedule the 300 ms write and passes it to `serialise`; while the Draft_Gate is blocked nothing is written. The Draft_Gate blocks for `not_json`, `bad_shape` and `bad_codes` only. Do not edit `saved-draft.ts`, the print view or the `/check` sources.
    - _Requirements: 25.3, 25.4, 25.5, 25.6, 25.11, 25.12, 25.13, 25.14, 25.17, 25.18_

  - [x]* 17.3 Write property test for the saved display information
    - **Property 3: Saved display information round trip**
    - Create `apps/web/test/persist-resolved.properties.test.ts` with one `fc.assert(fc.property(...))`, `// Property 3` and `_Requirements: 25.1, 25.2, 25.7, 25.15, 25.16, 25.19_` in the `describe` title, `numRuns: runs()`. Use the existing document arbitraries and add a saved-entry list arbitrary (valid, stale `clusterId`, unknown key, wrong types) to `arb-check-results.ts`. Assert the three clauses of design S7: the round trip returns the Document and exactly the entries `storableInfo` keeps; the restored Document, its `render(..., "full")` text and a DOCX built with a fixed clock are byte-identical to those restored from `serialise(..., null)`; the string with `info` null has no `resolved` key and no draft text outside `codes` and the entries' own fields.
    - In `apps/web/test/static/inventory.test.ts` add "3" to the expected sorted list, set the count to nineteen, and update the title and comment.
    - **Validates: Requirements 25.1, 25.2, 25.7, 25.15, 25.16, 25.19**

  - [x]* 17.4 Write example tests for the stored information
    - `persist.test.ts` and a new `resolved-restore.test.tsx`: verify, reload, the same Resolved_List rows and the same CourtListener addresses with no Verify_Run; edit a citation and its entry and its row go and the stored value no longer holds the entry; New, Open, a sample and a Hand_Over clear the entries; a value with no `resolved` field loads and shows no Resolved_List; a non-array field is ignored and leaves the Draft_Gate open; one bad entry is dropped and the others kept; a stale `clusterId` entry is ignored at use; no write while the Draft_Gate is blocked; a completed run writes after the 300 ms debounce. Add: the exported DOCX bytes are unchanged whether or not entries are stored; Save a copy downloads exactly the stored string, which includes the field; the print view ignores the field; the `/check` page writes nothing to storage (the existing static scan stays as it is).
    - _Requirements: 25.3, 25.4, 25.5, 25.6, 25.8, 25.9, 25.10, 25.11, 25.12, 25.13, 25.14, 25.16, 25.17, 25.18, 25.20_

  - [x] 17.5 Amend the earlier texts and comments
    - Change the comments in `link.ts`, `resolved.ts`, `use-verify.ts` and `verify-flow.ts` that call the Display_Info "memory only" to say it is kept in memory and stored with the saved draft, and never stored in the Document. Add one line, "Replaced by citation-check-page Requirement 25", at: `case-match` Requirement 7 criteria 5 and 6 and its design table "What is stored where" and the label "Display_Info, session only"; `editor-app` Requirement 9 criterion 2 and limitation L11. Edit no other words of those specs. Run the static scans that read comments.
    - _Requirements: 25.21, 25.23_

- [x] 18. Second follow-up (e): the Avianca sample comes first
  - [x] 18.1 Reorder the Toolbar, the Empty_Page links and `nextStep`
    - Read `src/components/toolbar.tsx`, `toolbar.module.css`, `next-step.ts`, `editor-surface.tsx` and the handler behind "Load the Avianca citations". `nextStep` returns `load-avianca` in place of `load-demo` while the text is empty and no run is in flight, and `PRIMARY_LABEL["load-avianca"]` is "Load Mata v. Avianca". The Toolbar shows, directly after Open, "Load Mata v. Avianca" (primary exactly when `nextStep` is `load-avianca`) and then "Load demo motion" (never primary, label, action and confirm unchanged). The Avianca button calls the existing handler, passed to `Toolbar` as a prop, so there is one implementation. The Empty_Page links read, in order, "Load the Avianca citations", "Load demo motion", "Open a draft", with the wording kept, no icon and no `data-primary`. The other `nextStep` rules and the Check_Page's action order are not touched.
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.11, 26.12, 26.17_

  - [x] 18.2 Update `ui.md`, the README Demo path and `docs/demo-script.md`
    - `.kiro/steering/ui.md`: the Primary rule says "Load Mata v. Avianca when the text is empty" and the Empty_Page copy rule gives the order Avianca, demo motion, Open a draft. README "Demo path": step 2 names the Demo_Sample button as the second sample button and says the Avianca sample is the first offered. `docs/demo-script.md`: the row at 0:00 says to select **Load demo motion** (the second sample button) and the closing sentence about the Avianca sample says it is the first button. Keep `docs.test.ts` green and the README free of exclamation marks.
    - _Requirements: 26.13, 26.14, 26.15, 26.18_

  - [x]* 18.3 Update and add tests for the new order
    - Update to the new order, primary and Next_Step value: `app-shell.test.tsx`, `unreadable-draft.test.tsx`, `open-empty-page.test.tsx`, `editor-surface-links.test.tsx`, `avianca.test.tsx`, `samples-declaration.test.tsx`, `next-step.test.ts`, `next-step.properties.test.ts` and `next-step-gap.properties.test.ts` (their `// Property N` markers and `fc.assert` counts stay as they are, so the inventory is unchanged). Add to `toolbar.test.tsx`: the Avianca button is first after Open and primary on empty text, the demo button is plain, labels are "Load Mata v. Avianca" and "Load demo motion", no primary while a run is in flight, the confirm on a non-empty draft, and `AVIANCA_FAILED` on a failed fetch.
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.11, 26.12, 26.16_

  - [x] 18.4 Measure both Sample_Buttons at 1150px in a real browser
    - Start `pnpm dev` (as the user's terminal command, not as a blocking shell call) and run a throwaway Playwright (Chromium) probe, not committed and deleted afterwards, as design S3 lists: viewport 1150 by 800 with an empty draft and cleared `localStorage`; the same with an "Opened ...: n characters" notice and with a long notice such as `DOCUMENT_TOO_LONG`; for each of the two buttons `getBoundingClientRect` width and height, `scrollWidth` against `clientWidth` and height against 30px; for the Toolbar `scrollWidth` against `clientWidth`, the width of the notice area, and whether the Court rules link and the last Toolbar item are visible inside the Toolbar; the same readings at 1280px. Report every value in the task's result. If any button wraps, clips or the Toolbar overflows or hides the Court rules link, STOP, report which button, which width and by how much, and do not pick a remedy (shorter label, shorter Demo_Sample label or one load button are for the author to choose). Do not change the labels or the stylesheet in this task.
    - _Requirements: 26.8, 26.9, 26.10_

- [x] 19. Second follow-up (f): one link to the editor on `/check`
  - [x] 19.1 Render one editor link from one value
    - Read `src/check/check-page.tsx`. Compute `showEditorLink = wide && !stale && text !== ""` once, render `EditorLink` when it is true, and pass `showEditor={!showEditorLink}` to `PageLinks`, which renders "Open the editor" only when `showEditor` is true and always renders "See all court rules". The server snapshot of `wide` stays false, so the server HTML holds the footer link and no Editor_Link.
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6_

  - [x]* 19.2 Write tests for the single link
    - In `check-page.test.tsx` and `check-editor-link.test.tsx`: exactly one link to the editor at 375px with text (the footer link), at 1280px with text (the Editor_Link only), at 1280px with an empty box (the footer link), at 1280px with out-of-date results (the footer link); the swap on a live width change, on emptying and filling the Draft_Box, and when results go out of date, with no reload; "See all court rules" present in every case; the server HTML holds the footer link and no Editor_Link. Keep the `check-literals` and `check` scans green.
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7_

- [x] 20. Second follow-up (g): documents
  - [x] 20.1 Update `README.md`
    - Make the README consistent with Requirements 24 to 28 and keep every assertion of `docs.test.ts` true, including no exclamation mark. "What leaves your machine": say that the saved draft in this browser also holds the case names found for verified citations and that nothing of this is sent anywhere. "Limits": state the request limits if the README gives a number. Check that "Demo path" still agrees with task 18.2.
    - _Requirements: 25.22, 29.5, 29.7_

  - [x] 20.2 Update `.kiro/steering/ui.md`
    - Check that the Primary rule, the Empty_Page rule and the Toolbar text agree with task 18.1, and add to the one-column pages rule that the checking page shows one link to the editor. Add no Token.
    - _Requirements: 26.13, 28.9, 29.5_

  - [x] 20.3 Check `docs/DEVELOPMENT.md`
    - Confirm the request-limits line written in 15.3 agrees with the code constants (`VERIFY_LIMIT` 10, `VERIFY_CEILING` 60, `OPINION_LIMIT` 30) and fix any difference.
    - _Requirements: 24.25, 29.5_

  - [x] 20.4 Update `docs/KIRO_USAGE.md`
    - Add a row for the `ui.md` edit of this follow-up. Keep the row for this spec listing `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`. Run `pnpm kiro:check` and add any row the inventory asks for.
    - _Requirements: 29.5, 29.6_

  - [x] 20.5 Add the `BUILD_LOG.md` entry
    - Add a dated entry for the second follow-up with a section "What Kiro got wrong, and what fixed it". The agent that lands this task writes the sentences in plain words, in the third person, and states these six facts: all five findings were found by a reviewer using the live site cold and none by a test; the limit counted requests that were answered from the cache; the display information for found cases did not survive a reload; the empty page led with the demo motion while every instruction starts with the Avianca sample; "Diverges at" read as clipped text to two readers; and `/check` showed two links to the editor. Then name each finding with its requirement (24 to 28), the measured values the design used (10 and 60 per minute, 6 and 5 distinct Citation_Lines in the two samples, and the Toolbar widths measured in task 18.4), and the four earlier decisions it reverses (6 a minute counting every request, 429 before the body is read, memory-only Display_Info, the demo motion as the primary sample). Make no first-person claim as the user.
    - _Requirements: 29.1, 29.2, 29.3, 29.4_

- [x] 21. Final checkpoint
  - After the last edit, run in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build` from a clean clone after `pnpm install`) and `pnpm kiro:check`. Fix any failure and rerun all of them after the fix.
  - Confirm `git status` shows a clean working tree with everything committed. Do not push. Ask the user if questions arise.
  - _Requirements: 29.8, 29.9, 29.10_

- [x] 22. Third follow-up (a): sample buttons only while the draft is empty
  - [x] 22.1 Show the Sample_Buttons only for an Empty_Draft
    - Read `src/components/toolbar.tsx`, `toolbar.module.css`, `app-shell.tsx` and `editor-surface.tsx`. Define `empty = text.length === 0` once in the Shell and pass it to the Toolbar and to the Empty_Page links, replacing any second copy. The Toolbar renders "Load Mata v. Avianca" and "Load demo motion" after Open only when `empty` is true; with text they are not in the DOM. `nextStep`, `PRIMARY_LABEL`, `loadOrAsk` and `useDocumentActions` are not edited. Amendment note: this amends criterion 26.2; the earlier text of Requirement 26 stays.
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 31.1_

  - [x] 22.2 Rewrite the five tests that reached the confirm through the buttons
    - Create `apps/web/test/support/document-actions-harness.tsx`, a harness that mounts the real AppShell over a store with non-empty text, with a wrapper around shell-toolbar that records the live `actions` (`onLoadDemo` and `onLoadSample`). Rewrite to call `onLoadDemo()` or `onLoadSample("avianca")` inside `act`, with every assertion unchanged: `avianca.test.tsx` "confirms on a non-empty draft; cancel keeps it, confirm replaces it"; `document-actions.test.tsx` the three tests (replace via the dialog; failed load keeps the draft and shows "Could not load the demo motion."; replacing clears the Verify result); `samples-declaration.test.tsx` "Load demo motion clears a stored Declaration and the dialog asks". Do not edit `loadOrAsk` to make a test pass.
    - _Requirements: 31.2, 31.3, 31.6_

  - [x] 22.3 Update and add the Toolbar tests
    - In `toolbar.test.tsx` and the order and primary tests of `app-shell.test.tsx`, assert the Sample_Buttons only for an empty draft. Add: neither Sample_Button is in the Toolbar once the draft has text; New brings both back after the confirm (Shell test). Check that no other test clicks a Sample_Button with text in the draft, and fix any that does by calling the action as task 22.2 does.
    - _Requirements: 30.2, 30.5, 30.6, 31.4, 31.5_

  - [x] 22.4 Update `ui.md`, the README Demo path and `docs/demo-script.md`
    - `ui.md` Layout Toolbar sentence and Controls Primary rule: the two sample buttons are shown only while the draft is empty; the order of steps in the Primary rule is unchanged. README "Demo path" and `docs/demo-script.md`: check that neither tells a reader to select a sample button with a draft loaded, and add "To switch samples, press New first." where a reader could be in a loaded draft. Keep `docs.test.ts` green and the README free of exclamation marks.
    - _Requirements: 30.7, 30.8, 30.9_

- [ ] 23. Third follow-up (b): room for the notice
  - [x] 23.1 Measure the notice in real Chromium, then stop or go on
    - After 22.1, start `pnpm dev` as a background process and run Playwright scripts kept in `/tmp` (not committed); stop the server afterwards. Follow design T4: enumerate every string set into the Toolbar notice (`notices.ts`, `open-messages.ts`, any other module) and give the longest one's text and its width on one line; produce notices by real actions (open a file for "Opened" and "Could not open", export for `EXPORT_UNSAFE_CHARACTER` if feasible, otherwise render the notice through the store and say so); at 1150, 1280 and 1440px, with an Empty_Draft and with a loaded draft, report the Notice_Area width and exactly how much of the longest notice is visible at 1150, 1280 and 1440px. If the longest fixed notice does not fit in two lines at 1280px with a loaded draft, STOP, report the numbers and pick no remedy: do not run 23.2 to 23.5. A very long file name may still be cut and is not a reason to stop. Report the numbers in the task result.
    - _Requirements: 32.5, 32.6, 32.7, 32.8_

  - [x] 23.2 Clamp the notice to two lines and add `title`
    - Only after 23.1 passes. Read `toolbar.module.css` first. Give `.notice` a two-line clamp (`display: -webkit-box`, `-webkit-box-orient: vertical`, `-webkit-line-clamp: 2`, `line-clamp: 2`, `overflow: hidden`, 13px / 16px, `overflow-wrap: anywhere`), keeping its other declarations. In `toolbar.tsx` set `title={props.notice ?? undefined}` on the `role="status"` element and keep the text child whole. Add no width at-rule, no animation and no colour literal. Confirm in Chromium, with the 23.1 script, that the Toolbar stays 52px high and that the longest notice shows in two lines at 1280px.
    - _Requirements: 32.1, 32.2, 32.3, 32.4_

  - [x] 23.3 Add the notice tests
    - Create `apps/web/test/toolbar-notice.test.tsx` (the whole text and the `title` are in the DOM; a notice of at least 200 characters keeps its whole text and its `title`; no notice gives no `title`) and a static scan for `toolbar.module.css` (two-line clamp and `overflow: hidden` on `.notice`; no width at-rule, no `animation`, no `transition`, no colour literal), added to the existing css-rules scan or as `static/toolbar-notice-css.test.ts` after reading that scan. No snapshot tests; no property test is added, so the inventory count stays.
    - _Requirements: 32.1, 32.2, 32.3, 32.4, 32.11_

  - [x] 23.4 Update `ui.md` and `docs/KIRO_USAGE.md`
    - `ui.md`: state the notice rule (at most two lines, ellipsis, full text in `title`, whole text in the DOM) in the Toolbar text and in Copy. `docs/KIRO_USAGE.md`: add a row for the `ui.md` edit if the inventory asks, and keep the row for this spec listing `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`. Keep `docs.test.ts` and `pnpm kiro:check` green.
    - _Requirements: 32.9_

  - [~] 23.5 Update `BUILD_LOG.md`
    - In the second follow-up entry, replace the "Open observation" paragraph in place with the 23.1 numbers, in the third person and in plain words: the notice area width at 1150, 1280 and 1440px with and without a draft, the longest notice and its one-line width, and how much of it shows at each width. Add a short third follow-up entry: the author walked the build and found that the first fix took the notice's room; no test found it; the Sample_Buttons now show only while the draft is empty; the guard in `loadOrAsk` stays because a silent replacement of a draft would be the worst failure, though no control reaches it with text. Make no first-person claim as the user.
    - _Requirements: 31.6, 32.5, 32.10_

- [~] 24. Final checkpoint
  - After the last edit, run in order: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build` from a clean clone after `pnpm install`) and `pnpm kiro:check`. Fix any failure and rerun all of them after the fix.
  - Confirm `git status` shows a clean working tree with everything committed. Do not push. Ask the user if questions arise.
  - _Requirements: 29.8, 29.9, 29.10_

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

## Second Follow-up Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["14.1", "16.1", "17.1", "18.1", "19.1"] },
    { "id": 1, "tasks": ["14.2", "14.3", "15.1", "16.2", "16.3", "17.2", "18.2", "18.3", "18.4", "19.2"] },
    { "id": 2, "tasks": ["15.2", "15.3", "16.5", "17.3", "17.4", "17.5"] },
    { "id": 3, "tasks": ["16.4"] },
    { "id": 4, "tasks": ["20.1", "20.2", "20.3", "20.4"] },
    { "id": 5, "tasks": ["20.5"] },
    { "id": 6, "tasks": ["21"] }
  ]
}
```

## Third Follow-up Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["22.1"] },
    { "id": 1, "tasks": ["22.2", "22.3", "23.1"] },
    { "id": 2, "tasks": ["22.4", "23.2"] },
    { "id": 3, "tasks": ["23.3", "23.4"] },
    { "id": 4, "tasks": ["23.5"] },
    { "id": 5, "tasks": ["24"] }
  ]
}
```
