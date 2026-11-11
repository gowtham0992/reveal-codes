## 2026-11-03

Bootstrapped repository with Kiro. Steering written first.

## 2026-11-07

### Task 11.3: apply benchmark (provenance-engine, Req 21.6)

Ran `pnpm --filter @reveal-codes/engine bench` once, from the repo root. It exited 0, with no environmental failure and no rerun. The output file `packages/engine/bench/results.json` is kept in place. The numbers below are copied verbatim from it.

Limits: median 5 ms, p95 15 ms. Seed: 20261103. Warm-ups: 100. Timed runs: 1000 per scenario.

Document counts: textLength 50000, spans 500, runs 12, fullCitations 100, quotes 40.

| Scenario                                          | Median (ms)         | p95 (ms)           | Result |
| ------------------------------------------------- | ------------------- | ------------------ | ------ |
| 21.1 insert outside every citation and run extent | 0.43641700000000583 | 0.5216669999999795 | pass   |
| 21.2 insert inside a citation and a run extent    | 0.44014549999997143 | 0.5993750000000091 | pass   |
| 21.3 delete outside every citation                | 0.4323339999999689  | 0.5579579999998714 | pass   |
| 21.3 replace outside every citation               | 0.4438749999999345  | 0.5281250000000455 | pass   |

Machine, as recorded in results.json:

- CPU model: Apple M4
- Total memory: 25769803776 bytes (24 GiB)
- OS: Darwin 27.0.0 arm64
- Node: v22.23.4

Reference_Machine: this machine is used as the Reference_Machine for this record. Requirements.md defines the term only as "the machine named in `BUILD_LOG.md` on which performance is measured". It states no minimum specification, so there is nothing for this machine to fail to match. Naming it here satisfies the definition. It is a developer laptop, not dedicated benchmark hardware.

The benchmark is manual. It is never run by `pnpm test`, `pnpm test:pbt`, or CI (Req 21.6, 21.7).

## 2026-11-07 (provenance-engine build summary)

### Task 12.1: engine build record (provenance-engine, Req 21.6, 22.5)

#### What the engine build delivered

`packages/engine` is a pure TypeScript package with no runtime dependencies. Modules in `src/`: `document.ts` (Document, creation), `ops.ts` and `ops/` (Insert, Delete, Replace, Inverse, one pipeline), `relabel.ts` (`AI` to `AI>HUM` by Edited_Proportion), `segment.ts` and `boundary.ts` (lossless Sentences), `citations/` (reporter and LEXIS grammar, party and short-form scan, quote attachment, `extract`, `format`, committed `reporters.json` and `lexis-courts.json`), `anchor.ts` (re-anchoring of keys, results, and Overrides across edits), `verification.ts`, `issues.ts`, and `codes.ts` with `codes/` (render in full and display modes, lex, decode, check, `parse`). `src/index.ts` is the public API. Shared arbitraries are in `src/testing/` (31 files, including `arb-document`, `arb-ops`, `arb-edit`, `arb-text-citations`, `arb-codes`, `arb-api`).

Counts from the current tree:

- Properties: 51 (design.md Property 1 to 51), each assigned to one task in tasks.md.
- Engine test files: 70 in `packages/engine/test/`, 14 of them `*.properties.test.ts`.
- `pnpm test` (just run, all packages): 72 files, 940 tests, all passed.
- `pnpm test:pbt` (just run, `FC_NUM_RUNS=500`): 14 files, 109 tests, all passed.
- Benchmark: `packages/engine/bench/`, manual only, results recorded in the section above (Req 21.6).
- Purity and inventory checks: `test/purity.test.ts` (including the check that the root scripts and CI never invoke the benchmark, Req 21.7) and `test/purity.properties.test.ts` (Property 42).

#### Where Kiro got something wrong, and what fixed it

Each item names the file that records the fix.

