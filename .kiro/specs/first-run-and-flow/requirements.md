# Requirements Document

## Introduction

This feature makes the first minute in `apps/web` easier to follow. A first-time user pastes a draft and the page now tells them what to press next, shows what the codes mean, puts the result of Verify where the problems are, and says where the assistant will write. It changes layout, labels, text placement and the look of failing codes in the Pane. It adds one stored preference (the Pane open or closed state). No behavior of the Engine, the Verifier, the Export_Package or the Sentinel changes.

The scope is `apps/web`, plus `.kiro/steering/ui.md`, `.kiro/steering/product.md`, `README.md`, `docs/KIRO_USAGE.md` and `BUILD_LOG.md`. No dependency is added. The look stays as `ui.md` says: a tool a lawyer's office would have used. No new colour appears outside the Pane, and there are no icons, no animation and no component library.

The user's eleven decisions for this spec are binding and are carried here as Requirements 1 to 11. Requirement 11 (marks on the page) is optional. Requirements 12 to 14 cover tests, documents and scope.

### Precedence over earlier requirements

Where a decision of this spec contradicts a requirement of an earlier spec, this spec wins for the point named, and the earlier requirement is unchanged for everything else. The earlier tests that assert the old behavior are updated in the same tasks (Requirement 12).

- Decision 1 (Pane open on first visit) wins over editor-app Requirement 12, criterion 1 ("hidden on first load").
- Decision 2 (Pane header) wins over editor-app Requirement 12, criterion 7 ("no logo and no product name"), for the header only. The header font size of 12px sits beside editor-app Requirement 12, criterion 2 (Pane body 14px); the body stays 14px, so that point is not a contradiction.
- Decision 3 (failing codes filled) wins over editor-app Requirement 12, criterion 4 (the `failed` row `#FF5555` on `#0000AA` and the 1px `#AAAAAA` outline on every code, and the `pending` row for `CIT ?`), for `CIT ✘`, `CIT ?`, `QUO ✘` and their closing codes. Editor-app Requirement 11, criterion 5 (the Code_Family names) stays; the failing style is a separate flag on the Pane_Item.
- Decision 4 (primary button) adds to editor-app Requirement 10, criterion 13 and to `ui.md` "Controls"; no earlier criterion is contradicted.
- Decision 5 (Verify result in the Issues region) wins over editor-app Requirement 17, criterion 12 (the Notice that states the counts).
- Decision 6 (collapsed unchecked row) wins over editor-app Requirement 18, criterion 1 ("one row for each entry of `issues(document)`"), before the first Verify only.
- Decision 7 (assistant lines) wins over editor-app Requirement 23, criteria 1 and 2 (an always-present streaming text area).
- Decision 8 (Override dialog text) adds to editor-app Requirement 18, criterion 5; no earlier criterion is contradicted.
- Decision 9 (Export dialog) wins over export-certification Requirement 2, criterion 6 (button labels "Download .docx (<n> blocking)" and "Open print view (<n> blocking)"), over court-orders Requirement 3, criterion 5 (the 60-character cut in the Picker), and over shell-polish Requirement 12, criterion 6 (dialog body and labels unchanged) for the Export and Override dialogs.
- Decision 10 (small screens) wins over editor-app Requirement 10, criterion 1 (one page at `/` with toolbar, main region, Issues region and Pane) below 800px, and amends editor-app Requirement 10, criterion 15 (fixed grid). Shell-polish Requirement 6, criterion 2 (Page 100% of the Editor_Column when narrower than 8.5in) stays reachable when the Assistant_Column is expanded.
- The property test of Requirement 4 wins over editor-app Requirement 25, criterion 1 ("exactly five property tests"): the Web_App will have six. Property numbers are per spec, so `// Property 1` in this spec does not clash with Property 1 of editor-app.

## Glossary

