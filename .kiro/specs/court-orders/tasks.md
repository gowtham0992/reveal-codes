# Implementation Plan: court-orders

## Overview

The author names the court or judge a filing goes to. The Statement then cites that instrument and carries its required elements, and the export refuses to proceed under a prohibition while AI-origin text remains. With no selection, every output stays byte for byte what it is today.

Implementation is TypeScript throughout, as the design uses TypeScript. The tasks follow the four groups of the design's build order:

1. Group 1: dataset, validation, selection model and persistence.
2. Group 2: Statement changes, wording, Property 1, the prohibition gate, Property 2.
3. Group 3: picker, confidentiality checkbox, blocked state, print view, first-page header.
4. Group 4: demo motion court, `STATEMENT_TITLES`, Sentinel changes and proof tests, documentation and steering.

All commands run from the repository root. Property tests live in `<module>.properties.test.ts` with `// Property N` above the single `fc.assert`, `_Requirements: x.y_` in the describe title, and `numRuns` of 200 locally and 500 in CI (the shared `runs()` helper).

## Tasks

- [x] 1. Group 1: dataset, validation, selection model and persistence
  - [x] 1.1 Format the dataset and widen the export project settings
    - Parse `data/standing-orders.json`, run `pnpm exec prettier --write data/standing-orders.json`, parse again, and confirm the two values are deeply equal (whitespace only, no fact changes); `pnpm exec prettier --check data` must then pass
    - Change `packages/export/tsconfig.json` as the design specifies: `rootDir` `../..`, `include` `["src", "../../data/standing-orders.json"]`, `types: []`, reference to `../engine`
    - Run `pnpm typecheck` once to settle the JSON import path; if widening `rootDir` breaks declaration layout for `apps/web` or `crew/sentinel`, apply the design's fallback (`declarationDir: "dist"`) and note it in `BUILD_LOG.md` later
    - _Requirements: 1.1, 1.12_

  - [x] 1.2 Implement the Orders_Module
    - Create `packages/export/src/orders-types.ts` (vocabulary lists, unions, `OrderEntry`, `OrderSet`, `OrderContext`, court, judge and caption types)
    - Create `packages/export/src/orders-parse.ts` (root shape, `version`, entry fields and types) and `packages/export/src/orders-check.ts` (vocabulary membership, ids, references, calendar dates with a days-in-month table, hand-written `hostOf` URL check, `key_language` length), running check by check in file order (D1 to D6)
    - Create `packages/export/src/orders.ts` with `loadOrders`, `ORDERS` (throws at module load only if the shipped file is invalid), `selectableOrders`, `orderById`, `judgeSurname` and `statementTitles(orders, standardTitle)`
    - Export the new types and values from `packages/export/src/index.ts` (`ORDERS`, `loadOrders`, `selectableOrders`, `orderById`, `judgeSurname`, `OrderEntry`, `OrderSet`, `OrderContext`, `OrderGroup`, `OrderKind`, `OrderElement`)
    - No `node:` imports, no DOM, no `any`, named exports only, functions under 40 lines, modules under 300
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 2.7, 2.8, 11.2, 11.4, 11.5_

  - [x] 1.3 Write the Orders_Module example tests
    - Create `packages/export/test/orders.test.ts`: the shipped file loads `ok` and `ORDERS` equals its entries in order
    - Add the mutation table: version, one missing field per required field, one unknown vocabulary word per vocabulary field (including a word the file lists but the code does not), duplicate and non-kebab ids, dangling `supersedes` and `superseded_by`, the date table (leap years, month lengths, bad format), the URL table (`http:`, bare `uscourts.gov`, userinfo, port, `edrm.net`), and `key_language` lengths 0, 1, 400 and 401; each row expects `err` naming the mutated field
    - Add the two-failure fixtures of D1 (a bad `date` in entry 1 and a bad `kind` in entry 2 reports `kind`) and malformed roots (`null`, array, missing `entries`)
    - Add `selectableOrders` cases on the shipped file and on synthetic sets (ties, accented surnames, two court-wide entries, a later entry of an earlier court) and `judgeSurname`
    - No `try/catch`, no snapshots
    - _Requirements: 1.1 to 1.12, 2.7, 2.8, 9.1, 9.2, 9.3, 9.11_

  - [x] 1.4 Implement the Selection_Store and the UI copy functions
    - Create `apps/web/src/order-selection.ts`: `ORDER_KEY` (`reveal-codes:order:v1`), `OrderSelection`, `readOrderSelection`, `writeOrderSelection`, `createOrderSelectionStore` (localStorage authoritative, memory used only after a failed write, D16); use the injected `StorageLike` from `autosave.ts` and read no global
    - Create `apps/web/src/order-copy.ts`: `NO_ORDER_LABEL`, `optionText`, `kindWords` (typed `Record<OrderKind, string>`), `appliesWords`, `summaryLine`, `CONFIDENTIALITY_LABEL`, `CONFIDENTIALITY_REQUIRED`, `quoted`
    - Leave `store.ts`, `history.ts`, `persist.ts` and the autosave Persisted_Value unchanged
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 3.5, 3.9, 3.10, 6.1_

  - [x] 1.5 Write the Selection_Store and copy tests
    - Create `apps/web/test/order-selection.test.ts`: write then read for `null` and every selectable entry with working storage and with write-failing storage; the table of stored values (missing, invalid JSON, other version, non-string id, unknown id, `ndtex-starr-2023` superseded, throwing `getItem`) all reading `null`; the autosave key is unchanged by a selection
    - Create `apps/web/test/order-copy.test.ts`: `optionText` for every selectable entry against a template written in the test; `kindWords` over `ORDER_KINDS`; `appliesWords` over `APPLIES_TO`; `summaryLine` and `quoted`
    - _Requirements: 2.2 to 2.6, 2.9, 3.5, 3.9, 3.10, 9.3_

