# Design Document: open-draft

## Overview

A person can open a `.docx`, `.txt` or `.md` file. A text file, or a Word file with no Provenance Appendix, becomes one `PST` span with no Declaration. A Reveal Codes export whose body still equals the document text recorded in its Appendix is restored from the record, with an empty run log and no check date. An export whose body differs is imported as body text only, as one `PST` span, with a reason in the Issues region. Text from every source is made safe for Word files at the moment it enters the Document. All of it runs in the browser. There is no server route. `packages/engine` is not changed.

This design answers the questions the requirements left to it. The answers are collected here so the author can find them before reading the detail.

| Question | Answer | Section |
| -------- | ------ | ------- |
| Where does the shared reader live, and why (Req 1.2) | `packages/export`. Nine modules move or are added there. `fflate` becomes a runtime dependency of the Export_Package. The Sentinel changes import paths only. | "Shared reader" |
| What does a restore put in the Run_Log and the verification time (Req 13.1, 13.9) | Nothing. `runLog: []` and `verifiedAt: null`. A table covers every item the record does not carry. | "Restoring the run log" |
| Which fix for characters DOCX cannot carry (Req 22) | **Decided.** `docxSafe` at every Entry_Point, an export refusal as backstop. Never narrow the arbitrary. | "Q12: characters DOCX cannot carry" |
| Where is the export date (Req 9.6) | Confirmed. It is the paragraph immediately before the Appendix title. | "Where the export date is" |
| Where does `MAX_TEXT_CHARS` live (Req 21.8) | `apps/web/src/limits.ts`. The boundary test accepts it for both importers (run, result below). | "`MAX_TEXT_CHARS`" |
| What the Next_Step is after a restore that holds results (Req 13.11 to 13.14) | Verify, through one added input `needsCheckDate`. Verify's start already re-checks verified results and sets the check date, so Verify's behaviour is unchanged. | "Next_Step after a restore" |
| What was cut from this spec | The record additions (tool names, check date) and the rule that a reopened export gives the same statement. | "Deferred" |

### Flags for the author

1. **Q12 is decided.** The fix is `docxSafe` at every Entry_Point with the export refusal as backstop. Requirement 5 criterion 4 already names the Docx_Safe_Text step for text files. The one amendment is the split into two functions, `docxSafe` and `holdsDocxUnsafe`, which Requirement 22 criterion 1 already states (see "Q12: characters DOCX cannot carry").
2. **Verify's start re-checks already-verified results, checked in the code, so no fix to Verify is needed.** `runVerifyFlow` (`apps/web/src/client/verify-flow.ts`) sends every full record to `/api/verify` through `buildVerifyBody`, whatever its status, folds the answers in with `setVerification`, checks the quotes of every cluster whose owner is `verified`, and then dispatches `verified` with `now()`, which `reduceVerified` stores as `verifiedAt`. Only the Next_Step rule looks at the count of unchecked items (`countVerifiableUnchecked`). The Verify button is enabled for a restored Document with no unchecked item, because `verify.disabled` is `running || !hasFullRecord(document)` and does not read the count. See "Next_Step after a restore".
3. **A re-check can drop a restored override.** `setVerification` and `setQuoteCheck` drop the override of a key when the new result differs from the old. If CourtListener now answers differently from the record, the author loses that override and the red code returns. This is existing behaviour and is what principle 4 wants. The design leaves it, and the Open_Note does not mention it.
4. **Edge case outside the requirement text.** A Document can hold a quote result and no full citation, so it is in the Check_Date_Gap while Verify is disabled. The design computes `needsCheckDate` with a `hasFullRecord` guard so that the Next_Step is never a disabled Verify. This differs from the Glossary definition of Check_Date_Gap in that one case. It is for the author to approve.
5. **Existing tests change.** `NextStepInput` gains a required field, so `apps/web/test/next-step.test.ts`, `next-step.properties.test.ts` (through `arbNextStepInput`), `verify-flow.test.ts` (`stepFor`) and `shell-toolbar.tsx` change. `apps/web/test/static/inventory.test.ts` pins the exact list of `// Property N` comments in the web tests, so the new property files make it fail until it is updated in the same task.

### Interpretations the design makes

- "Q12" is read as the question numbered 12 in the author's question message, which the requirements record as Requirement 22 (characters DOCX cannot carry). The repository holds no other trace of the number.
- A note whose text is empty is left out and takes no number, so the numbers in the Notes_Block run 1..N with no gap (Requirement 7 criteria 3 and 5).
- The Open_Flow reads the Appendix title and the end of the filing from the paragraph list with the Sentinel's rules. A footnote added to an export after it was made changes Body_Text (the Notes_Block is appended) and so counts as a change. The Sentinel does not read notes and would report no body drift for the same file. The design accepts the difference: adding a note is an edit to the filing.
- "Has a verification result" means a full citation record whose `result.status` is not `unchecked`, or a quote record whose `result.status` is not `unchecked`. Short forms derive their result from a target and do not count on their own.
- "Has an AI run" means `document.runs` is not empty.
- `removed` counts each removed Docx_Unsafe_Character once, and an unpaired surrogate counts as one. A U+000B or U+000C turned into `\n` and a `\r\n` or lone `\r` turned into `\n` are not removals (Requirement 22 criterion 5).

## Architecture

### Where the code goes

```mermaid
flowchart LR
  subgraph Export["packages/export"]
    Read["docx-read.ts, xml-text.ts, docx-notes.ts, docx-signature.ts"]
    Split["export-split.ts"]
    AppxParse["appendix-parse.ts"]
    Draft["word-draft.ts"]
    Safe["docx-text.ts: docxSafe"]
    Build["statement.ts, appendix.ts, docx.ts (existing)"]
  end
  subgraph Sentinel["crew/sentinel"]
    Analyse["analyse.ts: imports only"]
  end
  subgraph Web["apps/web"]
    OpenFlow["client/open-file.ts and helpers"]
    Input["editor/clipboard.ts, sample loaders, assistant insert"]
    StoreMod["store.ts: replace, openNote"]
    UI["Toolbar, empty page, Issues region, drop"]
  end
  Engine["packages/engine: parseRecord (unchanged)"]
  Engine --> AppxParse
  Read --> Draft
  Split --> Draft
  AppxParse --> Draft
  Read --> Analyse
  Split --> Analyse
  AppxParse --> Analyse
  Draft --> OpenFlow
  Safe --> OpenFlow
  Safe --> Input
  OpenFlow --> StoreMod
  UI --> OpenFlow
  Build --> Web
```

### Shared reader: home, modules and why

**Home: `packages/export`.** Reasons, each checked in the repository:

- The Sentinel's `split.ts` already imports `APPENDIX_TITLE`, `STATEMENT_TITLES` and `buildAppendix` from `@reveal-codes/export`, and computes `INTRO_LENGTH` from `buildAppendix`. The end-of-filing rule is a rule about what the export builder writes. It belongs beside the builder, where a change to the builder and a change to the rule land in one commit and one test run.
- Both consumers already depend on the Export_Package (`crew/sentinel/package.json`, `apps/web/package.json`). No new workspace edge appears.
- `packages/engine` must keep zero runtime dependencies (tech.md) and the reader needs `fflate`. `packages/verifier` is for the network. A new package for a few small modules would need its own manifest, tsconfig, CI entry and a dependency on the Export_Package for the same constants.
- `apps/web` must not import from `crew/sentinel`: that reverses the direction (the Sentinel is a consumer of the product).
- `packages/export` is pure functions over plain data. The reader is one.

Cost, stated: the Export_Package gains a runtime dependency (`fflate` 0.8.3, already a devDependency of this package and a dependency of the Sentinel) and gets larger. `apps/web` already bundles `docx`, which is much larger than `fflate`.

