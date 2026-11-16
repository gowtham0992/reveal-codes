# Implementation Plan: pasted-text-declaration

## Overview

The AI-Use and Verification Statement stops asserting what the record cannot show. The plan follows the design's build order: the `product.md` `[DOC]` line first, then Engine, Export, persistence, dialog and Print view, gates, Sentinel, samples and demo path, property tests, example tests, documentation, and a final checkpoint.

Implementation language: TypeScript 5.x strict (the design uses TypeScript throughout). Tests use vitest and fast-check.

Rules that apply to every task:

- `packages/engine` keeps zero runtime dependencies and no `node:` or DOM import. Functions stay under 40 lines, modules under 300, and no `any` is added (Requirement 14.4).
- Errors are values in the Engine and Export package. No `try/catch` hides an error in source or tests.
- Existing tests that break because a signature gained the Declaration are fixed in the task that changes the signature, not weakened.
- Nothing is committed or pushed by any task. The spec was committed before this task list.

Ordering note on the Sentinel: an older Sentinel cannot read a file that carries `d=` (design D11). The Sentinel reader (task 8.1) therefore lands before the task that makes the app write `d=` into an Appendix (task 7.1), and the dependency graph places it in an earlier wave. Release the Sentinel no later than the app.

## Tasks

- [x] 1. Edit the product.md `[DOC]` entry before any engine code
  - [x] 1.1 Replace the `[DOC]` line in `.kiro/steering/product.md` (the Structural codes list, line 88)
    - Current line: `` - `[DOC]`: document header carrying engine state. Present only in the full serialisation, never in the pane. ``
    - New line: `` - `[DOC]`: document header carrying engine state and, optionally, the author's Declaration about pasted text (see the pasted-text-declaration spec). Present only in the full serialisation, never in the pane. ``
    - Change nothing else in the file. The Codes list stays the same length and no code is added, renamed or restyled.
    - Do not touch any file under `packages/engine` in this task.
    - _Requirements: 8.11, 14.5_

