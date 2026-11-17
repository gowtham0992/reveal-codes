# Requirements Document

## Introduction

This feature turns the federal court instruments on generative AI in `data/standing-orders.json` into a public page at `/courts`, readable on any screen from 320px up, and links each instrument in force into the editor with that instrument selected. It also adds links to the page from the Export dialog, the Small_Screen_Page and the Shell, and carries a print fix and three small repairs that earlier walks found.

The page is rendered on the server from the dataset through the loader the Picker already uses. The whole list is in the HTML and is readable with scripts off. There is no client fetch and no API route. The page never tells a user what the law is: each instrument is shown as the dataset records it, with a link to the court's own text, and the page says it is a snapshot and not legal advice (product principle 3 holds: the page sends nothing anywhere, and there is no telemetry).

The scope is `apps/web` (the route `app/courts/`, the editor's reading of `?order=`, three links, the print view stylesheet, the Open flow), `packages/export` (the pure filter and the loader's extra fields), `data/standing-orders.json` (one vocabulary definition, no entry), the Power's copy of that file, `.gitignore`, `.kiro/steering/ui.md`, `README.md`, `docs/KIRO_USAGE.md` and `BUILD_LOG.md`. The Engine and the Verifier are not changed. No dependency is added and no environment variable is added: the repository address comes from the existing `NEXT_PUBLIC_REPO_URL`.

The only code that this spec changes in the Export_Package's validated shapes is additive: the loader also returns the dataset's `compiled` date and its `vocabulary`, which it already validates. No entry, no enumerated value and no existing export changes.

Look: only the Tokens and type families in `ui.md`. No new colour, no icon, no component library, no animation. The mark and the wordmark are not placed on `/courts` because `ui.md` allows the mark in three places only.

The eventual task list has one property test (the filter, Property 1) and example tests for everything else. The user walks the result before anything is pushed; nothing in this spec pushes.

## Glossary

- **Web_App**: `apps/web`.
- **Courts_Page**: the route `/courts`, `apps/web/app/courts/page.tsx`, and the components it renders.
- **Dataset**: `data/standing-orders.json`.
- **Loader**: `loadOrders` and `ORDERS` of `packages/export/src/orders.ts`, the validated, typed view of the Dataset that the Picker reads.
- **Instrument**: one entry of the Dataset, an `OrderEntry`.
- **In_Force**: the state of an Instrument whose `status` is `current`. Every other status (`superseded`, `rescinded`, `inactive`, `not_adopted`, `proposed`) is Not_In_Force.
- **Not_In_Force**: the state of an Instrument whose `status` is not `current`.
- **Court_Count**: the number of distinct `court.abbreviation` values in the Dataset.
- **Compiled_Date**: the Dataset's top-level `compiled` value.
- **Court_Group**: the Instruments of one `court.abbreviation`, under a heading with the court's name and abbreviation.
- **Court_Wide**: an Instrument whose `judge` is null. A **Judge_Level** Instrument has a judge.
- **Element_Words**: the sentence the Dataset's `vocabulary.elements` gives for an element.
- **Placement_Words**: the plain words the Web_App gives for a `caption.placement` value, typed over every value so that a new placement fails to compile until it has words.
- **Kind_Words**: `kindWords` of `apps/web/src/order-copy.ts`. **Applies_Words**: `appliesWords` of the same file.
- **Instrument_Anchor**: the `id` attribute of an Instrument's element on the Courts_Page, equal to the Instrument's `id`.
- **Filter_Controls**: the text box, the kind choice and the checkbox "Show rules no longer in force".
- **Filter_State**: the triple of query text, kind choice (one kind or "all kinds") and checkbox state.
- **Normalised_Text**: text lower-cased with every character that is neither a letter nor a digit removed, so `N.D. Tex.` and `nd tex` give the same value.
- **Filter_Rule**: the pure function `filterOrders(entries, state)` in `packages/export` that returns the Instruments the Filter_State selects (Requirement 6).
- **Count_Line**: the line `Showing <n> of <m>`.
- **Repo_Base**: the value of `NEXT_PUBLIC_REPO_URL` read by `getPublicLinks()`, or null when unset or not an http(s) address.
- **Order_Parameter**: the query parameter `order` of the address `/`.
- **Selection_Line**: the line on the Small_Screen_Page that names the Selectable_Instrument stored from the Order_Parameter and tells the reader to open the page on a wider screen (Requirement 8, criterion 9).
- **Order_Link**: the link "Draft under this rule" to `/?order=<id>`.
- **Picker**: the `OrderPicker` select of the Export dialog. **Order_Store**: the `OrderSelectionStore` that holds the selection.
- **Selectable_Instrument**: an Instrument that `orderById` returns, that is, an In_Force Instrument.
- **Toolbar**: the `role="toolbar"` component of the Shell. **Toolbar_Notice**: its `role="status"` message region, fed by the Store's `notice`.
- **Status_Line**: the strip under the editor that shows position and mode only.
- **Shell**: the editor layout at 800px and wider. **Small_Screen_Page**: the plain page shown instead of the Shell below 800px.
- **Open_Note**: the plain text of the Issues region that explains a refused file (see `ui.md` Copy).
- **Export_Dialog**: the modal of that name.
- **Court_Rules_Link**: a plain text link to `/courts`. Its text is "Court rules" in the Shell and "See all court rules" in the Export_Dialog and the Small_Screen_Page.
- **Print_View**: `apps/web/src/components/print-view.tsx` and its stylesheet. **Override_Table**: the table in the Print_View appendix block whose header cells are Code, Timestamp and the other columns of the override rows.
- **UI_Rules**: `.kiro/steering/ui.md`.
- **Css_Scan**: `apps/web/test/static/css-rules.test.ts` and the other static scans in `apps/web/test/static/`.
- **Power_Copy**: `powers/citation-check/skills/court-ai-rules/references/standing-orders.json`, written by `pnpm power:build`.

