# Requirements Document

## Introduction

This feature lets the author name the court, or the judge, a filing is going to. The AI-Use and Verification Statement then carries that instrument's citation, title and required elements, and the export refuses to proceed under an instrument that prohibits AI drafting while AI-origin text remains. With no selection, behaviour is identical to today.

The feature adds a validated, typed view of the public dataset `data/standing-orders.json` to `packages/export` (`orders.ts`), an order parameter to the Statement and the Gate, a picker in the Export_Dialog and the Print_View, a confidentiality checkbox, a prohibition block, and a first-page heading in the DOCX for courts that require one. It does not change the Engine or the Verifier. The only Sentinel source change is the title matching in `crew/sentinel/src/split.ts`, plus tests: the demo motion court moves to the Northern District of Texas, and three example tests prove that a first-page header, a renamed title and a separate declaration do not cause drift (Requirement 12). The requirements pass found that the Sentinel matched only the Standard_Title, and BUILD_LOG records this.

Requirements 1 to 12 correspond one to one to binding decisions 1 to 12 of the request. The groups of the later task list follow the requirements: Group 1 is Requirement 1 and 2, Group 2 is Requirements 4 and 5 with Properties 1 and 2 (Requirement 10), Group 3 is Requirements 3, 6 and 7, and Group 4 is Requirement 12 with one final checkpoint. Requirements 9, 10 and 11 state the tests that each group lands.

Interpretation notes, so that the criteria below are testable:

- A "line" of the filing is the 1-based index of a Filing_Paragraph, the substrings of `document.text` separated by `\n`. This is the same numbering the Sentinel reports, and the Sentinel report keeps its "Line" column. In everything a court or the author reads (the Statement_Text, the Export_Dialog, the Print_View), the word is "paragraphs", never "lines". The Statement data field names and the Glossary keep the word "line".
- The Statement tool fields are `provider` and `model` (the existing `StatementTool`). The tool wording is `<provider> <model>`, and `<provider>` alone when `model` is `null`.
- The existing `buildStatement(document, runLog, meta)` gains a fourth parameter: `buildStatement(document, runLog, meta, orderContext)`, where `OrderContext = { entry: OrderEntry; confidentialityCertified: boolean } | null`. `Statement.order` stays `StatementOrder | null`.
- The Statement carries the derived figures the new sentences need (the AI line ranges, the run count, the prompt count) and `confidentialityCertified` as plain data, because `renderStatement` reads only the Statement.
- A prohibition entry whose `aiUsed` is `false` reaches `buildStatement`; a prohibition entry with `aiUsed` `true` does not (Requirement 5).

Product principles that bind this feature: principle 1 (provenance is captured, never inferred: the gate counts spans, it does not detect AI), principle 2 (the same Document and the same entry give the same Statement), principle 3 (nothing leaves the machine silently: the selection stays in `localStorage`), principle 4 (red codes block export; the prohibition has no override because it is not a red code), and principle 7 (the picker is plain UI; the period look belongs to the Pane only).

## Glossary

