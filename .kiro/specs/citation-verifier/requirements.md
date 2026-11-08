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
- **Deps**: the value passed to every Verifier function that has side effects, with fields `fetch`, `now(): Date`, `sleep(ms, signal?: AbortSignal): Promise<void>`, `cache: CacheStore`, `token?: string`, `baseUrl: string`, and `state`. Callers build it with the exported `createDeps(init)`, where `init` supplies the six caller-visible fields and `createDeps` creates `state`.
- **Deps_State**: the value of `Deps.state`, created by `createDeps`; it holds the Token_Bucket, the sliding-window log of Requirement 7, and the Status_Counters. The Verifier keeps no mutable module-level state.
- **CacheStore**: an interface with `get(key)`, `set(key, value, expiresAt)`, and `delete(key)` over string keys, where `expiresAt` is an ISO-8601 UTC string.
- **MemoryCacheStore**: the in-memory CacheStore used by tests.
- **FileCacheStore**: the CacheStore in `packages/verifier/src/cache-file.ts` that keeps one JSON file per key under a cache directory.
- **Full_Record**: a `CitationRecord` with `kind: "full"`.
- **Citation_Line**: the string `<volume> <reporter> <page>` for one Reporter_Member, produced with the Engine's `format` applied to a reporter value that has no pincite, court, or year.
- **Reporter_Member**: one reporter citation inside a Full_Record. A reporter value has one; a parallel value has several; a database value has none.
- **Lookup_Batch**: the ordered, de-duplicated list of Citation_Lines built from the Full_Records of one `lookup` call.
- **Lookup_Chunk**: a prefix-ordered slice of a Lookup_Batch holding at most 60 Citation_Lines and at most 64 000 characters in its Request_Body, sent as exactly one request per attempt.
- **Request_Body**: the text sent to the citation-lookup endpoint for one Lookup_Chunk: its Citation_Lines joined by `\n`.
- **Line_Status**: the per-citation `status` field CourtListener returns for one Citation_Line: 200, 300, 404, 400, or 429.
- **Terminal_Result**: a `VerificationResult` whose status is `verified`, `ambiguous`, or `not_found`.
- **Token_Bucket**: the rate limiter with capacity 60 citations that refills at 1 citation per second, driven by `Deps.now`, held in Deps_State.
- **Window_Log**: the record in Deps_State of the dispatch time and line count of every request dispatched in the last 60 000 ms, used for the sliding-window wait of Requirement 7.
- **Ellipsis_Segment**: one non-empty piece of a Normalised_Quote obtained by splitting it on `…` and trimming surrounding spaces from each piece (Requirement 8).
- **Shortfall**: the number of tokens a Lookup_Chunk needs minus the tokens available.
- **Wait_Until**: an ISO-8601 UTC timestamp taken from a response's `wait_until` field, or computed from its `Retry-After` header using `Deps.now`.
- **Normalised_Quote**: a quote or opinion text after the Normalisation_Pipeline of Requirement 8; for a quote this includes the trailing-punctuation removal of Requirement 8, criterion 3, except for the prefixes of a multi-segment quote that Requirement 8, criterion 15 tests.
- **Opinion_Text_Fields**: the opinion fields `plain_text`, `html_with_citations`, `html`, `html_lawbox`, `html_columbia`, `xml_harvard`, in that order of preference.
- **UNRESOLVABLE_FORMS**: the exported constant describing the citation forms CourtListener does not resolve, namely Westlaw and Lexis database citations.
- **Fixture_Set**: the recorded CourtListener responses and opinion excerpts in `packages/verifier/fixtures/`.
- **Fixture_Fetch**: the `fetch` implementation returned by `createFixtureFetch()` that serves the Fixture_Set.
- **Demo_Corpus**: the citations of the demo motion `packages/engine/fixtures/demo-motion.txt` (used by `packages/engine/test/demo.test.ts`): Ashcroft v. Iqbal, 556 U.S. 662, and Haines v. Kerner, 404 U.S. 519 (both real); the fabricated 1047 F.3d 212, 1012 F. Supp. 2d 88, and 912 F.4th 33; plus two synthetic lines that are not in the motion: one ambiguous line (`1 Hill 150`) and one throttled line (`576 U.S. 644`).
- **Status_Counters**: the counts of cache hits, cache misses, and cache writes since the `Deps` value was created, kept in Deps_State as one set covering both citation entries and opinion entries.
- **Verifier_Status**: the value returned by the exported `verifierStatus` function and by the `verifier_status` tool: the Token_Bucket state (available tokens and capacity) and the Status_Counters.

## Requirements

### Requirement 1: Engine records in, result map out

**User Story:** As an app developer, I want to hand the Verifier the engine's citation records and get results keyed by the engine's issue keys, so that I can pass each result to `setVerification` without translation.

#### Acceptance Criteria

1. THE Verifier SHALL export `lookup(records: readonly CitationRecord[], deps: Deps): Promise<ReadonlyMap<IssueKey, VerificationResult>>`.
2. WHEN `lookup` is called, THE Verifier SHALL consider only Full_Records.
3. THE Verifier SHALL NOT include an entry in the result map for a record whose `kind` is `short` or `other`.
4. THE Verifier SHALL NOT include a Citation_Line for a record whose `kind` is `short` or `other` in any Request_Body.
5. WHEN `lookup` resolves, THE Verifier SHALL return a result map holding exactly one entry for each Full_Record, keyed by the record's `key`, and no entries for any other key.
6. WHEN two Full_Records have identical Citation_Lines, THE Verifier SHALL give both the same result.
7. WHEN `lookup` is called with zero Full_Records, THE Verifier SHALL return an empty map and make zero calls to `Deps.fetch`.
8. WHEN `lookup` is called twice with equal records and identical CourtListener responses, THE Verifier SHALL return result maps with equal keys and deeply equal values (determinism).
9. IF a call to `Deps.fetch` rejects, returns a non-success HTTP response, or returns a body that does not match the expected response shape, THEN THE Verifier SHALL resolve `lookup` without throwing and SHALL give each affected Full_Record a result with status `unchecked` as specified in Requirement 4.
10. IF a failure affects only some Lookup_Chunks, THEN THE Verifier SHALL keep the results of unaffected Full_Records unchanged.

### Requirement 2: No draft text leaves the machine

**User Story:** As a self-represented litigant, I want only citation strings to be sent to CourtListener, so that my draft stays private.

