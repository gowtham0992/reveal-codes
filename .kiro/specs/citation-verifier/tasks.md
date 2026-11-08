# Implementation Plan: citation-verifier

## Overview

The plan builds `packages/verifier` and `packages/courtlistener-mcp` in TypeScript. The engine is not changed. Order: scaffolding and test support, quote checking (pure), request building and status mapping (pure), rate limiting, transport and cache, opinion fetch, fixtures, the MCP server, then docs and the live proof.

Conventions that apply to every task:

- Paths are repository-relative. Source modules stay at 300 lines or fewer and functions at 40 lines or fewer. No `any`, no default exports, no `try/catch` that swallows (tech.md, Req 15.4 to 15.6).
- Tests live in `packages/verifier/test/` (or `packages/courtlistener-mcp/test/`). Example tests belong to the implementation task that builds the module; they are not separate tasks. No network, no `vi.mock`, no snapshots. The fixtures-only fetch or a scripted fetch is the only fake of the network (testing.md).
- Every property is one `fc.assert(fc.property(...))` in a file named `<module>.properties.test.ts`, preceded by `// Property N`, inside a `describe` whose title ends in `_Requirements: x.y_`. Runs come from `test/support/fc.ts` `runs()`. Properties are core and none is optional. On a failing property, record the shrunk counterexample as a named example test and fix the code; never weaken the property (testing.md).
- Standing Known-limitations rule: a finding that affects only malformed input or a rare citation style is recorded as one `L<n>` line in the Known limitations section of `requirements.md` and `design.md` (next free number is L11), with no spec change and no stop.
- Task completion notes record anything Kiro got wrong and the fix, for the BUILD_LOG entry in task 8.1.

Deviations from the design's file layout, decided while planning:

- `src/cache-memory.ts` is built in task 1.2 (not group 4) because the shared test fakes need it. Task 4.3 reuses it for Property 5.
- A small `src/request.ts` (URL, headers, form body for one chunk) and a pure `planLookup` in `src/lookup.ts` land in task 3.1 so Properties 2, 11 and 12 can be written in group 3. Task 4.4 wires `lookup()` and points those three properties' harness at the real `lookup()` with a scripted fetch, keeping one `fc.assert` each.
- `combine.ts` lands in task 4.4 with its only caller.

## Tasks

