# Requirements Document

## Introduction

This feature adds a public page at `/check` where a person pastes a draft or opens a file, presses one button, and sees which citations and quotations hold up. The page reads from 320px up. It adds no second way to check anything: it builds a Document with the Engine, runs the editor's own `runVerifyFlow` through the same `/api/verify` and `/api/opinion` routes, and shows the editor's own words. It sends nothing the editor does not send. It stores nothing.

The page exists for the first audience in `product.md`: a self-represented litigant on a phone, who today meets a plain page that says the editor needs 1150 pixels. The small-screen page is changed to lead with the checker.

Where a row, a status word or a sentence is built today inside the editor's Issues region, Resolved list or Verify result, and is tied to the Store or to the editor layout, this spec moves the pure part into a shared module that both the editor and `/check` import. No wording and no status rule is written twice.

The scope is `apps/web` (the route `app/check/`, the shared modules, the small-screen page, a link on `/courts`, the services object, the static scans), `README.md`, `docs/KIRO_USAGE.md`, `BUILD_LOG.md` and `.kiro/steering/ui.md`. The Engine, the Verifier, the routes and the Toolbar are not changed. No dependency, environment variable or API route is added.

Out of scope: provenance, export, the statement, the court picker and the assistant on this page; saving or sharing a result by link; accounts; PDF; any change to the verifier or the routes; file drop onto the page.

