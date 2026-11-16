# Implementation Plan: open-draft

## Overview

The plan lands in the order the design gives: the shared reader move first (Sentinel import paths only, Sentinel tests unmodified), then the reader additions and `word-draft.ts` in `packages/export`, then `docxSafe` with the editor-input changes and the export refusal, then the `limits.ts` move with the boundary test run, then the app (Toolbar Open button, drop, confirm, Open flow, Open_Note in the Issues region, empty-page links, messages), then the fixtures builder and endnotes helper, then Properties 1 to 11, then the example tests of Requirement 19, then the documentation, then the final checkpoint. `packages/engine` is not edited.

Implementation language: TypeScript 5.x, strict (tech.md). The design uses TypeScript signatures, so no language question is needed.

Conventions that apply to every task:

- Paths are repository-relative. Modules stay at 300 lines or fewer and functions at 40 lines or fewer. No `any`, named exports only outside Next route files, no `try`/`catch` that swallows an error (the one `try` around `unzipSync` in the reader turns the throw into a `DocxReadError` value). Shared reader modules import nothing from `node:` and nothing from the DOM (Req 1.4, 21.5).
- Tasks touching `apps/web` follow ui.md: text labels only, no icon, no animation, no toast, a colour only as `var(--token)`, one CSS module per component, no `data-primary` on the Open button (Req 2.6, 21.7).
- Every task keeps `pnpm lint`, `pnpm typecheck` and `pnpm test` green. A task that breaks an existing test updates that test in the same task.
- Property tests: fast-check, one `fc.assert(fc.property(...))` (or `fc.asyncProperty`) per property, in `<module>.properties.test.ts`, with `// Property N` above it and `_Requirements: x.y_` in the `describe` title, `numRuns` 200 locally and 500 in CI by the existing helper (`apps/web/test/support/fc.ts` for the web, the equivalent in each package). Existing arbitraries are not narrowed or changed (Req 22.7).
- Test sub-tasks are not marked optional (`*`): Requirement 18 and Requirement 19 say the tests SHALL exist, and the user asked for them.
- Each task completion note records anything Kiro got wrong and the fix, for the BUILD_LOG entry in task 10.5. A property that fails on a Docx_Unsafe_Character is recorded with its shrunk counterexample and is fixed, not hidden by narrowing the arbitrary (Req 18.8).
- The spec commit (`spec(open-draft): ...`, Req 21.1) precedes task 1.1. No task pushes to a remote (Req 21.4).

## Tasks

- [ ] 1. Shared reader move (Sentinel import paths only)
  - [ ] 1.1 Move the reader, split and appendix parse into `packages/export`
    - Use `smart_relocate` to move `crew/sentinel/src/docx-read.ts`, `xml-text.ts`, `split.ts` and `recorded.ts` to `packages/export/src/` as `docx-read.ts`, `xml-text.ts`, `export-split.ts` and `appendix-parse.ts`. Create `packages/export/src/read-types.ts` holding `DocxText`, `ExportParts` and `DocxReadError` (`{ kind: "not_docx" } | { kind: "part_too_large" }`), taken from `crew/sentinel/src/types.ts`.
    - Behaviour does not change: `readDocx(bytes)` reads `word/document.xml` only, has no size limit and turns any failure into `{ kind: "not_docx" }`. Export `readDocx`, `splitExport`, `recordedRecord`, `recordedDocument` and the types from `packages/export/src/index.ts`.
    - In `packages/export/package.json` move `fflate` (0.8.3) from `devDependencies` to `dependencies`; update the lockfile through `pnpm install`. Edit `packages/export/test/package.test.ts`: the `fflate` pin now reads `dependencies.fflate` at `0.8.3`, and the runtime-dependency line allows `docx` and `fflate`. The Engine keeps zero runtime dependencies.
    - Sentinel: `analyse.ts` and `index.ts` import `readDocx`, `splitExport` and `recordedDocument` from `@reveal-codes/export`; `index.ts` keeps re-exporting them so the public surface is unchanged. `types.ts` re-exports `DocxText` and `ExportParts` from the Export_Package and keeps `SentinelError`. Delete the four moved files from `crew/sentinel/src/`. `crew/sentinel/package.json` is unchanged (`fflate` stays; its package test pins it).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 21.5_
  - [ ] 1.2 Sentinel tests: import-path change only
    - Change only the import lines in the Sentinel tests that exercise the moved modules (`docx-read.test.ts`, `xml-text.test.ts`, `split.test.ts`, `recorded.test.ts`, `docx-read.properties.test.ts`, and any other Sentinel test that imports a moved module) to `@reveal-codes/export`. No assertion, fixture or test body changes. Confirm with `git diff` that every changed line in `crew/sentinel/test` is an import line.
    - Run `pnpm --filter` for the Sentinel package and `packages/export`; the Sentinel Findings, report text and error kinds are as before.
    - _Requirements: 1.7, 1.8, 19.11_

