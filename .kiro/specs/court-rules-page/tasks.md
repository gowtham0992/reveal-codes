# Implementation Plan: court-rules-page

## Overview

Implementation follows the design's task order: commit the spec, extend the loader and fix the one dataset sentence, add the pure filter and grouping functions with Property 1, build the `/courts` page, wire the Order_Parameter and the three links into the editor, make the three repairs, then extend scans and docs. Language is TypeScript 5.x strict, as `tech.md` requires and the design uses. Nothing is pushed by any task.

## Tasks

- [x] 1. Commit the spec
  - [x] 1.1 Commit the spec files locally, before any other task
    - Stage by name only: `.kiro/specs/court-rules-page/requirements.md`, `design.md`, `tasks.md` and `.config.kiro`
    - Commit with a message such as `spec: court-rules-page requirements, design, tasks`
    - Do not push, do not stage any other file, do not modify code
    - _Requirements: 17.3_

- [x] 2. Loader returns `compiled` and `vocabulary`; dataset wording
  - [x] 2.1 Add `OrderVocabulary` and `OrderDataset` to `packages/export`
    - In `orders-types.ts` add `OrderVocabulary` and `OrderDataset = OrderSet & { compiled; vocabulary }`
    - In `orders-parse.ts` read `compiled` (string, else `orders: "compiled" is missing or malformed`) and add `readVocabulary(raw)` that fails the load when a member of an enumerated list is absent from its group or is not a string
    - In `orders.ts` make `loadOrders` return `Result<OrderDataset, string>` and `ORDERS` an `OrderDataset`
    - Export `OrderDataset` and `OrderVocabulary` from `index.ts`; no existing export changes shape
    - _Requirements: 1.6_

  - [x] 2.2 Replace the `negative_certification_when_unused` vocabulary sentence and regenerate the Power copy
    - Replace only `vocabulary.elements.negative_certification_when_unused` in `data/standing-orders.json` with the exact text of requirement 15.1; leave every entry byte for byte unchanged and keep the file's formatting
    - Run `pnpm power:build` so `powers/citation-check/skills/court-ai-rules/references/standing-orders.json` equals the dataset
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 2.3 Write loader and dataset tests in `packages/export/test/`
    - `loadOrders` returns `compiled` and a complete `vocabulary`
    - A dataset missing one status word fails with `orders: vocabulary "status" lacks "<word>"`
    - The new sentence is present; the entries array equals the entries of `git show HEAD:data/standing-orders.json` compared through `JSON.stringify`
    - The Power copy is byte-equal to the dataset
    - _Requirements: 1.6, 15.2, 15.3, 15.4_