- **Web_App**: `apps/web`; the system under specification.
- **Engine**: the `@reveal-codes/engine` package. It is not modified by this spec.
- **Document**: the Engine `Document` held in the Store.
- **Store**: the app Store of `apps/web/src/store.ts`.
- **Toolbar**: the 32px toolbar (`role="toolbar"`) with its three Toolbar_Groups.
- **Pane**: the Reveal Codes pane in `apps/web/src/pane/`.
- **Pane_Body**: the scrolling part of the Pane that holds the Pane_Items.
- **Pane_Header**: the strip at the top edge of the Pane, above the Pane_Body, defined in Requirement 2.
- **Legend**: the right-hand part of the Pane_Header that lists seven codes with a word for each.
- **Pane_Key**: the `localStorage` key `reveal-codes:pane:v1`.
- **Pane_Preference**: the JSON value `{ "version": 1, "open": <boolean> }` stored at the Pane_Key.
- **Valid_Preference**: a stored value that parses as JSON into an object whose `version` is the number 1 and whose `open` is a boolean.
- **First_Visit**: the state in which the Pane_Key holds no Valid_Preference (absent, unreadable, not JSON, or the wrong shape).
- **Autosave_Key**: the `localStorage` key `reveal-codes:document:v1`.
- **Saved_Draft**: a value at the Autosave_Key that the Web_App can restore into a Document whose text is not empty.
- **Failing_Code**: a Pane Code_Item that is an opening code `[CIT ✘]`, `[CIT ?]` or `[QUO ✘]`, or the closing code `[/CIT]` or `[/QUO]` that closes one of those.
- **Primary_Button**: the one Toolbar button drawn with an ink background and paper text (Requirement 4).
- **Next_Step**: the value `load-demo`, `verify`, `export` or `none` that Requirement 4 assigns to a Document state.
- **Unchecked_Count**: the number of entries of `issues(document)` whose code is `CIT …` or `QUO …`.
- **Verifiable_Unchecked_Count**: the number of unchecked citations plus the number of unchecked quotations that a Verify run can act on. An unchecked citation counts when it is a full citation whose code is `CIT …`. An unchecked quotation counts when its code is `QUO …` and it is attributed to a citation that Verify can check or re-check (a full citation, whatever its current code). It is zero when the Verify button is disabled because the Document holds no full citation (a short form such as `Id.` is not verifiable, and a `QUO …` attributed to no checkable citation is not verifiable).
- **Verify_In_Flight**: the state in which a Verify run has started and not yet ended.
- **Blocking_Count**: the length of `blockingIssues(document)`.
- **Check_Time**: the `verifiedAt` timestamp the Store records when a Verify run completes. It is null for a Document on which no Verify run has completed, and the Store resets it to null when a Document is replaced.
- **Verify_Summary**: the lines under the Issues heading that report the result of a Verify run (Requirement 5).
- **Issues_Region**: the right-hand region with the heading "Issues".
- **Issues_List**: the list of issue rows in the Issues_Region.
- **Unchecked_Row**: the single row of Requirement 6 that stands for all unchecked items.
- **Status_Position**: the text `Ln <l> Pos <p>`, where `<l>` and `<p>` are the line and position numbers that the Status_Line shows for the caret (the numbers `statusText` produces).
- **Assistant_Panel**: the expanded left-hand panel with the prompt box and the Draft button.
- **Reply_Box**: the box in the Assistant_Panel that shows the assistant's text that is in the Document.
- **Insertion_Line**: the line number `<l>` of the first inserted character of an assistant run, that is, the line of the Document position at which the inserted text begins, computed with the line numbering of the Status_Position. It is not the caret line after the insertion.
- **Override_Dialog**: the modal dialog that collects an override reason.
- **Export_Dialog**: the modal dialog opened by the Export button.
- **Picker**: the court or judge select in the Export_Dialog.
- **Issue_Text**: the text of the citation or quotation of an issue, `document.text.slice(start, end)`, cut to at most 80 code points with the last one an ellipsis when cut, by the existing shortening function.
- **Shell**: the three-column page of toolbar, editor column and Issues_Region, with the Assistant_Column or Assistant_Strip at the left while the assistant is present.
- **Narrow_Viewport**: a viewport narrower than 800 CSS pixels.
- **Small_Screen_Page**: the plain page of Requirement 10 that replaces the Shell in a Narrow_Viewport.
- **UI_Palette**: `#FFFFFF`, `#111111`, `#B0B0B0`, `#ECECEC` and the accent `#1F3A8A`, as defined in `ui.md`.
- **Pane_Files**: the files under `apps/web/src/pane/`.
- **Css_Scan**: the static test `apps/web/test/static/css-rules.test.ts`.
- **Local_Time**: a timestamp shown as `HH:MM` in the browser's time zone on a 24-hour clock, with two digits for the hour and for the minute.

## Requirements

### Requirement 1: The Pane is open on a first visit

**User Story:** As a first-time user, I want the codes to be visible when I arrive, so that I see what the product does without knowing the Alt-F3 key.

#### Acceptance Criteria

1. THE Web_App SHALL store the Pane open or closed state at the Pane_Key as a Pane_Preference.
2. WHEN the user toggles the Pane with Alt-F3 or the Toolbar button, THE Web_App SHALL write the new state to the Pane_Key as a Pane_Preference.
3. WHEN the page loads and the Pane_Key holds a Valid_Preference, THE Pane SHALL start in the state that the `open` field gives, whether or not a Saved_Draft exists.
4. WHEN the page loads in the First_Visit state and no Saved_Draft exists, THE Pane SHALL start open.
5. WHEN the page loads in the First_Visit state and a Saved_Draft exists, THE Pane SHALL start closed.
6. WHEN the page loads in the First_Visit state, THE Web_App SHALL write the state chosen by criterion 4 or 5 to the Pane_Key as a Pane_Preference, so that a reload after the first paste keeps the Pane as the user saw it.
7. IF reading the Pane_Key throws, THEN THE Web_App SHALL treat the state as First_Visit.
8. IF writing the Pane_Key throws, THEN THE Web_App SHALL keep the Pane state in memory and SHALL set no Notice.
9. WHEN the user confirms "New", THE Web_App SHALL leave the Pane_Key unchanged.
10. THE Alt-F3 shortcut, the F7 prompt and the Toolbar button labels "Show codes (Alt-F3)" and "Hide codes (Alt-F3)" SHALL behave as editor-app Requirement 14 and shell-polish Requirement 2 define.
11. FOR ALL booleans `open`, decoding the encoded Pane_Preference of `open` SHALL give back `open` (round trip), and FOR ALL stored strings that are not a Valid_Preference, decoding SHALL give First_Visit.