- **Dataset**: the file `data/standing-orders.json`, version 1, with a `vocabulary` object and an `entries` array. Its facts are not changed by this feature.
- **Vocabulary**: the Dataset's own `vocabulary` object. Its keys `kind`, `applies_to`, `elements`, `caption.placement` and `status` define every enumerated value.
- **Order_Entry** (`OrderEntry`): one element of `entries`, with the fields `id`, `court` (`name`, `abbreviation`, `level`), `judge` (`null` or `name` and `role`), `instrument`, `title`, `date`, `date_note` (optional), `kind`, `applies_to`, `elements`, `caption` (`null` or `placement` and `text`), `key_language`, `source_url`, `source_kind`, `retrieved`, `status`, `supersedes` (optional), `superseded_by` (optional), `notes` (optional).
- **Order_Set** (`OrderSet`): the validated Dataset as typed data.
- **Orders_Module**: `packages/export/src/orders.ts`. It exports `loadOrders` and `ORDERS`.
- **ORDERS**: the Order_Set loaded once from a JSON import of `../../../data/standing-orders.json`.
- **Selectable_Entry**: an Order_Entry whose `status` is `"current"`.
- **Court_Wide_Entry**: an Order_Entry whose `judge` is `null`. A **Judge_Entry** has a non-null `judge`.
- **Surname**: the last whitespace-separated token of `judge.name`.
- **Order_Selection** (`OrderSelection`): `{ entryId: string }` or `null`. `null` means no specific order.
- **Selection_Key**: the `localStorage` key `reveal-codes:order:v1`.
- **Selection_Store**: the `apps/web` module that reads, writes and exposes the Order_Selection. It is not part of the Engine Document or the autosave Persisted_Value.
- **Picker**: the labelled native `<select>` "Court or judge" in the Export_Dialog.
- **Order_Summary**: the block under the Picker (and in the Print_View header area) that shows the one-line kind, applicability and date, the quoted `key_language`, and the "Source" link.
- **Statement**: the plain-data value returned by `buildStatement`, as defined by the export-certification spec.
- **Statement_Order** (`StatementOrder`): `{ id, instrument, title, court, judge, date, sourceUrl, kind, caption }`, where `court` is the court name, `judge` is the judge name or `null`, and `caption` is the Order_Entry's `caption`.
- **Statement_Text**: the blocks returned by `renderStatement(statement)`.
- **Order_Context** (`OrderContext`): `{ entry: OrderEntry; confidentialityCertified: boolean }` or `null`; the fourth parameter of `buildStatement`.
- **Standard_Title**: the constant `STATEMENT_TITLE`, "AI-Use and Verification Statement".
- **Statement_Titles**: the constant `STATEMENT_TITLES` of the Export_Package: `STATEMENT_TITLE` plus the distinct `caption.text` of every Dataset entry, of any `status`, whose `caption.placement` is `statement_title` or `separate_declaration`.
- **Gate**: `canExport` in the Export_Package.
- **AI_Origin_Span**: a span of the Document whose origin is `AI` or `AI>HUM`.
- **Prohibition_Block**: the state in which the selected Order_Entry has `kind` `"prohibition"` and the Document holds at least one AI_Origin_Span.
- **Confidentiality_Checkbox**: the Export_Dialog checkbox of Requirement 6.
- **First_Page_Heading**: the DOCX first-page header and the Print_View top block of Requirement 7.
- **Export_Package**: `packages/export`, as defined by the export-certification spec.
- **Export_Dialog**, **Print_View**, **Web_App**, **Blocking_Issue**, **Filing_Paragraphs**: as defined by the export-certification spec.
- **Sentinel**: the sweep CLI in `crew/sentinel`, run as `pnpm sentinel`.
- **Demo_Motion**: `packages/engine/fixtures/demo-motion.txt`.
- **Result**: the Engine's `Result<T, E>`.

## Requirements

### Requirement 1: Dataset loading and validation

**User Story:** As a maintainer, I want the court dataset validated against its own vocabulary when it loads, so that a bad edit to the file is caught before it can shape a filing.

#### Acceptance Criteria

1. THE Orders_Module SHALL export `loadOrders(value: unknown): Result<OrderSet, string>` and `ORDERS: OrderSet`, and `ORDERS` SHALL be loaded once, at module load, from a JSON import of `../../../data/standing-orders.json`.
2. WHEN `loadOrders` receives a value that is not an object with a `version` and an `entries` array, THE Orders_Module SHALL return `err` with a message naming the missing or malformed field, and SHALL NOT throw.
3. IF the top-level `version` is not the number 1, THEN THE Orders_Module SHALL return `err` with a message naming `version`.
4. IF an entry lacks any field of the Order_Entry definition other than the optional fields `date_note`, `supersedes`, `superseded_by` and `notes`, THEN THE Orders_Module SHALL return `err` with a message naming the entry id and the field.
5. IF the `kind`, the `applies_to`, any member of `elements`, the `caption.placement` (when `caption` is not `null`), or the `status` of an entry is not a key of the matching Vocabulary object, THEN THE Orders_Module SHALL return `err` with a message naming the entry id and the field.
6. IF two entries have the same `id`, or an `id` is not kebab-case (lowercase letters and digits in groups separated by single hyphens), THEN THE Orders_Module SHALL return `err` with a message naming `id`.
7. IF a `supersedes` or `superseded_by` value does not equal the `id` of an entry in the same file, THEN THE Orders_Module SHALL return `err` with a message naming that field and the entry id.
8. IF a `date` is not a valid calendar date written `YYYY-MM-DD`, THEN THE Orders_Module SHALL return `err` with a message naming `date`.
9. IF a `source_url` is not an `https:` URL whose host ends in `.uscourts.gov` or equals `edrm.net`, THEN THE Orders_Module SHALL return `err` with a message naming `source_url`.
10. IF a `key_language` has fewer than 1 or more than 400 characters, THEN THE Orders_Module SHALL return `err` with a message naming `key_language`.
11. WHEN several checks would fail, THE Orders_Module SHALL return the error string of the first failing check, where the checks run in the order of criteria 2 to 10 and entries are checked in file order.
12. THE Orders_Module SHALL return the same Order_Set, in the file's entry order, and SHALL leave every fact of the Dataset unchanged.
13. THE Orders_Module SHALL import nothing from `node:` and SHALL have no runtime dependency beyond the Engine's `Result`.

