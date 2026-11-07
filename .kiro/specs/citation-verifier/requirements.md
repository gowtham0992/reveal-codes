# Requirements Document

## Introduction

`packages/verifier` turns the engine's citation records into verification results by asking CourtListener whether each cited case exists, and checks quoted language against the text of the cited opinion. `packages/courtlistener-mcp` exposes the same capability to agents as four MCP tools over stdio. Together they supply the values that the engine stores through `setVerification` and `setQuoteCheck`; the engine itself never touches the network.

Three commitments shape the whole spec:

- **Only citations leave the machine, never the draft.** The Verifier sends CourtListener formatted citation strings and nothing else. This is a privacy guarantee for self-represented litigants and is stated in the README.
- **Verification is deterministic.** A status is derived from a CourtListener response by a fixed mapping. Nothing but a per-citation status 200 ever produces `verified`.
- **Everything external is injected.** The network, the clock, sleeping, the cache, the token, and the base URL arrive through a Deps value. Tests wire fakes and recorded fixtures and never touch the network.

The engine types in `packages/engine/src/types.ts` are the contract: `CitationRecord`, `ExtractedCitation`, the `CitationValue` family, `VerificationResult`, `QuoteCheckResult`, and `IssueKey`. This spec does not change the engine.

This spec is constrained by `.kiro/steering/tech.md`, `citations.md`, `product.md`, and `structure.md`. Where this spec and `citations.md` differ, this spec records the user's later decisions and Requirement 17 brings `citations.md` into line (see "Notes for the user").

Scope: `packages/verifier` and `packages/courtlistener-mcp`. Out of scope: UI, the web app's wiring of real dependencies, LLM providers, export, and any change to the engine.

## Glossary

- **Verifier**: the `@reveal-codes/verifier` package in `packages/verifier`; the system under specification together with the MCP_Server.
- **MCP_Server**: the `@reveal-codes/courtlistener-mcp` package in `packages/courtlistener-mcp`, a stdio server built on `@modelcontextprotocol/sdk`.
- **Engine**: the `@reveal-codes/engine` package. It is a dependency of the Verifier and is not modified by this spec.
- **CourtListener**: the Free Law Project service at the Base_URL.
- **Base_URL**: the CourtListener API root supplied in Deps, for example `https://www.courtlistener.com/api/rest/v4`.
- **Deps**: the value passed to every Verifier function that has side effects, with fields `fetch`, `now(): Date`, `sleep(ms): Promise<void>`, `cache: CacheStore`, `token?: string`, and `baseUrl: string`.
- **CacheStore**: an interface with `get(key)`, `set(key, value, expiresAt)`, and `delete(key)` over string keys, where `expiresAt` is an ISO-8601 UTC string.
- **MemoryCacheStore**: the in-memory CacheStore used by tests.
- **FileCacheStore**: the CacheStore in `packages/verifier/src/cache-file.ts` that keeps one JSON file per key under a cache directory.
- **Full_Record**: a `CitationRecord` with `kind: "full"`.
- **Citation_Line**: the string `<volume> <reporter> <page>` for one Reporter_Member, produced with the Engine's `format` applied to a reporter value that has no pincite, court, or year.
- **Reporter_Member**: one reporter citation inside a Full_Record. A reporter value has one; a parallel value has several; a database value has none.
- **Lookup_Batch**: the ordered, de-duplicated list of Citation_Lines built from the Full_Records of one `lookup` call.
- **Lookup_Chunk**: a prefix-ordered slice of a Lookup_Batch sent as one request.
- **Request_Body**: the text sent to the citation-lookup endpoint for one Lookup_Chunk: its Citation_Lines joined by `\n`.
- **Line_Status**: the per-citation `status` field CourtListener returns for one Citation_Line: 200, 300, 404, 400, or 429.
- **Terminal_Result**: a `VerificationResult` whose status is `verified`, `ambiguous`, or `not_found`.
- **Token_Bucket**: the rate limiter with capacity 60 citations that refills at 1 citation per second, driven by `Deps.now`.
- **Shortfall**: the number of tokens a Lookup_Chunk needs minus the tokens available.
- **Wait_Until**: an ISO-8601 UTC timestamp taken from a response's `wait_until` field, or computed from its `Retry-After` header using `Deps.now`.
- **Normalised_Quote**: a quote or opinion text after the Normalisation_Pipeline of Requirement 8.
- **Opinion_Text_Fields**: the opinion fields `plain_text`, `html_with_citations`, `html`, `html_lawbox`, `html_columbia`, `xml_harvard`, in that order of preference.
- **UNRESOLVABLE_FORMS**: the exported constant describing the citation forms CourtListener does not resolve, namely Westlaw and Lexis database citations.
- **Fixture_Set**: the recorded CourtListener responses and opinion excerpts in `packages/verifier/fixtures/`.
- **Fixture_Fetch**: the `fetch` implementation returned by `createFixtureFetch()` that serves the Fixture_Set.
- **Demo_Corpus**: Ashcroft v. Iqbal, 556 U.S. 662; Bell Atlantic v. Twombly, 550 U.S. 544; Roe v. Wade, 410 U.S. 113; the fabricated citation 123 F.4th 456; one ambiguous citation; and one throttled response.
- **Verifier_Status**: the value returned by the `verifier_status` tool: Token_Bucket state and cache counts.

