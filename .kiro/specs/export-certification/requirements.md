# Requirements Document

## Introduction

This feature turns a checked Document into a filing the author can hand to a court. It adds a pure TypeScript package, `packages/export` (`@reveal-codes/export`), and replaces the placeholder Export dialog of the editor-app spec with a working Export flow in `apps/web`.

Export produces exactly one `.docx` file with three parts in order: the filing as paragraphs, a page break, an AI-Use and Verification Statement, a page break, and a Provenance Appendix. It also provides a print view at `/print` that renders the same three parts as HTML. Nothing else is produced.

The Statement is built as data first (`buildStatement`) and rendered to fixed, court-neutral wording second. The Appendix is the full Reveal Codes serialisation of the Document, so the tool can re-read it. The gate is the Engine's: a Document may be exported only when `blockingIssues(document)` is empty.

This spec changes Requirement 19 and the Export_Dialog definition of the editor-app spec: the Export_Button now stays enabled and opens the Export_Dialog in both states (see Requirement 2). It also changes the editor-app Store and Persisted_Value shape by adding `verifiedAt`, the time the last Verify completed (see Requirement 12). The Engine and the Verifier are not changed. The Engine does not export `canExport`; it is defined in `packages/export`.

Product principles that bind this spec: principle 3 (nothing leaves the machine silently), principle 4 (red codes block export; overrides are printed), and principle 7 (the period look belongs to the Pane only).

## Glossary

- **Export_Package**: `packages/export`, published as `@reveal-codes/export`. Pure TypeScript for Node and the browser. It has no React, no DOM, and no `node:` import in `src`.
- **Document**: the Engine's immutable `Document`.
- **Blocking_Issue**: an element of `blockingIssues(document)`.
- **Gate**: the function `canExport(document): boolean` in the Export_Package.
- **Run_Log**: the app-side list of assistant run metadata defined by the editor-app spec. The Export_Package reads only `runId`, `provider`, and `modelId` from each entry, through its own structural type `RunInfo`.
- **Meta**: the object `{ now: Date, verifiedAt: string | null }` passed to `buildStatement`; `now` is the only clock the Export_Package reads, and `verifiedAt` is an ISO 8601 string or `null`.
- **verifiedAt**: the Web_App Store field holding the ISO 8601 time at which the last Verify completed, or `null` when no Verify has completed for the current Document.
- **Statement**: the plain-data value returned by `buildStatement`.
- **Statement_Text**: the numbered paragraphs, tables, and signature line rendered from a Statement in the wording of Requirement 4.
- **Appendix**: the Provenance Appendix, the two introductory sentences of Requirement 5 followed by `render(document, "full").text`.
- **Caption**: the first non-empty line of `document.text`, trimmed, cut to at most 120 characters; the string `"filing"` is not a Caption, and an empty Document has the Caption `""`.
- **Filing_Paragraphs**: the substrings of `document.text` separated by `\n`, in order, where an empty substring is an empty paragraph.
- **Export_Dialog**: the modal dialog opened by the Export_Button.
- **Export_Button**: the toolbar button of the editor-app spec.
- **Override_Dialog**: the existing modal dialog that collects an override reason.
- **Docx_Builder**: `buildDocx(document, statement): Promise<Uint8Array>` in the Export_Package, which uses the `docx` package and `Packer.toBuffer`.
- **Print_View**: the Next.js page at `/print`.
- **Persisted_Value**: the JSON value stored in `localStorage` under the Autosave_Key defined by the editor-app spec, extended by Requirement 12 with the field `verifiedAt`.
- **Demo_Document**: the gate-clear Document produced by the Export_Package test support from `packages/engine/fixtures/demo-motion.txt`, the Verifier's `createFixtureFetch`, and the Engine. After Verify it holds 2 verified citations, 3 not found citations, and 1 mismatched quote, which are 4 Blocking_Issues. The fixture builder overrides all four with four distinct reasons, so `canExport` is `true`. It also holds one assistant run.
- **Web_App**: `apps/web`.

## Requirements