- [ ] 2. Reader additions and `readWordDraft` in `packages/export`
  - [ ] 2.1 Notes, part-size limit and signature check
    - New `packages/export/src/docx-notes.ts`: `notesOf(xml, kind)` reads `word/footnotes.xml` or `word/endnotes.xml`, skips every Separator_Note (`w:id` -1 or 0, or `w:type` of `separator` or `continuationSeparator`), joins the paragraphs of one note with a single space, turns a line break or tab inside a note into a space and leaves out an empty note; `notesBlock(notes)` returns a blank line, the line `Footnotes`, then `<n>. <text>` numbered 1..N with no gap, footnotes first then endnotes, or `""` when no note has text.
    - New `packages/export/src/docx-signature.ts`: `isCompoundFile(bytes)` (the eight bytes `D0 CF 11 E0 A1 B1 1A E1`) and `holdsEncryptedPackage(bytes)` (compound file that also holds the UTF-16LE bytes of `EncryptedPackage`).
    - In `docx-read.ts` add `readDocxWithNotes(bytes, { maxPartBytes })` beside `readDocx`, sharing one internal `unpack`. It first runs `unzipSync` with a `filter` that records each entry's `originalSize` and returns `false`, so nothing is inflated; a wanted part larger than `maxPartBytes` gives `{ kind: "part_too_large" }`. Both functions are total: any failure becomes a value. The result carries the paragraphs and the notes. Export the new functions from `index.ts`.
    - _Requirements: 1.6, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 14.2, 14.10_
  - [ ] 2.2 `exportDate` and `readWordDraft`
    - In `export-split.ts` add `exportDate(paragraphs)`: the paragraph at `lastIndexOf(APPENDIX_TITLE) - 1` when it matches `/^\d{4}-\d{2}-\d{2}$/`, else `null`.
    - New `packages/export/src/word-draft.ts` with `WordLimits`, `WordDraft` (`plain | restored | changed | refused`) and `readWordDraft(bytes, limits)` as the design gives: encrypted and compound-file checks first (`refused / encrypted`, `refused / damaged`); `readDocxWithNotes` (`not_docx` and `part_too_large` give `refused / damaged`); no Appendix title gives `plain` with `paragraphs.join("\n") + notesBlock(notes)`; otherwise `splitExport` (`refused / no_filing_end` when it fails), `bodyText = body.join("\n") + notesBlock(notes)`, `recordedRecord(appendix)`; a parse whose `document.text === bodyText` gives `restored` with `exportedOn`, anything else gives `changed` with `text = bodyText`. It calls no `docxSafe`. Normalise `\r\n` and lone `\r` to `\n` in the returned text. Export from `index.ts`.
    - _Requirements: 1.10, 6.1, 6.7, 7.1, 9.1, 9.2, 9.6, 9.9, 10.1, 10.6, 10.8, 11.1, 11.2, 11.3, 11.4, 14.1, 14.2, 14.9, 14.10_