Process: this document, then the twelve resolved decisions (the "Decisions" section at the end), then design, then tasks. The spec is committed before any task starts. The final checkpoint is `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build and `pnpm kiro:check`. Nothing is pushed; the author walks the result at 375px and 1280px, on the demo server and then live.

## Glossary

- **Web_App**: `apps/web`.
- **Check_Page**: the route `/check`, `apps/web/app/check/page.tsx`, and the components it renders.
- **Courts_Page**: the route `/courts`, the model for the Check_Page's look.
- **Draft_Box**: the text area labelled "Your draft".
- **Draft_Text**: the characters in the Draft_Box. Held in memory only.
- **Check_Button**: the one primary button, "Check citations".
- **Check_Run**: one call of `runVerifyFlow` made by the Check_Page.
- **Check_Document**: the Document the Check_Page builds from the Draft_Text with `pastedDocument`, after `docxSafe`.
- **Shared_Rows**: the pure module that builds the rows of Result_Items. Both the Issues region and the Resolved list, and the Check_Page, import it.
- **Result_Item**: one citation or quotation of the Check_Document shown as one block (Requirement 6).
- **Status_Words**: the editor's words for a status, used as they are. For a failing status these are the words `issueWords` in `issues-list.tsx` uses today (`SEVERITY`), without the prefix "blocking, " or "overridden, ".
- **Status_Label**: the small component `CodeLabel` in `src/pane/`, shown on a Result_Item, that shows its code (`CIT ✓`, `CIT ✘`, `CIT ≠`, `CIT ?`, `CIT …`, `QUO ✓`, `QUO ✘`, `QUO …`) in the Pane's colours on the dark ground.
- **Next_Sentence**: the one plain sentence of what to do next shown on a failing Result_Item (Requirement 7).
- **Summary_Line**: the lines `summaryLines` returns for the Check_Document: Citations, Quotations, Checked time, further line.
- **Stale_Results**: results shown for text that has since been edited (Requirement 9).
- **Copy_Text**: the plain-text version of the results (Requirement 10): the Summary_Line's Citations line, then one line per Result_Item with the status first, then a closing line that names the date of the check. It is not pipe-separated, so that it reads well pasted into a message.
- **Editor_Link**: the link "Open this draft in the editor".
- **Hand_Over**: the way the Draft_Text reaches the editor without being placed in the address (Requirement 12).
- **Small_Screen_Page**: `SmallScreenPage`, shown by `AppShell` below `NARROW_WIDTH` (800px).
- **Open_Reader**: `openFile` of `src/client/open-file.ts` with its refusal messages in `open-messages.ts`.
- **Verify_Body**: the value `buildVerifyBody(document)` returns, `{ records }`.
- **Editor_Sentences**: the existing constants and functions that carry the editor's wording: `CHECKS_BUSY`, `FAILED_NOTICE`, `DOCUMENT_TOO_LONG`, `WAITING_TEXT`, `DEMO_MODE_LINE`, `AVIANCA_FAILED`, `COURTLISTENER_LINK_TEXT`, the `open-messages.ts` functions, `mismatchLines`, `divergenceWords`, `uncheckedText`.
- **Static_Scans**: the tests in `apps/web/test/static/`.
- **UI_Rules**: `.kiro/steering/ui.md`.

## Requirements

### Requirement 1: Route and page frame

**User Story:** As a self-represented litigant on a phone, I want a page that opens with no account and fits my screen, so that I can check my draft where I am.

#### Acceptance Criteria

1. THE Check_Page SHALL be the route `apps/web/app/check/page.tsx`.
2. THE Check_Page SHALL render one column on a `--desk` wrapper with one `--paper` column of `max-width: var(--page-max)` and fluid padding, as the Courts_Page does.
3. THE Check_Page SHALL begin with a header whose one link to `/` holds the Mark (24px, `aria-hidden`) and the Reveal Codes wordmark, with the Courts_Page's type assignments.
4. THE Check_Page stylesheet SHALL contain no width at-rule and no fixed width other than `100%`, `auto`, `min-content`, `max-content` and `0`.
5. THE Check_Page stylesheet SHALL set `overflow-wrap: anywhere` on the page column and `max-width: 100%` on every control group, so that the page shows no sideways scroll at a viewport width of 320px.
6. THE Check_Page SHALL show the heading "Check the citations in a draft" as its single level-one heading.
7. THE Check_Page SHALL carry the page title and the page description of Decision 12 and no other page metadata.
8. WHEN the Check_Page is rendered on the server, THE Check_Page SHALL contain the heading, the two introductory sentences, the label "Your draft", the Draft_Box and the actions in the HTML, so that the page is readable and the box is usable before scripts run.

### Requirement 2: Page content and order

**User Story:** As a reader, I want to be told what the page does, what it sends and what it keeps, before I paste anything, so that I can decide to use it.

#### Acceptance Criteria

1. THE Check_Page SHALL show, top to bottom: the heading; one sentence that says what the page does; the privacy sentence of Requirement 11; the Draft_Box under the label "Your draft"; the actions; the results.
2. THE Check_Page SHALL show the actions in this order: Check citations, Open a file, Load the Avianca citations, Clear.
3. THE Check_Page SHALL mark Check citations with `data-primary="true"` and SHALL give no other control `data-primary`.
4. THE Check_Page SHALL show, on the page, one sentence stating that the draft is not stored and is gone when the page is reloaded.
5. THE Check_Page SHALL show plain links to `/courts` and to `/`, with the link texts `COURT_RULES_LONG` ("See all court rules") and "Open the editor".
6. THE Check_Page SHALL contain no icon, emoji, image (other than the Mark) or animation.

### Requirement 3: Getting text in

**User Story:** As a filer, I want to type, paste, open a file or load a sample, so that I can start from whatever I have.

#### Acceptance Criteria

1. WHEN the author types or pastes into the Draft_Box, THE Check_Page SHALL hold the characters as the Draft_Text.
2. WHEN the author chooses Open a file and picks a file, THE Check_Page SHALL read it with the Open_Reader, with no second implementation of its kind, size, decoding, `docxSafe` and limit rules.
3. WHEN the Open_Reader refuses a file, THE Check_Page SHALL show the refusal's `notice` and `note` text unchanged and SHALL leave the Draft_Text unchanged.
4. WHEN the Open_Reader returns text, THE Check_Page SHALL place that text in the Draft_Box and SHALL show the success sentence of Decision 10 in place of the editor's `openedMessage`, which names a provenance record the page does not keep.
5. WHEN the Open_Reader returns a restored export, THE Check_Page SHALL use its text only, SHALL NOT use its provenance record and SHALL show "Opened <name>: <n> characters. Its provenance record was not used." (Decision 10).
6. WHEN the author chooses Load the Avianca citations, THE Check_Page SHALL fetch the text through `api.aviancaCitations()`, the call the editor uses, and place `docxSafe(text).text` in the Draft_Box.
7. IF `api.aviancaCitations()` fails, THEN THE Check_Page SHALL show `AVIANCA_FAILED` and SHALL leave the Draft_Text unchanged.
8. WHEN the author chooses Clear, THE Check_Page SHALL, without asking for confirmation (Decision 11), empty the Draft_Box and remove the results.
9. WHILE the Draft_Box holds text, WHEN the author chooses Open a file (and picks a file the Open_Reader accepts) or Load the Avianca citations, THE Check_Page SHALL ask for confirmation with the editor's confirm dialog and the editor's wording for that action before replacing the text.
10. THE Check_Page SHALL write nothing to `localStorage`, `sessionStorage`, cookies or IndexedDB, except the single Hand_Over write of Requirement 12.
11. THE Check_Page SHALL make no network request while the author types, pastes, opens a file or clears.

### Requirement 4: Limits and refusals

**User Story:** As a filer with a very long document, I want a clear refusal rather than a failure, so that I know what to do.

#### Acceptance Criteria

1. THE Check_Page SHALL apply `MAX_TEXT_CHARS` (200,000 characters) from `src/limits.ts` and SHALL define no second limit.
2. IF the Draft_Text, after `docxSafe`, is longer than `MAX_TEXT_CHARS` when the author chooses Check citations, THEN THE Check_Page SHALL make no request and SHALL show `DOCUMENT_TOO_LONG` (Decision 3).
3. IF the Draft_Text holds only white space when the author chooses Check citations, THEN THE Check_Page SHALL make no request and SHALL show one plain sentence that says "Add some text to check." (Decision 4).
4. IF the Check_Document holds no Full_Citation, THEN THE Check_Page SHALL make no request to `/api/verify` and SHALL show one plain sentence that says "No citations were found in this draft." (Decision 4).
5. WHEN the Draft_Text holds characters that Word files cannot store, THE Check_Page SHALL remove them with `docxSafe` before building the Check_Document, as the editor's paste and Open do.

### Requirement 5: Checking

**User Story:** As a filer, I want one button that checks everything and tells me what is happening, so that I can wait without guessing.

#### Acceptance Criteria

1. WHEN the author chooses Check citations, THE Check_Page SHALL build the Check_Document with `pastedDocument` and run `runVerifyFlow` on it, so that citations go through `/api/verify` and quotations are compared in the browser against `/api/opinion`.
2. WHILE a Check_Run is in flight, THE Check_Page SHALL disable Check citations and SHALL show a status line that reads "Verifying…" (Decision 5), while Check citations keeps its label.
3. WHILE a Check_Run has been in flight for `WAITING_AFTER_MS` (5000 ms), THE Check_Page SHALL show `WAITING_TEXT` in the status line.
4. WHEN a Check_Run ends, THE Check_Page SHALL enable Check citations and clear the waiting text.
5. IF the server answers a lookup with status 429, THEN THE Check_Page SHALL show `CHECKS_BUSY`.
6. IF a Check_Run fails, THEN THE Check_Page SHALL show the failure sentence the run returns (`FAILED_NOTICE`) and SHALL keep the Draft_Text.
7. WHEN `/api/mode` reports `fixtures`, THE Check_Page SHALL show `DEMO_MODE_LINE`.
8. THE Check_Page SHALL send no request to any route other than `/api/verify`, `/api/opinion/<clusterId>`, `/api/mode` and the sample file `/avianca-citations.txt`, and SHALL add no route and change none.
9. THE Check_Page SHALL call `runVerifyFlow` unchanged and SHALL NOT copy its logic.

### Requirement 6: Results

**User Story:** As a filer, I want every citation and quotation listed in the order I wrote it, each with a status I can read without colour, so that I can find and fix the bad ones.

#### Acceptance Criteria

1. WHEN a Check_Run completes, THE Check_Page SHALL show the Summary_Line, built by `summaryLines` and `furtherLine`, with the same counts and words the editor's Verify result shows.
2. THE Check_Page SHALL show one Result_Item for each Full_Citation of the Check_Document, for each short form with no target (the Issue kind `orphan`), and for each quotation, and SHALL show a linked short form nowhere, as the editor lists none.
3. THE Check_Page SHALL show the Result_Items in the order `issueOrder` gives (by start offset, a citation before a quotation at the same offset), each exactly once.
4. EACH Result_Item SHALL show: the text as written, shortened by `shorten` to 80 characters; its status in Status_Words; and its Status_Label.
5. THE Status_Label SHALL show the code text, so that a status is never shown by colour alone.
6. WHERE the status is `verified`, THE Result_Item SHALL show the case name and year on record as `foundText` builds them, and the link "View on CourtListener" (`CourtListenerLink`).
7. WHERE the status is `wrong_case`, THE Result_Item SHALL show the lines `mismatchLines` returns ("Cited as …", "This citation is …") and the link "View on CourtListener".
8. WHERE the status is `not_found`, `ambiguous` or `unchecked`, or a quotation is `mismatch` or `unchecked`, THE Result_Item SHALL show the Status_Words the editor shows for that status, unchanged.
9. WHERE a quotation is `mismatch`, THE Result_Item SHALL show "Diverges at: " followed by `divergenceWords`, as the Issues row does.
10. WHERE a quotation is `match`, THE Result_Item SHALL show the Status_Label `QUO ✓` and the Status_Words "match".
11. THE Check_Page SHALL build every Result_Item from Shared_Rows, which both `issues-list.tsx`, `resolved-list.tsx` and the Check_Page import.
12. WHERE a function in `issues-list.tsx`, `resolved.ts` or `verify-summary.ts` is tied to the Store, to a component or to the editor layout, THE Web_App SHALL move its pure part to Shared_Rows and import it from the editor, with no change to what the editor shows.
13. THE Status_Label SHALL be the component `CodeLabel` in `src/pane/` with its own stylesheet there, mapping a code to the Pane's class on the `--pane-body` ground, so that the Pane's colour literals stay in `src/pane/` and no colour literal appears in the Check_Page stylesheet (Decision 7).

### Requirement 7: What to do next

**User Story:** As a filer who is not a lawyer, I want one plain sentence that tells me what to do about a failing item, so that I do not have to guess.

#### Acceptance Criteria

1. WHERE a Result_Item has the status not found, wrong case, ambiguous or unchecked, or is a quotation not in the opinion or unchecked, THE Result_Item SHALL show one Next_Sentence under its Status_Words.
2. THE Next_Sentence for a not-found citation SHALL tell the author to look for the case themselves before relying on it.
3. THE Next_Sentences SHALL be defined once, in Shared_Rows, one per failing status, with the wording of Decision 1 and no exclamation mark.
4. THE Next_Sentences SHALL state no law and SHALL NOT say that a citation is fabricated, because CourtListener not holding a case is not proof that it does not exist.
5. WHERE a Result_Item is found or matches, THE Result_Item SHALL show no Next_Sentence.

### Requirement 8: Results follow the editor everywhere

**User Story:** As the author of the product, I want one answer for any document, so that the page and the editor can never disagree.

#### Acceptance Criteria

1. FOR ALL Documents built from the existing arbitraries with any verification results and quote results, THE rows built by Shared_Rows for the Check_Page SHALL carry the same status, Status_Words, found names and years, mismatch lines, divergence words and CourtListener links as the Issues region and the Resolved list show for that Document (Property 1).
2. FOR ALL such Documents, EACH citation and EACH quotation SHALL appear exactly once in the rows, in document order (Property 1).
3. THE Check_Page SHALL contain no string literal that duplicates an Editor_Sentence or a Status_Words entry, which a static scan SHALL verify by import and by text.
4. WHEN Shared_Rows is edited, THE editor's existing tests for the Issues region, the Resolved list and the Verify result SHALL pass unchanged.

### Requirement 9: Results go out of date

**User Story:** As a filer who keeps editing, I want results that cannot look current when they are not, so that I never rely on a check of different text.

#### Acceptance Criteria

1. WHEN the Draft_Text changes after a Check_Run completed, THE Check_Page SHALL mark the results as out of date with one plain sentence and SHALL show a button "Check again" (Decision 6).
2. WHILE results are out of date, THE Check_Page SHALL NOT show the Copy results button and SHALL NOT show the Editor_Link as current results.
3. WHEN the author chooses Check again, THE Check_Page SHALL run a new Check_Run on the current Draft_Text.
4. IF the Draft_Text changes while a Check_Run is in flight, THEN THE Check_Page SHALL discard that run's results and SHALL NOT show them.
5. WHEN the Draft_Text is restored to exactly the text that was checked, THE Check_Page SHALL continue to show the results as out of date until a new Check_Run completes.

### Requirement 10: Copy results

**User Story:** As a filer, I want to copy the results as plain text that reads well in a message, so that I can paste them into my notes or an email to a clinic.

#### Acceptance Criteria

1. WHERE the browser offers the clipboard, THE Check_Page SHALL show a plain button "Copy results" while current results are shown.
2. THE Check_Page SHALL test for the clipboard after mount, so that the server-rendered HTML contains no Copy results button, and SHALL NOT render the button where `navigator.clipboard` is missing.
3. WHEN the author chooses Copy results, THE Check_Page SHALL write Copy_Text to the clipboard.
4. THE first line of the Copy_Text SHALL be the Citations line of the Summary_Line.
5. THE Copy_Text SHALL hold, after the first line, one line per Result_Item, in the order of the Result_Items, in the form "<Status words, first letter capital>: <text as written>." and no pipe character.
6. WHERE a Result_Item has a case on record, THE Copy_Text line SHALL continue on the same line with " On record: <case, year>. <CourtListener address>".
7. THE last line of the Copy_Text SHALL be "Checked on <date> with Reveal Codes against CourtListener.", where <date> is the date of the Check_Run that produced the results.
8. IF the clipboard write fails, THEN THE Check_Page SHALL show the sentence "The results could not be copied."
9. THE Check_Page SHALL make no network request when the author chooses Copy results.

### Requirement 11: Privacy statement and request body

**User Story:** As a filer with a sensitive draft, I want the page to say exactly what is sent, so that I can trust it.

#### Acceptance Criteria

1. THE Check_Page SHALL state, in plain words, on the page: only the citations and the case names written before them are sent, to this site and from there to CourtListener; the rest of the draft stays in the browser; nothing is saved unless you open the draft in the editor (Decision 2).
2. THE statement SHALL be true of the code: the Verify_Body holds the Full_Citation records, each with the `caseName` the extractor read, and no other draft text.
3. FOR ALL generated Draft_Texts, THE request body the Check_Page sends to `/api/verify` SHALL equal `JSON.stringify(buildVerifyBody(document))` for the Document built from the same text, and SHALL contain no other draft text (Property 2).
4. FOR ALL generated Draft_Texts, no other request the Check_Page makes SHALL carry any part of the Draft_Text: `/api/opinion/<clusterId>` carries a cluster id only, `/api/mode` and the sample file carry nothing (Property 2).
5. THE README section "What leaves your machine" SHALL gain one line for the Check_Page, consistent with criterion 1.
6. THE Check_Page SHALL carry no telemetry and SHALL send nothing to any host other than this site.

### Requirement 12: Open this draft in the editor

**User Story:** As a filer on a wide screen, I want to carry the draft into the editor, so that I can fix it there without pasting it again.

#### Acceptance Criteria

1. WHILE the viewport width is `NARROW_WIDTH` (800px) or more and the Draft_Box holds text, THE Check_Page SHALL show the Editor_Link as a plain link.
2. WHILE the viewport width is less than 800px, THE Check_Page SHALL NOT render the Editor_Link, and the server-rendered HTML SHALL NOT contain it.
3. WHEN the author follows the Editor_Link, THE Hand_Over SHALL carry the Draft_Text to the editor without placing any of it in the address, and the editor SHALL receive it as pasted text (one PST span, through `pastedDocument`).
4. WHEN the editor receives a Hand_Over and its draft is empty, THE editor SHALL install the text without asking.
5. WHEN the editor receives a Hand_Over and its draft is not empty, THE editor SHALL ask through the same confirm dialog the Open flow uses, with the title "Open a draft", the message "Discard the current draft and open the draft from the checker?" and the confirm label "Discard and open", and SHALL install the text only if the author confirms.
6. WHEN the author cancels that confirm, THE editor SHALL keep its draft unchanged and SHALL discard the Hand_Over.
7. THE Hand_Over SHALL be a `sessionStorage` entry under the key `reveal-codes:check-handover:v1`, written when the author follows the Editor_Link and read once and removed in the same step on reading, whether or not the editor uses it (Decision 2).
8. THE Hand_Over SHALL NOT place text in the address, in a cookie, or in `localStorage`.
9. THE Check_Page SHALL NOT pass the results to the editor, only the text.

### Requirement 13: Small-screen page

**User Story:** As a visitor on a phone, I want the first thing I see to be the tool that works on my screen, so that I do not leave.

#### Acceptance Criteria

1. THE Small_Screen_Page SHALL show the sentence "Reveal Codes is a drafting editor for court filings that shows where each sentence came from and checks each citation." first.
2. THE Small_Screen_Page SHALL show, after that sentence, the links in this order: "Check the citations in a draft" to `/check`, then `COURT_RULES_LONG` ("See all court rules") to `/courts`, then the video and source links when they are set.
3. THE Small_Screen_Page SHALL show, after the links, the one sentence "The drafting editor, with the codes pane and export, needs a screen at least 1150 pixels wide." in place of the two desktop sentences it shows today (Decision 9).
4. THE Small_Screen_Page link to `/check` SHALL be a plain link in the page's link style and SHALL NOT be `data-primary`.
5. WHEN a Selection_Line is shown, THE Small_Screen_Page SHALL keep its existing wording and SHALL show it after the sentence of criterion 3 (Decision 9).
6. THE tests that name the old sentences (`small-screen.test.tsx`, `app-shell.test.tsx`) SHALL be updated to the new order and wording.
7. THE README "Limits" line about the desktop editor SHALL be reworded to say the editor needs 1150 pixels and the Check_Page reads from 320px.

### Requirement 14: Other ways in

**User Story:** As a visitor, I want to find the checker from the pages I already use, so that I do not need the address.

#### Acceptance Criteria

1. THE Courts_Page SHALL show a plain link "Check the citations in a draft" to `/check`, beside "Open the editor".
2. THE Toolbar's Court rules link SHALL remain unchanged.
3. THE Check_Page SHALL link to `/courts` and to `/` (Requirement 2, criterion 5).
4. THE Web_App SHALL add no link to `/check` to the Toolbar.

### Requirement 15: Accessibility and look

**User Story:** As a filer using a screen reader or a phone keyboard, I want labelled controls and readable text, so that the page works for me.

#### Acceptance Criteria

1. THE Draft_Box SHALL have a visible `label` "Your draft" associated by `for`.
2. THE Check_Page SHALL show the run status and the results in a `role="status"` region, so that a change is announced once.
3. THE Check_Page SHALL use only the Tokens and type sizes of the UI_Rules, 30px buttons, 34px links, the text-area focus border of the UI_Rules, and no new Token.
4. THE Check_Page SHALL set the Status_Label in the Pane's code style (IBM Plex Mono, codes weight 600, failing codes weight 700), with the code's characters unchanged.
5. WHILE a Check_Run is in flight, THE Check_Page SHALL leave the Draft_Box editable and SHALL treat an edit as in Requirement 9, criterion 4.

### Requirement 16: Static scans

**User Story:** As a maintainer, I want the new page inside the checks that guard the rest of the app, so that it cannot drift.

#### Acceptance Criteria

1. THE Static_Scans SHALL scan `app/check/` and the Check_Page's modules as they scan `app/courts/` and `src/courts/`: Tokens only, allowed sizes and weights, no banned property, no width query, no fixed width.
2. THE Static_Scans SHALL fail on a width at-rule, a `px` width, an icon, an emoji or an `img` in the Check_Page's sources.
3. THE boundaries scan SHALL allow the Check_Page's page file to import only from `src/`, its own folder and packages.
4. THE Static_Scans SHALL keep their existing assertion that exactly one width at-rule exists in the Shell's stylesheets, and SHALL NOT count the Check_Page toward it.
5. THE inventory and docs scans SHALL pass with the new files.

### Requirement 17: Tests

**User Story:** As a maintainer, I want the behaviour covered by examples and two properties, so that a regression is caught.

#### Acceptance Criteria

1. THE test suite SHALL contain example tests for: typing and pasting; Open a file for each of `.docx`, `.txt` and `.md`; each Open refusal; Load the Avianca citations; Clear; the confirm on replace.
2. THE test suite SHALL contain an end-to-end example of the Avianca sample on recorded responses with two found, two wrong case and two not found, each with the case name on record.
3. THE test suite SHALL contain examples for a quotation that is not in the opinion; the 429 sentence; the failed-run sentence; the demo-mode line; the waiting text after 5000 ms; the too-long refusal; results going out of date on edit.
4. THE test suite SHALL contain examples for the Copy_Text, for the absence of Copy results without a clipboard, for the Hand_Over with and without an existing draft, for the absence of the Editor_Link below 800px, and for the Small_Screen_Page order.
5. THE test suite SHALL contain a stylesheet-scan example that asserts the Check_Page has no width at-rule and the 320px overflow guards of Requirement 1, criterion 5.
6. THE test suite SHALL contain Property 1 (one answer) in `check-rows.properties.test.ts`, with `// Property 1` above one `fc.assert(fc.property(...))` and `_Requirements: 8.1, 8.2_` in the `describe` title.
7. THE test suite SHALL contain Property 2 (nothing more is sent) in `check-request.properties.test.ts`, with `// Property 2` above one `fc.assert(fc.property(...))` and `_Requirements: 11.3, 11.4_` in the `describe` title.
8. WHERE an arbitrary for verification results, quote results or Display_Info is needed, THE test suite SHALL add it to `packages/engine/src/testing/arbitraries.ts` and reuse the existing arbitraries for Documents.
9. THE property tests SHALL run with `numRuns` of at least 200 locally and 500 in CI, and SHALL log the seed on failure.
10. THE tests SHALL mock only `fetch` and shall not mock the Engine.