## Requirements

### Requirement 1: Engine records in, result map out

**User Story:** As an app developer, I want to hand the Verifier the engine's citation records and get results keyed by the engine's issue keys, so that I can pass each result to `setVerification` without translation.

#### Acceptance Criteria

1. THE Verifier SHALL export `lookup(records: readonly CitationRecord[], deps: Deps): Promise<ReadonlyMap<IssueKey, VerificationResult>>`.
2. WHEN `lookup` is called, THE Verifier SHALL consider only Full_Records.
3. THE Verifier SHALL NOT include an entry in the result map for a record whose `kind` is `short` or `other`.
4. THE Verifier SHALL NOT include a Citation_Line for a record whose `kind` is `short` or `other` in any Request_Body.
5. WHEN `lookup` returns, THE result map SHALL hold exactly one entry for each Full_Record, keyed by the record's `key`.
6. WHEN two Full_Records have identical Citation_Lines, THE Verifier SHALL give both the same result.
7. WHEN `lookup` is called with no Full_Records, THE Verifier SHALL return an empty map and make zero calls to `Deps.fetch`.
8. THE Verifier SHALL return the same result map for the same records and the same CourtListener responses (determinism).
9. THE Verifier SHALL NOT throw for network, HTTP, or response-shape failures; those become `unchecked` results under Requirement 4.

### Requirement 2: No draft text leaves the machine

**User Story:** As a self-represented litigant, I want only citation strings to be sent to CourtListener, so that my draft stays private.

#### Acceptance Criteria

1. THE Verifier SHALL build each Request_Body solely from Citation_Lines produced from Full_Records, joined by `\n`.
2. THE Verifier SHALL NOT send the document text, any quote text, any case name, any pincite, any court, or any year to CourtListener in a citation-lookup request.
3. THE Verifier SHALL list Citation_Lines in the order of the first occurrence of each in the input records, which is document order for records the Engine supplies in ascending start.
4. THE Verifier SHALL remove duplicate Citation_Lines from a Lookup_Batch, keeping the first occurrence.
5. WHEN a Full_Record holds a parallel value, THE Verifier SHALL contribute one Citation_Line per Reporter_Member.
6. WHEN a response arrives, THE Verifier SHALL map each Line_Status result back to its Citation_Line by line position within the Request_Body.
7. FOR ALL records and all document texts, every Request_Body passed to `Deps.fetch` SHALL consist solely of Citation_Lines drawn from those records joined by newlines (privacy property).
8. THE Verifier SHALL send a token only in the `Authorization` header and only to URLs beginning with the Base_URL.
9. WHERE the README exists, THE README SHALL contain a section titled "What leaves your machine" stating that only citation strings are sent to CourtListener and that draft text is sent to an LLM provider only when the author uses the assistant.

### Requirement 3: Status mapping

**User Story:** As a pro se filer, I want a citation marked verified only when CourtListener found exactly one matching case, so that a green code means something.

#### Acceptance Criteria