### Requirement 2: Pane header with a legend

**User Story:** As a user seeing the codes for the first time, I want a key to the codes at the top of the Pane, so that I can read them without help.

#### Acceptance Criteria

1. WHILE the Pane is open, THE Pane SHALL render the Pane_Header at its top edge, above the Pane_Body.
2. THE Pane_Header SHALL use the background `#AAAAAA`, the text colour `#0000AA`, the Pane font family `ui-monospace, Menlo, Consolas, monospace` and the font size 12px.
3. THE Pane_Header SHALL show the text "Reveal Codes" at its left.
4. THE Pane_Header SHALL show the Legend at its right, with these seven entries in this order, each entry being a code followed by one space and its words, and the entries joined by ` · ` (space, U+00B7, space): `[HUM] typed`, `[PST] pasted`, `[AI] assistant`, `[AI>HUM] assistant, edited`, `[CIT ✓] found`, `[CIT ✘] not found`, `[QUO ✘] not in the opinion`.
5. THE Legend SHALL draw each code exactly as the Pane_Body draws the code of the same family, with the same text colour, background colour and outline, and the `[CIT ✘]` and `[QUO ✘]` entries SHALL use the Failing_Code style of Requirement 3.
6. THE Legend SHALL be real text in the accessibility tree: the Pane_Header and the Legend SHALL carry no `aria-hidden` attribute set to true, and the Legend codes SHALL carry no `role="img"` and no `aria-label`.
7. WHEN the Legend does not fit on one line, THE Pane_Header SHALL wrap the Legend onto a second line and SHALL keep every entry visible.
8. WHILE the Pane_Body scrolls, THE Pane_Header SHALL stay at the top edge of the Pane and SHALL NOT scroll with the Pane_Body.
9. WHEN the user clicks the Pane_Header, THE Web_App SHALL leave the Editor selection unchanged.
10. WHILE the Pane is closed, THE Web_App SHALL render no Pane_Header and nothing of the Pane in the accessibility tree.
11. THE Pane_Header SHALL use only colours from the sixteen-colour Palette of editor-app, and THE Pane_Header and its styles SHALL be in Pane_Files.

### Requirement 3: Failing codes are filled blocks

**User Story:** As a user scanning the Pane, I want the codes that stop an export to look different from every other code, so that I can find them at once.

#### Acceptance Criteria

1. THE Pane SHALL draw each Failing_Code with the text colour `#FFFFFF` on the background colour `#AA0000` and with no outline.
2. THE Pane SHALL draw every Code_Item that is not a Failing_Code in the style that editor-app Requirement 12, criterion 4 gives it, with its 1px `#AAAAAA` outline.
3. WHEN a closing code `[/CIT]` or `[/QUO]` closes an opening code that is a Failing_Code, THE Pane SHALL draw the closing code as a Failing_Code; WHEN it closes any other opening code, THE Pane SHALL draw it in its current style.
4. THE Pane_Layout SHALL decide which closing codes are Failing_Codes by pairing each closing code with the most recent unclosed opening code of the same kind, and SHALL read every code and offset only from the `positions` array of `render(document, "display")`.
5. THE Pane SHALL draw `[CIT …]` and `[QUO …]` in the style they have today, and SHALL draw `[CIT ✓]` and `[QUO ✓]` in the style they have today.
6. WHEN a Failing_Code is drawn, THE Pane SHALL keep its accessible name and its text unchanged.
7. THE Pane stylesheet SHALL give white `#FFFFFF` on `#AA0000` a contrast ratio of at least 7:1, computed with the WCAG relative-luminance formula, and THE design SHALL record the measured ratio.
8. FOR ALL Documents, concatenating the `text` of the Pane_Items in order SHALL equal `render(document, "display").text` after this change, and each Code_Item `offset` SHALL equal the `offset` of the matching `positions` entry (editor-app Property 4 stays true).

### Requirement 4: One button says what to do next

**User Story:** As a first-time user, I want one button to stand out, so that I know what to press next.

#### Acceptance Criteria

