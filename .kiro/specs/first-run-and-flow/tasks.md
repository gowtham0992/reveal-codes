# Implementation Plan: first-run-and-flow

## Overview

The plan changes `apps/web` in six groups, in the order of Requirement 14, criterion 5: (1) the Pane preference, the Pane_Header with Legend and the Failing_Code style; (2) the Primary_Button rule with Property 1, the Verify_Summary and the Unchecked_Row; (3) the assistant lines, the Override_Dialog text and the Export_Dialog width and copy; (4) the small-screen rules; (5) optional page marks; (6) documents, steering and one final checkpoint. Engine, Verifier, Export_Package, MCP server and Sentinel are not touched.

Task count: **23 leaf tasks** (numbered `N.M`), one of them a checkpoint (6.3). Group 5 (5.1 to 5.3) is optional. Exactly one property is added, Property 1, in task 2.2.

Conventions that apply to every task:

- Paths are repository-relative. Source modules stay at 300 lines or fewer and functions at 40 lines or fewer. No `any`, no default exports outside Next route files, no `try/catch` that swallows an error (tech.md).
- All tasks follow `ui.md`: no component library, no icon, no animation or transition, no new colour outside the Pane (`#AAAAAA` and `#AA0000` only in `apps/web/src/pane/`), text labels only, no exclamation marks. The static scans in `apps/web/test/static` enforce this.
- No file under `packages/engine`, `packages/verifier`, `packages/export`, `packages/courtlistener-mcp` or `crew/sentinel` changes, no `package.json` dependency is added and no lockfile changes (Req 14.1, 14.2).
- Example tests belong to the task that changes the behaviour. They are not separate tasks, and the tests that assert old behavior are updated in the same task (Req 12.14). Tests use no new `vi.mock`, never mock the Engine, and have no swallowing `try/catch` (Req 12.15).
- Task completion notes record anything Kiro got wrong and the fix, for the BUILD_LOG entry in task 6.2.
- The spec files are committed with a first line `spec(first-run-and-flow): <subject>` (at most 72 characters) before task 1.1 runs (Req 14.4). This is a git step by the owner, not a task.
- Tasks must not run `pnpm dev` or watchers. Single runs only, for example `pnpm vitest run --project web <file>`.
- There is no checkpoint before the last task. Each task runs its own affected tests; the full set runs once in 6.3.

## Tasks