### Requirement 18: Documentation and process

**User Story:** As a maintainer and a judge, I want the docs to say what was added and the work to be traceable, so that I can follow it.

#### Acceptance Criteria

1. THE README "What it does" SHALL gain one line about the Check_Page.
2. THE README "Demo path" SHALL gain one line: on a phone, open `/check`.
3. THE README "What leaves your machine" SHALL gain the line of Requirement 11, criterion 5.
4. THE README SHALL keep every assertion of `apps/web/test/static/docs.test.ts` true, including that it holds no exclamation mark.
5. THE `docs/KIRO_USAGE.md` SHALL gain a row for this spec listing `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`, and a row for `ui.md`, so that `pnpm kiro:check` and the inventory test pass.
6. THE `BUILD_LOG.md` SHALL gain a dated entry that records the shared Shared_Rows module, the Hand_Over choice, and what Kiro got wrong in the requirements pass or "No Kiro errors".
7. THE UI_Rules SHALL describe the one-column pages `/courts` and `/check` together: the column, the header with the Mark, the links, the Status_Label on the dark ground, and the absence of a width at-rule.
8. THE spec SHALL be committed before any task starts, and no commit SHALL be pushed.
9. THE final checkpoint SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build` from a clean clone after install) and `pnpm kiro:check`.

## Decisions

The twelve open questions were answered "agreed", with the changes to 8 and 9 recorded below. The requirements above carry the final wording.

1. **Next_Sentences (Requirement 7).** One plain sentence per failing status, shown under the Status_Words:
   - Not found (`CIT ✘`): "Look for this case yourself before you rely on it; CourtListener may not hold it, or the citation may be wrong."
   - Wrong case (`CIT ≠`): "Open the opinion at the link and check that it is the case you meant; if it is not, correct the name or the citation."
   - Ambiguous (`CIT ?`): "More than one case matches this citation, so look it up yourself to find the one you mean."
   - Unchecked (`CIT …`): "This citation was not checked; check again in a moment, or look it up yourself before you rely on it."
   - Quotation not in the opinion (`QUO ✘`): "Compare this quotation with the opinion itself, and correct the wording or the citation before you rely on it."
   - Quotation unchecked (`QUO …`): "This quotation was not checked; read it against the opinion yourself before you rely on it."
   None says a case is fake or states the law. The editor's status words are used as they are.

2. **Hand_Over (Requirement 12).** The Editor_Link writes the text to `sessionStorage` under `reveal-codes:check-handover:v1` and navigates to `/`. On mount, after the draft has loaded, the editor reads the key once and removes it in the same step, whether or not it uses the text. The text goes through `pastedDocument` and the same `replace` the Open flow uses. If the editor draft is empty the text is installed at once; otherwise the existing `ConfirmDialog` opens with the title "Open a draft", the message "Discard the current draft and open the draft from the checker?" and the confirm label "Discard and open". Cancel keeps the draft and the key stays cleared. `AppServices` gains a `session` field (a `StorageLike`, faked in tests). The privacy sentence ends "nothing is saved unless you open the draft in the editor". `window.name` and `postMessage` were rejected as less testable and as leaking across navigations.

3. **Too-long refusal (Requirement 4).** A file over the limit shows `tooLongMessage(name)` exactly as the editor does. Typed or pasted text over 200,000 characters shows `DOCUMENT_TOO_LONG` ("This document is too long to check in one request."), checked in the browser before any request. The Draft_Box has no `maxlength`.

4. **Nothing to check (Requirement 4).** Empty or white space: "Add some text to check." No Full_Citation: "No citations were found in this draft." The second is shown only after the author presses Check citations, and no request is made.

5. **Status line while running (Requirement 5).** The status line reads "Verifying…" at once and `WAITING_TEXT` replaces it after 5 seconds. The button keeps the label "Check citations" and is disabled. No new sentence.

6. **Out-of-date results (Requirement 9).** "The draft has changed since this check. The results below are for the earlier text." with a "Check again" button beside it. The results stay visible, marked by a label and not by colour alone. Copy results and the Editor_Link's claim to current results are withheld.

7. **Status_Label home (Requirement 6).** A small `CodeLabel` component with its stylesheet in `src/pane/` maps a code to the Pane's class on the `--pane-body` ground. The Check_Page imports it and holds no colour literal. Failing codes use the failing block (white on `--fail`, 2px `--fail-ring`).

8. **Copy results (Requirement 10). Changed from the proposal.** The lines must read well when pasted into a message and are not pipe-separated. The first line is the Summary_Line's Citations line. Then one line per item, status first: "<Status words, first letter capital>: <text as written>." followed on the same line, where there is one, by " On record: <case, year>. <CourtListener address>". The last line is "Checked on <date> with Reveal Codes against CourtListener." with the date of the check. Quotations get a line with their Status_Words and no address. The failed-copy sentence ("The results could not be copied.") and the after-mount check for the clipboard stay as proposed.

9. **Small-screen page (Requirement 13). Changed from the proposal.** The order stays: first sentence; link "Check the citations in a draft" to `/check`; "See all court rules"; video and source links. The two desktop sentences are replaced by one: "The drafting editor, with the codes pane and export, needs a screen at least 1150 pixels wide." The Selection_Line goes after it.

10. **Open success message (Requirement 3).** The Open_Reader is used unchanged and its refusal sentences are shown unchanged. A success shows "Opened <name>: <n> characters." plus `removedSentence` and `NOTES_SENTENCE` where they apply, from a shared helper that reuses the parts of `openedMessage`. A restored export shows "Opened <name>: <n> characters. Its provenance record was not used." The editor's messages are not edited.

11. **Clear (Requirement 3).** Clear does not ask first, because the text is in memory only. Open a file and Load the Avianca citations ask when the box holds text, as the editor does.

12. **Title and description (Requirement 1).** Title "Check the citations in a draft — Reveal Codes". Description "Paste a draft or open a file and see which citations and quotations can be found on CourtListener and which cannot. Nothing is saved."

## Follow-up: findings from the 375px, 320px and 1280px walk

The author walked `/check` at 375px, 320px and 1280px. Everything works. Five findings came out of the walk and are Requirements 19 to 23 below. They add to Requirements 1 to 18 and rewrite none of them. Where a follow-up requirement changes what an earlier criterion says, the follow-up criterion names the earlier one and wins: Requirement 22 replaces the last clause of criterion 11.1 ("nothing is saved unless you open the draft in the editor") and the sentence of criterion 2.4 with the single statement of Requirement 22.

Scope: `apps/web` (`src/client/check-rows.ts`, `src/client/mismatch.ts`, `src/check/`, `src/components/use-handover.tsx`, `src/components/small-screen-page.module.css`, `app/check/check.module.css`, `app/courts/courts.module.css`, the static scans), `README.md`, `BUILD_LOG.md` and `.kiro/steering/ui.md`. The Engine, the Verifier, the routes and the Toolbar are not changed. The editor's Issues region and Resolved list are not changed. No dependency, environment variable or route is added.

### Follow-up glossary

- **Case_Name_Option**: the optional third argument of `checkRows`, `{ caseNames: boolean }`, default off.
- **Cited_As_Line**: the line "Cited as <name>" that shows the `caseName` the extractor read before a citation. `mismatchLines` already builds it for a wrong-case row.
- **Touch_Device**: a device whose primary pointer is coarse, matched by the media feature `(pointer: coarse)`. This is not a width at-rule.
- **Touch_Target**: a button or link on `/check`, on the Small_Screen_Page, or one of the two links under a rule on `/courts`.
- **Wide_Viewport**: a viewport whose width is `NARROW_WIDTH` (800px) or more, read through `svc.viewport`.
- **Storage_Statement**: the one statement on the Check_Page about whether the draft is stored (Requirement 22).
- **Hand_Over_Name**: the name `use-handover.tsx` passes to `textOutcome` for the text received from the checker.

### Requirement 19: Each row names the case it is about

**User Story:** As a self-represented litigant reading the results, I want each row to say which case my draft called it, so that I can tell the rows apart without finding the citation in my own text.

#### Acceptance Criteria

1. THE `checkRows` function SHALL accept the Case_Name_Option as an optional third argument and SHALL treat an absent argument as `{ caseNames: false }`.
2. WHERE the Case_Name_Option is off, THE `checkRows` function SHALL return rows equal to the rows it returned before this follow-up, with no added field.
3. WHERE the Case_Name_Option is on and the Full_Citation of a citation row has a `caseName`, THE row SHALL carry that `caseName` unchanged.
4. WHERE the Case_Name_Option is on and the Full_Citation of a citation row has no `caseName`, THE row SHALL carry no case name and THE Check_Page SHALL show nothing extra for that row.
5. THE Check_Page SHALL call `checkRows` with the Case_Name_Option on, and THE Issues region and THE Resolved list SHALL call it with the option off, so that their tests pass unchanged.
6. WHERE a Result_Item is a citation with a case name and its status is found or not found, THE Check_Page SHALL show the Cited_As_Line under the Status_Words.
7. WHERE a Result_Item is a citation with a case name and its status is ambiguous or unchecked, THE Check_Page SHALL show the Cited_As_Line under the Status_Words.
8. WHERE a Result_Item is a wrong-case citation, THE Check_Page SHALL show the Cited_As_Line once, as the line `mismatchLines` returns, and SHALL NOT add a second Cited_As_Line.
9. THE Cited_As_Line wording SHALL be defined once, in one exported function of `src/client/mismatch.ts`, which `mismatchLines` and the Check_Page both use.
10. WHERE a Result_Item is a quotation or a short form with no target, THE Check_Page SHALL show no Cited_As_Line and the row SHALL carry no case name.
11. WHERE a citation row carries a case name, THE Copy_Text line for that row SHALL place the case name and a comma and a space before the citation text, so that a not-found line reads "Not found: Varghese v. China Southern Airlines Co., Ltd., 925 F.3d 1339 (11th Cir. 2019)."
12. THE Copy_Text line of a wrong-case row with a case name SHALL place the case name before the citation text in the same way, and its "On record" part SHALL stay as Requirement 10.6 defines it.
13. FOR ALL Documents, verification results, quote results and Display_Info, WHERE the Case_Name_Option is on, EACH citation row whose Full_Citation has a `caseName` SHALL carry that `caseName`, and WHERE the option is off, THE rows SHALL equal the rows built without the argument (Property 1, extended).

### Requirement 20: Touch use

**User Story:** As a filer on a phone, I want text that does not make the screen zoom and buttons and links I can hit with a thumb, so that I can use the page without pinching.

#### Acceptance Criteria

1. THE Draft_Box text SHALL be 16px at every width and on every device.
2. WHILE the device is a Touch_Device, THE Check_Page SHALL give every button a height of at least 44px.
3. WHILE the device is a Touch_Device, THE Check_Page SHALL give every link a height of at least 44px, including the header link, the links under the results, the View on CourtListener links and the Editor_Link.
4. WHILE the device is a Touch_Device, THE Small_Screen_Page SHALL give every link a height of at least 44px.
5. WHILE the device is a Touch_Device, THE Courts_Page SHALL give the two links under each rule ("Read the court's text" and "Draft under this rule") a height of at least 44px.
6. THE touch rules SHALL be written in the stylesheets of those pages inside the media query `@media (pointer: coarse)` and SHALL NOT use a width at-rule.
7. WHILE the device is not a Touch_Device, THE Check_Page, THE Small_Screen_Page and THE Courts_Page SHALL show the button heights, the link heights and the layout they show before this follow-up, so that the desktop look is unchanged.
8. THE Static_Scans SHALL accept `@media (pointer: coarse)` as the only at-rule in a page or component stylesheet that is not a width at-rule, and SHALL fail on any other media query that is not the one width at-rule the Shell already holds.
9. THE Static_Scans SHALL continue to assert that exactly one width at-rule exists in the Shell's stylesheets, and SHALL NOT count `@media (pointer: coarse)` toward it.
10. THE Static_Scans SHALL accept a `font-size` of 16px on the Draft_Box and on no other selector, and SHALL fail on 16px elsewhere and on any other size outside the allowed list.
11. THE UI_Rules SHALL record the touch rule, the 16px text-entry size and the statement that the desktop look is unchanged.
12. THE confirm dialog opened from the Check_Page is shared with the editor and is not changed by this requirement.

### Requirement 21: The hand-over notice reads as one sentence

**User Story:** As a filer who carried a draft into the editor, I want the notice to read as plain English, so that the page does not look careless.

#### Acceptance Criteria

1. WHEN the editor installs a Hand_Over, THE editor SHALL show the notice "Opened the draft from the checker: <n> characters, marked as pasted." with a lower-case "the" after "Opened".
2. THE Hand_Over_Name SHALL be chosen so that the success notice of criterion 1 reads correctly, and THE `openedMessage` function and the other `open-messages.ts` sentences SHALL stay unchanged.
3. IF a Hand_Over is refused by the limits of `textOutcome`, THEN THE editor SHALL show a refusal sentence that begins with a capital letter.
4. WHEN a file is opened with the Open flow, THE editor SHALL show the file name exactly as before, with its own case.

### Requirement 22: One statement about storing the draft

**User Story:** As a filer reading the top of the page, I want one clear statement about whether my draft is kept, so that I am not told the same thing twice in different words.

#### Acceptance Criteria

1. THE Check_Page SHALL carry exactly one Storage_Statement and SHALL remove the two overlapping sentences "Nothing is saved unless you open the draft in the editor." and "Your draft is not stored. It is gone when you reload this page." as separate sentences.
2. THE Storage_Statement SHALL say, at every width, that the draft is not stored and is gone when the page is reloaded.
3. WHILE the viewport is a Wide_Viewport, THE Storage_Statement SHALL also say that opening the draft in the editor stores it there.
4. WHILE the viewport is narrower than `NARROW_WIDTH`, THE Check_Page SHALL NOT mention the editor link or storing the draft in the editor, and the server-rendered HTML SHALL NOT contain that clause.
5. THE Check_Page SHALL decide criterion 3 and criterion 4 from the same Wide_Viewport value that decides the Editor_Link, read through `svc.viewport` and updated live.
6. THE privacy sentence SHALL keep the claims of Requirement 11.1 other than the storage clause: only the citations and the case names written before them are sent, to this site and from there to CourtListener, and the rest of the draft stays in the browser.
7. THE README line under "What leaves your machine" for the Check_Page SHALL agree with criteria 2, 3 and 6.
8. THE Check_Page text SHALL hold no exclamation mark, so that the docs scan and `copy-rules.test.ts` pass.
9. THE tests SHALL show the Storage_Statement at a viewport of 375px and at 1280px, and the server HTML at the narrow default.

### Requirement 23: The Editor_Link follows the viewport width

**User Story:** As a filer who widens the window or turns a tablet, I want the page to offer the editor link when it fits, so that I do not need to reload.

#### Acceptance Criteria

1. WHEN the page is loaded at a narrow width and the viewport then becomes a Wide_Viewport, THE Check_Page SHALL show the Editor_Link without a reload, provided the Draft_Box holds text and the results are not out of date.
2. WHEN the viewport becomes a Wide_Viewport, THE Check_Page SHALL show the extra clause of the Storage_Statement together with the Editor_Link.
3. WHEN the viewport becomes narrower than `NARROW_WIDTH` again, THE Check_Page SHALL remove the Editor_Link and the extra clause.
4. THE Check_Page SHALL read the width through `svc.viewport.width` and `svc.viewport.subscribe`, as the Shell does, and SHALL hold no copy of the width that is decided once at load.
5. THE test suite SHALL contain example tests for: load narrow then widen; widen then narrow; and the same two steps driven through the browser's real `resize` event, so that the production `browserViewport` is covered and not only a fake.
6. THE design follow-up SHALL state the root cause of the frozen link, found by a failing test before the fix.
