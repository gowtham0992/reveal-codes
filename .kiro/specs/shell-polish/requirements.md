# Requirements Document

## Introduction

This feature polishes the visual shell of the editor in `apps/web` so that it looks like a tool a lawyer's office would have used. It changes layout, labels and text placement only. It adds a wordmark, grouped toolbar buttons, a status line under the editor, a sheet-like page, a clearer Issues heading, a collapsed Assistant strip, a window title, a favicon, and consistent dialog titles. It also fixes the scope that the commit hook picks, and amends `ui.md` where a decision here conflicts with it.

The scope is `apps/web`, plus `scripts/commit-task.sh`, `.kiro/steering/ui.md`, `BUILD_LOG.md` and `docs/KIRO_USAGE.md`. The Engine, the Verifier and the Export_Package are not changed. No dependency is added. No behavior of the Store, the Verify flow, the Export flow or the Pane contents changes.

This spec changes these requirements of the editor-app spec: Requirement 6, criterion 5 (placeholder text); Requirement 10, criteria 2, 3 and 15 (toolbar buttons, page width, layout grid); Requirement 14, criterion 2 (toggle label); and Requirement 15, criteria 7 and 8 (the badge moves from the toolbar to the Status_Line and the Pane status line). Web_App tests that assert the previous behavior are updated in the same tasks (Requirement 14).

Nothing in this spec has an invariant, round trip, or idempotence that a generated input could break, so no property-based test is written. Every test is an example test. The eventual task list has 8 to 12 tasks and one checkpoint at the end.

Product principles that bind this spec: principle 3 (nothing leaves the machine silently; the mode text keeps the user informed about where lookups go) and principle 7 (the period look belongs to the Pane only; the shell is 2026 and plain).

## Glossary

- **Web_App**: `apps/web`.
- **Toolbar**: the 32px toolbar component (`role="toolbar"`) of the Web_App.
- **Wordmark**: the text "Reveal Codes" at the start of the Toolbar.
- **Toolbar_Group**: a run of adjacent Toolbar buttons separated from the next run by a 1px vertical rule.
- **Codes_Toggle**: the Toolbar button that toggles the Pane and carries `aria-pressed`.
- **Pane**: the Reveal Codes pane of the editor-app spec, open or closed.
- **Pane_Status_Line**: the status line inside the Pane.
- **Status_Line**: the 22px strip under the editor column that is present only while the Pane is closed.
- **Position_Text**: the output of `composeStatus` of the Web_App, which reads `Doc 1 Pg 1 Ln <n> Pos <n>` and, inside a mismatched quote, carries the divergence words.
- **Mode_Text**: the text for the server mode: "Demo mode: recorded CourtListener responses" for `fixtures`, "Live CourtListener lookups" for `live`, and "Server unreachable" for `unreachable`. The mode `loading` has no Mode_Text.
- **Key_Legend**: the text `Alt-F3 Codes   F7 Exit` (three spaces between the two entries).
- **Editor_Column**: the grid column that holds the editor page and, below it, the Pane or the Status_Line.
- **Page**: the white editor sheet inside the Editor_Column.
- **Placeholder**: the text shown on the Page while the Document text is empty.
- **Issues_Region**: the right-hand region that holds the heading "Issues", the Issues list and the Override_Dialog.
- **Blocking_Count**: the length of `blockingIssues(document)` for the current Document.
- **Assistant_Column**: the left column that exists only while the assistant is present.
- **Assistant_Strip**: the Assistant_Column while collapsed.
- **Window_Title**: the value of `document.title` in the browser.
- **Caption**: the first line of the Document text whose trimmed content is not empty, trimmed, and cut to at most 60 UTF-16 code units. An empty Document, and a Document that holds only whitespace, has no Caption.
- **Favicon**: the file `apps/web/app/icon.svg`.
- **Modal_Dialog**: a dialog rendered by the Web_App `Modal` component. Today these are the Export dialog, the Override dialog, and the New document confirm dialog.
- **Dialog_Title**: the heading of a Modal_Dialog.
- **F7_Prompt**: the message `Save document? Yes (No)` that F7 shows in the Pane_Status_Line for 2 000 ms.
- **Hook_Script**: `scripts/commit-task.sh`, the PostTaskExec commit script.
- **Scope**: the `<scope>` in the commit subject `feat(<scope>): <task title>` produced by the Hook_Script.
- **UI_Rules**: `.kiro/steering/ui.md`.
- **Css_Scan**: the static test `apps/web/test/static/css-rules.test.ts`.
- **Rule_Grey**: `#B0B0B0`, held in the CSS variable `--rule`.

