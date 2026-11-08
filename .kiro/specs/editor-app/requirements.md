# Requirements Document

## Introduction

`apps/web` is the Reveal Codes editor: one Next.js page at `/` where a self-represented litigant pastes a draft, presses Alt-F3 to see the provenance codes, presses Verify to check every citation and quotation, and sees which problems block export. The page is built from three existing pieces and changes none of them: the Engine (`packages/engine`) holds the document, the Verifier (`packages/verifier`) checks citations, and TipTap on ProseMirror is the editing surface.

Four commitments shape the whole spec:

- **The Engine document is the single source of truth.** The app holds one Engine `Document` in a Store. The ProseMirror document is derived from it. Every text edit becomes an Engine `CallerOperation` passed through `apply`; the editor is then reconciled to the Engine text.
- **Provenance is captured, never inferred.** The origin of text comes from the kind of transaction that inserted it (typing, paste, drop, assistant insertion). The app never runs an AI detector and never sets `AI>HUM`; the Engine relabels by its threshold.
- **Only citations leave the browser.** Verify sends citation records to the app's own server. Quotation text is checked in the browser against opinion text fetched by cluster id. Draft text reaches an LLM provider only when the author presses Draft.
- **Everything works with no credentials.** With no CourtListener token, or when `REVEAL_CODES_FIXTURES_ONLY=1`, the server answers from recorded fixtures, and with no LLM credentials the assistant answers from recorded responses.

The spec has two tiers. **Tier 1** (Requirements 1 to 21, 25, 26 except where marked) is the demo: paste or load the demo motion, toggle the pane, verify, see red codes, override one, watch the Export label change. **Tier 2** (Requirements 22 to 24, and the criteria marked "Tier 2" in Requirements 15, 25 and 26) is the drafting assistant. Tier 2 is separable: removing it deletes those requirements and criteria and changes no other criterion (see "Notes for the user").

This spec is constrained by `.kiro/steering/tech.md`, `product.md`, `structure.md`, `citations.md`, and `testing.md`. Where this spec and a steering file differ, the user's brief for this spec is the later decision, and Requirement 26 brings the steering files into line.

Scope: `apps/web` only, plus one hook file, the root `vitest.config.ts` entry for the `web` project, `.gitignore` (the line `apps/web/public/demo-motion.txt`), the `apps/web/tsconfig.json` references, the `exports` field of `packages/verifier/package.json` (metadata only; no Verifier source changes), `.env.example`, `README.md`, `docs/KIRO_USAGE.md`, and `BUILD_LOG.md`. Out of scope: any change to `packages/engine` or `packages/verifier`, DOCX or PDF export and the certification (a later spec; Export here opens a placeholder), formatting beyond plain paragraphs, accounts, telemetry, and the Crew app.

## Glossary

- **Web_App**: the `@reveal-codes/web` package in `apps/web`; the system under specification.
- **Engine**: the `@reveal-codes/engine` package. It is not modified by this spec.
- **Verifier**: the `@reveal-codes/verifier` package. It is not modified by this spec.
- **Document**: the Engine `Document` value: text, spans, runs, citations, quotes, overrides, and key counter.
- **Offset**: an index into the Document text measured in UTF-16 code units.
- **Pos**: a ProseMirror position in the Editor document.
- **Paragraph_List**: the Document text split on `\n`. A Document with n paragraphs has n − 1 newline characters; empty text is one empty paragraph.
- **Editor_Schema**: the ProseMirror schema whose `doc` node holds one or more `paragraph` nodes, each holding zero or more plain `text` nodes, with no marks and no other node types.
- **Editor**: the TipTap editor built on the Editor_Schema, using only `@tiptap/extension-document`, `@tiptap/extension-paragraph`, and `@tiptap/extension-text`.
- **Offsets_Module**: `apps/web/src/editor/offsets.ts`, exporting `posToOffset`, `offsetToPos`, and `docText`.
- **Ops_Module**: `apps/web/src/editor/transaction-ops.ts`, exporting `transactionToOps`.
- **Provenance_Plugin**: the ProseMirror plugin in `apps/web/src/editor/` that inspects every Editor transaction, and the only module that assigns an Origin to a user edit.
- **Reconcile**: replacing the Editor content with the Paragraph_List of the Document text and restoring the selection, using a transaction flagged so that the Provenance_Plugin produces no operation for it.
- **Mirror_Invariant**: after the operations mapped from an Editor transaction are applied to the Document, the Document text equals the Editor text.
- **Store**: `apps/web/src/store.ts`, a reducer with no external state library, holding the Document, the Undo_Stack, the Redo_Stack, the Run_Log, and the Notice.
- **Undo_Group**: a non-empty list of Engine `Inverse` values produced by one user action or by a run of coalesced keystrokes.
- **Undo_Stack** / **Redo_Stack**: lists of Undo_Groups.
- **Group_Window**: 1 000 ms, measured by the injected `now`.
- **History_Barrier**: an event after which the Undo_Stack and Redo_Stack are emptied because the stored Inverses can no longer apply (see L3).
- **Run_Log**: the app-side list of assistant run metadata (Run_Id, provider name, model id, prompt, timestamp), kept beside the Document because the Engine `RunEntry` has no such fields (see L2).
- **Notice**: one short message shown as text in the toolbar status area (a `role="status"` region), set by the Store or by a client flow.
- **UI_Stylesheets**: every `.css` file under `apps/web/src` and `apps/web/app` other than the Pane's own stylesheet, namely the one global stylesheet and the CSS modules of non-Pane components.
- **UI_Palette**: `#FFFFFF`, `#111111`, `#B0B0B0`, `#ECECEC`, and the accent `#1F3A8A`.
- **Autosave_Key**: the `localStorage` key `reveal-codes:document:v1`.
- **Persisted_Value**: the JSON text stored under the Autosave_Key (Requirement 9).
- **Pane**: the Reveal Codes pane in `apps/web/src/pane/`.
- **Pane_Layout**: the pure module `apps/web/src/pane/layout.ts` that turns `render(document, "display")` into Pane_Items.
- **Pane_Item**: one element of the Pane_Layout: a Text_Item or a Code_Item.
- **Text_Item**: a Pane_Item for one code point of Document text, whose `text` is the rendered form (a backslash plus the character when the Engine escaped it) and whose `offset` is the Offset of its first code unit.
- **Code_Item**: a Pane_Item for one entry of the `positions` array that `render` returns, carrying that entry's `code` string, its `offset`, and its Code_Family.
- **Code_Family**: one of `HUM`, `PST`, `AI`, `AI>HUM`, `verified`, `failed`, `pending`, `ovr`, `ref`, `close`.
- **Palette**: the sixteen-colour CGA palette: `#000000`, `#0000AA`, `#00AA00`, `#00AAAA`, `#AA0000`, `#AA00AA`, `#AA5500`, `#AAAAAA`, `#555555`, `#5555FF`, `#55FF55`, `#55FFFF`, `#FF5555`, `#FF55FF`, `#FFFF55`, `#FFFFFF`.
- **Status_Line**: the bottom line of the Pane.
- **Mode**: `fixtures` or `live`, reported by the Mode_Route.
- **Fixtures_Mode**: Mode `fixtures`, in which the server answers from `createFixtureFetch()` and a memory cache.
- **Server_Deps**: `apps/web/src/server/deps.ts`, the only module in `apps/web/src` or `apps/web/app` that reads `process.env`.
- **Verify_Route** / **Opinion_Route** / **Mode_Route** / **Assistant_Route**: the Next.js route handlers for `POST /api/verify`, `GET /api/opinion/<clusterId>`, `GET /api/mode`, and `POST /api/assistant`.
- **Api_Client**: `apps/web/src/client/api.ts`, the only module in the browser bundle that calls `fetch`; it takes `fetch` as an injected argument.
- **Verify_Flow**: the client sequence started by the Verify button: one `POST /api/verify`, then one `GET /api/opinion/<clusterId>` per distinct verified cluster that has attached quotes, then `checkQuote` in the browser.
- **Full_Record**: a `CitationRecord` with `kind: "full"`.
- **Epoch**: an integer in the Store that increases whenever the Document is replaced (New document, Load demo motion, or loading the Persisted_Value); a Verify_Flow result whose Epoch differs from the current Epoch is discarded.
- **Issues_List**: the right-hand list of `issues(document)`.
- **Divergence_Words**: for a quote whose `QuoteCheckResult` is a mismatch carrying `prefixLength`, the words of the quote text starting at the word that contains the Offset `prefixLength` within the quote text, up to 6 words, joined by single spaces, and followed by an ellipsis when more words remain. The Divergence_Words are derived in the browser from the quote text in the Document; the Verifier supplies only `prefixLength`.
- **Override_Dialog**: the modal dialog that collects an override reason.
- **Export_Button** / **Export_Dialog**: the toolbar button labelled "Export" and the placeholder dialog it opens.
- **Demo_Motion**: `packages/engine/fixtures/demo-motion.txt`, served to the browser as `apps/web/public/demo-motion.txt`.
- **Llm_Module**: `apps/web/src/server/llm.ts`, exporting `draft(prompt, context): AsyncIterable<string>`. (Tier 2)
- **Assistant_Panel**: the left-hand panel with a prompt box and a "Draft" button. (Tier 2)
- **Run_Id**: the string `r<N>` that labels one assistant insertion. (Tier 2)