### Requirement 2: Selection model and persistence

**User Story:** As a filer, I want my choice of court remembered on this machine, so that I do not pick it again every time I export.

#### Acceptance Criteria

1. THE Selection_Store SHALL belong to the Web_App and SHALL keep the Order_Selection separate from the Engine Document, the Store undo and redo stacks, and the autosave Persisted_Value.
2. WHEN the Order_Selection changes to an entry, THE Selection_Store SHALL write `{ "version": 1, "entryId": <id> }` as JSON to `localStorage` under the Selection_Key.
3. WHEN the Order_Selection changes to `null`, THE Selection_Store SHALL remove the Selection_Key from `localStorage`.
4. WHEN the Selection_Store reads the Selection_Key, THE Selection_Store SHALL return `{ entryId }` if and only if the stored value is valid JSON of the form `{ "version": 1, "entryId": <string> }` and the `entryId` is the `id` of a Selectable_Entry, and SHALL otherwise return `null`.
5. IF the stored value is missing, is not valid JSON, has another `version`, has a non-string `entryId`, or names an unknown or non-current id, THEN THE Selection_Store SHALL return `null` and SHALL NOT throw.
6. IF `localStorage` is unavailable or throws on read or write, THEN THE Selection_Store SHALL keep the Order_Selection in memory for the session and SHALL NOT throw.
7. THE Orders_Module SHALL export `selectableOrders(orders: OrderSet)` that returns the Selectable_Entries grouped by `court.abbreviation`, with the groups in the order in which each abbreviation first appears among the Selectable_Entries in the file.
8. WHEN `selectableOrders` orders the entries within a group, THE Orders_Module SHALL place the Court_Wide_Entry first, and then the Judge_Entries by Surname in ascending order using `localeCompare` with the locale `"en"`, and entries that tie keep file order.
9. FOR ALL Order_Selections written and then read, the read SHALL return the value written when it is `null` or names a Selectable_Entry (round trip).

### Requirement 3: Picker and Order_Summary

**User Story:** As a pro se filer, I want to pick my court or judge from a plain list and see what that order says, so that I know what the statement will contain.

#### Acceptance Criteria

1. THE Export_Dialog SHALL show, above the Issues list, a label "Court or judge" and a native `<select>` (the Picker) associated with that label.
2. THE Picker SHALL use 13px text in `var(--font-ui)` and a 1px `var(--rule)` border, with no styling beyond `ui.md`.
3. THE Picker SHALL list as its first option "No specific order — general statement", which stands for the `null` Order_Selection.
4. THE Picker SHALL list one `<optgroup>` per group of `selectableOrders(ORDERS)`, labelled with the court abbreviation, with the options in the order of Requirement 2, criterion 8, and with no option for an entry whose `status` is not `"current"`.
5. THE Picker SHALL write the option text of a Court_Wide_Entry as `Court-wide — <instrument> (<year>)` and of a Judge_Entry as `Judge <surname> — <title> (<year>)`, where `<year>` is the first four characters of `date`.
6. WHEN the user chooses an option, THE Web_App SHALL update the Order_Selection through the Selection_Store.
7. WHEN the Export_Dialog opens, THE Picker SHALL show the option for the Order_Selection read from the Selection_Store, and "No specific order — general statement" when that read returns `null`.
8. WHILE an entry is chosen, THE Export_Dialog SHALL show the Order_Summary under the Picker: first a line `<kind in words> · <applies_to in words> · <date>`, then the `key_language` in quotation marks, then a plain link "Source" to `source_url` that opens in a new tab with `rel="noreferrer"`.
9. THE Order_Summary SHALL write the kind words as "Statement in every filing" for `certification_every_filing`, "Disclosure when AI is used" for `disclosure_when_used`, "AI drafting prohibited" for `prohibition`, "Verification required" for `verification_only`, and "Guidance" for `guidance`.
10. THE Order_Summary SHALL write the applicability words as "attorneys and self-represented parties" for `all`, "attorneys" for `attorneys`, and "self-represented parties" for `pro_se`.
11. WHILE no entry is chosen, THE Export_Dialog SHALL NOT show the Order_Summary.
12. THE Print_View SHALL show the same Order_Summary, read-only, in its header area, for the Order_Selection read from the Selection_Store.
13. THE Export_Dialog SHALL contain no change beyond the Picker, the Order_Summary, the Confidentiality_Checkbox of Requirement 6, and the blocked state of Requirement 5.