## Requirements

### Requirement 1: Wordmark

**User Story:** As a user opening the app for the first time, I want to see the product name in the toolbar, so that I know what I am looking at.

#### Acceptance Criteria

1. THE Toolbar SHALL render the Wordmark as its first element, before every Toolbar_Group, with the exact text "Reveal Codes" (case-sensitive, one space between the words, no other characters).
2. THE Wordmark SHALL use the font family `var(--font-editor)`, a font weight of 700, a font size of 15px, and the ink colour.
3. THE Toolbar SHALL render exactly one vertical rule, 1px wide and in Rule_Grey, directly between the Wordmark and the first Toolbar_Group.
4. THE Wordmark SHALL consist of text only, with no image element, no logo file, no icon, and no background image.

### Requirement 2: Toolbar groups and Codes_Toggle label

**User Story:** As a user, I want the toolbar buttons grouped by purpose, so that I can find the one I need quickly.

#### Acceptance Criteria

1. THE Toolbar SHALL show its buttons from left to right in three Toolbar_Groups, in this order: "New" and "Load demo motion"; "Verify"; the Codes_Toggle and "Export".
2. THE Toolbar SHALL show a 1px vertical rule in Rule_Grey between each pair of adjacent Toolbar_Groups, and no rule before the first or after the last Toolbar_Group.
3. WHILE the Pane is closed, THE Codes_Toggle SHALL read "Show codes (Alt-F3)".
4. WHILE the Pane is open, THE Codes_Toggle SHALL read "Hide codes (Alt-F3)".
5. THE Codes_Toggle SHALL expose its state with `aria-pressed`, set to `true` while the Pane is open and `false` while the Pane is closed.
6. THE Toolbar SHALL show the notice to the right of the Toolbar_Groups.
7. IF the notice does not fit in the space to the right of the Toolbar_Groups, THEN THE Toolbar SHALL show the notice on a single line, truncated with an ellipsis, without changing the position of the Toolbar_Groups.
8. THE Toolbar SHALL contain no Mode_Text.
9. THE Toolbar SHALL keep a height of 32px regardless of notice length.

### Requirement 3: Commit hook scope

**User Story:** As the maintainer, I want a commit that touches `apps/web` and a spec file to be scoped `web`, so that the history reads by area instead of showing `repo` for every web change.

#### Acceptance Criteria

1. WHEN the Hook_Script picks the Scope, THE Hook_Script SHALL ignore every changed path that begins with the repository-root prefix `.kiro/` or `docs/`, and SHALL treat every other changed path as non-ignored.
2. WHEN at least one changed path is non-ignored and every non-ignored changed path begins with the same prefix `packages/<name>/`, THE Hook_Script SHALL use that `<name>`, exactly as written in the path, as the Scope.
3. WHEN at least one changed path is non-ignored and every non-ignored changed path begins with the same prefix `apps/<name>/`, THE Hook_Script SHALL use that `<name>`, exactly as written in the path, as the Scope.
4. WHEN the non-ignored changed paths begin with two or more different prefixes among `packages/<name>/` and `apps/<name>/` (including one `packages/<name>/` prefix and one `apps/<name>/` prefix with the same `<name>`), THE Hook_Script SHALL use `repo` as the Scope.
5. WHEN at least one non-ignored changed path begins with neither `packages/<name>/` nor `apps/<name>/` (including a file directly under `packages/` or `apps/` and a file at the repository root), THE Hook_Script SHALL use `repo` as the Scope, even if every other non-ignored changed path shares one `<name>`.
6. WHEN no changed path remains after the ignored paths are removed, THE Hook_Script SHALL use `repo` as the Scope.
7. THE Hook_Script SHALL keep every other behavior it has today: one commit per task, no push, no amend, subject capped at 72 characters with the full title in the body when cut, and exit 0 when the working tree has no change.
8. THE Hook_Script SHALL expose its Scope selection so that a test can run it on a given list of paths without creating a commit.

