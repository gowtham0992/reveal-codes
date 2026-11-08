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