1. THE Web_App SHALL export a pure function `nextStep` of the arguments "Document text is empty", Verify_In_Flight, Verifiable_Unchecked_Count and Blocking_Count that returns a Next_Step.
2. The `nextStep` function SHALL apply these rules in order, and the first rule that matches decides the result: (a) WHEN Verify_In_Flight is true, THE function SHALL return `none`; (b) WHEN the Document text has zero characters, THE function SHALL return `load-demo`; (c) WHEN the Verifiable_Unchecked_Count is greater than zero (counting unchecked citations and unchecked quotations that Verify can act on), THE function SHALL return `verify`; (d) otherwise THE function SHALL return `export`, whatever the Blocking_Count is.
3. WHEN the Document holds unchecked items but nothing Verify can act on (the Verify button is disabled and the Verifiable_Unchecked_Count is zero), THE `nextStep` function SHALL return `export`, so that the Primary_Button falls through to Export.
4. THE Web_App SHALL derive "unchecked" in the `verify` rule as verifiable-unchecked, covering both citations and quotations: an item that Verify cannot act on SHALL NOT make `verify` the Next_Step.
5. WHEN every citation of the Document is verified and at least one quotation is unchecked and attributed to a citation that Verify can check or re-check, THE Verifiable_Unchecked_Count SHALL be greater than zero and THE `nextStep` function SHALL return `verify`.
6. THE Toolbar SHALL draw the Primary_Button as the button that the Next_Step names: `load-demo` names "Load demo motion", `verify` names "Verify", and `export` names "Export"; WHEN the Next_Step is `none`, THE Toolbar SHALL draw no Primary_Button.
7. THE Toolbar SHALL draw the Primary_Button with the background `#111111`, the text colour `#FFFFFF`, a 1px `#111111` border, and the same padding, font size and height as every other Toolbar button.
8. THE Toolbar SHALL expose the Primary_Button with the attribute `data-primary="true"` and SHALL put that attribute on no other button.
9. WHILE the pointer is over the Primary_Button, THE Primary_Button SHALL change only its background, to `#FFFFFF`, and its text colour, to `#111111`, with no transition.
10. WHILE the Primary_Button is disabled for a reason other than a Verify run in flight (for example the Export button while an export is not allowed to start), THE Primary_Button SHALL use the disabled style of `ui.md` (`#B0B0B0` text and border, `#FFFFFF` background) and SHALL keep its `data-primary` attribute.
11. WHILE a Verify run is in flight, THE Toolbar SHALL draw no button with `data-primary="true"`, and the Verify button SHALL read "Verifying…" in the ordinary disabled style (editor-app Requirement 17, criterion 13).
12. THE Web_App SHALL define the primary style in one place, in `apps/web/app/globals.css`, using only `var(--ink)` and `var(--paper)`.
13. FOR ALL combinations of "Document text is empty" (true or false), Verify_In_Flight (true or false), Verifiable_Unchecked_Count (0 or more) and Blocking_Count (0 or more), THE Toolbar SHALL render at most one button with `data-primary="true"`, SHALL render none while Verify_In_Flight is true, and otherwise SHALL render exactly the one that the ordered rule of criterion 2 names, with "unchecked" meaning verifiable-unchecked (citations and quotations) for the Verify step (Property 1, one next step).

### Requirement 5: The result of Verify is shown in the Issues region

**User Story:** As a user who has pressed Verify, I want the result next to the list of problems, so that I read the outcome and the problems together.

#### Acceptance Criteria

1. WHEN a Verify run completes, THE Web_App SHALL set no Notice that states the counts of the run.
2. WHILE a Verify run is in flight, THE Toolbar SHALL show "Verifying…" on the Verify button, and WHEN the run ends, THE Toolbar SHALL show the label "Verify" and no result text.
3. IF a Verify run fails, THEN THE Web_App SHALL still set the Notice of editor-app Requirement 17, criterion 10 ("Verification could not be completed. Your citations are unchanged.").
4. WHILE the Check_Time is not null, THE Issues_Region SHALL show the Verify_Summary under the Issues heading and above the Issues_List.
5. WHILE the Check_Time is null, THE Issues_Region SHALL show no Verify_Summary.
6. THE Verify_Summary line 1 SHALL read `Citations: ` followed by the terms `<n> found`, `<n> not found`, `<n> ambiguous` and `<n> not checked`, in that order, joined by ` · `, where `<n>` counts the citations whose verification status is `verified`, `not_found`, `ambiguous` and `unchecked` in turn.
7. THE Verify_Summary line 2 SHALL read `Quotations: ` followed by the terms `<n> match`, `<n> not in the opinion` and `<n> not checked`, in that order, joined by ` · `, where `<n>` counts the quotations whose check result is `match`, `mismatch` and `unchecked` in turn.
8. THE Verify_Summary SHALL leave out every term whose count is zero, and SHALL leave out a whole line, including its label, when the line has no terms.
9. THE Verify_Summary line 3 SHALL read `Checked ` followed by the Check_Time as Local_Time.
10. WHEN the most recent Verify run in this page session skipped results, found opinions unavailable, or left a citation unchecked with a retry time, THE Verify_Summary SHALL show one further line, after line 3, of one plain sentence.
11. WHEN that further line has a retry time, THE sentence SHALL read `Some items were not checked; try Verify again after <HH:MM>.`, where `<HH:MM>` is the latest retry time among the unchecked citations as Local_Time.
12. WHEN that further line has no retry time, THE sentence SHALL read `Some items were skipped; try Verify again.`
13. WHEN a Verify run ends with no skipped result, no unavailable opinion and no retry time, THE Verify_Summary SHALL show no further line.
14. THE Verify_Summary counts SHALL be computed from the current Document, so that they stay true after a reload, and THE further line SHALL be held for the page session only.
15. THE Verify_Summary container SHALL carry `role="status"`, so that the result is still announced to assistive technology after it leaves the Toolbar.
16. WHEN the Store replaces the Document (New document or Load demo motion), THE Verify_Summary SHALL disappear, because the Check_Time is reset.