## Requirements

### Requirement 1: Server-rendered route

**User Story:** As a self-represented litigant on a phone, I want the court rules page to open with its full content and no account, so that I can read what a court requires before I draft.

#### Acceptance Criteria

1. THE Courts_Page SHALL be the route `apps/web/app/courts/page.tsx`, a server component that reads the Dataset through the Loader.
2. THE Courts_Page SHALL contain no client-side fetch and no API route.
3. THE Courts_Page SHALL contain, in the HTML the server sends, the heading, the introduction, the Court_Groups and every Instrument of the Dataset.
4. WHILE scripts are off, THE Courts_Page SHALL show every Instrument and no Filter_Control.
5. THE Courts_Page SHALL send no request to any host and SHALL carry no telemetry.
6. THE Loader SHALL return the Dataset's `compiled` value and `vocabulary` in addition to the entries it returns today, without changing any existing export of `packages/export`.

### Requirement 2: Heading and introduction

**User Story:** As a reader, I want a short introduction with the real figures and a plain warning, so that I know what the page is and what it is not.

#### Acceptance Criteria

1. THE Courts_Page SHALL show the heading "Federal court rules on AI in filings" as its single level-one heading.
2. THE Courts_Page SHALL show one introductory paragraph that states the number of Instruments in the Dataset, the Court_Count, the number of Instruments In_Force and the Compiled_Date, each value computed from the Loader's data and none typed as a literal in the source.
3. THE introductory paragraph SHALL state that each Instrument was read from the court's own text.
4. THE introductory paragraph SHALL state that the data is released under CC0.
5. WHERE Repo_Base is not null, THE introductory paragraph SHALL contain a link to `<Repo_Base>/blob/main/data/standing-orders.json` and a link to `<Repo_Base>/blob/main/data/README.md`, with any trailing slash of Repo_Base removed first.
6. WHERE Repo_Base is null, THE Courts_Page SHALL contain no link to the repository.
7. THE Courts_Page SHALL show, after the introductory paragraph, one sentence stating that the page is a snapshot, is not legal advice, and that the reader should read the court's text before filing.
8. THE Courts_Page SHALL show a plain link "Open the editor" to `/`, in the same tab.

### Requirement 3: Grouping and order

**User Story:** As a reader looking for my court, I want the list grouped by court in a predictable order, so that I can find it by scanning.

#### Acceptance Criteria