- [x] 1. Pane preference, Pane_Header with Legend, and Failing_Code style
  - [x] 1.1 Pane preference module and saved-draft check
    - Create `apps/web/src/pane-preference.ts`: `PANE_KEY = "reveal-codes:pane:v1"`, `encodePreference`, `decodePreference` (null is First_Visit; extra fields allowed; JSON parse catches only `SyntaxError`), `readPreference`, `writePreference` (returns `Result`, the caller ignores it), `initialPaneOpen`.
    - In `apps/web/src/persist.ts` add `readRaw(storage, key)` (moved from `app-shell.tsx`, same value-not-throw shape; update the import there) and `savedDraftExists(storage)` (true only when `deserialise` gives a Document whose text is not empty).
    - Add `pane-preference.ts` to the state-module regex in `apps/web/test/static/boundaries.test.ts`.
    - Add `apps/web/test/pane-preference.test.ts`: round trip for `true` and `false`; malformed values (`"x"`, `"{}"`, `{"version":2,"open":true}`, `{"version":1,"open":"yes"}`, `null`, `[]`) read as First_Visit; throwing `getItem` reads as First_Visit; throwing `setItem` returns an error value and does not throw; `initialPaneOpen` for stored true, stored false, no value without draft, no value with draft, and a draft that restores to empty text.
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.7, 1.8, 1.11, 12.1_

  - [x] 1.2 Pane control: open on first visit and remember the state
    - In `apps/web/src/components/use-pane.ts` change `usePaneControl` to start closed, run one mount effect that sets the state from `initialPaneOpen(svc.storage)` and sets `ready`, and write the Pane_Preference from one effect keyed on `[ready, open, svc]` (ignore the result, set no Notice). Leave the Alt-F3 and F7 listener unchanged. "New" must not touch the key.
    - Update `apps/web/test/app-shell.test.tsx` and `apps/web/test/document-actions.test.tsx` where they assert the Pane hidden on first load. Add examples: first visit with no draft opens the Pane; stored `open: false` stays closed; stored `open: true` opens it (with and without a draft); first visit with a draft starts closed; the first-visit choice is written; an Alt-F3 toggle and the Toolbar button write the new state; a reload keeps the state; New leaves the key; throwing `setItem` keeps the in-memory state with no Notice.
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 1.10, 12.1, 12.14_

  - [x] 1.3 Failing flags in the Pane layout and the Failing_Code style
    - Create `apps/web/src/pane/failing.ts` with `failingFlags(positions)`: two stacks, one per kind (CIT, QUO); opening `CIT ✘`, `CIT ?` and `QUO ✘` push true and are failing; other openings push false; `/CIT` and `/QUO` pop their own stack and are failing when the popped value is true (empty stack gives false); every other code is not failing. Read only `positions`.
    - In `apps/web/src/pane/layout.ts` add `failing: boolean` to the code item, call `failingFlags` once in `layoutPane`, and export `lineAt(text, offset)` (1 plus the newlines before the clamped offset, the line number inside the Status_Position) and `lnPos(text, offset)` built on it; `statusText` calls `lnPos` with identical output.
    - Create `apps/web/src/pane/code-class.ts` with `cls(...names)` and `codeClass(family, failing)`. Use `codeClass` in `ItemView` in `apps/web/src/pane/pane.tsx`.
    - In `apps/web/src/pane/pane.module.css` remove `.failed`, add `.failing { color: #ffffff; background: #aa0000; outline: none; }` after `.code`. Keep `.pending`.
    - Add `pane/failing.ts` to the layout regex in `apps/web/test/static/boundaries.test.ts`.
    - Add `apps/web/test/failing.test.ts` and update `layout.test.ts` and `pane.test.tsx`: opening and closing codes of a failing citation and a failing quotation carry the `failing` class; the closer of a verified citation and every other code do not; `CIT ?` is failing and `CIT …` is not; a quotation inside a failing citation does not consume the citation's closer; an unbalanced closer is not failing; item text and offsets still equal `render(document, "display")` (editor-app Property 4 stays green); `lineAt` examples (offset 0, after a newline, past the end clamped) and `statusText` output unchanged.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 12.3, 12.14_

  - [x] 1.4 Pane_Header with Legend
    - Create `apps/web/src/pane/pane-header.tsx` with the `LEGEND` constant (seven entries in the order of Requirement 2.4, each with `family` and `failing`) and `PaneHeader`: a `div` with the text "Reveal Codes" at the left and the Legend at the right; each code drawn with `codeClass(family, failing)`, entries joined by ` · `; `onMouseDown` calls `preventDefault`; no `aria-hidden`, no `role`, no `aria-label`.
    - In `apps/web/src/pane/pane.tsx` render `PaneHeader` as a sibling above the scrolling Pane_Body (flex column), only while the Pane is open.
    - In `apps/web/src/pane/pane.module.css` add `.header` (flex, wrap, space-between, `#0000aa` on `#aaaaaa`, Pane font family, 12px) and `.legend` (`white-space: pre-wrap`).
    - Update `apps/web/test/pane.test.tsx` and `pane-css.test.ts`: the seven Legend codes and words in order and the joined string; no `aria-hidden`, `role` or `aria-label` in the header; header colours and 12px; the header is a sibling of the scrolling body; `mousedown` on the header is default-prevented and the Editor selection stays; nothing of the header in a closed Pane.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 12.2_

  - [x] 1.5 Css_Scan: Pane colours and contrast
    - In `apps/web/test/static/css-rules.test.ts` change `FAMILY_COLOURS`: remove `failed`, add `failing: ["#FFFFFF", "#AA0000"]` and `header: ["#0000AA", "#AAAAAA"]`.
    - Add a source scan over `apps/web/app/**` and `apps/web/src/**` (`.css`, `.ts`, `.tsx`) outside `apps/web/src/pane/`: any `#AAAAAA` or `#AA0000` in any letter case is a violation. Add a planted-violation self-test.
    - In `apps/web/test/pane-css.test.ts` compute the contrast ratio with the WCAG relative-luminance formula from colours read out of `pane.module.css`; assert 7.75 for the failing pair with a floor of 7:1, and 5.72 for the header pair, both to two decimals.
    - _Requirements: 3.7, 12.3, 12.11_