1. WHEN a Citation_Line has Line_Status 200, THE Verifier SHALL return `verified` with `clusterId` equal to the string form of the cluster id CourtListener returned.
2. WHEN a Citation_Line has Line_Status 300, THE Verifier SHALL return `ambiguous` with `candidates` equal to the string forms of the candidate cluster ids, in the order CourtListener returned them.
3. WHEN a Citation_Line has Line_Status 404, THE Verifier SHALL return `not_found` with no `reason`.
4. WHEN a Citation_Line has Line_Status 400, THE Verifier SHALL return `not_found` with `reason` equal to `unknown_reporter`.
5. WHEN a Citation_Line has Line_Status 429, THE Verifier SHALL return `unchecked`, with `waitUntil` set when the response supplies a Wait_Until.
6. IF a Citation_Line is absent from the response, has a Line_Status outside 200, 300, 400, 404, and 429, or has a malformed entry, THEN THE Verifier SHALL return `unchecked` for that line.
7. FOR ALL responses in the documented shape, every submitted Citation_Line SHALL receive exactly one result, and that result SHALL be `verified` only when its Line_Status was 200 (status mapping property).
8. WHEN a Line_Status is 200 and no cluster id is present, THE Verifier SHALL return `unchecked`.

### Requirement 4: Transport failures become unchecked

**User Story:** As a user, I want a network problem to leave my citations unchecked rather than wrongly passed or failed, so that the export gate stays honest.

#### Acceptance Criteria

1. IF `Deps.fetch` rejects, THEN THE Verifier SHALL return `unchecked` for every line in the affected Lookup_Chunk.
2. IF a request exceeds 15 000 ms, THEN THE Verifier SHALL abort it and return `unchecked` for every line in the affected Lookup_Chunk.
3. IF an HTTP response has status 429 or a status of 500 or higher, THEN THE Verifier SHALL apply Requirement 7 and, when retries are exhausted, return `unchecked` for every line in the Lookup_Chunk.
4. IF an HTTP response has any other non-2xx status, or a body that is not the documented shape, THEN THE Verifier SHALL return `unchecked` for every line in the Lookup_Chunk with no `waitUntil`.
5. WHEN an `unchecked` result carries `waitUntil`, THE Verifier SHALL take it from the response's `wait_until` field, or else from the `Retry-After` header converted to an ISO-8601 UTC timestamp using `Deps.now`.
6. THE Verifier SHALL NOT return `verified`, `ambiguous`, or `not_found` for a line in a Lookup_Chunk whose request failed.

### Requirement 5: Database citations are never sent

**User Story:** As a user, I want to be told why a Westlaw or Lexis citation cannot be checked, so that I do not mistake silence for a pass.

#### Acceptance Criteria

1. WHEN a Full_Record holds a database value (WL or LEXIS), THE Verifier SHALL return `unchecked` with no `waitUntil` and SHALL NOT include it in any Request_Body.
2. THE Verifier SHALL export `UNRESOLVABLE_FORMS`, a readonly value that names the Westlaw and Lexis forms and states that CourtListener does not resolve them, in plain language the UI can display.
3. FOR ALL record lists, no Request_Body SHALL contain a database citation, and every database Full_Record SHALL map to `unchecked` with no `waitUntil` (database property).

### Requirement 6: Parallel citations

**User Story:** As a user citing both `410 U.S. 113` and `93 S. Ct. 705`, I want one result for the citation, so that the engine can store one status.

#### Acceptance Criteria

1. WHEN a Full_Record holds a parallel value and at least one Reporter_Member is `verified`, THE Verifier SHALL return `verified` with the `clusterId` of the first verified Reporter_Member in member order, provided every verified member has that same `clusterId`.
2. WHEN a parallel value has verified members with different cluster ids, THE Verifier SHALL return `ambiguous` with all distinct cluster ids in member order.
3. WHEN a parallel value has no verified member, THE Verifier SHALL combine the member results by this precedence: `ambiguous` (candidates merged in member order, de-duplicated), then `unchecked`, then `not_found`.
4. WHEN a parallel value has a member that is `unchecked` and another that is `verified`, THE Verifier SHALL return the `verified` result.

### Requirement 7: Rate limiting, chunking, and retries

**User Story:** As a user on a free CourtListener account, I want the verifier to respect the throttle, so that my token is not blocked.