- [x] 2. Engine: Declaration type, validation, predicates and the `[DOC]` field
  - [x] 2.1 Add `packages/engine/src/declaration.ts` and export it from `packages/engine/src/index.ts`
    - Types `DeclarationSubject`, `Declaration`, `ToolNameFault`; constants `TOOL_NAME_MIN` (2) and `TOOL_NAME_MAX` (100).
    - `checkToolName(raw)`: trim, then fault order `too_short`, `too_long`, `control_character` (`/[\p{Cc}\u2028\u2029]/u`), `unpaired_surrogate` (reuse `firstUnpairedSurrogate` from `validate.ts`). Returns the trimmed name in a `Result`.
    - `declareNone(subject)`, `declareAi(subject, rawToolName)` returning `Result<Declaration, ToolNameFault>`, and `isDeclaration(value: unknown)` narrowing (shape, known subject, known choice, trimmed and valid name).
    - `holdsSubstantivePasted(document)`: slice `document.text` by each `PST` span and test `/\P{White_Space}/u` (not `\s`).
    - `insertsPasted(operation)`: `insert` and `replace` with non-empty text and `PST` origin; `delete` is false; an Inverse is true when `restore.insertText` is non-empty and a `PST` span of `restore.spans` overlaps `[at, at + insertText.length)`.
    - _Requirements: 3.3, 3.4, 3.5, 3.7, 5.3, 5.7, 14.4_

  - [x] 2.2 Add the optional `d` field to `[DOC]` and the record codec
    - `codes/lex.ts`: add `"d"` to the `[DOC]` schema `optional` list (one occurrence). `required` stays `["v","n"]` and the version stays 1.
    - New `codes/doc-declaration.ts`: encode `d=<subject>,<choice>[,<toolName>]` with the existing `escapePayload`, and decode it.
    - `codes/decode-types.ts`, `codes/decode-fields.ts` (`readDeclaration`), `codes/decode.ts`: `DraftDocument` gains `declaration?: Declaration`. A second `d`, an unknown subject or choice, `declared_ai` with no name, `none` with a name, and an invalid name are `malformed_codes` at index 0 with rule `bad_field`.
    - `codes/render.ts`, `codes.ts`, `index.ts`: add `renderRecord(document, declaration, mode)` and `parseRecord(text)` returning `DocumentRecord = { document, declaration }`. Write `d` after `v` and `n` and before the `r` fields, in full mode only, only for a non-null Declaration. Display mode never carries it.
    - Keep `render(document, mode)` as `renderRecord(document, null, mode)` and `parse(text)` as `parseRecord(text)` with the Document only. A rendering with no Declaration is byte for byte the current output.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8, 8.9, 8.10, 14.4_

  - [x] 2.3 Add shared arbitraries in `packages/engine/src/testing/arb-declaration.ts` and re-export them from `packages/engine/src/testing/arbitraries.ts`
    - `arbToolName` (valid trimmed names of 2 to 100 code units, including `()[]{}"';=,\`, spaces, accents, CJK and an emoji pair), `arbBadToolName` (empty, one character, 101 characters, whitespace only, `\n`, `\r`, `\t`, U+0000, U+2028, lone surrogate), `arbDeclaration(subject?)`, `arbMixedOriginDocument` (all four origins, whitespace-only `PST` spans included), `arbOrderChoice` (`null` or an `OrderEntry` of each kind and of the two statement-requiring shapes, built on `packages/export/test/support/arbitraries.ts`), and `arbEditSequence` (edit, undo, redo steps).
    - If `arbOrderChoice` would make the engine import from the export package, place it in `packages/export/test/support/arbitraries.ts` instead and keep the other five in the engine.
    - _Requirements: 11.6_

  - [x] 2.4 Write example tests for the Engine pieces
    - `packages/engine/test/declaration.test.ts`: `checkToolName` at 1, 2, 100 and 101 characters after trimming, whitespace only, a line break, parentheses and brackets; `holdsSubstantivePasted` for whitespace-only versus substantive `PST` spans including U+0085 and U+FEFF; `insertsPasted` for each operation kind and for an Inverse that restores `PST` and one that restores `HUM`.
    - `packages/engine/test/doc-declaration.test.ts`: `[DOC]` lexing for a duplicate `d`, an unknown subject, `declared_ai` without a name, `none` with a name, and an old file with no `d` (parses with `declaration: null`); `renderRecord` with no Declaration equals `render(document, "full")`; display mode omits the Declaration.
    - _Requirements: 3.3, 3.4, 3.5, 8.3, 8.4, 8.8, 8.9, 8.10_

- [x] 3. Export package: subject, wording, statement, gate, appendix
  - [x] 3.1 Add `packages/export/src/declaration.ts`
    - `holdsAssistantText`, `orderRequiresStatement`, `declarationSubject`, `applicableDeclaration`, `declarationRequired`, and the single `usedAi(document, entry, stored)`, as defined in the design. Subject order: `pasted_text` when substantive pasted text, else `this_filing` when no assistant text and the order requires a statement, else `none`.
    - Export them from the package index. `isAiSpan` stays in `statement-parts.ts` for `aiPassages` only.
    - _Requirements: 4.8, 5.8, 5.9, 6.1_

  - [x] 3.2 Add `packages/export/src/declaration-wording.ts` and `packages/export/src/statement-error.ts`
    - Builders with the exact strings of the design: `subjectPhrase`, `choiceNoneLabel`, `choiceAiLabel`, `TOOL_NAME_LINE`, `requiredLine`, `typedOnlySentence`, `typedAndPastedSentence`, `pastedAfterAssistantSentence`, `NO_PROGRAM_RECORD` (the constant "The record shows that no generative artificial intelligence program was used in the editor."), `declarationNone`, `declarationAi` (both subjects), `portionsDeclared`, `programWithAuthor` (with the "is not recorded" variant), `programAsNamed`, `howUsedDeclared`, `promptRecordsDeclared`, `prohibitionDeclaredLine`.
    - `StatementError = EngineError | { kind: "declaration_required"; subject } | { kind: "invalid_tool_name"; fault }`.
    - No builder renders "The author states that no program was used to prepare <subject>."; the Declaration None sentence of `declarationNone` is the only author no-AI sentence.
    - The Tool_Name is inserted as given after trimming, with nothing added around it.
    - _Requirements: 1.2, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.3, 4.2, 6.7, 7.5, 7.6, 7.7, 7.8, 7.10, 7.12, 7.14_

  - [x] 3.3 Rebuild the Statement and paragraph 2
    - `statement-parts.ts`: delete the old `usedAi(document)`. `wording.ts`: delete `PARAGRAPH_NO_AI` and `NO_PROGRAM_SENTENCE`.
    - `Statement` gains `aiUsed` (now Used_AI), `assistantText` and `declaration` (the trimmed Applicable_Declaration or `null`).
    - `buildStatement(document, runLog, meta, orderContext = null, declaration = null)` returns `Result<Statement, StatementError>`: after `meta` and segmentation, return `declaration_required` when `declarationRequired`, then `invalid_tool_name` from `checkToolName` on the Applicable_Declaration.
    - New `paragraph-two.ts`: record sentences by `(assistantText, P > 0)`, then the Declaration sentence (none when `declaration === null`), then order sentences. Move `percent` to `text.ts` if importing it from `render-statement.ts` would be circular.
    - `render-order.ts`: apply the design's order-sentence table (`tool_name` renders `NO_PROGRAM_RECORD` alone when not Used_AI, whether the Declaration is None or Pending; `negative_certification_when_unused` adds no sentence, so the Declaration None sentence in paragraph 2 appears exactly once; portions, how used only when run count is above 0, confidentiality on `aiUsed`, prompt records). Leave `accuracy_certification`, `citations_verified`, `human_review` and `signed_by_all_drafters` unchanged.
    - Every sentence is a Record_Sentence or an Author_Sentence. No paragraph equals a `STATEMENT_TITLES` member other than its own title.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 7.17, 7.19, 8.7_

  - [x] 3.4 Change the gate, confidentiality condition and prohibition notice
    - `gate.ts`: `canExport(document, order, declaration)` returns `false` when `order.kind === "prohibition"` and `usedAi(...)`, otherwise `blockingIssues(document).length === 0`. It does not look at a pending Declaration (design D4).
    - `order-rules.ts`: `needsConfidentiality(document, entry, declaration)` uses `usedAi`. `prohibitionNotice(document, entry, declaration)` is non-null when the entry prohibits and `usedAi`. Branch on `holdsAssistantText`: existing line plus " The author also declared that generative AI was used to prepare <subject>." when the Applicable_Declaration is `declared_ai`; otherwise `prohibitionDeclaredLine`. Factor `prohibitionSubject` out of `prohibitionLine`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10, 4.9, 4.10_

  - [x] 3.5 Carry the Declaration into the Appendix, the DOCX and the first-page heading
    - `buildAppendix(document, declaration = null)`: `lines` come from `renderRecord(document, declaration, "full").text.split("\n")`.
    - `buildDocx(document, statement)` keeps its signature and calls `buildAppendix(document, statement.declaration)`. `firstPageHeading(statement)` keeps its signature and reads `statement.aiUsed`, now Used_AI. Heading wording is unchanged.
    - Title and declaration-clause placements render as today for every Used_AI value.
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.5_

  - [x] 3.6 Update existing Export package tests and fixtures
    - `packages/export/test/support/demo-statement.ts` and any test that builds a Statement from a pasted Document: pass a Declaration or use a typed-only Document.
    - Rewrite assertions of "No generative artificial intelligence was used in preparing this filing." and "No program was used." to the Requirement 2 and 7 wording. Update `canExport`, `needsConfidentiality` and `prohibitionNotice` callers.
    - _Requirements: 1.3, 2.13, 14.2_

- [~] 4. Checkpoint - Engine and Export compile and pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Web: Store, clearing rule and persistence
  - [x] 5.1 Add the Declaration to the Store and the clearing rule
    - New `apps/web/src/declaration-clearing.ts`: `insertedPasted(operations)` and `declarationAfter(stored, after, pastedInserted)` as in the design.
    - `store.ts` and `store-actions.ts`: `StoreState.declaration: Declaration | null`; action `{ type: "declaration"; declaration: Declaration | null }`; `replace` gains optional `declaration` defaulting to `null`, so samples and "New" clear it. `reduceEdit` and `reduceHistory` call `declarationAfter` (history passes `insertedPasted(entry.group)` for undo and redo); `reduceReplace` runs the drop check. `reducePairs`, `reduceOverride` and `reduceVerified` leave it alone.
    - Keep each function under 40 lines and each module under 300; put new reducers in `declaration-state.ts` if `store-actions.ts` would grow too large.
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7, 5.12_

  - [x] 5.2 Persist the Declaration in `apps/web/src/persist.ts` and `apps/web/src/autosave.ts`
    - `PersistedValue.declaration?: Declaration`, version stays 1. `serialise(document, runLog, verifiedAt, declaration)` writes the key only when non-null. `Restored.declaration`.
    - `deserialise`: absent key gives `null`; a key that fails `isDeclaration` gives `null`; the draft always loads unchanged and the Declaration never makes `deserialise` return an error.
    - `createAutosave.schedule` takes the Declaration as a required parameter. `startAutosave` also schedules when `declaration` changes. The mount-time load dispatches `replace` with the restored Declaration. Persist the raw stored Declaration, not the applicable one.
    - Update `draft-gate.ts` and every other caller of `serialise`, `schedule` and `deserialise` so a missed caller is a type error.
    - _Requirements: 5.1, 5.9, 5.10, 5.11_

- [x] 6. Web: Export dialog, Print view and Legend
  - [x] 6.1 Add the declaration controls
    - New `components/use-declaration.ts` (`DeclarationView`: subject, required, choice, toolText, toolFault, setChoice, setToolText), `components/declaration-controls.tsx` and `components/declaration-controls.module.css`.
    - Initial state is read from `applicableDeclaration`; with none, no radio is selected. No default, nothing derived from the text. Mount with `key={subject}`.
    - `<fieldset>` with `<legend>` "Generative AI", two native radios labelled with `choiceNoneLabel(subject)` and `choiceAiLabel(subject)`, and a labelled text input for the Tool_Name shown on the second choice. `TOOL_NAME_LINE` shows for an empty or faulty name and is tied by `aria-describedby`. The input has no `maxLength`.
    - `setChoice("none")` dispatches `declareNone` and empties `toolText`. `setChoice("declared_ai")` and `toolText` changes run `declareAi`: valid dispatches the Declaration, a fault dispatches `null`.
    - Follow `ui.md`: text labels only, no icon, no animation, colours only as `var(--token)`, one CSS module, no network call carrying the Declaration.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 5.2_

  - [x] 6.2 Add the `declaration_pending` Print view
    - `print-model.ts`: `PrintModel` gains `{ kind: "declaration_pending"; subject }`. `printModel` checks storage error, parse error, `canExport` (blocked or prohibited, prohibition line first), then `declarationRequired`, then builds with the stored Declaration for `buildStatement` and the Applicable_Declaration for `buildAppendix`.
    - The view renders one block with the line "The statement is not shown until you state whether generative AI was used to prepare <subject>. Make that statement in the Export dialog." and a link to `/` with the text "Back to the editor". The block's class hides it in `@media print`. No declaration control in the Print view. When the Declaration is applicable and Used_AI holds, render the first-page heading lines as the DOCX does.
    - _Requirements: 4.3, 4.4, 4.5, 4.8, 4.13, 7.1_

  - [x] 6.3 Change the Legend entry in `apps/web/src/pane/pane-header.tsx`
    - Change the `[PST]` entry's words from "pasted" to "pasted, origin not recorded". Change no other entry, colour, code or style.
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 7. Web gates at the moment of export
  - [x] 7.1 Wire the gates into the dialog and the flows
    - Move `ExportOrder` and its block into `components/export-order.tsx`. Order of elements: Picker, Order_Summary, prohibition block, declaration controls, Confidentiality_Checkbox. The prohibition line shows before any declaration control and the controls stay available while `required` holds.
    - `useOrderGate` takes the stored Declaration and returns `required`: `clear = canExport(...) && !required && (!needsTick || ticked)`. It clears the Confidentiality_Checkbox tick and the export notice when the Declaration value changes (skip the first run) and when the order changes. The status area shows `requiredLine(subject)` while `required` holds.
    - "Download .docx" and "Open print view" are disabled while `required` holds and enabled when `clear` is true. No Confidentiality_Checkbox appears unless Used_AI holds and the entry includes `confidentiality`. No override is offered when the gate refuses for a prohibition.
    - `exportDocx` reads the Declaration from the Store, uses `orderBlocks` (`canExport`, `declarationRequired`, `needsConfidentiality`), passes the Declaration to `buildStatement`, builds the Appendix from `built.value.declaration`, and checks `appendixParses` with `parseRecord` and `sameDeclaration` (subject, choice, Tool_Name). A mismatch is the existing `EXPORT_FAILED` path with nothing downloaded.
    - `printFlow` returns `PRINT_BLOCKED` when `declarationRequired` holds at the moment of printing, and flushes the autosave with the Declaration before opening the Print view.
    - Keep `export-dialog.tsx` under 300 lines.
    - _Requirements: 3.8, 4.1, 4.2, 4.6, 4.7, 4.9, 4.10, 4.11, 4.12, 4.13, 6.5, 6.8_

  - [x] 7.2 Add the static scan for the single definition of AI use
    - New file in `packages/export/test/static/`: `usedAi` is defined once; `isAiSpan` is not read outside `declaration.ts` and `ai-paragraphs.ts`; the strings "No generative artificial intelligence was used", "No program was used." and "states that no program was used" appear nowhere under `packages/*/src`, `apps/web/src` or `docs/`.
    - _Requirements: 1.3, 6.1_

- [x] 8. Sentinel: read the Declaration
  - [x] 8.1 Add `recordedRecord` to `crew/sentinel/src/recorded.ts`
    - `recordedRecord(appendix): Result<{ document: Document; declaration: Declaration | null }, SentinelError>` via `parseRecord`. `recordedDocument` stays and returns the Document of `recordedRecord`, so `analyse.ts`, `deriveFindings` and `splitExport` are unchanged and the Declaration is an input to no Finding.
    - This task must land before task 7.1. A file exported before this feature reads with `declaration: null` and no Finding.
    - _Requirements: 8.6, 8.9_

  - [x] 8.2 Update existing Sentinel tests and fixtures
    - `crew/sentinel/test/*` and fixtures that build an export from the demo Document pass a Declaration or use a typed-only Document, and read back through the new Statement shape.
    - _Requirements: 8.6, 8.9_

- [~] 9. Checkpoint - gates, Sentinel and web wiring pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Samples and demo path
  - [~] 10.1 Confirm both samples land with a Pending Declaration
    - `installDocument` dispatches `replace` with no Declaration for Load demo motion, Load the Avianca citations and New. Both samples remain one `PST` insert, so the subject is `pasted_text` and the dialog asks.
    - Update the web demo walkthrough tests to make the declaration (Declaration_Choice_AI with a named tool under N.D. Tex.) before asserting the export buttons are enabled.
    - _Requirements: 10.1, 10.2, 10.5, 10.6_

  - [~] 10.2 Update `docs/demo-script.md`
    - Add the declaration step in the order: Export, choose the court (N.D. Tex.), make the declaration with Declaration_Choice_AI and a named tool, resolve or override, Download. State that the statement then prints the Requirement 2 criterion 6 sentence and that the first-page heading appears. Keep the demo within the ninety-second budget.
    - _Requirements: 10.3, 10.4, 10.6_

- [x] 11. Property tests (one file per module, `// Property N` comment, `_Requirements_` in the describe title)
  - [x] 11.1 Write the property test for the Statement text
    - `packages/export/test/statement-declaration.properties.test.ts`, `// Property 1`, `describe("... _Requirements: 1.3, 1.4, 1.5, 1.6, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 7.18, 11.2_")`.
    - **Property 1: The Statement asserts no AI-free claim the author did not make**
    - Generate `arbMixedOriginDocument`, `arbOrderChoice` and Pending, None or Declared_AI Declarations of either subject. Assert the old sentence never appears; every sentence matching `/\bno (generative (artificial intelligence|AI)|program) was used\b/i` is either the None Declaration sentence ("The author states that no generative AI was used to prepare <subject>.") or equals one of the two fixed Record_Sentences (so "The author states that no program was used to prepare <subject>." fails the oracle and "states that no program was used" never appears); the None Declaration sentence appears exactly once when the test's own applicability calculation says None applies and otherwise zero times, including under an order with `negative_certification_when_unused` or `certification_every_filing`; no Declaration sentence when the subject is `none`; the Tool_Name appears verbatim; building twice gives the same text.
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 2.5, 2.6, 2.7, 2.8, 2.10, 2.11, 7.18**

  - [x] 11.2 Write the property test for the gate
    - `packages/export/test/declaration-gate.properties.test.ts`, `// Property 2`, `_Requirements: 6.2, 6.3, 6.4, 6.9, 6.10, 11.3_` in the describe title.
    - **Property 2: Export is refused without an override exactly when the order prohibits and AI was used**
    - Over Documents with no blocking issues, assert `canExport` is `false` exactly when the entry kind is `prohibition` and (the spans hold an `AI` or `AI>HUM` span or the applicable Declaration is `declared_ai`). Compute the expected value from spans and text, not from `usedAi`. Include a Declaration of the wrong subject. Assert that changing Declared_AI to None on a Document with no Assistant_Text makes `canExport` true.
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.9, 6.10**

  - [x] 11.3 Write the property test for the record round trip
    - `crew/sentinel/test/recorded-declaration.properties.test.ts`, `// Property 3`, `_Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.12, 11.4_` in the describe title.
    - **Property 3: The Declaration survives the record**
    - Assert `parseRecord(renderRecord(document, declaration, "full").text)` returns an equal Document and Declaration for both subjects and Tool_Names with brackets, parentheses, quotation marks, commas, semicolons, equals signs, backslashes and non-ASCII; the display form contains no declaration text; a rendering with no Declaration equals `render(document, "full")`; no Statement_Text paragraph equals a `STATEMENT_TITLES` member other than its own title; and the Declaration survives DOCX export, `readDocx`, `splitExport` and `recordedRecord` with the verifier `fetch` stubbed.
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.8, 8.12**

  - [x] 11.4 Write the property test for the clearing rule
    - `apps/web/test/declaration-clearing.properties.test.ts`, `// Property 4`, `_Requirements: 5.3, 5.6, 5.7, 5.12, 11.5_` in the describe title.
    - **Property 4: A stored Declaration is cleared exactly when pasted text is added or none remains**
    - Drive the Store with `arbEditSequence` (insert, delete, replace over `HUM`, `PST` and `AI`; undo; redo). Use an independent reference model with a unique id per character and a snapshot stack for undo and redo; do not call `insertsPasted`. After each action assert `null` when a `PST` id is new, `null` when the subject is `pasted_text` and no non-whitespace `PST` character remains, and otherwise the unchanged value.
    - **Validates: Requirements 5.3, 5.6, 5.7, 5.12**

- [ ] 12. Example tests (exact cases)
  - [x] 12.1 Export package example tests
    - Paragraph 2 cases: assistant text with and without pasted text; typed only with no order; typed only under an order that requires a statement with None and with Declared_AI; substantive pasted text with None and with Declared_AI; whitespace-only paste with no order and no Author_Sentence.
    - For each Order_Entry kind, Declared_AI pasted text with no Assistant_Text, asserting the Requirement 7 sentences or the prohibition refusal. For an order that requires a statement, a typed-only filing with the `this_filing` Declaration None and Declared_AI.
    - The N.D. Tex. `first_page_heading` in the DOCX; "ChatGPT (GPT-4o)" printed unchanged; `buildStatement` error values; the prohibition lines of Requirement 6 criteria 6 and 7; the `programWithAuthor` variant with no recorded tool.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.11, 2.12, 6.6, 6.7, 7.1, 7.5, 7.6, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [~] 12.2 Web dialog and Print view example tests
    - The dialog shows no statement and keeps both export buttons disabled until a choice is made; no radio is preselected; the Tool_Name limits at 1, 2, 100 and 101 characters after trimming, a whitespace-only name, a name with a line break, and a name with parentheses; the Confidentiality_Checkbox appears only when Used_AI holds; the tick and notice clear when the Declaration changes.
    - The Print view shows the one-line notice and the link back to the editor, has no declaration control, hides the block in print CSS, and shows the first-page heading lines for N.D. Tex. with Declared_AI pasted text.
    - The dialog, Print view and `exportDocx` make no network request carrying the Declaration or the Tool_Name.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 3.9, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9, 4.10, 4.11, 12.4, 12.6, 12.7_

  - [~] 12.3 Web Store, persistence, Legend and sample example tests
    - A paste clears a stored Declaration; loading a sample clears it; starting a new document discards it; a partial delete of the pasted text keeps it; deleting all substantive pasted text drops it; a `this_filing` answer is kept but not applied when the order stops requiring a statement and applies again when it does.
    - Persistence: a Declaration round-trips through `serialise` and `deserialise` with `version` 1; an absent key and an unreadable key both give `null` and load the draft unchanged; a draft from before this feature with substantive pasted text asks again.
    - The Legend shows "pasted, origin not recorded" and the other seven entries are unchanged. The demo motion and the Avianca sample each ask for the declaration.
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 5.10, 5.11, 9.1, 9.2, 10.1, 10.2, 12.8, 12.10, 12.11_

  - [x] 12.4 Sentinel example tests
    - "No drift." for a Declared_AI export and for a None export. A file exported before this feature (the Appendix built with `d` removed) reads as "No drift." with `declaration: null`.
    - _Requirements: 8.6, 8.9, 12.9_

- [ ] 13. Documentation
  - [~] 13.1 Write `docs/CERTIFICATION.md`
    - Describe the statement paragraph by paragraph and label each sentence as a Record_Sentence or an Author_Sentence. Give the cases of paragraph 2 with their exact wording. Explain the declaration and its two subjects, the clearing rule, the single definition of AI use, and the prohibition reasons.
    - Use "record", "pasted or imported", "declaration" and "author states" consistently. Do not use "detected" or "inferred" about AI.
    - _Requirements: 13.1, 13.2, 13.7_

  - [~] 13.2 Update `README.md`
    - "What it does": the statement states the record and the author states the rest. "Demo path": the step of task 10.2, naming N.D. Tex. and Declaration_Choice_AI with a named tool.
    - _Requirements: 10.3, 10.4, 13.3_

  - [~] 13.3 Add the rule to principle 1 of `.kiro/steering/product.md`
    - The tool states the record; the author states the rest; the two kinds of sentence are never mixed; the tool never asserts "no AI" on its own. Change no other principle.
    - _Requirements: 13.4_

  - [~] 13.4 Add a dated entry to `BUILD_LOG.md`
    - Give the Introduction's observation (a pasted-only filing exported "No generative artificial intelligence was used in preparing this filing.") as the reason, and record what Kiro got wrong in the requirements pass. Record the compatibility limit: an older Sentinel reads a file with `d=` as one `unreadable` Finding.
    - _Requirements: 13.5_

  - [~] 13.5 Add rows to `docs/KIRO_USAGE.md`
    - A row for this spec, with the paths of `requirements.md`, `design.md` and `tasks.md`, and a row for the `product.md` steering changes (the `[DOC]` line and principle 1). No hook, agent or MCP tool is added by this feature, so add none.
    - _Requirements: 13.6_

- [~] 14. Final checkpoint - run every check, no push
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `pnpm --filter @reveal-codes/web build` on a clean checkout (after a fresh `pnpm install`), and `pnpm kiro:check`. Record each result in `BUILD_LOG.md`.
  - Fix any failure at its cause. Do not weaken a test. If a test is hard to write, record that in `BUILD_LOG.md`.
  - Do not push to any remote and do not commit as part of this task.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 14.2, 14.3, 14.4_

## Notes

- Test sub-tasks are not marked optional: Requirements 11 and 12 say the tests SHALL exist, so they are part of the work.
- Each property has its own sub-task, file, `// Property N` comment and `_Requirements_` in the describe title.
- Execution order is given by the dependency graph. The Sentinel tasks (8.1, 8.2) run before the gate wiring (7.1) that makes the app write `d=`.
- Task 1.1 is the first task and the only task that may touch steering before the Engine.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "3.2"] },
    { "id": 3, "tasks": ["2.4", "3.3", "3.4", "8.1", "6.3"] },
    { "id": 4, "tasks": ["3.5", "5.1", "7.2", "11.1", "11.2"] },
    { "id": 5, "tasks": ["3.6", "5.2", "6.1", "8.2", "11.3", "11.4"] },
    { "id": 6, "tasks": ["6.2", "12.1", "12.4"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["10.1", "10.2", "12.2", "13.1", "13.2", "13.3"] },
    { "id": 9, "tasks": ["12.3", "13.4", "13.5"] }
  ]
}
```
