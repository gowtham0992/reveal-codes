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

## 2026-11-10 legal-record-ui

- Before: a small, flat editor with a mixed set of greys and blues, system fonts, rounded controls, a plain editor surface, and a Reveal Codes pane drawn from the sixteen-colour CGA palette. After: one Token set, three self-hosted type families (Public Sans, Libre Caslon Text, IBM Plex Mono), square controls, a 52px Toolbar, a numbered pleading sheet with margin rules, redesigned Issue rows with chips, a navy Pane with Failing_Block rings, a 26px status bar, retitled Dialogs and a restyled small-screen page. Behavior is unchanged.
- The README does not describe the look, so it is unchanged. The `ui.md` and `product.md` steering files and `docs/KIRO_USAGE.md` were updated.
- Request limits, the size cap, the small-screen links and the Sentinel title fix were split into later specs.
- No requirement was found unbuildable. Two design values conflicted with the scans (see below) and the scans were adjusted, not the values.

### Where Kiro got something wrong, and what fixed it

- 1.2: scans broken by the new values needed stopgaps, and `--button-pad` was kept temporarily until the controls task removed it.
- 1.3: the design says `border-radius: 0` while the scan banned every radius; the scan now allows 0. A 10.5px size needed a stopgap.
- 1.4: `FONT_STACKS` was already correct, so no change was made.
- 2.1: CSS assertions placed in a jsdom test file failed because `import.meta.url` is not a file URL there; they moved to a node-environment file.
- 2.2: eslint `no-unnecessary-condition` flagged a `textContent` check, and jsdom does not compute CSS counters, so the counter is asserted from the stylesheet.
- 2.3: `css-rules` pinned `--control-h` to 30px in every sheet, which contradicted the design's 24px and 32px overrides; the scan now allows them.
- 3.1: the layout test assumed the QUO closer came before the CIT closer, and the quote result status is `match`. A `closers.ts` and `layout.ts` import cycle was removed.
- 3.2: back-to-back failing blocks merge into one segment; the test expectation was corrected.
- 3.3: `paneColourViolations` was deleted as obsolete, and status-bar colours had to be allowed under `src/pane/`.
- 3.4: prettier collapsed three-space JSX text, a `PaneStatus` component was extracted for the 40-line limit, and eslint rejected template-literal class joining.
- 4.1: `OrderSummary` is reused by `PrintHeader`, so curly quotes leaked into the print view. It was fixed with an optional quote prop that is not in the design.
- 4.2: `resize: vertical` was dropped by mistake and then restored.
- 4.3: aliases and bold were replaced to match the requirement.
- 4.4: a stale `--size-wordmark` Token and wrong requirement tags were removed and corrected.
- 5.1: three tests that depended on the working directory switched from `process.cwd()` to `__dirname`.
- 5.2: the Pane literal check was extracted into a shared helper, named colours were added to it, and `fc.hexaString` does not exist in fast-check 4.
- 5.3: eslint `restrict-template-expressions` errors were fixed.

## 2026-11-10 request limits, size cap, small-screen links, sentinel title, redesign fixes, the mark

- Request limits: `/api/verify` allows 6 requests and `/api/opinion/[clusterId]` 30 per client address per minute, and the live assistant gets 200 an hour across all addresses on top of its 10 per 10 minutes. One module (`rate-limit.ts`) holds them. Over a limit the route answers 429 with `Retry-After` and a fixed sentence; the Issues region shows the sentence where it shows a failed run, and nothing is marked unchecked or changed. Demo mode (fixtures) is never limited on verify or opinion, and the fixture assistant is neither limited nor counted. They are courtesy limits: in memory, per server instance, the address comes from a header a caller can set. The README run section says so.
- Size cap: the `/api/verify` body holds citation records and no draft text, so the 200 000 character cap is a cap on the request the route reads, checked before any lookup (413, "This document is too long to check in one request."). Smaller caps already exist and stay: 500 records (about 112 000 characters for typical records) and 262 144 bytes. The new cap only matters between those, for bodies with unusually long records.
- Small-screen links: `NEXT_PUBLIC_VIDEO_URL` and `NEXT_PUBLIC_REPO_URL` are read in `deps.ts` (the only reader of `process.env`) by the server page, so they are fixed when the app is built. Only http and https addresses are used. Both are in `.env.example`.
- Sentinel: `splitExport` now cuts at the last statement title before the Appendix title, which is the last paragraph equal to it. A filing whose own text holds a line equal to a title now sweeps as "No drift." The new tests fail on the old code.
- Fixes from walking the redesign: no outline on the editor content element, `spellcheck="false"` there, Export dialog codes drawn as the Issues chips, one ring on a focused text area, and for a filing with no citation or quotation the Statement says so and omits the empty tables (wording in `wording.ts`; a Sentinel example proves such an export sweeps clean).
- The mark: `docs/images/mark.svg` is now `app/icon.svg` byte for byte, shown at 24px with 10px before the wordmark in the Toolbar and on the small-screen page, as the favicon file itself (`/icon.svg`).

### Where Kiro got something wrong, and what fixed it

- The first limiter composition spent the per-address count before the hourly total refused, so a refused request still used an address's allowance. `Limiter` gained `peek`, and `allOf` spends neither bound unless both have room; a unit example and the property cover it.
- The property with fast-check's default array size almost never reached a bound, so it proved little. It now uses `size: "max"` and bursts of small steps, and a second example fails if the generator stops reaching both the address bound and the hourly bound. A mutation check with the old composition ran so long on shrinking that it timed out, which is a cost of long arrays.
- The task asked for a cap on the document text; the verify request never carries it. The cap is on the request body instead, and the finding is recorded above.
- Reading `NEXT_PUBLIC_*` in the component broke the scan that allows `process.env` only in `deps.ts`; the read moved there and the page passes the links down.
- I read only the last lines of `pnpm lint`, which hid two eslint errors in the export tests. They were found later and fixed in their own commit.
- A helper inserted by a script landed inside a doc comment in `toolbar.tsx` and broke 16 test files until it was moved by hand.

## 2026-11-15 case-match

Why this spec exists. Five lines typed into the live editor on 2026-11-11 (live mode) gave these results:

| Typed in the editor                                                           | Result today                                                           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009)              | CIT ✓, "No issues", Export enabled (556 U.S. 662 is Ashcroft v. Iqbal) |
| Varghese v. China Southern Airlines Co., Ltd., 925 F.3d 1339 (11th Cir. 2019) | CIT ✘                                                                  |
| Petersen v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)                       | CIT ✓                                                                  |
| Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999)          | CIT ✓                                                                  |
| Zicherman v. Korean Air Lines Co., Ltd., 516 F.3d 1237, 1254 (11th Cir. 2008) | CIT ✘                                                                  |

A reporter citation that exists but belongs to another case passed as verified. The spec adds a `wrong_case` status (`CIT ≠`) that blocks export.

### What was built