- [x] 2. Primary button, Verify summary, and collapsed unchecked row
  - [x] 2.1 `nextStep`, the Toolbar `step` prop, and the primary style
    - Create `apps/web/src/components/next-step.ts`: `NextStep`, `NextStepInput`, `nextStep` (rules in order: verifying gives `none`; empty gives `load-demo`; `verifiableUnchecked > 0` gives `verify`; otherwise `export`, whatever `blocking` is) and `PRIMARY_LABEL`. Pure, no React.
    - Add `countVerifiableUnchecked(document)` to `apps/web/src/client/verify-flow.ts`: unchecked full citations (`CIT …`) plus unchecked quotations (`QUO …`) whose attributed citation Verify can check or re-check (a full citation of any status, or a short form whose `targetStart` points at a full citation, found as `ownerCluster` does by `citationStart`). A quotation with no attached citation, or attached to a short form with no target, is not counted. The count is 0 when `hasFullRecord(document)` is false.
    - In `apps/web/src/components/toolbar.tsx` add the prop `step: NextStep`; set `data-primary="true"` on the one button the step names and on no other. Move `ShellToolbar` out of `app-shell.tsx` into `apps/web/src/components/shell-toolbar.tsx`; it calls `nextStep` and passes `step`.
    - In `apps/web/app/globals.css` add the two primary rules only: `button[data-primary="true"]:not(:disabled)` (`background: var(--ink); color: var(--paper)`) and its `:hover:not(:disabled)` form (`background: var(--paper); color: var(--ink)`). No border, padding, font, height or transition in these rules.
    - In `apps/web/test/static/css-rules.test.ts` add the primary-rule check: exactly one rest rule and one hover rule with `data-primary`, in `globals.css` only; values only `var(--ink)` and `var(--paper)`; neither sets `border`, `padding`, `transition`, `font-size` or `height`; the hover rule sets only `background` and `color`; the `button` rule keeps `border: 1px solid var(--ink)` and `padding: var(--button-pad)`; no other stylesheet mentions `data-primary`.
    - **Hover-scan exception.** In `controlViolations` in the same file, allow `color` in a `:hover` selector only when the selector contains `[data-primary="true"]`; `background` stays allowed everywhere. Add a planted self-test showing that `a:hover { color: ... }` is still reported.
    - Add `apps/web/test/next-step.test.ts` (one example for each of `load-demo`, `verify`, `export`, `none`), add `countVerifiableUnchecked` examples to `verify-flow.test.ts` (all citations verified with one `QUO …` attributed to a full citation gives 1 and `verify`; a `QUO …` attributed to a short form with no target gives 0; a short form only gives 0 and `export`; unchecked items with no full citation give `export`) and update `toolbar.test.tsx` and `app-shell.test.tsx`: no `data-primary` while a run is in flight and Verify reads "Verifying…" in the ordinary disabled style; `data-primary` on exactly the named button otherwise; a disabled primary keeps `data-primary` and `disabled`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 12.4, 12.12, 12.14_

  - [x] 2.2 Property 1: one next step, and the inventory five-to-six change
    - Add `arbNextStepInput` to `apps/web/test/arbitraries.ts`: `fc.record` of two `fc.boolean()` and three counts (unchecked citations, unchecked quotations, blocking) each from `fc.oneof(fc.constant(0), fc.nat({ max: 50 }))`; `verifiableUnchecked` is the sum of the citation and quotation counts, so the generator reaches zero citations with unchecked quotations (must give `verify`) and both zero (must give `export`). Add the tag comment `Feature: first-run-and-flow, Property 1: one next step`.
    - Create `apps/web/test/next-step.properties.test.ts`: one `fc.assert(fc.property(...))` with `{ numRuns: runs() }`, a `// Property 1` comment above it, and a `describe` title `"Property 1: one next step _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7, 4.10, 4.12_"`. Render the real `Toolbar` with `renderToStaticMarkup` using `step = nextStep(input)`, count `data-primary="true"`, and assert at most one, none while verifying, otherwise exactly the button the ordered rule names (expected button from a table keyed by the rule outcome, not from a second `nextStep` call). The rule outcome is keyed on the sum of the unchecked citation and quotation counts, so a quotation-only input must name "Verify". Add the metamorphic clause: changing only the Blocking_Count never changes `nextStep`.
    - **Inventory five to six.** In `apps/web/test/static/inventory.test.ts` change the property inventory from five to six properties (`["1","1","2","3","4","5"]` by comment, property numbers being per spec) and name the new file. The "exactly one `fc.assert` per file with `{ numRuns: runs() }`" and "describe title ends with `_Requirements: ..._`" checks need no change.
    - _Requirements: 4.12, 12.13_

  - [x] 2.3 Verify summary logic; no counts Notice
    - In `apps/web/src/client/verify-summary.ts` remove `summaryNotice`; add `tallyDocument` (the private `tally` moved from `verify-flow.ts`), `summaryLines` (line 1 `Citations: ` with `<n> found`, `<n> not found`, `<n> ambiguous`, `<n> not checked`; line 2 `Quotations: ` with `<n> match`, `<n> not in the opinion`, `<n> not checked`; zero terms dropped, a line with no terms dropped whole; line 3 `Checked HH:MM`, left out when the date does not parse; then the further line), `furtherLine` (latest `waitUntil` among unchecked full citations gives `Some items were not checked; try Verify again after <HH:MM>.`; else skipped or unavailable gives `Some items were skipped; try Verify again.`; else null; null unless the outcome is `completed`) and `localTime` (two-digit local hours and minutes from `new Date(iso)`). Keep `FAILED_NOTICE`.
    - In `apps/web/src/client/verify-flow.ts` stop dispatching the counts Notice, import `tallyDocument`, keep the `FAILED_NOTICE` on failure, and on a `completed` outcome clear the Notice only when it equals `FAILED_NOTICE`.
    - Update `apps/web/test/verify-flow.test.ts` and `verify-summary.test.ts`: all terms; a zero term dropped; a whole line dropped; the Checked line (expected value built from local getters so it holds in any zone); the further line with the latest of two retry times; the skipped sentence; no further line on a clean run; unparseable `verifiedAt`; no counts Notice; failure Notice kept; stale failure Notice cleared by a good run.
    - _Requirements: 5.1, 5.3, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 12.5, 12.14_

  - [x] 2.4 `useVerify` and the Verify_Summary in the Issues region
    - Create `apps/web/src/components/use-verify.ts`: `useVerify(svc, store)` returns `{ running, start, disabled, note }`; the note is `useState`, set from `furtherLine(outcome, store.getState().document)` after a `completed` outcome (including null) and left alone after `failed` or `discarded`. Call it once in the component that currently holds the shell body in `app-shell.tsx`, and pass `running`, `start` and `disabled` to the Toolbar.
    - Create `apps/web/src/components/verify-result.tsx` and `verify-result.module.css`: a container `<div role="status" aria-label="Verify result">` that is always rendered; empty while `verifiedAt` is null, otherwise one `<p>` per line from `summaryLines`.
    - In `apps/web/src/components/issues-region.tsx` take `verifiedAt` and `note`, and render `VerifyResult` between the heading and the list. The Toolbar shows no result text after a run.
    - Update `app-shell.test.tsx`, `issues-shell.test.tsx` and `demo-path.test.tsx`: the summary appears after a run and not before; it disappears on New and Load demo; counts survive a reload while the further line does not; no result text in the Toolbar; the container has `role="status"`.
    - _Requirements: 5.2, 5.4, 5.5, 5.14, 5.15, 5.16, 12.5, 12.14_

  - [x] 2.5 Unchecked_Row in the Issues list
    - In `apps/web/src/components/issues-list.tsx` add props `collapseUnchecked` and `verify` (`{ start, disabled }`), export `issueText(document, issue)` (the existing shortening function over `document.text.slice(start, end)`), and render, while `collapseUnchecked` and the unchecked count is above zero, the Unchecked_Row first, then a row for each issue that is not unchecked. The text is `<n> citations and quotations have not been checked.` or `1 citation or quotation has not been checked.`; its button is a plain "Verify" with `onClick={verify.start}` and `disabled={verify.disabled}`, with no `data-primary`. "No issues." still shows only when the full list is empty.
    - In `issues-region.tsx` pass `collapseUnchecked={verifiedAt === null}` and the `useVerify` values. Heading, Blocking_Count and Export label are unchanged; `ExportIssues` stays uncollapsed.
    - Update `issues-list.test.tsx` and `issues-shell.test.tsx` (scope Verify queries to `role="toolbar"` or the Issues region): the row first, plural and singular text, individual rows after a run, the row's Verify making one request through the same handler, the row's button disabled with the Toolbar's, no row at zero, the Export dialog listing every item.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 12.6, 12.14_