### Requirement 1: Export gate

**User Story:** As a pro se filer, I want export refused while any red code is unresolved, so that I cannot file a problem by accident.

#### Acceptance Criteria

1. THE Export_Package SHALL export a function `canExport(document)` that returns a boolean `true` if and only if `blockingIssues(document)` returns an array of length 0, and `false` otherwise.
2. WHEN `canExport(document)` is called, THE Export_Package SHALL leave the input `document` value unmodified and SHALL return the same result for the same `document` value on every call.
3. THE Export_Package SHALL NOT modify the behavior of `blockingIssues`, `issues`, or any other Engine function.
4. THE Export_Package SHALL export `buildStatement` and `buildDocx` such that neither function calls `canExport` or `blockingIssues`, so that the Web_App is the only place that applies the Gate.
5. IF `canExport(document)` returns `false`, THEN THE Web_App SHALL NOT call `buildDocx`, SHALL NOT start a DOCX download, and SHALL retain the document and all override reasons unchanged.
6. FOR ALL Documents, `canExport(document)` SHALL be `true` if and only if `blockingIssues(document)` is empty (Property 1, gate).

### Requirement 2: Export dialog

**User Story:** As a filer, I want one place that shows what blocks export and lets me fix or override each item, so that I can finish the filing without hunting.

#### Acceptance Criteria

1. THE Export_Button SHALL be enabled in every state and SHALL keep the labels "Export" and "Export (<n> blocking)" defined by Requirement 19 of the editor-app spec.
2. WHEN the user activates the Export_Button, THE Web_App SHALL open the Export_Dialog as a modal dialog that follows the focus rules of Requirement 18, criterion 9, of the editor-app spec.
3. WHILE `canExport(document)` is `false`, THE Export_Dialog SHALL list each Blocking_Issue in document order. Each entry SHALL show its code, its text, a "Go" button, and an "Override…" button. IF the text is longer than 80 characters, THEN THE Export_Dialog SHALL show its first 79 characters followed by "…", for a total of 80 characters. Otherwise it SHALL show the text unchanged.
4. WHEN the user activates "Go" on a listed Blocking_Issue, THE Web_App SHALL close the Export_Dialog, place the Editor cursor at the start of that issue, and move keyboard focus to the Editor.
5. WHEN the user activates "Override…" on a listed Blocking_Issue, THE Web_App SHALL open the Override_Dialog for that issue. WHEN the Override_Dialog closes, THE Web_App SHALL return keyboard focus to the "Override…" button that opened it, or to the Export_Dialog if that entry is no longer listed.
6. WHILE `canExport(document)` is `false`, THE Export_Dialog SHALL show "Download .docx" and "Open print view" as disabled buttons, labelled "Download .docx (<n> blocking)" and "Open print view (<n> blocking)", where <n> is the number of Blocking_Issues. Activating a disabled button SHALL have no effect.
7. WHILE `canExport(document)` is `true`, THE Export_Dialog SHALL show "Download .docx" and "Open print view" as enabled buttons labelled without a count.
8. WHEN the user activates "Open print view" while enabled, THE Web_App SHALL flush the Autosave and then open `/print` in a new browser tab.
9. THE Export_Dialog SHALL be a bordered box with text labels only and no icons, following the UI rules of `ui.md`, and SHALL replace the placeholder Export_Dialog of the editor-app spec.
10. WHILE the Export_Dialog is open, WHEN the set of Blocking_Issues changes (for example, after an override is saved), THE Export_Dialog SHALL update the list, the count <n>, and the enabled or disabled state of both export buttons within 100 milliseconds, without closing.
11. IF the Autosave flush fails or the browser blocks the new tab when the user activates "Open print view", THEN THE Web_App SHALL keep the Export_Dialog open, keep the document unchanged, and show a notice stating that the print view did not open.

### Requirement 3: Statement data

**User Story:** As a filer, I want the statement computed from the Document alone, so that every claim in it can be traced to a recorded fact.

#### Acceptance Criteria