#### Acceptance Criteria

1. WHEN THE Verifier builds a Request_Body for a citation-lookup request, THE Verifier SHALL compose it solely from Citation_Lines produced from Full_Records, joined by `\n`, with no leading or trailing `\n`.
2. THE Verifier SHALL NOT include the document text, any quote text, any case name, any pincite, any court, or any year in any citation-lookup request, including the Request_Body, URL, query string, and headers other than `Authorization`.
3. THE Verifier SHALL list Citation_Lines in order of the first occurrence of each in the input records, which is document order for records the Engine supplies in ascending start.
4. WHEN a Lookup_Batch contains identical Citation_Lines, THE Verifier SHALL keep the first occurrence and remove every later duplicate.
5. WHEN a Full_Record holds a parallel value, THE Verifier SHALL contribute exactly one Citation_Line per Reporter_Member, in the order the Reporter_Members appear in the record.
6. WHEN a response arrives, THE Verifier SHALL map each Line_Status result to its Citation_Line by zero-based line position within the Request_Body.
7. IF a response contains a different number of Line_Status results than the Request_Body has lines, THEN THE Verifier SHALL assign no verification status from that response to any Citation_Line in that request and SHALL mark each of those Citation_Lines `unchecked` with no `waitUntil`.
8. FOR ALL records and all document texts, every Request_Body passed to `Deps.fetch` SHALL consist solely of Citation_Lines drawn from those records joined by `\n` (privacy property).
9. WHEN THE Verifier is configured with a token, THE Verifier SHALL send the token only in the `Authorization` header and only on requests whose URL begins with the Base_URL.
10. IF a request URL does not begin with the Base_URL, THEN THE Verifier SHALL NOT attach the token to that request.
11. WHERE the README exists, THE README SHALL contain a section titled "What leaves your machine" stating that only citation strings are sent to CourtListener and that draft text is sent to an LLM provider only when the author uses the assistant.

### Requirement 3: Status mapping

**User Story:** As a pro se filer, I want a citation marked verified only when CourtListener found exactly one matching case, so that a green code means something.

#### Acceptance Criteria

1. WHEN a Citation_Line has Line_Status 200 and exactly one distinct cluster id is present, THE Verifier SHALL return `verified` with `clusterId` equal to the string form of that cluster id, and THE Verifier SHALL return `verified` in no other case.
2. WHEN a Citation_Line has Line_Status 300, or Line_Status 200 carrying two or more distinct cluster ids (CourtListener documents that several decisions can share one printed page), and the response lists two or more distinct candidate cluster ids, THE Verifier SHALL return `ambiguous` with `candidates` equal to the string forms of those cluster ids, de-duplicated, in the order CourtListener returned them.
3. WHEN a Citation_Line has Line_Status 404, THE Verifier SHALL return `not_found` with no `reason`.
4. WHEN a Citation_Line has Line_Status 400, THE Verifier SHALL return `not_found` with `reason` equal to `unknown_reporter`.
5. WHEN a Citation_Line has Line_Status 429, THE Verifier SHALL return `unchecked` with `waitUntil` set to the Wait_Until value if the response supplies one, and with `waitUntil` absent otherwise.
6. IF a Citation_Line is absent from the response, has a Line_Status outside 200, 300, 400, 404, and 429, or has a malformed entry, THEN THE Verifier SHALL return `unchecked` for that line and SHALL NOT throw.
7. IF a Citation_Line has Line_Status 200 and no cluster id is present, or has Line_Status 300 and fewer than two distinct candidate cluster ids are present, THEN THE Verifier SHALL return `unchecked` for that line.
8. FOR ALL responses in the documented shape, every submitted Citation_Line SHALL receive exactly one result, and that result SHALL be `verified` only when its Line_Status was 200 and it carried exactly one distinct cluster id (status mapping property).

### Requirement 4: Transport failures become unchecked

**User Story:** As a user, I want a network problem to leave my citations unchecked rather than wrongly passed or failed, so that the export gate stays honest.

#### Acceptance Criteria

1. IF `Deps.fetch` rejects before a response is received, THEN THE Verifier SHALL return `unchecked` for every line in the affected request, with no `waitUntil`, and SHALL NOT alter the results of any other request.
2. IF a request has received no response 15 000 ms after it was issued, as measured by racing `Deps.fetch` against `Deps.sleep(15000, signal)` and aborting the losing operation through the `AbortSignal`, THEN THE Verifier SHALL abort the request and return `unchecked` for every line in the affected request, with no `waitUntil`.
3. IF an HTTP response has status 429 or a status from 500 to 599, THEN THE Verifier SHALL apply Requirement 7 and, WHEN retries are exhausted, SHALL return `unchecked` for every line in the request.
4. IF an HTTP response has any other non-2xx status, or a 2xx response whose body is not valid JSON of the documented shape, THEN THE Verifier SHALL return `unchecked` for every line in the request with no `waitUntil`.
5. WHEN an `unchecked` result is produced from a 429 or 5xx response, THE Verifier SHALL set `waitUntil` from the response's `wait_until` field if present and valid, and otherwise from the `Retry-After` header, converted to an ISO-8601 UTC timestamp using `Deps.now`.
6. IF neither `wait_until` nor `Retry-After` is present, or the value present cannot be parsed as a timestamp or as a non-negative integer number of seconds, THEN THE Verifier SHALL omit `waitUntil` from the `unchecked` result.
7. IF a request fails under criteria 1 to 4, THEN THE Verifier SHALL NOT return `verified`, `ambiguous`, or `not_found` for any line in that request.

### Requirement 5: Database citations are never sent

**User Story:** As a user, I want to be told why a Westlaw or Lexis citation cannot be checked, so that I do not mistake silence for a pass.

#### Acceptance Criteria

1. WHEN a Full_Record holds a database value (WL or LEXIS), THE Verifier SHALL return a result with status `unchecked` and no `waitUntil` field, and SHALL NOT include that Full_Record's citation string in any Request_Body.
2. THE Verifier SHALL export `UNRESOLVABLE_FORMS` as a readonly value containing one entry each for the Westlaw (WL) form and the Lexis (LEXIS) form, where each entry is a non-empty string of at most 200 characters that names the form and states that CourtListener does not resolve it.
3. WHEN a record list contains both database and non-database Full_Records, THE Verifier SHALL include every non-database Full_Record in Request_Bodies exactly as it would without the database Full_Records.
4. IF a record list contains only database Full_Records, THEN THE Verifier SHALL make zero calls to `Deps.fetch` and SHALL return one `unchecked` result per record.
5. FOR ALL record lists, no Request_Body SHALL contain a database citation, and every database Full_Record SHALL map to `unchecked` with no `waitUntil` (database property).