1. THE Courts_Page SHALL list the Instruments in one Court_Group per distinct `court.abbreviation` in the Dataset.
2. THE Courts_Page SHALL order the Court_Groups by `court.abbreviation` with `localeCompare` in locale `en` and the option `{ numeric: true }`, so that "5th Cir." comes before "10th Cir. BAP".
3. THE Courts_Page SHALL order the Instruments inside a Court_Group with every Court_Wide Instrument before every Judge_Level Instrument.
4. THE Courts_Page SHALL order the Instruments inside each of those two runs by `date`, newest first, and by `id` ascending when two dates are equal.
5. THE Courts_Page SHALL show each Court_Group's heading as a level-two heading with the court's name and its abbreviation.
6. THE Courts_Page SHALL show each Instrument's title as a level-three heading, using the `instrument` value in its place when the title is empty.

### Requirement 4: What each Instrument shows

**User Story:** As a reader, I want each Instrument to say what it requires, of whom, and where the court's own text is, so that I can check it myself.

#### Acceptance Criteria

1. THE Courts_Page SHALL show for each Instrument its title and its `instrument` name.
2. WHERE an Instrument has a judge, THE Courts_Page SHALL show the judge's name and role.
3. THE Courts_Page SHALL show the Instrument's kind in the Kind_Words and whom it applies to in the Applies_Words.
4. THE Courts_Page SHALL show the Instrument's `date` followed by its `date_note` when the Instrument has one.
5. THE Courts_Page SHALL show what the filing must state as a list of the Element_Words of the Instrument's `elements`, in the order of the Instrument's `elements`, and SHALL show no such list for an Instrument whose `elements` is empty.
6. WHERE an Instrument has a `caption`, THE Courts_Page SHALL show the caption text and the Placement_Words of its `placement`.
7. THE Courts_Page SHALL show the Instrument's `key_language` as a quotation inside a `blockquote`, wrapped in real quotation marks.
8. THE Courts_Page SHALL show for each Instrument a link "Read the court's text" to the Instrument's `source_url` that opens in a new tab with `rel="noreferrer"`.
9. IF an Instrument is Not_In_Force, THEN THE Courts_Page SHALL show for that Instrument the line "Not in force." followed by the Dataset's `vocabulary.status` sentence for its status.
10. IF an Instrument is Not_In_Force and has a `superseded_by` value, THEN THE Courts_Page SHALL show a link to the Instrument_Anchor of the Instrument that `superseded_by` names, with the title of that Instrument as its text.
11. THE Courts_Page SHALL show no `retrieved` value, no `source_kind` value and no `notes` value.

### Requirement 5: Anchors

**User Story:** As a clinic supervisor, I want to link a filer to one rule, so that the address lands on that rule.

#### Acceptance Criteria

1. THE Courts_Page SHALL give the element of each Instrument an `id` attribute equal to the Instrument's `id`.
2. THE Courts_Page SHALL show each Instrument of the Dataset exactly once.
3. WHEN the address of the Courts_Page carries the hash `#<id>` of an Instrument, THE browser SHALL scroll to the element of that Instrument.
4. WHEN scripts are on and the hash names a Not_In_Force Instrument, THE Courts_Page SHALL start with the checkbox "Show rules no longer in force" ticked, so that the Instrument the hash names is visible.

### Requirement 6: Filter

**User Story:** As a reader who knows my court or judge, I want to narrow the list, so that I do not scroll through every court.

#### Acceptance Criteria