1. THE Export_Package SHALL export the pure function `buildStatement(document, runLog, meta)` that returns a `Result` whose `Ok` value is a Statement and whose `Err` value is an Engine error.
2. THE Statement SHALL hold `aiUsed`, which is `true` exactly when at least one span of the Document has origin `AI` or `AI>HUM`, and `false` otherwise, including when the Document has zero spans.
3. THE Statement SHALL hold `tools`, a list of `{ provider, model }` pairs taken from the Run_Log entries whose `runId` appears in `document.runs`, with duplicate pairs (equal `provider` and equal `model`) removed and first-occurrence order kept; `model` is `null` when the entry has no model id.
4. IF a `runId` in `document.runs` has no Run_Log entry, THEN THE Statement SHALL omit that run from `tools`, and `buildStatement` SHALL still return an `Ok` value. Export SHALL never be refused because run metadata is missing.
5. THE Statement SHALL hold `characters`, the counts of UTF-16 code units of `document.text` covered by spans of origin `HUM`, `PST`, `AI`, and `AI>HUM`, each an integer from 0 to `document.text.length`.
6. THE Statement SHALL hold `sentences`, with `total` equal to the number of sentences the Engine's `segment` returns for the Document, and `byDominantOrigin` holding, for each of `HUM`, `PST`, `AI`, and `AI>HUM`, the integer count of those sentences whose dominant origin is that origin; the four counts SHALL sum to `total`, and an empty Document SHALL give `total` 0 and four counts of 0.
7. THE Statement SHALL hold `citations`, one `{ text, status, clusterId? }` entry for every `kind: "full"` citation record in document order, where `text` is the citation text, `status` is the Engine's verification status, and `clusterId` is present only when the status is `verified`.
8. THE Statement SHALL hold `quotes`, one `{ text, status, prefixLength? }` entry for every quote record in document order, where `status` is the Engine's quote check status and `prefixLength` is present only when the status is `mismatch`.
9. THE Statement SHALL hold `overrides`, one `{ code, text, reason, timestamp }` entry for every override that belongs to an issue of `issues(document)`, in issue order, and SHALL omit every override that belongs to no issue of `issues(document)`.
10. THE Statement SHALL hold `generatedAt`, the ISO 8601 string of `meta.now`, `verifiedAt`, equal to `meta.verifiedAt` (an ISO 8601 string or `null`), and `caption`, the Caption of the Document.
11. THE Export_Package SHALL read no clock, random source, or environment variable other than through `meta`, so that two calls with deeply equal arguments return deeply equal results.
12. IF `segment` returns an error, THEN `buildStatement` SHALL return that error as an `Err` value, SHALL NOT throw, and SHALL NOT modify the Document or the Run_Log.
13. FOR ALL Documents, the four `characters` counts SHALL sum to `document.text.length`, `aiUsed` SHALL match the origins of the spans, and every `kind: "full"` citation record and every quote record SHALL appear in the Statement exactly once with the status the Document holds (Property 2, statement data).

### Requirement 4: Statement text

**User Story:** As a court clerk or opposing party reading the filing, I want a plain, fixed statement of how the filing was prepared and checked, so that I can rely on its wording.

#### Acceptance Criteria