### Requirement 4: Statement changes

**User Story:** As a filer, I want the statement to cite the instrument I am filing under and answer the elements it asks for, so that I can hand it to that court as it is.

#### Acceptance Criteria

1. THE Export_Package SHALL export `buildStatement(document, runLog, meta, orderContext)` where `orderContext` is an Order_Context, and the Statement SHALL gain the field `order: StatementOrder | null` that holds `null` when `orderContext` is `null`.
2. WHEN `orderContext` is not `null`, THE Export_Package SHALL set `statement.order` to `{ id, instrument, title, court, judge, date, sourceUrl, kind, caption }` taken from `orderContext.entry`, with `court` the court name, `judge` the judge name or `null`, and `sourceUrl` the `source_url`.
3. THE Statement SHALL serialise `order` together with its other fields, and the DOCX file name SHALL remain the name produced today.
4. WHEN `orderContext` is `null`, THE Export_Package SHALL render Statement_Text identical, block for block and character for character, to the Statement_Text rendered before this feature, and the existing tests SHALL pass unchanged.
5. WHEN `statement.order.caption` is not `null` and its `placement` is `statement_title` or `separate_declaration`, THE Export_Package SHALL render the title block text as `caption.text`.
6. WHEN `statement.order` is not `null` and the title is not set by criterion 5, THE Export_Package SHALL render the title block text as the Standard_Title.
7. WHEN `statement.order` is not `null`, THE Export_Package SHALL insert as paragraph 1: `This statement is made to comply with the following instrument of the <court.name>: <title> (<instrument><, Judge <name>>, <date>). Source: <sourceUrl>.`, where the clause `, Judge <name>` is present only for a Judge_Entry, `<instrument>` and `<title>` are written verbatim from the entry, and the following paragraphs are numbered from 2.
8. WHEN `caption.placement` is `separate_declaration`, THE Export_Package SHALL insert into paragraph 1 the clause `, filed as a declaration captioned "<caption.text>"` immediately before `Source:`, so that the citing sentence ends with the clause and a full stop is not duplicated.
9. WHERE the entry's `elements` include `tool_name` and `aiUsed` is `true`, THE Export_Package SHALL add to the paragraph that lists the tools the sentence `The generative artificial intelligence program used was <provider> <model>.`, with several tools joined by `; `, and `<provider>` alone for a tool whose `model` is `null`.
10. WHERE the entry's `elements` include `tool_name` and `aiUsed` is `false`, THE Export_Package SHALL add to the no-AI paragraph the sentence `No program was used.`
11. WHERE the entry's `elements` include `portions` and `aiUsed` is `true`, THE Export_Package SHALL add to the AI paragraph the sentence `The text drafted with the program appears at paragraphs <ranges> of the filing.`, where `<ranges>` lists the Filing_Paragraph indexes that contain AI_Origin_Span text in ascending order, joins consecutive indexes as `12–14` with an en dash, writes a single index as `27`, and separates items with `, `. For example, `The text drafted with the program appears at paragraphs 12–14 of the filing.`
12. WHERE the entry's `elements` include `how_used` and `aiUsed` is `true`, THE Export_Package SHALL add to the AI paragraph the sentence `The program was used to draft text inserted at the author's request in <n> run(s); each prompt is recorded in the run log.`, where `<n>` is the number of runs in the run log and "run(s)" is written "run" when `<n>` is 1 and "runs" otherwise.
13. WHERE the entry's `elements` include `accuracy_certification`, `citations_verified` or `human_review`, THE Export_Package SHALL add no sentence, and the rendered Statement_Text SHALL contain the existing verification sentences (`citationParagraph`, `quoteParagraph` and `RESPONSIBILITY`).
14. WHERE the entry's `elements` include `confidentiality`, `aiUsed` is `true` and `orderContext.confidentialityCertified` is `true`, THE Export_Package SHALL add to the AI paragraph the sentence `The author certifies that no confidential or business proprietary information was entered into the program.`; WHERE `confidentialityCertified` is `false`, THE Export_Package SHALL omit the sentence.
15. WHERE the entry's `elements` include `prompt_records` and `aiUsed` is `true`, THE Export_Package SHALL add to the AI paragraph the sentence `Prompt records are retained in the document's run log (<n> prompts).`, where `<n>` is the number of runs in the run log.
16. WHERE the entry's `elements` include `negative_certification_when_unused`, or its `kind` is `certification_every_filing`, or its `kind` is `prohibition`, and `aiUsed` is `false`, THE Export_Package SHALL render the no-AI paragraph as `No generative artificial intelligence was used in preparing this filing.`
17. WHERE the entry's `elements` include `signed_by_all_drafters`, THE Export_Package SHALL render the signature line as `/s/ ________________ (all contributors to the drafting)`.
18. WHERE none of the conditions of criterion 16 holds and `aiUsed` is `false`, THE Export_Package SHALL keep the no-AI paragraph that is rendered today.
19. THE Export_Package SHALL add each sentence of criteria 7 to 17 to the paragraph that already covers its topic and SHALL NOT create a parallel paragraph; the only new paragraph is paragraph 1 of criterion 7.
20. THE Export_Package SHALL define all new wording as constants and small functions in `wording.ts`, or in `wording-orders.ts` when `wording.ts` would exceed the limits scan, as plain sentences with no exclamation marks.
21. THE Export_Package SHALL carry the derived figures needed by criteria 11, 12 and 15 (the AI paragraph ranges, the run count, the prompt count) and `confidentialityCertified` as plain data in the Statement, so that `renderStatement` stays a pure function of the Statement.
22. THE Export_Package SHALL count the AI line ranges from the Document's span data and SHALL NOT re-derive any origin.
23. FOR ALL Documents and run logs, `buildStatement` with the same inputs SHALL return equal Statements (determinism).