- [x] 1. Scaffolding
  - [x] 1.1 Package config, vitest projects, guards, and hook
    - Files: `packages/verifier/package.json` (add `@reveal-codes/engine` as `workspace:*`; keep `fast-check`), `packages/verifier/tsconfig.json` and `packages/courtlistener-mcp/tsconfig.json` (`"types": ["node"]`, add `references` to `../engine`, verifier `include` adds `fixtures/**/*.json`), `packages/courtlistener-mcp/package.json` (add `@reveal-codes/engine` and `@reveal-codes/verifier` as `workspace:*`, `@modelcontextprotocol/sdk` pinned to one exact v1 version with no `^` or `~`, `zod` at the exact version the SDK's peer range needs; keep the placeholder `start` script until task 7.2), root `.npmrc` containing `reporter=silent`, root `vitest.config.ts` (already declares the `verifier` and `courtlistener-mcp` projects: verify, add only if missing), `.kiro/hooks/verifier-tests-on-save.json` (shape in design "Hooks": `PostFileSave`, matcher `packages/verifier/(src|test)/.*\\.ts$`, command `perl -e 'alarm shift; exec @ARGV' 120 pnpm vitest run --project verifier --passWithNoTests`, no engine or MCP project).
    - Guard tests in `packages/verifier/test/`: `support/scan-source.ts` (strips comments, string and template text, regex literals; reports `file:line`), `static.test.ts` (no `process.env`, `Date.now(`, `new Date()`, `setTimeout(`, `globalThis.fetch`, bare `fetch(` under `src/`; `deps.fetch(` passes; includes a self-test that a planted violation is reported with path and line), `limits.test.ts` (TypeScript compiler API over verifier `src` and `test` and MCP `src`: at most 300 lines per file, at most 40 lines per function, no `AnyKeyword`, no `export default`, every `catch` rethrows, returns `err(...)`, or contains `expect`), `projects.test.ts` (root `vitest.config.ts` still names `verifier` and `courtlistener-mcp`).
    - Acceptance: `pnpm install`, `pnpm typecheck` and `pnpm vitest run --project verifier` pass; the hook JSON parses and its matcher matches `packages/verifier/src/a.ts` and not `packages/engine/src/a.ts`.
    - _Requirements: 11.2, 11.3, 13.16, 13.17, 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_
  - [x] 1.2 Deps types, createDeps and state, shared test fakes
    - Files: `src/deps.ts` (`FetchLike`, `FetchInit`, `HttpResponse`, `CacheStore`, `DepsInit`, `Deps`, `VerifierState`, `Counters`, `Cell`), `src/create-deps.ts` (`createDeps(init)`: trims a trailing `/` from `baseUrl`, fresh `state` with a full bucket, empty Window_Log, zero counters, resolved gate tail), a minimal `BucketState` type and initial value in `src/bucket.ts` (task 4.1 completes the module), `src/cache-memory.ts` (`createMemoryCacheStore({ now })`, strict-before-expiry rule), `src/index.ts` (named exports only, as in design "Module map").
    - Test support: `test/support/scripted-fetch.ts` (steps `{status, headers?, body}`, `{reject}`, `{hang}`; records url, method, headers, decoded `text`; fewer steps than calls fails the test), `test/support/manual-clock.ts` (`now`, `sleep(ms, signal)` that advances the clock to the earliest live timer when the event loop is idle, aborted timers removed, every `sleep` argument logged, `advance(ms)`), `test/support/fc.ts` (`runs()`: `FC_NUM_RUNS` if set, else 500 when `process.env.CI` is set, else 200), `test/support/make-deps.ts` (`createDeps` over scripted fetch, manual clock, memory store, base URL `https://cl.test/api/rest/v4`).
    - Example tests: `create-deps.test.ts` (two `createDeps` calls share no state, fresh state values, trailing slash trimmed), `cache-memory.test.ts` (expiry at and after the boundary, `delete`), a self-test of the manual clock (hang step reaches the 15 000 ms timer, aborted timers do not move time).
    - _Requirements: 10.3, 10.11, 11.1, 11.8, 11.9, 11.10, 16.4, 16.6_

- [x] 2. Quote normalisation and checkQuote
  - [x] 2.1 Normalisation pipeline, KMP search, and segments
    - Files: `src/normalise.ts` (`normalise`, `normaliseQuote`, `foldCase`, `trimTail`, stages in the order of Req 8.2 with the explicit White_Space class; bracket removal by stack matching; ellipsis regex `/\.(?:WS*\.){2,}|…/g`), `src/kmp.ts` (`indexFrom`, `longestPrefixOccurring`, both linear), `src/segments.ts` (`segmentSpans`, `splitSegments`, `matchSegments` with the 12-character floor for interior segments only, `frontier`).
    - Example tests `normalise.test.ts`: each step alone; `[t]he`; `[...]` and `.[.].`; `. . .` with NBSP and U+0085 runs; curly quotes and dashes; trailing `.,;:` with whitespace before them; empty and whitespace-only input. `segments.test.ts`: leading and trailing `…` ignored; a quote with no `…` has one segment; first and last segments under 12 characters still match; `next` index after the following `…`; segments that each occur but in the wrong order do not match (Req 8.16); a short interior segment does not match though it occurs (Req 8.16); the same segment twice must occur twice and may not overlap.
    - Known limitations to record as L-entries if met: L4 (case folding of U+0130 and astral letters), L10 (ellipsis inside the opinion). Do not stop for them.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.14, 8.16_
  - [x] 2.2 Origin tracking, prefixLength, and checkQuote
    - Files: `src/track.ts` (`trackQuote`: folded pre-trim normal form `V`, per-unit origins, dirty cuts; abandons tracking when NFC changes the quote), `src/quote.ts` (`checkQuote`, `prefixLength` per design A9: clean and dirty cut classification, frontier `J*`, descending scan, `MAX_PROBES = 64`, verified probes; never returns `unchecked`), `test/support/prefix-model.ts` (brute-force model: for every `n` in `0 <= n < L` normalise the prefix with the string pipeline in the mode of A9 and test it with `matchSegments`; used by Property 9).
    - Example tests `quote.test.ts`: the three worked examples of A9 with `prefixLength` 63, 30 and 22; single-segment quote under 12 characters absent gives `mismatch` 0 and present gives `match` (Req 8.7); a quote with no segment (`…`, empty, whitespace) gives `mismatch` 0 (Req 8.8); ellipsis cases: out-of-order segments, a short middle segment, a leading `…`, a trailing `…`, short first and last segments; non-monotone prefix cases from A9; probe-budget exhaustion; tracking abandoned for non-NFC input. Every result is below the quote length.
    - Known limitations to record as L-entries if met: L2 (probe budget), L3 (shortcut misses), L9 (altered word inside brackets or an ellipsis form). Do not stop for them.
    - _Requirements: 8.1, 8.6, 8.7, 8.8, 8.9, 8.15, 8.16_
  - [x] 2.3 Property 7: pipeline idempotent and never longer than NFC
    - File `test/normalise.properties.test.ts`; shared `arbAnyString` from the engine, verifier `arbNormalisable` in `test/support/arb-verifier.ts` (ASCII, curly quotes, dashes, brackets, dots, tabs, U+0085, U+00A0, U+FEFF, combining marks, surrogates, Hangul jamo).
    - **Property 7: The Normalisation_Pipeline is idempotent and never lengthens beyond NFC**
    - Asserts `normalise` and `normaliseQuote` idempotence, steps 2 to 6 never longer than their input, `normalise(s).length <= s.normalize("NFC").length`, and that `trackQuote` text with the tail trimmed equals `normaliseQuote(s)` when tracking holds.
    - **Validates: Requirements 8.10, 8.11**
    - _Requirements: 8.10, 8.11_
  - [x] 2.4 Property 8: a lifted quotation matches however it is typeset
    - File `test/quote.properties.test.ts`; arbitraries `arbQuoteSource` (engine `arbOpinionWithQuotes` filtered to no ellipsis form, `[` or `]`) and `arbEllipsisJoin` in `test/support/arb-verifier.ts`; one to three in-order non-overlapping word-boundary substrings, each at least 12 characters after trailing `.,;:` and preceding whitespace are removed, joined by `…`, `...` or `. . .`, then curly quotes, wider White_Space runs and swapped ellipsis forms applied.
    - **Property 8: A quotation lifted from an opinion matches however it is typeset**
    - **Validates: Requirements 8.4, 8.5, 8.12, 8.14**
    - _Requirements: 8.12_
  - [x] 2.5 Property 9: an altered quotation mismatches and prefixLength locates the divergence
    - Same file `test/quote.properties.test.ts`; one `fc.assert` over `fc.oneof` of two tagged cases: (a) a contiguous lifted quote of at least 12 characters with one interior word replaced by a word absent from the opinion, asserting `mismatch` and `offset <= prefixLength < quote length`; (b) small adversarial quote and opinion pairs (brackets, ellipsis forms, combining marks, one to three segments, interior segments under 12 characters) asserting `prefixLength` equals `test/support/prefix-model.ts`.
    - **Property 9: An altered quotation mismatches, and prefixLength locates the divergence**
    - **Validates: Requirements 8.6, 8.13, 8.15**
    - _Requirements: 8.13_
  - [x] 2.6 Checkpoint - quote checking
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm vitest run --project verifier`; fix failures. Ensure all tests pass, ask the user if questions arise.

- [x] 3. Request building, chunking, status mapping
  - [x] 3.1 JSON/time helpers, lines, chunks, request, and status mapping
    - Files: `src/json.ts` (`parseJson` returning `Result`, the only `try/catch` in `src/`, plus `isRecord`, `asArray`), `src/time.ts` (`nowMs`, `toIso` rejecting years outside 0000 to 9999, `parseWaitUntil`, `parseRetryAfter` for integer seconds and HTTP dates), `src/unresolvable.ts` (`UNRESOLVABLE_FORMS`: WL and LEXIS entries, non-empty, at most 200 characters, naming the form and saying CourtListener does not resolve it), `src/lines.ts` (`memberLines`, `buildLines`: Citation_Line via the engine's `format` on a pincite-free reporter value, first-occurrence de-duplication, `database` and `invalid` handling, zero-member parallel is `invalid`), `src/chunk.ts` (`chunkLines`, A2: at most 60 lines and 64 000 characters, `oversize` flag), `src/request.ts` (URL `{baseUrl}/citation-lookup/`, `Content-Type: application/x-www-form-urlencoded`, `Accept: application/json`, body `text=` + `encodeURIComponent(lines.join("\n"))`, `Authorization: Token <token>` only when a token is set and the URL starts with `{baseUrl}/`), `src/map-status.ts` (`parseLookupBody`, `mapEntry`, `mapChunk` per A5: position mapping, count check, 200 with two or more clusters is `ambiguous`, both `wait_until` and `wait_util` read), and in `src/lookup.ts` a pure `planLookup(records)` returning the unique lines, chunks and per-record member index, plus `resultsForRecords(index, lineResults)` (database and invalid give bare `unchecked`; one member gives its result; several members call `combineParallel`, wired in 4.4).
    - Example tests: `time.test.ts` (`Retry-After` as integer, date, garbage; `wait_until` in several forms), `lines.test.ts` (parallel order, duplicates, database, short and other skipped, `912 F. 4th 33` normalises to `912 F.4th 33`), `chunk.test.ts` (60-line cap, 64 000-character cap, oversize line alone), `request.test.ts` (body is lines joined by `\n`, no token off-Base_URL, no token without a configured token, no headers besides `Authorization`, `Content-Type`, `Accept`), `map-status.test.ts` (one example per row of A5, plus malformed entry, wrong length, non-array body), `unresolvable.test.ts`.
    - Known limitation to record if met: L6 (one unparseable line unchecks its chunk).
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.9, 2.10, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.3, 5.4, 7.2_
  - [x] 3.2 Property 1: status mapping yields verified only for Line_Status 200
    - File `test/map-status.properties.test.ts`; `arbLookupEntry` and `arbLookupBody(lines)` in `test/support/arb-verifier.ts` (statuses 200, 300, 400, 404, 429 and out-of-set values, 0 to 3 clusters with valid, duplicate and malformed ids, optional `wait_until`, wrong-length and non-array variants).
    - **Property 1: Status mapping yields verified only for Line_Status 200 and one result per line**
    - **Validates: Requirements 1.8, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
    - _Requirements: 3.8_
  - [x] 3.3 Property 4: chunking caps hold and chunks concatenate to the input
    - File `test/chunk.properties.test.ts`; lists of distinct Citation_Lines from the engine's `arbReporterValue` plus occasional lines over 64 000 characters.
    - **Property 4: Chunking caps hold and chunks concatenate to the input**
    - **Validates: Requirements 7.2, 7.7**
    - _Requirements: 7.7_
  - [x] 3.4 Property 2: request bodies carry only Citation_Lines drawn from the records
    - File `test/lookup.properties.test.ts`; `arbRecords` (from the engine's `arbDocument`, all kinds, keys preserved) in `test/support/arb-verifier.ts`, plus the engine's `arbDocumentText` as the draft. Until task 4.4 the harness reads the requests from `planLookup` and `request.ts`; task 4.4 swaps it for `lookup()` with a scripted fetch returning 404 entries, keeping one `fc.assert`.
    - **Property 2: Request bodies carry only Citation_Lines drawn from the records**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.8**
    - _Requirements: 2.8_
  - [x] 3.5 Property 11: database citations are never sent and always map to unchecked
    - Same file `test/lookup.properties.test.ts`; same harness and swap in task 4.4; records mixed through the engine's `arbDatabaseValue`.
    - **Property 11: Database citations are never sent and always map to unchecked**
    - **Validates: Requirements 5.1, 5.3, 5.4, 5.5**
    - _Requirements: 5.5_
  - [x] 3.6 Property 12: short and other records are never sent and never in the result map
    - Same file `test/lookup.properties.test.ts`; same harness and swap in task 4.4.
    - **Property 12: Short and other records are never sent and never in the result map**
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6**
    - _Requirements: 1.3, 1.4_

- [ ] 4. Token bucket, retries, cache
  - [x] 4.1 Token bucket, Window_Log, and dispatch gate
    - Files: `src/bucket.ts` (complete the module: `CAPACITY`, `REFILL_MS`, `WINDOW_MS`, `refill` with integer-ms partial retention and no credit for a backwards step, `waitFor` as `max(bucket wait, window wait)`, `take`, `availableTokens`, `acquire(deps, n)` with exactly one `Deps.sleep` when the wait is positive and at most three iterations), `src/gate.ts` (`withGate(state, fn)` promise chain held in `deps.state`).
    - Example tests `bucket.test.ts`: refill keeps partial ms (999 then 1) and caps at 60; backwards clock step; shortfall sleep `5 * 1000 - 400 = 4600`; the window counterexample (60 lines at t = 0, then 30 lines at t = 30 000 sleeps until t = 60 000); retry deducts tokens again. `gate.test.ts`: two concurrent calls on one `Deps` dispatch in order and never interleave.
    - Known limitation to record if met: L7 (clock steps).
    - _Requirements: 7.1, 7.3, 7.4, 7.12, 7.13_
  - [x] 4.2 Transport: timeout race, auth rule, retries
    - File `src/transport.ts` (`requestOnce` racing `Deps.fetch` against `Deps.sleep(15000, signal)` and aborting the loser, `redirect: "error"`, token attached only when the URL starts with `{baseUrl}/`; `HttpOutcome` carries no request header; `withRetries` at most three attempts, retry only on 429 and 5xx, `retryDelayMs` = larger of `Retry-After` and `wait_until` interval, 1 000 ms when neither, capped at 30 000 ms, `before()` called again on each retry).
    - Example tests `transport.test.ts`: reject, hang (aborted at 15 s), 500, 404 not retried, bad JSON, redirect error; `Retry-After` integer, HTTP date and garbage; `wait_until` and `wait_util`; exhausted chunk keeps the last `waitUntil`; the recorded `http/throttle-429.json` shape replayed three times once task 6.1 lands (until then use an in-test body); token never appears in an outcome or thrown value.
    - Known limitation to record if met: L8 (opinion requests unmetered).
    - _Requirements: 2.9, 2.10, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 7.6, 7.8, 7.9, 7.11, 11.4, 11.7_
  - [x] 4.3 Cache access, FileCacheStore, and status
    - Files: `src/cache-access.ts` (`cacheGet`, `cacheSet`: counters, 24 h TTL via `toIso`, shape guard `isTerminalResult`, rejection-safe), `src/cache-file.ts` (`createFileCacheStore({ dir, now, fs? })`, `encodeKey`, temp file plus rename, corrupt or missing file is a miss, failed write leaves the old entry and removes the temp file, over-long encoded name not written), `src/status.ts` (counters helpers and `verifierStatus(deps)` with `refill(...).tokens` computed from `Deps.now` and not stored).
    - Example tests `cache-file.test.ts` (keys `../x`, `a/b`, `opinion:7`, `.`, `..` stay inside the directory; atomic write with an injected failing `fs`; unparseable file is a miss; no token in any file or file name), `cache-access.test.ts` (unchecked never written, expired entry overwritten, bad-shape value counts as a miss), `status.test.ts` (counters after a scripted sequence, `verifierStatus` after idle refill, no key listing needed).
    - _Requirements: 10.1, 10.2, 10.3, 10.7, 10.8, 10.9, 10.10, 10.12, 10.13, 10.14_
  - [x] 4.4 lookup() wiring and combineParallel
    - Files: `src/combine.ts` (`combineParallel` per A6), `src/lookup.ts` (complete: cache read before the gate, `chunkLines`, `withGate` dispatch loop with `acquire` and `withRetries`, oversize chunk unchecked without a request, terminal results cached, `unchecked` never cached, one entry per Full_Record via `resultsForRecords`, never throws), `src/index.ts` exports.
    - Re-point the Property 2, 11 and 12 harness (tasks 3.4 to 3.6) at `lookup()` with a scripted fetch; keep one `fc.assert` per property and do not weaken any assertion.
    - Example tests `combine.test.ts` (one per A6 row, including no members and the `reason` rule), `lookup.test.ts` (zero Full_Records makes no calls; fault isolation where chunk 2 of 3 fails and chunks 1 and 3 keep results; cached lines are not resent; all-database list makes zero calls; two equal calls give equal maps).
    - _Requirements: 1.1, 1.5, 1.6, 1.7, 1.9, 1.10, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.9, 10.4, 10.5_
  - [~] 4.5 Property 3: lines sent in any 60 000 ms window never exceed 60
    - File `test/bucket.properties.test.ts`; `arbClock` (non-decreasing, gaps 0 to 120 000) and `arbResponseScript` (429 with and without `Retry-After`, `wait_until`, `wait_util`, 5xx, other 4xx, valid 200) in `test/support/arb-verifier.ts`; sequences of `lookup` calls over fresh lines through the manual clock, retries included.
    - **Property 3: Lines sent in any 60 000 ms window never exceed 60**
    - **Validates: Requirements 7.1, 7.3, 7.4, 7.5, 7.12, 7.13**
    - _Requirements: 7.5_
  - [~] 4.6 Property 5: cache round trip and expiry hold for both stores
    - File `test/cache.properties.test.ts`; one `fc.assert` whose generated input includes the store kind, run against both `createMemoryCacheStore` and `createFileCacheStore` (temporary directory removed afterwards); keys from the engine's `arbAnyString`, results from the engine's `arbVerificationResult` without `unchecked`, a mutable manual clock; asserts equality before expiry, miss at and after, no cross-key reads, no file outside the directory.
    - **Property 5: Cache round trip and expiry hold for both stores**
    - **Validates: Requirements 10.3, 10.6, 10.8, 10.11**
    - _Requirements: 10.6_
  - [~] 4.7 Property 6: a fully cached lookup makes no network or sleep calls
    - Same file `test/lookup.properties.test.ts`; scripted fetch driven by `arbLookupBody` with a mix of terminal and `unchecked` outcomes; repeat the call and assert zero fetch and sleep calls when all lines were terminal, and that any request carries only lines that were not terminal the first time.
    - **Property 6: A fully cached lookup makes no network or sleep calls**
    - **Validates: Requirements 10.2, 10.4, 10.5**
    - _Requirements: 10.5_
  - [~] 4.8 Property 10: retries are bounded and exhaustion keeps the last wait
    - File `test/transport.properties.test.ts`; `arbResponseScript` and `arbClock`; at most three `Deps.fetch` calls per chunk, stop at the first non-429 and non-5xx, each retry sleeps `min(30000, max(...))` or 1 000 ms, exhausted chunk is `unchecked` with the last valid `waitUntil` or none.
    - **Property 10: Retries are bounded and exhaustion keeps the last wait**
    - **Validates: Requirements 4.3, 4.5, 4.6, 4.7, 7.6, 7.8, 7.9, 7.10, 7.11**
    - _Requirements: 7.10_
  - [~] 4.9 Checkpoint - lookup pipeline
    - Run `pnpm lint`, `pnpm typecheck` and `pnpm vitest run --project verifier`, and `FC_NUM_RUNS=500 pnpm vitest run --project verifier properties.test`; fix failures. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Opinion fetch and HTML stripping
  - [x] 5.1 htmlToText and fetchOpinionText
    - Files: `src/html.ts` (`htmlToText`: drop `<script>`, `<style>` and `star-pagination` elements, block tags to `\n`, other tags removed, named and numeric entities decoded, invalid code points to U+FFFD), `src/opinion.ts` (`fetchOpinionText`: validate `^[1-9][0-9]*$`, `opinion:<clusterId>` cache read, cluster GET with `?fields=`, opinion URLs rebuilt from `{baseUrl}` and the numeric tail and never followed as given, outer loop over opinions in cluster order and inner loop over `plain_text`, `html_with_citations`, `html`, `html_lawbox`, `html_columbia`, `xml_harvard`, a field that is empty after stripping counts as empty, only non-null text cached, any failure returns `null` uncached), `src/index.ts` export.
    - Example tests `opinion.test.ts` and `html.test.ts`: the examples of Req 9.4 and 9.5, field preference, HTML strip and entity decode, markup-only field skipped, request failure returns `null` and caches nothing, cache hit makes no call, zero opinions, hostile `sub_opinions` URL never receives the token.
    - Known limitations to record if met: L1 (multi-opinion clusters), L5 (page markers in live markup).
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 2.9, 2.10_

- [ ] 6. Fixtures
  - [~] 6.1 Fixture_Set, manifest, and quotes
    - First read `packages/engine/fixtures/demo-motion.txt` and `packages/engine/test/demo.test.ts` so the motion's quotations match the fixtures exactly (the Haines passage `less stringent standards than formal pleadings drafted by lawyers` and the fabricated Iqbal quotation).
    - Files under `packages/verifier/fixtures/`: `README.md`, `manifest.json` (schema `ManifestEntry` from the design: `file`, `kind`, `line` or `path`, `source`, exactly one of `recorded` or `hand_authored: true`, `synthetic: true` only with `hand_authored`, one-line `note`), `lookup/*.json` for `556 U.S. 662` and `404 U.S. 519` (200, one cluster), `1047 F.3d 212`, `1012 F. Supp. 2d 88` and `912 F.4th 33` (explicit 404 entries), synthetic `1 H. 150` (300, two clusters) and synthetic `576 U.S. 644` (per-line 429 with `wait_until`, inside HTTP 200), `http/throttle-429.json` (HTTP-level 429 with `Retry-After` and `wait_until`, not routed), `clusters/<id>.json`, `opinions/<oid>.json`, `quotes.json` (two genuine quotes of 8 to 60 words per verified case, the motion's Haines quote flagged `inMotion`, exactly one fabricated quote, the motion's Iqbal attribution flagged `inMotion`, in none of the excerpts; the Iqbal excerpt includes the text around 556 U.S. at 678 to 679).
    - Recording rule: if `COURTLISTENER_TOKEN` and a network are available, record the lookup, cluster and opinion responses once from the live API, check the open risks R1 and L5 (cluster `id` type, per-line `wait_until`, form encoding, `fields=`, page markers) and correct the parser if they differ. Otherwise hand-author each response to the documented shape with `hand_authored: true`. Opinion excerpts are copied verbatim from the public-domain opinions of Ashcroft v. Iqbal, 556 U.S. 662, and Haines v. Kerner, 404 U.S. 519. If the text cannot be obtained verbatim, STOP and ask the user; never compose or paraphrase opinion text. Real cluster ids come from the live API; a hand-authored id is marked `hand_authored` and is never presented as real.
    - Acceptance: every excerpt contains the quotations assigned to it; the fabricated quote appears in no excerpt; the manifest lists every file; no token or header in any fixture.
    - _Requirements: 12.1, 12.2, 12.8, 12.9, 12.10, 12.11, 12.15, 11.7_
  - [~] 6.2 createFixtureFetch and Demo_Corpus tests
    - Files: `src/fixtures.ts` (`createFixtureFetch()` per A13: static JSON imports with `with { type: "json" }`, manifest-built maps, routing by method and pathname with the query ignored, POST to `/citation-lookup/` decodes `text`, splits on `\n`, trims, drops empty lines, answers HTTP 200 with one entry per line in input order and `status: 404` for unknown lines, recorded GET paths answer 200, everything else HTTP 404 `{"detail":"Not found."}`, never throws, never touches the network), `src/index.ts` export.
    - Example tests: `fixtures.test.ts` (routing table; every manifest entry has its file; every file under `fixtures/` has a manifest entry; exactly one of `recorded` or `hand_authored` per entry; `synthetic` only on `1 H. 150` and `576 U.S. 644`, each also `hand_authored`; each verified case has two genuine quotes that `match` its excerpt; exactly one fabricated quote of 8 to 60 words that `mismatch`es every excerpt), `demo-corpus.test.ts` (one `lookup` through `createFixtureFetch()` returns `verified`, `verified`, three `not_found`, `ambiguous` with two candidates, and `unchecked` with the recorded `waitUntil`; the engine's `extract` on `demo-motion.txt` yields exactly the five reporter lines, with `912 F.4th 33` normalised; the motion's Haines quote is `match` and its Iqbal quote is `mismatch` against the excerpts; `http/throttle-429.json` replayed by a scripted fetch three times gives `unchecked` with the last `waitUntil`). Update the transport example from task 4.2 to use the recorded 429 fixture.
    - _Requirements: 12.3, 12.4, 12.5, 12.6, 12.7, 12.12, 12.13, 12.14, 12.15, 16.3_

- [ ] 7. MCP server
  - [~] 7.1 MCP library: env, context, schemas, tool handlers, server
    - Files under `packages/courtlistener-mcp/src/`: `env.ts` (`readEnv(env, home)`, the only reader of `COURTLISTENER_TOKEN`, `REVEAL_CODES_CACHE_DIR` default `<home>/.reveal-codes/cache`, `REVEAL_CODES_FIXTURES_ONLY`; empty token is absent), `log.ts` (stderr only, replaces the token by `[redacted]`), `context.ts` (`buildContext(env)` giving one `Deps`: global `fetch`, `() => new Date()`, abortable unref'd `setTimeout` sleep, file cache or, in fixtures-only mode, `createFixtureFetch()` with a memory cache, base URL `https://www.courtlistener.com/api/rest/v4`), `results.ts`, `schemas.ts` (Zod shapes and `parseArgs` returning `Result<T, string>` that names the first invalid argument), `tools/lookup-citations.ts`, `tools/get-opinion-text.ts`, `tools/check-quote.ts`, `tools/verifier-status.ts` (thin handlers per the design: `createDocument` per string, one `lookup` call over keys rewritten `"<i>:<key>"`, `setVerification` and `verificationOf` for results, text, offsets, source index; unavailable opinion is a message, not an error; `check_quote` returns `unchecked` with a reason when the text is unavailable), `server.ts` (`createServer(ctx)` with `McpServer.registerTool` for exactly four tools), `index.ts` (named exports). Each handler re-runs `parseArgs` so bad arguments return an `isError` result naming the argument before any Verifier call.
    - Example tests in `packages/courtlistener-mcp/test/` (fixtures-only mode, no network): `env.test.ts`, `tools.test.ts` (valid and invalid arguments for every tool: 0 and 51 strings, a 2 001-character string, `clusterId` 0, 1.5 and a string, a 0-character and 10 001-character quote, missing arguments; a string with no citation gives an empty list; a lone surrogate gives an error naming `citations[i]`; demo citations give two `verified` and three `not_found`; unavailable opinion paths), `server.test.ts` (exactly four tools registered, no Verifier call on bad arguments), `token.test.ts` (with a fake token set, no tool result, log line or error contains it), `static.test.ts` (no `console.log`, `console.info`, `console.debug` or `process.stdout` in the package `src`).
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12, 13.13, 13.14, 11.5_
  - [~] 7.2 Entry point, stdio test, registration, and usage rows
    - Files: `packages/courtlistener-mcp/src/main.ts` (the only module touching the `process` global: `readEnv`, `buildContext`, `createServer`, `StdioServerTransport`; fatal errors to stderr, non-zero exit), `packages/courtlistener-mcp/package.json` (`start` becomes `node --import jiti/register src/main.ts`), root `package.json` keeps `"mcp": "pnpm --filter @reveal-codes/courtlistener-mcp start"`. Tests: `stdio.test.ts` (spawns the server through `pnpm mcp` with `REVEAL_CODES_FIXTURES_ONLY=1`, completes the MCP handshake over pipes, calls `lookup_citations` on the demo lines, asserts every stdout line parses as a JSON-RPC message and stderr never holds the token; this is design R2, and if it fails the task fixes the script chain, not the contract), `package.test.ts` (SDK version matches `/^1\.\d+\.\d+$/`, `zod` has no range operator, root `.npmrc` sets `reporter=silent`). Record the pinned SDK version and whether SDK-side and handler-side argument errors both name the bad argument (design R3) in the completion notes.
    - Edit `.kiro/settings/mcp.json`: read it first; if it is missing or not valid JSON stop without writing and report; add `courtlistener` beside any existing server with `command: "pnpm"`, `args: ["mcp"]`, `env: { "REVEAL_CODES_FIXTURES_ONLY": "1" }`, `autoApprove: ["lookup_citations", "verifier_status"]`; preserve every existing entry unchanged.
    - Edit `docs/KIRO_USAGE.md`: add rows for the `courtlistener` MCP server (`.kiro/settings/mcp.json`), the `verifier-tests-on-save` hook (`.kiro/hooks/verifier-tests-on-save.json`), the citation-verifier spec (`.kiro/specs/citation-verifier/requirements.md`, `design.md`, `tasks.md`), and any steering or hook file this spec adds or changes (`.kiro/steering/citations.md` is added in task 8.1). Match the existing table columns.
    - _Requirements: 13.1, 13.13, 13.15, 13.16, 13.17, 14.1, 14.2, 14.3, 14.4_
  - [~] 7.3 Checkpoint - MCP server
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `FC_NUM_RUNS=500 pnpm test:pbt`; fix failures. Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Wrap-up
  - [~] 8.1 Docs, steering alignment, and docs tests
    - README: add the section "What leaves your machine" stating that only citation strings are sent to CourtListener and that draft text is sent to an LLM provider only when the author uses the assistant; update the status line to mention the verifier and MCP server if it is stale.
    - `.env.example`: add `REVEAL_CODES_CACHE_DIR` (comment: directory of the verifier's on-disk cache, default `~/.reveal-codes/cache`) and `REVEAL_CODES_FIXTURES_ONLY` (comment: when `1`, serve every request from recorded fixtures and make no network call), each after a comment line; extend the `COURTLISTENER_TOKEN` comment to say it is read only by the MCP server and the web app.
    - `.kiro/steering/citations.md`: the lookup bullet says the request body is the formatted citation strings joined by newline characters; the design-consequences paragraph says the verifier sends one request per chunk of at most 60 lines and 64 000 characters and no longer says the whole document is sent in one request; the `lookup(documentText)` bullet becomes `lookup(records, deps)`.
    - `BUILD_LOG.md`: append one entry headed `YYYY-MM-DD citation-verifier` (today's date) in the file's existing style, listing each place Kiro's output was wrong and the fix, hard-to-write tests, counterexample regressions, the pinned SDK version, and any `L11+` limitations found, or the text "No Kiro errors".
    - Tests: `packages/verifier/test/docs.test.ts` (README section present; `citations.md` contains "joined by newline" and "one request per chunk" and no whole-document sentence; `.env.example` lists the two new variables each directly after a comment line and the extended token comment) and `packages/verifier/test/inventory.test.ts` (exactly 12 properties numbered 1 to 12 once each; each `// Property N` is followed by exactly one `fc.assert(fc.property(` in a file named `*.properties.test.ts`; each `describe` title ends in `_Requirements: x.y_`).
    - _Requirements: 2.11, 15.7, 16.1, 16.2, 17.1, 17.2, 17.3, 17.4, 17.5_
  - [~] 8.2 Final checkpoint - full run
    - Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:pbt`; all must pass with `CI=1` set once so the 500-run path is exercised. Confirm `git status` shows no engine changes. Ensure all tests pass, ask the user if questions arise.
  - [~] 8.3 Proof: lookup_citations through the registered courtlistener tool (final task)
    - Compute the strings: run the engine's `extract` on `packages/engine/fixtures/demo-motion.txt` and take `text.slice(start, end)` for every citation it returns.
    - Call `lookup_citations` through the registered `courtlistener` MCP tool in Kiro (not by importing or running `packages/verifier` directly), with every one of those strings, running with `REVEAL_CODES_FIXTURES_ONLY=1` as registered.
    - Expect `verified` for `556 U.S. 662` and `404 U.S. 519` and `not_found` for `1047 F.3d 212`, `1012 F. Supp. 2d 88` and `912 F.4th 33`. Paste the complete returned result, one entry per citation with its verification status, into this task's completion notes.
    - If the call fails or the `courtlistener` server is not reachable from Kiro, record the failure in the completion notes and do not mark this task complete.
    - _Requirements: 14.5, 14.6, 14.7_

## Notes

- Tasks run in order. Property tasks sit right after the module they test, except Properties 2, 11 and 12, which start on the pure planning layer in group 3 and move to `lookup()` in task 4.4.
- Checkpoints are tasks 2.6, 4.9, 7.3 and 8.2. Task 8.3 is the last task of the plan and comes after the final checkpoint.
- Property coverage: P7, P8, P9 (group 2); P1, P4, P2, P11, P12 (group 3); P3, P5, P6, P10 (group 4). Twelve in all (Req 16.1).
- Engine files are not edited by any task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2", "3.3", "4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["2.3", "5.1"] },
    { "id": 5, "tasks": ["2.4"] },
    { "id": 6, "tasks": ["2.5", "3.2"] },
    { "id": 7, "tasks": ["3.4"] },
    { "id": 8, "tasks": ["3.5"] },
    { "id": 9, "tasks": ["3.6"] },
    { "id": 10, "tasks": ["4.4"] },
    { "id": 11, "tasks": ["4.5", "4.6", "4.7", "6.1"] },
    { "id": 12, "tasks": ["4.8", "6.2"] },
    { "id": 13, "tasks": ["7.1"] },
    { "id": 14, "tasks": ["7.2"] },
    { "id": 15, "tasks": ["8.1"] },
    { "id": 16, "tasks": ["8.3"] }
  ]
}
```