- [ ] 2. Group 2: Statement changes, wording, Property 1, prohibition gate, Property 2
  - [x] 2.1 Add the Statement data fields and the paragraph-range computation
    - In `packages/export/src/types.ts` add `StatementOrder` (including `elements`, D7) and the Statement fields `order`, `aiRanges`, `runCount`, `confidentialityCertified`
    - Export `isAiSpan` from `packages/export/src/statement-parts.ts` and make `usedAi` use it
    - Create `packages/export/src/ai-paragraphs.ts` with `ParagraphRange`, `aiParagraphRanges` (reads only `document.spans` and `document.text`, overlap test excludes the terminating `\n`, D18) and `formatRanges` (`27`, `12–14` with an en dash, `, ` separator)
    - _Requirements: 4.2, 4.11, 4.21, 4.22, 8.1_

  - [x] 2.2 Write the paragraph-range tests
    - Create `packages/export/test/ai-paragraphs.test.ts`: a table of Documents with expected ranges (one paragraph, a span over three paragraphs, adjacent spans, a span on `\n` only, an empty paragraph inside a span, a span ending at the last character) and a `formatRanges` table (`27`, `12–14`, `12–13`, `3, 7–8, 20`, empty)
    - Assert no formatted range contains the word "lines"
    - _Requirements: 4.11, 4.22, 9.12_

  - [x] 2.3 Add the court-orders wording to `wording.ts`
    - Add constants `NO_PROGRAM_SENTENCE`, `CONFIDENTIALITY_SENTENCE`, `ALL_DRAFTERS_SUFFIX` and functions `citingSentence` (with the separate-declaration clause replacing the full stop, D10), `toolsSentence` (including the "not recorded" case), `portionsSentence`, `howUsedSentence`, `promptRecordsSentence`, `headerPointer`, `prohibitionLine` (including the `between paragraphs` form, D18)
    - Update the header comment of `wording.ts`; no exclamation marks; if the file would pass 300 lines or a function 40, move the block to `wording-orders.ts` and change the wording scan per D12
    - _Requirements: 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.14, 4.15, 4.16, 4.17, 4.20, 5.5, 7.3_

  - [x] 2.4 Implement the order rules and the render helpers
    - Create `packages/export/src/order-rules.ts` with `aiSpanCount`, `needsConfidentiality` and `prohibitionNotice`
    - Create `packages/export/src/statement-order.ts` with `orderOf`, `statementTitle` and `firstPageHeading` (`FirstPageHeading` type)
    - Create `packages/export/src/render-order.ts` with `citingParagraph`, `orderSentences` (in the design's order, appended to the paragraph that already covers the topic) and `signatureLine`
    - _Requirements: 4.2, 4.5 to 4.19, 5.5, 6.1, 7.1, 7.3, 7.5_

  - [x] 2.5 Wire the Statement builder and renderer
    - Add the optional fourth parameter `orderContext = null` to `buildStatement` in `packages/export/src/statement.ts` and fill `order`, `aiRanges`, `runCount` (`runLog.length`, D8) and `confidentialityCertified`
    - Update `packages/export/src/render-statement.ts`: title via `statementTitle`, paragraph 1 and the numbering shift only when `order !== null`, order sentences in the AI and no-AI paragraphs, `signatureLine`; with `order === null` the blocks must equal today's blocks
    - Add the four new fields to the `base()` literal in `packages/export/test/render-statement.test.ts` (`order: null`, `aiRanges: []`, `runCount: 0`, `confidentialityCertified: false`) without changing its expectations
    - Export from `packages/export/src/index.ts`: `StatementOrder`, `ParagraphRange`, `ProhibitionNotice`, `FirstPageHeading`, `prohibitionNotice`, `needsConfidentiality`, `firstPageHeading`
    - _Requirements: 4.1 to 4.4, 4.13, 4.18, 4.19, 4.21, 4.23, 8.1, 8.2_

  - [x] 2.6 Add the prohibition rule to the Gate and update every `canExport` caller
    - Change `canExport(document, order)` in `packages/export/src/gate.ts` (required second parameter; `false` for `kind === "prohibition"` with an AI-origin span, else `blockingIssues(document).length === 0`), using `usedAi` from `statement-parts.ts`
    - Update every caller to pass the argument: `packages/export/test/gate.test.ts` (four calls, add `, null`), `packages/export/test/gate.properties.test.ts` (two calls, add `, null`), `apps/web/src/client/export-docx.ts`, `apps/web/src/print-model.ts` and `apps/web/src/components/export-dialog.tsx` (pass `null` for now; Group 3 replaces these with the real entry)
    - Leave the planted `canExport(d);` source string in `boundaries.test.ts` unchanged
    - Search `apps`, `packages`, `crew` and `docs` for `canExport(` and confirm no call is left with one argument; run `pnpm typecheck`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.9, 5.10, 5.12_

  - [x] 2.7 Add the order test arbitraries
    - Create `packages/export/test/support/arbitraries.ts` additions (file under `test/support/`): `arbSelectableEntry`, `arbAnyEntry`, `arbOrderContext`, `arbGateClearAiDocument` (reusing `arbDocument` and `arbGateClearDocument`; half the cases append an AI-origin sentence through the Engine's `apply`, kept only if no Blocking_Issue results); built from fast-check combinators over `ORDERS`, so shrinking works
    - Give `buildDemoDocumentStatement` in `packages/export/test/support/demo-statement.ts` an optional `orderContext: OrderContext = null` parameter passed to `buildStatement`
    - If an arbitrary is useful to the Engine as well, add it to `packages/engine/src/testing/arbitraries.ts` instead
    - _Requirements: 10.4_

  - [~] 2.8 Write Property 1: order citation is total
    - Create `packages/export/test/order-citation.properties.test.ts` with one `fc.assert(fc.property(...))` over `arbExportCase` and `arbOrderContext`
    - **Property 1: Order citation is total**
    - Assert that the joined text of `renderStatement` and paragraph 1 contain `instrument`, `court.name` and `source_url`, and that the title block equals `caption.text` for `statement_title` and `separate_declaration` and the Standard_Title otherwise
    - Add `// Property 1` and `// Feature: court-orders, Property 1: Order citation is total` above the assert; `_Requirements: 4.5, 4.6, 4.7, 10.2_` in the describe title; `{ numRuns: runs() }`
    - **Validates: Requirements 4.5, 4.6, 4.7, 10.2**

  - [~] 2.9 Write Property 2: gate
    - Create `packages/export/test/order-gate.properties.test.ts` with one `fc.assert(fc.property(...))` over `arbGateClearAiDocument` and `arbAnyEntry`
    - **Property 2: Gate**
    - Assert `canExport(document, entry)` equals `!(entry.kind === "prohibition" && hasAiOrigin(document))`, with `hasAiOrigin` written in the test as `document.spans.some(s => s.provenance.origin === "AI" || s.provenance.origin === "AI>HUM")`
    - Add `// Property 2` and `// Feature: court-orders, Property 2: Gate` above the assert; `_Requirements: 5.2, 5.3, 5.4, 5.12, 10.3_` in the describe title; `{ numRuns: runs() }`
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.12, 10.3**

  - [~] 2.10 Update the property-file table in `boundaries.test.ts`
    - In `packages/export/test/static/boundaries.test.ts` change `PROPERTY_FILES` to rows of `{ spec, file, number }`: the four export-certification files and `order-citation.properties.test.ts` (1) and `order-gate.properties.test.ts` (2)
    - Change the message "not one of the four known files" to "not one of the known files"; assert the comment numbers per spec (`[1, 2, 3, 4]` for export-certification, `[1, 2]` for court-orders); keep the one-comment-one-assert rule
    - _Requirements: 10.1, 11.2_

  - [~] 2.11 Write the Statement, gate and null-order example tests
    - Create `packages/export/test/statement-orders.test.ts`: `order` for every entry against an expected object built in the test; paragraph-number shift (every entry has one more paragraph than `order === null`); exact citing sentences for `edtex-love-2025`, `ndtex-lr-7-2-f` and `dhaw-go-23-1` (no doubled full stop); `ndtex-lr-7-2-f` with AI (Standard_Title); `edtex-love-2025` (title "Certificate of Generative Artificial Intelligence Usage", tool sentence; tool lists of none, one, two, and a `null` model); `dcolo-wang-2025` with no AI (no-AI sentence and "(all contributors to the drafting)"); each element sentence with run counts 0, 1 and 3; `cit-choe-groves-2025` with the tick on and off; entries with only `accuracy_certification`, `citations_verified` or `human_review` keep the verification sentences and gain none; the sentence `The text drafted with the program appears at paragraphs 12–14 of the filing.`; no "lines" in any range text; JSON round trip of the Statement for every entry; `renderStatement` of a structured clone equals the original; `exportFileName` equal for every entry; determinism of `buildStatement`
    - Create `packages/export/test/null-order.test.ts`: `renderStatement` of the Demo_Document Statement built with the default argument and with `null` equals the existing expected blocks of `render-statement.test.ts`
    - Create `packages/export/test/order-rules.test.ts` and `packages/export/test/gate-orders.test.ts`: `prohibitionNotice` for a Judge_Entry and a synthetic Court_Wide_Entry with 1 and 2 spans, `needsConfidentiality` truth table, `sdohio-newman` on the Demo_Document (`canExport` false), still false after an edit beyond the relabel threshold makes the span `AI>HUM`, true only after the AI text is deleted
    - _Requirements: 4.1 to 4.23, 5.2, 5.5, 5.9, 5.10, 5.12, 8.1, 8.2, 9.4, 9.5, 9.6, 9.7, 9.9, 9.10, 9.11, 9.12_

- [ ] 3. Group 3: picker, confidentiality checkbox, blocked state, print view, first-page header
  - [-] 3.1 Add the first-page header to the DOCX builder
    - In `packages/export/src/docx-blocks.ts` add `headerElements(h)` (bold, centred, 12 pt heading paragraph; 12 pt pointer paragraph via `singleParagraph`)
    - In `packages/export/src/docx.ts` add `headerOptions(heading)` so that a non-null `firstPageHeading(statement)` adds `titlePage: true` and `headers: { first: new Header(...) }`, and `null` keeps today's options; add nothing to the body paragraphs
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [~] 3.2 Write the DOCX header tests
    - Create `packages/export/test/docx-orders.test.ts`: with `ndtex-lr-7-2-f` and AI used the unzipped file holds `word/header1.xml`, `w:titlePg` in `word/document.xml`, a first paragraph that is bold, centred and size 24, and the pointer sentence; the body paragraph list from the existing docx text reader equals the one without the heading
    - With AI not used, with another placement, and with `order === null`, there is no `header1.xml` and no `w:titlePg`
    - _Requirements: 7.1 to 7.5, 9.4_

  - [-] 3.3 Build the picker, the confidentiality checkbox and the order-gate hook
    - Create `apps/web/src/components/order-picker.tsx` (`OrderPicker` with a labelled native select, first option `NO_ORDER_LABEL`, one `optgroup` per `selectableOrders(ORDERS)` group; `OrderSummary` with the summary line, the quoted `key_language` as text, and a "Source" link with `target="_blank"` and `rel="noreferrer"`) and `order-picker.module.css` using existing variables only (13px `var(--font-ui)`, 1px `var(--rule)` border, no radius, no shadow, 2px `var(--accent)` focus outline)
    - Create `apps/web/src/components/confidentiality-checkbox.tsx` (native checkbox in its label, text `CONFIDENTIALITY_LABEL`)
    - Create `apps/web/src/components/use-order-gate.ts` with `useOrderGate(document, orderStore)` returning `selection`, `entry`, `select`, `needsTick`, `ticked`, `setTicked`, `notice`, `clear` and `context`; the tick clears on selection change and when `needsTick` becomes false
    - Plain copy, no icons, no exclamation marks
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 11.1_

  - [~] 3.4 Wire the Export_Dialog, `use-export` and `exportDocx`
    - In `apps/web/src/components/export-dialog.tsx` add `orderStore` and `onDownload(context)` props; render `OrderPicker`, `OrderSummary`, the checkbox (when `needsTick`), the existing lead and `ExportIssues`, and the prohibition notice (`notice.line` plus the quoted `keyLanguage`) with no override control; split into `ExportActions` and `ExportOrder` so each function stays under 40 lines; buttons use `disabled={!gate.clear || busy}` and `disabled={!gate.clear}`; button labels and the toolbar count still use Blocking_Issues only
    - In `apps/web/src/components/use-export.tsx` create the store once with `createOrderSelectionStore(svc.storage, ORDERS)` and pass the dialog's context to the download flow
    - In `apps/web/src/client/export-docx.ts` add `orderContext` to `ExportDeps`; return `{ status: "blocked" }` when `!canExport(document, entry)` or when `needsConfidentiality` holds and the tick is missing; pass the context to `buildStatement`; leave `exportFileName` untouched
    - Replace the temporary `null` arguments from task 2.6; check and update any existing test that assumes the first focusable control is a button
    - _Requirements: 3.1, 3.13, 5.5, 5.6, 5.7, 5.8, 6.1 to 6.8, 8.2_

  - [~] 3.5 Wire the Print_View
    - In `apps/web/src/print-model.ts` change to `printModel(raw, now, order)`: call `canExport(document, order)` once; add the `prohibited` kind (`blocking`, `notice`) and keep the `blocked` shape; `ready` gains `heading` and `certifiedBlocks` (non-null only when `needsConfidentiality`)
    - In `apps/web/src/print-view.tsx` read the selection on mount through `createOrderSelectionStore(svc.storage, ORDERS).get()` and `orderById`, keep a `ticked` state that is false on every load and never stored; split `ReadyView` into smaller components
    - Create `apps/web/src/components/print-order.tsx` with `PrintHeader` (controls block hidden in `@media print`, holding the Print button, `OrderSummary` and the checkbox), `FirstPageBlock` (two lines, heading bold and centred, outside the controls block) and `ProhibitedView` (notice line, quoted key language, blocked list; no Statement_Text); show `CONFIDENTIALITY_REQUIRED` as one line until the box is ticked
    - Add `.firstPage { break-after: avoid; }` and `.firstPageHeading { font-weight: 700; text-align: center; }` to `print-view.module.css`
    - _Requirements: 3.12, 5.11, 6.8, 6.9, 6.10, 6.11, 7.6, 7.7_

  - [~] 3.6 Write the picker, dialog and export-flow tests
    - Create `apps/web/test/order-picker.test.tsx`: label and native select; first option; optgroups equal `selectableOrders(ORDERS)` with no non-current option; choosing an option updates the store; opening with a stored id and with an unknown id; Order_Summary lines and the Source link attributes; no summary without a selection
    - Create `apps/web/test/export-dialog-orders.test.tsx`: `sdohio-newman` with one AI span shows the prohibition line and quoted key language, both buttons disabled, no override control, Issues list and toolbar label unchanged; a synthetic Court_Wide_Entry shows the `<instrument> prohibits` form; "paragraphs" and never "lines"; `cit-choe-groves-2025` checkbox shown only with AI used, gates both buttons, reset on reopen and on selection change, not persisted; the downloaded Statement has the confidentiality sentence only when ticked
    - Create `apps/web/test/export-docx-orders.test.ts`: `exportDocx` returns `blocked` for a prohibition with AI text and for a missing tick, and passes the context to `buildStatement`
    - _Requirements: 3.1 to 3.11, 5.5 to 5.8, 6.1 to 6.7, 9.3, 9.7, 9.8, 9.12_

  - [~] 3.7 Write the print model and print view tests
    - Create `apps/web/test/print-model-orders.test.ts`: `ready` carries `heading` and `certifiedBlocks` as designed; `prohibited` for `sdohio-newman`; `blocked` keeps its existing shape; `order === null` gives today's model plus `heading: null` and `certifiedBlocks: null`
    - Create `apps/web/test/print-view-orders.test.tsx`: Order_Summary in the controls block; first-page block present with the class that carries `break-after: avoid` (also read `print-view.module.css`) and absent otherwise; the print checkbox unticked on every load, the one-line stand-in until ticked, then the same blocks as `buildStatement` with the tick; after ticking in the dialog and opening print, the only storage keys are the autosave key and the order key
    - _Requirements: 3.12, 5.11, 6.8 to 6.11, 7.6, 7.7, 9.8_

- [ ] 4. Group 4: demo motion court, `STATEMENT_TITLES`, Sentinel, documentation and steering
  - [-] 4.1 Add `STATEMENT_TITLES` and use it in the Sentinel splitter
    - In `packages/export/src/wording.ts` add `export const STATEMENT_TITLES = statementTitles(ORDERS, STATEMENT_TITLE);` and export it from `packages/export/src/index.ts`
    - In `crew/sentinel/src/split.ts` import `STATEMENT_TITLES` and find the first paragraph with `STATEMENT_TITLES.includes(p)`; change no other Sentinel source file and nothing in the Verifier
    - Create `packages/export/test/statement-titles.test.ts`: `STATEMENT_TITLES` holds `STATEMENT_TITLE` and the distinct `caption.text` of every dataset entry of any status with `statement_title` or `separate_declaration` placement (seven strings, in order, including the superseded entry's caption, without any first-page heading caption), and no other caption text; also check `statementTitles` on a synthetic set
    - Confirm `crew/sentinel/test/split.test.ts` and `static/package.test.ts` still pass
    - _Requirements: 9.13, 12.11, 12.14_

  - [~] 4.2 Move the demo motion to the Northern District of Texas
    - Change line 2 of `packages/engine/fixtures/demo-motion.txt` to `FOR THE NORTHERN DISTRICT OF TEXAS`; keep `3:26-cv-00000` and the fabricated citations and quote
    - Search `apps`, `packages`, `crew` and `docs` for literal Offsets and the old line before editing, and again after
    - In `packages/engine/test/demo.test.ts` add 8 to every literal Offset (D20) and add an assertion that line 2 is `FOR THE NORTHERN DISTRICT OF TEXAS` and that the `Case No. 3:26-cv-00000` line is present
    - In `packages/engine/fixtures/README.md` update the quoted offsets `1466`, `1696`, `2004`, `2117` to `1474`, `1704`, `2012`, `2125`
    - In `crew/sentinel/test/analyse.test.ts` (lines 62 and 70) quote the new line as the original and `FOR THE SOUTHERN DISTRICT OF TEXAS` as the edit; update any other test that quotes the old line
    - Leave `apps/web/scripts/copy-demo.ts` unchanged (it copies byte for byte)
    - Run the engine, verifier, export, web and sentinel test projects
    - _Requirements: 12.7, 12.8, 12.9_

  - [~] 4.3 Write the three Sentinel proof tests
    - Create `crew/sentinel/test/court-orders.test.ts`; each test builds the demo Document (one AI span) with `buildDemoDocumentStatement(orderContext)`, packs it with `buildDocx`, writes a temporary file, runs `run(["check", file], io)` with the `io` shape used in `sweep.test.ts` (no token, recorded fixtures, a `fetch` that rejects), and asserts exit code 0 and a report ending in `No drift.`
    - `ndtex-lr-7-2-f` (first-page header): also assert the zip holds `word/header1.xml`, so the test cannot pass because no header was written
    - `edtex-love-2025` (renamed title): the body is cut at the renamed title
    - `dhaw-go-23-1` (separate declaration): the body is cut at the declaration caption
    - Remove the temporary files afterwards; no `try/catch` that hides an error
    - _Requirements: 7.4, 9.11, 12.10, 12.11_

  - [~] 4.4 Update the sentinel-sweep spec
    - In `.kiro/specs/sentinel-sweep/requirements.md` change "the Statement_Title" to "any Statement_Title" in Requirement 3 criteria 4 and 5, and check the Statement_Title definition, Requirement 1 criterion 15 and Requirement 3 criteria 1 and 3 name `STATEMENT_TITLES`
    - In `.kiro/specs/sentinel-sweep/design.md` update D1 (`equal to STATEMENT_TITLE` becomes "equal to a member of `STATEMENT_TITLES`", and the emitted title wording), Property 1 (`buildStatement(d, [], meta, null)` and "a member of `STATEMENT_TITLES`"), and the `package.test.ts` line (exported names include `STATEMENT_TITLES`)
    - Locate lines by content; do not edit `.kiro/specs/sentinel-sweep/tasks.md`; call `validate_spec_format` on each edited spec file
    - _Requirements: 12.12_

  - [~] 4.5 Add the README section
    - Add "Court-specific certification" to `README.md`: what the Picker in the Export dialog does, three example courts (N.D. Tex. first-page heading, E.D. Tex. Judge Love's certificate title, S.D. Ohio Judge Newman's prohibition), a link to `data/README.md`, and one sentence that the dataset is released under CC0
    - Plain copy, no exclamation marks
    - _Requirements: 12.1_

  - [~] 4.6 Add the `docs/KIRO_USAGE.md` rows
    - Add a `Spec` row for court-orders (`.config.kiro`, `requirements.md`, `design.md`, `tasks.md`, and `tasks.meta.json` if it exists) and a `Steering` row for the `structure.md` and `product.md` edits, with file paths
    - This feature adds no hook, agent or MCP tool, so there are no other rows; make sure the web `inventory.test.ts` still passes
    - _Requirements: 12.2_

  - [~] 4.7 Add the BUILD_LOG entry
    - Append a dated entry to `BUILD_LOG.md`: what was built, what Kiro got wrong and what fixed it, that the requirements pass found the Sentinel matched only the Standard_Title, the Offsets shift of D20, the Prettier pass of D19, and the `tsconfig` change (and fallback if used)
    - Append to the file; do not rewrite earlier entries
    - _Requirements: 12.3, 12.13_

  - [~] 4.8 Edit the steering files
    - In `.kiro/steering/structure.md` add `data/` to the repository layout: `standing-orders.json` (public, CC0, validated by `packages/export/src/orders.ts`) and `README.md`
    - In `.kiro/steering/product.md` add one unnumbered line under the principles: `The statement follows the selected court's instrument. The dataset behind it, data/standing-orders.json, is public and CC0.`
    - _Requirements: 12.4, 12.5_

- [~] 5. Final checkpoint
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm --filter @reveal-codes/web exec next build --webpack` (the build's `prebuild` refreshes `apps/web/public/demo-motion.txt`); fix every failure, and ask the user if questions arise
  - State in the final report that the browser check (Picker, prohibition block, confidentiality tick, print view, first-page header) is left to the user
  - _Requirements: 12.15_

## Notes

- Test sub-tasks are not marked optional here: Requirements 9 and 10 make them deliverables, and CI runs them.
- The tick is never persisted and never passed from the Export_Dialog to the Print_View.
- No task in this list adds a hook, agent or MCP tool, so the only `docs/KIRO_USAGE.md` change is the rows in task 4.6.
- Spec-phase note: the spec commit is titled `spec(court-orders): …` and includes `data/README.md` and `data/standing-orders.json` alongside `requirements.md`, `design.md` and `tasks.md`. The Prettier pass in task 1.1 is implementation work and is not part of that commit.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 3, "tasks": ["1.5", "2.2", "2.3"] },
    { "id": 4, "tasks": ["2.4"] },
    { "id": 5, "tasks": ["2.5", "2.6"] },
    { "id": 6, "tasks": ["2.7", "3.1", "3.3", "4.1"] },
    { "id": 7, "tasks": ["2.8", "2.9", "2.11", "3.2", "3.4", "3.5"] },
    { "id": 8, "tasks": ["2.10", "3.6", "3.7"] },
    { "id": 9, "tasks": ["4.2"] },
    { "id": 10, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] }
  ]
}
```