1. WHILE scripts are on, THE Courts_Page SHALL show the Filter_Controls: a labelled text box for court, abbreviation or judge, a labelled choice of kind, and a checkbox labelled "Show rules no longer in force".
2. THE choice of kind SHALL offer "All kinds" and one option per kind, with the Kind_Words as option text.
3. THE Filter_Controls SHALL start with an empty text box, the choice "All kinds" and the checkbox not ticked.
4. THE Filter_Rule SHALL select an Instrument if and only if all of these hold: the Instrument is In_Force or the checkbox is ticked; the kind choice is "All kinds" or equals the Instrument's `kind`; and the Normalised_Text of the query is empty or is a substring of the Normalised_Text of the Instrument's `court.name`, of its `court.abbreviation`, or of its `judge.name`.
5. THE Filter_Rule SHALL be one pure function in `packages/export` over plain data, used by the Courts_Page and by its tests.
6. WHEN the Filter_State changes, THE Courts_Page SHALL show exactly the Instruments the Filter_Rule selects and SHALL omit every Court_Group that has no selected Instrument.
7. THE Courts_Page SHALL show the Count_Line in a `role="status"` element, with `<n>` equal to the number of selected Instruments and `<m>` equal to the number of Instruments in the Dataset.
8. WHEN every Filter_Control is cleared, THE Filter_Rule SHALL select exactly the Instruments that are In_Force.
9. IF no Instrument is selected, THEN THE Courts_Page SHALL show the Count_Line and the sentence "No rule matches. Clear the filter to see every rule in force."
10. THE Filter_Controls SHALL show no pending state, animation or transition.

### Requirement 7: Draft under this rule

**User Story:** As a self-represented litigant, I want one step from a rule to a draft shaped to it, so that the statement I export follows my court.

#### Acceptance Criteria

1. THE Courts_Page SHALL show for each In_Force Instrument the Order_Link, a plain link "Draft under this rule" to `/?order=<id>` with the `id` percent-encoded, in the same tab.
2. THE Courts_Page SHALL show no Order_Link for a Not_In_Force Instrument.

### Requirement 8: The editor reads the Order_Parameter

**User Story:** As a user who followed an Order_Link, I want the editor to open with that rule already selected, so that the Export dialog is shaped to my court.

#### Acceptance Criteria

1. WHEN the Web_App loads the address `/` with an Order_Parameter that is the `id` of a Selectable_Instrument, THE Web_App SHALL store that Instrument in the Order_Store exactly as choosing it in the Picker does.
2. WHEN the Shell is shown and it has applied a Selectable_Instrument from the Order_Parameter, THE Toolbar_Notice SHALL read `Court rule selected: <court abbreviation>, <optionText of the Instrument>.`
3. IF the Order_Parameter is not the `id` of any Instrument, THEN THE Web_App SHALL leave the selection, the Toolbar_Notice and the Open_Note unchanged and SHALL show no error.
4. IF the Order_Parameter is the `id` of an Instrument that is not a Selectable_Instrument, THEN THE Web_App SHALL leave the selection, the Toolbar_Notice and the Open_Note unchanged and SHALL show no error.
5. WHEN the Web_App has read the Order_Parameter, whatever its value, THE Web_App SHALL remove the Order_Parameter from the address without adding a history entry and without reloading the page.
6. THE Web_App SHALL read the Order_Parameter in the browser after mount, so that the route `/` stays statically rendered.
7. WHILE the viewport is narrower than 800px, THE Web_App SHALL read the Order_Parameter, store a Selectable_Instrument silently, without any Toolbar_Notice, and remove the parameter, so that the Shell shows the selection when the viewport widens.
8. THE Status_Line SHALL keep showing position and mode only.
9. WHILE the Small_Screen_Page is shown and the Order_Store holds a Selectable_Instrument that was stored from the Order_Parameter, THE Small_Screen_Page SHALL show the Selection_Line `Selected: <court abbreviation>, <optionText of the Instrument>. Open this page on a wider screen to draft under it.`
10. THE Small_Screen_Page SHALL show the Selection_Line after its introductory text and before its links, as plain text with no button.
11. IF the Order_Parameter was not the `id` of any Instrument, or was the `id` of an Instrument that is not a Selectable_Instrument, THEN THE Small_Screen_Page SHALL show no Selection_Line.
12. IF the Order_Store holds no selection, THEN THE Small_Screen_Page SHALL show no Selection_Line.
13. THE Order_Link of the Courts_Page SHALL stay visible at every viewport width, including widths below 800px.

### Requirement 9: Links out of the editor

**User Story:** As a user in the editor, I want a way to the full list of court rules, so that I can read the rule behind my choice.

#### Acceptance Criteria