### Requirement 5: Prohibition gate

**User Story:** As a pro se filer, I want the export to stop when the judge forbids AI drafting and my text still contains AI output, so that I do not file in breach of the order.

#### Acceptance Criteria

1. THE Export_Package SHALL export `canExport(document, order)` where `order` is a required parameter, an Order_Entry or `null`, THE feature SHALL update every existing caller of `canExport` to pass `null` explicitly where there is no selection, and `canExport(document, null)` SHALL return what `canExport(document)` returned before this feature.
2. WHEN the Document has at least one AI_Origin_Span and `order.kind` is `"prohibition"`, THE Gate SHALL return `false`, whether or not `blockingIssues(document)` is empty.
3. WHEN `order` is `null` or its `kind` is not `"prohibition"`, THE Gate SHALL return `true` if and only if `blockingIssues(document)` is empty.
4. THE Gate SHALL decide criterion 2 from the span list of the Document (origin `AI` or `AI>HUM`) and SHALL NOT re-derive origin from text.
5. WHILE the Prohibition_Block holds, THE Export_Dialog SHALL show, in place of the enabled state of the export buttons, one line followed by the `key_language` in quotation marks. For a Judge_Entry the line is `Judge <surname>'s order prohibits AI-drafted text. <n> AI-origin span(s) remain at paragraphs <ranges>.`; for a Court_Wide_Entry the line is `<instrument> prohibits AI-drafted text. <n> AI-origin span(s) remain at paragraphs <ranges>.` Here `<n>` counts the AI_Origin_Spans, "span(s)" is written "span" when `<n>` is 1 and "spans" otherwise, and `<ranges>` is written as in Requirement 4, criterion 11.
6. WHILE the Prohibition_Block holds, THE Export_Dialog SHALL show "Download .docx" and "Open print view" as disabled buttons.
7. THE Web_App SHALL offer no override for the Prohibition_Block, and THE Export_Dialog Issues region SHALL list and count Blocking_Issues exactly as it does today.
8. THE toolbar Export label "Export (<n> blocking)" SHALL count Blocking_Issues only and SHALL NOT count the Prohibition_Block.
9. WHEN an AI_Origin_Span is relabelled `AI>HUM` by an edit, THE Gate SHALL still return `false`.
10. WHEN the last AI_Origin_Span is removed from the Document by deleting its text, THE Gate SHALL return `true` if `blockingIssues(document)` is also empty.
11. IF the Print_View is opened while the Prohibition_Block holds, THEN THE Print_View SHALL show the prohibition line of criterion 5 with the `key_language` in place of the Statement_Text, and SHALL NOT render the Statement_Text.
12. WHEN `aiUsed` is `false`, THE Gate SHALL NOT apply the Prohibition_Block, because the Document has no AI_Origin_Span.