- Engine: `ExtractedCitation` gains an optional `caseName`. `citations/cited-name.ts` reads it (`citedNameFor`: tail comma, Strict_Read through `partyStartFor`, `isCaseName` and the new In_Re_Name rule, then the Tolerant_Read only when the Strict_Read finds nothing). `citationCarries` in `anchor.ts` requires equal names. `party.ts` and `case-name.ts` are unchanged. The `wrong_case` status and `CIT ≠` Issue code are validated in `verification.ts` and round-trip through the Reveal Codes form.
- Verifier: name matching (`name-expansion.ts` with a new 30-entry table, `name-normalise.ts`, `name-initials.ts`, `name-match.ts`), `lookupWithInfo` with Display_Info, the browser-safe `@reveal-codes/verifier/link` subpath, and a cache that treats a `verified` entry without cluster data as a miss. `/api/verify` accepts `caseName` and answers `{ results, info }`. `lookup_citations` in the MCP server reports `wrong_case` and the cited name.
- Web: `CIT ≠` in the Pane, Legend and page marks, a `wrong case` term in the Citations line, a CourtListener link on the Issues row, and a Resolved citations list below the Issues list.
- Export and Sentinel: a `wrong_case` count and Status cell in the Statement, and `wrong_case` drift findings in the Sentinel.
- Avianca sample (`packages/engine/fixtures/avianca-citations.txt`), two empty-page links, and `packages/verifier/scripts/record-lookups.ts`.
- Six new recorded lookup fixtures and a re-fetched `556 U.S. 662`.

### Live recording (2026-11-15)

Run through `record-lookups.ts`; the results agree with Requirement 12.

| Line                  | Status | Cluster id | Case name                                  |
| --------------------- | ------ | ---------- | ------------------------------------------ |
| `556 U.S. 662`        | 200    | 145875     | Ashcroft v. Iqbal                          |
| `925 F.3d 1339`       | 404    | none       | none                                       |
| `905 F. Supp. 2d 121` | 200    | 2661490    | United States v. ISS Marine Services, Inc. |
| `174 F.3d 366`        | 200    | 3011108    | Greenleaf v. Garlock, Inc.                 |
| `516 F.3d 1237`       | 404    | none       | none                                       |
| `516 U.S. 217`        | 200    | 117990     | Zicherman v. Korean Air Lines Co.          |
| `501 U.S. 32`         | 200    | 112616     | Chambers v. Nasco, Inc.                    |

`556 U.S. 662` was re-fetched so the fixture keeps `case_name_full` and `case_name_short`. The Petersen and Miller lines resolve to other cases, so the rule gives `wrong_case` for both.

### Existing tests changed (Requirement 13, criterion 9)

Checked against `git diff 96cd39d HEAD` (the commit before the spec files). Requirement 1.10 says the existing extraction properties pass unedited, but several existing tests compare whole citations with `toEqual`, so the new `caseName` field alone failed them. The conflict was put to the user, who chose to apply Requirement 13, criterion 9 and edit the tests.

Engine:

- `packages/engine/test/extract.test.ts`: 17 expected Full_Citations gain the `caseName` the Extractor now reads, through a local `named` helper.
- `packages/engine/test/demo.test.ts`: the five Demo_Motion Full_Citations gain their names; Alvarez and Okafor come from the Tolerant_Read.
- `packages/engine/test/extract.properties.test.ts` (Properties 18 and 20), `packages/engine/test/arb-text-citations.test.ts` and `packages/engine/test/support/gap-signal-insert.ts` (Property 51): citations are compared with `caseName` removed (`withoutCaseName`, `withoutCaseNames` in `test/support/expected.ts`). A quote mark glued to or inserted before a name changes the name read, which is correct; case-match Property 3 checks the name itself.
- `packages/engine/test/anchor.properties.test.ts` (Property 26): the model's `citationSurvives` also requires equal `caseName`, matching Requirement 1.11. Counterexample before the edit: an insert inside `Kpappxogip’s, Corp. v. Qitjqorjql J's` before `85452 So. 81276` changed the name, so the citation correctly got a fresh key.
- `packages/engine/test/syntax.test.ts`: the code-name list gains `CIT ≠`.
- `packages/engine/test/arb-state.test.ts`: `arbDocument` now reaches `wrong_case`, so the expected status set has five members.
- `packages/engine/test/issues.properties.test.ts`: the status-to-code table gains `wrong_case: "CIT ≠"`.
- `packages/engine/test/support/codes-model.ts`: the independent Reveal Codes model renders and parses `wrong_case`.
- `packages/engine/test/verification.properties.test.ts`: the "not verified" filter also excludes `wrong_case`, which is treated like `verified` for `not_verifiable`.
- `packages/engine/test/inventory.test.ts`: skips `case-match.properties.test.ts`; the aggregate inventory test covers it.

Verifier and MCP:

- `packages/verifier/test/inventory.test.ts`: skips `case-match.properties.test.ts`.
- `packages/courtlistener-mcp/test/tools.test.ts`: additive only (the new `lookup_citations case match` describe); no existing test was edited.

Export:

- `packages/export/test/render-statement.test.ts` and `packages/export/test/null-order.test.ts`: the Statement paragraph has a new `resolved to a different case` term.
- `packages/export/test/statement.properties.test.ts`: the Property 2 check of the cluster id cell needed `wrong_case` fields (`clusterId`, `foundName`, `foundYear`), and now asserts them.
- `packages/export/test/static/boundaries.test.ts`: skips `case-match.properties.test.ts`.

Web and Sentinel:

- `apps/web/test/export-flow.test.tsx`: the Statement paragraph in the Export flow gains the new term.
- `apps/web/test/pane.test.tsx`, `failing.test.ts`, `layout.test.ts`: the Legend has eight entries, three failing entries wear the ring, `CIT ≠` is a failing opener, and its plain words are `Citation is a different case`.
- `apps/web/test/marks.test.ts`: additive (the wrong case mark title).
- `apps/web/test/api.test.ts`, `verify-route.test.ts`, `verify-flow.test.ts`, `verify-flow.properties.test.ts`: the verify response is now `{ results, info }`, and the property that no text leaves the browser outside the records also allows `caseName`.
- `apps/web/test/verify-summary.test.ts`: the tally gains `wrong_case`.
- `apps/web/test/demo-path.test.tsx`: Issues rows are counted outside the new Resolved `section`.
- `apps/web/test/static/boundaries.test.ts`: `client/*` may import the `/link` subpath.
- `apps/web/test/static/package-json.test.ts`: the verifier exports gain `./link`.
- `apps/web/test/static/docs.test.ts`: checks that the MCP tool text mentions the case name.
- `apps/web/test/static/inventory.test.ts`: skips `case-match.properties.test.ts`.
- `crew/sentinel/test/static/boundaries.test.ts`: skips `case-match.properties.test.ts`.

### Where Kiro got something wrong, and what fixed it

- The brief named a recording script, `record-lookups.ts`, that did not exist. It was added (task 10.1).
- `abbreviations.ts` held no expansions, so the name rule had nothing to expand. A new 30-entry table in `name-expansion.ts` replaced the assumption.
- The first Avianca sample had two unsuitable citations: Ehrlich was not found and `In re Air Crash` was ambiguous. The sample was replaced.
- The Strict_Read truncated some names (`Aaaa. Aaaa v. Dep't`, `Nnnn de Bbbb v. Nnnn`), so Property 3 failed. Option 1 (prefer the longer tolerant read) broke two anchor tests by absorbing a prior sentence into the name. Rule A fixed both: the tolerant result replaces the strict one only when it extends it and the added words contain no token ending in a period.
- Requirement 1.10 conflicts with the existing whole-citation equality tests. They were edited to drop `caseName` (list above).
- The export Property 2 check needed `wrong_case` fields before it could pass.
- The per-package inventory and boundary tests counted `case-match.properties.test.ts`, which numbers its properties within its own spec. They skip it now, and one aggregate inventory test (task 13.6) requires all eighteen.
- A local variable named `window` in `cited-name.ts` tripped the engine purity scan ("DOM global"); it was renamed.
- A `git stash` and `stash pop` pair, meant to compare against the clean tree while another task's edits were in the working tree, timed out. Afterwards the stash list was empty and every working-tree change was present. No stash was used again.
- A one-hour time zone offset in a failing test came from running vitest outside the root config. It was not a bug, and no code changed.
- The six new fixtures were first written with `"recorded": "2026-11-07"` in `manifest.json` and `fixtures/README.md`, but they were recorded on 2026-11-15. The six dates were corrected, and the `556 U.S. 662` re-fetch note now says 2026-11-15. The original 2026-11-07 recording date of that fixture is kept.

### Left alone

- The Miller pincite range `371-72` still truncates the citation text. This was agreed and nothing was changed.

## 2026-11-15: case-match follow-up, four browser-walkthrough findings

The author walked the app in a browser and found four things. Requirement 9.8 was also reworded (it now says what a pre-spec filing must give: no finding when the recorded `verified` still matches, one `citation_changed` finding when the written name now resolves to a different case) and two Sentinel examples cover it (`crew/sentinel/test/pre-spec-filing.test.ts`, tests only). The earlier instruction to leave pincite ranges alone was withdrawn; the Miller entry under "Left alone" above no longer holds.

### 1. The empty-page links did not take a pointer click (Requirements 17)

- Cause: `.samples` is `position: absolute` with `z-index: auto`, and TipTap injects `.ProseMirror { position: relative }`, also `z-index: auto`. Two positioned elements with `z-index: auto` paint in tree order, and the editor came later in the DOM, so it painted over the links and took the click.
- Fix: the list renders after the editor content; `.samples` has `pointer-events: none` and `.samples a` has `pointer-events: auto`; each link has `onMouseDown` calling `preventDefault()`, so the editor keeps focus. No `z-index` was added, because the Modal overlay has none and a `z-index` on the list would lift the links above an open dialog.
- Tests: a static CSS test (`apps/web/test/static/editor-surface-css.test.ts`) and DOM order and mousedown-focus tests (`apps/web/test/editor-surface-links.test.tsx`). Against the pre-fix code, 2 of the 7 structure tests failed (list after editor, mousedown default-prevented) and so did the two `pointer-events` CSS cases.
- What jsdom cannot prove: it does no layout, so paint order, hit testing and a real browser's focus handling are not checked. The tests prove the DOM order, the declared rules and the event handling. The repository has no browser driver (none in `apps/web/package.json`) and none was added. The real-browser check is the author's: run `pnpm dev`; `document.elementFromPoint` at the centre of each link returns an `A` element; click each link; click blank page beside the links and see the caret; press the mouse on a link with the caret in the page and see the caret stay.

### 2. Page ranges and lists in a pincite (Requirement 18)

- The stored value does not change: `pincite` is the first page, so the Citation_Line, the payload, `types.ts`, `format.ts` and `codes/*` are unchanged. Only the citation's `end` moves, through the new `packages/engine/src/citations/pincite.ts`. `normalised` is now set for a ranged citation (D17). Property 19 covers it (`case-match.properties.test.ts`).
- Accepted with no migration (D20): Reveal Codes written the old way, with `[/CIT]` inside a range, fail `parse` with `malformed_codes` and rule `extractor_mismatch`. The Sentinel reports old exported appendices with such a citation as `appendix_unparseable`.
- Task 16.4 found, and this is data loss: an autosaved draft that fails to parse (`bad_codes`) opens as an empty editor with no notice, and the first keystroke's autosave (300 ms) overwrites the old value in localStorage, so that draft is silently lost. This is existing behaviour for any unreadable autosave; this change makes it reachable for drafts saved before it. Until the load path shows a notice and keeps the old value, it stays. `apps/web/test/autosave-old-pincite.test.ts` records the load behaviour (`deserialise` gives `bad_codes`; the load leaves the empty Document with no notice and leaves the stored value; `savedDraftExists` is false; the print view says unreadable). The README Limits section says it too.

### 3. The mismatch said where the author decides (Requirement 19)

- A `wrong_case` row now shows `Cited as <name>` and `This citation is <found name> (<year>)` in the Issues row, the Export dialog row (with the `View on CourtListener` link) and the Override dialog (before the reason box). `caseName` is read from the current Document, and no line ends in a full stop. Shared code: `apps/web/src/client/mismatch.ts` and `components/mismatch-lines.tsx`. Tests: `apps/web/test/mismatch.test.tsx`.

### 4. Role words (Requirement 20)

- `plaintiff(s)`, `defendant(s)`, `appellant(s)`, `appellee(s)`, `petitioner(s)`, `respondent(s)`, `individually`, `deceased` and `no` joined `DROPPED_WORDS`. Greenleaf example: `Kowalski, Appellant v. Quimby, Defendants` no longer matches on a shared role word (`packages/verifier/test/role-words.test.ts`). The engine arbitrary `DROPPED` mirrors the words, and `list-drift.test.ts` fails if the two lists differ.
- No outcome changed: Henderson, Petersen and Miller stay `wrong_case`; Ashcroft v. Iqbal, Haines v. Kerner, Zicherman (516 U.S. 217) and Chambers stay `verified`.

### Existing tests edited in this follow-up (checked with `git diff 61c2836 HEAD --name-status`, plus the working tree)

- `packages/engine/test/codes.properties.test.ts` (Property 36): the Reveal Codes round trip also draws `arbExpressionDocument`, so ranged citations are round-tripped.
- `packages/engine/test/case-match.properties.test.ts` (Property 2): the round trip with `wrong_case` also draws `arbExpressionDocument`. Property 19 was added in the same file.
- `packages/engine/test/anchor.properties.test.ts` (Property 25): the incremental-equals-full texts gain `arbTextWithCitationsWith("expression")`.
- `packages/engine/test/avianca.test.ts`: the Miller, Petersen, Zicherman and Chambers expected lines now include the pincite expression and parenthetical, and a case checks each citation's whole text. The sample file is unchanged.
- `packages/verifier/test/worked-outcomes.test.ts`: asserts the ranged Miller text (`174 F.3d 366, 371-72 (2d Cir. 1999)`) and the Zicherman 516 F.3d text. Outcomes unchanged.
- `apps/web/test/case-match.test.tsx`: the `wrong_case` Issues row has one more paragraph, `Cited as …`, before the found line.
- `apps/web/test/override-dialog.test.tsx`: the harness passes the new `mismatch={null}` prop.
- `apps/web/test/static/editor-surface-css.test.ts`: gained the empty-page links describe (additive).
- `apps/web/test/static/case-match-inventory.test.ts` (task 20.2): the count is nineteen, and the engine file owns Property 19.
- Not a test: `packages/engine/bench/results.json` changed because the benchmark was re-run.

### Left alone

- The README limit and the old-draft overwrite above are not fixed here. The browser check in finding 1 and the push are the author's.

## 2026-11-15: case-match second follow-up, the CI failure of aef6d70 and the unreadable draft

### The CI failure

- Commit `aef6d70` failed the job `check`, step `pnpm test`. `packages/engine/test/arb-codes.test.ts`, the reachability test for `arbSemanticTamper`, saw 21 of 22 kinds in 1,500 runs.
- Cause: the test drew 1,500 random values with a literal `numRuns: 1500` and no seed, then compared the kinds seen with `TAMPER_KINDS`. Any rare kind can be missing from a draw of that size. It was a flaky test, not a bug in the arbitrary.

### The measurement (task 22.1)

- Method: a throwaway script drew 100,000 values of `arbTamperDocument.chain((d) => arbSemanticTamper(d))` and counted each kind. The script was deleted and not committed.
- Kind count: `TAMPER_KINDS` has 23 kinds in the tree. The CI message said 22, and the author reported 22. The count in the tree is 23; the discrepancy is recorded here and was not explained further.
- The rarest kind is `short_count`: 314 of 100,000 draws (p = 0.00314). The next is `override_nonissue` at p = 0.00732.
- Miss probability for `short_count` over 1,500 draws: (1 - 0.00314)^1500, about 0.0089 (0.9%). Any kind could be the one missed, so the failure rate of the old test was about 0.9% per run.
- Syntax faults: 8 kinds. The rarest is `unbalanced_close` at p = 0.2077. The old test used `max(runs().numRuns, 400)` draws, so the miss probability is about 3.5e-41. It was no flake risk, and was rewritten in the same shape as the tamper test.

### The fix (tasks 22.2 to 22.4)

- Per-kind arbitraries `arbTamperOfKind` and `arbSyntaxFaultOf` replace the "draw until every kind appears" check. Each kind is tested on its own.
- `packages/engine/test/support/tamper-witnesses.ts` holds `TAMPER_WITNESSES: Record<TamperKind, Document>`. A new kind with no witness fails `pnpm typecheck`.
- The random rejection properties are unchanged. The seeded reachability check in `codes.properties.test.ts` was replaced by a pointer to the per-kind tests.
- The multi-fault test is restricted to `unknown_code`, `unclosed_open`, `bad_field` and `dangling_escape`. `assemble()` drops faults placed before `[DOC]` when `missing_doc` is drawn, and drops an `unbalanced_close` that follows an `unterminated_code`. The builder was not changed.

### The audit of unseeded draws (task 22.5)

- Seeded and left alone: `arb-edit.test.ts` (seeds 42, 7, 3 and 11, 13), `arbitraries.test.ts` (seed 1), `arb-citation.test.ts`, `arb-segment-inputs.test.ts`, `arb-text-citations.test.ts`, `arb-api.test.ts`, `incremental.test.ts`, `rate-limit.properties.test.ts`.
- Unseeded and safe, with the probability that a random run misses: tests whose draw covers each member with a probability high enough that the miss probability is negligible, for example the 8 syntax faults above (3.5e-41). The other figures measured in task 22.5:
  - Property 4: 76.3% of draws.
  - Property 5: at least 0.5.
  - Property 6: about 1/6.
  - Property 7: kept versus dropped, 20.2%.
  - Property 8: always.
  - Property 2: a one-third mix.
  - Property 19: 61.8%.
  - `arb-state` wrong_case: 5.72% of draws over 400 runs, so a run misses it with probability about 5.6e-11.
- Fixed, two: the engine `case-match.properties.test.ts` Property 7 `wrongToWrong` guard (a wrong_case to wrong_case rewrite with a different name drew 5.15% of runs, so at 200 runs about 2.5e-5 of runs missed it) and the export `case-match.properties.test.ts` Property 14 `wrongCaseSeen` guard (5.7% of draws, about 7.5e-6 at 200 runs). Both now carry fixed examples run first. fast-check counts examples inside `numRuns`, so `numRuns` is raised by their number to keep the random runs.

### The unreadable draft (Requirement 23)

- The finding recorded in the entry above (an unreadable autosave is overwritten by the first keystroke) is fixed. That entry stays as the record of the old behaviour. The README Limits bullet about it is removed.
- `apps/web/src/draft-gate.ts` holds the Draft_Gate. It is set at load when the stored draft fails `deserialise` with `not_json`, `bad_shape` or `bad_codes`; all three block. While it is set, autosave starts no timer and writes nothing, including flush, hidden and unmount.
- The Issues region shows the notice: "A saved draft could not be read, so it was not loaded. It is still stored in this browser. Nothing you type is saved until you choose."
- Save a copy (`apps/web/src/saved-draft.ts`) downloads the stored string as `reveal-codes-saved-draft.txt`, `text/plain;charset=utf-8`, the exact UTF-8 bytes of the stored string. Limit: a lone surrogate in the stored string cannot be encoded as UTF-8 and is written as U+FFFD, so that copy differs from the stored string in those characters. Save a copy does not lift the gate, so "until you choose" means until Start a new document.
- Start a new document opens a confirm. It clears the stored draft and releases the gate only if the clear succeeded. It also discards what is on the page, and the confirm says so.
- The Toolbar's New while blocked opens the same dialog. Sample loads do not lift the gate. The print view is guarded and shows its own notice while blocked.
- Out of scope: more than one tab.
- Property 20 (`apps/web/test/case-match.properties.test.ts`, input `arbUnreadableStored`): for each of the three failure kinds, load, edits, a wait, flush, hidden and unmount leave the stored value equal and call `setItem` zero times. A static test (`apps/web/test/static/draft-storage-writes.test.ts`) checks that the autosave module is the only writer of the draft key. Example tests are in `apps/web/test/unreadable-draft.test.tsx`.

### Existing tests edited (checked with `git diff 3763778 HEAD --name-status`, plus the working tree)

- `packages/engine/test/arb-codes.test.ts`: rewritten to the per-kind tests above (tamper and syntax reachability, the witness table, the restricted multi-fault test).
- `packages/engine/test/codes.properties.test.ts`: the seeded tamper reachability check (seed 41, 1,500 runs) was removed, with a comment that points to `arb-codes.test.ts`.
- `packages/engine/test/case-match.properties.test.ts` (Property 7) and `packages/export/test/case-match.properties.test.ts` (Property 14): fixed examples, as in the audit.
- `apps/web/test/export-dialog-orders.test.tsx`: `useExport` takes a `gate` parameter now, and the harness passes `createDraftGate()`.
- `apps/web/test/autosave.test.ts`: gains the Draft_Gate and clear-result describe (additive).
- `apps/web/test/case-match.properties.test.ts`: gains Property 20 (additive).
- `apps/web/test/arbitraries.ts`: gains `arbUnreadableStored` (additive).
- `apps/web/test/static/case-match-inventory.test.ts` (task 24.1): the count is twenty and the web file owns Property 20.

## 2026-11-15: pasted-text-declaration, the statement may only say what the record shows

### Why

- A filing made only of pasted text exported a certification sentence saying no generative AI was used. The tool had no basis for it. `PST` means the origin is unknown (product.md, principle 1), and `usedAi(document)` counted only `AI` and `AI>HUM` spans, so one `PST` span read as "no AI". That is the path of a person who drafted in a chatbot and pasted the result, the user the product exists for.
- The sentence is removed as a tool assertion. The statement now has Record_Sentences (counts and shares from the spans) and Author_Sentences ("The author states that ...", only for what the record cannot show). When the document holds pasted text, or a selected court order requires a statement for a typed-only filing, the Export dialog requires the author's two-way declaration first. The declaration counts as AI use for every court rule.

### What Kiro got wrong in the requirements pass

- An earlier draft had the tool assert, as an author sentence, that no program was used. That claim is the same kind of overreach as the one being removed, written in the author's voice without the author saying it.
- It also assumed the tool could print a no-AI statement for typed text. It cannot: typed text may have been copied from a chatbot by hand. Only the author can say so, and only when a court order asks.
- The design had to reconcile Requirement 7 criteria 7, 8 and 16, which were written separately and disagreed on when a declaration is required and which subject it answers. The Declaration_Subject rule (`pasted_text`, then `this_filing`, then `none`) and the Applicable_Declaration rule (a declaration for one subject never answers the other) came out of that reconciliation.

### Compatibility limit

- A file exported with the declaration carries `d=` in its `[DOC]` line. An older Sentinel does not know that field and reads such a file as one `unreadable` Finding, not as a drift report. Sweep exported files with a Sentinel built from this change or later.

### Test-design notes

- `packages/export/test/statement-declaration.properties.test.ts` failed `pnpm typecheck` with TS2367 (a comparison between types with no overlap). It was fixed in the test file, and the property's intent is unchanged.
- Duplicate Property numbering shows up in the static inventory tests: `crew/sentinel/test/static/boundaries.test.ts` and `apps/web/test/static/inventory.test.ts` currently fail. They are handled at the final checkpoint and are not changed here.
- The static test `packages/export/test/static/ai-use-definition.test.ts` lists the removed sentences as forbidden strings. This entry paraphrases them for that reason.

### Final checks (pasted-text-declaration, task 14)

- `pnpm install`: passed (lockfile unchanged).
- `pnpm lint`: passed (eslint and prettier check).
- `pnpm typecheck`: passed.
- `pnpm test`: passed, 318 files, 3517 tests. The two static inventory tests noted above (`crew/sentinel/test/static/boundaries.test.ts`, `apps/web/test/static/inventory.test.ts`) pass.
- `pnpm test:pbt`: passed, 48 files, 169 tests.
- `pnpm --filter @reveal-codes/web build`: passed in the working tree.
- Clean checkout: the working tree was copied with rsync (excluding node_modules, .next, .git, .pnpm-store) to a temp directory outside the repo. `pnpm install --frozen-lockfile` and `pnpm --filter @reveal-codes/web build` both passed there. The temp directory was deleted.
- `pnpm kiro:check`: passed (48 rows in docs/KIRO_USAGE.md).
- No test was changed or weakened in this task. Nothing was committed or pushed.

## 2026-11-15: pasted-text-declaration follow-up, three review fixes

### Lint failed at HEAD

- `pnpm lint` failed at HEAD because BUILD_LOG.md was edited after the last checkpoint and was not formatted. The "Final checks" list had been appended after the checks ran, which is the mistake: nothing may be edited after the checks start. Edits now finish first, then prettier runs on the file, then the checks run once, and no file changes after that.

### A property that asserted the wrong thing

- 15.3: P3 in crew/sentinel/test/recorded-declaration.properties.test.ts failed on seed -723012165 because it asserted display text does not contain the generated Tool_Name "a[", which occurs by chance in "alpha[PST]". Kiro wrote a substring-absence check where the requirement states a structural relationship. Fixed by asserting renderRecord(document, declaration, "display").text equals renderRecord(document, null, "display").text, and pinned the case as a named regression example; no other test in the spec had the shape.

### The tool_name element repeated paragraph 2

- For a typed-only filing under Judge Love's order, the tool_name element repeated what paragraph 2 already says. It now prints only when there is a tool to name.
- Updated to match: requirements 7.7 and 7.8, design interpretation 3, the wording table, CERTIFICATION.md, and the tests.

## 2026-11-15: citation-check Power

### What was built

- `powers/citation-check/`: a Kiro Power (plugin.json, mcp.json, README, two skills) that packages the CourtListener MCP server for any workspace. `pnpm power:build` (scripts/build-power.mjs, esbuild 0.28.2 pinned) bundles `packages/courtlistener-mcp/src/main.ts` into one ESM file, copies the verifier fixtures and the dataset into the Power, and gives identical bytes on every run.
- Fixtures mode is chosen by the bundle, not by `env.ts`. A new pure `powerEnv` in `src/power-env.ts` drops a token that is empty or starts with `${` and then sets `REVEAL_CODES_FIXTURES_ONLY=1`. `main.ts` calls it only when esbuild's `define` sets `REVEAL_CODES_POWER`, so `pnpm mcp` runs the same path as before.
- `verifier_status` now returns `mode` and a plain-words `message` in every run, not only in the Power. The two exact-match assertions in `packages/courtlistener-mcp/test/tools.test.ts` were updated for the two new fields.
- `pnpm kiro:check` now also requires a row for every `powers/*/plugin.json`.

### Where the format pages differ from the brief

- The MCP page requires `"type": "stdio"` and a `$schema` in `mcp.json`, and the plugin schema requires `$schema` in `plugin.json`. Both were added. Both files were validated once against the live schemas with ajv. The tests check the same rules by hand, because tests do not use the network.
- The portable spec expands only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`. An unexpanded `${COURTLISTENER_TOKEN}` is therefore possible, and the server treats it as no token.