### Requirement 6: Unchecked items collapse before the first Verify

**User Story:** As a first-time user who has just pasted a draft, I want one row instead of a wall of unchecked items, so that the list does not look like an error report before I have pressed Verify.

#### Acceptance Criteria

1. WHILE the Check_Time is null and the Unchecked_Count is greater than zero, THE Issues_List SHALL show one Unchecked_Row in place of the individual rows of the issues whose code is `CIT …` or `QUO …`.
2. THE Unchecked_Row SHALL read `<n> citations and quotations have not been checked.`, where `<n>` is the Unchecked_Count, and WHEN `<n>` is 1 THE Unchecked_Row SHALL read `1 citation or quotation has not been checked.`
3. THE Unchecked_Row SHALL contain a button labelled "Verify" that starts the same Verify run as the Toolbar Verify button, through the same handler.
4. WHILE the Toolbar Verify button is disabled, THE Unchecked_Row Verify button SHALL be disabled for the same reason.
5. THE Issues_List SHALL show the Unchecked_Row before every other row.
6. WHILE the Check_Time is null, THE Issues_List SHALL show the rows of all other issues individually, as it does today.
7. WHILE the Check_Time is not null, THE Issues_List SHALL show every unchecked item as an individual row, as it does today.
8. THE Issues heading, the Blocking_Count and the Export label SHALL count the unchecked items whether or not they are collapsed.
9. WHILE the Check_Time is null and the Unchecked_Count is zero, THE Issues_List SHALL show no Unchecked_Row.
10. THE Export_Dialog list of blocking items SHALL show every item individually, whatever the Check_Time is.

### Requirement 7: The assistant says where it writes

**User Story:** As a user of the drafting assistant, I want to see where the reply will go before I press Draft, and where it went after, so that the insertion never surprises me.

#### Acceptance Criteria

1. WHILE the Assistant_Panel is shown, THE Assistant_Panel SHALL show the line `Inserts at the cursor: ` followed by the Status_Position, directly above the Draft or Stop button.
2. WHEN the caret moves or the Document text changes, THE Assistant_Panel SHALL update the Status_Position to the same numbers that the Status_Line shows.
3. WHILE no assistant run has started in this page session, THE Assistant_Panel SHALL render no Reply_Box.
4. WHEN the first assistant run starts, THE Assistant_Panel SHALL render the Reply_Box with the visible label "Last reply", and THE Reply_Box accessible name SHALL be that label, except as criterion 10 says for a first run that is stopped with nothing inserted.
5. WHEN a run ends, THE Reply_Box SHALL keep the finished text until the next run starts.
6. WHEN a run's text has been inserted into the Document, THE Assistant_Panel SHALL show the line `Inserted at Ln <l> as run <id>` after the Reply_Box text, where `<l>` is the Insertion_Line and `<id>` is the Run_Id (for example `r1`).
   - The Insertion_Line SHALL be the line of the first inserted character, where the inserted text actually begins, and SHALL NOT be the line of the caret after the insertion.
7. IF a run fails or ends with no text to insert, THEN THE Assistant_Panel SHALL show no "Inserted at" line for that run and SHALL show the message that it shows today.
8. WHEN a new run starts, THE Assistant_Panel SHALL remove the "Inserted at" line of the previous run.
9. THE insertion SHALL work as editor-app Requirements 23 and 7 define (origin `AI`, Run_Id, one Undo_Group, offset at the Editor selection head when the stream ends), and this requirement SHALL change nothing about how insertion works.
10. WHILE a run is stopped, THE Reply_Box SHALL show only the text of that run that is in the Document.
11. WHEN a run is stopped and inserted partial text, THE Reply_Box SHALL keep that partial text and THE Assistant_Panel SHALL show the line `Stopped. Partial reply inserted at Ln <l> as run <id>` after the Reply_Box text, where `<l>` is the Insertion_Line of criterion 6 and `<id>` is the Run_Id, and SHALL show no "Inserted at" line for that run.
12. WHEN a run is stopped and inserted nothing, THE Reply_Box SHALL show no text for that run and THE Assistant_Panel SHALL show neither an "Inserted at" line nor a "Stopped. Partial reply inserted" line for that run.
13. WHEN the first run of the page session is stopped and inserted nothing, THE Assistant_Panel SHALL render no Reply_Box.
14. WHEN a later run is stopped and inserted nothing, THE Assistant_Panel SHALL keep the Reply_Box rendered and empty, and SHALL NOT show the text of an earlier run.
15. WHEN a new run starts, THE Assistant_Panel SHALL remove the "Stopped. Partial reply inserted" line of the previous run.

### Requirement 8: The Override dialog names what is being overridden

