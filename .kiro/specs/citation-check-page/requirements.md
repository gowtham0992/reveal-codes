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

## Second follow-up: findings from a cold use of the live site

An outside reviewer used the live site with no briefing, and the author reproduced each finding. Five findings are Requirements 24 to 28. Requirement 29 covers process and documents. They add to Requirements 1 to 23 and rewrite none. Where a criterion below changes what an earlier criterion says, the criterion below names the earlier one and wins, as the author approved in "Decisions (second follow-up)" at the end of this document.

None of the five was found by a test. The suite was green, `pnpm kiro:check` passed and the author's own walk at 375px, 320px and 1280px found nothing here. Requirement 29 records that.

Conflicts with earlier text, stated here so that none is hidden:

- Requirement 24 changes `/api/verify` and adds one read-only export to the Verifier. The Introduction says "The Engine, the Verifier, the routes and the Toolbar are not changed", the out-of-scope line says "any change to the verifier or the routes", and criterion 5.8 says the Check_Page "SHALL add no route and change none". All three are contradicted for `/api/verify`. Decision 1 approves it.
- Requirement 24 also moves the rate-limit decision after the body is read, which changes the documented behaviour "429 before the body is read" (the comment in `verify-route.ts`, the test "refuses before the body is read or any lookup is made" in `route-limits.test.ts`, and the BUILD_LOG entry of 2026-11-10). Decision 4 covers it.
- Requirement 25 stores display information that `case-match` Requirement 7, criteria 5 and 6 say is kept in memory only and is not in "the autosaved value". Decision 9 lists every place to amend.
- Requirement 26 changes the Toolbar, which the Introduction and the first follow-up's scope say is not changed.
- Requirement 27 replaces criterion 6.9 and the "divergence words" in criteria 8.1 and 19.13 (Property 1), and the Pane status text of `editor-app` Requirement 13, criterion 6 and Requirement 18, criterion 11.
- Requirement 28 amends criterion 2.5 and criterion 14.3.

Scope: `apps/web` (`src/server/verify-route.ts`, `src/server/rate-limit.ts`, `src/persist.ts`, `src/autosave.ts`, `src/components/use-autosave.ts`, `src/components/use-verify.ts`, `src/client/resolved.ts`, `src/client/divergence.ts`, `src/client/check-rows.ts`, `src/components/toolbar.tsx`, `src/components/next-step.ts`, `src/components/editor-surface.tsx`, `src/components/use-pane.ts`, `src/components/issues-list.tsx`, `src/check/check-page.tsx`, `src/check/result-list.tsx`, the tests and the static scans), `packages/verifier` (one added read-only export, Requirement 24), `README.md`, `docs/DEVELOPMENT.md`, `docs/demo-script.md`, `docs/KIRO_USAGE.md`, `BUILD_LOG.md` and `.kiro/steering/ui.md`. The Engine, the exported DOCX, the Statement, the Appendix, the print view's output, the Sentinel and every route other than `/api/verify` are not changed. No dependency, environment variable or route is added.

### Measurements taken from the code (second follow-up)

These numbers are read from the sources named, and the requirements below use them.