- [ ] 3. `docxSafe`, the editor-input changes and the export refusal
  - [ ] 3.1 `docxSafe` and `holdsDocxUnsafe`
    - New `packages/export/src/docx-text.ts`: one table of allowed ranges (U+0009, U+000A, U+000D, U+0020 to U+D7FF, U+E000 to U+FFFD, U+10000 to U+10FFFF). `docxSafe(text)` returns `{ text, removed }`: U+000B and U+000C become `\n`, `\r\n` and a lone `\r` become `\n`, every other Docx_Unsafe_Character (an unpaired surrogate included) is removed and counted once; the converted characters are not counted. It is idempotent and returns its input unchanged when the input holds none and no `\r`. `holdsDocxUnsafe(text)` is true for any Docx_Unsafe_Character, U+000B and U+000C included. No imports. Export both from `index.ts`.
    - _Requirements: 22.1, 22.2, 22.5_
  - [ ] 3.2 Apply `docxSafe` at every editor Entry_Point
    - `apps/web/src/editor/clipboard.ts`: `plainTextOf` calls `docxSafe(...).text` instead of `normaliseNewlines` (paste and drop); `normaliseNewlines` stays exported for its tests.
    - `apps/web/src/components/use-document-actions.tsx`: apply `docxSafe` to the demo-motion and Avianca texts before `pastedDocument`; no message.
    - `apps/web/src/components/use-assistant.ts`: in `insertReply`, apply `docxSafe` once to the accumulated reply, never per chunk, so a surrogate pair split across chunks is not cut.
    - Update any existing test the change breaks. Add the example tests in task 9.6, not here.
    - _Requirements: 22.3_
  - [ ] 3.3 Export refusal for a stored unsafe character
    - `apps/web/src/notices.ts`: add the constant with the text "This draft holds a character that Word files cannot store, so it was not exported. Paste the text again or remove the character." beside `EXPORT_FAILED`.
    - `apps/web/src/client/export-docx.ts`: after the existing order and gate checks and before `buildStatement`, test `holdsDocxUnsafe` on `document.text` and on every override reason; on a hit dispatch the notice, return `{ status: "failed" }`, download nothing and leave the Document unchanged.
    - _Requirements: 22.8_

- [ ] 4. `limits.ts` move with the boundary test run
  - [ ] 4.1 Move `MAX_TEXT_CHARS` to `apps/web/src/limits.ts`
    - Create `apps/web/src/limits.ts` with the one definition (`200_000`, no imports). `apps/web/src/server/verify-route.ts` imports it and re-exports the name so `test/verify-route.test.ts` is unchanged. Add `limits.ts` to the browser-bundle check in `apps/web/test/static/boundaries.test.ts` only if the rule table needs it.
    - Run `pnpm --filter @reveal-codes/web test -- test/static/boundaries.test.ts` with the real files in place and record that it passes (and that `forbidden.test.ts`, `package-json.test.ts` and `env-and-size.test.ts` still pass).
    - _Requirements: 14.4, 21.8_