**User Story:** As a user writing an override reason, I want to see which citation or quotation I am overriding, so that I do not write the reason for the wrong item.

#### Acceptance Criteria

1. THE Override_Dialog SHALL show the Issue_Text of the issue being overridden directly under the dialog title and above the printed-in-certification statement.
2. WHEN the Issue_Text is longer than 80 code points, THE Override_Dialog SHALL show its first 79 code points followed by an ellipsis.
3. THE Override_Dialog SHALL show the same text whether it is opened from the Issues_List or from the Export_Dialog.
4. THE Override_Dialog accessible description SHALL include the Issue_Text.
5. THE Override_Dialog reason field, buttons, focus rules and error display SHALL behave as editor-app Requirement 18 defines.

### Requirement 9: Export dialog width and copy

**User Story:** As a user opening Export, I want a dialog wide enough to read, with button labels that say what they do, so that the count is shown once and clearly.

#### Acceptance Criteria

1. THE Export_Dialog SHALL have the width `min(560px, 100vw - 32px)`.
2. THE Override_Dialog and the New document confirm dialog SHALL keep their present width.
3. THE Export_Dialog action buttons SHALL read "Download .docx" and "Open print view", with no count, whatever the Blocking_Count is.
4. WHILE the Blocking_Count is greater than zero, THE Export_Dialog SHALL show one line directly above the action buttons that reads `<n> blocking items remain`, where `<n>` is the Blocking_Count, and WHEN `<n>` is 1 the line SHALL read `1 blocking item remains`.
5. WHILE the Blocking_Count is zero, THE Export_Dialog SHALL show no blocking line.
6. THE Export_Dialog action buttons SHALL keep their disabled rules (blocking items, the confidentiality tick, a download in progress) as export-certification and court-orders define.
7. THE Picker SHALL cut the instrument or title in an option at 80 code points with an ellipsis, in place of the present 60.
8. THE Export_Dialog SHALL be sized by the one shared dialog component or a class on it, so that the Dialog_Title rules of shell-polish Requirement 12 stay defined in one place.

### Requirement 10: Small screens

**User Story:** As a user on a narrow window or a phone, I want a plain page that tells me what is wrong, so that I am not left with a broken editor.

#### Acceptance Criteria

1. THE Shell SHALL have a minimum width of 1150px (a 32px strip, the 8.5in sheet, the 300px Issues_Region and the gutters).
2. WHILE the viewport is from 800px to 1150px wide, THE page SHALL scroll sideways as one piece, with the toolbar, the editor column, the Issues_Region and the Status_Line moving together.
3. WHILE the viewport is at least 800px wide, THE Status_Line SHALL stay inside the Editor_Column and SHALL NOT run under the Issues_Region.
4. WHILE the viewport is a Narrow_Viewport, THE Web_App SHALL NOT render the Shell, the Editor, the Pane or the Issues_Region, and SHALL render the Small_Screen_Page, reading the viewport width through the injected services of criterion 11.
5. THE Small_Screen_Page SHALL show the wordmark "Reveal Codes" in the editor font family at 15px bold, and then exactly three sentences, in this order: `Reveal Codes is a drafting editor for court filings that shows where each sentence came from and checks each citation.`, `It is a desktop editor.` and `It needs a screen at least 1150 pixels wide.`
6. THE Small_Screen_Page SHALL use the paper background `#FFFFFF` and ink text `#111111`, and SHALL contain no image, no icon, no button and no link.
7. WHILE the Small_Screen_Page is shown, THE Web_App SHALL NOT read or write the Autosave_Key or the Pane_Key, so that a saved draft is left as it is.
8. WHEN the viewport width reaches 800px or more, THE Web_App SHALL render the Shell and load the Saved_Draft as it does on a first load.
9. WHEN the viewport width falls below 800px, THE Web_App SHALL replace the Shell with the Small_Screen_Page.
10. WHILE the Small_Screen_Page is shown, THE Window_Title SHALL be "Reveal Codes".
11. THE viewport width source SHALL be injected through the app services, so that tests set the width without a browser.
12. THE Web_App stylesheet `apps/web/app/globals.css` SHALL contain one rule inside a media query `(max-width: 799px)` that hides the Shell (`display: none`), so that the Editor never flashes on a Narrow_Viewport before the script has run.
13. THE hide rule of criterion 12 SHALL be the only media query on viewport width that the Web_App adds for the Shell, and the Small_Screen_Page SHALL stay visible under that media query.

### Requirement 11: Marks on the page (optional)

**User Story:** As a user reading the page, I want the failing citations and quotations marked in the text, so that I can see them without opening the Pane.

#### Acceptance Criteria