- Avianca sample (`apps/web/public/avianca-citations.txt`): 6 Full_Citations, which are 6 distinct Citation_Lines (`925 F.3d 1339`, `905 F. Supp. 2d 121`, `174 F.3d 366`, `516 F.3d 1237`, `516 U.S. 217`, `501 U.S. 32`). Nothing else in the file reaches the service.
- Demo motion (`packages/engine/fixtures/demo-motion.txt`): 5 Full_Citations, which are 5 distinct Citation_Lines (`556 U.S. 662`, `404 U.S. 519`, `1047 F.3d 212`, `1012 F. Supp. 2d 88`, `912 F. 4th 33`). Two short forms (`Iqbal, 556 U.S. at 679` and `Id. at 221`) and one statute reference are never sent.
- Verify limit today: `VERIFY_LIMIT` is 6 requests per address in a fixed window of `ROUTE_WINDOW_MS` (60,000 ms), in `rate-limit.ts`. Every request counts, answered from the cache or not. It is applied in `handleVerify` before the body is read. It is off when the server is in fixtures mode (`routeGuard(..., config.mode === "live")`).
- Opinion limit today: `OPINION_LIMIT` is 30 per address per minute, on `/api/opinion/[clusterId]`, also counted before any work.
- Verifier request bucket (`packages/verifier/src/bucket.ts`): `CAPACITY` 60 lines, one line refilled every `REFILL_MS` (1,000 ms), and a sliding window `WINDOW_MS` (60,000 ms) in which at most 60 lines may be dispatched. It is one bucket per server process, shared by every address. A request waits for it and, after three tries that do not advance the clock, leaves its lines `unchecked`.
- Chunks: at most 60 lines and 64,000 characters per request to CourtListener (`chunk.ts`).
- Cache: `CacheStore` inside the Verifier's `Deps`. The key is the Citation_Line (`<volume> <reporter> <page>`, pincite-free, from the Engine's `format`), so the case name the author wrote is not part of the key. The time to live is `CACHE_TTL_MS` (86,400,000 ms, 24 hours). A `verified`, `ambiguous` or `not_found` line is cached. An `unchecked` line is never cached. In fixtures mode the store is in memory (`createMemoryCacheStore`, a `Map` with no size bound); in live mode it is a directory of files (`createFileCacheStore`, default `~/.reveal-codes/cache`). The cache is per server instance, as the limiter is.
- Today's order in `handleVerify`: the limiter (`overRouteLimit`, which counts) first; then `readBodyCapped` (at most `MAX_BODY_BYTES`, 262,144); then the 200,000 character check (`MAX_TEXT_CHARS`); then `parseVerifyBody`; then `lookupWithInfo`, which reads the cache inside `readCache` and only then dispatches. So the limiter runs before the Verifier and before anything is known about the cache.
- Other protections on the route today: POST only (405 for other methods); 413 over 262,144 bytes; 413 over 200,000 characters (`DOCUMENT_TOO_LONG`); 400 for a body that is not JSON, has other keys than `records`, or holds a record that is not a well-formed Full_Record; 413 over `MAX_RECORDS` (500); `caseName` at most `MAX_CASE_NAME` (200) code units; the Verifier's bucket and chunking above; `maxDuration` 60 seconds; fixed messages that never echo input.
- Toolbar (`toolbar.module.css`, `globals.css`): buttons are 13px Public Sans, weight 500, `padding: 0 10px`, 1px border, 8px gap; the Shell's minimum width is `--shell-min` 1150px. Widths below are estimates at about 7px a character, not browser measurements: "Load demo motion" about 130px, "Load the Avianca citations" about 195px, "Load Mata v. Avianca" about 150px (20 characters). The design measures these in a browser (Requirement 26, criterion 10). The notice area (`flex: 1`, `min-width: 0`) shrinks first and ends in an ellipsis.
- Display_Info is held in `useVerify` as `ResolvedSession = { epoch, info: Map<IssueKey, DisplayInfo> } | null` (`use-verify.ts`, `client/resolved.ts`). It is set when a run completes, read only while `session.epoch === store.epoch` and the stored `clusterId` equals the citation's current `clusterId`, and it is lost on reload because `useState` starts at `null`. `DisplayInfo` is `{ clusterId, foundName, foundYear?, absoluteUrl? }`.
- The Persisted_Value is `{ version: 1, codes, runLog, verifiedAt, declaration? }` under `localStorage` key `reveal-codes:document:v1` (`persist.ts`). `deserialise` ignores keys it does not know. The `declaration` field is the precedent for an optional field with the version unchanged.
- A `wrong_case` result already stores `clusterId`, `foundName` and `foundYear` in the Document and in the codes. Only its `absoluteUrl` is lost on reload, which is why the link falls back to `/opinion/<id>/x/`. A `verified` result stores only `clusterId`, so its found name is lost.
- Issue keys (`k<N>`) are carried in the full codes (`check-citations.ts` checks them), so a key saved with the draft names the same citation after reload.
- The divergence text is built in one function, `divergenceWords` in `client/divergence.ts`, and shown in three places: the Issues row (`issues-list.tsx`, through `divergenceFor` in `check-rows.ts`), the Check_Page's result list (`result-list.tsx`, through the same `divergenceFor`), and the Pane's status text (`composeStatus` in `use-pane.ts`, which calls `divergenceWords` directly). The Export dialog (`export-issues.tsx`) and the Copy_Text show no divergence. The Statement carries `prefixLength` as data and does not print it. No exported text, no Appendix text outside the existing codes, and nothing the Sentinel parses holds the divergence words.
- The Check_Page renders the Editor_Link when `wide && !stale && text !== ""` (`check-page.tsx`), and `PageLinks` always renders "Open the editor" beside "See all court rules".

### Second follow-up glossary