- [x] 3. Pure filter, grouping and stats
  - [x] 3.1 Implement `filterOrders` in `packages/export/src/order-filter.ts`
    - Export `KindChoice`, `FilterState`, `CLEARED_FILTER`, `normaliseText` (`toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")`) and `filterOrders` exactly as the design specifies; input order preserved; a query that normalises to empty matches everything
    - No `node:` or DOM import; plain data only
    - Export all of them from `packages/export/src/index.ts`
    - _Requirements: 6.4, 6.5, 6.8_

  - [x] 3.2 Implement `courtGroups`, `compareAbbreviations` and `orderStats` in `packages/export/src/order-groups.ts`
    - `compareAbbreviations` is `a.localeCompare(b, "en", { numeric: true })`
    - Inside a group: Court_Wide before Judge_Level, then `date` descending, then `id` ascending by code unit
    - `orderStats(dataset)` returns total, court count, in-force count and `compiled`
    - Export `CourtGroupView`, `OrderStats` and the functions from `index.ts`
    - _Requirements: 2.2, 3.1, 3.2, 3.3, 3.4, 6.6_

  - [x] 3.3 Write property test for the filter
    - **Property 1: The filter selects exactly the entries the rule names**
    - **Validates: Requirements 6.4, 6.8, 16.11, 16.12, 16.13**
    - Create `packages/export/test/support/arb-order-filter.ts` with `arbOrderEntries` and `arbFilterState(entries)` (cleared state, substring queries, case/punctuation/spacing variants, empty and punctuation-only queries, queries that match nothing, all five kinds and "all", boolean checkbox)
    - Create `packages/export/test/order-filter.properties.test.ts` with one `fc.assert(fc.property(...))`, a `// Property 1` comment, `_Requirements: 6.4, 6.8_` in the describe title, and `numRuns: runs()` from `support/arbitraries.ts` (200 local, 500 CI)
    - The oracle is written independently of `filterOrders` and does not call `normaliseText`; assert id-list equality including order, and equality with `status === "current"` for the cleared state
    - No `try/catch`, no snapshot

  - [x] 3.4 Write example tests for grouping, ordering and stats
    - `packages/export/test/order-groups.test.ts`: group order uses the same `compareAbbreviations`; a synthetic list with "5th Cir." and "10th Cir. BAP" puts 5th first; Court_Wide before Judge_Level; newest first; id tie-break; `orderStats` equals counts computed from the shipped dataset
    - _Requirements: 2.2, 3.2, 3.3, 3.4, 16.2, 16.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. The `/courts` page
  - [x] 5.1 Add Placement_Words and link constants
    - In `apps/web/src/order-copy.ts` add `placementWords: Record<CaptionPlacement, string>` ("Heading on the first page", "Title of the statement", "Separate declaration")
    - Create `apps/web/src/courts/links.ts` exporting `COURT_RULES_PATH`, `COURT_RULES_SHORT` ("Court rules") and `COURT_RULES_LONG` ("See all court rules")
    - _Requirements: 4.6, 9.1, 9.2, 9.4_

  - [x] 5.2 Create the view model, intro text and hash helper
    - `apps/web/src/courts/view-model.ts`: `buildCourtsModel(dataset, repoBase)` returning `stats`, `repoLinks` (trailing slashes stripped, `/blob/main/data/standing-orders.json` and `/blob/main/data/README.md`; null when Repo_Base is null), `inactiveIds`, `words`, `titles`
    - `apps/web/src/courts/intro.ts`: `introText(stats, repoLinks)`; every figure comes from `orderStats`, none is a literal; states each instrument was read from the court's own text and that the data is CC0
    - `apps/web/src/courts/hash.ts`: `decodeHash` (catches only `URIError`, returns the raw text) and `showInactiveForHash`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 4.10, 5.4_

  - [x] 5.3 Build `InstrumentView`, `CourtsBrowser`, the stylesheet and control rules
    - `apps/web/src/courts/instrument-view.tsx`: hook-free; shows title (`h3`, `instrument` when empty), instrument name, judge name and role, Kind_Words and Applies_Words, date and `date_note`, "Not in force." with the status sentence and the `superseded_by` link, the Element_Words list (omitted when empty), caption and Placement_Words, `blockquote` with `curlyQuoted` key language, "Read the court's text" (`target="_blank" rel="noreferrer"`), and "Draft under this rule" to `/?order=<encoded id>` for In_Force instruments only; never reads `retrieved`, `source_kind` or `notes`; each instrument element has `id` equal to the entry id
    - `apps/web/src/courts/courts-browser.tsx`: client component; first render shows every instrument and no control; after mount sets `mounted`, applies the hash rule, shows labelled controls (text box, kind select with "All kinds" and Kind_Words, checkbox "Show rules no longer in force"), the `role="status"` Count_Line `Showing n of m`, the empty-result sentence, and re-scrolls to the hash target; groups come from `courtGroups(filterOrders(...))`
    - `apps/web/app/courts/courts.module.css`: heights and layout only, Tokens only, one column from 320px, `overflow-wrap: anywhere`, `max-width: 100%`, no width at-rule, quotation with 1px `--rule` left edge, links `--oxblood`
    - Add text input and checkbox control rules to `apps/web/app/globals.css`; no new Token
    - _Requirements: 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.6, 6.7, 6.9, 6.10, 7.1, 7.2, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.10_

  - [x] 5.4 Create the server route `apps/web/app/courts/page.tsx`
    - Server component reading `ORDERS` and `getPublicLinks()`; renders the single `h1` "Federal court rules on AI in filings", the intro paragraph, the snapshot / not legal advice sentence, the "Open the editor" link to `/` (same tab) and `<CourtsBrowser>`
    - Export `metadata` with only `title` ("Federal court rules on AI in filings — Reveal Codes") and a one-sentence `description` with no figure
    - Imports only from `src/`; no fetch, no API route, no mark or wordmark
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.7, 2.8, 11.1, 11.2_

  - [x] 5.5 Write page content tests in `apps/web/test/courts-page.test.tsx`
    - Every id appears exactly once as an `id` attribute; intro figures equal `orderStats`; each superseded link target exists on the page; In_Force ids have the encoded Order_Link at any viewport width and Not_In_Force ids have none; no `retrieved`, `source_kind` or `notes` text; Repo_Base unset, set with a trailing slash, set without one; metadata has exactly `title` and `description`
    - _Requirements: 1.3, 2.2, 2.5, 2.6, 4.10, 4.11, 5.1, 5.2, 7.1, 7.2, 8.13, 11.2, 16.1, 16.2, 16.3, 16.7, 16.9_

  - [x] 5.6 Write filter UI tests in `apps/web/test/courts-browser.test.tsx`
    - Controls absent before mount and present after; initial state; checkbox ticked from a hash naming a superseded id; Count_Line text and `role="status"`; empty-result sentence; empty groups omitted; Court_Group and instrument order on the rendered page equals the order from `courtGroups`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 5.4, 6.1, 6.3, 6.6, 6.7, 6.9, 16.4_