### What Kiro got wrong

- The first commit of the MCP change failed `eslint` (an unused destructured variable and two `any` assertions from `expect.stringContaining`). It was fixed and the commit amended before anything else was built on it.
- Fixtures mode reports a real case that is not recorded as `not_found`. The status message, both skills and the README now say that "not found" there means only "not in the recorded set".

## 2026-11-16 open-draft

### What was built

The open-draft spec adds the ability to open an existing `.docx` file as a new draft. The work landed in five groups after the shared-reader move.

**Group 1 — shared reader move.** `crew/sentinel/src/docx-read.ts`, `xml-text.ts`, `split.ts` and `recorded.ts` moved to `packages/export/src/` as `docx-read.ts`, `xml-text.ts`, `export-split.ts` and `appendix-parse.ts`. A new `read-types.ts` holds `DocxText`, `ExportParts` and `DocxReadError`. `fflate` moved from devDependencies to dependencies in `packages/export/package.json`. Sentinel import paths updated; test bodies unchanged.

**Group 2 — shared reader in `packages/export`.** `docx-notes.ts` (endnotes helper), `docx-signature.ts` (certification-statement check), `docx-text.ts` (`docxSafe`, `holdsDocxUnsafe`), `word-draft.ts` (`readWordDraft`, `WordDraft`), and restore helpers (`open-outcome.ts`, `open-text.ts`, `open-note.ts`). Properties 1, 2, 3, 8, 9 and 12 in `packages/export/test/`. An `arbParagraphs` and `arbBodyEdit` shared arbitrary.