New and moved modules in `packages/export/src` (flat, as the package is today; each under 300 lines, each function under 40):

| Module | Content | Comes from |
| ------ | ------- | ---------- |
| `docx-read.ts` | `readDocx(bytes)`, `readDocxWithNotes(bytes, limits)` | `crew/sentinel/src/docx-read.ts` |
| `xml-text.ts` | `paragraphsOf`, `decodeEntities` | `crew/sentinel/src/xml-text.ts` |
| `docx-notes.ts` | `notesOf(xml, kind)`, `notesBlock(notes)` | new (Req 7) |
| `docx-signature.ts` | `isCompoundFile(bytes)`, `holdsEncryptedPackage(bytes)` | new (Req 14.2) |
| `export-split.ts` | `splitExport(paragraphs)`, `exportDate(paragraphs)` | `crew/sentinel/src/split.ts` |
| `appendix-parse.ts` | `recordedRecord`, `recordedDocument` | `crew/sentinel/src/recorded.ts` |
| `word-draft.ts` | `readWordDraft(bytes, limits)`: classifies a Word file | new (Req 6 to 11) |
| `read-types.ts` | `DocxText`, `ExportParts`, `DocxReadError`, `WordDraft` | `crew/sentinel/src/types.ts` (two types) |
| `docx-text.ts` | `docxSafe(text)`, `holdsDocxUnsafe(text)` | new (Req 22) |

`word-draft.ts` is pure over bytes, so the classification (plain, restored, changed, refused) is tested without a browser, and it is the same code path the Sentinel's split uses. The web module only turns a classification into a Store action and a message. `readWordDraft` keeps its home in `word-draft.ts`; its result carries the record the Appendix parse returned and nothing else from the file.

**Sentinel change set: import paths only.**

- Delete `crew/sentinel/src/docx-read.ts`, `xml-text.ts`, `split.ts`, `recorded.ts` (requirement 1.3: no copy).
- `analyse.ts` and `index.ts` import `readDocx`, `splitExport`, `recordedDocument` from `@reveal-codes/export`. `index.ts` keeps re-exporting them, so the Sentinel's public surface is unchanged.
- `types.ts` re-exports `DocxText` and `ExportParts` from `@reveal-codes/export`. `SentinelError` stays. `DocxReadError` (`not_docx` and `part_too_large`) is assignable to it for the default reader, which only returns `not_docx`.
- `crew/sentinel/package.json` is unchanged. `fflate` stays listed because the Sentinel's tests and test support import it, and `crew/sentinel/test/static/package.test.ts` pins that list.
- The five Sentinel test files that exercise the moved modules (`docx-read.test.ts`, `xml-text.test.ts`, `split.test.ts`, `recorded.test.ts`, `docx-read.properties.test.ts`) stay where they are. Only their import lines change, to `@reveal-codes/export`. Other Sentinel tests that import the moved modules change the same way.
- **`packages/export/test/package.test.ts` changes** because `fflate` moves from `devDependencies` to `dependencies`: the line that pins `devDependencies.fflate` (line 30 today) now pins `dependencies.fflate` at `0.8.3`, and the line that pins "docx as the only third-party runtime dependency" now allows `docx` and `fflate`. These are Export_Package tests, not Sentinel tests.

**Default reader behaviour is the Sentinel's, byte for byte.** `readDocx(bytes)` reads `word/document.xml` only, applies no size limit, and turns any failure into `{ kind: "not_docx" }`. `readDocxWithNotes(bytes, { maxPartBytes })` is the Open_Flow's reader: it also reads `word/footnotes.xml` and `word/endnotes.xml`, and it can return `part_too_large`. One internal `unpack` serves both. The wrapped `try`/`catch` in the reader turns an `fflate` throw into a value; it discards nothing (Requirement 14 criterion 13 applies to the Open_Flow, and the reader is where the failure becomes one of its messages).

**Part size without unpacking.** `fflate`'s `unzipSync` accepts a `filter` that receives each entry's `originalSize` from the central directory. The reader first runs `unzipSync(bytes, { filter })` with a filter that records sizes and returns `false`, so nothing is inflated. If a wanted part declares more than `maxPartBytes`, it returns `part_too_large`. Whether `fflate` bounds the real output to the declared size when a header lies is an assumption to pin by test with a crafted zip, not a fact this design asserts.

**Encrypted files.** `isCompoundFile` tests the eight-byte signature `D0 CF 11 E0 A1 B1 1A E1`. `holdsEncryptedPackage` also looks for the UTF-16LE bytes of `EncryptedPackage` (directory entries store names in UTF-16LE). A compound file without that name is damaged (a renamed `.doc`).

### The Open_Flow in the web app

Modules in `apps/web/src/client/` (browser-side flows, per structure.md), each with one job:

| Module | Job |
| ------ | --- |
| `open-file.ts` | `openFile(file, deps)`: kind, size, read, classify, confirm, install. The Picker and the drop both call it (Req 3.7). |
| `open-text.ts` | Text_File decoding: UTF-8 with `fatal: true`, one BOM removed, `\r\n` and `\r` to `\n`. |
| `open-outcome.ts` | `OpenOutcome` and the pure step from a `WordDraft` or text to an outcome: `docxSafe`, then the text limits. |
| `open-messages.ts` | Every message of Requirement 14 and the Open_Message wordings, including the removed-character sentence. |
| `open-note.ts` | `restoreNote(document)`: the three-case Issues note of Requirement 13 criterion 4. |
| `pasted-document.ts` | `pastedDocument(text, iso)`, moved out of `components/use-document-actions.tsx` so Open and Load demo motion use one construction (Req 8.1). |

Components: `components/use-open.ts` (Picker through a hidden file input whose value is cleared after each use, so the same file opens twice, Req 2.5), `components/use-file-drop.ts` (a capture-phase `drop` and `dragover` listener on `document` that acts only when `dataTransfer.types` includes `"Files"`, calls `preventDefault` and `stopPropagation`, and so never reaches ProseMirror; a drag with no file is untouched, Req 3.5), edits to `toolbar.tsx` and `shell-toolbar.tsx` (button after New, before Load demo motion, no `data-primary`), `editor-surface.tsx` (placeholder and three links), `issues-region.tsx` (Open_Note above the list, below the Draft_Gate notice, in a `role="status"` element) and `use-verify.ts` (clears the note when a run starts).

**`MAX_TEXT_CHARS`.** Today it is defined in `src/server/verify-route.ts` (line 20), and `test/static/boundaries.test.ts` forbids client modules from importing `server/`. The design moves the definition to `apps/web/src/limits.ts`. `verify-route.ts` imports it from there and re-exports the name, so `test/verify-route.test.ts` (which imports it from `verify-route`) is unchanged and there is one definition (Req 21.8). The Open_Flow imports it from `../limits`.

*Boundary test, run.* The rule table in `boundaries.test.ts` (`checksFor`) gives `src/limits.ts` only the `browserBundle` check (no `node:` and no Verifier root), and the file has no imports. A `server/` file may import any module outside `client/`, `components/`, `editor/` and `pane/`; a `client/` file may import any module outside `server/`. `src/limits.ts` is in neither group. To prove it without touching the repository, the test was run in a throwaway copy of `apps/web` under `/tmp`, with `src/limits.ts` added, `server/verify-route.ts` importing and re-exporting it, `client/open-outcome.ts` importing it, and `editor/` importing `docxSafe` from `@reveal-codes/export`: **7 of 7 tests passed.** A negative control in the same copy, a `client/` file importing `../server/verify-route`, failed with `not allowed (server/)`, so the test does bite. The unmodified repository also passes (7 of 7). The copy was deleted; the repository is unchanged. The criterion for the task is that `pnpm --filter @reveal-codes/web test -- test/static/boundaries.test.ts` passes with the real files in place.