### Requirement 6: Parallel citations

**User Story:** As a user citing both `410 U.S. 113` and `93 S. Ct. 705`, I want one result for the citation, so that the engine can store one status.

#### Acceptance Criteria

1. WHEN a Full_Record holds a parallel value with at least one Reporter_Member that is `verified` and every `verified` Reporter_Member has the same `clusterId`, THE Verifier SHALL return `verified` with the `clusterId` of the first `verified` Reporter_Member in member order.
2. WHEN a Full_Record holds a parallel value whose `verified` Reporter_Members have two or more distinct `clusterId` values, THE Verifier SHALL return `ambiguous` with the distinct `clusterId` values listed once each, in the order of their first appearance in member order.
3. WHEN a Full_Record holds a parallel value with no `verified` Reporter_Member and at least one `ambiguous` Reporter_Member, THE Verifier SHALL return `ambiguous` with the candidate cluster ids of all `ambiguous` members merged in member order and de-duplicated, keeping the first occurrence of each id.
4. WHEN a Full_Record holds a parallel value with no `verified` and no `ambiguous` Reporter_Member and at least one `unchecked` Reporter_Member, THE Verifier SHALL return `unchecked`.
5. WHEN a Full_Record holds a parallel value in which every Reporter_Member is `not_found`, THE Verifier SHALL return `not_found`.
6. WHEN a Full_Record holds a parallel value with at least one `verified` Reporter_Member, THE Verifier SHALL ignore the `unchecked`, `not_found`, and `ambiguous` results of the other Reporter_Members, except that a `verified` Reporter_Member with a different `clusterId` is handled by criterion 2.
7. IF a Full_Record holds a parallel value with zero Reporter_Members, THEN THE Verifier SHALL return `unchecked`.

### Requirement 7: Rate limiting, chunking, and retries

**User Story:** As a user on a free CourtListener account, I want the verifier to respect the throttle, so that my token is not blocked.

#### Acceptance Criteria

1. THE Token_Bucket SHALL have an integer capacity of 60 citations, SHALL start full, and SHALL refill 1 citation per 1 000 ms elapsed as measured by `Deps.now`, retaining any partial-token elapsed milliseconds and never exceeding 60 tokens.
2. THE Verifier SHALL split a Lookup_Batch into Lookup_Chunks of at most 60 Citation_Lines and at most 64 000 characters in the Request_Body, closing a chunk at whichever cap is reached first; a single Citation_Line that alone exceeds 64 000 characters SHALL form its own chunk and be returned as `unchecked`, without being sent.
3. WHEN a Lookup_Chunk of n lines is about to be dispatched, fewer than n whole tokens are available, and the sliding-window wait of criterion 12 is not larger than the Token_Bucket wait, THE Verifier SHALL call `Deps.sleep` exactly once with the Shortfall × 1 000 − (retained partial-token milliseconds), in milliseconds, and SHALL then deduct n tokens immediately before calling `Deps.fetch`.
4. WHEN a Lookup_Chunk is dispatched as a retry attempt, THE Verifier SHALL deduct tokens for its lines again, as for a first attempt, before calling `Deps.fetch`.
5. FOR ALL sequences of `lookup` calls and all `Deps.now` values, the total Citation_Lines passed to `Deps.fetch` (including retries) within any 60 000 ms window, closed at its start and open at its end, SHALL NOT exceed 60 (token bucket property).
6. THE Verifier SHALL send each Lookup_Chunk as exactly one request per attempt.
7. FOR ALL Lookup_Batches, every Lookup_Chunk SHALL hold at most 60 Citation_Lines and at most 64 000 characters in its Request_Body, and the concatenation of the Lookup_Chunks SHALL equal the de-duplicated input Lookup_Batch in order (chunking property).
8. IF a request returns HTTP 429 or a status of 500 or higher, THEN THE Verifier SHALL call `Deps.sleep` with the `Retry-After` interval (seconds converted to ms) or the interval from `wait_until` to `Deps.now` (minimum 0 ms), using the larger when both are present and 1 000 ms when neither is present, capped at 30 000 ms, and SHALL retry that Lookup_Chunk at most twice.
9. IF a Lookup_Chunk is still failing after the second retry, THEN THE Verifier SHALL return `unchecked` for its lines with `waitUntil` taken from the last response, SHALL keep results already obtained for other Lookup_Chunks, and SHALL continue with the remaining Lookup_Chunks.
10. FOR ALL sequences of 429 and 5xx responses, THE Verifier SHALL call `Deps.fetch` at most three times per Lookup_Chunk, and the final results for an exhausted Lookup_Chunk SHALL be `unchecked` carrying the last `waitUntil` (retry bound property).
11. THE Verifier SHALL NOT retry a response with any status other than 429 or 5xx.
12. THE Verifier SHALL, before dispatching a Lookup_Chunk of n lines (first attempt or retry) at time t, compute the sliding-window wait as the smallest w ≥ 0 ms such that, for every 60 000 ms window that is closed at its start and open at its end and contains t + w, the lines already recorded in the Window_Log for that window plus n do not exceed 60; and SHALL record the dispatch (time and n) in the Window_Log immediately before calling `Deps.fetch`.
13. WHEN a Lookup_Chunk is about to be dispatched, THE Verifier SHALL wait for the larger of the Token_Bucket wait (criterion 3) and the sliding-window wait (criterion 12), SHALL do so with exactly one call to `Deps.sleep` when that larger wait is greater than 0 ms, and SHALL leave the Token_Bucket arithmetic of criteria 1 to 4 unchanged. The Window_Log is what makes criterion 5 hold, because a capacity-60 bucket refilling 1 per second alone would allow 90 lines in one 60 000 ms window.

### Requirement 8: Quote checking

**User Story:** As a user, I want to know whether a quotation really appears in the cited opinion, so that an invented quote cannot pass behind a real case.

#### Acceptance Criteria