- **Verify_Route**: `handleVerify` in `apps/web/src/server/verify-route.ts` and the route file `app/api/verify/route.ts` that calls it.
- **Verifier**: `packages/verifier`.
- **Citation_Line**: the text `<volume> <reporter> <page>` that the Verifier builds from a Full_Record, the unit that is cached and sent to CourtListener.
- **Cache_Answered_Request**: a request to the Verify_Route whose records need no Citation_Line that is missing from the Verifier's cache when the Verify_Route reads it. A request whose records yield no Citation_Line at all is a Cache_Answered_Request.
- **Service_Request**: a request to the Verify_Route that is not a Cache_Answered_Request, so that its lookup would ask the citation service for at least one Citation_Line.
- **Verify_Limit**: the number of Service_Requests one address may make in one `ROUTE_WINDOW_MS`.
- **Request_Ceiling**: the number of requests of any kind, answered from the cache or not, that one address may make to the Verify_Route in one `ROUTE_WINDOW_MS`, checked before the body is read (Decision 4).
- **Route_Protections**: the protections listed under "Other protections on the route today" in the measurements above, together with the Verifier's bucket and chunking.
- **Saved_Display_Info**: the Display_Info of the latest completed Verify_Run, stored with the saved draft (Requirement 25).
- **Draft_Value**: the Persisted_Value, the JSON stored under the Autosave_Key.
- **Toolbar**, **Next_Step**, **Empty_Page**, **Persisted_Value**, **Draft_Gate**, **Issues_Region**, **Resolved_List**, **Display_Info**: as defined by the editor-app, first-run-and-flow, open-draft and case-match specs.
- **Avianca_Sample** and **Demo_Sample**: the two samples the editor loads, `/avianca-citations.txt` and `/demo-motion.txt`.
- **Sample_Buttons**: the two Toolbar buttons that load the Avianca_Sample and the Demo_Sample.
- **Sample_Links**: the plain links under the placeholder on the Empty_Page.
- **Match_Tail**: the last three whole words of the part of a quotation that matches the opinion, or fewer when fewer match.
- **Divergence_Sentence**: the one sentence that says where a quotation stops matching the opinion, built from the Match_Tail and `divergenceWords` (Requirement 27).
- **Footer_Editor_Link**: the link "Open the editor" in `PageLinks` at the foot of the Check_Page.

### Requirement 24: A check answered from the cache does not use up the limit

**User Story:** As a judge or filer who checks the same draft more than once, or who shares an address with others, I want repeat checks that cost the citation service nothing to be free, so that I am not told "Too many checks" for work that took 150 milliseconds.

#### Acceptance Criteria