*Other static tests checked for `docxSafe`.* `boundaries.test.ts` bans only `node:` and the Verifier root for browser modules, so `@reveal-codes/export` may be imported from `editor/`, `client/` and `components/` (it already is, from `components/` and `print-model.ts`). `forbidden.test.ts` bans direct `docx`, PDF and download-library imports in `apps/web`, not `@reveal-codes/export`; `CLOCK_FREE` covers `src/editor/`, and `docxSafe` reads no clock. `package-json.test.ts` pins the web dependencies, and `@reveal-codes/export` is already listed.

**Store changes.** `StoreState` gains `openNote: string | null` (initial `null`). A new action `{ type: "openNote"; text: string | null }` sets it. `reduceReplace` sets it to `null`, which covers New, Load demo motion and Load the Avianca citations (Req 15.2). `replace` also sets `notice` to `null`, so the Open_Flow dispatches `replace` first and `notice` and `openNote` after, the same order Load demo motion uses. `persist.ts` is untouched, so the note is never stored (Req 15.6). The Open_Flow dispatches `openNote: null` on entry (Req 15.3) and `use-verify.ts` dispatches it on run start.

**`nextRunId` after a restore.** `nextRunId` (`apps/web/src/assistant-run.ts`) returns `r` plus `max(document.runs.length, runLog.length) + 1`. With a full run log that avoided a clash when undo had left `runLog` longer than `document.runs`. With an empty run log it can clash: a Document whose runs are `r1` and `r3` (run `r2` was undone) has `document.runs.length` 2, so the next run would be `r3`, a second run with an existing id. The design changes `nextRunId` to also take the highest number in any `r<digits>` id held by `document.runs` or `runLog`. For contiguous ids the result is unchanged, so existing tests keep passing, and an example test pins the `r1`, `r3` case. This is a change outside the list of modules the requirements name, made because the empty restore needs it. **Approved by the author** (Resolved decision 11).

### Open_Flow algorithm

```mermaid
flowchart TD
  A["file chosen or dropped"] --> B["clear openNote"]
  B --> C{"one file, accepted kind?"}
  C -- no --> R1["refuse: kind or several files"]
  C -- yes --> D{"size over 5 242 880?"}
  D -- yes --> R2["refuse: too large, no read"]
  D -- no --> E["read bytes with File API"]
  E --> F{"text file or word file"}
  F -- text --> G["decode UTF-8, drop BOM, normalise newlines"]
  F -- word --> H["readWordDraft"]
  G -- invalid --> R3["refuse: not UTF-8"]
  H -- refused --> R4["refuse: damaged, encrypted, no filing end"]
  G --> S["docxSafe: count removed"]
  H -- plain or changed --> S
  H -- restored --> J{"recorded text limits, no docxSafe"}
  S --> I{"text limits"}
  I -- empty or too long --> R5["refuse"]
  J -- empty or too long --> R5
  I -- ok --> K{"draft non-empty?"}
  J -- ok --> K
  K -- yes --> L["confirm dialog"]
  K -- no --> M["install"]
  L -- confirm --> M
  L -- cancel --> N["nothing changes"]
```

Refusal order is Requirement 14 criterion 12: kind, size, unreadable or encrypted, part size, then the text limits. The "no filing end" refusal (criterion 9) sits after part size and before the text limits. The text limits apply to the text after `docxSafe` (Requirement 22 criterion 3), so a file that holds only control characters is refused as empty.

## Components and Interfaces

### Export package: `word-draft.ts`

```ts
export type WordLimits = Readonly<{ maxPartBytes: number }>;

export type WordDraft =
  | Readonly<{ kind: "plain"; text: string }>
  | Readonly<{
      kind: "restored";
      record: DocumentRecord; // { document, declaration } as parseRecord returns it
      exportedOn: string | null; // YYYY-MM-DD, or null when the line does not have that shape
    }>
  | Readonly<{ kind: "changed"; text: string }>
  | Readonly<{ kind: "refused"; reason: "damaged" | "encrypted" | "no_filing_end" }>;

export function readWordDraft(bytes: Uint8Array, limits: WordLimits): WordDraft;
```

Steps, in order:

1. `holdsEncryptedPackage(bytes)` gives `refused / encrypted`. `isCompoundFile(bytes)` without it gives `damaged`.
2. `readDocxWithNotes(bytes, limits)`. `not_docx` and `part_too_large` give `refused / damaged` (Requirement 14 criterion 10: an oversize part is "damaged").
3. If no paragraph equals `APPENDIX_TITLE`: `plain`, with `text = paragraphs.join("\n") + notesBlock(notes)`.
4. Otherwise `splitExport(paragraphs)`. `not_reveal_codes_export` gives `refused / no_filing_end`.
5. `bodyText = body.join("\n") + notesBlock(notes)`. `recordedRecord(appendix)`. If it parses and `record.document.text === bodyText`, `restored`, with `exportedOn = exportDate(paragraphs)`. Otherwise `changed` with `text = bodyText` (an unparseable Appendix is a changed export, Requirement 10 criterion 6).

`readWordDraft` does not call `docxSafe`: the Open_Flow applies it to `plain` and `changed` text and to nothing in `restored`.

Because `splitExport` is the Sentinel's function, the Open_Flow and the Sentinel cut the body at the same place and agree on whether a file was edited, with the one difference noted under "Interpretations".

### Export package: `docx-text.ts`

```ts
export type DocxSafe = Readonly<{ text: string; removed: number }>;

/** Docx_Safe_Text: U+000B and U+000C become "\n"; "\r\n" and a lone "\r" become "\n";
 *  every other Docx_Unsafe_Character is removed and counted. */
export function docxSafe(text: string): DocxSafe;

/** True when the text holds any Docx_Unsafe_Character, U+000B and U+000C included. */
export function holdsDocxUnsafe(text: string): boolean;
```

XML 1.0 allows U+0009, U+000A, U+000D, U+0020 to U+D7FF, U+E000 to U+FFFD and U+10000 to U+10FFFF. Everything else is unsafe, an unpaired surrogate included. One table of allowed ranges serves both functions. `docxSafe` is idempotent (`docxSafe(docxSafe(s).text).text` equals `docxSafe(s).text`, and the second `removed` is 0) and returns its input unchanged when the input holds no unsafe character and no `\r`. `holdsDocxUnsafe` exists because the export guard must also see U+000B and U+000C, which `docxSafe` converts and does not count. The module imports nothing and runs in the browser and under Node.

### Where the export date is

Confirmed by reading the builder. `renderStatement` (`packages/export/src/render-statement.ts`) ends with `{ kind: "signature", line: signatureLine(statement), date: statement.generatedDate }`. `blockElement` in `docx-blocks.ts` turns that block into two `singleParagraph`s, the signature line and then the date. `buildDocx` (`docx.ts`) places `titleParagraph(appendix.title)` straight after `statementElements(...)`. `generatedDate` is `localDate(meta.now)` (`YYYY-MM-DD`, host time zone). So the date line is the paragraph immediately before the last paragraph equal to `APPENDIX_TITLE`.

One detail was checked: `titleParagraph` starts its paragraph with a `PageBreak` run (`<w:br w:type="page"/>`). The reader's `breaksLine` returns `false` for a break whose type is not `textWrapping`, so the paragraph text is exactly the title and `lastIndexOf(APPENDIX_TITLE)` finds it (the Sentinel relies on the same behaviour today).

`exportDate(paragraphs)` returns the paragraph at `lastIndexOf(APPENDIX_TITLE) - 1` when it matches `/^\d{4}-\d{2}-\d{2}$/`, else `null`. The shape test is the only validation, which also keeps arbitrary file text out of the message. The date is not compared with anything: the statement pages are never imported and never compared.