1. WHERE page marks are built, WHILE the Check_Time is not null, THE Editor SHALL draw a 1px dotted underline in ink `#111111` under the text range of each issue whose code is `CIT ✘`, `CIT ?` or `QUO ✘`.
2. WHERE page marks are built, THE Editor SHALL give each marked range a `title` of `Citation not found`, `Citation ambiguous` or `Quotation not in the opinion`, for `CIT ✘`, `CIT ?` and `QUO ✘` in turn.
3. WHERE page marks are built, THE marks SHALL be decorations only: the Document, the Store, the Undo_Stack, the Engine operations, the Provenance_Plugin output and the Editor_Schema SHALL stay as they are.
4. WHERE page marks are built, THE Editor SHALL recompute the marks from `issues(document)` after every Document change, so that each mark stays on its range.
5. WHERE page marks are built, THE marks SHALL use no colour outside the UI_Palette.
6. WHILE the Check_Time is null, THE Editor SHALL draw no mark.
7. IF the design finds that the marks cannot be kept in step with the Engine spans without changing the Engine, THEN THE design SHALL record the reason, and THE Web_App SHALL NOT build page marks.

### Requirement 12: Tests

**User Story:** As the maintainer, I want an example test for each decision and one property for the next-step rule, so that the first-run flow does not regress.

#### Acceptance Criteria

1. THE Web_App tests SHALL assert, with one example each: a first visit with no Saved_Draft opens the Pane; a stored `{ "version": 1, "open": false }` keeps the Pane closed; a stored `open: true` opens it; a malformed value reads as First_Visit; a First_Visit with a Saved_Draft starts closed; a toggle writes the Pane_Preference; the Pane_Preference encode and decode round trip.
2. THE Web_App tests SHALL assert the seven Legend codes and words in order, the Pane_Header colours and size, and that the Pane_Header does not scroll with the Pane_Body.
3. THE Web_App tests SHALL assert that the opening and closing codes of a failing citation and a failing quotation carry the Failing_Code style, that a closing code of a verified citation and every other code do not, and the contrast ratio of Requirement 3, criterion 7.
4. THE Web_App tests SHALL assert one example for each of the four Next_Step results (`load-demo`, `verify`, `export`, `none`), the fall-through to Export when unchecked items exist but nothing Verify can act on does, the Next_Step `verify` for a Document whose citations are all verified and which holds an unchecked quotation attributed to a citation Verify can check or re-check, the Next_Step `export` for a Document whose only unchecked item is a quotation attributed to no checkable citation, no `data-primary` attribute on any button while a Verify run is in flight, the `data-primary` attribute on exactly the named button otherwise, and the disabled primary style.
5. THE Web_App tests SHALL assert the Verify_Summary lines with zero terms omitted, with a whole line omitted, with the Check_Time line, with the further line and its retry time, and with no further line; and SHALL assert that the Toolbar shows no result text after a run.
6. THE Web_App tests SHALL assert the Unchecked_Row before the first Verify, the singular text, the individual rows after a run, and that the Unchecked_Row Verify button starts the same run as the Toolbar button.
7. THE Web_App tests SHALL assert the two assistant lines, the absence of the Reply_Box before the first run, the label "Last reply", the absence of the "Inserted at" line after a failed run, and an "Inserted at Ln <l> as run <id>" line whose `<l>` is the line of the first inserted character, using a reply that starts on a different line from the caret line after insertion (for example a multi-line reply).
   - The tests SHALL also assert, with one example each: a stopped run with partial text keeps the text in the Reply_Box and shows `Stopped. Partial reply inserted at Ln <l> as run <id>` with the same Insertion_Line rule; a stopped first run with nothing inserted renders no Reply_Box; a stopped later run with nothing inserted shows an empty Reply_Box, no earlier text, and neither line; and a new run removes the Stopped line.
8. THE Web_App tests SHALL assert the Override_Dialog text under the title for a short and a long Issue_Text, and the Export_Dialog button labels, the blocking line (plural, singular and absent), the width rule, and the 80-code-point Picker cut.
9. THE Web_App tests SHALL assert the Small_Screen_Page at a width of 799px, the Shell at 800px, the three sentences, and that the Autosave_Key and the Pane_Key are left untouched at 799px.
10. WHERE page marks are built, THE Web_App tests SHALL assert the marks and the titles, and that the Document is unchanged by them.
11. THE Css_Scan SHALL accept `#AAAAAA` and `#AA0000` only in Pane_Files, SHALL report either colour in any other stylesheet or source file under `apps/web/src` and `apps/web/app`, and SHALL carry the Failing_Code family pair `#FFFFFF` on `#AA0000` and the Pane_Header pair `#0000AA` on `#AAAAAA`.
12. THE Css_Scan SHALL check the primary button rule: the rule exists once, in `globals.css`, uses only `var(--ink)` and `var(--paper)`, keeps the 1px ink border and the `4px 10px` padding, and changes only the background and text colour on hover.
13. THE Web_App SHALL have one property test, Property 1 of Requirement 4, in `apps/web/src/components/next-step.properties.test.ts` or the matching `test/` path, as `fc.assert(fc.property(...))` with a `// Property 1` comment above it, a `describe` title that ends with `_Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.11, 4.13_`, `numRuns` of at least 200 locally and 500 when `CI` is set, and arbitraries in `apps/web/test/arbitraries.ts`; the generators SHALL draw "Document text is empty", Verify_In_Flight, Verifiable_Unchecked_Count (built as a count of unchecked citations plus a count of unchecked quotations that Verify can act on, each drawn from zero upward, so that a zero citation count with a positive quotation count is covered) and Blocking_Count, and the property SHALL assert at most one primary, none while a run is in flight, and otherwise the one the ordered rule names, including `verify` whenever the sum of the two counts is greater than zero.
14. THE Web_App tests that assert the old behavior (Pane hidden on first load, the Verify Notice, the Issues rows before Verify, the always-present streaming text area, the Export button labels with counts, the 60-character Picker cut, the failing code colours) SHALL be updated in the same tasks, and `pnpm test` SHALL exit with code 0.
15. THE tests SHALL use no `vi.mock` beyond the allowances that already exist in the Web_App tests, and SHALL contain no `try/catch` that swallows an error.
16. THE Css_Scan SHALL check the Shell hide rule of Requirement 10, criterion 12: `globals.css` contains one `@media (max-width: 799px)` block with a rule that sets `display: none` on the Shell.