1. WHEN the Verify_Route receives a Cache_Answered_Request from an address that is not in fixtures mode, THE Verify_Route SHALL leave that address's Verify_Limit count unchanged.
2. WHEN the Verify_Route receives a Service_Request, THE Verify_Route SHALL count it once against the Verify_Limit of its address.
3. IF a Service_Request arrives from an address whose Verify_Limit count has been reached in the current window, THEN THE Verify_Route SHALL answer 429 with the sentence `CHECKS_BUSY` and a `Retry-After` header, and SHALL make no lookup and no request to the citation service.
4. THE Verify_Route SHALL answer 429 with the sentence "Too many checks from this address. Try again in a moment." (`CHECKS_BUSY`) and with the headers `tooManyRequests` sets today, with no change to either.
5. THE Verify_Limit SHALL be 10 Service_Requests per address per `ROUTE_WINDOW_MS` (Decision 2).
6. THE Verify_Route SHALL decide whether a request is a Cache_Answered_Request after the body has passed the size, text length, JSON, shape, record count and record checks, and before `lookupWithInfo` runs.
7. THE Verifier SHALL export one read-only function that returns which Citation_Lines of a list of records are missing from the cache, using the same line building and the same cache guard as `lookupWithInfo`, so that the Verify_Route and `lookupWithInfo` cannot disagree about what is cached (Decision 3).
8. THE added Verifier function SHALL write nothing to the cache and SHALL leave the `hits`, `misses` and `writes` counters of `verifierStatus` unchanged.
9. THE Verifier SHALL change no existing exported function, type or result, and `lookupWithInfo` SHALL receive the same arguments and return the same value as before.
10. WHEN a Cache_Answered_Request is answered, THE Verify_Route SHALL return the same status and the same body that `lookupWithInfo` returns for the same records today.
11. IF a cache entry that was present when the Verify_Route decided is missing when `lookupWithInfo` reads it, THEN THE Verify_Route SHALL NOT refuse the request and SHALL NOT count it a second time.
12. IF a Service_Request counted by the Verify_Route ends with every line `unchecked` because the citation service could not be reached, THEN THE Verify_Route SHALL keep that request counted.
13. WHEN a request has partly cached records, THE Verify_Route SHALL treat it as a Service_Request and SHALL count it once, however many of its lines are missing.
14. WHEN a request holds `{"records":[]}` or only records that yield no Citation_Line, THE Verify_Route SHALL treat it as a Cache_Answered_Request.
15. WHEN the server is in fixtures mode, THE Verify_Route SHALL apply no Verify_Limit and no Request_Ceiling, as today, and SHALL read no cache for the purpose of limiting.
16. THE Verify_Route SHALL refuse with 429 and `CHECKS_BUSY` any request from an address that has made 60 requests of any kind in the current window, before the body is read, and SHALL count every request it lets through.
17. THE Verify_Route SHALL keep every one of the Route_Protections as it is, with the same limits, the same status codes and the same fixed messages.
18. THE `/api/opinion/[clusterId]` route and its limit of 30 per address per minute SHALL stay as they are (Decision 5).
19. THE Check_Page SHALL send the same requests as before (criterion 5.8, first half), so that the change is entirely on the server.
20. THE test suite SHALL show that, with a live guard and a cache that holds every line of a draft, any number of repeated checks of that draft up to the Request_Ceiling answers 200 each time and makes no request to the citation service after the first.
21. THE test suite SHALL show that Service_Requests from one address answer 200 up to the Verify_Limit, answer 429 after it, answer 200 again in the next window, and count each address on its own.
22. THE test suite SHALL show that a partly cached request, an empty `records` list, a cache miss caused by an `unchecked` line, and a request refused by the limit each count as criteria 2, 14, 12 and 3 say.
23. THE test suite SHALL show that the 429 sentence and headers equal those of the tests before this change, and that fixtures mode never limits.
24. THE test "refuses before the body is read or any lookup is made" in `route-limits.test.ts` SHALL be replaced by tests of criteria 3, 16 and 17, and the tests that call `handleVerify` six or seven times with `fixturesDeps()` SHALL be rewritten so that they count Service_Requests.
25. THE comments in `rate-limit.ts` ("/api/verify: 6 requests per address per minute") and `verify-route.ts` ("429 before the body is read"), the line in `docs/DEVELOPMENT.md` that says "`/api/verify` allows 6 requests", and the README line about request limits (if it states the number) SHALL state the new rule and the new number.
26. THE Requirement 24 criteria SHALL replace, for `/api/verify` only, the Introduction's sentence "The Engine, the Verifier, the routes and the Toolbar are not changed" as it applies to the Verifier and the routes, the out-of-scope phrase "any change to the verifier or the routes", and the clause "and change none" in criterion 5.8, as Decision 1 approves.

### Requirement 25: A reload keeps the found case names

**User Story:** As a filer who verifies a draft, closes the tab and comes back, I want the Issues region to show the same cases on record and the same CourtListener links, so that I do not have to verify again to read them.

#### Acceptance Criteria