1. THE Verifier SHALL export `checkQuote(opinionText: string, quote: string): QuoteCheckResult` as a pure function with no dependencies, where `QuoteCheckResult` is the engine's type (`match`, `mismatch` with `prefixLength`, or `unchecked`).
2. THE Verifier SHALL define the Normalisation_Pipeline as the following steps, applied in this order, to both the quote and the opinion text:
   1. Unicode NFC.
   2. `“` `”` to `"`, and `‘` `’` `‚` to `'`.
   3. En dash and em dash to `-`.
   4. Each alteration bracket pair `[x]` replaced by `x`, innermost pair first and repeated until no bracket pair remains.
   5. Every ellipsis form, namely `…`, `...`, and three dots separated from each other by any run of Unicode White_Space (for example `. . .`), replaced by the single character `…`.
   6. Each run of Unicode White_Space characters replaced by one space, with leading and trailing whitespace removed.
   7. Unicode NFC again, so that removing brackets cannot leave a combining mark uncomposed.
   Brackets are removed before ellipsis forms are folded because bracket removal can expose dots (for example `.[.].`); folding first would need a second pass and break idempotence (criterion 10).
3. WHEN normalising the quote, THE Verifier SHALL additionally, after step 7, repeatedly remove a trailing `.`, `,`, `;`, or `:` together with any whitespace left before it, until the quote ends in none of them.
4. THE Verifier SHALL compare the Normalised_Quote and the Normalised opinion text case-insensitively.
5. THE Verifier SHALL split the Normalised_Quote on `…` and trim surrounding spaces from each piece, and SHALL ignore empty pieces, so that a leading or trailing `…` only means that the quote starts or ends mid-sentence; the remaining pieces, in order, are the Ellipsis_Segments, and a quote containing no `…` has exactly one.
6. WHEN the Normalised_Quote has exactly one Ellipsis_Segment, THE Verifier SHALL return `match` if and only if that segment is a substring of the Normalised opinion text, subject to criterion 7.
7. WHEN the Normalised_Quote has exactly one Ellipsis_Segment of fewer than 12 characters, THE Verifier SHALL return `match` only for an exact (case-insensitive) substring and otherwise `mismatch` with `prefixLength` 0.
8. WHEN the Normalised_Quote has no Ellipsis_Segment, THE Verifier SHALL return `mismatch` with `prefixLength` 0.
9. THE Verifier SHALL NOT return `unchecked` from `checkQuote`; the `unchecked` state belongs to callers that have no opinion text.
10. FOR ALL strings s, THE Normalisation_Pipeline SHALL be idempotent (normalising twice equals normalising once), including the quote-only trailing-punctuation removal of criterion 3.
11. FOR ALL strings s, steps 2 through 6 SHALL NOT increase the UTF-16 length of their input, and the length of the full pipeline output SHALL be at most the length of NFC(s). Steps 1 and 7 are excluded from the bound because NFC can lengthen some strings (for example U+0958 becomes two code points).
12. FOR ALL opinion texts that contain no ellipsis form, and all substrings of at least 12 characters cut at word boundaries, `checkQuote` SHALL return `match`, including after any combination of curly quotes and extra whitespace applied to the substring; and FOR ALL such opinion texts and all two or three in-order, non-overlapping substrings cut at word boundaries, each of at least 12 characters after trailing `.`, `,`, `;`, and `:` and any whitespace before them are removed from that substring (so that a dot absorbed by an adjacent ellipsis form cannot shorten a substring below 12 characters), a quote formed by joining those substrings with any ellipsis form (`…`, `...`, `. . .`) SHALL yield `match`, including after any combination of curly quotes and extra whitespace (lifted-quote property).
13. FOR ALL opinion texts and quotes taken from them as one contiguous substring, replacing one interior word with a word absent from the opinion SHALL yield `mismatch` with `prefixLength` at least the offset of the altered word and less than the length of the altered quote (altered-quote property).
14. WHEN the Normalised_Quote has two or more Ellipsis_Segments, THE Verifier SHALL return `match` if and only if every segment appears in the Normalised opinion text in the order of the quote, non-overlapping, where the search for each segment starts at the end of the match of the previous segment, and every segment is at least 12 characters long except that the first segment and the last segment may be shorter.
15. IF the Normalised_Quote has two or more Ellipsis_Segments and does not satisfy criterion 14, THEN THE Verifier SHALL return `mismatch` with `prefixLength` equal to the largest n, 0 ≤ n < the UTF-16 length of the original quote, such that the normalised form of the first n UTF-16 code units of the original quote (steps 1 to 7 only, without criterion 3) has at least one Ellipsis_Segment and satisfies criterion 14, except that its last Ellipsis_Segment is exempt from the 12-character minimum and only needs to appear in order after the previous match; and with 0 when no such n exists. Criterion 3 therefore applies to the quote as a whole before it is split into Ellipsis_Segments, but not to the prefixes tested here. A short interior segment becomes exempt as the last segment of a prefix, so `prefixLength` can extend to the end of the ellipsis form that follows such a segment. For a quote with one Ellipsis_Segment, the prefix is instead normalised with criterion 3, and the rule is the largest-n rule: the largest n, 0 ≤ n < the quote length, such that the normalised form of the first n code units is a non-empty substring of the Normalised opinion text, with 0 when no such n exists, subject to criterion 7.
16. THE Verifier SHALL cover with an example test (not a property) a quote whose segments each appear in the opinion but in the wrong order, and SHALL expect `mismatch`; and SHALL cover a quote whose middle segment is shorter than 12 characters, and SHALL expect `mismatch`.

### Requirement 9: Opinion text retrieval

**User Story:** As a user, I want the verifier to fetch the opinion behind a verified citation, so that quotes can be checked against it.

#### Acceptance Criteria

1. THE Verifier SHALL export `fetchOpinionText(clusterId: string, deps: Deps): Promise<string | null>`.
2. WHEN `fetchOpinionText` is called and no opinion text is cached for the cluster id, THE Verifier SHALL request the cluster, then request each of its opinions sequentially in the order the cluster lists them, stopping at the first opinion that yields text.
3. THE Verifier SHALL treat the opinion list as the outer loop and the Opinion_Text_Fields as the inner loop: for each opinion in cluster order, THE Verifier SHALL select the first non-empty Opinion_Text_Field in the preference order defined by Opinion_Text_Fields, and SHALL return the text from the first opinion for which such a field exists. A field is empty if it is absent, `null`, or contains only whitespace characters.
4. IF an earlier opinion has only empty Opinion_Text_Fields and a later opinion has a non-empty one, THEN THE Verifier SHALL return the later opinion's text.
5. IF an earlier opinion has a lower-preference non-empty field and a later opinion has a higher-preference non-empty field, THEN THE Verifier SHALL return the earlier opinion's lower-preference field.
6. WHEN the selected field is not `plain_text`, THE Verifier SHALL strip HTML tags and decode HTML entities before returning the text.
7. IF no opinion in the cluster has a non-empty Opinion_Text_Field, or the cluster lists zero opinions, THEN THE Verifier SHALL return `null`.
8. IF a request fails or returns a non-2xx status after the Requirement 7 retries are exhausted, THEN THE Verifier SHALL return `null` without throwing and without caching.
9. WHEN `fetchOpinionText` returns a non-null text, THE Verifier SHALL cache it under the key `opinion:<clusterId>` for 24 hours; THE Verifier SHALL NOT cache `null`.
10. WHEN an opinion text is cached for the cluster id, THE Verifier SHALL return it without calling `Deps.fetch`.