- Deviations D1 to D24 in `.kiro/specs/provenance-engine/design.md` ("Deviations" section). Each is a place where the first design or requirement could not be implemented as written. Examples: D1 (parallel pincites had nowhere to be written, so `extract(format(c))` lost them), D3 (court validity in Req 10.1 was too weak for the round trip), D4 (Req 11.3's garbage non-interference is false in general; Property 24 is restricted to neutral positions), D6 (Replace re-anchors once over its combined edit).
- `LOOKBEHIND`: the first value 82 was too small for the party scan. The corrected value is 162 (`PARTY_SCAN + 1`, with `PARTY_SCAN = 161`). See tasks.md 5.9 and design D17.
- Quote attachment was rewritten against Req 13: D19 (leading `with` or lower-case Gap_Signal words in a Case_Name), D20 (an earlier-opening pair wins over nested and crossing pairs, Req 13.10), D21 (only the longest Gap_Signal at a gap position is tried).
- Short_Form_Party was rewritten for requirements decision (h): D14 reversed (commas at Entity_Suffix starts stay in the party), D16 revised (`v.` as the joiner of two Party_Sides), D12, D13, D15 (stop-list handling).
- REF payload rule: commit `5996e92` changed Req 20.4 and design A12 so a payload on `[REF]` is a `bad_field` fault reported by the lexer, not `ref_code`. `ref_code` now means an `[OVR]` after a `[REF]`. Property 41 generates the REF tamper with `bad_field` (commit `b84d833`, `test/codes.properties.test.ts`).
- Design example string: commit `55d348e` corrected the Reveal Codes example in design.md. `[OVR]` follows its opening `[CIT ✘]` code, and the header is `[DOC{v=1;n=1;r=r1,10,0,0}]`. The test in `test/codes.test.ts` was changed to match.
- `parse` fault index (Req 20.3): `test/codes.test.ts`, "parse reports the lowest fault across lex and decode", checks that a decode fault is reported at the global lowest index, not only a lexer fault.
- `missing_doc` tie at index 0: `[PST]` with no `[DOC]` is also a `bad_field` at 0. `missing_doc` wins the tie (`test/codes.test.ts`, "rejects a display rendering with missing_doc at 0").
- Unlisted LEXIS courts: D22 (they extract with `lexisCourtListed: false` and `setVerification` rejects `verified` with `not_verifiable`, Req 16.5) and D23 (`parse` rejects `[CIT ✓]` on such a citation with `unverifiable_status`, Req 20.4). D24 (a token containing `Id.` is not a Garbage_Citation, Req 11.3) came from a Property 24 counterexample.

#### Tests that were hard to write

- Property 26 (`test/anchor.properties.test.ts`): `arbDocAndOp` can produce an empty edit over an empty range. Req 4.7 says that returns the input Document unchanged, so the property asserts that case separately and only then checks carry-over and fresh keys.
- Property 42 (`test/purity.properties.test.ts`): the check for invented Timestamps and Run_Ids had to also accept the backslash-decoded form of an argument, because `parse` decodes escaped Run_Ids (`r\[1\]` becomes `r[1]`). Relates to Req 19 escaping.
- `arb-edit` coverage floor (`test/arb-edit.test.ts`): the floor on edits that touch a citation was 60 and is now 30. The comment there gives the measured rate, about 17% (41 to 64 of 300 across seeds), so 60 passed only by seed luck. The generator was not changed.
- Property 43 (`test/arbitraries-validity.properties.test.ts`): it holds several `fc.assert` calls (10 in the file) rather than the one the testing rules ask for, one per generator checked. This was accepted by the user. It sits apart from the other properties because it checks the shared arbitraries (Req 22.4), and was moved to its own file in commit `7fce4c8`.
- Property 15 (`test/segment.properties.test.ts`): needs `{ timeout: 60_000 }`. The comment records 0.85 to 1.2 s idle, 5.1 to 6.9 s with the CPU oversubscribed, and one run of 52.7 s under load, against vitest's 5 s default. Property 28 has no timeout override in the repo, and I did not measure its `arbDocument` cost, so nothing is claimed about it here. The slowest property in the last `test:pbt` output I read was P30 at about 3.2 s.
- Property 20 and Property 45 (`test/extract.properties.test.ts`): the reference model has to try every split `P1 + S + P2 + C + P3` of a gap, with its own Gap_Signal list typed from the Glossary, so it does not share code with the engine.

#### Counterexample regressions recorded under Req 22.5

Named example tests added after a property found a bug. The property was not weakened in any of them.

- `test/format.properties.test.ts`: seed 842338267, `1600 Phila. Ct. Com. Pl. LEXIS 1` is a Database_Citation, not a reporter (Req 14.7).
- `test/format.properties.test.ts` with `test/support/p24-seed-26608700.ts`: seed 26608700, the gap of a quote that attaches to nothing is not a neutral position (Property 24, Req 11.3, D4).
- `test/format.properties.test.ts`: seed 1899639715, `1 Id. A 1` is not a Garbage_Citation and its `Id.` extracts as an Orphan (D24).
- `test/anchor.properties.test.ts`: seed 2112810442, a Replace touching a citation issues exactly the keys its items keep (Property 27, D6).
- `test/ops.properties.test.ts` with `test/support/p7-seed-1330162038.ts`: seed 1330162038, a Replace relabels after its delete step and again after its insert step (Property 7, Req 6.9).
- `test/segment.properties.test.ts`: seeds -2112387698, -723280868, 409568589, `initialExample` cases where a `.` also ends a multi-word Reporter_List entry (Property 15, Req 8.6).
- `test/arb-text-citations.test.ts`: two Gap_Signals `See also See` before a Case_Name attach nothing (Req 13.1, D21).
- `test/extract.properties.test.ts`: seed -341920749, no `Id.` right after a closing `”` (Property 20, Req 12.1).
- `test/extract.properties.test.ts`: seed -1203167891, a `(D.)` court ends the Sentence, so the second quote attaches to nothing (Property 47, Req 13.5, 13.7).
- `test/relabel.properties.test.ts`: an AI insert inside a relabelled span merges and keeps that span's Timestamp (Property 13).

Requirement faults found during the build were fixed in requirements.md and design.md (commits `5996e92`, `55d348e`, `72ab937`, `ae5203f`, `4a95508`) rather than by weakening a test.

## 2026-11-07 citation-verifier

### Where Kiro got something wrong, and what fixed it

Task numbers refer to `.kiro/specs/citation-verifier/tasks.md`.

- 1.1: the silent pnpm reporter hid a failed `pnpm install`. The template scanner closed a template literal on its opening backtick. An 80-line `stripNonCode` broke the 40-line rule. The limits test excluded `describe` callbacks. Each was fixed in the task.
- 1.2: a 70-line clock helper (split), a nonexistent import (corrected), and a conflict with the old `citations.md` steering (aligned in 8.1).
- 2.1: `trim()` strips U+FEFF, so step 6 needed explicit trimming.
- 2.2: three example tests had wrong expectations; the code was right and the tests were corrected.
- 2.5: `wordEndCuts` missed the cut just after a space (a real bug, fixed). The prefix model ignored Req 8.7. The non-NFC adversarial vocabulary only exercised L3. Requirement 8.15 lacked "subject to criterion 7" (fixed). Requirement 8.12 was false as written for segments ending in a dot (fixed). The closing sentence of Requirement 8.15 disagreed with its largest-n definition (fixed).
- 3.1: the workspace dependency was not linked until `pnpm install` ran. `parseRetryAfter` used `Date.parse`, which accepts bare numbers.
- 3.2: the arbitraries file went over the 300-line limit (split). `fc.date` produced invalid dates.
- 3.3: the engine `testing/` directory was not exported, so the verifier used relative imports. A design snippet used `runs()` as an options object.
- 3.4: the first draft of the draft-assertion was a tautology.
- 3.5: the `CitationRecord` union has no key.
- 3.6: an arbitrary used an index fast-check does not provide.
- 4.1: the shortfall example test was wrong because `acquire` fills the Window_Log.
- 4.2: the timeout race sketch let a synchronous throw escape, and a `text()` rejection went unhandled. A test expected an absolute `wait_until` as a relative one.
- 4.3: design A12 encoded keys with `encodeURIComponent`, which throws on lone surrogates and does not separate keys that differ only in case on case-insensitive file systems. A custom injective encoding replaced it in `src/cache-file.ts`, and design A12 was updated in 8.1.
- 4.4: a stale `resultsForRecords` comment.
- 4.5: the task text named `arb-verifier.ts` for the script arbitraries; they live in `arb-script.ts`.
- 4.8: the expected `waitUntil` was computed from the lookup start, not the reply time.
- 5.1: none.
- 6.1: an earlier attempt used placeholder ids and made-up offsets. It also assumed star-pagination only (live markup uses `<page-number>`), assumed opinion GETs are unthrottled (live: 5 per minute), assumed `plain_text` is the usual source, and recorded excerpts that were not fully verbatim against the live text (OCR). Design A10 and L5 were updated in 8.1 and L11 added for the throttle.
- 6.2: `1 H. 150` was never run through the engine `extract` (the engine reads Hill), so the ambiguous fixture was unreachable by `lookup()`. Vitest was run from the wrong directory.
- 7.1: helper typing, BSD `sed` edits, and lint errors.
- 7.2: the `mcp.json` write was blocked by a permission rule until granted. The pnpm install failure was forced by the `CI=true` lockfile freeze. A commit hook swept `pnpm-lock.yaml` into the 6.1 commit. One single vitest run failed without explanation; six later runs were clean.
- 8.1: none found beyond the above (see the task completion notes).

### Pinned versions

`@modelcontextprotocol/sdk` 1.32.2 and `zod` 3.25.76, both exact in `packages/courtlistener-mcp/package.json`.

### Limitations found

- L5 (design.md) now covers `<page-number>` markers and a leading `<?xml ...?>` declaration.
- L11 (design.md) and L3 (requirements.md): CourtListener throttles the clusters and opinions endpoints at 5 requests per minute; a throttled opinion fetch returns `null`, `check_quote` reports `unchecked`, and the null is not cached.

### Tests that were hard to write and counterexample regressions

- Counterexample regression: the 2.5 `wordEndCuts` bug (the cut just after a space) is recorded as a named example beside Property 9 in `test/quote.properties.test.ts`.
- No other hard-to-write tests are recorded in the completion notes of tasks 1.1 to 7.2.

## 2026-11-07 editor-app

### Where Kiro got something wrong, and what fixed it

Task numbers refer to `.kiro/specs/editor-app/tasks.md`.

- 1.2: a generated `vitest.config.d.ts` was committed by accident and found when lint failed; fixed with a `.gitignore` entry, an eslint ignore, and adding `scripts` to the tsconfig.
- 3.2: guessed the Engine error kind `offset_out_of_range`; the real kind is `out_of_range`. The `CitationRecord` `other` variant has no key.
- 4.1: the transaction mapping dropped typing from a live TipTap editor, because the editor's schema instance differs from `editorSchema`. Task 4.2 fixed it with `Step.fromJSON`. The 4.1 tests missed it because they used `editorSchema` directly.
- Step.apply throws `RangeError` on out-of-range positions instead of returning `failed`; an `inBounds` pre-check was added.
- The demo's fabricated Iqbal quote hangs on a short-form citation, so the Verify flow and the test fixtures first missed the `QUO ✘`; fixed by resolving via `targetStart`.
- An instantly-resolving `sleep` makes every Verifier request time out; route tests use a real abortable timer.
- Tests that used `new URL(import.meta.url)` throw under jsdom; `__dirname` is used instead.
- The offsets property file had four `fc.assert` calls against the one-per-property rule; merged in 7.5.
- The scheduler wave graph put Tier 2 tasks ahead of Tier 1; the dependency graph was edited.
- 7.5: an agent without a browser could not complete the walkthrough. The user walked it and found that Go did not scroll the editor; task 7.6 was added because `placeCaret` lacked `scrollIntoView`.
- 7.6 fix was incomplete: ProseMirror ignores `scrollIntoView` on an unfocused view, so the first Go did not scroll. The user's by-hand walk found it, not the tests (jsdom has no layout). Fixed in 9.5 with a post-focus `requestAnimationFrame` centring scroll, measured in headless Chrome.
- The assistant reply joined the current paragraph. The by-hand walk found it; fixed in 9.6.
- `streamText.textStream` swallows errors and logs the provider message through `onError`; `sdkStreamText` records errors silently and throws a fixed error.
- `update_pbt_status` failed with a tool error for property tasks; the orchestrator set the statuses.
- The first `task_update` call per task returns a tool error but applies.
- 1.1: the API smoke tests found no wrong ProseMirror or TipTap API assumption.
- Risk R1 confirmed: Turbopack fails on the Engine's `.js` specifiers in Next 16.4.5; webpack is used (`next build --webpack`).

### Steering changes

- `structure.md` described `apps/web/components`, `lib/` and `demo/`, none of which exist; rewritten in 9.3 to the real `apps/web/src` layout. The `apps/web/demo/` mentions in `tech.md`, `testing.md` and `release.md` now say the demo motion comes from `packages/engine/fixtures/demo-motion.txt` through `copy-demo.ts`.

## 2026-11-08 export-certification

### Where Kiro got something wrong, and what fixed it

Task numbers refer to `.kiro/specs/export-certification/tasks.md`.

- 1.2 probe: `docx` bundled for the browser inside `apps/web` with `next build --webpack`; the chunk was 215 to 222 KB with 0 `node:` imports (the 5.4 build agreed). The client path was taken and `POST /api/export` was not built. A real-browser run of `Packer.toBuffer` was not performed and is left to the user, as is opening the .docx in Word or LibreOffice.
- 1.1: the root `vitest.config.ts` `project()` helper had no `env` parameter, so the `TZ` pin could not be set for the `export` project; the parameter was added. `packages/export/test` needed its own tsconfig reference.
- 2.2: the first time-zone assertions matched a literal instead of the shared constant; they now use the constant.
- 1.4: the Demo_Document builder's quote-owner lookup had to be copied, because `quotesByCluster` lives in `apps/web`.
- 4.1: `docx-blocks` first emitted a "Date:" label and empty paragraphs after tables, which violated D5 and Req 6.9; both were removed. The `Packer.toBuffer` result failed `instanceof Uint8Array` under jsdom (cross-realm Buffer); the check became `ArrayBuffer.isView` plus a re-wrap into a `Uint8Array`.
- 5.3: the first swallowing `catch` in `exportDocx` failed the limits scan; failures are now returned as values.
- 5.5: the `css-rules` scan allowed 12pt only for the editor surface; it was extended to `print-view.module.css`.
- Web tests that import the Demo fixture through `import.meta.url` fail under jsdom, so the views build their documents inline.

### Deviation from testing.md

Two web tests use `vi.mock` of `@reveal-codes/export`: the `buildDocx` rejection branch and the appendix parse-failure branch of `exportDocx` cannot be reached with a valid Document, so no real input triggers them. This departs from the rule "mock only fetch and LlmProvider". The mock replaces only the export package, never the Engine or the Verifier, and only those two branches use it.

### Limitations found

- L5 (requirements.md and design.md): `docx` silently drops XML-illegal control characters such as U+000C, so such a line is shorter in the .docx than in the Document. Property 4 does not cover it.

### Steering changes

- `structure.md` and `tech.md` now name `packages/export`.

## 2026-11-08 shell-polish

Before, the shell was a plain toolbar over an unframed editor with the mode badge in the toolbar; after, it has a wordmark and grouped toolbar, a 22px status line (or the pane status line) carrying the mode text, an 8.5in page, a ruled Issues region with a blocking count, a vertical assistant strip, a window title and favicon, and titled dialogs.

### Where Kiro got something wrong, and what fixed it

Task numbers refer to `.kiro/specs/shell-polish/tasks.md`.

- 2.1: the first `AppShell` version exceeded the 40-line function limit; the bottom region was extracted into `ShellBottom`.
- 2.2: the pane `statusLine()` test helper had to change because the status block now holds the Mode_Text as well as the status text; it reads the first child only.
- 1.1 and 2.1: the `css-rules` scan rejected the new font sizes (15px and 12px), so each task added its size to the accepted list; task 4.3 folded them into one list.
- 4.4: the `inventory` scan requires every file in the spec folder to be listed, including `tasks.meta.json`; the Spec row names all five files.

### Steering changes

- `ui.md` gained the favicon exception, the wordmark and status-line type sizes, the new layout line and the status-line copy rule.

## 2026-11-08 sentinel-sweep

Before, `crew/sentinel` was an empty placeholder package; task 1.1 gives it the real manifest, project references and the `pnpm sentinel` root script, and exports `STATEMENT_TITLE` and `APPENDIX_TITLE` from the Export_Package.

### Criterion 17 outcome (Req 12.17)

The relative import of the export test support (`packages/export/test/support/demo-document` and `demo-statement`) from `crew/sentinel/test/support/export-support.ts` compiled under `tsc -b` with the added `packages/export/test` project reference. The `src/testing` fallback was not needed.

### What was built

`crew/sentinel` is now the sweep CLI (`pnpm sentinel`) that checks a folder of exported `.docx` files for drift. It reads each file's Statement and Appendix, parses the recorded Document with the Engine, compares it with the body text, and rechecks the citations through the Verifier. It reports one finding per problem and never throws past its boundary. The `.docx` editing helpers and the `fc.ts` run-count helpers live in `crew/sentinel/test/support/`.

### What Kiro got wrong

- Test setup: the `throwingDeps` and `throwOnceDeps` fetch getters are caught by the Verifier and become `recheck_unavailable`, so they never reach the last-resort catch. The tests use a deps copy with a throwing `state` getter for that path.
- The analyse test first rewrote k0 to `not_found`. The Engine rejects an unverified k0 because the short form k8 links to it, so the test rewrites k1 (Haines) instead.
- The Engine and Verifier never reach the `notRechecked` path with real data, so there is no Lexis rejection test. The path is not covered by a test that would have to fake the data.
- `xml-text` failed eslint `restrict-plus-operands` under `noUncheckedIndexedAccess`, because indexed reads are `string | undefined`. The fix narrows each read before concatenating.
- The 1.3 tests first forgot `await` on the async demo helpers, so they compared promises. Adding `await` fixed them.

### `pnpm sentinel check` confirmation (task 4.6)

The root script `pnpm --filter @reveal-codes/sentinel run cli --` did not behave as design D11 assumed: pnpm passed the literal `--` through, so `cli.ts` saw `--` as `argv[2]` and `pnpm sentinel check <file>` exited 2 with `unknown command: --`. The brief assumed pnpm needed `--` to pass arguments through; pnpm 10 passes them without it and passed the literal `--` to the CLI. The fix drops the `--` (the script is now `pnpm --filter @reveal-codes/sentinel run cli`), and the static test in `crew/sentinel/test/static/package.test.ts` was updated to match. After the change, `pnpm sentinel check <demo export>` delivered `check` as the first argument, printed `No drift.` and exited 0, and `--json <file>` was passed through and written. The demo `.docx` came from a throwaway script that was deleted afterwards. The final run of lint, typecheck, test (2159 tests) and `FC_NUM_RUNS=500 pnpm test:pbt` (135 tests) passed.

## 2026-11-09 court-orders

### What was built

Task numbers refer to `.kiro/specs/court-orders/tasks.md`.

- `packages/export`: the dataset loader and validation for `data/standing-orders.json` (`src/orders.ts`), plus the order sentences in the Statement.
- Export dialog and Print view: the Picker, the Order_Summary, the confidentiality checkbox and the prohibition block.
- DOCX: the first-page header.
- Sentinel: `STATEMENT_TITLES` in the splitter, so it recognises every title the Statement can now carry.
- Demo motion: moved to N.D. Tex.

### Where Kiro got something wrong, and what fixed it

- The requirements pass found that the Sentinel matched only the Standard_Title. A Statement titled for a court's instrument would have been missed by the sweep. `STATEMENT_TITLES` in the splitter fixed it.
- The change to a line of the demo motion shifted every later Offset by +8 (design D20). The character count in two export tests went from 2611 to 2619. The tests were updated to the new count; the Offsets were not hand-patched elsewhere.
- Prettier pass on `data/standing-orders.json` (design D19): the dataset is formatted by Prettier, so the file was reformatted once to satisfy `pnpm lint`.
- `tsconfig` change for the JSON import: `rootDir` was widened to `../..`. The `declarationDir` fallback was not needed.
- A `catch` in `order-selection.ts` failed the limits scan. The function was restructured to return the error as a value.

### Known wording gap

The prohibition line reads "1 AI-origin span remain". This follows the spec's "span(s) remain" literally, and is grammatically off for one span. It is left as written and is not fixed here.

### Tests that are weaker than they look

The `edtex-love` and `dhaw` Sentinel proof tests assert a clean report. They do not assert the cut position.

Requirements: 12.3, 12.13.

- Court-orders task 6.4: the demo motion now cites the Fifth Circuit and N.D. Tex. (volumes, reporters and pages unchanged, so recorded lookups still resolve). `N.D. Tex.` is 3 characters longer than `D. Or.`, so every later Offset shifted +3 and the Statement character count went from 2619 to 2622. The Engine grammar accepted both courts with no change.

## 2026-11-09 court-orders follow-up (browser walkthrough)

A walkthrough of the court-orders feature in the browser found eight problems. Task numbers refer to `.kiro/specs/court-orders/tasks.md`.

### What the walkthrough found, and the eight fixes

- Passages, not bare paragraph numbers (6.1): the portions sentence and the prohibition line named paragraph numbers only. They now name passages: the paragraph plus the first words, from `aiPassages` in `packages/export/src/ai-paragraphs.ts`.
- Plurals (6.1): `plural(n, one, many)` now drives "1 prompt", "3 prompts", "1 run", "1 passage remains" and "2 passages remain".
- Prohibition block (6.3): the Export dialog printed the prohibition line and then the `key_language` again. It now shows the line once; the key language appears once, in the Order_Summary.
- Fixture provider wording (6.2): `toolText` prints "a recorded demonstration response (no model was called)" for the `fixture` provider, in both the `Tools:` clause and the tool_name sentence.
- Stale export notice (6.3): "Exported ….docx." stayed on screen after reopening the dialog or changing the court. It is now cleared on open and on court change.
- Picker width and ellipsis (6.3): the select is `width: 100%` and option text is cut at 60 characters with an ellipsis, keeping the year.
- Demo motion consistency (6.4): the motion now cites the Fifth Circuit and N.D. Tex. Later Offsets shifted +3 and the Statement character count went from 2619 to 2622. The Engine grammar accepted both courts unchanged.
- Header spacing and Sentinel assertions (6.5): the first-page header pointer paragraph has `w:after="240"`, and the `edtex-love-2025` and `dhaw-go-23-1` Sentinel tests now assert that the body, split from the export and joined with newlines, equals `document.text`.

### Where Kiro got something wrong, and what fixed it

- The original sentence counted blank lines when numbering paragraphs, so the number it printed could not be found in the filing. Passages count non-empty paragraphs only, and the sentence says so.
- "(1 prompts)" and "1 span remain" were wrong plurals. Both came from the spec's literal "(s)" templates. `plural` replaced them.
- The `key_language` quote repeated the summary in the prohibition block. It is shown once now.
- The demo statement named a model that was never called. The fixture provider now prints the demonstration wording.

### Earlier entries

- The "Known wording gap" in the 2026-11-09 court-orders entry ("1 AI-origin span remain") is resolved by the plural fix above.
- The Sentinel proof tests recorded there as weaker than they look are now stronger: they assert the body equals `document.text`, not only a clean report.
- The 2026-11-09 entry's demo motion note is superseded by the 6.4 change above.

Requirements: 12.15, 13.7.

## 2026-11-09 sentinel-sweep follow-up (body_edited excerpts)

### What changed

- `body_edited` findings now show two windows over one span of the two lines (`excerptPair` in `crew/sentinel/src/excerpt.ts`): both lines whole when each fits, otherwise both cut from the same start, 30 code units before the first difference, with a leading "…" when the cut is not at index 0 and a trailing "…" from `ellipsize`. The cut never splits a surrogate pair.
- The report row for a `body_edited` finding used to show two identical cells. The edit was past the cut, so the reader could not see what changed. The two cells now differ and show the edit.
- Property 3 (excerpts differ and stay inside their lines) was added in `crew/sentinel/test/excerpt.properties.test.ts`.
- The README Sentinel section links the Crew app repository (https://github.com/gowtham0992/reveal-codes-sentinel) and the "Court-specific certification" section lost two sentences (the Picker title cut and the singular/plural counts).
- `docs/KIRO_USAGE.md` has one new row, `sentinel-sweep group 5`; the static test now expects four sentinel rows.

### Where Kiro got something wrong, and what fixed it

- The old excerpt cut took both lines from index 0 and kept the first 80 characters of each. When two lines shared a longer prefix, both cells were the same string and the report showed no difference. The fix is the shared-start window above, and Property 3 asserts that the two excerpts differ whenever the lines differ.

### Checkpoint

Task 5.5 ran all four commands on the working tree and every one passed on the first run, with no fixes needed:

- `pnpm lint`: Prettier reported all matched files in code style; exit 0.
- `pnpm typecheck` (`tsc -b`): no errors; exit 0.
- `pnpm test`: 241 test files and 2678 tests passed.
- `FC_NUM_RUNS=500 pnpm test:pbt`: 36 test files and 138 tests passed.

The push of task 5.5: pushed as 703ee09, CI run 42759370222 passed.

Requirements: 14.13, 14.14.

## 2026-11-09 kiro-agents-and-usage-check

Configuration work done in chat, without a spec. Before each kind of file the matching kiro.dev page was read (custom agents: creating and configuration reference; skills; hook types and actions), and only fields documented there were used.

### What was built

- `.kiro/agents/release-checker.md`: read-only release gate (tools `read` and `shell`; deny rules for `git commit`, `git push`, `git reset`, `git checkout` and for `fs_write`; see the last two lines of this entry for the temp-directory exclusion that was removed).
- `.kiro/agents/orders-curator.md`: adds or updates one entry in `data/standing-orders.json` from a `.uscourts.gov` source, using the `add-standing-order` skill.
- `.kiro/skills/add-standing-order/SKILL.md`: the procedure for one dataset entry.
- `.kiro/hooks/orders-check-on-save.json`: PostFileSave agent hook on `data/standing-orders.json`.
- `scripts/kiro-usage-check.mjs` and `pnpm kiro:check`: fails on a `.kiro` file with no row in `docs/KIRO_USAGE.md` or a dead path in the Path column. CI runs it after lint. Example tests are in `apps/web/test/static/kiro-usage-check.test.ts`.
- `eslint.config.ts` gained a block for `scripts/**/*.mjs` without type-aware rules, because those files are outside every tsconfig and the type-aware parser rejected them.

### Limits found in the documented fields

- The `web` tool selector covers web search as well as web fetch; the pages read name no way to select fetch alone. The curator's host restriction (`.uscourts.gov` only) is therefore in its prompt, not enforced.
- The `fs_write` deny rule on the release checker covers the file-write capability. The pages read do not say it covers a shell redirect or a build step writing under `apps/web/.next`, so that part of "no writes outside temp" rests on the prompt.
- The hook files documented for the IDE have no timeout for an agent action; none was set.

### Corrections to earlier entries

- The headings "court-orders follow-up" and "sentinel-sweep follow-up" said 2026-11-10; their commits are dated 2026-11-09 and the headings now say so.
- The Checkpoint of the sentinel-sweep follow-up said the push of task 5.5 was recorded separately. It now states the fact: pushed as 703ee09, CI run 42759370222 passed.

### Where Kiro got something wrong, and what fixed it

- The new `.mjs` script failed `pnpm eslint` with a project-service parsing error; the eslint block above fixed it.
- `.kiro/steering/structure.md` already listed `agents/` as "one JSON file per custom agent"; the first edit added a second `agents/` line, and the line was replaced instead.
- The IDE reported "Kiro loaded your permission settings but skipped some invalid rules" for `release-checker`; the log said the `/tmp/**` pattern in the `fs_write` rule references a path outside the workspace, and that workspace permissions must use workspace-relative paths. The rule is now `match: ["**"]`, `effect: deny`, with no exclude list, so the agent has no file-write permission anywhere. Temp-directory writes from the shell are no longer covered by a rule and rest on the prompt.
- The first release check missed a README count: `data/README.md` said "Four entries are no longer in force" while listing five, and the file has five entries whose status is not `current` (2 inactive, 1 superseded, 1 rescinded, 1 not_adopted). The text now says "Five", and check 9 of `release-checker`, the `orders-check-on-save` hook and step 9 of the `add-standing-order` skill compare that count too.

## 2026-11-09 orders-curator first run (entry 40)

The `orders-curator` agent's first real run added entry 40, `dcolo-prose-2024` (D. Colo., Magistrate Judge Prose, standing order of 2024-10-21), from the court's own PDF on `cod.uscourts.gov`, and updated `data/README.md` (40 entries, 6 certifications in every filing).

- The `orders-check-on-save` agent hook reported the count mismatch: `packages/export/test/orders.test.ts` still expected 39 entries. The count is now 40. The skill said to fix the entry, not the test, so step 10 now makes an exception for a test that asserts the total. `.kiro/specs/court-orders/design.md` D14 also said "all 39 entries" and now says 40.
- The caption was corrected by review. The agent set `caption` to `statement_title` with the text "Certification". The order requires a certification but gives it no title or heading; "certification" is only the order's word for the statement. Every caption text becomes a statement title (`STATEMENT_TITLES`), and the Sentinel cuts the body at the first paragraph equal to a title, so a filing with a paragraph reading "Certification" would have been cut there. The caption is now `null` and the last sentence of `notes` reads "The order does not prescribe a heading." The skill's caption rule now says to set a caption only when the instrument prescribes a heading or names the statement as a title, and its `null` rule was already there; the agent applied the older wording too loosely.

## 2026-11-10 first-run-and-flow

Spec `first-run-and-flow` changed `apps/web` only; no package, dependency or lockfile changed.

### First run, before and after

- Before: the Pane was hidden until the user found Alt-F3, the result of Verify was a counts Notice that vanished, the next step was not marked, the Export dialog was narrow with counts on its buttons, and a narrow window showed a broken Shell.
- After: the Pane is open on a first visit and the choice is remembered, a Pane_Header with a Legend explains the codes, failing codes show white on red, one primary button names the next step (Load demo, Verify, Export), the Verify result stays as text in the Issues region, unchecked items collapse into one row until the first run, the assistant shows where it will insert and where it did, the Override dialog shows the item, the Export dialog is wider and its buttons carry no count, and below 800px a plain page replaces the Shell.
- Page marks (group 5): the smoke test for the three ProseMirror and TipTap assumptions passed, so the marks were built.

### Where Kiro got something wrong, and what fixed it

- Task 1.2 weakened a Pane assertion to make a test pass; the Legend (task 1.4) then broke it. Task 1.5 fixed it by scoping the assertion to the Pane body.
- Several tests broke once the Pane opened on a first visit, because Alt-F3 then closed it. They now press Alt-F3 only when the Pane is absent.
- The Picker cut counts UTF-16 units through `ellipsize` in `packages/export`, which is out of scope for this spec. The 80 and 81 character tests use plain characters; the code-point cut is not covered here.
- The task text named `use-assistant.test.tsx`, which does not exist. The assistant cases live in `assistant-panel.test.tsx`.
- The function-length limit (40 lines) was exceeded in `use-pane.ts`, `AppShell` and `override-dialog`; each was split into smaller functions.

## 2026-11-10 deploy-readiness fixes

Seven small fixes in `apps/web` (plus CI, README and `.env.example`), made without a spec because each was a single observation from building and running a clean clone as a host would. One commit per fix. No engine, verifier, export or sentinel change. The numbers below are the order of the commits; the limiter property's `_Requirements: 5.2_` means fix 5, part (b).

### What was observed, and what changed

1. A fresh clone's `pnpm --filter @reveal-codes/web build` failed at "Failed to type check" with 233 errors, 148 of them TS6305 for the `dist` declarations of `packages/engine`, `packages/verifier` and `packages/export`; after `tsc -b` of those three (about 3 seconds) it passed. Cause: `apps/web/tsconfig.json` uses project references, and Next's type check does not build referenced projects. The `build` script now runs `tsc -b` on the three packages first, so install then that one command works. No cleaner cause was found. Of the other 85 errors, the ones seen in the output were TS7006 implicit-any errors that follow from the missing declarations; I did not tabulate all 85. The type check also covers `test/`, which is slow but not wrong. A `clean-build` CI job runs only install and the web build, so an earlier `pnpm typecheck` cannot satisfy it.
2. Export was available with nothing to export. The toolbar Export button is now disabled when the Document has no non-whitespace character, and an open dialog disables both actions and reads "There is nothing to export yet." An empty document's primary stays Load demo motion. A whitespace-only document is not empty by first-run-and-flow (zero characters), so its primary is Export, drawn disabled with `data-primary` kept, as that spec's criterion 10 provides; `nextStep` is unchanged.
3. With the assistant panel open at 1440px the pane legend broke inside a code, `[QUO` on one line and the check mark on the next. Each entry is now one `nowrap` span; lines still break between entries.
4. A second Verify within a minute was held about 50 seconds by the request bucket while the toolbar showed only "Verifying…". The verify and opinion routes export `maxDuration = 60`, and after 5 seconds in flight the toolbar status region reads the waiting text until the run ends. The button keeps "Verifying…". The timer is the injected `setTimer`, so the test does not sleep. No verifier change.
5. The assistant was unbounded. Both live providers now pass `maxOutputTokens: 1200`; the fixture provider is unchanged. `/api/assistant` allows 10 requests per client address per 10 minutes when the provider is not the fixture, answering 429 with `Retry-After` and "The assistant is busy. Try again in a few minutes.", which the panel shows where it shows provider failures. The limit is in memory, per server instance, and a courtesy limit, not a guarantee: another instance keeps its own count, a restart resets it, and the address comes from a header a caller can set.
6. Bedrock needed a role option rather than a stored key. With `BEDROCK_ROLE_ARN` set, the adapter passes `awsCredentialsProvider({ roleArn })` from `@vercel/oidc-aws-credentials-provider` (3.3.20, pinned) as `credentialProvider`; unset, the factory receives `{ region }` only, as before. The package's provider is assignable to the option's type as it stands, so no adapter function was written. One provider is kept per role so its credentials are cached across requests. The ARN stays server-side: `/api/mode` is unchanged and errors stay fixed text.
7. Hosting notes (README run section, no host named) and the three new names in `.env.example`.

### Where Kiro got something wrong, and what fixed it

- `app-shell.test.tsx` asserted that Export is enabled on an empty document, which is the old behavior. The assertion now expects it disabled.
- `Toolbar` grew past the 40-line function limit when the Export button gained `disabled`; the button moved into its own component.
- The first draft of the legend test edit left a stray call (`/failing/.test(...)(e.className)`), which the type check and a test run caught.
- The inventory test counted exactly six properties and the docs test required `.env.example` to equal the variables `deps.ts` reads; both now account for the limiter property and the two AWS key names the SDK reads.
## 2026-11-10 assistant plain prose
- A live model began its reply with a Markdown heading ("# Request to Deny Motion to Dismiss") and the editor inserted it as literal text; the system prompt in `llm.ts` now asks for plain prose only, with no Markdown, headings, lists, emphasis marks or title line, beginning directly with the paragraph. The prompt is a request, not a guarantee; nothing strips Markdown from a reply.