- [x] 6. Order_Parameter and links into the editor
  - [x] 6.1 Implement the Order_Parameter
    - Create `apps/web/src/components/use-order-parameter.ts` with pure `classifyOrderParameter(orders, raw)` (`none`, `ignored`, `applied`) using `orderById`, and the hook `useOrderParameter` that runs once after mount in `AppShell`, stores a Selectable_Instrument through the shared `OrderSelectionStore`, and removes the parameter with `window.history.replaceState` (keeping other parameters and the hash; catch only `DOMException`)
    - `AppShell` creates the store with `useMemo(() => createOrderSelectionStore(svc.storage, ORDERS), [svc.storage])` and passes it to `Shell` (replacing the store created in `use-export.tsx`) and to `SmallScreenPage`
    - At 800px and wider dispatch the notice `Court rule selected: <abbreviation>, <optionText>.`; below 800px dispatch nothing
    - `SmallScreenPage` takes `selection: OrderEntry | null` (held in state, set only when this load applied a parameter) and shows the Selection_Line after the introductory text and before the links, as plain text; the Status_Line is unchanged
    - Route `/` stays static; the parameter is read only in a client effect
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12_

  - [x] 6.2 Add the Court_Rules_Link in three places
    - `components/toolbar.tsx`: last child, an `<a href="/courts" target="_blank" rel="noreferrer">Court rules</a>`, no `data-primary`, Toolbar height and button groups unchanged (adjust `toolbar.module.css` only if needed)
    - `ExportDialog`: "See all court rules" link beside the Picker, `target="_blank" rel="noreferrer"`; `OrderPicker` is not changed
    - `SmallScreenPage`: links row always renders, "See all court rules" first and in the same tab, video and repository links each conditional on their own value (remove the both-null guard)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 6.3 Write Order_Parameter and link tests in `apps/web/test/`
    - Valid, unknown and superseded ids at 1280px: store contents, notice text, parameter removed through `replaceState` with history length unchanged
    - At 600px: store set, no notice, parameter removed, Selection_Line text with abbreviation and `optionText`; unknown, superseded and absent each leave no Selection_Line; an earlier dialog selection gives no line; one example for the `DOMException` path
    - Court_Rules_Link: Export dialog (target, rel, beside the Picker), Small_Screen_Page (target, first, present with both public addresses unset), Toolbar (last, an `a`, no `data-primary`)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.7, 8.9, 8.11, 8.12, 9.1, 9.2, 9.3, 9.4, 9.5, 16.5, 16.6, 16.8_