- [ ] 5. Checkpoint - shared reader, `docxSafe` and limits
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. The app: Open flow, Toolbar, drop, empty page, Issues note
  - [ ] 6.1 Store `openNote` and the `nextRunId` change
    - `apps/web/src/store.ts` (and `store-actions.ts` if the handler lives there): add `openNote: string | null` (initial `null`) and the action `{ type: "openNote"; text: string | null }`; `reduceReplace` sets `openNote` to `null` (New, Load demo motion and Load the Avianca citations clear it). `persist.ts` is untouched: the note is never stored.
    - `apps/web/src/assistant-run.ts`: `nextRunId` returns `r` plus one more than the highest number in any `r<digits>` id held by `document.runs` or `runLog`. For contiguous ids the result is as before.
    - Update existing store tests that build a full `StoreState`.
    - _Requirements: 4.8, 15.2, 15.3, 15.6, 13.1_
  - [ ] 6.2 Pure helpers: `pastedDocument`, `open-text`, `open-messages`, `open-note`
    - `apps/web/src/client/pasted-document.ts`: move `pastedDocument(text, iso)` out of `components/use-document-actions.tsx`; Open and Load demo motion both import it (one insert over an empty Document with origin `PST` and the current time).
    - `client/open-text.ts`: `decodeTextFile(bytes)` with `new TextDecoder("utf-8", { fatal: true })`, one leading U+FEFF removed, `\r\n` and lone `\r` to `\n`; invalid UTF-8 (UTF-16 included) is a value (`Result`), not a throw.
    - `client/open-messages.ts`: string builders holding the exact wording of Requirement 14 (criteria 1 to 9 and the Toolbar "Could not open <file name>."), Requirement 8 criterion 3, Requirement 9 criteria 5 and 6, Requirement 7 criterion 7, Requirement 10 criterion 4 and Requirement 22 criterion 5 (" <k> characters that Word files cannot store were removed." and the singular), built in the order: opened sentence, removed sentence, notes sentence.
    - `client/open-note.ts`: `restoreNote(document)` with `hasAiRun` (`document.runs.length > 0`) and `hasResult` (a full citation or quote whose `result.status` is not `unchecked`) giving the three notes of Requirement 13 criterion 4 or `null`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 7.7, 8.1, 8.3, 9.5, 9.6, 10.3, 10.4, 13.2, 13.3, 13.4, 13.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.11, 22.5_
  - [ ] 6.3 `OpenOutcome` and `openFile`
    - `client/open-outcome.ts`: `OpenOutcome` (`refused | text | restored`) and the pure step from text or a `WordDraft` to an outcome: `docxSafe` on `text` kinds (not on `restored`), then the text limits (White_Space test for empty, `MAX_TEXT_CHARS` for too long, also applied to restored text), `note` set to the changed-export note for a `changed` draft or the `restoreNote` for a restore.
    - `client/open-file.ts`: `openFile(file, deps)` clears `openNote`, then applies the refusals in the order of Requirement 14 criterion 12 (kind, size from `File.size` before any read, unreadable or encrypted, part size, text limits). It reads with the File API only (no network), classifies Word files with `readWordDraft` with `maxPartBytes` 33 554 432 and holds no second copy of the classification, asks the injected confirm only after every refusal check passed and only when `document.text` is non-empty, then dispatches `replace` first and `notice` and `openNote` after. Text and changed exports install with Declaration `null`, `runLog: []`, `verifiedAt: null`; a restore installs `record.document`, `runLog: []`, `verifiedAt: null` and `record.declaration`. A refusal dispatches only `notice` and `openNote`. No `try`/`catch` discards an error: an unexpected failure becomes the damaged message for a Word_File and the Toolbar message for any file. Uses the same Draft_Gate behaviour as Load demo motion and adds none.
    - _Requirements: 1.10, 2.8, 3.7, 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 8.1, 8.2, 8.4, 8.6, 9.2, 9.3, 9.4, 9.8, 10.2, 10.5, 12.1, 12.2, 12.3, 12.4, 13.1, 13.7, 13.8, 14.11, 14.12, 14.13, 15.2, 15.3, 15.4, 17.1, 17.2, 17.5, 22.3, 22.4_
  - [ ] 6.4 Open button, Picker and empty-page links
    - `components/use-open.ts`: a hidden file input restricted to `.docx,.txt,.md`; its value is cleared after each use so the same file opens twice; cancel changes nothing; it calls `openFile`.
    - `components/toolbar.tsx` and `shell-toolbar.tsx`: a button labelled "Open" after New and before Load demo motion, no `data-primary`, enabled while a Verify run is in flight; the confirm dialog uses title "Open a draft", message "Discard the current draft and open <file name>?", confirm label "Discard and open", focus on Cancel, through the existing confirm dialog.
    - `components/editor-surface.tsx`: while `document.text` is empty, the placeholder "Type or paste your filing here, or open a draft." and under it three plain links in the order "Open a draft" (opens the Picker, navigates nowhere), "Load demo motion", "Load the Avianca citations"; none while the Document has a character. The old placeholder text no longer appears. Link style `var(--oxblood)`, no icon, in the component's CSS module.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 4.2, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_
  - [ ] 6.5 Drop and wiring
    - `components/use-file-drop.ts`: capture-phase `dragover` and `drop` listeners on `document` that act only when `dataTransfer.types` includes `"Files"`; they call `preventDefault` and `stopPropagation` so ProseMirror inserts nothing and the browser navigates nowhere. Exactly one file goes to the same `openFile` as the Picker; more than one dispatches the Open_Note "Open one file at a time. Drop a single file." and the Toolbar notice "Open one file at a time." and opens none; a drag with no file is left to the existing drop behaviour (`PST`). No overlay, outline or animation.
    - Wire `use-open`, `use-file-drop` and the confirm dialog into `components/app-shell.tsx`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 14.8_
  - [ ] 6.6 Open_Note in the Issues region
    - `components/issues-region.tsx` (and its CSS module): show `openNote` as text above the Issues list and below the Draft_Gate notice, in a `role="status"` element, in the existing region style, with no icon and no colour as the only signal. `components/use-verify.ts` dispatches `openNote: null` when a run starts.
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [ ] 7. Fixtures builder, endnotes helper and shared arbitraries
  - [ ] 7.1 Deterministic fixture helper and arbitraries in `packages/export/test/support`
    - A helper that builds `.docx` bytes with the `docx` library (paragraphs, a table, a tracked insertion and deletion, two footnotes) and a deterministic post-processing step with `fflate` that adds `word/endnotes.xml` with its content-type and relationship entries (the `docx` library writes none) and the Word separator notes; every date and zip timestamp is fixed so the bytes are identical on every run.
    - Fixtures also built by it: a password-protected stand-in (compound-file header with an `EncryptedPackage` stream name), a truncated zip, a zip without `word/document.xml`, a zip whose central directory declares a small part but whose stream is larger, and an export edited by one character.
    - Add to `packages/export/test/support/arbitraries.ts`: `arbParagraphs` (leading and trailing spaces, tabs, quotation marks, `&`, `<`, `>`, non-ASCII, empty paragraphs), `arbBodyEdit` (one single-character change to a body paragraph) and `arbDocxHostileText` (U+0000 to U+001F, U+FFFE, U+FFFF, unpaired surrogates). `arbDocument`, `arbText` and `arbRunLog` are not changed.
    - Add a `README` line under `packages/export/fixtures/` for any committed fixture file (source and date).
    - _Requirements: 18.7, 19.12, 19.13, 22.7_