#### Acceptance Criteria

1. THE Token_Bucket SHALL have capacity 60 citations and SHALL refill 1 citation per second, measured with `Deps.now`.
2. WHEN a Lookup_Chunk is larger than the available tokens, THE Verifier SHALL call `Deps.sleep` with exactly the Shortfall in milliseconds at 1 000 ms per token before sending.
3. FOR ALL sequences of `lookup` calls and all clock values, no sliding 60 000 ms window of sends SHALL exceed 60 citations (token bucket property).
4. THE Verifier SHALL split a Lookup_Batch into Lookup_Chunks of at most 250 Citation_Lines and at most 64 000 characters in the Request_Body, closing a chunk at whichever cap is reached first.
5. FOR ALL Lookup_Batches, every Lookup_Chunk SHALL satisfy both caps and the concatenation of the Lookup_Chunks SHALL equal the Lookup_Batch in order (chunking property).
6. THE Verifier SHALL send one request per Lookup_Chunk.
7. IF a request returns HTTP 429 or a status of 500 or higher, THEN THE Verifier SHALL wait the `Retry-After` or `wait_until` interval, capped at 30 000 ms, and retry that chunk at most twice.
8. IF a chunk is still failing after the second retry, THEN THE Verifier SHALL return `unchecked` for its lines with `waitUntil` taken from the last response.
9. FOR ALL sequences of 429 and 5xx responses, THE Verifier SHALL call `Deps.fetch` at most three times per Lookup_Chunk, and the final results SHALL be `unchecked` carrying the last `waitUntil` (retry bound property).
10. THE Verifier SHALL NOT retry a response with any status other than 429 or 5xx.

### Requirement 8: Quote checking

**User Story:** As a user, I want to know whether a quotation really appears in the cited opinion, so that an invented quote cannot pass behind a real case.

#### Acceptance Criteria

1. THE Verifier SHALL export `checkQuote(opinionText: string, quote: string): QuoteCheckResult` as a pure function with no dependencies.
2. THE Verifier SHALL apply the Normalisation_Pipeline to both the quote and the opinion text, these steps in this order:
   1. Unicode NFC.
   2. `“` `”` to `"`, and `‘` `’` `‚` to `'`.
   3. En dash and em dash to `-`.
   4. Every ellipsis form (`…`, `...`, `. . .`) to the single character `…`.
   5. Alteration brackets `[x]` replaced by `x`.
   6. Each run of whitespace replaced by one space, with leading and trailing whitespace removed.
   7. Trailing `.`, `,`, `;`, and `:` removed from the end of the quote.
3. THE Verifier SHALL compare case-insensitively.
4. WHEN the Normalised_Quote is a substring of the Normalised opinion text, THE Verifier SHALL return `match`.
5. WHEN the Normalised_Quote is not a substring, THE Verifier SHALL return `mismatch` with `prefixLength` equal to the largest n such that the normalised form of the first n UTF-16 code units of the original quote is a substring of the Normalised opinion text, with 0 when no such n exists.
6. WHEN the Normalised_Quote is shorter than 12 characters, THE Verifier SHALL return `match` only for an exact substring and otherwise `mismatch` with `prefixLength` 0.
7. WHEN the Normalised_Quote is empty, THE Verifier SHALL return `mismatch` with `prefixLength` 0.
8. THE Verifier SHALL NOT return `unchecked` from `checkQuote`; the `unchecked` state belongs to callers that have no opinion text.
9. FOR ALL strings, applying the Normalisation_Pipeline twice SHALL equal applying it once, and the Normalised length SHALL NOT exceed the original length by more than the number of `. . .` forms replaced (idempotence and length-monotone property).
10. FOR ALL opinion texts and all substrings of at least 12 characters cut at word boundaries, `checkQuote` SHALL return `match`, including after any combination of curly quotes, extra whitespace, and an ellipsis form applied to the substring (lifted-quote property).
11. FOR ALL opinion texts and quotes taken from them, replacing one interior word with a word absent from the opinion SHALL yield `mismatch` with `prefixLength` at least the offset of the altered word and less than the length of the altered quote (altered-quote property).

### Requirement 9: Opinion text retrieval