### Requirement 6: Confidentiality checkbox

**User Story:** As a filer, I want to be asked once whether I put confidential material into the AI tool when the court requires that certification, so that the statement says only what I attest.

#### Acceptance Criteria

1. WHILE the selected entry's `elements` include `confidentiality` and `aiUsed` is `true`, THE Export_Dialog SHALL show a checkbox labelled "I entered no confidential or business proprietary information into the AI tool."
2. WHILE the Confidentiality_Checkbox is shown and is not ticked, THE Export_Dialog SHALL show "Download .docx" and "Open print view" as disabled buttons.
3. WHEN the Confidentiality_Checkbox is ticked and no other block holds, THE Export_Dialog SHALL enable the export buttons.
4. THE Web_App SHALL NOT persist the tick: WHEN the Export_Dialog opens, THE Confidentiality_Checkbox SHALL be unticked.
5. WHEN the selection changes, or the Document changes so that the checkbox is no longer shown, THE Web_App SHALL clear the tick.
6. WHILE `aiUsed` is `false` or the selected entry has no `confidentiality` element, THE Export_Dialog SHALL NOT show the Confidentiality_Checkbox and SHALL NOT require a tick.
7. WHEN the tick is set and the user downloads, THE Web_App SHALL pass `confidentialityCertified: true` in the Order_Context to `buildStatement` so that the sentence of Requirement 4, criterion 14 is rendered; WHEN the tick is not set, THE Web_App SHALL pass `false` and THE sentence SHALL be omitted.
8. THE Web_App SHALL NOT pass the tick from the Export_Dialog to the Print_View, and SHALL NOT persist it anywhere.
9. WHILE the selected entry's `elements` include `confidentiality`, `aiUsed` is `true` and the Prohibition_Block does not hold, THE Print_View SHALL render its own checkbox with the same label as criterion 1, in a controls block that is hidden in `@media print`, unticked on every load.
10. WHILE the Print_View checkbox is not ticked, THE Print_View SHALL show in place of the Statement_Text one line saying that the confidentiality statement is required.
11. WHEN the Print_View checkbox is ticked, THE Print_View SHALL build the Statement with `confidentialityCertified: true` and render the same Statement_Text as the DOCX would with the tick set.

### Requirement 7: First-page heading

**User Story:** As a filer under the Northern District of Texas rule, I want the first page of the filing to carry the required AI heading, so that the court sees the disclosure where the rule says to look.

#### Acceptance Criteria

1. WHEN `statement.order.caption.placement` is `first_page_heading` and `aiUsed` is `true`, THE Export_Package SHALL give the DOCX section a first-page header (`headers.first` with `titlePage: true`) of two paragraphs.
2. THE first header paragraph SHALL read `caption.text`, in bold, 12 pt, centred.
3. THE second header paragraph SHALL read `This filing was prepared using generative artificial intelligence. See the <statement title> following the filing.`, in 12 pt, where `<statement title>` is the title block text of the Statement_Text.
4. THE Export_Package SHALL add nothing to the body paragraphs for the First_Page_Heading, so that the filing paragraphs, the Statement_Text and the Appendix are the same as without it.
5. WHEN `aiUsed` is `false`, or the placement is not `first_page_heading`, or `order` is `null`, THE Export_Package SHALL add no header to the DOCX; silence is the certification under the rule.
6. WHEN the First_Page_Heading applies, THE Print_View SHALL render the same two lines at the top of the first page in a block with `break-after: avoid`.
7. WHEN the First_Page_Heading does not apply, THE Print_View SHALL render no such block.