### Requirement 4: Status line

**User Story:** As a user, I want the cursor position, the lookup mode and the key hints visible under the editor when the codes are hidden, so that I always know where I am and where my citations go.

#### Acceptance Criteria

1. WHILE the Pane is closed, THE Web_App SHALL render the Status_Line directly under the Editor_Column.
2. WHILE the Pane is open, THE Web_App SHALL NOT render the Status_Line.
3. THE Status_Line SHALL span the Editor_Column only, as the Pane does.
4. THE Status_Line SHALL have a height of 22px, a 1px top rule in Rule_Grey, the background `var(--ui-bg)`, the font family `var(--font-pane)` and a font size of 12px.
5. THE Status_Line SHALL show, at its left, the Position_Text.
6. WHILE the server mode is `fixtures`, `live` or `unreachable`, THE Status_Line SHALL show the Mode_Text of that mode in its middle.
7. WHILE the server mode is `loading`, THE Status_Line SHALL show no Mode_Text.
8. THE Status_Line SHALL show, at its right, the Key_Legend.
9. WHEN the Document text or the caret changes, THE Status_Line SHALL update the Position_Text.
10. THE Web_App SHALL show the Mode_Text only in the Status_Line and the Pane_Status_Line.

### Requirement 5: Mode text in the Pane status line

**User Story:** As a user with the codes open, I want the lookup mode still visible, so that the mode is never hidden by opening the Pane.

#### Acceptance Criteria

1. WHILE the Pane is open and the server mode is `fixtures`, `live` or `unreachable`, THE Pane_Status_Line SHALL show the Mode_Text of that mode at its right end.
2. WHILE the Pane is open and the server mode is `loading`, THE Pane_Status_Line SHALL show no Mode_Text.
3. WHILE the Pane is open and the F7_Prompt is shown, THE Pane_Status_Line SHALL show the F7_Prompt as its left text.
4. WHILE the Pane is open and the F7_Prompt is not shown, THE Pane_Status_Line SHALL show the Position_Text as its left text.

### Requirement 6: Page as a sheet

**User Story:** As a drafter, I want the editor page to look like a sheet of paper, so that the document feels like a filing.

#### Acceptance Criteria

1. WHILE the Editor_Column is at least 8.5in wide, THE Page SHALL have a width of 8.5in.
2. WHILE the Editor_Column is narrower than 8.5in, THE Page SHALL have a width of 100% of the Editor_Column.
3. THE Page SHALL have a padding of 1in on each of its four sides.
4. THE Page SHALL have a minimum height of 11in.
5. THE Page SHALL have a 1px solid border in Rule_Grey.
6. THE Page SHALL have a margin of 24px on its top and bottom sides and automatic margins on its left and right sides.
7. THE Editor_Column SHALL have the background `var(--ui-bg)`.
8. THE Page SHALL have a line height of 1.5, the font family `var(--font-editor)`, and a font size of 12pt.

### Requirement 7: Placeholder

**User Story:** As a first-time user, I want the empty page to tell me what to do, so that I know to paste or load the demo.

#### Acceptance Criteria