### Restoring the run log

A restore installs an empty Run_Log and no Verification_Time, because the file carries neither the tool names of assistant runs nor the check date (Requirement 13 criterion 1).

```ts
// client/open-file.ts, after the confirm
store.dispatch({
  type: "replace",
  document: record.document,
  runLog: [],
  verifiedAt: null,
  declaration: record.declaration,
});
store.dispatch({ type: "notice", text: reopenedMessage(file.name, exportedOn) });
store.dispatch({ type: "openNote", text: restoreNote(record.document) });
```

`reduceReplace` runs `declarationAfter(declaration, document, false)`, which drops a `pasted_text` Declaration when the restored Document holds no substantive pasted text, as Requirement 12 criterion 3 says. The span timestamps and override timestamps come back inside `record.document` unchanged (Requirement 13 criterion 8). The Document is not passed through `docxSafe` (Requirement 22 criterion 4).

**The Issues note.** `restoreNote(document)` is driven by two booleans, `hasAiRun` (`document.runs.length > 0`) and `hasResult` (a full citation or a quote with a status other than `unchecked`):

| `hasAiRun` | `hasResult` | Open_Note |
| ---------- | ----------- | --------- |
| yes | yes | "The tool names of the assistant runs and the check date were not in this file, so the next statement cannot give them. Run Verify to check the citations again and record the date." |
| yes | no | "The tool names of the assistant runs were not in this file, so the next statement cannot name them." (unchanged, no added sentence) |
| no | yes | "The check date was not in this file, so the next statement cannot give it. Run Verify to check the citations again and record the date." |
| no | no | no note (`null`) |

The added sentence is in the two rows where the Document holds a Verification_Result, because those are the two rows in which the Document is in the Check_Date_Gap after a restore (`verifiedAt` is `null`). It matches the Next_Step, which is Verify in those two rows (next section). `restoreNote` and `needsCheckDate` read the same `hasVerificationResult` helper, so the note and the Next_Step cannot disagree.

**Verified against the code.** A Document with AI spans and an empty Run_Log is accepted by both consumers:

- **Store.** `reduceReplace(state, document, runLog, verifiedAt, declaration)` stores the arrays as given (`runLog ?? []`, `verifiedAt ?? null`). `reduceEdit` replaces a run-log entry with the same Run_Id and appends otherwise, so later runs append to an empty log. `nextRunId` is changed as described above so an empty log cannot reuse an id. `persist.ts` stores `[]` and `null` as it does for New.
- **`buildStatement`.** It reads `runLog.length` for `runCount` and `toolsOf(document, runLog)` for the tools, and `meta.verifiedAt` for the date. `toolsOf` iterates the run log, so an empty log gives `[]`. Nothing requires every run in `document.runs` to have an entry. An AI Document with `runLog = []` builds with `runCount` 0 and no tools.
- **The statement.** `render-order.ts` prints the how-used sentence only when `s.runCount > 0` (line 54) and the prompt-records sentence only when `s.assistantText && s.runCount > 0` (line 73). With `runCount` 0 neither prints. `toolList` returns "not recorded" for no tools (`wording.ts` line 59), `toolsSentence` returns "The generative artificial intelligence program used is not recorded." (line 157), and `citationParagraph` prints "a date that was not recorded" for a `null` date (line 90).

What the Store holds after a restore, and what the next statement prints, for each item:

| Item | Store holds | Next statement prints |
| ---- | ----------- | --------------------- |
| Tool of each AI run | `runLog = []` | "Tools: not recorded" in the AI-use paragraph, and "The generative artificial intelligence program used is not recorded." where the order names the program. Nothing is printed for a filing with no AI text. |
| Run count and prompts | `runLog.length` 0, no prompt, no timestamp | no sentence about how the program was used and none about prompt records |
| Verification_Time | `verifiedAt = null` | "a date that was not recorded" in the citation paragraph |
| Court and judge | none selected | the author picks again; no order sentences until then |
| Confidentiality tick | unticked | the sentence is not printed until the author ticks |
| Declaration | the recorded Declaration, kept or dropped by `declarationAfter` | the Declaration sentence, as recorded |
| Spans, results, overrides | as recorded, inside the Document | counts and tables of the Document, with the recorded timestamps |

### Next_Step after a restore

**Verify's start, checked.** `runVerifyFlow` does not act on unchecked items only. `buildVerifyBody` returns every record with `kind === "full"`, whatever its result. The answers go through `setVerification`, which overwrites a `verified` result with the new one. `runQuotePhase` checks the quotes of every cluster whose owner is `verified`, and `applyQuoteChecks` writes each result. When both phases finish, the flow dispatches `{ type: "verified", at: now().toISOString() }` and `reduceVerified` stores it as `verifiedAt`. A restored Document with no unchecked item is therefore re-checked and gets its check date. Only the Next_Step rule counts unchecked items. No change to Verify is needed. The Verify button for a restored Document is enabled whenever it holds a full citation: `verify.disabled = running || !hasFullRecord(document)` (`use-verify.ts`).

**Input.** `nextStep` in `apps/web/src/components/next-step.ts` takes one more required input.

```ts
export type NextStepInput = Readonly<{
  empty: boolean;
  verifying: boolean;
  verifiableUnchecked: number;
  /** The Document is in the Check_Date_Gap and Verify can run (see needsCheckDate). */
  needsCheckDate: boolean;
  blocking: number; // ignored by the rules
}>;

export function nextStep(input: NextStepInput): NextStep {
  if (input.verifying) return "none";
  if (input.empty) return "load-demo";
  if (input.verifiableUnchecked > 0 || input.needsCheckDate) return "verify";
  return "export";
}
```

The rule order is the one of Requirement 13 criterion 11: in flight gives none, empty gives Load demo motion, then Verify when the count is above 0 or the Document needs the check date, otherwise Export. Requirement 13 criterion 14 holds because `needsCheckDate: false` gives exactly the old function. The field is required, not optional, so a caller that forgets it fails `pnpm typecheck`. Callers updated in the same task: `shell-toolbar.tsx`, `test/next-step.test.ts` (`BASE`), `test/arbitraries.ts` (`arbNextStepInput`), `test/verify-flow.test.ts` (`stepFor`).

**Computation.** A new module `apps/web/src/client/check-date.ts` holds two pure functions and is imported by `shell-toolbar.tsx` and `open-note.ts`:

```ts
/** Verification_Result (Glossary): a full citation or a quote whose status is not "unchecked". */
export function hasVerificationResult(document: Document): boolean;

/** The Check_Date_Gap, limited to a Document that Verify can run on. */
export function needsCheckDate(document: Document, verifiedAt: string | null): boolean {
  return verifiedAt === null && hasVerificationResult(document) && hasFullRecord(document);
}
```

`ShellToolbar` receives `verifiedAt` from the Store state beside `doc` and passes `needsCheckDate: needsCheckDate(doc, verifiedAt)`. A short form does not count in `hasVerificationResult`, as the Glossary says. The `hasFullRecord` term mirrors `verify.disabled`. Without it a Document with a quote result and no full citation would show Verify as the primary button while the button is disabled, and the author would have no next step. With it, that Document gets Export.

**Behaviour.**

| State | Next_Step |
| ----- | --------- |
| Restore, results held, `verifiedAt` null, nothing unchecked | `verify` |
| The same, run in flight | `none` |
| The same, after a completed run (`verifiedAt` not null) | `export` |
| Opened text (Plain_Reading, Text_File, changed export): no result | follows the old rules (`verify` only when a full citation is unchecked) |
| Document with results and `verifiedAt` not null | the old rules |
| Restore, red codes without override | `verify` while the check date is missing; the export gate blocks as before |