1. THE Export_Dialog SHALL show beside the Picker the Court_Rules_Link "See all court rules" to `/courts`, opening in a new tab with `rel="noreferrer"`.
2. THE Small_Screen_Page SHALL show the Court_Rules_Link "See all court rules" to `/courts` as its first link, before the video link and the repository link, opening in the same tab.
3. THE Small_Screen_Page SHALL show the Court_Rules_Link when both `NEXT_PUBLIC_VIDEO_URL` and `NEXT_PUBLIC_REPO_URL` are unset.
4. THE Toolbar SHALL show one plain text link "Court rules" to `/courts`, opening in a new tab with `rel="noreferrer"`, at the right end of the Toolbar after the Toolbar_Notice.
5. THE Court_Rules_Link in the Toolbar SHALL be a link and not a button, SHALL carry no `data-primary`, and SHALL not change the Toolbar's 52px height or the button groups of the Toolbar.

### Requirement 10: Any width and look

**User Story:** As a reader on a 320px phone, I want one readable column, so that I never scroll sideways.

#### Acceptance Criteria

1. THE Courts_Page SHALL render as one column from 320px viewport width upward.
2. THE Courts_Page SHALL cause no horizontal scrolling at a viewport width of 320px, including for the longest title, judge name and key language in the Dataset.
3. THE Courts_Page SHALL use no width at-rule (`min-width` or `max-width` media query), so that the single width at-rule of the Css_Scan stays the Shell's 799px rule.
4. THE Courts_Page stylesheets SHALL use only Tokens and type families of the UI_Rules, only the allowed sizes and weights, no icon, no emoji, no shadow, no gradient, no rounded corner, no animation and no transition.
5. THE Courts_Page SHALL show its page text in Libre Caslon Text 14px / 22px, its level-one heading in Libre Caslon Text 26px / 32px, its level-two headings in Libre Caslon Text 20px / 26px, and its labels and controls in Public Sans 13px / 16px.
6. THE Courts_Page SHALL show the quotation of an Instrument in Libre Caslon Text roman, with a 1px `--rule` rule on its left edge, and SHALL not italicise, centre or indent the Instrument's other text.
7. THE Courts_Page SHALL show every link in `--oxblood` and SHALL give every focusable control the focus style of the UI_Rules.
8. THE control rules for the text box and the checkbox SHALL live in `apps/web/app/globals.css`, with component stylesheets setting only heights.
9. THE UI_Rules SHALL state that the 1150px minimum width applies to the Shell only and that `/courts` is a one-column page that reads from 320px up.
10. THE Courts_Page SHALL show the status of an Instrument by words ("Not in force.") and never by colour alone.

### Requirement 11: Page metadata

**User Story:** As a person who finds the page through a link or a search, I want the title and description to say what it is, so that I know before I open it.

#### Acceptance Criteria

1. THE Courts_Page SHALL export a Next.js `metadata` with the title "Federal court rules on AI in filings — Reveal Codes" and a description of one sentence that says the page lists federal court rules and orders on generative AI in filings, with a link to each court's own text, and that contains no figure.
2. THE Courts_Page SHALL export no other metadata field.

### Requirement 12: Print view override table headers

**User Story:** As a filer who prints the certification, I want the override table headers to read whole, so that "Code" and "Timestamp" are legible.

#### Acceptance Criteria

1. THE Print_View stylesheet SHALL give the header cells of the Override_Table `overflow-wrap: normal` and `word-break: keep-all`, so that a header never breaks inside a word.
2. THE Print_View stylesheet SHALL give the Code column and the Timestamp column of the Override_Table a minimum width, in `ch`, at least the length in characters of the longest value those columns hold in the print model (the longest code text and the 20-character UTC timestamp) plus the cell padding.
3. THE Print_View stylesheet SHALL keep `overflow-wrap: anywhere` on body cells, so that a long override reason still wraps.
4. A stylesheet test SHALL fail against the current Print_View stylesheet and pass against the changed one.

### Requirement 13: Open clears the previous message

**User Story:** As a user who opens a second file, I want the old "Could not open" message gone while the new file's dialog is open, so that the screen does not describe a file that is no longer the subject.

#### Acceptance Criteria

1. WHEN an Open starts, from the Open button, a dropped file or a file given to the same function, THE Web_App SHALL clear the Toolbar_Notice and the Open_Note before any confirm dialog for that file opens.
2. WHILE the confirm dialog for a newly opened file is open, THE Toolbar_Notice SHALL show no message from an earlier Open.
3. A Web_App test SHALL fail when a previous "Could not open <name>." message is still shown while the new file's confirm dialog is open.