## Requirements

### Requirement 1: Package setup and test project

**User Story:** As a maintainer, I want the app's dependencies pinned and its test project wired, so that the editor builds and its tests run from the repository root.

#### Acceptance Criteria

1. THE Web_App `package.json` SHALL depend on `@reveal-codes/engine` and `@reveal-codes/verifier` through the workspace protocol, and on `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/extension-document`, `@tiptap/extension-paragraph`, and `@tiptap/extension-text`, each pinned to one exact version with no range operator.
2. THE Web_App `package.json` SHALL list `@testing-library/react` and `jsdom` as development dependencies, each pinned to one exact version with no range operator, with `jsdom` pinned to `28.1.0`.
3. WHERE the assistant is present (Tier 2), THE Web_App `package.json` SHALL depend on `ai` `7.0.165`, `@ai-sdk/amazon-bedrock` `5.0.135`, and `@ai-sdk/anthropic` `4.0.99`, each pinned to that exact version with no range operator (and on `zod` `4.6.7` if a peer requires it).
4. THE Web_App SHALL NOT depend on `@tiptap/starter-kit`, any TipTap history extension, or any state-management library.
5. THE root `vitest.config.ts` `web` project SHALL include `test/**/*.test.ts` and `test/**/*.test.tsx`, run in the `node` environment by default, and allow a file to select `jsdom` with a `// @vitest-environment jsdom` comment.
6. THE Web_App `package.json` SHALL define a `predev` script and a `prebuild` script that each run `apps/web/scripts/copy-demo.ts`.
7. WHEN `pnpm test` runs from the repository root, THE Web_App tests SHALL run as the `web` project and SHALL make no network request.
8. THE `exports` field of `packages/verifier/package.json` SHALL be an object that keeps `"."` pointing to `./src/index.ts` and adds `"./quote"` pointing to `./src/quote.ts`; this SHALL be the only change to the Verifier package, and no Verifier source file SHALL change.
9. THE Web_App client modules SHALL import `checkQuote` from `@reveal-codes/verifier/quote`, so that no `node:` builtin reaches the browser bundle.
10. THE Web_App `package.json` scripts `dev` and `build` SHALL run `next dev --webpack` and `next build --webpack`.

### Requirement 2: Save hook and static guards