**Group 3 — `docxSafe` and export refusal.** `docxSafe` applied at every entry point that writes text to a `.docx` (paragraph bodies, header, certification statement, running header). `holdsDocxUnsafe` and `arbDocxHostileText`. Property 4 (`docxSafe` strips every hostile character). The editor input path strips hostile characters on paste and on open. Export is refused (`DocxSafeError`) when any character survives after `docxSafe`. The Export dialog shows the refusal notice.

**Group 4 — `limits.ts`, Store `openNote`, `nextRunId`, Next_Step gap.** `limits.ts` gained the open-file size constants. The Store gained `openNote` for the Open_Note notice. The `nextRunId` function was approved with an explicit comment. `needsCheckDate` in `check-date.ts` gates the Next_Step: when the opened draft's check date is stale or absent, Next_Step is Verify so the author reruns to record the date. Properties 5, 6 and 7.

**Group 5 — Open flow in `apps/web`.** Toolbar Open button (file-input click, no `data-primary`). Drag-and-drop onto the editor surface. Confirm dialog when the editor has content. `Open_Note` in the Issues region (three cases: success with stale check date, missing check date, and partial parse). Empty-page links for the demo and open paths. `open-messages.ts` for the notice strings. Properties 10, 11, 13 and 14.

**Counts.** 59 tasks, Properties 1–14, 318 → ~350 test files. `pnpm test`, `pnpm test:pbt`, `pnpm lint`, `pnpm typecheck` all green at the final checkpoint.