1. WHILE the Document text is empty (zero characters), THE Page SHALL show the Placeholder with the exact text "Type or paste your filing here. Load demo motion to see a worked example."
2. WHILE the Document text is empty, THE Page SHALL position the first character of the Placeholder at the top-left corner of the Page padding box, so that the Placeholder text starts where the first typed character would appear.
3. WHILE the Document text is not empty (one or more characters), THE Page SHALL NOT show the Placeholder.
4. THE Page SHALL show no text, label or illustration other than the Document content and the Placeholder.

### Requirement 8: Issues heading and region rules

**User Story:** As a user, I want the Issues heading to tell me how many problems block export, so that I see the state without reading the list.

#### Acceptance Criteria

1. WHILE the Blocking_Count is 0, THE Issues_Region SHALL show the heading "Issues" with no count and no em dash.
2. WHILE the Blocking_Count is greater than 0, THE Issues_Region SHALL show the heading "Issues — <n> blocking", where <n> is the Blocking_Count written as a base-10 integer in digits with no leading zeros and no thousands separators, and the dash is the em dash character U+2014 with exactly one space on each side.
3. WHEN the Blocking_Count changes, THE Issues_Region SHALL update the heading to the text required by criterion 1 or 2 for the new Blocking_Count, without a page reload.
4. THE Issues_Region SHALL show a 1px bottom rule in Rule_Grey directly under the heading.
5. THE Issues_Region SHALL show a 1px left rule in Rule_Grey on the edge adjacent to the Editor_Column, and THE Issues_Region SHALL use the same background as the Editor_Column, so that the two are separated by the rule and not by a change of background.

### Requirement 9: Assistant strip

**User Story:** As a user, I want the collapsed Assistant to take little room and still be findable, so that the empty column does not waste the screen.

#### Acceptance Criteria

1. WHILE the assistant is present and the Assistant_Column is collapsed, THE Web_App SHALL render the Assistant_Strip with a width of 32px.
2. WHILE the assistant is present and the Assistant_Column is collapsed, THE Assistant_Strip SHALL show the word "Assistant" set vertically, with `writing-mode: vertical-rl`.
3. WHILE the assistant is present and the Assistant_Column is collapsed, THE Assistant_Strip SHALL be the disclosure control and SHALL expose `aria-expanded` set to `false`.
4. WHEN the user activates the Assistant_Strip, THE Web_App SHALL expand the Assistant_Column and SHALL set `aria-expanded` to `true` on the disclosure control.
5. WHILE the Assistant_Column is expanded, THE Assistant_Column SHALL show the panel heading "Assistant" in bold weight with a 1px bottom rule in Rule_Grey, in the same form as the Issues heading of Requirement 8.
6. WHILE the Assistant_Column is expanded, THE Assistant_Column SHALL keep a disclosure control named "Assistant" that exposes `aria-expanded` set to `true`.
7. WHERE the assistant is absent, THE Web_App SHALL render no Assistant_Column and no Assistant_Strip.

### Requirement 10: Window title

**User Story:** As a user with several tabs open, I want the tab title to name my filing, so that I can tell tabs apart.

#### Acceptance Criteria

1. WHILE the Document has no Caption, THE Window_Title SHALL be exactly "Reveal Codes".
2. WHILE the Document has a Caption, THE Window_Title SHALL be exactly the Caption, followed by one space, the em dash character U+2014, one space, and "Reveal Codes".
3. WHEN the Document text changes, THE Web_App SHALL set the Window_Title to the value required by criterion 1 or 2 for the new Document text.
4. WHEN the Web_App first loads a Document, THE Web_App SHALL set the Window_Title to the value required by criterion 1 or 2 for that Document text.

### Requirement 11: Favicon

**User Story:** As a user with several tabs open, I want a small mark on the tab, so that the tab is recognisable.

#### Acceptance Criteria