### Requirement 10: Caching

**User Story:** As a user on a rate-limited account, I want repeat checks to be free, so that editing a filing does not use my daily quota.

#### Acceptance Criteria

1. WHEN a Terminal_Result is produced for a Citation_Line, THE Verifier SHALL call `CacheStore.set` with the Citation_Line string as key, the Terminal_Result as value, and an expiry equal to `Deps.now()` plus 86 400 000 ms (24 hours) as an ISO-8601 UTC string.
2. IF a result is `unchecked`, THEN THE Verifier SHALL NOT call `CacheStore.set` for it, and a later `lookup` for the same Citation_Line SHALL be treated as a cache miss.
3. WHEN `CacheStore.get(key)` is called, THE CacheStore SHALL return the stored value if the current time is strictly before the stored expiry, and a miss otherwise. Each CacheStore SHALL take its clock as an injected `now(): Date` at construction, SHALL NOT read the system clock directly, and the clock supplied to it SHALL be `Deps.now`.
4. WHEN a Citation_Line has an unexpired cache entry, THE Verifier SHALL use the cached result and SHALL NOT include that line in any Request_Body.
5. WHEN every line of a `lookup` call has an unexpired cache entry, THE Verifier SHALL make zero calls to `Deps.fetch` and zero calls to `Deps.sleep` (cache-hit property).
6. FOR ALL Terminal_Results stored under a key, `get` SHALL return a value deeply equal to the stored result at any time before the expiry, and a miss at or after the expiry (cache round trip property).
7. WHEN a cache entry is expired, THE Verifier SHALL treat it as a miss and, on the next Terminal_Result for that key, SHALL overwrite the entry with a new expiry computed per criterion 1.
8. THE FileCacheStore SHALL map each key to a filesystem-safe file name by a deterministic, collision-free encoding, so that two distinct keys never share a file and a key containing path separators, spaces, or colons never writes outside the cache directory.
9. THE FileCacheStore SHALL keep one JSON file per key under its cache directory, SHALL write each file by writing a temporary file in the same directory and renaming it over the target, and SHALL treat a missing, unreadable, or unparseable file as a miss without throwing.
10. IF a write by FileCacheStore fails, THEN THE FileCacheStore SHALL leave any existing entry for that key unchanged, SHALL remove its temporary file, and THE Verifier SHALL still return the Terminal_Result to the caller.
11. THE MemoryCacheStore SHALL implement the same CacheStore interface and the same expiry behaviour as criterion 3, so that the same property tests run against both stores.
12. THE Verifier SHALL NOT write the token, an `Authorization` header, or any request header into any cache entry or cache file name.
13. THE Verifier SHALL keep the Status_Counters in `Deps.state`, incrementing the hit counter for each `CacheStore.get` that returns a value, the miss counter for each `CacheStore.get` that returns a miss, and the write counter for each `CacheStore.set` call, for both citation entries and opinion entries.
14. THE Verifier SHALL export `verifierStatus(deps: Deps)` returning the Token_Bucket state (available whole tokens computed with `Deps.now`, and capacity) and the Status_Counters, both read from `deps.state`, and SHALL NOT require the CacheStore to list its keys.

### Requirement 11: Injected dependencies

**User Story:** As a maintainer, I want every external effect injected, so that the same code runs in the app, the MCP server, and tests.

#### Acceptance Criteria

1. THE Verifier SHALL obtain the network (`fetch`), the clock, sleeping, the cache, the token, and the Base_URL only from the Deps argument supplied by its caller.
2. THE Verifier SHALL NOT read `process.env`, call `Date.now()`, call `new Date()` without arguments, call `setTimeout` for waiting, or reference the global `fetch` anywhere under `packages/verifier/src/`.
3. WHEN the test suite runs, THE Verifier test suite SHALL include a static check that scans every `.ts` file under `packages/verifier/src/` and fails with the file path and line number of each occurrence of `process.env`, `Date.now(`, `new Date()`, `setTimeout(`, or a `fetch(` call not made through Deps.
4. THE Verifier SHALL NOT write the token value or the value of any request header to any log output, error value, or thrown error message.
5. THE MCP_Server and the web app SHALL each read `COURTLISTENER_TOKEN` from the environment at startup and pass it into Deps, and no other module SHALL read it.
6. WHERE no token is supplied (undefined or empty string), THE Verifier SHALL send each request without an `Authorization` header, and for identical Deps and inputs SHALL return the same results as it does with a token, apart from the rate limit applied by CourtListener.
7. WHERE a token is supplied, THE Verifier SHALL send it only on requests whose URL begins with the Base_URL and SHALL NOT include it in any cache key, cache entry, fixture, or file.
8. THE Verifier SHALL export `createDeps(init)`, which returns a `Deps` value holding the six fields of `init` and a freshly created `state` (Token_Bucket full, empty Window_Log, zero Status_Counters), so that two `Deps` values created by two calls share no state.
9. THE Verifier SHALL keep no mutable module-level state under `packages/verifier/src/`; every bucket, log, and counter SHALL live in `Deps.state`.
10. THE Verifier SHALL pass an `AbortSignal` as the optional second argument of `Deps.sleep` wherever it races a sleep against another operation, so that a losing sleep can be cancelled.

### Requirement 12: Fixtures and the Demo_Corpus

**User Story:** As a judge testing the app with no account, I want the demo to work offline, so that nothing depends on a token or the network.

#### Acceptance Criteria