- [ ] 8. Property tests
  - [ ] 8.1 Write property test for the Word text round trip
    - **Property 1: Word text round trip**
    - File `packages/export/test/docx-read.properties.test.ts`. Build with `filingParagraph`, read with `readDocx`, assert equality with the paragraphs joined by `\n`.
    - **Validates: Requirements 6.2, 6.3, 6.8, 6.9, 18.2, 18.3**
  - [ ] 8.2 Write property test for reader totality
    - **Property 6: The reader is total**
    - Same file. Random bytes, truncated zips and zips with random part content; `readDocx` and `readDocxWithNotes` return a value and throw nothing.
    - **Validates: Requirements 1.6**
  - [ ] 8.3 Write property test for note numbering
    - **Property 9: Notes are numbered 1..N without separators**
    - Same file. Generated footnote and endnote entries with separators and empty notes; `notesBlock` as the property states.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**
  - [ ] 8.4 Write property test for the record round trip
    - **Property 2: A reopened export is the exported Document**
    - File `packages/export/test/word-draft.properties.test.ts`. Existing `arbDocument` with overrides and every status, both Declaration subjects (Tool_Names with brackets, parentheses, quotation marks), any run log and verification time; `buildStatement`, `buildDocx`, `readWordDraft`; assert `restored`, `structuralEqual`, the same Declaration, and equal `canExport` for every court.
    - **Validates: Requirements 9.2, 9.3, 9.7, 9.10, 12.1, 12.5, 13.8, 18.4**
  - [ ] 8.5 Write property test for a changed export
    - **Property 3: A changed export imports as pasted body text**
    - Same file. `arbBodyEdit` over the exported body; assert `changed` with the changed text, the installed Document is one `PST` span with no Declaration and the Open_Note of Requirement 10 criterion 4, and the Sentinel's `analyseFile` reports `body_edited` exactly when `readWordDraft` reports `changed`.
    - **Validates: Requirements 9.9, 10.1, 10.2, 10.5, 10.6, 10.7, 18.5**
  - [ ] 8.6 Write property test for statement and appendix exclusion
    - **Property 5: The statement and the Appendix are never body text**
    - Same file. Documents including a line equal to a member of `STATEMENT_TITLES`; for a restore and a body-only import no paragraph at or after the Filing_End is in the installed text.
    - **Validates: Requirements 11.1, 11.2, 11.3**
  - [ ] 8.7 Write property test for DOCX-safe text
    - **Property 4: DOCX-safe text**
    - File `packages/export/test/docx-text.properties.test.ts`. Any string and any code-unit sequence (`arbDocxHostileText`): no Docx_Unsafe_Character in the result, idempotence with `removed` 0 on the second pass, identity when none present and no `\r`; and export then reopen of a Document built from `docxSafe` text equals the original by `structuralEqual`.
    - **Validates: Requirements 22.1, 22.2, 22.6, 22.7, 18.6**
  - [ ] 8.8 Write property test for UTF-8 text decoding
    - **Property 7: UTF-8 text round trip**
    - File `apps/web/test/open-file.properties.test.ts`. `decodeTextFile` over UTF-8 encodings with and without a byte-order mark, with and without `\r\n` and lone `\r`.
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6**
  - [ ] 8.9 Write property test for installed opened text
    - **Property 8: Opened text installs as one PST span**
    - Same file. Any accepted text including Docx_Unsafe_Characters: one `PST` span over the text after `docxSafe`, Declaration `null`, empty run log, no verification time, no override or result, and the removed-character sentence exactly when `removed` is at least 1 with that count.
    - **Validates: Requirements 8.1, 8.2, 8.6, 22.3, 22.5**
  - [ ] 8.10 Write property test for the restore note
    - **Property 10: The restore note follows AI runs and verification results**
    - Same file. `restoreNote` over generated Documents returns the note of the matching case or `null`.
    - **Validates: Requirements 13.2, 13.3, 13.4, 13.5**
  - [ ] 8.11 Write property test for refusals
    - **Property 11: A refusal changes nothing but the note and the message**
    - Same file. Any refused file and any prior Store state: the Store after equals the Store before except `openNote` and `notice`, and no confirm dialog opened.
    - **Validates: Requirements 4.6, 4.7, 14.11, 19.1**