1. WHEN a Verify_Run completes, THE Web_App SHALL store the Saved_Display_Info in the Draft_Value, as one optional field with the Persisted_Value version unchanged (Decision 7).
2. THE Saved_Display_Info SHALL hold, for each entry, the issue key and the Display_Info fields `clusterId`, `foundName`, `foundYear` and `absoluteUrl` where present, and nothing else, so that it holds no draft text.
3. WHEN the page loads and the Draft_Value restores with Saved_Display_Info, THE Issues_Region SHALL show the same Resolved_List rows, the same found case names and the same CourtListener addresses as before the reload, with no Verify_Run.
4. WHILE the Saved_Display_Info of a key is shown, THE Web_App SHALL use it only while the `clusterId` of the entry equals the `clusterId` of the citation's current result, as `case-match` Requirement 7, criterion 5 says today.
5. WHEN a Full_Citation's verification result is cleared by an edit to that citation, THE Web_App SHALL remove that citation's Saved_Display_Info from memory and from the stored Draft_Value in the same write.
6. WHEN the Document is replaced (New, Open, a sample, a Hand_Over, or a restore), THE Web_App SHALL remove all Saved_Display_Info of the earlier Document, and SHALL keep only the entries that come with a restored Draft_Value.
7. THE Web_App SHALL write only entries whose key names a Full_Citation of the saved Document with a `verified` or `wrong_case` result whose `clusterId` equals the entry's `clusterId`, so that an entry never outlives the result it describes.
8. WHEN a Draft_Value has no Saved_Display_Info field, THE Web_App SHALL load the Document as it does today and SHALL show no Resolved_List until a Verify_Run completes.
9. IF the Saved_Display_Info field of a Draft_Value is not an array of valid entries, THEN THE Web_App SHALL ignore the field, SHALL load the Document, and SHALL NOT set the Draft_Gate.
10. IF one entry of the field is not valid, THEN THE Web_App SHALL ignore that entry and keep the others.
11. WHILE the Draft_Gate is blocked, THE Web_App SHALL write no Saved_Display_Info, as it writes nothing else.
12. THE Draft_Gate SHALL block for exactly the faults it blocks for today (`not_json`, `bad_shape`, `bad_codes`), and a Saved_Display_Info fault SHALL NOT be one of them.
13. WHEN the author chooses Save a copy, THE Web_App SHALL hand over the stored string unchanged, so that the downloaded text equals the stored Draft_Value and now includes the Saved_Display_Info when one is stored (Decision 10).
14. THE print view SHALL read the Draft_Value and SHALL ignore the Saved_Display_Info.
15. THE Saved_Display_Info SHALL NOT appear in the Document, in the Reveal Codes serialisation (`render(document, "full")`), in the Provenance_Appendix, in the Statement, in the DOCX, or in the Copy_Text.
16. FOR ALL Documents and Display_Info, THE exported DOCX of a Document SHALL be byte-identical whether or not Saved_Display_Info is stored for it (Property 3).
17. THE Check_Page SHALL keep its Display_Info in memory only and SHALL write nothing to storage, as criterion 3.10 says, and the Hand_Over SHALL carry the text only, as criterion 12.9 says.
18. WHEN the Saved_Display_Info of a Document changes, THE autosave SHALL schedule a write with the same 300 ms debounce as a change to the Document.
19. FOR ALL Documents and Display_Info maps, deserialising the Draft_Value that serialising them produces SHALL give the Document and exactly the entries that criterion 7 keeps, and entries that criterion 7 drops SHALL be absent (Property 3).
20. THE test suite SHALL show: verify, reload, same rows and same addresses; edit a citation, its entry and its row go; New, Open, a sample and a Hand_Over clear the entries; an old value without the field loads; a malformed field is ignored and leaves the Draft_Gate open; Save a copy equals the stored string; the print view ignores the field; the `/check` page writes nothing.
21. THE comments that call the Display_Info "memory only" (`link.ts`, `resolved.ts`, `use-verify.ts`, `verify-flow.ts`) SHALL say that it is kept in memory and stored with the saved draft, and never stored in the Document.
22. THE README SHALL say, under "What leaves your machine" or where it describes the saved draft, that the saved draft in this browser also holds the case names found for verified citations, and that nothing of this is sent anywhere.
23. THE criteria of Requirement 25 SHALL replace `case-match` Requirement 7, criterion 5 (the words "in memory only") and criterion 6 (the words "in the autosaved value") and the "Autosave" column of the table in `case-match` design for the found name and the `absoluteUrl`, as Decision 9 approves.

### Requirement 26: The Avianca sample comes first

**User Story:** As a visitor who opens the editor with no draft, I want the first thing offered to be the sample that shows the case-name check, so that I see the strongest result first.

#### Acceptance Criteria