**Gate unchanged (Requirement 13 criterion 12).** `needsCheckDate` and the step are read only by the Toolbar's primary-button choice. `canExport` and the export gate take the Document, the overrides and the court, and never the Next_Step, so a `CIT ✘`, `CIT ≠`, `CIT ?`, `CIT …`, `QUO ✘` or `QUO …` code without an override blocks export while the primary button says Verify. The Export button is a different button from the primary one and stays enabled or disabled by the gate.

**Requirement 13 criteria 11 to 14, traceability.** The design has no separate traceability section. Each criterion is covered here and by the properties named in the last column.

| Criterion | Where the design meets it | Tests |
| --------- | ------------------------- | ----- |
| 13.11 Next_Step is Verify in the gap | `NextStepInput.needsCheckDate`, rule order above, `needsCheckDate()` | Property 5 |
| 13.12 gate unchanged, restored override still counts | gate takes no Next_Step; `canExport` unchanged | Property 7, restore example |
| 13.13 completed run: check date set, gap closed, old rules | `runVerifyFlow` dispatches `verified`; `reduceVerified` | example test on a restored Store with a fake API; Property 5 |
| 13.14 not in the gap: previous behaviour | `needsCheckDate: false` gives the old function | Property 6 |


### Q12: characters DOCX cannot carry

**Decided: `docxSafe` at every Entry_Point, with an export refusal as backstop. The arbitrary is not narrowed.**

**Amendment of Requirement 22 criterion 1 (already in requirements.md).** The criterion first described one function. It now describes two over one table of allowed ranges. `docxSafe(text)` returns the Docx_Safe_Text and the removed count, and converts U+000B and U+000C to `\n` without counting them. `holdsDocxUnsafe(text)` is true exactly when the text holds any Docx_Unsafe_Character, U+000B and U+000C included, and is false for the text of any `docxSafe` result. The split exists because the export guard must see U+000B and U+000C, which `docxSafe` has already converted at the Entry_Points and so never reports. This design implements the amended criterion; no further change to the requirement is needed.

Evidence for the choice:

1. **What the export does today.** A probe of `docx` 9.15.3 (the version in `packages/export/package.json`), run in this repository by writing `"x" + char + "y"` into a `TextRun` and reading `word/document.xml` back, shows:
   - U+0000 to U+0008, U+000B, U+000C and U+000E to U+001F are removed from the output. Nothing reports it.
   - U+FFFE and U+FFFF are written through. XML 1.0 does not allow them, so Word or a strict parser may reject the file.
   - `\t`, U+0085, U+2028, U+FEFF and astral code points survive. `\r` is written as a raw `\r`, which an XML parser reads as `\n`.
   - An unpaired surrogate becomes U+FFFD.
2. **What the editor lets in.** `apps/web/src/editor/clipboard.ts` normalises `\r\n` and `\r` and nothing else. The Engine rejects unpaired surrogates in a Document and the Tool_Name rule rejects Cc characters, but ordinary text may hold U+000B or U+000C. Word puts U+000B in the clipboard text of a soft line break.
3. **What the existing arbitraries generate.** `arbText` (under `arbDocument`) draws printable ASCII, `\n`, `\t`, the code syntax characters, quotes, and astral code points, with surrogates only in pairs. It never draws a C0 control other than `\t` and `\n`, never `\r`, never U+FFFE or U+FFFF. The failure would appear in use, not in the existing tests. That is why a new arbitrary is added (below) and the existing one is left as it is.
4. **What the failure looks like without the fix.** A pasted U+000B reaches the Document. The export drops it from the body and from the Appendix text alike, so the two still match, the file is restored, and the restored Document is a different filing from the one the author exported, with no message.