**User Story:** As a user, I want the verifier to fetch the opinion behind a verified citation, so that quotes can be checked against it.

#### Acceptance Criteria

1. THE Verifier SHALL export `fetchOpinionText(clusterId: string, deps: Deps): Promise<string | null>`.
2. WHEN `fetchOpinionText` is called, THE Verifier SHALL request the cluster, then its opinions in the order the cluster lists them.
3. THE Verifier SHALL return the first non-empty value among the Opinion_Text_Fields, in that order, taken over the opinions in order.
4. WHEN the chosen field is not `plain_text`, THE Verifier SHALL strip tags and decode HTML entities before returning it.
5. IF no opinion has a non-empty Opinion_Text_Field, THEN THE Verifier SHALL return `null`.
6. IF a request fails or returns a non-2xx status after Requirement 7 retries, THEN THE Verifier SHALL return `null`.
7. THE Verifier SHALL cache a non-null opinion text under the key `opinion:<clusterId>` for 24 hours and SHALL NOT cache `null`.
8. WHEN an opinion text is cached for the cluster id, THE Verifier SHALL return it without calling `Deps.fetch`.

### Requirement 10: Caching

**User Story:** As a user on a rate-limited account, I want repeat checks to be free, so that editing a filing does not use my daily quota.

#### Acceptance Criteria

1. WHEN a Terminal_Result is produced for a Citation_Line, THE Verifier SHALL store it in `Deps.cache` under the Citation_Line string with an expiry 24 hours after `Deps.now`.
2. THE Verifier SHALL NOT store an `unchecked` result in `Deps.cache`.
3. WHEN a Citation_Line has an unexpired cache entry, THE Verifier SHALL use it and SHALL NOT include that line in any Request_Body.
4. WHEN every line of a `lookup` call has an unexpired cache entry, THE Verifier SHALL make zero calls to `Deps.fetch` and zero calls to `Deps.sleep` (cache-hit property).
5. FOR ALL Terminal_Results stored under a key, `get` SHALL return the stored result unchanged before the expiry and a miss at or after the expiry (cache round trip property).
6. WHEN a cache entry is expired, THE Verifier SHALL treat it as a miss and replace it on the next terminal result.
7. THE FileCacheStore SHALL keep one JSON file per key under its cache directory, write each file by writing a temporary file and renaming it over the target, and treat an unreadable or unparseable file as a miss.
8. THE MemoryCacheStore SHALL implement the same CacheStore interface with the same expiry behaviour for use in tests.
9. THE Verifier SHALL NOT write the token, an `Authorization` header, or any request header into any cache entry.

### Requirement 11: Injected dependencies

**User Story:** As a maintainer, I want every external effect injected, so that the same code runs in the app, the MCP server, and tests.

#### Acceptance Criteria

1. THE Verifier SHALL obtain the network, the clock, sleeping, the cache, the token, and the base URL only from Deps.
2. THE Verifier SHALL NOT read `process.env`, call `Date.now()` or `new Date()` without arguments, call `setTimeout` for waiting, or call a global `fetch`.
3. THE Verifier SHALL NOT log the token or any request header.
4. THE MCP_Server and the web app SHALL read `COURTLISTENER_TOKEN` from the environment and pass it into Deps.
5. WHERE no token is supplied, THE Verifier SHALL send requests without an `Authorization` header and SHALL behave identically otherwise.
6. THE Verifier SHALL send a token only to the Base_URL and SHALL NOT write it to any cache or file.

### Requirement 12: Fixtures and the Demo_Corpus

**User Story:** As a judge testing the app with no account, I want the demo to work offline, so that nothing depends on a token or the network.

#### Acceptance Criteria