1. THE Web_App SHALL provide the Favicon as a single SVG file that Next.js serves as the application icon.
2. THE Favicon SHALL show the two uppercase letters "RC" and no other text, set in Georgia at bold weight, in ink `#111111`.
3. THE Favicon SHALL have a paper background of `#FFFFFF` that fills the full icon area.
4. THE Favicon SHALL have a 1px border in ink `#111111` drawn along the edge of the icon area.
5. THE Favicon SHALL contain no shape, text or colour other than the paper background, the 1px ink border, and the ink letters "RC".

### Requirement 12: Dialog titles

**User Story:** As a user, I want every dialog to look the same at the top, so that the dialogs read as one family.

#### Acceptance Criteria

1. THE Web_App SHALL render the Dialog_Title of each Modal_Dialog (Export, Override, New document) in bold weight at a font size of 13px.
2. THE Web_App SHALL render a 1px solid bottom rule in Rule_Grey under the Dialog_Title of each Modal_Dialog, spanning the full width of the Modal_Dialog.
3. THE Web_App SHALL give the Dialog_Title of each Modal_Dialog a padding of 12px on all four sides.
4. THE Web_App SHALL render the Dialog_Title of every Modal_Dialog through the one shared `Modal` component, so that the weight, font size, bottom rule and padding of the Dialog_Title are defined in one place and the three dialogs cannot differ.
5. WHEN the F7_Prompt is shown, THE Web_App SHALL show it as plain text in the Pane_Status_Line with no Dialog_Title, no bottom rule and no Modal_Dialog, because the F7_Prompt is a status message and not a Modal_Dialog.
6. THE Web_App SHALL leave the behavior, body content, buttons, labels and focus rules of the Export, Override and New document Modal_Dialogs unchanged, so that the only difference from the prior version is the styling of the Dialog_Title.

### Requirement 13: UI rules amendments

**User Story:** As the maintainer, I want `ui.md` to say what the shell now does, so that the steering file and the app do not disagree.

#### Acceptance Criteria

1. THE UI_Rules "Copy" section SHALL state that state is shown as text in the Toolbar, the Status_Line or the Pane_Status_Line.
2. THE UI_Rules "Build" section SHALL carry one line stating that the Favicon, the letters "RC" in Georgia bold, is the only place where letters serve as a mark.
3. THE UI_Rules "Type" section SHALL list exactly these sizes: 13px for UI, 12pt for the editor, 15px for the Wordmark in the editor family, and 12px for the Status_Line in the pane family.
4. THE UI_Rules "Layout" section SHALL state these three dimensions, each with its condition:
   - a 22px Status_Line under the Editor_Column while the Pane is closed;
   - a 32px Assistant_Strip while the Assistant_Column is collapsed;
   - a 260px left panel while the Assistant_Column is expanded.
5. THE UI_Rules "Layout" section SHALL state that the Page is a fixed 8.5in sheet with 1in padding, and that the Issues_Region has a 1px left rule.
6. WHEN the Css_Scan runs, THE Css_Scan SHALL accept the font sizes 12px and 15px in addition to every font size it accepted before this change, and SHALL keep every other rule it enforced before this change for fonts, sizes and palette unchanged.
7. IF the Css_Scan finds a font size that is not in the accepted set (the sizes accepted before this change, 12px and 15px), THEN THE Css_Scan SHALL report that font size as a violation and SHALL identify the offending declaration in its report.

### Requirement 14: Tests

**User Story:** As the maintainer, I want example tests for every observable change, so that the polish does not regress.

#### Acceptance Criteria