### Where Kiro got something wrong, and what fixed it

Task numbers refer to `.kiro/specs/open-draft/tasks.md`.

- **1.1 — DocxReadError / SentinelError union mismatch.** After the move, `appendix-parse.ts` used `SentinelError` in a union that now expected `DocxReadError`. Moving the code narrowed the error types. Fixed by widening `RecordedError` in `appendix-parse.ts` to include both.
- **1.2 — Sentinel test body edited when only import lines should change.** The task spec said to change only import lines in Sentinel tests. Kiro edited a test body as well. The original body was restored from the pre-move commit, and the error type was fixed at the source (the moved module) rather than in the test.
- **2.1 — `addEndnotes` replaces rather than adds.** `docx` 9.15.3 already writes `word/endnotes.xml` with separator entries. The `addEndnotes` helper was treating that file as absent and replacing it, not augmenting it. Fixed so it merges its entries with the existing separators.
- **2.4 — `WordDraft` uses `RecordedRecord`, not `DocumentRecord`.** The design named the type `DocumentRecord`; the actual type in the codebase is `RecordedRecord`. The implementation used the design name and failed typecheck. Fixed by using the correct name.
- **2.5 — `structuralEqual` not exported from `@reveal-codes/engine` index.** The engine's public index did not re-export `structuralEqual`. Fixed by using a relative import inside the package rather than the package entry point.
- **2.7 — `boundaries.test.ts` expected one property comment per file.** The static boundaries test assumed each file held at most one `// Property N` comment. The open-draft spec added files with multiple properties. Fixed by changing the check to accept an array of property numbers per file.
- **2.9 — `arbRunLog` generates duplicate run ids the Store never holds.** The Store enforces unique run ids; the arbitrary did not. Rather than restricting the arbitrary (which would have changed shared code), the limitation was annotated in the test with a comment explaining the gap. Recorded as a known limit.
- **4.1 — `\r` followed by U+000B or U+000C gives two newlines.** The one-pass state machine in the XML-text normaliser treated a bare `\r` as a newline and then treated the following U+000B or U+000C as a second newline. Fixed by consuming the following character when it is a known line-ending that follows `\r`.
- **4.3 — Property 4 first failed with `declaration_required`.** The property ran against an empty pasted document, which requires a declaration before export. Fixed by passing `DEMO_DECLARATION` to the export call in that property's setup.
- **4.4 — Exhaustive loop with per-iteration `expect` caused timeout.** The property iterated over all hostile characters and called `expect` inside each iteration. Under fast-check's shrinking loop this hit the vitest timeout. Fixed by collecting all failures into an array and asserting the array is empty once after the loop.
- **5175115 — Stray `.d.ts` files committed in `crew/sentinel/src`.** A `tsc` run during task 2.10 emitted declaration files into `crew/sentinel/src/`. They were accidentally staged and committed. Removed with `git rm`.
- **6.2 — `reduce` hit the 40-line function limit.** A `reduce` callback inside `open-text.ts` grew to 41 lines. Fixed by extracting an `unchanged()` helper that brought the callback within the limit.
- **8.1 — Notes_Block sentence detection uses a text pattern.** `readWordDraft` detects the Notes_Block by matching the literal pattern `\n\nFootnotes\n1. ` in the body text. A Word document whose body happened to contain that exact string would falsely receive the footnote-sentence treatment. Recorded as a known limit; not fixed.
- **8.2 — `openFile` detects Notes_Block by pattern rather than a flag from `readWordDraft`.** The open flow in `apps/web` re-detects the Notes_Block using the same text pattern rather than a flag set by `readWordDraft`. Noted for a follow-up refactor; not fixed here.
- **8.4 — Stray `.d.ts` files committed in `packages/export/test/support`.** Same cause as the sentinel case above: a `tsc` run during task 8.4 emitted declaration files into `packages/export/test/support/`. Removed with `git rm`.

### Next_Step gap