### Requirement 14: Declaration files are not committed

**User Story:** As a maintainer, I want generated declaration files kept out of commits, so that the task hook never commits one.

#### Acceptance Criteria

1. THE repository `.gitignore` SHALL ignore every `*.d.ts` file and SHALL keep `apps/web/src/css-modules.d.ts` tracked.
2. WHEN the process that emits `.d.ts` files into `crew/sentinel/src` and `packages/export/test/support` is found, THE repository SHALL configure that process so that it no longer emits them there.
3. IF the emitting process is not found, THEN `BUILD_LOG.md` SHALL state that it was not found and what was searched.
4. A test SHALL fail when `git ls-files` lists any `.d.ts` file other than `apps/web/src/css-modules.d.ts`.

### Requirement 15: Dataset vocabulary wording

**User Story:** As a reader of the Dataset, I want the definition of `negative_certification_when_unused` to cover how the entries use it, so that the vocabulary does not contradict the entries.

#### Acceptance Criteria

1. THE Dataset's `vocabulary.elements.negative_certification_when_unused` value SHALL read "The filer certifies that no generative AI was used: by filing without the disclosure, or by a statement of non-use that the instrument requires."
2. THE Dataset SHALL keep every entry byte for byte unchanged.
3. WHEN `pnpm power:build` runs, THE Power_Copy SHALL equal the Dataset byte for byte.
4. A test SHALL fail when the Power_Copy differs from the Dataset.

### Requirement 16: Tests

**User Story:** As the maintainer, I want tests that tie the page to the file, so that a change to either cannot leave the page wrong.

#### Acceptance Criteria

1. A test SHALL assert that every Instrument of the Dataset appears exactly once on the Courts_Page, with an Instrument_Anchor equal to its `id`.
2. A test SHALL assert that the figures in the introductory paragraph equal the Instrument count, the Court_Count, the In_Force count and the Compiled_Date computed from the Dataset.
3. A test SHALL assert that each Not_In_Force Instrument with a `superseded_by` value links to an Instrument_Anchor that exists on the Courts_Page.
4. A test SHALL assert the order of Court_Groups and Instruments of Requirement 3 against the Dataset, including numeric collation of `court.abbreviation` (a court whose abbreviation begins "5th" before one that begins "10th"), using the same `localeCompare` call as the page.
5. A test SHALL assert the Order_Parameter behaviour of Requirement 8 for a valid id, an unknown id and a superseded id, including the Toolbar_Notice text and the removal of the parameter.
6. A test SHALL assert, at a viewport narrower than 800px, that a valid Order_Parameter stores the selection with no Toolbar_Notice, removes the parameter, and makes the Small_Screen_Page show the Selection_Line with the court abbreviation and optionText of that Instrument, and that an unknown id, a superseded id and an absent Order_Parameter each leave the Small_Screen_Page without a Selection_Line.
7. A test SHALL assert that the Order_Link is present on the Courts_Page for each In_Force Instrument regardless of viewport width.
8. A test SHALL assert the Court_Rules_Link of the Export_Dialog (target, `rel`, position beside the Picker), of the Small_Screen_Page (target, first position, present with both public addresses unset) and of the Toolbar.
9. A test SHALL assert the Courts_Page with `NEXT_PUBLIC_REPO_URL` unset, and with it set to an address with and without a trailing slash.
10. THE Css_Scan and the other static scans in `apps/web/test/static/` SHALL cover the route `app/courts/` and its stylesheets for the colour, type, size, weight, icon, copy, forbidden-construct and width at-rule rules they already apply to the rest of the Web_App.
11. Property 1: FOR ALL generated Instrument sets, query texts, kind choices and checkbox states, THE Filter_Rule SHALL return exactly the Instruments that Requirement 6, criterion 4 selects, in the input order, and FOR ALL generated Instrument sets THE Filter_Rule SHALL return exactly the In_Force Instruments when the query is empty, the kind choice is "All kinds" and the checkbox is not ticked.
12. THE Property 1 test SHALL live in `packages/export/test/order-filter.properties.test.ts`, SHALL use fast-check with the arbitraries in a shared `testing` module, and SHALL run with `numRuns` of at least 200 locally and 500 in CI.
13. THE Property 1 arbitraries SHALL include query texts that are substrings of generated court names, abbreviations and judge names, texts that differ from them only in case, punctuation and spacing, and texts that match nothing.
14. THE tests SHALL use no network and no snapshot.