1. THE Export_Package SHALL export `renderStatement(statement)`, a pure function that returns the Statement_Text as a list of blocks, each a numbered paragraph, a table, or the signature line, and that returns the same list for equal `statement` values on every call.
2. THE Statement_Text SHALL consist of numbered paragraphs in the order defined in criteria 3 to 9, numbered consecutively from 1, and SHALL contain no sentence other than those defined in criteria 3 to 9.
3. THE Statement_Text SHALL begin paragraph 1 with the sentence "This filing was prepared with the drafting tool Reveal Codes, which records the origin of every character."
4. WHERE `statement.aiUsed` is `true`, THE Statement_Text SHALL give paragraph 2 as "Generative artificial intelligence was used in preparing this filing. Tools: <tools>. Text inserted by the tool accounts for <a> of <t> characters (<p>%); of that, <e> characters were subsequently edited by the author.", where `<tools>` lists each pair as "<provider>: <model>" (or "<provider>" when `model` is `null`) joined by ", " in the order of `statement.tools`, or reads "not recorded" when `tools` is empty (so that the paragraph reads "Tools: not recorded."), `<a>` is the `AI` count plus the `AI>HUM` count, `<t>` is the total of the four origin counts (`HUM`, `PST`, `AI`, `AI>HUM`), `<p>` is `<a>` divided by `<t>` times 100 rounded half up to one decimal place (and "0.0" when `<t>` is 0), and `<e>` is the `AI>HUM` count.
5. WHERE `statement.aiUsed` is `false`, THE Statement_Text SHALL give paragraph 2 as "No generative artificial intelligence was used in preparing this filing."
6. THE Statement_Text SHALL give paragraph 3 as "Every legal citation in this filing was checked against the CourtListener database on <date>. <v> resolved to a single reported decision, <n> could not be found, <m> matched more than one decision, and <u> were not checked.", where `<date>` is the ISO date part (`YYYY-MM-DD`) of `statement.verifiedAt` WHEN `statement.verifiedAt` is not `null`, and WHEN `statement.verifiedAt` is `null` the sentence reads "Every legal citation in this filing was checked against the CourtListener database on a date that was not recorded." followed by the rest of the paragraph unchanged, and where `<v>`, `<n>`, `<m>`, and `<u>` are the counts of `statement.citations` entries with status `verified`, `not_found`, `ambiguous`, and `unchecked` respectively, followed by a table with the columns citation, status, and cluster id and one row per entry of `statement.citations` in document order, showing an empty cluster id cell when the entry has no cluster.
7. THE Statement_Text SHALL give paragraph 4 as "Quotations attributed to a cited decision were compared with the text of that decision. <a> matched, <b> did not, <c> were not checked.", where `<a>`, `<b>`, and `<c>` are the counts of `statement.quotes` entries with status `QUO ✓`, `QUO ✘`, and `QUO …` respectively (use the Engine's actual quote status names if they differ), followed by a table with the columns quotation and status and one row per entry of `statement.quotes` in document order, where a quotation longer than 80 characters is cut to its first 80 characters and a quotation of 80 characters or fewer is shown whole.
8. WHERE `statement.overrides` is non-empty, THE Statement_Text SHALL give paragraph 5 as "The author chose to file despite the following unresolved items, for the reasons stated:" followed by one entry per override in the order of `statement.overrides`, each holding its code, text, reason, and timestamp.
9. THE Statement_Text SHALL give the final paragraph as "The author has read the filing in full and takes responsibility for its contents." followed by the signature line "/s/ ________________" and the signature date, which is pre-filled with the export date (the ISO date part of `statement.generatedAt`) and which the author may change in Word, numbering that final paragraph 6 WHERE `statement.overrides` is non-empty and 5 WHERE `statement.overrides` is empty.
10. THE Statement_Text SHALL write every date as ISO `YYYY-MM-DD`, taking the signature date from the date part of `statement.generatedAt` and the check date of paragraph 3 from the date part of `statement.verifiedAt`, and SHALL write every percentage to one decimal place.
11. THE Statement_Text SHALL contain only wording defined in criteria 3 to 9 and values taken from the Statement, and SHALL contain no promotional wording and no claim that cannot be derived from the Statement.
12. THE Export_Package SHALL be the only module that holds the wording of criteria 3 to 9, and the Docx_Builder and the Print_View SHALL both produce their statement content by rendering the blocks returned by `renderStatement`, so that the text of the two outputs is identical for the same `statement`.

### Requirement 5: Provenance appendix

**User Story:** As a supervising attorney or clinic, I want the full provenance record attached to the filing, so that the filing and its statement can be reproduced exactly.

#### Acceptance Criteria

1. THE Export_Package SHALL export `buildAppendix(document)`, a pure function that returns an Appendix consisting of, in order: the sentence "The following is the complete provenance record of this filing in Reveal Codes form.", the sentence "It can be re-read by the tool to reproduce the filing and its provenance record exactly.", and then the lines of `render(document, "full").text` split on `\n`.
2. THE Appendix SHALL contain the lines of `render(document, "full").text` unmodified, so that joining them with `\n` returns that text exactly, including empty lines, leading and trailing whitespace, and a document of zero characters (which yields the lines of its `[DOC]` header only).
3. WHEN `buildAppendix(document)` is called twice with deeply equal Documents, THE Export_Package SHALL return deeply equal Appendices and SHALL NOT modify the input Document, perform network access, or read the clock.
4. FOR ALL Documents, `parse` of the Appendix's full-form lines joined with `\n` SHALL return `Ok` with a Document whose `text`, `spans`, `citations`, `quotes`, `overrides`, and `runs` are deeply equal to those of the original (Property 3, appendix round trip).
5. IF re-parsing the Appendix's full-form lines returns `Err`, THEN THE Web_App SHALL treat it as an export failure, download nothing, and set the Notice of Requirement 7, criterion 4.

### Requirement 6: DOCX layout

**User Story:** As a filer, I want a Word file that looks like an ordinary court filing with the certification behind it, so that I can file it or hand it to a clerk.

#### Acceptance Criteria

1. THE Docx_Builder SHALL pin the `docx` package at an exact version (no range operators such as `^` or `~`) and SHALL produce the file with `Packer.toBuffer`.
2. THE Docx_Builder SHALL write the filing as exactly one docx paragraph for each of the Filing_Paragraphs, in the order given, in Times New Roman 12 pt, double spaced (line spacing of 480 twentieths of a point, i.e. 2.0 lines), left aligned, with 1-inch (1440 twips) margins on the top, bottom, left, and right of every page.
3. WHEN a Filing_Paragraph is empty, THE Docx_Builder SHALL write it as one empty docx paragraph containing zero text runs with characters, so that the number of docx paragraphs in the filing part equals the number of Filing_Paragraphs.
4. THE Docx_Builder SHALL insert exactly one page break immediately after the last Filing_Paragraph and exactly one page break immediately after the last element of the Statement_Text.
5. THE Docx_Builder SHALL write the Statement_Text in Times New Roman 12 pt, single spaced (line spacing of 240 twentieths of a point, i.e. 1.0 line), with bold headings, and with every table having a single-line border (style "single") on all four outer edges and on all inner horizontal and vertical edges.
6. THE Docx_Builder SHALL write the Appendix in Courier New 9 pt, single spaced, with exactly one docx paragraph per line of the Appendix, preserving every leading and trailing space character of each line.
7. THE Docx_Builder SHALL set the document title property to the Caption and the creator property to "Reveal Codes".
8. IF the Caption is an empty string, THEN THE Docx_Builder SHALL set the document title property to an empty string and SHALL still produce a valid file.
9. THE Docx_Builder SHALL produce no body content other than the filing part, the Statement_Text, the Appendix, and the two page breaks.
10. FOR ALL Documents, unzipping the Docx_Builder output and reading `word/document.xml` SHALL yield the text of every Filing_Paragraph in order, then the first sentence of the Statement_Text, then the first sentence of the Appendix, in that order (Property 4, docx content).

### Requirement 7: Download

**User Story:** As a filer, I want one click to get the file, so that I can leave with the filing in under a minute.

#### Acceptance Criteria

1. THE Export_Package SHALL export `exportFileName(caption, now)`, which returns `<slug>-<YYYY-MM-DD>.docx`, where the date is the UTC calendar date of `now`, and the slug is built in this order: the Caption lowercased, each run of one or more characters other than `a-z` and `0-9` replaced by one `-`, leading and trailing `-` removed, cut to at most 60 characters, trailing `-` removed again after the cut, and replaced by `filing` when the result is empty.
2. WHEN the user activates the enabled "Download .docx" button, THE Web_App SHALL call `buildStatement` and `buildDocx` in the browser with the current Document, the Run_Log, and Meta (the injected `now` and the Store's `verifiedAt`), create an object URL for the result, and start the download by clicking an anchor with the file name of criterion 1.
3. WHEN the anchor click of criterion 2 has been dispatched, THE Web_App SHALL revoke the object URL and set a Notice reading "Exported <file name>."
4. IF `buildStatement` returns an `Err` value, `buildDocx` rejects, or object URL creation fails, THEN THE Web_App SHALL download nothing, revoke any object URL already created, leave the Document and Run_Log unchanged, and set a Notice reading "Export failed. Your document is unchanged."
5. IF the `docx` package cannot be bundled by the webpack configuration of the Web_App, THEN THE Web_App SHALL instead provide `POST /api/export` that receives `{ "codes": <string>, "runLog": <array> }`, parses `codes` with the Engine's `parse`, builds the file with the Export_Package, and returns it with `Cache-Control: no-store`, and the design SHALL record which path was taken.
6. IF the request body of `POST /api/export` is not valid JSON of the shape in criterion 5, or the Engine's `parse` returns an `Err` value, THEN THE Web_App SHALL return an error response containing no file, and the browser SHALL download nothing and set the Notice of criterion 4.
7. THE Web_App SHALL read no CourtListener token, environment variable, or network resource during export, except the single `POST /api/export` request of criterion 5 when that path is taken.

### Requirement 8: Print view

**User Story:** As a filer without Word, I want to print or save a PDF of the same three parts, so that I can file on paper or electronically.

#### Acceptance Criteria

1. WHEN the Print_View loads, THE Print_View SHALL read the Persisted_Value from `localStorage`, parse `codes` with the Engine's `parse`, and WHEN `canExport` is `true` for the parsed Document render the Filing_Paragraphs, the Statement_Text, and the Appendix, in that order, from `buildStatement` (called with `{ now, verifiedAt }`, where `verifiedAt` is read from the Persisted_Value), `renderStatement`, and `buildAppendix`.
2. WHEN the Print_View renders a filing, THE Print_View SHALL start the Statement_Text on a new printed page and the Appendix on a new printed page, through a print stylesheet that uses `@media print` page breaks, so that the filing, the Statement_Text, and the Appendix each begin on their own page.
3. THE Print_View SHALL use the editor serif font for the Filing_Paragraphs and the Statement_Text, and a monospace font for the Appendix.
4. WHEN the Print_View renders a filing, THE Print_View SHALL show a button labelled "Print" that calls `window.print()` once per activation.
5. WHILE the browser is printing, THE Print_View SHALL hide the "Print" button and every other interactive control, so that the printed output contains only the Filing_Paragraphs, the Statement_Text, and the Appendix.
6. IF the Persisted_Value is absent, THEN THE Print_View SHALL render no filing and SHALL show the text "Nothing to print. Open the editor and resolve the blocking items first."
7. IF the Persisted_Value is present and `canExport` is `false` for its parsed Document, THEN THE Print_View SHALL render only the sentence "This filing cannot be exported: <n> unresolved items remain." (where <n> is the number of Blocking_Issues) followed by the list of Blocking_Issues in document order, each showing its code and its text, and SHALL render no filing text, no Statement_Text, no Appendix, and no "Print" button.
8. IF reading `localStorage` throws, the Persisted_Value is not valid JSON, the Persisted_Value does not have the shape defined by the editor-app spec, or `parse` returns an error, THEN THE Print_View SHALL render no filing and SHALL show the text "The saved document could not be read."
9. THE Print_View SHALL follow `ui.md`: no component library, one CSS module, text labels only, and no exclamation marks in any text it displays.

### Requirement 9: Privacy

**User Story:** As a filer, I want to know that exporting sends nothing anywhere, so that I can export a sensitive draft.

#### Acceptance Criteria

1. THE Export_Package SHALL contain no call to `fetch`, no call to `XMLHttpRequest`, no call to `WebSocket`, no call to `navigator.sendBeacon`, no import of a network module, and no import from `node:`, `react`, or the DOM.
2. WHEN the user exports to DOCX, THE Web_App SHALL send zero network requests during the interval from the export action starting until the file download is handed to the browser, except the single `POST /api/export` request recorded in Requirement 7, criterion 7, when the fallback path of Requirement 7, criterion 5 is taken.
3. WHEN the user prints or exports to PDF, THE Web_App SHALL send zero network requests during the interval from the print action starting until the print dialog closes.
4. IF export or print fails, THEN THE Web_App SHALL show a notice indicating the failure, send zero network requests carrying any part of the Document or the Statement, and leave the Document unchanged.
5. THE README section "What leaves your machine" SHALL contain exactly one added line stating that exporting and printing send nothing.

### Requirement 10: Package, fixtures, and tests

**User Story:** As a maintainer, I want the package to be tested in isolation on real data, so that the certification can be trusted.

#### Acceptance Criteria

1. THE Export_Package SHALL declare `@reveal-codes/engine` as its only runtime workspace dependency and the `docx` package as its only other runtime dependency, and SHALL declare `fflate`, `fast-check`, and `@reveal-codes/verifier` as development dependencies, where every external version string is an exact version with no range operator (`^`, `~`, `>`, `<`, `*`, or `x`).
2. THE root `vitest.config.ts` SHALL define a Node-environment project named `export` whose root is `packages/export` and whose test include pattern is `test/**/*.test.ts`.
3. THE Export_Package test support SHALL build the Demo_Document from `packages/engine/fixtures/demo-motion.txt`, the Verifier's `createFixtureFetch`, and the Engine, SHALL make 0 network requests, so that every lookup is served from recorded fixtures, and SHALL override all four Blocking_Issues of the verified document with four distinct reasons, so that the Demo_Document has 2 verified citations, 3 not found citations, 1 mismatched quote, 4 overrides, one assistant run, and `canExport` equal to `true`.
4. THE Export_Package SHALL define a hook file `.kiro/hooks/export-tests-on-save.json` that runs the `export` project in single-run mode (not watch mode) when a file matching `packages/export/(src|test)/.*\.ts$` is saved, with a timeout value equal to the timeout value used by the other hook files in `.kiro/hooks/`.
5. THE Export_Package tests SHALL contain exactly four properties, each one a single `fc.assert(fc.property(...))` in a file named `<module>.properties.test.ts`, preceded by the comment `// Property N` and inside a `describe` whose title ends in `_Requirements: x.y_`: Property 1 (Requirement 1, criterion 6), Property 2 (Requirement 3, criterion 13), Property 3 (Requirement 5, criterion 4), and Property 4 (Requirement 6, criterion 10).
6. THE Export_Package tests for Properties 1, 2, and 3 SHALL run `fc.assert` with a `numRuns` of at least 200 locally and 500 in CI, and each property SHALL assert a relationship between its generated input and the output, not merely that the function does not throw.
7. THE test for Property 4 SHALL unzip the output with `fflate` and SHALL run `fc.assert` with `numRuns` of 50, with a comment stating that the count is low because packing a docx file is slow.
8. THE Export_Package tests SHALL include example tests that assert string equality with the expected text for: the Statement_Text criteria 3 to 9 on the Demo_Document (whose Statement SHALL list 2 verified citations, 3 not found citations, 1 mismatched quote, and 4 overrides, with paragraph 5 holding four entries) and on a Document with no AI text and no overrides; paragraph 2 reading "Tools: not recorded." for a Document with AI spans and an empty Run_Log; paragraph 3 with a `verifiedAt` date and with `verifiedAt` null; `exportFileName`; the Print_View states of Requirement 8, criteria 6 to 8, including the exact blocked text "This filing cannot be exported: <n> unresolved items remain." with the list of Blocking_Issues and with no filing text, statement, or Print button; and the Export_Dialog states of Requirement 2.
9. THE Export_Package SHALL keep every module at 300 lines or fewer and every function at 40 lines or fewer.

### Requirement 11: Documentation

**User Story:** As a judge reading the repository, I want the certification described and the Kiro usage recorded, so that I can see what was built and how.

#### Acceptance Criteria

1. THE README SHALL contain exactly one section with the heading "Export and certification", and that section SHALL describe each of the six certification statement paragraphs in the order the export prints them, with at least one sentence per paragraph.
2. THE README section "Export and certification" SHALL state that an override reason is printed in the certification for each red code the author overrides.
3. THE file `docs/KIRO_USAGE.md` SHALL contain one new row naming this spec and one new row naming the `export-tests-on-save` hook, and each row SHALL give the file path of the spec directory or hook file it describes.
4. THE file `BUILD_LOG.md` SHALL contain one new dated entry (date in YYYY-MM-DD form) for this spec that records at least one thing Kiro got wrong and the change that fixed it; IF Kiro got nothing wrong during this spec, THEN THE entry SHALL say so explicitly.
5. THE file `.env.example` SHALL be byte-for-byte identical before and after this spec is implemented.

### Requirement 12: Check date in the Web_App

**User Story:** As a filer, I want the certification to state the date my citations were last checked, so that the statement is true on the day I sign it.

#### Acceptance Criteria

1. THE Web_App Store SHALL hold the field `verifiedAt`, an ISO 8601 string or `null`, beside `runLog`, with the initial value `null`.
2. WHEN a Verify completes, THE Web_App SHALL set `verifiedAt` to the ISO 8601 string of the injected clock time of that completion, through one new Store action `{ type: "verified"; at: string }` dispatched once per completed Verify, after the existing `verification` and `quoteCheck` actions of that Verify.
3. WHEN the Store handles a `replace` action (the action used by New and by loading a Persisted_Value), THE Web_App SHALL set `verifiedAt` to the optional `verifiedAt` carried by that action, or to `null` when the action carries none, so that New clears `verifiedAt`.
4. THE Web_App SHALL write `verifiedAt` into the Persisted_Value as the field `verifiedAt` (string or `null`) beside `runLog`, in every Autosave write. This changes the Persisted_Value shape defined by the editor-app spec.
5. WHEN the Web_App loads a Persisted_Value that has no `verifiedAt` field, THE Web_App SHALL accept it and SHALL load it with `verifiedAt` equal to `null`.
6. IF a Persisted_Value holds a `verifiedAt` that is neither `null` nor a string, THEN THE Web_App SHALL treat the Persisted_Value as having the wrong shape, as in Requirement 8, criterion 8.
7. THE Web_App SHALL NOT clear `verifiedAt` on an edit, an undo, a redo, or an override; the Engine continues to mark changed citations `unchecked`, and Requirement 4, criterion 6 reports counts from the Document.

### Requirement 13: Editor-app tests and design note

**User Story:** As a maintainer, I want the editor-app tests to match the new Export_Button behavior, so that the test suite stays truthful.

#### Acceptance Criteria

1. WHEN this spec is implemented, THE Web_App tests that assert the previous behavior of the Export_Button (disabled while blocking, placeholder Export_Dialog) or the previous Persisted_Value shape and Store state SHALL be updated to the behavior of Requirements 2 and 12, and `pnpm test` SHALL pass.
2. THE design phase of this spec SHALL add a revision note to the editor-app `design.md` stating that Requirement 19 and the Export_Dialog definition were changed by this spec, that the Export_Button is always enabled, and that `verifiedAt` was added to the Store and the Persisted_Value.

## Known limitations

Standing rule (carried over from the earlier specs, user decision): anything that affects only malformed input or a rare citation or editing style is recorded here as one line, with no spec change and no stop.

- L1. A Persisted_Value that was edited by hand or corrupted shows the single message of Requirement 8, criterion 8, with no detail about the fault.
- L2. A Document whose assistant run was undone has spans but no `document.runs` entry, so its tools are listed as "not recorded" even when the Run_Log still holds the entry.
- L3. The Appendix round trip covers the Document, not the Run_Log; provider and model names are not in the Appendix, so a Document re-read from the Appendix alone lists no tools. Tool names come from the app's Run_Log, not from the Appendix.