1. THE Verifier SHALL hold the Fixture_Set in `packages/verifier/fixtures/` with recorded CourtListener responses covering the citations of `packages/engine/fixtures/demo-motion.txt`: Ashcroft v. Iqbal, 556 U.S. 662, and Haines v. Kerner, 404 U.S. 519 (each Line_Status 200, one cluster); `1047 F.3d 212`, `1012 F. Supp. 2d 88`, and `912 F.4th 33` (each Line_Status 404); one synthetic ambiguous line, `1 Hill 150` (Line_Status 300, with two candidate clusters); one synthetic throttled line, `576 U.S. 644` (a per-line Line_Status 429 whose `wait_until` is an ISO 8601 timestamp, inside an HTTP 200); and, as a separate fixture not served by Fixture_Fetch's lookup route, one recorded HTTP-level 429 response body for retry tests.
2. THE Fixture_Set SHALL hold one opinion text excerpt per verified case, each long enough to contain at least 2 genuine quotations of 8 to 60 words each that appear verbatim in the opinion, and THE Demo_Corpus SHALL contain exactly one planted fabricated quotation of 8 to 60 words, the one written in the demo motion's attribution to Iqbal, that appears in none of the excerpts.
3. THE Verifier SHALL export `createFixtureFetch()` returning a `fetch`-compatible function that serves the Fixture_Set without any network access.
4. WHEN the Fixture_Fetch receives a citation lookup POST, THE Verifier SHALL split the request body into lines, trim each line, ignore empty lines, and match each line by exact string equality against the citation lines recorded in the Fixture_Set.
5. WHEN a citation lookup POST body contains a mix of known and unknown lines, THE Fixture_Fetch SHALL return HTTP 200 with exactly one result entry per non-empty input line, in input order, where a known line carries its recorded Line_Status and an unknown line carries Line_Status 404.
6. WHEN the Fixture_Fetch receives a GET whose URL path exactly matches a recorded cluster or opinion path (query string ignored), THE Verifier SHALL return the recorded response with HTTP 200.
7. IF the Fixture_Fetch receives any request that does not match criteria 4 to 6, THEN THE Fixture_Fetch SHALL respond with HTTP 404 and SHALL NOT throw or attempt a network call.
8. WHERE a network and a token are available during the build, THE Verifier SHALL record the Fixture_Set once from the live API.
9. WHERE no network or no token is available, THE Verifier SHALL hand-author each response to the documented response shape and mark it `hand_authored: true` in `fixtures/manifest.json`.
10. THE Verifier SHALL copy any hand-authored opinion excerpt verbatim from the public-domain opinion and SHALL NOT invent opinion text for a real case.
11. THE manifest SHALL record, for each fixture, its source, its recording date (ISO 8601 date) or `hand_authored: true`, and one line saying where it came from, as `tech.md` requires.
12. WHEN `lookup` runs on the Demo_Corpus citations through Fixture_Fetch, THE Verifier SHALL return `verified` for `556 U.S. 662` and `404 U.S. 519`, `not_found` for `1047 F.3d 212`, `1012 F. Supp. 2d 88`, and `912 F.4th 33`, `ambiguous` for `1 Hill 150` with its two candidates, and `unchecked` with `waitUntil` equal to the recorded `wait_until` for `576 U.S. 644`.
13. WHEN `checkQuote` runs on each genuine quotation against its excerpt, THE Verifier SHALL return `match`, and WHEN it runs on the planted fabricated quotation against the Iqbal excerpt, THE Verifier SHALL return `mismatch`.
14. THE Verifier's tests SHALL use Fixture_Fetch or an in-test fake and SHALL NOT call the network.
15. THE manifest SHALL mark the ambiguous line `1 Hill 150` and the throttled line `576 U.S. 644` as both `hand_authored: true` and `synthetic: true`, because CourtListener was not observed to return those responses for those lines.

### Requirement 13: MCP server

**User Story:** As a Kiro user or any MCP client, I want to look up citations through tools, so that an agent can verify a filing without custom code.

#### Acceptance Criteria

1. THE MCP_Server SHALL serve over stdio using `@modelcontextprotocol/sdk` and SHALL expose exactly four tools: `lookup_citations`, `get_opinion_text`, `check_quote`, and `verifier_status`.
2. WHEN `lookup_citations({ citations: string[] })` is called with 1 to 50 strings, each 1 to 2,000 characters long, THE MCP_Server SHALL extract citations from the strings with the Engine, verify the Full_Records with the Verifier, and return for each extracted citation its text, its offsets within the source string, the index of the source string, and its `VerificationResult`.
3. IF a string passed to `lookup_citations` contains no recognised citation, THEN THE MCP_Server SHALL return an empty result list for that string and SHALL NOT return a tool error.
4. WHEN `get_opinion_text({ clusterId })` is called with a `clusterId` that is a positive integer, THE MCP_Server SHALL return the result of `fetchOpinionText`.
5. IF `fetchOpinionText` returns `null`, THEN THE MCP_Server SHALL return a message stating that the opinion text is unavailable for that `clusterId`, and SHALL NOT return a tool error.
6. WHEN `check_quote({ clusterId, quote })` is called with a positive-integer `clusterId` and a `quote` of 1 to 10,000 characters, THE MCP_Server SHALL fetch the opinion text and return the result of `checkQuote`.
7. IF the opinion text for `check_quote` is unavailable, THEN THE MCP_Server SHALL return the status `unchecked` together with a reason stating that the opinion text is unavailable.
8. WHEN `verifier_status()` is called, THE MCP_Server SHALL return the result of `verifierStatus`: the Token_Bucket state (available tokens and capacity) and the Status_Counters (hits, misses, writes).
9. THE MCP_Server tool handlers SHALL be thin wrappers over Verifier functions and SHALL hold no verification logic.
10. THE MCP_Server SHALL read `COURTLISTENER_TOKEN`, `REVEAL_CODES_CACHE_DIR` (default `~/.reveal-codes/cache`), and `REVEAL_CODES_FIXTURES_ONLY` from the environment.
11. WHERE `REVEAL_CODES_FIXTURES_ONLY` is `1`, THE MCP_Server SHALL serve every request from Fixture_Fetch and SHALL make no network call.
12. IF a tool receives a missing argument, an argument of the wrong type, or an argument outside the bounds in criteria 2, 4, or 6, THEN THE MCP_Server SHALL return an MCP tool error naming the invalid argument and SHALL NOT call the Verifier.
13. THE MCP_Server SHALL write all log output to stderr and SHALL write only MCP protocol messages to stdout.
14. THE MCP_Server SHALL NOT include the value of `COURTLISTENER_TOKEN` in any tool result, log line, or error message.
15. THE root `pnpm mcp` script SHALL start the MCP_Server on stdio.
16. THE repository SHALL contain a root `.npmrc` that sets the pnpm reporter to silent, so that `pnpm mcp` writes nothing but MCP protocol messages to stdout.
17. THE MCP_Server SHALL depend on `@modelcontextprotocol/sdk` major version 1, pinned to one exact version with no range operator.