### Requirement 17: Documentation

**User Story:** As a judge or contributor, I want the repository to name the page and the work, so that the page is found and the process is traceable.

#### Acceptance Criteria

1. THE README SHALL contain, in its dataset section, one line giving the address `https://reveal-codes.gowthamsarveswaran.com/courts`, and the README tests SHALL stay green.
2. THE `docs/KIRO_USAGE.md` file SHALL list the `court-rules-page` spec with its path, so that `pnpm kiro:check` passes.
3. THE `BUILD_LOG.md` file SHALL contain a dated entry for this work that states what was built, what Kiro got wrong, and what fixed it.
4. THE `.env.example` comment for `NEXT_PUBLIC_REPO_URL` SHALL also say that the Courts_Page uses it for the links to the Dataset and its README.
5. THE UI_Rules SHALL list the Courts_Page's text input, checkbox and quotation rules of Requirement 10.

## Follow-up group: page wording, look, order, compiled date and print table

These requirements come from a walk of the finished build. They change the wording and look of the Courts_Page and repair four smaller defects. The numbering continues from Requirement 17.

### Requirement 18: The page uses its own words

**User Story:** As a visitor, I want every sentence on the page written for me, so that I never read a name from the data file.

#### Acceptance Criteria

1. FOR a Not_In_Force Instrument that has a `superseded_by` value whose Instrument exists, THE Courts_Page SHALL print `Not in force. Replaced by ` followed by a link to that Instrument_Anchor, titled with the replacing Instrument's title, followed by a full stop.
2. FOR a Not_In_Force Instrument without a replacing Instrument, THE Courts_Page SHALL print the status sentence from the Dataset vocabulary only when that sentence names no field and contains no underscore; otherwise it SHALL print `Not in force.` alone. The Courts_Page SHALL never print the vocabulary sentence for a replaced Instrument.
3. A test SHALL assert that no text shown on the Courts_Page, for the shipped Dataset, contains a Dataset field name (every key that appears in an entry, in `vocabulary`, and at the top of the file) as a whole word, or any word that contains an underscore. Link targets and attribute values are not shown text.

### Requirement 19: Judge titles

**User Story:** As a visitor, I want a judge named with a title, so that I do not read a data word after a name.

#### Acceptance Criteria

1. THE Courts_Page SHALL print the judge line as the title, then the name: `Magistrate Judge <name>` for `magistrate`, `Senior Judge <name>` for `senior`, `Chief Judge <name>` for `chief` and `Judge <name>` for `district`. It SHALL never print `District Judge`.
2. THE Dataset loader SHALL type the judge role as a closed union of those four values and SHALL fail the load, with a message that names the entry and the value, when an entry carries another role.
3. THE words for the roles SHALL be a `Record` typed over that union, so that a new role fails to compile until it has words.
4. A test SHALL assert the judge line of one Instrument of each role, and that the line of a Court of International Trade `district` judge reads `Judge <name>`.

### Requirement 20: No repeated title

**User Story:** As a visitor, I want a line printed once, so that the page does not read as a mistake.

#### Acceptance Criteria

1. THE Courts_Page SHALL print an Instrument's instrument name as its own line only when it differs from the title printed above it. When the title is empty and the instrument name stands in as the title, the instrument line SHALL NOT be printed.
2. A test SHALL assert, for every Instrument of the shipped Dataset, that no two paragraphs or headings inside its article have the same text.

### Requirement 21: The look of the page

**User Story:** As a visitor on a phone or a laptop, I want the page to look like part of the product, so that I can read it and tell its parts apart.

#### Acceptance Criteria