### Requirement 8: Statement JSON and file name

**User Story:** As a maintainer, I want the Statement's order to travel with the rest of the Statement data, so that the data stays one self-contained value.

#### Acceptance Criteria

1. THE Statement SHALL serialise `order` with the rest of its fields, and `JSON.parse(JSON.stringify(statement))` SHALL equal the Statement.
2. THE DOCX file name SHALL remain the name produced by `file-name.ts` today, for every Order_Selection.

### Requirement 9: Example tests

**User Story:** As a maintainer, I want exact examples for each court behaviour, so that a regression in wording or gating is caught by name.

#### Acceptance Criteria

1. THE Export_Package tests SHALL load the shipped Dataset with `loadOrders` and expect `ok`.
2. THE Export_Package tests SHALL run a table of single-field mutations of the shipped Dataset, one per check in Requirement 1, criteria 3 to 10, and SHALL expect `err` with a message naming the mutated field for each row.
3. THE Web_App tests SHALL show that the Picker lists only Selectable_Entries, grouped and ordered as in Requirement 2, that the selection persists and is restored, and that an unknown id reads as `null`.
4. THE Export_Package tests SHALL show that the Statement under `ndtex-lr-7-2-f` with AI used has the First_Page_Heading and the Standard_Title.
5. THE Export_Package tests SHALL show that under `edtex-love-2025` the title is "Certificate of Generative Artificial Intelligence Usage" and the tool sentence is present.
6. THE Export_Package tests SHALL show that under `dcolo-wang-2025` with no AI the no-AI sentence and the signature line "(all contributors to the drafting)" are present.
7. THE tests SHALL show that under `sdohio-newman` with one AI-origin span the Export_Dialog shows the line of Requirement 5, criterion 5 and `canExport` is `false`; that `canExport` stays `false` after the span is relabelled `AI>HUM` by an edit beyond the threshold; and that it becomes `true` only when the AI-origin text is deleted.
8. THE tests SHALL show that under `cit-choe-groves-2025` the Confidentiality_Checkbox gates export and the confidentiality sentence appears only when the box is ticked, that the Print_View shows its own checkbox and the one-line stand-in until it is ticked, and that no tick is passed between the Export_Dialog and the Print_View.
9. THE Export_Package tests SHALL show that with `order === null` the rendered blocks equal the existing expected output of today's tests.
10. THE tests SHALL show, for each of criteria 13 to 15 of Requirement 4 that applies to a chosen entry, that the existing verification sentences are present.
11. THE tests SHALL contain no snapshot of the engine, no `try/catch` that hides an error, and no test that only imports a module.
12. THE tests SHALL show that the Statement_Text, the prohibition line and the Export_Dialog use the word "paragraphs" and never "lines" for the Filing_Paragraph ranges, with the sentence `The text drafted with the program appears at paragraphs 12–14 of the filing.` as one example.
13. THE Export_Package tests SHALL show that `STATEMENT_TITLES` holds `STATEMENT_TITLE` and the distinct `caption.text` of every Dataset entry, of any `status`, with `caption.placement` `statement_title` or `separate_declaration`, and no other caption text.

### Requirement 10: Properties

**User Story:** As a maintainer, I want the two guarantees of this feature proved over generated Documents and every selectable entry, so that no combination escapes the examples.

#### Acceptance Criteria

1. THE Export_Package SHALL include in `<module>.properties.test.ts` files one `fc.assert(fc.property(...))` for each of Property 1 and Property 2, each with the comment `// Property N` above it and `_Requirements: x.y_` in its describe title, with `numRuns` of at least 200 locally and 500 in CI.
2. FOR ALL Selectable_Entries and all Documents from the export test arbitraries, the rendered Statement_Text SHALL contain the entry's `instrument`, its `court.name` and its `source_url`, and its title block text SHALL equal `caption.text` when `caption.placement` is `statement_title` or `separate_declaration`, and the Standard_Title otherwise (Property 1, order citation is total).
3. FOR ALL Order_Entries and all Documents, `canExport(document, entry)` SHALL equal `!(entry.kind === "prohibition" && hasAiOrigin(document))`, where `hasAiOrigin` is computed in the test from the span list independently of the Gate, for Documents with no Blocking_Issue (Property 2, gate).
4. THE properties SHALL assert a relationship between input and output and SHALL reuse the shared arbitraries of `packages/engine/src/testing/arbitraries.ts` and the export test arbitraries; any new arbitrary useful twice SHALL be added there.
5. IF a property fails, THEN the maintainer SHALL record the shrunk counterexample as a named example test and fix the code, and SHALL NOT weaken the property.