- [x] 7. Repairs
  - [x] 7.1 Fix the Override_Table headers in the print view
    - In `print-view.tsx` give `BlockTable` the `overrides` class when its columns equal `OVERRIDE_COLUMNS` (confirm `OVERRIDE_COLUMNS` is exported from `@reveal-codes/export`)
    - In `print-view.module.css` add `.overrides th { overflow-wrap: normal; word-break: keep-all; }` and `min-width` rules for the Code (10ch) and Timestamp columns, sized from the longest value plus padding; leave body-cell `overflow-wrap: anywhere` as it is
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 7.2 Clear the old message when an Open starts
    - In `runOpen` of `use-open-draft.tsx` dispatch `{ type: "notice", text: null }` and `{ type: "openNote", text: null }` before `await openFile(file)`; give `refuseSeveral` the same `notice` reset
    - _Requirements: 13.1, 13.2_

  - [x] 7.3 Ignore declaration files and find the emitting process
    - Add `*.d.ts` and `!apps/web/src/css-modules.d.ts` to `.gitignore`
    - Search `package.json` scripts, `.kiro/hooks/*.json`, `.github/workflows/ci.yml`, `scripts/` and `vitest.config.ts` for the process that emits `.d.ts` into `crew/sentinel/src` and `packages/export/test/support`; fix it if found, otherwise record what was searched in the `BUILD_LOG.md` entry (task 8.2)
    - Remove no tracked file other than any stray untracked `.d.ts`; do not delete `apps/web/src/css-modules.d.ts`
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 7.4 Write repair tests
    - Stylesheet test on `print-view.module.css` that fails on the old file: `.overrides th` has both declarations and the two `min-width` values, and the body-cell `overflow-wrap: anywhere` rule is still present
    - Open test: open a refused file, then a valid second file with a non-empty draft; neither the Toolbar_Notice nor the Open_Note holds "Could not open <name>." while the confirm dialog is open
    - Repository test: `git ls-files` lists no `.d.ts` other than `apps/web/src/css-modules.d.ts`
    - _Requirements: 12.4, 13.2, 13.3, 14.4_

- [x] 8. Scans and documentation
  - [x] 8.1 Extend the static scans in `apps/web/test/static/`
    - Cover `app/courts/` and `src/courts/` in `css-rules`, the colour scan, `copy-rules`, `forbidden`, `boundaries` and `inventory`: Tokens only, allowed sizes and weights, no `@media (min-width|max-width)` other than the Shell's 799px rule, no icon, emoji, shadow, gradient, radius, animation or transition, and `app/courts/` imports only from `src/`
    - Add stylesheet assertions for the 320px causes: no fixed width above 100%, `overflow-wrap: anywhere`, `max-width: 100%` on the list
    - _Requirements: 10.2, 10.3, 10.4, 16.10, 16.14_

  - [x] 8.2 Update docs
    - `README.md`: one line in the dataset section with `https://reveal-codes.gowthamsarveswaran.com/courts`; README tests stay green
    - `docs/KIRO_USAGE.md`: add the `court-rules-page` spec row with its path `.kiro/specs/court-rules-page/`
    - `BUILD_LOG.md`: dated entry stating what was built, what Kiro got wrong, what fixed it, the shared-arbitraries location flagged in the design, and the emitting-process search result if it was not found
    - `.env.example`: extend the `NEXT_PUBLIC_REPO_URL` comment to say the Courts_Page uses it for the links to the dataset and its README
    - `.kiro/steering/ui.md`: state that the 1150px minimum applies to the Shell only and `/courts` is one column from 320px, and list the text input, checkbox and quotation rules
    - _Requirements: 10.9, 17.1, 17.2, 17.3, 17.4, 17.5_

- [x] 9. Final checkpoint - Run the full verification
  - Run each of these and fix failures: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, `pnpm --filter @reveal-codes/web build` (clean-checkout build), and `pnpm kiro:check`
  - Do not push; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP
- Task 1.1 is the first task and runs before any other; no task pushes
- The only property test is Property 1 (task 3.3); everything else uses example tests and static scans
- Each task references requirements for traceability
- Property tests live in `<module>.properties.test.ts` with `fast-check`; no snapshot tests and no network

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "5.1", "6.1", "7.1", "7.2", "7.3"] },
    { "id": 2, "tasks": ["2.3", "3.1", "6.2", "7.4"] },
    { "id": 3, "tasks": ["3.2", "3.3", "6.3"] },
    { "id": 4, "tasks": ["3.4", "5.2"] },
    { "id": 5, "tasks": ["5.3"] },
    { "id": 6, "tasks": ["5.4"] },
    { "id": 7, "tasks": ["5.5", "5.6"] },
    { "id": 8, "tasks": ["8.1", "8.2"] }
  ]
}
```