**User Story:** As a maintainer, I want tests to run on save and the structural rules enforced by tests, so that the secret-handling, size, and privacy rules cannot drift.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/hooks/web-tests-on-save.json` with the file-save matcher `apps/web/(src|test)/.*\.tsx?$`, `timeout_ms` 120000, and a command that wraps `pnpm vitest run --project web --passWithNoTests` in the same 120 s `alarm` guard as `.kiro/hooks/verifier-tests-on-save.json`.
2. WHEN a file whose path matches `apps/web/(src|test)/.*\.tsx?$` is saved, THE `web-tests-on-save` hook SHALL run the `web` Vitest project once in single-run mode and SHALL NOT run any other project.
3. WHEN the `web` test project runs, THE Web_App tests SHALL include a static check that scans every `.ts` and `.tsx` file under `apps/web/src` and `apps/web/app` and fails with the file path and line number of each `process.env` occurrence outside `apps/web/src/server/deps.ts`.
4. WHEN the `web` test project runs, THE static check SHALL fail with the file path of each module under `apps/web/src` and `apps/web/app` that has more than 300 lines.
5. WHEN the `web` test project runs, THE static check SHALL fail with the file path and line number of each `any` type annotation, each `export default` outside the Next.js `page`, `layout`, and `route` files under `apps/web/app`, and each import of `@tiptap/starter-kit`.
6. WHEN the `web` test project runs, THE static check SHALL fail with the file path and line number of each `fetch(` call under `apps/web/src` and `apps/web/app` outside `apps/web/src/client/api.ts`, `apps/web/src/server/deps.ts`, and the Tier 2 provider files under `apps/web/src/server/`.
7. THE Web_App source and tests SHALL contain at most 40 lines in each function, per `tech.md`.
8. IF a `try/catch` block in Web_App source or tests catches an error and neither rethrows it, returns it as a value, nor asserts on it, THEN THE repository SHALL be considered non-compliant with this requirement.
9. WHEN the `web` test project runs, THE static check SHALL fail with the file path and line number of each module under `apps/web/src` and `apps/web/app` that is bundled for the browser (every module outside `apps/web/src/server/` and `apps/web/app/api/`) and imports `@reveal-codes/verifier` at its root or any `node:*` specifier.

### Requirement 3: The Store

**User Story:** As a maintainer, I want one reducer that owns the Document, so that every change to text is an Engine operation and every failure leaves the Document unchanged.

#### Acceptance Criteria

1. THE Store SHALL export a pure reducer over a state holding `document`, `undo`, `redo`, `runLog`, `notice`, and `epoch`, with the clock supplied as an injected `now(): Date`.
2. THE Store SHALL create its initial Document with the Engine's `createDocument("", timestamp)`.
3. WHEN the reducer receives an `edit` action holding a list of Engine `CallerOperation` values, THE Store SHALL pass the operations in order through the Engine's `apply` and SHALL keep the final Document.
4. IF `apply` returns an error for any operation of an `edit` action, THEN THE Store SHALL keep the previous Document, Undo_Stack, and Redo_Stack unchanged and SHALL set a Notice naming the error kind.
5. THE Store SHALL change the Document text only through the Engine's `apply`, or by replacing the whole Document with the result of `createDocument` or `parse`.
6. WHEN the reducer receives a `verification` action holding `[IssueKey, VerificationResult]` pairs, THE Store SHALL apply each pair with the Engine's `setVerification`, SHALL skip any pair for which `setVerification` returns an error, and SHALL report the number skipped in the action result.
7. WHEN the reducer receives a `quoteCheck` action holding `[IssueKey, QuoteCheckResult]` pairs, THE Store SHALL apply each pair with the Engine's `setQuoteCheck`, SHALL skip any pair for which `setQuoteCheck` returns an error, and SHALL report the number skipped in the action result.
8. WHEN the reducer receives an `override` action holding an issue key, a reason, and a timestamp, THE Store SHALL call the Engine's `recordOverride`, and IF the call returns an error, THEN THE Store SHALL keep the previous Document and set a Notice naming the error kind.
9. WHEN a `verification`, `quoteCheck`, or `override` action changes the Document, THE Store SHALL apply the History_Barrier of Requirement 8, criterion 10.
10. WHEN the reducer receives a `replace` action holding a new Document, THE Store SHALL install the Document, empty the Undo_Stack and Redo_Stack, empty the Run_Log unless the action supplies one, and increase `epoch` by one.
11. THE Store SHALL return a new state value for every handled action and SHALL NOT mutate any value of the previous state.
12. THE Store SHALL obtain every timestamp from the injected `now` and SHALL NOT call `Date.now()` or `new Date()` without arguments.

### Requirement 4: Offset mapping

**User Story:** As a maintainer, I want an exact mapping between ProseMirror positions and Engine offsets, so that the cursor, the pane, and the edits agree on where every character is.

#### Acceptance Criteria

1. THE Offsets_Module SHALL export `posToOffset(doc, pos)`, `offsetToPos(doc, offset)`, and `docText(doc)` as pure functions over a ProseMirror `Node` of the Editor_Schema, with no DOM access.
2. THE `docText(doc)` function SHALL return the paragraph texts of `doc` joined by `\n`.
3. WHEN `offset` is an integer from 0 to `docText(doc).length` inclusive, THE `offsetToPos` function SHALL return the Pos inside the paragraph that holds `offset`, where the Offset of the `\n` that ends paragraph i maps to the end of paragraph i and the Offset just after that `\n` maps to the start of paragraph i + 1.
4. WHEN `pos` lies inside the content range of a paragraph, from the start of its content to the end of its content inclusive, THE `posToOffset` function SHALL return the Offset of the character at that position.
5. IF `offset` is not an integer in the valid range, or `pos` does not lie inside the content range of a paragraph, THEN THE Offsets_Module SHALL return `null`.
6. FOR ALL Paragraph_Lists and all integers `offset` from 0 to the text length, `posToOffset(doc, offsetToPos(doc, offset))` SHALL equal `offset`, and FOR ALL Pos inside a paragraph's content range, `offsetToPos(doc, posToOffset(doc, pos))` SHALL equal `pos` (Property 1, offset round trip).

### Requirement 5: Transaction to operations

**User Story:** As a maintainer, I want each ProseMirror transaction mapped to Engine operations, so that the Engine text can never drift from the editor text.

#### Acceptance Criteria

1. THE Ops_Module SHALL export `transactionToOps(beforeText, steps, provenance)` returning a list of Engine `CallerOperation` values in step order, where each step's positions are interpreted against the text produced by the steps before it.
2. WHEN a `ReplaceStep` removes a non-empty range and inserts nothing, THE Ops_Module SHALL emit a `delete` with `actor` equal to `provenance.origin`; WHEN the step removes nothing and inserts a non-empty slice, THE Ops_Module SHALL emit an `insert`; WHEN the step removes a non-empty range and inserts a non-empty slice, THE Ops_Module SHALL emit a `replace`; and WHEN the step removes nothing and inserts nothing, THE Ops_Module SHALL emit no operation.
3. THE Ops_Module SHALL write each paragraph boundary inside an inserted slice as one `\n` in the operation text.
4. THE Ops_Module SHALL copy the supplied `provenance` unchanged into every `insert` and `replace` it emits.
5. IF a step is a `ReplaceAroundStep`, any other step type, or a `ReplaceStep` whose slice holds a node outside the Editor_Schema, THEN THE Ops_Module SHALL discard the mapping of the whole step list and SHALL return one `replace` computed from the longest common prefix and the longest common suffix of `beforeText` and the text that results from applying the steps to the document built from `beforeText`, except that WHEN `beforeText` equals the resulting text, THE Ops_Module SHALL return no operation.
6. WHEN the Ops_Module computes the fallback `replace` of criterion 5, THE Ops_Module SHALL move each cut point to the nearest Offset that does not fall between the two code units of a surrogate pair.
7. THE Ops_Module SHALL be pure: it SHALL NOT call the Engine's `apply`, read a clock, or touch the DOM.
8. FOR ALL starting texts and all sequences of generated ProseMirror transactions (insert text, delete range, replace range, split paragraph, join paragraphs, paste text with newlines), applying the output of `transactionToOps` through the Engine's `apply` to a Document with the starting text SHALL leave `document.text` equal to the Editor text (Property 2, Mirror_Invariant).

### Requirement 6: Editor schema, reconcile, and selection

**User Story:** As a pro se filer, I want a plain page I can type and paste into, so that the editor never hides or reformats my words.

#### Acceptance Criteria

1. THE Editor SHALL use the Editor_Schema, SHALL load only the document, paragraph, and text extensions, and SHALL have no history extension, so that undo and redo are handled only by Requirement 8.
2. WHEN `document.text` differs from `docText(editor.state.doc)` after any Store change, THE Editor SHALL Reconcile.
3. WHEN the Editor Reconciles, THE Editor SHALL set the selection to the Pos of the Offset that the selection head had before the Reconcile, clamped to the new text length, and SHALL NOT produce an Engine operation.
4. WHEN a user transaction changes the Editor document, THE Editor SHALL send the mapped operations to the Store as one `edit` action, and IF the Store rejects the action, THEN THE Editor SHALL Reconcile to the previous Document text.
5. WHILE the Document text is empty, THE Editor SHALL show the placeholder text "Paste your draft here, or start typing."
6. THE Editor content element SHALL expose the accessible name "Document", `role="textbox"`, and `aria-multiline="true"`.
7. WHEN the Editor selection changes, THE Editor SHALL report the Offset of the selection head, obtained from `posToOffset`, to the page state.

### Requirement 7: Provenance capture

**User Story:** As a self-represented litigant, I want the editor to record how each piece of text entered the filing, so that the codes tell the truth about my draft.

#### Acceptance Criteria

1. THE Provenance_Plugin SHALL inspect every Editor transaction that changes the document and is not flagged as a Reconcile, and SHALL be the only module that assigns an Origin to a user edit.
2. WHEN a transaction results from typing, IME composition, Enter, Backspace, Delete, or cut, THE Provenance_Plugin SHALL use `{ origin: "HUM", timestamp }`.
3. WHEN the user pastes, THE Editor SHALL read only the `text/plain` clipboard data, normalise `\r\n` and `\r` to `\n`, discard all formatting, and insert the text in one transaction carrying the meta `provenance: { origin: "PST" }`, replacing any selected range.
4. WHEN the user drops content on the Editor, THE Editor SHALL read only the `text/plain` data, apply criterion 3, and insert at the drop position.
5. IF a paste or drop carries no `text/plain` data, THEN THE Editor SHALL leave the Document unchanged.
6. THE Provenance_Plugin SHALL obtain each timestamp from the injected `now` as an ISO-8601 UTC string.
7. THE Web_App SHALL NOT construct a provenance record with Origin `AI>HUM`, and SHALL NOT infer an Origin from the content of the text.
8. WHERE the assistant is present (Tier 2), WHEN the assistant inserts text, THE Web_App SHALL send the Store an `edit` action whose insert operation carries `{ origin: "AI", runId, timestamp }`.

### Requirement 8: Undo and redo

**User Story:** As an author, I want undo to restore my text and its provenance exactly, so that Cmd-Z never turns typed words into pasted ones.

#### Acceptance Criteria

1. WHILE the Editor has focus, WHEN the user presses Cmd-Z (macOS) or Ctrl-Z, THE Web_App SHALL undo one Undo_Group, and WHEN the user presses Cmd-Shift-Z or Ctrl-Shift-Z, THE Web_App SHALL redo one group.
2. WHEN an `edit` action succeeds, THE Store SHALL push the `Inverse` of each applied operation onto the Undo_Stack as one Undo_Group and SHALL empty the Redo_Stack.
3. WHEN an `edit` action holds exactly one `insert` with Origin `HUM` and one code point of text, and the Undo_Stack's top group was started by such an insert, and the new insert's `at` equals the Offset just after the previous insert's text, and the injected clock reads at most 1 000 ms after the previous insert, THE Store SHALL append the Inverse to that top group instead of starting a new group.
4. WHEN an `edit` action does not meet criterion 3, THE Store SHALL start a new Undo_Group.
5. WHEN the Store undoes a group, THE Store SHALL apply the group's Inverses in reverse order through the Engine's `apply`, SHALL push the returned redo Inverses onto the Redo_Stack as one group, and SHALL remove the group from the Undo_Stack.
6. WHEN the Store redoes a group, THE Store SHALL apply the group's Inverses through the Engine's `apply`, SHALL push the returned Inverses onto the Undo_Stack as one group, and SHALL remove the group from the Redo_Stack.
7. IF the Undo_Stack (or Redo_Stack) is empty when undo (or redo) is requested, THEN THE Store SHALL leave the state unchanged.
8. IF the Engine returns `stale_inverse` while the Store undoes or redoes a group, THEN THE Store SHALL leave the Document and both stacks unchanged and SHALL set a Notice.
9. WHEN an undo or redo succeeds, THE Editor SHALL Reconcile and SHALL place the caret at the Offset `restore.at + restore.insertText.length` of the last applied Inverse.
10. WHEN a `verification`, `quoteCheck`, or `override` action changes the Document, or a `replace` action runs, THE Store SHALL empty the Undo_Stack and the Redo_Stack (the History_Barrier).
11. FOR ALL sequences of operations applied through the Store, undoing every Undo_Group SHALL yield a Document structurally equal to the original, including spans and runs, and redoing every group SHALL yield a Document structurally equal to the Document before the first undo (Property 3, undo restores exactly).

### Requirement 9: Autosave and persistence

**User Story:** As a user who closes the tab by accident, I want my draft to be there when I return, so that I lose nothing.

#### Acceptance Criteria

1. WHEN the Document or the Run_Log changes, THE Web_App SHALL write the Persisted_Value to `localStorage` under the Autosave_Key after a 300 ms debounce, using an injected timer and an injected storage object.
2. THE Persisted_Value SHALL be a JSON object `{ "version": 1, "codes": <string>, "runLog": <array> }` where `codes` is `render(document, "full").text`.
3. WHEN the page loads, THE Web_App SHALL read the Autosave_Key after mount, parse `codes` with the Engine's `parse`, and install the resulting Document through a `replace` action.
4. IF the stored value is absent, is not valid JSON of the shape in criterion 2, or `parse` returns an error, THEN THE Web_App SHALL ignore the stored value and start with an empty Document.
5. WHEN the page becomes hidden or is about to unload while a debounced write is pending, THE Web_App SHALL perform the write immediately.
6. IF a `localStorage` write throws, THEN THE Web_App SHALL set a Notice stating that autosave failed and SHALL keep the Document in memory.
7. THE Web_App SHALL NOT persist the Undo_Stack, the Redo_Stack, or Notices.
8. FOR ALL Documents produced by the Store, parsing the `codes` field of the Persisted_Value SHALL yield a Document structurally equal to the saved Document (persistence round trip).

### Requirement 10: Page layout, toolbar, and keyboard

**User Story:** As a pro se filer, I want a page that looks like a court filing with the controls where I expect them, so that I can paste, verify, and export without instructions.

#### Acceptance Criteria

1. THE Web_App SHALL serve one page at `/` containing, in this order of the accessibility tree: a toolbar (`role="toolbar"`), a main region holding the Editor, an Issues complementary region, and the Pane region.
2. THE toolbar SHALL contain, in order, buttons labelled "New", "Load demo motion", "Verify", "Reveal Codes (Alt-F3)", and "Export", followed by the mode badge of Requirement 15.
3. THE Editor page surface SHALL have a white background, the font family `Georgia, "Times New Roman", serif`, a font size of 12pt, a line height of 1.5, and a maximum width of 8.5 inches.
4. THE Web_App SHALL set `color-scheme: light` and SHALL provide no dark mode.
5. THE Web_App SHALL handle exactly these keyboard shortcuts: Alt-F3 (Option-F3 on macOS), F7 while the Pane is open, Cmd/Ctrl-Z, Cmd/Ctrl-Shift-Z, and Cmd/Ctrl-V as plain-text paste; the Web_App SHALL leave every other key to the browser and the Editor's native behaviour.
6. WHEN a Notice is set, THE Web_App SHALL show its text in the toolbar status area, a `role="status"` region with `aria-live="polite"`, and SHALL show no toast, popup, or overlay for a Notice.
7. THE toolbar buttons, the Issues_List controls, and the dialogs SHALL be operable by keyboard and SHALL show a visible focus indicator (see criterion 14).
8. WHERE the assistant is present (Tier 2), THE Web_App SHALL show an "Assistant" disclosure button at the left edge that expands the Assistant_Panel, and THE Assistant_Panel SHALL be collapsed on first load.
9. THE Web_App SHALL style the UI with one global stylesheet that defines the CSS variables and with one CSS module per component, and SHALL declare no icon library, component library, Tailwind, or CSS-in-JS package in `package.json`.
10. THE rendered text of the toolbar, Issues_List, dialogs, Notices, and Assistant_Panel SHALL contain no emoji and no icon characters; the code tokens `✓` and `✘` in code names such as `CIT ✘` are exempt.
11. THE UI_Stylesheets SHALL use only colours from the UI_Palette, SHALL use `#1F3A8A` only for the focus outline and for links, and SHALL contain no `box-shadow`, `text-shadow`, gradient, `border-radius`, `transition`, `animation`, or `@keyframes`.
12. THE UI_Stylesheets SHALL use exactly three font families (the UI sans stack `-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`, the Editor serif of criterion 3, and the Pane monospace of Requirement 12), only the font weights 400 and 700, and a UI font size of 13px.
13. THE buttons SHALL have a 1px `#111111` border, `4px 10px` padding, and no border radius; a disabled button SHALL have `#B0B0B0` text and a `#B0B0B0` border; hover SHALL change only the background, with no transition.
14. THE focus indicator SHALL be a 2px `#1F3A8A` outline.
15. THE page layout SHALL be a fixed grid with a 32px toolbar, a 260px left panel, a 300px right panel, and, WHILE the Pane is open, a Pane of 40% of the viewport height, with regions separated by 1px `#B0B0B0` rules; WHERE the assistant is absent (Tier 2), THE left panel SHALL NOT be rendered.
16. THE Web_App copy SHALL contain no exclamation mark, no "Oops", and no "Let's", and SHALL use no empty-state illustration.
17. THE Issues_List SHALL show the severity of each row as words (for example "blocking" or "not found") and SHALL use no coloured badge.
18. WHEN the `web` test project runs, THE static check SHALL scan the UI_Stylesheets and fail with the file path and line number of each violation of criteria 11 to 13, and SHALL scan the source and `package.json` for violations of criteria 9, 10, and 16.

### Requirement 11: Pane layout

**User Story:** As a maintainer, I want the pane built from a pure layout of the Engine rendering, so that the pane can never show something the Engine did not report.

#### Acceptance Criteria

1. THE Pane_Layout SHALL export `layoutPane(document)` returning an ordered list of Pane_Items built from `render(document, "display")`, and SHALL read every code offset only from the `positions` array of that rendering.
2. THE Pane_Layout SHALL emit one Code_Item for each entry of `positions`, in order, with `text` equal to the entry's `code` and `offset` equal to the entry's `offset`.
3. THE Pane_Layout SHALL emit one Text_Item for each code point of `document.text`, in order, with `offset` equal to the Offset of the code point's first code unit and `text` equal to the code point as the Engine rendered it, including the escaping backslash.
4. THE Pane_Layout SHALL place each Code_Item before the Text_Item whose `offset` equals the Code_Item's `offset`, and SHALL place Code_Items whose `offset` equals `document.text.length` after the last Text_Item.
5. THE Pane_Layout SHALL assign each Code_Item the Code_Family given by the code name at the start of its token: `HUM`, `PST`, `AI`, `AI>HUM`; `verified` for `CIT ✓` and `QUO ✓`; `failed` for `CIT ✘` and `QUO ✘`; `pending` for `CIT ?`, `CIT …`, and `QUO …`; `ovr` for `OVR`; `ref` for `REF`; and `close` for `/CIT`, `/QUO`, and `/REF`.
6. THE Pane_Layout SHALL export `itemIndexAtOffset(layout, offset)` returning the index of the Text_Item at `offset`, or the end position when `offset` equals the text length, and `offsetOfItem(layout, index)` returning the item's `offset`.
7. THE Pane_Layout SHALL export `statusText(text, offset)` returning `Doc 1 Pg 1 Ln <line> Pos <col>`, where `<line>` is 1 plus the number of `\n` characters before `offset` and `<col>` is 1 plus the number of code units between the last `\n` before `offset` (or the text start) and `offset`.
8. FOR ALL Documents, concatenating the `text` of the Pane_Items in order SHALL equal `render(document, "display").text`, each Code_Item's `offset` SHALL equal the `offset` of the matching `positions` entry, and each Text_Item's `offset` SHALL be the Offset of its character in `document.text` (Property 4, pane layout is faithful).

### Requirement 12: Pane presentation

**User Story:** As a user who knows WordPerfect, I want the pane to look like Reveal Codes in 1989, so that the contrast with the 2026 editor is the point.

#### Acceptance Criteria

1. THE Pane SHALL be hidden on first load, SHALL render nothing in the accessibility tree while hidden, and SHALL occupy a region under the Editor with a height of 40% of the viewport and vertical scrolling while shown.
2. THE Pane SHALL use the background `#0000AA`, the text colour `#AAAAAA`, the font stack `ui-monospace, Menlo, Consolas, monospace`, and the font size 14px.
3. THE Pane SHALL set no `font-smooth`, `-webkit-font-smoothing`, `-moz-osx-font-smoothing`, or `text-rendering` property.
4. THE Pane SHALL draw each Code_Item with a 1 px `#AAAAAA` outline and the colours of this table: `HUM` `#FFFFFF` on `#0000AA`; `PST` `#FFFF55` on `#0000AA`; `AI` `#FF55FF` on `#0000AA`; `AI>HUM` `#55FFFF` on `#0000AA`; `verified` `#55FF55` on `#0000AA`; `failed` `#FF5555` on `#0000AA`; `pending` `#AA5500` on `#FFFF55`; `ovr` `#555555` on `#AAAAAA`; `ref` `#AAAAAA` on `#0000AA`; `close` `#FFFFFF` on `#0000AA`.
5. THE Pane SHALL use no colour outside the Palette in any style it defines.
6. THE Pane SHALL show the Status_Line at its bottom in the colours `#AAAAAA` on `#0000AA`, reading `statusText(document.text, cursorOffset)`.
7. THE Pane SHALL show no logo and no product name.
8. THE Pane region SHALL carry `role="region"` and the accessible name "Reveal Codes", and each Code_Item SHALL carry an accessible name that states its meaning, for example "Citation not found" for `CIT ✘`.
9. WHEN the Document changes, THE Pane SHALL re-render from `layoutPane(document)`.

### Requirement 13: Cursor sync

**User Story:** As a user, I want the pane cursor and the editor cursor to stay together, so that I can find the code behind any word and the word behind any code.

#### Acceptance Criteria

1. WHEN the Editor selection head changes while the Pane is shown, THE Pane SHALL highlight the Text_Item at the head's Offset with a `#AAAAAA` block whose text is `#0000AA`, or an empty block after the last item when the Offset equals the text length.
2. WHEN the highlighted item is outside the visible area of the Pane, THE Pane SHALL scroll it into view.
3. WHEN the user clicks a Text_Item or a Code_Item, THE Web_App SHALL set the Editor selection to the Pos of that item's `offset` and SHALL focus the Editor.
4. THE Pane SHALL highlight only the selection head when the Editor selection is a range.
5. WHEN the user clicks the Pane outside every item, THE Web_App SHALL set the Editor selection to the end of the Document.
6. WHILE the Pane is open and the selection head lies within the `[start, end)` range of a quote whose result is `QUO ✘` with a mismatch `prefixLength`, THE Status_Line SHALL read `statusText(document.text, cursorOffset)` followed by two spaces and `Diverges at: ` and the Divergence_Words of that quote, computed in the browser from the quote text in the current Document.

### Requirement 14: Pane toggle and F7

**User Story:** As a user, I want Alt-F3 to open the codes from anywhere, so that one keystroke shows the truth.

#### Acceptance Criteria

1. WHEN the user presses F3 with the Alt key (Option on macOS) and no Ctrl or Meta key, THE Web_App SHALL toggle the Pane, SHALL call `preventDefault` on the event, and SHALL do so wherever page focus is, except while a modal dialog is open.
2. WHEN the user activates the toolbar button "Reveal Codes (Alt-F3)", THE Web_App SHALL toggle the Pane, and THE button SHALL expose its state with `aria-pressed`.
3. WHILE the Pane is open, WHEN the user presses F7, THE Web_App SHALL call `preventDefault`, show `Save document? Yes (No)` in the Status_Line for 2 000 ms measured by an injected timer, then restore the Status_Line, and SHALL do nothing else.
4. WHILE the Pane is open, WHEN the user presses F7 again before the 2 000 ms elapse, THE Web_App SHALL restart the 2 000 ms interval.
5. WHILE the Pane is closed, THE Web_App SHALL leave F7 to the browser.

### Requirement 15: Server configuration, mode, and badge

**User Story:** As a judge testing the app with no account, I want the demo to work with no token, and as a maintainer I want the secrets confined to one file, so that nothing leaks.

#### Acceptance Criteria

1. THE Server_Deps module SHALL export a pure function `readServerConfig(env)` over an injected string map, and a function that calls it once with `process.env`; no other module in `apps/web/src` or `apps/web/app` SHALL read `process.env`.
2. THE `readServerConfig` function SHALL return Mode `fixtures` WHEN `REVEAL_CODES_FIXTURES_ONLY` equals `1` or `COURTLISTENER_TOKEN` is absent or empty, and Mode `live` otherwise.
3. WHEN Mode is `live`, THE Server_Deps module SHALL build Verifier deps once per process with `createDeps` using the real `fetch`, a clock, an abortable sleep, a `createFileCacheStore` under `REVEAL_CODES_CACHE_DIR` (default `~/.reveal-codes/cache`), the token, and `COURTLISTENER_BASE_URL` (default `https://www.courtlistener.com/api/rest/v4`).
4. WHEN Mode is `fixtures`, THE Server_Deps module SHALL build Verifier deps once per process using `createFixtureFetch()` and `createMemoryCacheStore`, and SHALL make no network call.
5. THE Web_App SHALL pass the token only as the `token` field of the Verifier deps and SHALL NOT log it, return it in any response, include it in any error message, or send it to the browser.
6. WHEN `GET /api/mode` is called, THE Mode_Route SHALL respond with JSON `{ "mode": "fixtures" }` or `{ "mode": "live" }`; WHERE the assistant is present (Tier 2), THE response SHALL also carry `"assistant": { "provider": <name>, "modelId": <string or null> }`.
7. WHILE Mode is `fixtures`, THE toolbar SHALL show the badge "Demo mode: recorded CourtListener responses", and THE Issues_List SHALL show the line "Demo mode checks only the recorded demo citations. Any other citation shows as not found."
8. IF the Mode request fails, THEN THE toolbar SHALL show the badge "Server unreachable" and SHALL keep the Verify button enabled.

### Requirement 16: Verify and opinion routes

**User Story:** As a user, I want the server to receive only citation records, so that my draft stays private.

#### Acceptance Criteria

1. WHEN `POST /api/verify` is called with a JSON body of the form `{ "records": [...] }`, THE Verify_Route SHALL call the Verifier's `lookup` with those records and the Server_Deps deps, and SHALL respond with status 200 and the JSON array of `[key, VerificationResult]` pairs from the returned map.
2. IF the body is not valid JSON, has any top-level property other than `records`, has a `records` value that is not an array, has a record whose `kind` is not `full`, or has a record without a string `key`, THEN THE Verify_Route SHALL respond with status 400 and SHALL NOT call `lookup`.
3. IF the body exceeds 262 144 bytes or holds more than 500 records, THEN THE Verify_Route SHALL respond with status 413 and SHALL NOT call `lookup`.
4. WHEN `GET /api/opinion/<clusterId>` is called with a `clusterId` matching `^[1-9][0-9]{0,11}$`, THE Opinion_Route SHALL call `fetchOpinionText` and SHALL respond with status 200 and JSON `{ "clusterId": <string>, "text": <string or null> }`.
5. IF the `clusterId` does not match the pattern of criterion 4, THEN THE Opinion_Route SHALL respond with status 400 and SHALL NOT call `fetchOpinionText`.
6. THE Verify_Route, Opinion_Route, and Mode_Route SHALL send `Cache-Control: no-store`, SHALL answer other HTTP methods with status 405, and SHALL write no request body, header, or token to any log.
7. THE route handlers in `apps/web/app/api/` SHALL be thin wrappers over functions in `apps/web/src/server/` and SHALL hold no verification logic.
8. WHEN `lookup` resolves with `unchecked` results, THE Verify_Route SHALL return them as received with status 200.

### Requirement 17: Verify flow

**User Story:** As a pro se filer, I want one button that checks every citation and quotation, so that I see what is wrong before I file.

#### Acceptance Criteria

1. THE Verify button SHALL be enabled WHILE the Document holds at least one Full_Record and no Verify_Flow is running, and SHALL be disabled otherwise.
2. WHEN the user activates Verify, THE Verify_Flow SHALL send exactly one `POST /api/verify` through the Api_Client with the body `{ "records": [...] }` holding, in document order, each `document.citations` entry whose `kind` is `full`, unmodified, and nothing else.
3. THE Verify_Flow SHALL NOT include document text, quote text, short-form records, or other-reference records in any request.
4. WHEN the Verify_Route responds with status 200, THE Verify_Flow SHALL send one `verification` action to the Store holding the returned pairs.
5. WHEN the `verification` action has been applied, THE Verify_Flow SHALL select every quote of the current Document whose attached citation (the citation whose `citation.start` equals the quote's `citationStart`) has a `verified` result under the Engine's `verificationOf`, and SHALL group those quotes by cluster id.
6. THE Verify_Flow SHALL send one `GET /api/opinion/<clusterId>` for each distinct cluster id of criterion 5, one after another, with no request body.
7. WHEN the Opinion_Route responds with a non-null `text`, THE Verify_Flow SHALL run the Verifier's `checkQuote(text, quote.text)` in the browser for each quote of that cluster, reading `quote.text` from the current Document at that moment, and SHALL send one `quoteCheck` action to the Store holding the results.
8. IF the Opinion_Route responds with `text: null` or with an error, THEN THE Verify_Flow SHALL leave the quotes of that cluster unchanged, SHALL continue with the next cluster, and SHALL count the cluster as unavailable.
9. THE Verify_Flow SHALL send no request for a quote whose attached citation is not `verified`.
10. IF the `POST /api/verify` request fails or returns a non-200 status, THEN THE Verify_Flow SHALL leave the Document unchanged and set the Notice "Verification could not be completed. Your citations are unchanged."
11. IF the Epoch changes while the Verify_Flow is running, THEN THE Verify_Flow SHALL discard every later result and apply none of them.
12. WHEN the Verify_Flow finishes, THE Web_App SHALL set a Notice stating the number of citations by status (`verified`, `not_found`, `ambiguous`, `unchecked`), the number of quotes by result, the number of skipped results, and the number of unavailable opinions.
13. WHILE the Verify_Flow is running, THE Verify button SHALL show the label "Verifying…" and be disabled.
14. FOR ALL Documents, every request body the Verify_Flow builds SHALL be a JSON object whose only property is `records`, whose elements are each structurally equal to a `kind: "full"` entry of `document.citations`, and SHALL contain no run of 20 or more consecutive characters of `document.text` taken from outside the `[start, end)` ranges of Full_Records; and every other request the Verify_Flow sends SHALL be a body-less `GET` whose path is `/api/opinion/` followed by a cluster id taken from a `verified` result of that Document (Property 5, only citations leave).

### Requirement 18: Issues list and overrides

**User Story:** As a filer, I want to see every problem in one list and write a reason for the ones I choose to keep, so that the filing never hides a problem.

#### Acceptance Criteria

1. THE Issues_List SHALL show one row for each entry of `issues(document)`, in the Engine's order, with the issue code (for example `CIT ✘`), the text `document.text.slice(start, end)` shortened to at most 80 characters with an ellipsis, and a "Go" control.
2. WHEN the user activates "Go" on a row, THE Web_App SHALL set the Editor selection to the Pos of the issue's `start` and focus the Editor.
3. WHEN an issue is in `blockingIssues(document)`, THE Issues_List row SHALL show an "Override…" control.
4. WHEN an issue has an Override, THE Issues_List row SHALL show the text "Overridden" and the override reason, and no "Override…" control.
5. WHEN the user activates "Override…", THE Override_Dialog SHALL open as a modal dialog (`role="dialog"`, `aria-modal="true"`) with a labelled reason field, a statement that the reason will be printed in the certification, and "Save override" and "Cancel" buttons.
6. WHILE the reason field holds fewer than 10 characters after trimming surrounding whitespace, THE "Save override" button SHALL be disabled.
7. WHEN the user activates "Save override", THE Web_App SHALL send an `override` action with the issue key, the reason as typed, and a timestamp from the injected `now`, and SHALL close the dialog.
8. IF the Store reports an error for the `override` action, THEN THE Override_Dialog SHALL stay open and show the error kind.
9. WHEN the Override_Dialog opens, THE dialog SHALL move focus into the reason field; WHEN the user presses Escape or activates "Cancel", THE dialog SHALL close without an action and return focus to the control that opened it; AND WHILE the dialog is open, THE dialog SHALL keep keyboard focus inside itself.
10. WHILE `issues(document)` is empty, THE Issues_List SHALL show the text "No issues."
11. WHEN an Issues_List row is a `QUO ✘` whose `QuoteCheckResult` is a mismatch with `prefixLength`, THE row SHALL show the Divergence_Words of that quote, labelled "Diverges at:", computed in the browser from the quote text in the current Document; no quote text SHALL be sent to the server for this purpose.

### Requirement 19: Export gate

**User Story:** As a filer, I want export blocked while any red code is unresolved, so that I cannot file a problem by accident.

#### Acceptance Criteria

1. WHILE `blockingIssues(document)` is non-empty, THE Export_Button SHALL be disabled and SHALL be labelled "Export (<n> blocking)" where `<n>` is the length of `blockingIssues(document)`.
2. WHILE `blockingIssues(document)` is empty, THE Export_Button SHALL be enabled and labelled "Export".
3. WHEN the user activates the enabled Export_Button, THE Export_Dialog SHALL open as a modal dialog stating that the export and certification feature is provided by the export-certification spec, with a "Close" button.
4. THE Web_App SHALL NOT produce a DOCX file, a PDF file, or a certification in this spec.
5. THE Export_Dialog SHALL follow the focus rules of Requirement 18, criterion 9.

### Requirement 20: New document and demo load

**User Story:** As a judge, I want one click to load a realistic AI-drafted motion, so that I can see the product work without writing anything.

#### Acceptance Criteria

1. THE script `apps/web/scripts/copy-demo.ts` SHALL copy `packages/engine/fixtures/demo-motion.txt` to `apps/web/public/demo-motion.txt` byte for byte, and SHALL exit with a non-zero status when the source file is missing.
2. WHEN the user activates "Load demo motion", THE Web_App SHALL fetch `/demo-motion.txt` through the Api_Client, create a Document with the Engine's `createDocument(text, timestamp)` so that the text is one `PST` span, and install it through a `replace` action.
3. IF the Document text is non-empty when the user activates "Load demo motion" or "New", THEN THE Web_App SHALL ask for confirmation in a modal dialog before replacing the Document.
4. IF the fetch of `/demo-motion.txt` fails, THEN THE Web_App SHALL keep the Document and set a Notice.
5. WHEN the user confirms "New", THE Web_App SHALL install an empty Document through a `replace` action and SHALL remove the Autosave_Key from `localStorage`.
6. WHEN a `replace` action installs a Document, THE Web_App SHALL discard the results of any running Verify_Flow by the Epoch rule of Requirement 17, criterion 11.
7. THE loaded Demo_Motion SHALL show the origin code `PST` for its whole text, not `AI`.

### Requirement 21: Demo path

**User Story:** As a hackathon judge, I want the demo path to work end to end with no account, so that I can judge a complete product in under ninety seconds.

#### Acceptance Criteria

1. WHEN the Demo_Motion is loaded and Verify runs in Fixtures_Mode, THE Web_App SHALL show `verified` for `556 U.S. 662` and `404 U.S. 519`, `not_found` for `1047 F.3d 212`, `1012 F. Supp. 2d 88`, and `912 F.4th 33`, `QUO ✓` for the Haines quotation, and `QUO ✘` for the Iqbal quotation.
2. WHEN the Verify_Flow of criterion 1 finishes, THE Export_Button SHALL read "Export (4 blocking)".
3. WHEN the user records an override for one of the four blocking issues, THE Export_Button SHALL read "Export (3 blocking)".
4. WHEN the user activates Verify on the Demo_Motion in Fixtures_Mode, THE Web_App SHALL show all verification results within 10 000 ms.
5. THE Web_App tests SHALL include one example test that drives criteria 1 to 4 through the Store, the Verify_Flow with an Api_Client whose `fetch` calls the route handler functions directly, and the Issues_List, with no network.
6. WHEN checkpoint 7 runs, THE completion notes SHALL record that `pnpm dev` served the page and that the path load demo motion, Alt-F3, Verify, red codes, override, and label change was walked by hand once.
7. WHEN the Demo_Motion is loaded and before Verify runs, THE Export_Button SHALL read "Export (7 blocking)"; after Verify in Fixtures_Mode it SHALL read "Export (4 blocking)"; and after one override it SHALL read "Export (3 blocking)" (counts verified against the real Engine and fixtures).

### Requirement 22: Assistant provider module and route (Tier 2)

**User Story:** As a self-represented litigant, I want a drafting assistant that cannot invent citations silently, so that the codes can check what it writes.

#### Acceptance Criteria

1. THE Llm_Module SHALL export `draft(prompt, context): AsyncIterable<string>` and a pure `selectProvider(config)` over the assistant fields of `readServerConfig`.
2. THE `selectProvider` function SHALL choose Amazon Bedrock WHEN `AWS_REGION` and `BEDROCK_MODEL_ID` are both non-empty; otherwise Anthropic WHEN `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are both non-empty; otherwise the fixture provider.
3. THE Web_App SHALL take every model id only from `BEDROCK_MODEL_ID` and `ANTHROPIC_MODEL` and SHALL contain no hard-coded model id.
4. THE fixture provider SHALL return the text of `apps/web/fixtures/assistant/<hash>.txt`, where `<hash>` is the first 16 hexadecimal digits of the SHA-256 of the prompt after trimming and collapsing runs of whitespace to one space, and SHALL return `apps/web/fixtures/assistant/default.txt` WHEN no such file exists.
5. THE fixture provider SHALL yield its text as a sequence of chunks of at most 64 characters.
6. THE system prompt SHALL state that the model is drafting a court filing for a self-represented person and must not invent citations.
7. THE Llm_Module SHALL receive as context only the text of the paragraph at the cursor, truncated to its last 4 000 code units at a code point boundary, together with the prompt, and never the whole Document.
8. WHEN `POST /api/assistant` is called with `{ "prompt": <string>, "context": <string> }` where the trimmed prompt has 1 to 2 000 characters and the context has at most 4 000 characters, THE Assistant_Route SHALL stream the provider's chunks as `text/plain; charset=utf-8` with `Cache-Control: no-store`.
9. IF the body is invalid, has other properties, or violates the limits of criterion 8, THEN THE Assistant_Route SHALL respond with status 400 and SHALL NOT call the provider.
10. IF the provider fails before the first chunk, THEN THE Assistant_Route SHALL respond with status 502 and a generic message that holds no credential and no provider error text.

### Requirement 23: Assistant panel and AI insertion (Tier 2)

**User Story:** As a filer, I want to ask for a paragraph and have it marked as AI text from the moment it enters, so that the codes show where it came from.

#### Acceptance Criteria

1. THE Assistant_Panel SHALL contain a labelled prompt box, a "Draft" button, a streaming text area, and a line stating what Draft sends: for Bedrock or Anthropic, "Draft sends your prompt and the paragraph at the cursor to <provider name>."; for the fixture provider, "Demo mode: replies are recorded and nothing is sent to a model."
2. WHEN the user activates "Draft", THE Assistant_Panel SHALL send the prompt and the paragraph at the cursor to the Assistant_Route through the Api_Client and SHALL show the received text as it streams.
3. WHILE the stream is running, THE streamed text SHALL be absent from the Document.
4. WHEN the stream ends with non-empty text, THE Web_App SHALL insert the text, with `\r\n` and `\r` normalised to `\n`, at the Offset of the Editor selection head at that moment as one `insert` carrying `{ origin: "AI", runId, timestamp }`, through one `edit` action, so that the insertion is one Undo_Group.
5. THE Web_App SHALL set `runId` to `r<N>` where N is one more than the larger of `document.runs.length` and the Run_Log length.
6. WHEN the Web_App inserts assistant text, THE Store SHALL append to the Run_Log an entry holding the Run_Id, the provider name, the model id, the prompt, and the timestamp, replacing any entry with the same Run_Id.
7. IF the stream fails, or ends with empty or whitespace-only text, THEN THE Web_App SHALL insert nothing and set a Notice.
8. WHILE a stream is running, THE "Draft" button SHALL be replaced by a "Stop" button that aborts the request and inserts nothing.
9. THE Web_App SHALL NOT run application code to relabel assistant text after the user edits it; the Engine's threshold produces `AI>HUM`.

### Requirement 24: Provider adapters (Tier 2)

**User Story:** As a maintainer, I want the real providers behind the same interface, so that the demo runs on fixtures and a deployment runs on a model.

#### Acceptance Criteria

1. WHERE `selectProvider` chooses Amazon Bedrock, THE Llm_Module SHALL stream text through `@ai-sdk/amazon-bedrock` and the `ai` package with the model id from `BEDROCK_MODEL_ID`.
2. WHERE `selectProvider` chooses Anthropic, THE Llm_Module SHALL stream text through `@ai-sdk/anthropic` and the `ai` package with the model id from `ANTHROPIC_MODEL` and the key from `ANTHROPIC_API_KEY`.
3. THE provider adapters SHALL be the only modules in `apps/web/src` that import a provider SDK.
4. THE provider adapters SHALL take the streaming function as an injected argument so that tests supply a fake.
5. WHEN the tests run, THE Web_App SHALL call no provider SDK and no network.

### Requirement 25: Property tests and example coverage

**User Story:** As a maintainer, I want exactly the properties that prove something users depend on, so that the suite stays lean and meaningful.

#### Acceptance Criteria

1. THE Web_App SHALL contain exactly five property tests, one per claim in this list, each with exactly one `fc.assert(fc.property(...))` call, each in a file named `<module>.properties.test.ts`, each preceded by a `// Property N` comment: (1) offset round trip (Requirement 4, criterion 6), (2) mirror invariant (5.8), (3) undo restores exactly (8.11), (4) pane layout is faithful (11.8), (5) only citations leave (17.14).
2. THE Web_App SHALL title the `describe` block of each property test with `_Requirements: x.y_`, listing every criterion that the property covers.
3. THE property tests SHALL run with `numRuns` of at least 200 locally and exactly 500 when the `CI` environment variable is set, and each SHALL assert a relationship between the generated input and the output.
4. THE property tests SHALL import shared arbitraries from `packages/engine/src/testing/arbitraries.ts` wherever one exists and SHALL define the app-specific arbitraries (paragraph lists, ProseMirror transactions, operation sequences, documents with citations and quotes) in `apps/web/test/arbitraries.ts`.
5. THE Web_App SHALL drive ProseMirror in Properties 1 and 2 through `EditorState` and `Transaction` without an `EditorView`.
6. THE Web_App tests SHALL cover every other acceptance criterion with example tests, SHALL include one rendering test for each of the toolbar, Editor, Pane, Issues_List with Override_Dialog, and Export_Dialog components, and WHERE the assistant is present (Tier 2) one for the Assistant_Panel, using `@testing-library/react` under jsdom and no browser automation.
7. THE Web_App tests SHALL mock only `fetch` and the Llm_Module provider, and SHALL NOT mock the Engine or the Verifier.
8. IF a property test fails, THEN THE test run SHALL report the failing seed and counterexample, and re-running `fc.assert` with `{ seed }` set to the reported value SHALL reproduce the same failure.

### Requirement 26: Documentation and steering alignment

**User Story:** As a maintainer, I want the written contract to match the code, so that nobody relies on a data flow the app no longer has.

#### Acceptance Criteria

1. THE `README.md` section "What leaves your machine" SHALL state that Verify sends only citation records to the app's own server and from there citation strings to CourtListener, that quotation text is checked in the browser and never sent, and WHERE the assistant is present (Tier 2), that Draft sends the prompt and the paragraph at the cursor to the configured LLM provider.
2. THE `.env.example` SHALL list `COURTLISTENER_BASE_URL`, and WHERE the assistant is present (Tier 2) `BEDROCK_MODEL_ID` and `ANTHROPIC_MODEL`, each preceded by a comment line describing its purpose and its default or required pairing.
3. THE `.env.example` SHALL remove the `LLM_PROVIDER` entry, because the provider is chosen by which credentials are set; this criterion applies whether or not the assistant is present.
4. THE `docs/KIRO_USAGE.md` SHALL contain one row for the `web-tests-on-save` hook and one row for this spec, each giving the item name and the repository-relative path of its defining file.
5. THE `BUILD_LOG.md` SHALL contain one new entry headed with the date in YYYY-MM-DD format and the spec name `editor-app`, listing each instance where Kiro's output was wrong and the fix applied, or the text "No Kiro errors" if there were none.
6. WHEN this spec lands, THE `.kiro/steering/structure.md` SHALL be rewritten to place the app's source under `apps/web/src/` and `apps/web/app/` in the layout of the design (task in group 9); THE `.kiro/steering/tech.md` already describes the `draft` interface and the token behaviour and SHALL remain consistent with this spec.
7. IF the data flow described in the README differs from the requests the Web_App sends, THEN THE reviewer SHALL treat the difference as a blocking defect for this spec.

## Known limitations

Standing rule (carried over from the provenance-engine and citation-verifier specs, user decision): anything that affects only malformed input or a rare citation or editing style is recorded here as one line, with no spec change and no stop.

- L1. The v1 editor is plain paragraphs: no bold, italics, headings, lists, centring, or tabs. The caption block of the Demo_Motion shows left-aligned plain text, not a centred filing caption.
- L2. Engine gap, worked around in the app: the Engine `RunEntry` is `{ runId, originalLength, editedCount, relabelled }` and the Engine creates it itself on the first `AI` insert for a Run_Id (`addOriginalLength`). It has no provider, model, prompt, or timestamp. The app keeps those in the Run_Log beside the Document and persists them in the Persisted_Value. An undo of an assistant insertion removes the Engine run entry, so the Run_Id formula of Requirement 23, criterion 5 uses the Run_Log length to avoid reusing an Id. A Run_Log entry can outlive its Engine run entry.
- L3. Engine gap, worked around in the app: `setVerification`, `setQuoteCheck`, and `recordOverride` change the Document without going through `apply` and return no `Inverse`, and `apply` of an earlier `Inverse` returns `stale_inverse` unless the Document is structurally equal to the one that Inverse expects. The app therefore empties both history stacks after any of these writes (the History_Barrier), so Cmd-Z cannot undo a verification or an override, and cannot undo edits made before them.
- L4. Fixtures_Mode answers 404 for every citation it has no recording for, which the Verifier maps to `not_found`; the app cannot tell an unrecorded real case from a fabricated one. The Issues_List line of Requirement 15, criterion 7 is the mitigation. A user who pastes real citations into a deployment without a token sees red codes for them.
- L5. The app has no unauthenticated live mode because CourtListener's citation-lookup endpoint answers an anonymous POST with 401 (checked 2026-11-07); a missing token selects Fixtures_Mode. `tech.md` has been corrected (it previously claimed unauthenticated lookups at a lower rate).
- L6. A drag-move of text inside the Editor is a delete plus a drop, so the moved text is re-inserted as `PST` even though the author wrote it.
- L7. On laptops where the function keys default to media controls, Alt-F3 and F7 need the Fn key, and some operating systems capture Option-F3 or F3 first. The toolbar button is the fallback for the Pane; F7 has none.
- L8. Undo history is unbounded within a session (each Inverse retains the Document it expects), so a very long editing session on a long filing can use significant memory. New, Load demo motion, Verify, and Override empty the history.
- L9. A quotation from a dissent or concurrence is checked only against the first opinion with text (citation-verifier L1), so a real quotation can show `QUO ✘`. The failure direction is safe.
- L10. CourtListener throttles opinion fetches at 5 per minute (citation-verifier L3). A document whose verified citations span more than a few distinct clusters with quotes leaves later quotes `QUO …`; the Notice counts the unavailable opinions, and pressing Verify again later uses the cache.
- L11. The Persisted_Value is stored unencrypted in `localStorage`; on a shared computer the author should use New to remove it. Two tabs on the same origin overwrite each other's autosave (last write wins).
- L12. A paste, drop, or assistant text that contains an unpaired surrogate is rejected by the Engine (`split_surrogate`) and leaves the Document unchanged with a Notice.
- L13. The Verify route has no per-client throttle; the shared Token_Bucket in the server's Verifier deps limits aggregate use. A public deployment should run in Fixtures_Mode.
- L14. The Assistant_Panel sends only the current paragraph, so the model cannot see the rest of the filing, and markdown in a reply is inserted as plain text. (Tier 2)
- L15. The app runs on webpack (`next dev --webpack`, `next build --webpack`) because Turbopack's resolution of the Engine's `.js`-specifier-to-`.ts` imports in Next 16.4.5 was not confirmed.
- Design and implementation record further entries here as L16, L17, and so on.

## Notes for the user

Assumptions and reconciliations recorded while writing this document. None of them changes the Engine or the Verifier.

- **Tiering.** Tier 2 is Requirements 22 to 24 plus the criteria marked "Tier 2" in Requirements 1, 7, 10, 15, 25 and 26. If the assistant is cut, delete those and the Run_Log criteria of Requirement 23; the Store keeps an empty `runLog` and the Persisted_Value keeps an empty `runLog` array, so no Tier 1 criterion changes.
- **Persisted_Value (Requirement 9).** The brief says "as JSON". The value is a JSON object whose `codes` field is the Engine's full rendering, loaded with `parse`. This reuses the Engine's validator, so a corrupt or tampered value is ignored by the same rule as a malformed Reveal Codes text, and verification state and overrides survive a reload.
- **Verification state is not text.** Brief decision 1 says every edit passes through `apply`. Verification, quote-check, and override writes are not text edits and have no `apply` form, so the Store calls the Engine's `setVerification`, `setQuoteCheck`, and `recordOverride` directly (L3).
- **Run_Id formula.** The brief gives `r<N>` with N = `document.runs.length + 1`. Requirement 23 uses the larger of that length and the Run_Log length, which equals the brief's value until an assistant insertion has been undone (L2).
- **OVR and REF colours.** The brief gives OVR as grey `#555555` without a background; on `#0000AA` that is barely legible, so Requirement 12 draws OVR tokens `#555555` on `#AAAAAA`. REF tokens use `#AAAAAA` on `#0000AA` to read as grey, and closing codes use `#FFFFFF`. All colours are in the Palette.
- **Mode route.** The brief gives `{ mode: "fixtures" }`. Requirement 15 adds `mode: "live"` and, for Tier 2, an `assistant` field so the panel can state what Draft sends without a second route.
- **Verify route strictness.** The route answers 400 to a body with extra properties or a non-`full` record, rather than ignoring them, so the privacy claim is enforced on the server as well as tested on the client.
- **Confirmation dialogs.** Requirement 20 asks for confirmation before "Load demo motion" replaces a non-empty draft, in addition to the brief's confirm for "New", because the replacement is not undoable (History_Barrier). Resolved: accepted by the user.
- **Steering conflicts.** `tech.md` describes an `LlmProvider` interface chosen by `LLM_PROVIDER` with Bedrock as default; the brief uses `draft()` chosen by the variables present. `structure.md` places code under `apps/web/components` and `apps/web/lib`; the brief uses `apps/web/src`. `product.md` and `testing.md` mention `apps/web/demo/`; the brief serves the engine fixture from `public/`. The token and LLM lines of `tech.md` are already corrected (L5); `structure.md` is updated in group 9 (Requirement 26, criterion 6). Resolved: accepted by the user.
- **Visual rules.** `.kiro/steering/ui.md` binds this spec; Requirement 10, criteria 9 to 18, state its rules as testable criteria. The Pane keeps its own palette (Requirement 12). Notices render as text in the toolbar status area, not as toasts.
- **Peer dependencies.** `@testing-library/react` needs `@testing-library/dom` as a peer, and the AI SDK packages may need `zod`. If either is required, it is added with an exact version and recorded in `BUILD_LOG.md`, as Requirement 1 limits the dependency list to the brief's.
- **API differences for design.** `transactionToOps(beforeText, steps, provenance)` follows the brief's signature; if ProseMirror needs the step documents to map positions, the design may derive them from `beforeText` (the paragraph structure is recoverable from the text) and keep the signature. Where a TipTap or ProseMirror API differs from an assumption here (paste and drop hooks, transaction metadata, Reconcile), the design keeps the behaviour stated in the criterion.
- **Bundling.** The Verifier imports JSON fixtures with import attributes and the Engine and Verifier are workspace packages; how Next.js transpiles them (for example `transpilePackages`) is a design item.
- **Edits outside `apps/web`.** Root `vitest.config.ts` (the `web` project), `.gitignore` (`apps/web/public/demo-motion.txt`), `apps/web/tsconfig.json` references, and `packages/verifier/package.json` `exports` (adds `./quote`; metadata only, no Verifier source change).
- **Divergence words.** The Verifier reports only `prefixLength`; the words shown for a `QUO ✘` come from the quote text already in the browser, so no quote text leaves the browser.
- **Accepted assumptions.** Unflagged edits are `HUM`; `jsdom` is `28.1.0`; Tier 2 pins are `ai` 7.0.165, `@ai-sdk/amazon-bedrock` 5.0.135, `@ai-sdk/anthropic` 4.0.99, `zod` 4.6.7.
- **Checkpoints.** Checkpoints follow the brief: after Groups 3, 5, and 7, then final. The `pnpm dev` walk-through is recorded at checkpoint 7 (Requirement 21, criterion 6).