When `needsCheckDate` is true (the opened draft's check date is absent or stale), `Next_Step` is set to Verify rather than Export. This prompts the author to rerun verification so the certification carries the current check date. The gap is closed by `check-date.ts`; `Open_Note` in the Issues region shows the reason.

### Issues note (three cases)

The Open_Note in the Issues region covers three cases: (1) the draft opened successfully but its check date is stale or absent, so Next_Step is Verify; (2) the draft opened but has no check date at all; (3) the parse was partial — some content was recovered but some structure was lost. Each case has distinct message text in `open-messages.ts`.

### Final checkpoint (task 10), open-draft, HEAD ed99136

Every command run from the repository root on 2026-11-16. No failures, so no code changed.

- `pnpm lint`: exit 0 (eslint with `--max-warnings 0`, then prettier: all matched files use Prettier code style).
- `pnpm typecheck`: exit 0 (`tsc -b`, no output).
- `pnpm test`: exit 0. 343 test files passed, 3742 tests passed, 0 failed.
- `pnpm test:pbt` (`FC_NUM_RUNS=500`): exit 0. 53 property test files passed, 184 tests passed, 0 failed. No shrunk counterexample, so no seed to record.
- Clean-checkout web build: `git worktree add --detach` of HEAD in a temp directory outside the repository, with the uncommitted diff applied (only `.kiro/specs/open-draft/tasks.md` and `tasks.meta.json`). `pnpm install --frozen-lockfile` exit 0, then `pnpm --filter @reveal-codes/web build` exit 0 (TypeScript finished, 5 static pages generated, routes `/`, `/print`, `/api/assistant`, `/api/mode`, `/api/opinion/[clusterId]`, `/api/verify`). Worktree and temp directory removed; `git worktree list` shows only the main checkout.
- `pnpm kiro:check`: exit 0. `docs/KIRO_USAGE.md`: 57 rows (Hook 7, Spec 13, Steering 25, MCP 1, Spec metadata 3, Agent 2, Skill 3, Script 2, Power 1).
- Secret and forbidden check: `git status` shows only the two spec files above as modified, no untracked files, no stray `.d.ts`. The only tracked env file is `.env.example`. A scan for key-shaped strings found only the `sk-ant-SENTINEL-KEY` test values in `apps/web/test/assistant-route.test.ts` and `mode-route.test.ts`. No task, script or workflow runs `git push`. Nothing was pushed.
- The 59-task count and "318 to about 350 test files" in the entry above are estimates. The measured count at this checkpoint is 343 test files and 3742 tests.

### Known limits and follow-ups (open-draft)

- **Notes_Block detection.** `readWordDraft` and `openFile` find the notes block by the text pattern `\n\nFootnotes\n1. `, not by a flag from the reader. A Word body that holds that exact text would get the footnote sentence in the Open_Note by mistake. Not fixed; a flag from `readWordDraft` is the follow-up.
- **Oversize-part limit.** `openFile` passes `maxPartBytes` 33 554 432 (32 MiB) to `readWordDraft`. A `.docx` whose `word/document.xml`, `footnotes.xml` or `endnotes.xml` declares more than that is refused as damaged before anything is inflated. The check reads the zip's declared sizes (settled by the oversize-part fixture whose declared and real sizes differ).
- **Real Word-saved fixture.** Every `.docx` fixture is built by the `docx` library and the endnotes helper. No file saved by Microsoft Word is committed, and no test reads one. A test over a real Word-saved fixture is a follow-up.

## 2026-11-16 court-rules-page

### What was built

The court-rules-page spec adds a public page at `/courts` that lists the instruments of `data/standing-orders.json`, and links the editor to it.

- **Loader.** `loadOrders` and `ORDERS` in `packages/export` now also return the dataset's `compiled` date and its `vocabulary` (`OrderDataset`, `OrderVocabulary`). No existing export changed. One vocabulary sentence in the dataset (`negative_certification_when_unused`) was reworded; no entry changed, and the Power copy was regenerated with `pnpm power:build`.
- **Pure functions.** `filterOrders`, `normaliseText` and `CLEARED_FILTER` (`order-filter.ts`), and `courtGroups`, `compareAbbreviations` and `orderStats` (`order-groups.ts`) in `packages/export`. Court groups sort with `localeCompare(b, "en", { numeric: true })`, so "5th Cir." precedes "10th Cir. BAP".
- **Page.** `apps/web/app/courts/page.tsx` is a server component. `src/courts/` holds the view model, intro text, hash helper, `InstrumentView` and the client `CourtsBrowser` (filter controls appear only after mount, so the server HTML lists every instrument with scripts off). One column from 320px, no width at-rule.
- **Editor.** `use-order-parameter.ts` reads `?order=<id>` after mount, stores a selectable instrument in the shared order store, shows the toolbar notice at 800px and wider, shows a Selection_Line on the small-screen page, and removes the parameter with `replaceState`. A "Court rules" link was added to the Toolbar, "See all court rules" to the Export dialog and the small-screen page.
- **Repairs.** Override-table headers in the print view no longer break inside a word and the Code and Timestamp columns have a minimum width. Starting an Open clears the previous Toolbar notice and Open_Note. `.gitignore` ignores `*.d.ts` except `apps/web/src/css-modules.d.ts`.
- **Tests.** Property 1 (the filter) in `packages/export/test/order-filter.properties.test.ts`, example tests for the page, filter UI, Order_Parameter, links and repairs, and extended static scans.

### What Kiro got wrong, and what fixed it

- **Where the arbitraries live.** `tech.md` says shared arbitraries live in `packages/engine/src/testing/arbitraries.ts`. The Property 1 arbitraries (`arbOrderEntries`, `arbFilterState`) are in `packages/export/test/support/arb-order-filter.ts` instead, because the engine has zero dependencies and cannot import `OrderEntry` from the export package. The design recorded this before any code was written, next to the existing `arbOrderChoice`.
- **Three defects the earlier browser walks found, which earlier specs had missed.** The print view broke "Code" and "Timestamp" mid-word because body-cell `overflow-wrap: anywhere` also applied to header cells; a stylesheet test that fails on the old file now guards the fix. A "Could not open <name>." message stayed on screen while the confirm dialog for the next file was open; `runOpen` now clears both messages first, with a test. The commit hook picked up generated `.d.ts` files; `.gitignore` now ignores them and a test fails if `git ls-files` lists any other than `css-modules.d.ts`.
- **This list was incomplete.** The first version of this section held only the arbitraries note and the three earlier defects above. Reading the finished page in a browser found the following, none of which the tests had caught:
  - A data field name was printed as page copy. The superseded sentence in the dataset vocabulary was written for people reading the JSON, and the page printed it as it stood.
  - The judge role was printed as a bare data word after the name, such as `district`, instead of a title before it.
  - A title was printed twice when it was the same as the instrument name.
  - At 1280px the text ran the full width of the window, every line had the same size and weight, and the desk colour filled the rest of a short page.
  - Courts were ordered so that a space sorted before a letter, which put `D.N.M.` last among the `D.` courts.
  - The `compiled` date (2026-11-08) was older than an entry retrieved on 2026-11-15.
  - In the override table the Timestamp column was 26ch wide for a value of 16 characters, and the Reason column was squeezed into five lines.
- **Why the field-name test checks only some keys.** It looks for schema-shaped keys, meaning a key with an underscore or an interior capital. `court`, `text`, `instrument` and `compiled` are ordinary English words that the page prints on purpose, so a test on every key would fail on correct copy or force the page to avoid common words.

### Stray `.d.ts` files: emitting process not found

The process that wrote `.d.ts` files into `crew/sentinel/src` and `packages/export/test/support` was not found. Searched: root and `apps/web` `package.json` scripts, `.kiro/hooks/*.json` (7 hooks), `.github/workflows/ci.yml`, `scripts/` (`build-power.mjs`, `commit-task.sh`, `kiro-usage-check.mjs`), `vitest.config.ts`, and the tsconfig files. Every tsconfig sets `outDir` to `dist`, and `tsc -b` writes there, so a stray `.d.ts` beside the sources must come from a `tsc` run that bypassed the project files. Nothing was reconfigured for this; the `.gitignore` entry keeps such files out of commits.

### Verification

Nothing was pushed.

## 2026-11-16 citation-check-page

### What was built

The citation-check-page spec adds a public page at `/check`. A person pastes a draft or opens a file, presses Check citations, and sees each citation and quotation with the editor's own status words. The page stores nothing except the one hand-over described below.

- **Shared_Rows extraction.** The pure part of the Issues region, the Resolved list and the Verify result moved into `apps/web/src/client/check-rows.ts`: the status words (`STATUS_WORDS`, now including "found" and "match"), the tally words, the Next_Sentences, `shorten`, `MAX_ISSUE_TEXT`, `foundText`, `wrongCaseFor`, `divergenceFor`, `checkRows` and the `displayFor` helper. The old modules re-export what they gave up, so existing imports and the existing editor tests passed unchanged. The editor and `/check` now build rows from one module, so no status word or sentence is written twice. Property 1 (one answer) in `apps/web/test/check-rows.properties.test.ts` asserts that the rows carry the same status, words, names, mismatch lines, divergence words and links as the editor shows, once each and in document order.
- **Hand_Over through `sessionStorage`.** "Open this draft in the editor" writes the draft text to `sessionStorage` under `reveal-codes:check-handover:v1` and follows an `<a href="/">`. The editor reads the key once at mount and removes it (`takeHandover` in `apps/web/src/handover.ts`). `sessionStorage` is per tab, is cleared when the tab closes, and is easy to fake in a test. Rejected: `window.name`, which is not cleared on navigation and carries the text to whatever page the tab visits next, and `postMessage`, which needs a window reference that a plain link does not give and is harder to test. Known limit: a hand-over that is written but never read stays in the tab's `sessionStorage` until the next editor mount in that tab.
- **`AppServices` additions.** `session: StorageLike` (built lazily from `window.sessionStorage`; only `handover.ts` calls `setItem` and `removeItem` on it) and `clipboard: { available(); write(text) }` (reads `navigator.clipboard` inside both methods; `available` is false on the server snapshot, so the server HTML has no Copy button). No dependency, environment variable or API route was added.
- **Other parts.** `runCheck` in `src/check/run-check.ts` runs the editor's `runVerifyFlow` unchanged on a private store. `CodeLabel` in `src/pane/` draws the status label on the dark ground. `copyText` and `localDate` build the pasted summary.

### What Kiro got wrong, and what fixed it

- **A load error in the first design pass.** The first invocation that wrote `design.md` failed with a load error. A later pass found a partial `design.md` on disk and continued from it, so the file had to be reread in full before anything downstream relied on it, rather than trusted on the strength of the first (failed) call.
- **A comment broke the inventory scan.** `check-request.properties.test.ts` (Property 2) first carried the comment `// Property 2: nothing more is sent`, which the inventory regex for `// Property N` rejected. It was changed to `// Property 2`.
- **`handover.ts` swallowed errors on the first pass.** The first implementation of `writeHandover` and `takeHandover` used `try { ... } catch { return false; }` / `catch { return null; }` directly around the `sessionStorage` calls, which tripped the no-swallowing-catch static scan (the catch blocks discarded the error with no use of it). Reworked around a small `attempt()` helper that runs a thunk and returns a `Result`-shaped outcome the caller inspects, so the catch is no longer empty and the scan passes.
- **No seam to force a discarded run in `runCheck`.** Task 4.4's example tests could not drive `runCheck` into returning `{ kind: "discarded" }`, because `outcome.status === "discarded"` only happens when a newer run superseded the one in flight inside `runVerifyFlow`, and `runCheck` builds its own private store and has no parameter through which a test can inject a second run or a fake "discarded" outcome. The branch is exercised indirectly through the editor's own `runVerifyFlow` tests, not through `runCheck`'s example tests; `run-check.test.ts` covers every other branch (too long, blank, no citations, failed) but not this one. Not fixed in this pass; a seam (an injectable `runVerifyFlow` or a way to pass a pre-built outcome) is the follow-up if this branch needs direct coverage.
- **Two copy decisions changed after the first proposal.** Q8 (how the pasted summary's "On record" line is worded for a wrong-case row) and Q9 (what the small-screen page shows at narrow widths) were both revised from their first answers during review before design.md was finalized; the committed design reflects the second, not the first, proposal for each.
- **The walk at 375px, 320px and 1280px found six more problems.** These were fixed in tasks 12.6, 12.8, 12.9 and 12.10 of `.kiro/specs/citation-check-page/tasks.md`.
  - **Rows had no case name.** A row on `/check` showed the citation but not the name of the case. The editor shows the name from the document beside the row, and the page has no document beside it, so the name was never carried over.
  - **The touch sizes were never checked against a phone.** The draft box was 13px, and iOS zooms the page when a text box is under 16px. The buttons were 30px high and the links 29px, below a usable touch target. Task 12.6 set the draft box to 16px and added `@media (pointer: coarse)` blocks that give buttons and links a 44px minimum.
  - **The editor notice began "Opened The draft…".** A sentence that begins with a capital letter was reused as a file name inside the "Opened {name}" message. Task 12.8 changed the name to "the draft from the checker" and capitalised the first letter of a refused hand-over's notice.
  - **Two sentences said the draft is not stored.** The page carried both `PRIVACY_SENTENCE` and `NOT_STORED_SENTENCE`, which repeated one claim. Task 12.10 replaced them with one Storage_Statement, with a second wording for screens 800px or wider that mentions storing in the editor.
  - **The Editor_Link seemed frozen at load when the window was widened from 375px to 1280px.** The cause was not reproduced, either in jsdom or in Chromium through Playwright. The test of task 12.9 passed without a fix. As a hardening, `browserViewport` now also listens to the `matchMedia("(min-width: 800px)")` change event, in addition to `resize`, and the width read moved into `useWide`. A check in the user's own browser (375px, then widen to 1280px) remains open, and this entry does not claim the cause is known.

### Left out

- The footer "Open the editor" link still shows below 800px, where the Editor_Link in the page body and the Storage_Statement do not mention the editor.
- The 32px buttons of the shared Modal (the confirm dialog) were left out of the `pointer: coarse` touch rule, so they stay below 44px on a phone.