**Where `docxSafe` is applied** (one call each, the result's `text` is used; `removed` is used only by Open):

| Entry_Point | Module | Note |
| ----------- | ------ | ---- |
| Paste and drop | `editor/clipboard.ts`, in `plainTextOf` | replaces the `normaliseNewlines` call; `normaliseNewlines` stays exported for its current tests |
| Demo motion and Avianca citations | `components/use-document-actions.tsx`, before `pastedDocument` | the loaders get text from `svc.api`; no message, the fixtures are clean |
| Assistant insertion | `components/use-assistant.ts`, in `insertReply`, on the whole reply | applied once to the accumulated reply, not per chunk, so a surrogate pair split across two chunks is never cut |
| Open (Text_File, Plain_Reading, body-only import) | `client/open-outcome.ts` | before the text limits; `removed` goes to the Open_Message |

A restore is not sanitised (Requirement 22 criterion 4). `readWordDraft` does not call `docxSafe`. Typed text is not covered: a keyboard does not produce these characters, and the export guard catches any that arrive another way.

**Open_Message.** After the sentence of Requirement 8 criterion 3, when `removed` is at least 1, the message carries " <k> characters that Word files cannot store were removed." and, when `removed` is 1, " 1 character that Word files cannot store was removed." When `removed` is 0 it carries nothing. After that comes the sentence of Requirement 7 criterion 7 when the text holds a Notes_Block. `open-messages.ts` builds the three parts in that order.

**Export refusal.** `client/export-docx.ts` checks `holdsDocxUnsafe` on `document.text` and on every override reason, after the existing order and gate checks and before `buildStatement`. A hit dispatches a `notice` with the text "This draft holds a character that Word files cannot store, so it was not exported. Paste the text again or remove the character." (a constant in `notices.ts`, beside `EXPORT_FAILED`), returns `{ status: "failed" }`, downloads nothing and leaves the Document unchanged (Requirement 22 criterion 8). The check covers the two places the requirement names. A Declaration Tool_Name is already barred from control characters by the pasted-text-declaration rule.

**Tests.** The existing arbitraries are not changed. A new `arbDocxHostileText` (below) feeds Property 4. A failing run is recorded in BUILD_LOG.md with its shrunk counterexample (Requirement 18 criterion 8).

## Data Models

| Type | Where | Shape |
| ---- | ----- | ----- |
| `DocxReadError` | `packages/export/src/read-types.ts` | `{ kind: "not_docx" } \| { kind: "part_too_large" }` |
| `WordDraft`, `WordLimits` | `packages/export/src/word-draft.ts` | above |
| `DocxSafe` | `packages/export/src/docx-text.ts` | `{ text: string; removed: number }` |
| `StoreState.openNote` | `apps/web/src/store.ts` | `string \| null`, not persisted |
| `OpenOutcome` | `apps/web/src/client/open-outcome.ts` | below |

```ts
export type OpenOutcome =
  | Readonly<{ kind: "refused"; note: string; notice: string }>
  | Readonly<{
      kind: "text";
      text: string; // after docxSafe
      removed: number; // characters docxSafe removed, for the Open_Message
      notice: string;
      note: string | null;
    }>
  | Readonly<{
      kind: "restored";
      record: DocumentRecord; // installed unchanged, not sanitised
      notice: string;
      note: string | null;
    }>;
```

- `kind: "text"` covers a Text_File, a Plain_Reading and a changed export. Its `note` is the changed-export Open_Note (Requirement 10 criterion 4) or `null`. It installs as one `PST` span through `pastedDocument`, then `Declaration` Pending (`null`), `runLog` `[]`, `verifiedAt` `null`, no override and no result (Requirement 8 criterion 2).
- `kind: "restored"` carries no `removed`: a restore is not sanitised.
- The `notice` is the Toolbar text. For a refusal it is "Could not open <file name>." (Requirement 14 criterion 11); for several dropped files it is "Open one file at a time." with no name (criterion 8).
- Messages are string builders in `open-messages.ts`. They hold the exact wording of Requirement 14 and Requirement 8 criterion 3, Requirement 9 criterion 5 and 6, Requirement 7 criterion 7, Requirement 10 criterion 4 and Requirement 22 criterion 5, so a test can pin each one.
- The text limits use the White_Space test `!/\P{White_Space}/u.test(text)` for "empty" (the predicate `holdsSubstantivePasted` already uses), and `text.length > MAX_TEXT_CHARS` for "too long", both on the text after `docxSafe`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Reflection. The prework found these overlaps and the design resolves them. The restore criteria (9.2, 9.3, 9.7, 9.10, 12.1, 13.8) are one property (Property 2), and the changed-export criteria (9.9, 10.1 to 10.7) are another (Property 3). The criterion that red codes still block export after a reopen (9.7) follows from structural equality of the Document and is checked inside Property 2 by comparing `canExport` before and after. The criterion that the Open_Flow and the Sentinel agree on whether a file was edited (9.9) follows from sharing `splitExport` and is checked inside Property 3 by comparing the Sentinel's `body_edited` Finding. The default-reader behaviour for the Sentinel (1.9) is an example test, not a property. The empty Run_Log and null check date after a restore (13.1) are a fixed install, so they are example tests. The README, ordering of refusals, the Toolbar and the empty page are examples. The Next_Step criteria (13.11, 13.12, 13.14) are Properties 5, 6 and 7, because `nextStep` and `needsCheckDate` are pure; criterion 13.13 (a completed run closes the gap) needs the Store and a fake API, so it is an example test. The restore-note strings (13.4) are one property over the two booleans (Property 13).

Each property is one `fc.assert(fc.property(...))` (or `fc.asyncProperty` where the body awaits `buildDocx`) in a file named `<module>.properties.test.ts`, with `// Property N` above it and `_Requirements: x.y_` in the `describe` title, at `numRuns` 200 locally and 500 in CI. The numbers match Requirement 18 and Requirement 22: Properties 1 to 4 are the four the requirements name, and they keep their numbers. Properties 5 to 7 cover the Next_Step of Requirement 13 criteria 11 to 14, and Properties 8 to 14 follow in order.

### Property 1: Word text round trip

For any list of paragraphs that hold no `\n` and no character XML 1.0 cannot carry, a Word_File built from them with the Export_Package's `filingParagraph` and read with `readDocx` returns the paragraphs. The paragraphs include leading and trailing spaces, tabs, quotation marks, `&`, `<`, `>`, non-ASCII characters and empty paragraphs.

**Validates: Requirements 6.2, 6.3, 6.8, 6.9, 18.2, 18.3**

### Property 2: A reopened export is the exported Document

For any Document (existing `arbDocument`, with overrides and every verification status), any Applicable_Declaration for either subject (including Tool_Names with brackets, parentheses and quotation marks), any Run_Log and any Verification_Time or none, exporting with `buildStatement` and `buildDocx` and reading the file with `readWordDraft` gives `restored`, a Document equal by `structuralEqual` to the original, and the same Declaration. `canExport` over the restored Document equals `canExport` over the original, for every court. The Run_Log and the Verification_Time are generated to show that they do not affect what is restored.

**Validates: Requirements 9.2, 9.3, 9.7, 9.10, 12.1, 12.5, 13.8, 18.4**

### Property 3: A changed export imports as pasted body text

For any Document that exports, and any single-character change to any body paragraph of the exported file, `readWordDraft` gives `changed` with text equal to the changed body, and the installed Document is one `PST` span over that text with no Declaration and the Open_Note of Requirement 10 criterion 4. The Sentinel's `analyseFile` over the same file reports a `body_edited` Finding exactly when `readWordDraft` reports `changed`.

**Validates: Requirements 9.9, 10.1, 10.2, 10.5, 10.6, 10.7, 18.5**

### Property 4: DOCX-safe text

For any string, including any sequence of UTF-16 code units, `docxSafe` returns text with no Docx_Unsafe_Character, `docxSafe` of that text returns the same text with `removed` 0, and `docxSafe(s).text` equals `s` when `s` holds no Docx_Unsafe_Character and no `\r`. For any Document whose text came from `docxSafe` of a string drawn from `arbDocxHostileText`, exporting and reopening returns a Document equal to the original by `structuralEqual`. The string drawn includes U+0000 to U+001F, U+FFFE, U+FFFF and unpaired surrogates, and the existing arbitraries are not narrowed.

**Validates: Requirements 22.1, 22.2, 22.6, 22.7, 18.6**

### Property 5: A missing check date makes Verify the next step

For any Document and any Next_Step input with `verifying` false and `empty` false, `needsCheckDate` true gives `verify`, whatever `verifiableUnchecked` and `blocking` are, including `verifiableUnchecked` 0. For any Document that holds a Verification_Result and a full citation and a Store with `verifiedAt` null, `needsCheckDate` is true; with `verifiedAt` not null, or with no Verification_Result, it is false. The rule order holds: `verifying` gives `none` and `empty` gives `load-demo`, whatever `needsCheckDate` is.

**Validates: Requirements 13.11, 13.13**

### Property 6: Outside the gap the Next_Step is unchanged

For any Next_Step input with `needsCheckDate` false, `nextStep` returns what the function returned before this spec: `none` while verifying, else `load-demo` when empty, else `verify` when `verifiableUnchecked` is above 0, else `export`. The expected value is written as a separate table in the test, not as a second copy of the function.

**Validates: Requirements 13.14, 8.4**

### Property 7: Red codes still block export while the Next_Step is Verify

For any Document with at least one red code (`CIT ✘`, `CIT ≠`, `CIT ?`, `CIT …`, `QUO ✘` or `QUO …`) that has no override, any court, and any `verifiedAt`, `canExport` is false whether `nextStep` returns `verify` or `export`; and `canExport` is the same for a Document before and after its Next_Step input changes. For a restored Document, an override that the record held still counts.

**Validates: Requirements 13.12, 9.7**

### Property 8: The statement and the Appendix are never body text

For any Document, including one whose text holds a line equal to a member of `STATEMENT_TITLES`, and for both a restore and a body-only import, no paragraph at or after the Filing_End appears in the text the Open_Flow installs. The text is the paragraphs before the last statement title that precedes the Appendix title, joined with `\n`.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 9: The reader is total

For any bytes, including truncated zips, zips with random part content and random data, `readDocx` and `readDocxWithNotes` return a value and throw nothing.

**Validates: Requirements 1.6**

### Property 10: UTF-8 text round trip

For any string with no `\r` and no Docx_Unsafe_Character, encoded as UTF-8 with or without a leading byte-order mark, `decodeTextFile` returns the string. For any string with `\r\n` or lone `\r` and no Docx_Unsafe_Character, it returns the string with each replaced by `\n`.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6**

### Property 11: Opened text installs as one PST span

For any accepted text, including text that holds Docx_Unsafe_Characters, installing it through the Open_Flow gives a Document with exactly one span, of origin `PST`, covering the whole text after `docxSafe`, with the current time, and a Store with Declaration `null`, an empty run log, no verification time, no override and no verification result. The Open_Message carries the removed-character sentence exactly when `removed` is at least 1, with `removed` as its count.

**Validates: Requirements 8.1, 8.2, 8.6, 22.3, 22.5**

### Property 12: Notes are numbered 1..N without separators

For any list of footnote and endnote entries, including Separator_Notes and notes with empty text, `notesBlock` lists only the notes with text, numbered from 1 with no gap, footnotes before endnotes in part order, one line each with paragraphs joined by a single space and line breaks and tabs as spaces; and it is the empty string when no note has text.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**

### Property 13: The restore note follows AI runs and verification results

For any Document, `restoreNote` returns the note of Requirement 13 criterion 4 for the case given by "has an AI run" and "has a verification result", and returns `null` when the Document has neither. The strings are exact: with AI runs and results, "The tool names of the assistant runs and the check date were not in this file, so the next statement cannot give them. Run Verify to check the citations again and record the date."; with AI runs only, "The tool names of the assistant runs were not in this file, so the next statement cannot name them."; with results only, "The check date was not in this file, so the next statement cannot give it. Run Verify to check the citations again and record the date." The sentence "Run Verify to check the citations again and record the date." ends the note exactly when the Document holds a Verification_Result, and appears in no other note. "Has a verification result" is `hasVerificationResult`, the helper `needsCheckDate` reads.

**Validates: Requirements 13.2, 13.3, 13.4, 13.5**

### Property 14: A refusal changes nothing but the note and the message

For any file the Open_Flow refuses, and any prior Store state, the Store after the open equals the Store before except for `openNote` and `notice`, and no confirm dialog opened.

**Validates: Requirements 4.6, 4.7, 14.11, 19.1**

## Error Handling

| Condition | Result | Where it is decided |
| --------- | ------ | ------------------- |
| Not an Accepted_Kind | Open_Note "<file name> is not a .docx, .txt or .md file. Choose one of those." | `open-file.ts`, first |
| Several files dropped | Open_Note "Open one file at a time. Drop a single file." and Toolbar "Open one file at a time." | `use-file-drop.ts` |
| Over 5 242 880 bytes | refused before the bytes are read | `open-file.ts`, from `File.size` |
| Not a zip, no `word/document.xml`, cannot unpack | damaged message | `readWordDraft` returns `refused / damaged` |
| Compound file with `EncryptedPackage` | password-protected message | `refused / encrypted` |
| A part over 32 MiB when unpacked | damaged message, part not unpacked | `part_too_large` mapped to `damaged` |
| Appendix title but no statement title before it | filing-could-not-be-separated message | `refused / no_filing_end` |
| Text empty after `docxSafe` and the White_Space test, or over 200 000 | empty and too-long messages | `open-outcome.ts`, last; the length test also applies to restored text |
| Not valid UTF-8 (including UTF-16) | not-UTF-8 message | `open-text.ts` with `TextDecoder("utf-8", { fatal: true })` |
| Anything unexpected in a Word_File | the damaged message | `open-file.ts` |
| Anything unexpected in another file | Toolbar "Could not open <file name>." | `open-file.ts` |
| Appendix does not parse, or body differs | `changed`: one `PST` span, no Declaration, changed-export note | `readWordDraft` |
| Stored draft holds a Docx_Unsafe_Character in the text or an override reason | export refuses with "This draft holds a character that Word files cannot store, so it was not exported. Paste the text again or remove the character."; nothing downloads; the Document is unchanged | `exportDocx` guard |

No `try`/`catch` in the Open_Flow discards an error. The only `try` is the one in the reader around `unzipSync`, which turns the throw into a `DocxReadError` value. `File.arrayBuffer()` and `TextDecoder` failures become the messages above through the unexpected-failure rule. Every refusal leaves the Document, the history, the Declaration, the verification time and the stored draft unchanged, because no `replace` is dispatched on a refusal and the confirm dialog opens only after every refusal check has passed.

## Testing Strategy

**Property-based tests** use `fast-check` with `vitest`, one `fc.assert` per property, files named `<module>.properties.test.ts`. They sit with their module:

| File | Properties |
| ---- | ---------- |
| `packages/export/test/docx-read.properties.test.ts` | 1, 9, 12 |
| `packages/export/test/word-draft.properties.test.ts` | 2, 3, 8 |
| `packages/export/test/docx-text.properties.test.ts` | 4 |
| `apps/web/test/next-step-gap.properties.test.ts` | 5, 6, 7 |
| `apps/web/test/open-file.properties.test.ts` | 10, 11, 13, 14 |

New shared arbitraries live in `packages/export/test/support/arbitraries.ts`, the Export_Package equivalent that Requirement 18 criterion 7 allows, because `packages/engine` is not changed by this spec and the arbitraries are used by three export test files: `arbParagraphs` (paragraph lists with leading and trailing spaces, tabs, quotation marks, `&`, `<`, `>`, non-ASCII characters and empty paragraphs), `arbBodyEdit` (one single-character change to a body paragraph) and `arbDocxHostileText` (text that includes U+0000 to U+001F, U+FFFE, U+FFFF and unpaired surrogates). `arbDocument`, `arbText` and `arbRunLog` are not changed, and Properties 1 to 3 keep using the existing arbitraries.

**Example tests** pin the following; each asserts message text where it names one.

- Each refusal of Requirement 14, with the Document, stored draft and history unchanged and no confirm dialog opened, plus the refusal order of criterion 12 with files that fail two checks.
- A text file with a BOM and Windows endings, and a lone `\r`.
- The `.docx` fixture of Requirement 19 criterion 3: a table, a tracked deletion, a tracked insertion, two footnotes, one endnote and Word's separator notes, with the exact text and the Notes_Block and the sentence of Requirement 7 criterion 7.
- The Picker and a drop reaching `openFile` with the same bytes and producing the same Document.
- Confirm-before-replace: dialog for a non-empty draft, none for an empty one, Cancel changes nothing, Confirm replaces.
- The three Toolbar messages, the Open_Note in the Issues region and its clearing by New, the empty-page text and its three links in order, the Open button after New, and zero `fetch`, `XMLHttpRequest`, `sendBeacon` and form-post calls during an open.
- The restore install: `replace` with `runLog: []` and `verifiedAt: null` for a Document with AI spans, accepted by `reduceReplace`, and `buildStatement` on that state builds. The Open_Note for each case of Requirement 13 criterion 4 and no note for criterion 5. The statement built after a restore prints no sentence about prompt records (Requirement 19 criterion 16).
- `nextStep` and the Check_Date_Gap, in `apps/web/test/next-step.test.ts` and `verify-flow.test.ts`: a gap with no unchecked item gives `verify`; the same state while a run is in flight gives `none`; an empty Document gives `load-demo`; a Document not in the gap gives what it gave before; and a restored Store (results held, `verifiedAt` null, nothing unchecked) after `runVerifyFlow` against a fake API that answers every record has a `verifiedAt` that is not null, the already-verified results re-checked, and `export` as the Next_Step. A second example restores a Document with a `CIT ✘` and no override, and asserts that the Next_Step is `verify` and that the export gate still blocks. A third pins the edge case of Flag 4: a quote result with no full citation gives `export`, not `verify`.
- `nextRunId` for a Document whose runs are `r1` and `r3` with an empty run log gives `r4`, and for contiguous ids gives what it gave before.
- Requirement 22: `docxSafe` at paste, drop, the two samples and assistant insertion (a reply that splits a surrogate pair across chunks is not cut); the Open_Message for `removed` 0, 1 and more than 1, with the sentences in the order of Requirement 7 criterion 7; a restore of a record that holds an unsafe character is not changed; and the export refusal for a stored draft with a Docx_Unsafe_Character in the text and in an override reason, with the exact message, nothing downloaded and the Document unchanged.
- The Sentinel: every existing Sentinel test passes with import paths changed only.
- A zip whose central directory declares a small part but whose stream is larger, to settle the `fflate` size-header question.
- Static tests: no copy of the moved modules, no `node:` or DOM import in the shared modules, no `try`/`catch` that discards in the Open_Flow, no route under `apps/web/app/api` for opening, the docs tests of Requirement 17 criterion 4, and `boundaries.test.ts` with `src/limits.ts` in place.

**Fixtures** are built by a deterministic helper in the Export_Package tests: `docx` for paragraphs, tables, tracked changes and footnotes, then a post-processing step with `fflate` that adds `word/endnotes.xml` with its content-type and relationship entries (the `docx` library writes none), with every date and zip timestamp fixed. A password-protected stand-in is a compound-file header with an `EncryptedPackage` stream name. Also built: a truncated zip, a zip without `word/document.xml`, and an export edited by one character. A file saved by Word is out of scope (Requirement 19 criterion 14).

**Fixtures and arbitraries land before the first test that uses them.** The fixture builder, the endnotes helper and the shared arbitraries are tasks of their own, not part of a test task, and each is committed with its own self-test (the builder's output bytes are identical on two runs; the endnotes helper's output holds `word/endnotes.xml` with its content-type and relationship entries) before any test imports it.

| Helper | First test that uses it | Lands in step |
| ------ | ----------------------- | ------------- |
| Fixture builder (`docx` paragraphs, tables, tracked changes, footnotes, fixed dates and zip timestamps) | the reader examples of Requirement 19 criterion 3 and `readWordDraft` examples | 3, first |
| Endnotes helper (`fflate` post-processing) | the same reader example (one endnote) and Property 12 | 3, with the builder |
| `arbParagraphs`, `arbBodyEdit` | Properties 1, 3 and 8 | 3, before those tests |
| `arbDocxHostileText` | Property 4 (the `docxSafe` property) | 4, before Property 4 |
| Restore helpers (export a Document, reopen it, compare by `structuralEqual`) | Properties 2, 3 and 4 and the restore examples | 3, before Property 2 |
| `needsCheckDate` fixtures (a restored Store, a fake API) | the Next_Step examples and Property 7 | 5, before those tests |

Property 4's round-trip half uses the fixture builder and the restore helpers from step 3, so step 4 depends on step 3.

**Why property tests apply.** The reader, the split, the classification and `docxSafe` are pure functions of bytes or plain data with round-trip and invariant statements. The Toolbar, the drop handling, the empty page and the messages are UI wiring and wording, so they are example tests.

### Order of landing

The author asked for the shared reader first. Each step keeps `pnpm lint`, `pnpm typecheck` and `pnpm test` green.

1. **Spec.** Commit the spec (`spec(open-draft): ...`) before any implementation task (Requirement 21 criterion 1).
2. **The shared reader move.** Move the four modules into `packages/export/src`, add `read-types.ts`, move `fflate` to `dependencies`, update `packages/export/test/package.test.ts`, change Sentinel import paths. No behaviour changes. This step ships on its own.
3. **Reader additions and `word-draft.ts`.** The fixture builder, the endnotes helper, `arbParagraphs`, `arbBodyEdit` and the restore helpers first, each with its self-test, then notes, part-size limit, signature check, `readWordDraft`, and Properties 1, 2, 3, 8, 9 and 12.
4. **`docxSafe` with the editor-input changes.** `docx-text.ts`, the calls in `clipboard.ts`, the sample loaders and the assistant insertion, the export guard and its notice, then `arbDocxHostileText`, then Property 4.
5. **The app.** `limits.ts` with the `verify-route.ts` change and the boundary test run, the Store `openNote`, the `nextRunId` change, `client/check-date.ts` and the `needsCheckDate` input of `nextStep` with its four callers, the Open_Flow modules, Toolbar, drop, empty page, Issues region, restore install, the update of `test/static/inventory.test.ts` for the new `// Property N` comments, Properties 10, 11, 13 and 14, and Properties 5, 6 and 7 with the `needsCheckDate` change.
6. **Documentation and the final checkpoint.** README, KIRO_USAGE, BUILD_LOG, `ui.md`, `structure.md`, `tech.md`, then the checks of Requirement 21 criterion 3.

## Deferred

The record additions were cut from this spec. This section keeps the design summary so that a later spec can pick it up. Nothing here is built by `open-draft`, and none of it changes `packages/engine`, `product.md` or the `[DOC]` form in this spec.

**What was designed.**

- **Fields.** One optional `va` field in `[DOC]` (the Verification_Time, valid by the Engine's `isTimestamp`), after `d` and before the `r` fields. Two optional trailing values on each `r` field: provider as a fifth value, model as a sixth. A model of `""` stays `""` and is not `null`. Version stays 1.
- **Escaping and allowed text.** Provider and model use the existing payload escaping. They must hold no Cc character, no U+2028 or U+2029, no unpaired surrogate, and at most 200 UTF-16 code units (the Tool_Name rule). A name outside the rule is written as a four-value `r`.
- **Engine.** `codes/doc-extras.ts` (`RunTool`, `RecordExtras`, `NO_EXTRAS`, `encodeRunFields`, `decodeRunFields`, `decodeVerifiedAt`), a fourth optional parameter `extras` on `renderRecord`, an `extras?` field on `DocumentRecord` that is absent when the record carries none, one lexer token for `va`, and edits to `decode-fields.ts`, `decode-header.ts` and `decode-types.ts`. Bad extras (a repeated or non-timestamp `va`, an `r` with fewer than four or more than six values, a tool value outside the allowed text, an unknown key) are `malformed_codes` at index 0 with rule `bad_field`.
- **Export.** `Statement.recordExtras`, filled by `buildStatement` through `recordExtrasOf(document, runLog, verifiedAt)`, and a third argument of `buildAppendix`. A write switch in `buildStatement` turned on last.
- **Properties.** A record round trip with extras, "without extras the record is byte for byte unchanged", and "bad extras are `bad_field`".

**Why it was deferred.**

- **It changes the file format, and `va` appears in nearly every export.** `d` appeared only in filings with a declaration; `va` appears in every export made after a Verify, and the tool values in every export with assistant text.
- **Old-Sentinel rollout.** The Sentinel is deployed from another repository. A Sentinel built before the change rejects an unknown `[DOC]` key and an `r` field without exactly four values as `malformed_codes` at index 0, which it reports as one `unreadable` Finding (`appendix_unparseable`) for the file, not as a crash. A version bump would not help because the old reader also rejects `v=2`. The order that follows: release the Sentinel that reads the extras first (in this repository it reads them as soon as the Engine change lands, because the shared parse calls `parseRecord`), then turn the app's write switch on. The `product.md` `[DOC]` line is edited first, as the pasted-text-declaration spec did for `d`.
- **Prompt-sentence flag.** A restored Run_Log would hold run entries with no prompts. The statement prints "each prompt is recorded in the run log" and "Prompt records are retained in the document's run log (N prompts)" whenever the run count is above 0, so a reopened filing would claim prompts it does not hold. The choice is to leave the sentences (the statement is identical) or to print them only for entries that hold a prompt (the statement differs from the original). With the empty restore of this spec the run count is 0 and neither sentence prints, so the problem does not arise here.
- **Orphan run-log entries.** The Store keeps a run-log entry after an undo removes the run from the Document (`reduceHistory` does not touch `runLog`). The record would carry only the runs the Document holds, so a reopened statement could count fewer runs than the original.
- **`arbRunLog` duplicate ids.** `arbRunLog` (`packages/export/test/support/arbitraries.ts`) generates up to three entries per run and entries for runs the Document does not hold. The Store never holds two entries with one Run_Id (`withRun` replaces). A property about the statement of a reopened export needs a new arbitrary that generates at most one entry per Run_Id of the Document's runs and may omit the entry for a run.
- **The rule that a reopened export produces the same statement.** It needs the record to carry the tool names and the check date, so it depends on the fields above. It was stated as "export, reopen, export gives an identical statement and an identical Appendix", which the orphan entries and the prompt sentences both qualify. Requirement 13 criterion 10 puts it out of this spec.

**What a later spec picks up.** The Engine and Export pieces above, `product.md` first, the Sentinel release before the write switch, a decision on the prompt sentences and on orphan entries, and the new run-log arbitrary. The empty restore of this spec stays valid as the Old_Export path for every file written before the change.