1. THE Verifier SHALL hold the Fixture_Set in `packages/verifier/fixtures/` with recorded CourtListener responses for the Demo_Corpus: Ashcroft v. Iqbal, 556 U.S. 662; Bell Atlantic v. Twombly, 550 U.S. 544; Roe v. Wade, 410 U.S. 113 (each Line_Status 200); the fabricated 123 F.4th 456 (Line_Status 404); one ambiguous citation (Line_Status 300); and one throttle response (HTTP 429 with `wait_until`).
2. THE Fixture_Set SHALL hold one opinion text excerpt per real case, each long enough to contain two genuine quotations.
3. THE Verifier SHALL export `createFixtureFetch()` returning a `fetch` that serves the Fixture_Set and responds with HTTP 404 to any other request.
4. WHERE a network and a token are available during the build, THE Verifier SHALL record the Fixture_Set once from the live API.
5. WHERE no network or token is available, THE Verifier SHALL hand-author each response to the documented shape and mark it `hand_authored: true` in `fixtures/manifest.json`.
6. THE Verifier SHALL copy any hand-authored opinion excerpt from the public-domain opinion and SHALL NOT invent opinion text for a real case.
7. THE manifest SHALL record, for each fixture, its source, its recording date or `hand_authored: true`, and one line saying where it came from, as `tech.md` requires.
8. WHEN `lookup` runs on the Demo_Corpus citations through Fixture_Fetch, THE Verifier SHALL return `verified` for the three real cases, `not_found` for `123 F.4th 456`, `ambiguous` for the ambiguous citation, and `unchecked` with `waitUntil` for the throttled citation.
9. WHEN `checkQuote` runs on each genuine quotation against its excerpt, THE Verifier SHALL return `match`, and for a planted fabricated quotation SHALL return `mismatch`.
10. THE tests SHALL use Fixture_Fetch or an in-test fake and SHALL NOT call the network.

### Requirement 13: MCP server

**User Story:** As a Kiro user or any MCP client, I want to look up citations through tools, so that an agent can verify a filing without custom code.

#### Acceptance Criteria

1. THE MCP_Server SHALL serve over stdio using `@modelcontextprotocol/sdk` and SHALL expose exactly four tools: `lookup_citations`, `get_opinion_text`, `check_quote`, and `verifier_status`.
2. WHEN `lookup_citations({ citations: string[] })` is called, THE MCP_Server SHALL extract citations from the strings with the Engine, verify the Full_Records with the Verifier, and return for each citation its text, its offsets, and its `VerificationResult`.
3. WHEN `get_opinion_text({ clusterId })` is called, THE MCP_Server SHALL return the result of `fetchOpinionText`, or a plain-language message when it is `null`.
4. WHEN `check_quote({ clusterId, quote })` is called, THE MCP_Server SHALL fetch the opinion text and return `checkQuote`'s result, or `unchecked` with a reason when the opinion text is unavailable.
5. WHEN `verifier_status()` is called, THE MCP_Server SHALL return the Token_Bucket state (available tokens and capacity) and the number of cached citation and opinion entries.
6. THE MCP_Server tool handlers SHALL be thin wrappers over Verifier functions and SHALL hold no verification logic.
7. THE MCP_Server SHALL read `COURTLISTENER_TOKEN`, `REVEAL_CODES_CACHE_DIR` (default `~/.reveal-codes/cache`), and `REVEAL_CODES_FIXTURES_ONLY` from the environment.
8. WHERE `REVEAL_CODES_FIXTURES_ONLY` is `1`, THE MCP_Server SHALL serve every request from Fixture_Fetch and SHALL make no network call.
9. IF a tool receives invalid arguments, THEN THE MCP_Server SHALL return an MCP tool error naming the invalid argument.
10. THE MCP_Server SHALL NOT include the token in any tool result, log line, or error message.
11. THE root `pnpm mcp` script SHALL start the MCP_Server on stdio.

### Requirement 14: Kiro registration and proof

**User Story:** As a hackathon judge, I want evidence that the MCP server is wired into Kiro and works, so that the depth of Kiro usage is visible.

#### Acceptance Criteria

1. THE workspace SHALL register the server in `.kiro/settings/mcp.json` under the name `courtlistener` with command `pnpm`, args `["mcp"]`, env `REVEAL_CODES_FIXTURES_ONLY=1`, and `autoApprove` for `lookup_citations` and `verifier_status`.
2. WHEN `mcp.json` is edited, THE edit SHALL preserve all existing entries.
3. THE file `docs/KIRO_USAGE.md` SHALL gain a row for the `courtlistener` server and each hook this spec adds, with file paths.
4. WHEN the final task runs, THE task SHALL call `lookup_citations` through the registered MCP tool on the demo motion's citations and paste the result into the task's completion notes.