### Requirement 14: Kiro registration and proof

**User Story:** As a hackathon judge, I want evidence that the MCP server is wired into Kiro and works, so that the depth of Kiro usage is visible.

#### Acceptance Criteria

1. THE workspace SHALL register the server in `.kiro/settings/mcp.json` under the name `courtlistener` with command `pnpm`, args `["mcp"]`, env `REVEAL_CODES_FIXTURES_ONLY=1`, and `autoApprove` containing exactly `lookup_citations` and `verifier_status`.
2. WHEN `.kiro/settings/mcp.json` is edited, THE edit SHALL leave every pre-existing server entry unchanged in name and configuration, and the file SHALL remain valid JSON.
3. IF `.kiro/settings/mcp.json` does not exist or is not valid JSON when the edit is attempted, THEN THE edit SHALL stop without writing and report the problem, leaving the original file content unchanged.
4. THE file `docs/KIRO_USAGE.md` SHALL contain one row for the `courtlistener` server and one row for each hook this spec adds, each row giving the item name and the repository-relative path of its defining file.
5. WHEN the final task runs, THE task SHALL invoke `lookup_citations` through the registered `courtlistener` MCP tool, not by calling `packages/verifier` directly, with every citation string that the Engine's `extract` returns for `packages/engine/fixtures/demo-motion.txt`, run with `REVEAL_CODES_FIXTURES_ONLY=1`.
6. WHEN the `lookup_citations` call in criterion 5 returns, having reported `verified` for `556 U.S. 662` and `404 U.S. 519` and `not_found` for the other three reporter citations, THE task SHALL paste the complete returned result, one entry per citation with its verification status, into the task's completion notes.
7. IF the `lookup_citations` call in criterion 5 fails or the `courtlistener` server is not reachable from Kiro, THEN THE task SHALL record the failure in the completion notes and SHALL NOT be marked complete.

### Requirement 15: Hooks, test project, and module limits

**User Story:** As a maintainer, I want tests to run on save and modules to stay small, so that the repository stays navigable.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/hooks/verifier-tests-on-save.json` as a second hook beside `engine-tests-on-save.json`, with the file-save matcher `packages/verifier/(src|test)/.*\.ts$` and a command that runs only the `verifier` Vitest project.
2. WHEN a file whose path matches `packages/verifier/(src|test)/.*\.ts$` is saved, THE `verifier-tests-on-save` hook SHALL run the `verifier` Vitest project once in single-run mode (not watch mode), and SHALL NOT run the `engine` or `courtlistener-mcp` projects.
3. THE root `vitest.config.ts` SHALL declare both the `verifier` project and the `courtlistener-mcp` project, so that `pnpm test` from the repository root executes the tests of both.
4. THE Verifier and MCP_Server source modules SHALL each contain at most 300 lines, and each function in them SHALL contain at most 40 lines, per `tech.md`.
5. THE Verifier source and tests SHALL contain zero occurrences of the `any` type and zero default exports.
6. IF a `try/catch` block in Verifier tests or source catches an error and neither rethrows it, returns it as a `Result` error value, nor asserts on it, THEN THE repository SHALL be considered non-compliant with this requirement.
7. THE `.env.example` SHALL list `REVEAL_CODES_CACHE_DIR` and `REVEAL_CODES_FIXTURES_ONLY`, each preceded by a comment line describing its purpose, and SHALL extend the `COURTLISTENER_TOKEN` comment to state that the token is read only by the MCP server and the web app.

### Requirement 16: Property tests

**User Story:** As a maintainer, I want properties only where they prove something users depend on, so that the test suite stays lean and meaningful.

#### Acceptance Criteria

1. THE Verifier SHALL contain exactly 12 property tests, one per claim in this list, each with exactly one `fc.assert(fc.property(...))` call, each placed in a file named `<module>.properties.test.ts`, and each preceded by a `// Property N` comment, where N is unique within the package and runs from 1 to 12 without gaps: (1) status mapping (Requirement 3.8), (2) privacy of request bodies (2.8), (3) token bucket (7.5), (4) chunking (7.7), (5) cache round trip (10.6), (6) cache hits (10.5), (7) quote idempotence and length (8.10 and 8.11), (8) lifted quote, including quotes joined by ellipsis forms (8.12), (9) altered quote (8.13), (10) retry bound (7.10), (11) database forms (5.5), and (12) short and other records never sent and never in the result map (Requirement 1, criteria 3 and 4).
2. THE Verifier SHALL title the `describe` block of each property test with the text `_Requirements: x.y_`, where x.y lists every requirement criterion that the property covers.
3. THE Verifier SHALL cover every acceptance criterion not named in criterion 1 with at least one example test that uses Fixture_Fetch or an in-test fake, and SHALL make no network requests in any test.
4. THE property tests SHALL run with `numRuns` of at least 200 when run locally and exactly 500 when the `CI` environment variable is set.
5. THE property tests SHALL each assert a relationship between the generated input and the function's output, and SHALL NOT pass solely because the function under test returned without throwing.
6. IF a property test fails, THEN THE test run SHALL report the failing seed and counterexample, and re-running `fc.assert` with `{ seed }` set to the reported value SHALL reproduce the same failure.
7. THE property tests SHALL import shared arbitraries from `packages/engine/src/testing/arbitraries.ts` wherever one exists for the needed input, and SHALL define the verifier-specific arbitraries for response shapes, clocks, and response sequences under `packages/verifier/test/`.

### Requirement 17: Documentation and steering alignment

**User Story:** As a maintainer, I want the written contract to match the code, so that nobody relies on a request shape the verifier no longer sends.

#### Acceptance Criteria