- [ ] 9. Example tests
  - [ ] 9.1 Export package examples
    - Files under `packages/export/test/`. The `.docx` fixture of Requirement 19 criterion 3 (table, tracked deletion and insertion, two footnotes, one endnote, separators never numbered) with the exact text, the Notes_Block and its wording; `readDocx` returns the same paragraphs as before for the Sentinel (no notes); `isCompoundFile` and `holdsDocxUnsafe` cases; the oversize-part zip (declared size versus real size) settles the `fflate` size-header question; `readWordDraft` for plain, restored, changed and each refusal (damaged, truncated, no `word/document.xml`, encrypted, no filing end); the Sentinel and `readWordDraft` agree on an edited fixture; static check that no moved module exists in `crew/sentinel/src`, that the shared modules import no `node:` or DOM, and that the Engine has no runtime dependency.
    - _Requirements: 1.3, 1.4, 1.5, 1.9, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 7.1, 7.2, 7.3, 7.7, 9.9, 10.8, 11.3, 11.4, 14.1, 14.2, 14.9, 14.10, 19.3, 19.8, 19.13_
  - [ ] 9.2 Open flow refusal and text-file examples
    - File under `apps/web/test/`. Each refusal of Requirement 14 (not Word or damaged, password-protected, over 5 MB with no read, over the Character_Limit, empty and whitespace-only, wrong kind, not UTF-8 and UTF-16, several files, no filing end, oversize part): exact message text, Document, stored draft and history unchanged, no confirm dialog opened; the refusal order of criterion 12 with files failing two checks; a text file with a byte-order mark and Windows endings and a lone `\r` reading as `\n` text with no U+FEFF; the Toolbar message "Could not open <file name>."
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 14.9, 14.10, 14.11, 14.12, 14.13, 19.1, 19.2_
  - [ ] 9.3 Picker, drop, confirm and message examples
    - The Picker and a drop reach the same `openFile` and produce the same Document for the same bytes; choosing the same file twice opens it twice; cancelling the Picker changes nothing; a drag with no file keeps the `PST` drop behaviour; confirm-before-replace (dialog with the exact title, message and labels for a non-empty draft, none for an empty one, Cancel changes nothing, Confirm replaces); the three Toolbar messages, with and without the export date; opening clears a stored Declaration, a restore installs the recorded one and a body-only import installs none; Next_Step after an open is the value `nextStep` already gives.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 8.3, 8.4, 8.5, 9.5, 9.6, 10.3, 12.1, 12.2, 12.4, 12.5, 19.4, 19.5, 19.6, 19.9_
  - [ ] 9.4 Open_Note, restore install and `nextRunId` examples
    - The changed-export Open_Note in the Issues region and its clearing by New, Load demo motion, Load the Avianca citations, the next open and the start of a Verify run; it is not persisted and sits in a `role="status"` element; the Open_Note of each case of Requirement 13 criterion 4 and no note for criterion 5; `replace` with `runLog: []` and `verifiedAt: null` for a Document with AI spans is accepted by `reduceReplace` and `buildStatement` builds, printing "not recorded", no check date and no sentence about prompt records (Requirement 19 criterion 16); no court, judge or confidentiality tick after a restore; recorded span and override timestamps kept; `nextRunId` gives `r4` for runs `r1` and `r3` with an empty run log and the old result for contiguous ids.
    - _Requirements: 9.7, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 19.7, 19.16_
  - [ ] 9.5 Empty page, Toolbar, network and static examples
    - The empty-page placeholder and the three links in order, their absence once the Document has a character, the old placeholder gone, "Open a draft" opening the Picker; the Open button directly after New and before Load demo motion, with no `data-primary`; zero `fetch`, `XMLHttpRequest`, `sendBeacon` and form-post calls during an open; no route under `apps/web/app/api` for opening; static scan that the Open flow holds no discarding `try`/`catch`; `test/static/boundaries.test.ts` and the docs scan of Requirement 17 criterion 4 still pass.
    - _Requirements: 2.1, 2.6, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 17.1, 17.2, 17.4, 21.8, 19.10_
  - [ ] 9.6 Text-safety examples
    - `docxSafe` at paste, drop, the two samples and assistant insertion (a reply that splits a surrogate pair across chunks is not cut); the Open_Message for `removed` 0, 1 and more than 1 in the order opened sentence, removed sentence, notes sentence; a restore of a record that holds an unsafe character is not changed; the export refusal for a stored draft with a Docx_Unsafe_Character in the text and in an override reason, with the exact message, nothing downloaded and the Document unchanged.
    - _Requirements: 7.7, 22.3, 22.4, 22.5, 22.8, 19.15_