- [x] 3. Assistant lines, Override dialog text, and Export dialog width and copy
  - [x] 3.1 Assistant lines and Reply_Box
    - In `apps/web/src/assistant-run.ts` add the pure helper `insertionLine(docText, op)` beside `buildInsertion`: `lineAt(docText, op.at)` (imported from `pane/layout.ts`) plus 1 when `op.text` starts with `"\n"` (the separator `asParagraph` adds; the reply's own leading newlines are stripped, so the lead is 0 or 1). It is the line of the first inserted character (Insertion_Line), computed from the text before the edit, never the caret line after it.
    - In `apps/web/src/components/use-assistant.ts` make `runDraft` return `{ message, inserted, insertedText }`. After `buildInsertion` it dispatches the edit and reads the result; `inserted = { line: insertionLine(textBefore, ops[0]), runId: insertion.run.runId, stopped }` only when `error === null` and text was inserted, for a completed run and for a stopped run with partial text alike (`stopped` true for the latter). `insertedText` is the reply text actually inserted, without the separating newlines. A failed, discarded, empty or rejected run, and a stopped run with no text, returns `inserted: null` and `insertedText: ""`.
    - In `useAssistantRun` add `started` and `inserted`. `start` sets `started` and `streaming`, clears `inserted`, `message` and `text` (this removes both the "Inserted at" and the "Stopped. Partial reply inserted" line of the previous run). At the end of a run set `message`, `inserted` and `text = insertedText`, so the box shows what is in the Document and never an earlier run's text. When the first run of the page session ends stopped with nothing inserted, set `started` back to false (no Reply_Box); a ref `shownBefore` marks that a later run is not the first, and for a later run `started` stays true and the box stays rendered and empty.
    - In `apps/web/src/components/assistant-panel.tsx` and `.module.css` add `position` to the props, render `Inserts at the cursor: <position>` directly above the Draft or Stop button, and render the Reply_Box only when `run.started`: a visible label "Last reply" as its accessible name (`aria-labelledby`), the text, then one line when `inserted` is set: `Inserted at Ln <l> as run <id>` for a completed run, or `Stopped. Partial reply inserted at Ln <l> as run <id>` when `inserted.stopped` (never both). Remove `aria-label="Streamed reply"`.
    - Pass `position` from `lnPos(document.text, cursor)` through `assistant-column.tsx` and `useAssistantSlot`. Insertion itself does not change.
    - Add `apps/web/test/assistant-run.test.ts` cases for `insertionLine` without React: caret at a paragraph start (no lead), mid-paragraph (leading newline moves it down one line), end of text, offset 0, multi-line text, and a result that differs from the caret line after the insertion.
    - Update `assistant-panel.test.tsx` and `use-assistant.test.tsx`: both lines; the position line updating with the caret and matching the Status_Line; no Reply_Box before the first run; the label "Last reply" as the accessible name; text kept after an inserting run; "Inserted at Ln `l` as run r1" with `l` the line of the first inserted character for the caret at a paragraph start, mid-paragraph and at the end of the text; stopped run with partial text keeps that text and shows "Stopped. Partial reply inserted at Ln `l` as run `id`" and no "Inserted at" line; stopped run with nothing inserted shows neither line and empty text, with no Reply_Box when it is the first run and an empty box (no earlier text) when it is a later run; no line after a failed, empty or rejected run; both lines removed when a new run starts.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 12.7, 12.14_

  - [x] 3.2 Override dialog shows the item being overridden
    - In `apps/web/src/components/modal.tsx` add the prop `describedBy` and set `aria-describedby` on the dialog element.
    - In `apps/web/src/components/override-dialog.tsx` and `.module.css` add the prop `issueText`; render it directly under the title and above the printed-in-certification statement, both inside an element whose id is the `describedBy` target. Reason field, buttons, focus rules and error display do not change.
    - Pass `issueText(document, issue)` from `issues-region.tsx` and from the Export dialog's `OverrideTarget` in `export-dialog.tsx`.
    - Update `override-dialog.test.tsx`: short text under the title; 120 characters cut to 79 plus an ellipsis; an emoji at the cut is not split; the same text from the Issues list and from the Export dialog; `aria-describedby` resolves to an element that contains the text.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 12.8, 12.14_

  - [x] 3.3 Export dialog width, button labels, blocking line, Picker cut
    - In `modal.tsx` add the prop `wide` and in `modal.module.css` add `.dialogWide { width: min(560px, 100vw - 32px); max-width: none; }` after `.dialog`; only the Export dialog passes `wide`. Override and confirm dialogs keep 420px.
    - In `apps/web/src/components/export-dialog.tsx` replace `downloadLabel` and `printLabel` with constants `DOWNLOAD_LABEL = "Download .docx"` and `PRINT_LABEL = "Open print view"`; add `blockingLine(n)` (null for 0, `1 blocking item remains`, `<n> blocking items remain`) rendered as a `<p>` directly above the action buttons; keep the disabled rules.
    - In `apps/web/src/order-copy.ts` set `OPTION_TEXT_MAX = 80`.
    - In `apps/web/test/static/css-rules.test.ts` add the check that `width: min(560px, 100vw - 32px)` appears in `modal.module.css` and in no other sheet.
    - Update `export-dialog.test.tsx`, `export-dialog-orders.test.tsx`, `export-flow.test.tsx`, `export-shell.test.tsx`, `demo-path.test.tsx`, `order-copy.test.ts` and `order-picker.test.tsx`: labels with zero and with four blocking items; the line for 4, 1 and 0; the width rule; options of 80 and 81 code points.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 12.8, 12.14_

- [x] 4. Small-screen rules
  - [x] 4.1 Viewport service and shared test helper
    - In `apps/web/src/services.ts` add the `Viewport` type (`width()`, `subscribe(onChange)`), `NARROW_WIDTH = 800`, `SHELL_MIN_WIDTH = 1150`, and `AppServices.viewport`. `defaultServices` reads `window.innerWidth` inside `width()` and registers a `resize` listener inside `subscribe`, so server rendering touches no `window`.
    - Add one shared helper under `apps/web/test/support/` that builds a fake `Viewport` with a settable width, and add `viewport` to the eight test files that build an `AppServices` literal, using the helper (default width 1280).
    - Add an example test for the fake and the default `Viewport` shape.
    - _Requirements: 10.11, 12.9_

  - [x] 4.2 Autosave extraction with the narrow guard and unmount flush
    - Create `apps/web/src/components/use-autosave.ts`: move `useAutosave` and `loadAutosave` out of `app-shell.tsx`. Its mount effect returns before `loadAutosave` and before subscribing when `svc.viewport.width() < NARROW_WIDTH`. Its cleanup calls `autosave.flush()` once before it unsubscribes.
    - In `use-pane.ts` return early from the mount effect when `svc.viewport.width() < NARROW_WIDTH`, so the Pane_Key is not read or written.
    - Add tests: at width 799 the storage fake records no `getItem` or `setItem` of the Autosave_Key or the Pane_Key; at 800 the draft loads; unmount with a save pending flushes once and writes nothing afterwards.
    - _Requirements: 10.7, 10.8, 12.9_

  - [x] 4.3 Root switch and Small_Screen_Page
    - Create `apps/web/src/components/small-screen-page.tsx` and `.module.css`: `<title>Reveal Codes</title>` and a `<main>` with the wordmark in the editor family at 15px bold and three `<p>` elements with exactly the sentences of Requirement 10.5; paper background, ink text, no image, icon, button or link.
    - In `apps/web/src/components/app-shell.tsx` make `AppShell` the thin root: `useSyncExternalStore(svc.viewport.subscribe, svc.viewport.width, () => SHELL_MIN_WIDTH)`, rendering `SmallScreenPage` below 800 and `Shell` otherwise; the present body becomes `Shell`. The Shell is mounted fresh at 800 and unmounted below it.
    - Add `apps/web/test/small-screen.test.tsx` and update `app-shell.test.tsx`: width 799 gives the page with its three sentences and no `button`, `a` or `img`; width 800 gives the Shell; the Shell is replaced when the width falls below 800; the Shell mounts and loads the draft when the width reaches 800; the title at 799.
    - _Requirements: 10.4, 10.5, 10.6, 10.8, 10.9, 10.10, 12.9_

  - [x] 4.4 Shell minimum width and the max-width 799px hide rule
    - In `apps/web/app/globals.css` add `--shell-min: 1150px` in `:root`, `min-width: var(--shell-min)` on `.app`, and the one rule `@media (max-width: 799px) { .app { display: none; } }`. It is the only width media query for the Shell; the Small_Screen_Page is not `.app` and stays visible.
    - In `apps/web/test/static/css-rules.test.ts`: add `--shell-min` as `1150px` to `VARIABLE_VALUES`; check that `globals.css` has exactly one `@media (max-width: 799px)` at-rule containing `display: none` on `.app`, and that across all stylesheets under `apps/web/app` and `apps/web/src` there is exactly one at-rule whose prelude has `min-width` or `max-width` (`@media print` is not a width query); check that `status-line.module.css` has `grid-column: main` and `issues-region.module.css` has `grid-row: 2 / 4`.
    - _Requirements: 10.1, 10.2, 10.3, 10.12, 10.13, 12.16_

- [ ] 5. Page marks (optional)
  - [x] 5.1 Smoke test for the three API assumptions
    - Add `apps/web/test/smoke/api-assumptions.dom.test.ts` (or extend the existing smoke file) with three checks against real ProseMirror and TipTap: a meta-only transaction leaves `docText(editor.state.doc)` unchanged; it produces no Provenance_Plugin operation; `Decoration.inline` spanning a paragraph boundary renders.
    - **Stop condition.** If any of the three fails, stop group 5: record the reason in `BUILD_LOG.md` (under the entry written in task 6.2), build no marks, skip 5.2 and 5.3, and continue with group 6. Requirement 11.7 applies.
    - _Requirements: 11.3, 11.7_

  - [~] 5.2 `markRanges`
    - Create `apps/web/src/editor/marks.ts` with `MarkRange` and the pure `markRanges(document)`: filter `issues(document)` to `CIT ✘`, `CIT ?` and `QUO ✘` and map to the titles `Citation not found`, `Citation ambiguous` and `Quotation not in the opinion`.
    - Add `apps/web/test/marks.test.ts`: ranges and titles for the three codes; no range for `CIT ✓`, `CIT …`, `QUO ✓`, `QUO …`.
    - _Requirements: 11.1, 11.2, 11.5, 12.10_

  - [~] 5.3 Marks plugin, binding, and style
    - Create `apps/web/src/editor/marks-plugin.ts`: a plugin whose state is a `DecorationSet`; `apply` builds a new set from a `MARKS_META` range list with `Decoration.inline(offsetToPos(start), offsetToPos(end), { "data-issue": code, title })`, skipping ranges that map to null, and otherwise maps the set through `tr.mapping`.
    - In `apps/web/src/editor/use-editor-binding.ts` register the plugin and add `useMarks(editor, store)` with one `sync` function, called from a Store subscription and from the Editor `transaction` event through `queueMicrotask`: ranges are empty while `verifiedAt` is null; return when `docText(editor.state.doc) !== document.text` or `view.composing`; return when the signature equals the last applied one; otherwise dispatch a meta-only transaction.
    - In `apps/web/src/components/editor-surface.module.css` add one rule for `[data-issue]`: `text-decoration: underline dotted var(--ink)` at 1px thickness. No other colour, no transition.
    - Add `apps/web/test/marks-plugin.test.tsx`: marks and titles drawn after a Verify run and none while Check_Time is null; Document text, undo stack and operations unchanged by a marks transaction; a mark follows an edit before it; a mark goes away when an edit inside it turns the item `CIT …`.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.10_

- [ ] 6. Documents, steering, and final checkpoint
  - [~] 6.1 Steering: `ui.md` and `product.md`
    - In `.kiro/steering/ui.md`: add to the introduction that the Pane_Header and its Legend are part of the Pane and use the Pane palette; add to "Controls" the primary button (ink background, paper text, same border and size, at most one on the Toolbar) and the Next_Step rule in the order of Requirement 4; add to "Layout" the 1150px minimum width, the sideways scroll between 800px and 1150px and the plain page below 800px; add to "Copy" that the result of Verify is shown as text in the Issues region in addition to the toolbar, the status line and the pane status line.
    - In `.kiro/steering/product.md` add a new section "Pane palette" after the Codes list with the table from the design (every Code_Family, the Failing_Code style `#FFFFFF` on `#AA0000` with no outline and ratio 7.75:1, the Pane_Header `#0000AA` on `#AAAAAA` and ratio 5.72:1). The Codes list itself is not changed.
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [~] 6.2 README, `docs/KIRO_USAGE.md`, and `BUILD_LOG.md`
    - In `README.md` update the demo path: the Pane is already open on a first visit (Alt-F3 hides and shows it), the result of Verify is read in the Issues region, the Export dialog buttons carry no count. Keep the sections that `docs.test.ts` requires.
    - In `docs/KIRO_USAGE.md` add one row for this spec with `.kiro/specs/first-run-and-flow/requirements.md`, `design.md`, `tasks.md` and the spec's other files that exist, and one row each for the `ui.md` and `product.md` edits.
    - In `BUILD_LOG.md` append one dated entry `## <date> first-run-and-flow` after the last entry: the first run before and after, and where Kiro's output was wrong and how it was fixed, or "No Kiro errors". If task 5.1 stopped group 5, record the reason here. Existing entries stay unmodified.
    - _Requirements: 13.6, 13.7, 13.8_

  - [~] 6.3 Final checkpoint: full repository checks
    - Run, from the repository root, each to exit with code 0: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `pnpm exec next build --webpack` in `apps/web`, and `pnpm kiro:check`. Fix failures at their cause; do not weaken a test. Confirm `git status` shows no change under `packages/` or `crew/` and no lockfile change.
    - Ensure all tests pass, ask the user if questions arise. Then the user walks the app in a browser themselves (layout at 799, 800 and 1150px, the sideways scroll, the Legend wrap, and the dotted marks if group 5 was built). The task does not run the app.
    - _Requirements: 14.1, 14.2, 14.3, 14.6, 14.7_

## Notes

- Tasks marked with `*` (group 5) are optional. Their parent task 5 is not marked. Skipping the group does not affect the checkpoint.
- Property numbers are per spec: `// Property 1` here does not clash with Property 1 of editor-app.
- Each task references the specific requirement clauses it covers.
- There is one checkpoint, the last task (Req 14.7).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.5"] },
    { "id": 3, "tasks": ["2.1", "2.3"] },
    { "id": 4, "tasks": ["2.2", "2.4"] },
    { "id": 5, "tasks": ["2.5"] },
    { "id": 6, "tasks": ["3.1", "3.2"] },
    { "id": 7, "tasks": ["3.3"] },
    { "id": 8, "tasks": ["4.1"] },
    { "id": 9, "tasks": ["4.2"] },
    { "id": 10, "tasks": ["4.3"] },
    { "id": 11, "tasks": ["4.4"] },
    { "id": 12, "tasks": ["5.1"] },
    { "id": 13, "tasks": ["5.2"] },
    { "id": 14, "tasks": ["5.3"] },
    { "id": 15, "tasks": ["6.1", "6.2"] }
  ]
}
```