1. THE README SHALL contain a section titled "What leaves your machine" whose content matches the text specified in Requirement 2, criterion 11.
2. WHEN this spec lands, THE file `.kiro/steering/citations.md` SHALL state in its CourtListener lookup description that the request body is the formatted citation strings joined by newline characters.
3. WHEN this spec lands, THE file `.kiro/steering/citations.md` SHALL state in its design-consequences paragraph that the verifier sends one request per chunk, and SHALL contain no statement that the whole document is sent in one request.
4. WHEN this spec lands, THE `BUILD_LOG.md` SHALL contain one new entry headed with the date in YYYY-MM-DD format and the spec name, listing each instance where Kiro's output was wrong and the fix applied, or the text "No Kiro errors" if there were none.
5. IF the request shape described in `.kiro/steering/citations.md` or the README differs from the request shape the verifier sends, THEN THE reviewer SHALL treat the difference as a blocking defect for this spec.

## Known limitations

Standing rule (carried over from the provenance-engine spec, user decision): anything that affects only malformed input or a rare citation style is recorded here as one line, with no spec change and no stop.

- L1. A quote from a dissent or concurrence in a multi-opinion cluster is checked only against the first opinion that has text (Requirement 9.2), so it may show `QUO ✘` although the quote is real. The failure direction is safe (red, never a false pass). Follow-up: a `fetchOpinionTexts` that returns every opinion's text, with the quote checked against each.
- L2. A quote whose ellipsis is formed only by deleting a bracket pair (`.[.].`), or whose NFC form differs from its text (tracking abandoned), loses the clean-cut shortcut for the affected cuts; the `prefixLength` found by word-end probes may be smaller than the largest n of Requirement 8.15. The value is a display hint and never changes `match` or `mismatch`.
- L3. CourtListener throttles the clusters and opinions endpoints at 5 requests per minute for the account in use ("Rate limit exceeded: 5/min"), answering HTTP 429 with a `Retry-After` header and no `wait_until`. The verifier retries per Requirement 7. A throttled opinion fetch returns `null`, so `check_quote` reports `unchecked`, and it is not cached.
- Design and implementation record further entries here as L2, L3, and so on.

## Notes for the user

Decisions recorded from review (resolved questions removed):

- **Privacy overrides `citations.md`.** Only formatted citation strings are sent to CourtListener. Requirement 17.2 and 17.3 update the steering file in the final group; it is not edited in this phase.
- **One chunk, one request.** A Lookup_Chunk holds at most 60 Citation_Lines (the Token_Bucket capacity) and at most 64 000 characters. CourtListener accepts at most 250 citations per request, so 250 appears in no criterion.
- **Citation_Line** is `<volume> <reporter> <page>`; it is the de-duplication key and the cache key. Parallel precedence (Requirement 6): verified, ambiguous, unchecked, not_found. Request timeout is 15 000 ms. `checkQuote` never returns `unchecked`; the MCP `check_quote` tool does.
- **Normalisation order (Requirement 8.2).** Brackets are removed before ellipsis forms are folded, and ellipsis forms may be separated by any White_Space. This keeps the pipeline idempotent (8.10). The length bound (8.11) is stated against NFC(s).
- **Sliding window (Requirement 7.12 and 7.13).** The dispatch wait is the larger of the bucket wait and a sliding-window wait over a 60 000 ms window, closed at its start and open at its end. The bucket arithmetic of 7.1 to 7.4 is unchanged. Criterion 3 applies whenever the window wait is not larger.
- **Status mapping (Requirement 3).** A Line_Status 200 with two or more distinct cluster ids maps to `ambiguous`; `verified` needs a 200 with exactly one.
- **Deps (Glossary, 10.13, 10.14, 11.8 to 11.10).** `Deps` has a seventh field, `state`, built by the exported `createDeps(init)`; `sleep` takes an optional `AbortSignal`; no module-level mutable state. The CacheStore takes an injected `now()` and does not list keys.
- **Quotes with omitted words (Requirement 8.5, 8.14 to 8.16).** A quote is split on `…`; segments must appear in order, non-overlapping, at least 12 characters each except the first and last. Property 8 is extended; the property count stays 12. `prefixLength` is defined over original-quote UTF-16 code units in 8.15. The criteria in this requirement are numbered 1 to 16; criteria 14 to 16 are new.
- **Known limitation L1.** A quote from a dissent or concurrence in a multi-opinion cluster is checked only against the first opinion with text. Requirement 9.2 is unchanged; ellipsis matching is built and is not a limitation.
- **Field preference (Requirement 9.3)** follows the stated order, `plain_text` first, although CourtListener's guidance prefers `html_with_citations`. **Position mapping (2.6, 2.7)** stays all-or-nothing; using `start_index` is a possible later change.
- **Demo_Corpus (Requirement 12).** It is the citation set of `packages/engine/fixtures/demo-motion.txt`. Twombly, Roe, and `123 F.4th 456` are dropped. The ambiguous line `1 Hill 150` and the throttled line `576 U.S. 644` are synthetic and marked so in the manifest; the throttled line is a plausible line chosen by the spec, not taken from the motion. Fixtures are hand-authored from public-domain text until a live recording is made; nothing is composed.
- **Demo motion findings.** The five reporter citations in the motion match your list. Two details to know: the motion writes the third fabricated citation as `912 F. 4th 33, 41 (9th Cir. 2023)` with a space, which the Engine normalises to `912 F.4th 33`, so the Citation_Line has no space; and the motion contains one genuine quotation (Haines, 404 U.S. at 520) and one fabricated quotation (attributed to Iqbal, 556 U.S. at 679), so the second genuine quotation per excerpt required by 12.2 is used only by Verifier tests and does not appear in the motion. The motion has no ambiguous or throttled citation, so those two outcomes appear only in Verifier fixtures. Pincites are dropped from Citation_Lines, so they do not affect fixtures.
- **Final task (Requirement 14.5).** It runs `lookup_citations` over the strings the Engine extracts from the demo motion, with `REVEAL_CODES_FIXTURES_ONLY=1`; expect two `verified` and three `not_found`. `apps/web/demo/` is not referenced.
- **Housekeeping (Requirement 13.16, 13.17).** A root `.npmrc` sets a silent reporter so `pnpm mcp` writes only protocol messages to stdout. The SDK stays on `@modelcontextprotocol/sdk` v1, pinned to an exact version.
- **Design follow-up.** `design.md` Notes N1 to N13 are now answered by this document; the design must be brought into line (Window_Log, `createDeps`, ellipsis matching, status mapping, the new Demo_Corpus, and N13's `apps/web/demo/` reference at the final-task line). This round edits the requirements only.