1. WHILE the Document has no text and no Verify_Run is in flight, THE Next_Step SHALL name the Avianca_Sample, and THE Toolbar SHALL mark the Avianca button with `data-primary="true"` and no other button.
2. THE Toolbar SHALL show the Sample_Buttons directly after Open, with the Avianca button first and the Demo_Sample button second.
3. THE Demo_Sample button SHALL keep its label "Load demo motion", its action and its confirm when the draft is not empty, and SHALL carry no `data-primary`.
4. THE Avianca button SHALL do what the Sample_Link "Load the Avianca citations" does today: fetch `/avianca-citations.txt`, ask the same confirm when the draft is not empty, install the text as pasted text, and show `AVIANCA_FAILED` on failure.
5. THE Toolbar label of the Avianca button SHALL be "Load Mata v. Avianca", THE Demo_Sample button SHALL stay "Load demo motion", and THE Empty_Page link SHALL keep "Load the Avianca citations" (Decision 11).
6. THE Sample_Links on the Empty_Page SHALL appear in this order: "Load the Avianca citations", "Load demo motion", "Open a draft" (Decision 12).
7. THE Sample_Links SHALL keep the link style and the behaviour they have today, with no icon and no `data-primary`.
8. THE Toolbar SHALL show every button label in full, without wrapping and without clipping, at the Shell's minimum width of 1150px.
9. WHILE the viewport is 1150px wide and the text is empty, THE Toolbar SHALL keep its notice area, which may end in an ellipsis as it does today, and SHALL NOT hide the Court rules link.
10. THE design SHALL include a measurement, in a real browser at a 1150px viewport, of the widths of both Sample_Buttons and of the remaining notice area, SHALL report any result in which the buttons do not fit, and THE BUILD_LOG SHALL state the measured values.
11. THE `nextStep` function SHALL return a value that names the Avianca_Sample in place of `load-demo`, and `PRIMARY_LABEL` SHALL carry its label.
12. THE other rules of the Next_Step (nothing while a run is in flight, Verify, Export) SHALL stay as they are.
13. THE `.kiro/steering/ui.md` "Controls" rule "Primary" SHALL say "Load Mata v. Avianca when the text is empty" in place of "Load demo motion when the text is empty", and its Empty_Page rule SHALL give the new order of the Sample_Links.
14. THE README "Demo path" SHALL keep step 2 true by naming the Demo_Sample button as the second sample button, and SHALL say that the Avianca_Sample is the first sample offered.
15. THE `docs/demo-script.md` row at 0:00 SHALL say to select **Load demo motion** (the second sample button), and its closing sentence about the Avianca_Sample SHALL say that the Avianca_Sample is the first button.
16. THE tests that name the old order or the old primary (`app-shell.test.tsx`, `unreadable-draft.test.tsx`, `open-empty-page.test.tsx`, `editor-surface-links.test.tsx`, `avianca.test.tsx`, `samples-declaration.test.tsx`, `next-step.test.ts`, `next-step.properties.test.ts`, `next-step-gap.properties.test.ts`) SHALL be updated to the new order, the new primary and the new Next_Step value.
17. THE Check_Page's action order (criterion 2.2) SHALL stay as it is.
18. THE criteria of Requirement 26 SHALL replace, for the Toolbar and the `ui.md` rules named above only, the Introduction's sentence that the Toolbar is not changed.

### Requirement 27: A divergence reads as a comparison

**User Story:** As a filer whose quotation is not in the opinion, I want the row to show how far the quotation matches before it differs, so that I do not take the shown words for clipped text.

#### Acceptance Criteria

1. THE Web_App SHALL build the Divergence_Sentence in one function, `divergenceSentence(quoteText, prefixLength)` in `src/client/divergence.ts`, which calls `divergenceWords` for the differing part and builds nothing twice.
2. THE Issues row, the Check_Page's result list and the Pane's status text SHALL each show the string that `divergenceSentence` returns, and SHALL NOT build any part of it themselves.
3. THE Issues row and the result list SHALL show the sentence alone, without the prefix "Diverges at: ", and the Pane's status text SHALL show `statusText` followed by two spaces and the sentence.
4. WHEN one or more whole words of the quotation match the opinion before the first differing word, THE Divergence_Sentence SHALL read `Matches the opinion up to "<Match_Tail>", then differs: "<differing words>"`.
5. THE Match_Tail SHALL be the last three whole words before the first differing word, or all of them when fewer than three precede it, joined by single spaces.
6. WHERE words of the quotation precede the Match_Tail, THE Divergence_Sentence SHALL put "… " (the ellipsis character U+2026 and a space) before the Match_Tail inside the quotation marks, and WHERE the Match_Tail begins at the first word of the quotation, THE Divergence_Sentence SHALL put nothing before it (Decision 13).
7. THE differing words SHALL be the string `divergenceWords` returns today: the word that holds the divergence, or the next word, and up to five more, with "…" after the last word when more words follow.
8. WHEN the quotation differs at its first word, THE Divergence_Sentence SHALL read `Differs from the opinion from the first word: "<differing words>"`.
9. WHEN the divergence falls inside a word, THE Divergence_Sentence SHALL put the whole word in the differing words and SHALL end the Match_Tail at the word before it.
10. WHEN the quotation holds fewer than three words before the divergence, THE Divergence_Sentence SHALL show those words with no leading ellipsis.
11. WHEN the quotation holds no word, THE Divergence_Sentence SHALL be the empty string, and THE Issues row and the result list SHALL show no divergence line.
12. THE Divergence_Sentence SHALL use the straight double quotation mark `"` and the ellipsis character U+2026, SHALL be plain text with no icon, and SHALL contain no exclamation mark (Decision 13).
13. THE Divergence_Sentence SHALL carry the words of the quotation as written in the Document, with no change to their apostrophes or quotation marks.
14. FOR ALL quotation texts and prefix lengths within the text, THE text after "then differs: " (or after "from the first word: ") SHALL equal the quotation in quotation marks of the `divergenceWords` result, and the Match_Tail SHALL be a run of at most three words of the quotation that ends where the differing words begin (Property 4).
15. THE change SHALL alter no byte of the exported DOCX, the Statement, the Appendix, the Reveal Codes serialisation or the Copy_Text, and no value the Sentinel reads, because none of them holds the divergence words today (see the measurements above).
16. THE `row.divergence` value of `checkRows` SHALL carry the Divergence_Sentence, and Property 1 (and its extension in criterion 19.13) SHALL compare the sentence in place of "divergence words".
17. THE tests that name the old text (`issues-list.test.tsx`, `check-page.test.tsx`, `demo-path.test.tsx`, `app-shell.test.tsx`) SHALL be updated, and `divergence.test.ts` SHALL gain examples for the first-word, short-quote, mid-word, no-word and long-quote cases.
18. THE criteria of Requirement 27 SHALL replace criterion 6.9, the words "divergence words" in criteria 8.1 and 19.13, `editor-app` Requirement 13 criterion 6 and Requirement 18 criterion 11 (the label "Diverges at:"), and the "Divergence_Words" glossary entry's use at those places.