### Requirement 13: Documents and steering

**User Story:** As the maintainer, I want the steering files and the record to match the app, so that nobody relies on a rule the app no longer follows.

#### Acceptance Criteria

1. THE `ui.md` "Controls" section SHALL describe the primary button: ink background, paper text, same border and size as other buttons, at most one on the Toolbar, and the Next_Step rule in the order of Requirement 4.
2. THE `ui.md` "Layout" section SHALL state the 1150px minimum width of the Shell, the sideways scroll between 800px and 1150px, and the Small_Screen_Page below 800px.
3. THE `ui.md` "Copy" section SHALL state that the result of Verify is shown as text in the Issues_Region, in addition to the Toolbar, the Status_Line and the Pane_Status_Line.
4. THE `ui.md` introduction SHALL note that the Pane_Header and its Legend are part of the Pane and use the Pane palette.
5. THE `product.md` SHALL carry a "Pane palette" section that lists, for each Code_Family and for the Pane_Header, the text and background colours and the outline, including the Failing_Code style `#FFFFFF` on `#AA0000` with no outline and the header `#0000AA` on `#AAAAAA`. The section is new because `product.md` held no palette table before; the palette so far lived in editor-app Requirement 12, criterion 4 and in `pane.module.css`.
6. THE `README.md` demo path SHALL be updated where steps change: the Pane is already open after the first visit (step 3 no longer asks for Alt-F3 on a first visit), the result of Verify is read in the Issues region, and the Export dialog buttons carry no count.
7. THE `docs/KIRO_USAGE.md` SHALL gain one row for this spec, with the paths of its requirements, design and tasks files, and one row each for the `ui.md` and `product.md` edits.
8. THE `BUILD_LOG.md` SHALL gain one new dated entry that states what the first run looked like before and after, and where Kiro's output was wrong and how it was fixed, or "No Kiro errors"; existing entries SHALL stay unmodified.

### Requirement 14: Scope and task shape

**User Story:** As the maintainer, I want the change kept inside `apps/web` and committed in a clear order, so that the history reads cleanly and the checkpoint is quick.

#### Acceptance Criteria

1. THE change SHALL modify no file under `packages/engine`, `packages/verifier`, `packages/export`, `packages/courtlistener-mcp` or `crew/sentinel`.
2. THE change SHALL add no dependency to any `package.json` and SHALL change no lockfile.
3. THE change SHALL add no colour outside the Pane and no icon, animation, transition or component library.
4. THE spec files SHALL be committed with a first line that matches `spec(first-run-and-flow): <subject>`, where `<subject>` is non-empty and the whole first line is at most 72 characters, before any task runs.
5. THE task list SHALL be arranged in six groups in this order: (1) Pane preference, Pane_Header with Legend, and the Failing_Code style; (2) the Primary_Button rule with Property 1, the Verify_Summary, and the Unchecked_Row; (3) the assistant lines, the Override_Dialog text, and the Export_Dialog width and copy; (4) the small-screen rules; (5) page marks, with every task in this group marked optional; (6) documents, steering, and the final checkpoint.
6. THE task list SHALL end with exactly one checkpoint task, positioned last, that runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `next build --webpack` for `apps/web`, and `pnpm kiro:check`, and requires each to exit with code 0, after which the user walks the app in a browser.
7. THE task list SHALL have no checkpoint task other than the last task.

## Known limitations

Standing rule carried over from the earlier specs: anything that affects only a rare case is recorded here as one line, with no spec change and no stop.

- L1. The further line of the Verify_Summary is held for the page session only, so after a reload the line is gone, although the counts and the Check_Time remain.
- L2. The Local_Time of the Check_Time and of the retry time uses the browser's time zone; a user who changes the time zone between a run and a reload sees the time move.
- L3. With the Assistant_Column expanded (260px), the Shell at its 1150px minimum leaves the Page narrower than 8.5in, and the Page takes 100% of the Editor_Column as shell-polish Requirement 6, criterion 2 says (the sheet shrinks; the Shell minimum width is not changed).