### Requirement 15: Hooks, test project, and module limits

**User Story:** As a maintainer, I want tests to run on save and modules to stay small, so that the repository stays navigable.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/hooks/verifier-tests-on-save.json` as a second hook beside `engine-tests-on-save.json`, with the matcher `packages/verifier/(src|test)/.*\.ts$` and a command that runs the `verifier` Vitest project.
2. THE root `vitest.config.ts` SHALL include the `verifier` project and the `courtlistener-mcp` project.
3. THE Verifier and MCP_Server source modules SHALL each be at most 300 lines and each function at most 40 lines, per `tech.md`.
4. THE Verifier SHALL contain no `any` type, no default export, and no `try/catch` that swallows an error in tests.
5. THE `.env.example` SHALL list `REVEAL_CODES_CACHE_DIR` and `REVEAL_CODES_FIXTURES_ONLY` with a comment each, and SHALL extend the `COURTLISTENER_TOKEN` comment to say the token is read only by the MCP server and the web app.

### Requirement 16: Property tests

**User Story:** As a maintainer, I want properties only where they prove something users depend on, so that the test suite stays lean and meaningful.

#### Acceptance Criteria

1. THE Verifier SHALL have property tests, each in a `<module>.properties.test.ts` file with a `// Property N` comment, for exactly these claims: status mapping (Requirement 3.7), privacy of request bodies (2.7), token bucket (7.3), chunking (7.5), cache round trip (10.5), cache hits (10.4), quote idempotence and length (8.9), lifted quote (8.10), altered quote (8.11), retry bound (7.9), database forms (5.3), and short and other records (Requirement 1, criteria 3 and 4).
2. THE Verifier SHALL cover every other acceptance criterion with example tests against Fixture_Fetch or in-test fakes.
3. THE property tests SHALL use `numRuns` of at least 200 locally and 500 in CI, and SHALL assert a relationship between input and output rather than absence of a throw.
4. THE property tests SHALL reuse the shared arbitraries in `packages/engine/src/testing/arbitraries.ts` where they exist and SHALL add verifier arbitraries (response shapes, clocks, response sequences) under `packages/verifier/test/`.

### Requirement 17: Documentation and steering alignment

**User Story:** As a maintainer, I want the written contract to match the code, so that nobody relies on a request shape the verifier no longer sends.

#### Acceptance Criteria

1. THE README SHALL contain the section "What leaves your machine" described in Requirement 2, criterion 9.
2. WHEN this spec lands, THE file `.kiro/steering/citations.md` SHALL be updated so that its CourtListener lookup description says the request body is the formatted citation strings joined by newlines, and its design-consequences paragraph says one request per chunk, not one request for the whole document.
3. THE `BUILD_LOG.md` SHALL gain a dated entry for this spec naming anything Kiro got wrong and how it was fixed.

## Known limitations

Standing rule (carried over from the provenance-engine spec, user decision): anything that affects only malformed input or a rare citation style is recorded here as one line, with no spec change and no stop.

- None yet. Design and implementation record entries here as L1, L2, and so on.

## Notes for the user

- **Privacy decision overrides `citations.md`.** The steering file says to send the whole document `text`. Requirement 2 sends only formatted citation strings, as you decided. Requirement 17.2 updates the steering file in the final group; I did not edit it in this phase.
- **Citation_Line drops pincite, court, and year.** CourtListener resolves on volume, reporter, and page, and leaving the rest out sends less. De-duplication is therefore by `<volume> <reporter> <page>`, which is also the cache key. Change this if you want the full formatted citation as the key.
- **Parallel precedence (Requirement 6.3) is mine.** You fixed the `verified` and `ambiguous` rules. For the remaining cases I chose ambiguous, then unchecked, then not_found, so that an unchecked member never turns into a failure. Confirm or change.
- **Request timeout of 15 000 ms** (Requirement 4.2) was not specified; I picked it.
- **`checkQuote` never returns `unchecked`.** The `unchecked` state is for callers with no opinion text; the MCP `check_quote` tool returns it in that case.
- **`verifier_status` cache counts** are counted by key prefix (`opinion:` and citation lines), which needs the CacheStore to list keys or the Verifier to keep counters; the design decides which.