### Requirement 28: One link to the editor on the checking page

**User Story:** As a reader of the checking page on a wide screen, I want one link to the editor, so that I am not offered the same place twice.

#### Acceptance Criteria

1. WHILE the Editor_Link is rendered, THE Check_Page SHALL NOT render the Footer_Editor_Link.
2. WHILE the Editor_Link is not rendered, THE Check_Page SHALL render the Footer_Editor_Link as it does today.
3. THE Check_Page SHALL decide criteria 1 and 2 from the one condition that renders the Editor_Link (`wide`, results not out of date, and text in the Draft_Box), so that exactly one of the two links is present at any moment.
4. THE server-rendered HTML SHALL contain the Footer_Editor_Link and SHALL NOT contain the Editor_Link, because the server's width is the narrow default.
5. WHEN the viewport changes between narrower and wider than `NARROW_WIDTH`, or the Draft_Box becomes empty or non-empty, or results become out of date, THE Check_Page SHALL swap the two links without a reload.
6. THE Check_Page SHALL keep "See all court rules" in `PageLinks` in every case.
7. THE tests SHALL show one link to the editor at 375px with text, at 1280px with text, at 1280px with an empty box, and at 1280px with out-of-date results.
8. THE criteria of Requirement 28 SHALL amend criterion 2.5 (the link "Open the editor" is shown only while the Editor_Link is not) and criterion 14.3 (the Check_Page links to `/` through whichever of the two is rendered).
9. THE `.kiro/steering/ui.md` description of the one-column pages SHALL stay true, and SHALL say that the checking page shows one link to the editor.

### Requirement 29: Process and documents for the second follow-up

**User Story:** As the author and as a judge reading the repository, I want the record to say that these findings were found by a person using the live site, so that the account of what the tests did and did not catch is true.

#### Acceptance Criteria