- [ ] 10. Documentation
  - [ ] 10.1 README
    - Add one line to "What it does" (a draft can be opened from a `.docx`, `.txt` or `.md` file, and an exported `.docx` reopens with its record), one line to "Demo path" naming Open as the other way in beside Load demo motion, and one sentence to "What leaves your machine": opening a file reads it in your browser; the file is not uploaded. No exclamation mark; the words "opened", "reopened", "record", "pasted" and "changed after it was exported"; no "detected" or "inferred" about authorship. `apps/web/test/static/docs.test.ts` stays green.
    - _Requirements: 17.3, 17.4, 20.1, 20.2, 20.3, 20.9_
  - [ ] 10.2 `docs/KIRO_USAGE.md` rows
    - Add a row for this spec listing `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`, and a row for each steering file this spec edits (`ui.md`, `structure.md`, `tech.md` when it changes). Run `pnpm kiro:check` and the inventory static test.
    - _Requirements: 20.4_
  - [ ] 10.3 `.kiro/steering/ui.md`
    - Describe the Open button after New in "Layout", the empty-page placeholder and three links in "Copy", and the Open_Note in the Issues region. Add no Token, no icon and no animation.
    - _Requirements: 20.6, 20.9_
  - [ ] 10.4 `.kiro/steering/structure.md` and `tech.md`
    - `structure.md`: the shared reader modules, `readWordDraft` and the DOCX-safe text function in `packages/export`, the Open flow modules and `limits.ts` in `apps/web/src`, and `crew/sentinel` as an importer. `tech.md`: keep the Stack section true by saying the export package has `docx` and `fflate` as runtime dependencies.
    - _Requirements: 1.2, 20.7, 20.8_
  - [ ] 10.5 `BUILD_LOG.md` entry
    - A dated entry recording the decision to share one reader, the decision to defer the record additions, the DOCX-safe text fix (with any shrunk counterexample from a failing run), the `nextRunId` change, and what Kiro got wrong in the requirements pass or "No Kiro errors", taken from the task completion notes.
    - _Requirements: 18.8, 20.5_

- [ ] 11. Final checkpoint - Ensure all checks pass
  - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build `pnpm --filter @reveal-codes/web build` and `pnpm kiro:check`, and record each result in BUILD_LOG.md. Do not push to any remote. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 21.3, 21.4_

## Notes

- Tasks marked with `*` would be optional; none are, because Requirements 18 and 19 say the tests SHALL exist.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation.
- The record additions (tool names, check date) and the same-statement rule are deferred and have no task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "4.1"] },
    { "id": 3, "tasks": ["3.1", "6.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "7.1"] },
    { "id": 5, "tasks": ["6.2", "8.1", "8.4", "8.7", "9.1"] },
    { "id": 6, "tasks": ["6.3", "8.2"] },
    { "id": 7, "tasks": ["6.4", "6.6", "8.3", "8.5", "8.8", "9.2", "9.6"] },
    { "id": 8, "tasks": ["6.5", "8.6", "8.9", "9.4"] },
    { "id": 9, "tasks": ["8.10", "9.3", "9.5"] },
    { "id": 10, "tasks": ["8.11", "10.1", "10.3", "10.4"] },
    { "id": 11, "tasks": ["10.2", "10.5"] }
  ]
}
```