1. THE Courts_Page SHALL be a `--paper` column on a `--desk` background, as the Sheet is: the column SHALL have `max-width: var(--page-max)`, SHALL be centred, SHALL be at least as tall as the window, and SHALL take the whole width when the window is narrower. No width at-rule SHALL be used.
2. THE top of the page SHALL carry the Mark and the wordmark REVEAL CODES, styled as on the Small_Screen_Page, as one link to `/` in the same tab. The Mark SHALL be 24px, 10px before the wordmark, with `aria-hidden`.
3. EACH Instrument SHALL read in three levels: (a) its title; (b) a secondary block holding the judge line, the kind and applies-to words, and the date, in `--font-ui` and `--muted`; (c) what it asks for, being the status line when the Instrument is Not_In_Force, a list of requirements under a short label, the required heading, and the key language.
4. THE list of requirements SHALL have the label `Requires`, in the Small label style of the UI_Rules, and SHALL be omitted with its label when the list is empty.
5. THE required heading SHALL be printed as `Required heading: “<text>” (<placement in lower case>)`, replacing `Caption: …`. The placement words are the Placement_Words with their first letter in lower case.
6. A Not_In_Force Instrument SHALL show `Not in force.` in weight 700 on its own line directly under the title, so that it stands out by words and weight, not by colour alone.
7. THE links "Read the court's text" and "Draft under this rule" SHALL each be at least 34px high, with no change to their colour, size or underline.
8. THE sizes, weights and families SHALL come only from the allowed lists of the UI_Rules, and the assignment of each to a level SHALL be recorded in `.kiro/steering/ui.md`. No Token, size, weight or scan exemption SHALL be added.
9. THE static scans of Requirement 10 and Requirement 16 SHALL stay green without a new exemption, and the stylesheet test SHALL assert the column rules of criterion 1.

### Requirement 22: Court order ignores spaces and full stops

**User Story:** As a visitor, I want `D.N.M.` between `D. Neb.` and `D. Wyo.` where the alphabet puts it, so that the list is easy to scan.

#### Acceptance Criteria

1. THE comparison of court abbreviations SHALL ignore spaces and full stops and SHALL keep numeric collation, so that `5th Cir.` sorts before `10th Cir. BAP`, and `D. Neb.`, `D.N.M.`, `D. Wyo.` come in that order (stripped: `dneb`, `dnm`, `dwyo`).
2. THE ordering tests SHALL include a case with `D. Neb.`, `D. Wyo.` and `D.N.M.` and SHALL assert the order of the stripped text.

### Requirement 23: The compiled date

**User Story:** As a reader, I want the compiled date to be no earlier than the newest entry, so that the page does not contradict itself.

#### Acceptance Criteria

1. THE `compiled` value of `data/standing-orders.json` SHALL equal the latest `retrieved` date of any entry in the file.
2. A test SHALL assert that `compiled` is never earlier than the `retrieved` date of any entry, and SHALL fail on a Dataset whose `compiled` is earlier than one.
3. THE `orders-curator` agent and the `add-standing-order` skill SHALL state, as a step, that adding or updating an entry sets `compiled` to the latest `retrieved` date and runs `pnpm power:build`.
4. THE Power's copy of the Dataset SHALL equal the Dataset byte for byte after `pnpm power:build`, and the Dataset README SHALL state the same date as `compiled`.

### Requirement 24: Override table columns in the print view

**User Story:** As a filer, I want the override table to use its width where it is needed, so that a reason reads in few lines.

#### Acceptance Criteria

1. THE Code and Timestamp columns of the Override_Table SHALL be as wide as their content, with no wrapping: `white-space: nowrap` and `width: 1%` on those columns, with no `min-width` wider than the longest content.
2. THE Reason column SHALL take the remaining width and wrap by word.
3. THE stylesheet test SHALL assert criteria 1 and 2 and SHALL fail on the previous `min-width: 26ch` rule.

### Requirement 25: Record and verify

**User Story:** As the maintainer, I want the walk recorded and the build green, so that the follow-up can be trusted.

#### Acceptance Criteria

1. THE `BUILD_LOG.md` entry of this work SHALL list, under "What Kiro got wrong", what the walk found, in plain words.
2. AFTER the last edit, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout `pnpm --filter @reveal-codes/web build` and `pnpm kiro:check` SHALL all pass. Nothing SHALL be pushed.