1. THE `BUILD_LOG.md` SHALL gain a dated entry for the second follow-up with a section "What Kiro got wrong, and what fixed it" that records that all five findings were found by a reviewer using the live site cold and none by a test, that the limit counted requests answered from the cache, that the display information for found cases did not survive a reload, that the empty page led with the demo motion while every instruction starts with the Avianca sample, that "Diverges at" read as clipped text to two readers, and that `/check` showed two links to the editor.
2. THE agent that edits `BUILD_LOG.md` SHALL write the sentences of criterion 1 (Decision 15).
3. THE `BUILD_LOG.md` entry SHALL name each finding, the requirement that covers it, and the measured values that the design used (the Verify_Limit, the sample sizes, the Toolbar widths).
4. THE `BUILD_LOG.md` entry SHALL record each earlier decision that the second follow-up reverses, namely the six-a-minute count of every request, the 429 before the body is read, the memory-only Display_Info, and the demo motion as the primary sample.
5. THE README "What leaves your machine" and "Limits" lines, `docs/DEVELOPMENT.md` (the request limits line), `.kiro/steering/ui.md` (the Primary rule, the Empty_Page rule, the Toolbar, the one-column pages), `docs/demo-script.md` and the rows of `docs/KIRO_USAGE.md` SHALL be consistent with Requirements 24 to 28 when the last task ends.
6. THE `docs/KIRO_USAGE.md` SHALL gain a row for the `ui.md` edit of this follow-up, and the row for this spec SHALL still list `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`.
7. THE README SHALL keep every assertion of `apps/web/test/static/docs.test.ts` true, including that it holds no exclamation mark.
8. THE spec SHALL be committed before any task of this follow-up starts, and no commit SHALL be pushed.
9. THE final checkpoint SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build` from a clean clone after install) and `pnpm kiro:check`, every one of them after the last edit, and SHALL end with a clean working tree and every change committed.
10. THE final checkpoint SHALL push nothing.

## Decisions (second follow-up)

The author agreed to all fifteen proposals, with changes to 11 and 15 recorded below. The requirements above carry the final wording.

1. **Route change (Requirement 24). Approved.** `handleVerify` changes and the Verifier gains one read-only export. No route is added. The Introduction sentence, the out-of-scope phrase and the clause "and change none" in criterion 5.8 are replaced for `/api/verify` only (24.26). The Check_Page's own requests do not change.
2. **Verify_Limit. 10 per address per minute** for requests that reach the citation service (Service_Requests), up from 6.
3. **Cache test. A read-only Verifier function** (for example `missingLines(records, deps)`) built on `planLookup` and `isCachedLine`, writing nothing and leaving the counters alone. The route counts a request only when the function returns at least one missing line.
4. **Request_Ceiling. 60 requests of any kind per address per minute**, checked before the body is read, with the same `CHECKS_BUSY` sentence and the same headers. The Verify_Limit is checked after the cache decision. An address at the Verify_Limit that sends a malformed body gets 400 or 413, as 24.6 states.
5. **`/api/opinion/[clusterId]` unchanged**, with its limit of 30 per address per minute.
6. **Fixtures (demo) mode unchanged.** No limit applies and no cache is read for limiting.
7. **Storage shape.** One optional field `resolved` in the Persisted_Value, version still 1, written in the same `setItem` as `codes`.
8. **Clearing rule.** An entry is written only while the Document holds a Full_Citation with that key whose result is `verified` or `wrong_case` and whose `clusterId` equals the entry's. The whole map is dropped when the Document is replaced.
9. **Amendments for Requirement 25. Approved.** Each place gets a one-line note that Requirement 25 replaces its words: `case-match` Requirement 7 criterion 5 ("in memory only") and criterion 6 ("in the autosaved value"); the `case-match` design table "What is stored where" (the Autosave column for the found name and the `absoluteUrl`) and its "Display_Info, session only" label; `editor-app` Requirement 9 criterion 2 (the shape of the Persisted_Value) and limitation L11; the comments in `link.ts`, `resolved.ts`, `use-verify.ts` and `verify-flow.ts`; and the README line of criterion 25.22. The `/check` page stays memory only (25.17).
10. **Save a copy.** The code does not change. The downloaded string gains the `resolved` field when one is stored.
11. **Toolbar buttons. Changed from the proposal.** The Avianca button is labelled "Load Mata v. Avianca" and is primary while the text is empty. "Load demo motion" stays plain beside it. The Empty_Page link keeps its wording "Load the Avianca citations". The design measures both buttons at 1150px in a real browser (Playwright with Chromium against `pnpm dev`) and reports if they do not fit (26.10).
12. **Empty_Page link order.** "Load the Avianca citations", "Load demo motion", "Open a draft".
13. **Divergence wording.** `Matches the opinion up to "a pro", then differs: "se plaintiff who alleges retaliation is…"` with up to 3 matching words and up to 6 differing words. A leading "… " appears only when words were dropped before the Match_Tail. A quotation that differs at its first word reads `Differs from the opinion from the first word: "…"`. Straight quotation marks. One function, `divergenceSentence`.
14. **Footer link swap.** Accepted. The Footer_Editor_Link is replaced by the Editor_Link whenever the Editor_Link is rendered.
15. **BUILD_LOG sentences. Changed from the proposal.** The agent writes the sentences, not the author. The facts to record are: all five findings were found by a reviewer using the live site cold and none by a test; the limit counted requests that were answered from the cache; the display information for found cases did not survive a reload; the empty page led with the demo motion while every instruction starts with the Avianca sample; "Diverges at" read as clipped text to two readers; and `/check` showed two links to the editor.