### Requirement 11: Static scans

**User Story:** As a maintainer, I want the new code held to the repository's size and style limits, so that the feature does not erode them.

#### Acceptance Criteria

1. THE Web_App static css-rules scan SHALL pass with no new rule, because the new UI uses existing sizes and colours only.
2. THE limits scan SHALL pass for every file added or changed by this feature: functions under 40 lines and modules under 300 lines.
3. IF `wording.ts` would exceed the limits, THEN THE Export_Package SHALL split the new wording into `wording-orders.ts`.
4. THE new `orders.ts`, `wording.ts` and `wording-orders.ts` SHALL use named exports only, plain data types, and `unknown` plus narrowing instead of `any`.
5. THE Orders_Module and the rest of the Export_Package `src` SHALL import nothing from `node:` and nothing from the DOM.

### Requirement 12: Documentation, steering and demo motion court

**User Story:** As a judge reading the repository, I want the docs to explain the court feature and the demo to exercise it, so that I can see a court-specific export end to end.

#### Acceptance Criteria

1. THE README.md SHALL gain a "Court-specific certification" section that says what the Picker does, gives three example courts, links to `data/README.md`, and states that the Dataset is released under CC0.
2. THE docs/KIRO_USAGE.md SHALL gain rows for this spec and for each steering edit made by this feature.
3. THE BUILD_LOG.md SHALL gain a dated entry for this feature.
4. THE .kiro/steering/structure.md SHALL add `data/` to the repository layout.
5. THE .kiro/steering/product.md SHALL gain one line under the principles: the statement follows the selected court's instrument; the dataset is public and CC0.
6. THE spec commit SHALL be titled `spec(court-orders): …` and SHALL include `data/README.md` and `data/standing-orders.json` alongside the three spec files.
7. THE Demo_Motion line 2 SHALL read `FOR THE NORTHERN DISTRICT OF TEXAS` in place of `FOR THE DISTRICT OF OREGON`, and the case number `3:26-cv-00000` SHALL remain unchanged.
8. THE copy script `apps/web/scripts/copy-demo.ts` SHALL refresh `apps/web/public/demo-motion.txt` from the Demo_Motion.
9. THE Sentinel test `crew/sentinel/test/analyse.test.ts` SHALL be updated at lines 62 and 70 so that they quote the new line and the edited line, and every other test that quotes the old line SHALL be updated the same way.
10. THE Sentinel tests SHALL gain three example tests, each exporting the demo Document with AI used and asserting that `pnpm sentinel check` reports "No drift.": `ndtex-lr-7-2-f` (first-page header; the proof for Requirement 7, criterion 4), `edtex-love-2025` (renamed title), and `dhaw-go-23-1` (separate declaration).
11. THE Export_Package SHALL export `STATEMENT_TITLES` from `packages/export/src/index.ts`, and `splitExport` in `crew/sentinel/src/split.ts` SHALL locate the first paragraph equal to any member of `STATEMENT_TITLES` in place of the single `STATEMENT_TITLE`; no other Sentinel source file SHALL change.
12. THE same task SHALL update the matching requirement and design lines in `.kiro/specs/sentinel-sweep/requirements.md` and `.kiro/specs/sentinel-sweep/design.md` (the Statement_Title definition, Requirement 3 criteria 1, 3, 4 and 5, Requirement 1 criterion 15 and Property 1 wording, and the corresponding design lines) so that they name `STATEMENT_TITLES`.
13. THE BUILD_LOG.md entry for this feature SHALL record that the requirements pass found that the Sentinel matched only the Standard_Title.
14. THE changes to `crew/sentinel` SHALL be limited to `src/split.ts` and the tests named in criteria 9 and 10, and THE Verifier SHALL NOT change.
15. THE final checkpoint SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `next build --webpack`, and SHALL state that the browser check is left to the user.