1. THE Web_App tests SHALL assert that the Toolbar shows the button label "Show codes (Alt-F3)" while the Pane is closed and the button label "Hide codes (Alt-F3)" while the Pane is open, and SHALL assert that the Toolbar renders exactly three Toolbar_Groups in the order defined by Requirement 2.
2. THE Web_App tests SHALL assert that the Status_Line is present while the Pane is closed and absent while the Pane is open, and that while the Pane is closed the Status_Line text contains the Mode_Text for each of the three modes `fixtures`, `live` and `unreachable`, with one test case per mode.
3. THE Web_App tests SHALL assert that, while the Pane is open, the Pane_Status_Line text contains the Mode_Text for the current mode.
4. THE Web_App tests SHALL assert the Window_Title for four cases, with one test case each: an empty Document, a Document whose first line is blank, a Document with a Caption, and a Document whose Caption is 61 or more characters long.
5. THE Web_App tests SHALL assert the Issues heading text for a Blocking_Count of 0 and for a Blocking_Count of 4, with one test case each.
6. WHEN the Css_Scan runs over the stylesheets changed by this spec, THE Css_Scan SHALL report zero violations.
7. WHEN this spec is implemented, THE Web_App tests that assert the previous labels, the previous badge placement, the previous Placeholder text or the previous Toolbar order SHALL be updated to the behavior of Requirements 2, 4, 5 and 7, and `pnpm test` SHALL exit with code 0 and zero failing tests.
8. THE Web_App tests SHALL include exactly one example test of the Hook_Script Scope selection that checks three path sets: `apps/web/` and `.kiro/specs/` paths give `web`; `packages/engine/` and `packages/verifier/` paths give `repo`; `BUILD_LOG.md` alone gives `repo`.
9. THE tests added by this spec SHALL be example tests only, SHALL use no `vi.mock` beyond the allowances that already exist in the Web_App tests, and SHALL include no property test.

### Requirement 15: Documentation, scope and task shape

**User Story:** As the maintainer, I want the change logged and the work kept small, so that the submission record stays honest and the checkpoint is quick.

#### Acceptance Criteria

1. WHEN the change is complete, THE change SHALL have appended exactly one new dated entry to `BUILD_LOG.md` that contains one sentence stating what the shell looked like before and what it looks like after, and SHALL have left all existing `BUILD_LOG.md` entries unmodified.
2. WHEN the change is complete, THE change SHALL have added to `docs/KIRO_USAGE.md` exactly one new row for this spec and exactly one new row for the UI_Rules edit, and SHALL have updated the description in the existing Hook_Script row so that it states the Scope rule of Requirement 3, without adding a second Hook_Script row.
3. THE change SHALL leave the README screenshot placeholder byte-identical to its content before the change.
4. THE change SHALL modify zero files under `packages/engine`, `packages/verifier`, `packages/export` and `packages/courtlistener-mcp`, and SHALL add zero entries to the dependency fields of any `package.json` and zero changes to the lockfile.
5. THE task list of this spec SHALL contain between 8 and 12 tasks inclusive, arranged in four groups in this order, with each task belonging to exactly one group and each item named below covered by exactly one task:
   - group 1: the Wordmark, the Toolbar groups, the Codes_Toggle label and the Hook_Script scope fix;
   - group 2: the Status_Line, the move of the Mode_Text, and the Pane_Status_Line Mode_Text;
   - group 3: the Page sheet, the Placeholder, the Issues heading and rules, and the Assistant_Strip;
   - group 4: the Window_Title, the Favicon, the Dialog_Title, the tests, the documentation, and the final checkpoint.
6. THE task list SHALL end with exactly one checkpoint task, positioned last, that runs lint, typecheck, test and `next build --webpack` and requires all four to exit with code 0, after which the user walks the app in a browser.
7. THE spec commits SHALL each have a first line that matches `spec(shell-polish): <subject>`, where `<subject>` is non-empty and the whole first line is at most 72 characters.

## Known limitations

Standing rule (carried over from the earlier specs, user decision): anything that affects only malformed input or a rare citation or editing style is recorded here as one line, with no spec change and no stop.

- L1. The Caption is cut at 60 UTF-16 code units, so a first line that has an emoji or other astral character at the cut can end in half a character, which the browser shows as a replacement mark in the tab.
- L2. A first line that is very long and has no spaces, such as a pasted URL, gives a Caption of 60 characters with no word break.
