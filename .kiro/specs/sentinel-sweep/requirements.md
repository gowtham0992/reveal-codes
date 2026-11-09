# Requirements Document

## Introduction

This feature adds the sweep program that the Reveal Codes Sentinel Crew app runs on a schedule. The program lives in `crew/sentinel` (`@reveal-codes/sentinel`) and has one entry point, the command line interface `sentinel`, started from the repository root as `pnpm sentinel <command>`. It reads a folder of exported `.docx` filings, reads the Provenance Appendix back out of each file, re-verifies the citations and quotations the Appendix records, and reports drift: any place where the filing, the CourtListener data, or the author's overrides no longer agree with the record the file carries.

The Crew app manifest lives in a separate repository (hackathon rule) and is not part of this spec. This repository delivers only the command line program the Crew app calls, one root script, and documentation.

The Sentinel never decides whether a citation is real. It asks the Verifier the same question the editor asks, with the same data, and reports when the answer differs from the one recorded in the file. Product principle 2 (deterministic and reproducible verification) and principle 3 (nothing leaves the machine silently) bind this spec: the report states the mode (fixtures or live) on its second line, the Sentinel sends only citation strings and cluster ids to CourtListener, and it sends no draft text anywhere.

This spec changes no Engine, Verifier, or Web_App behavior. The only changes outside `crew/sentinel`, the root `package.json`, the `.kiro` files, and the documentation are two added named exports in `packages/export/src/index.ts` (Requirement 3) and, only on the fallback of Requirement 12, criterion 17, two test-support files moved to `packages/export/src/testing/` with a `@reveal-codes/export/testing` subpath export.

The Sentinel reads four environment variables, `COURTLISTENER_TOKEN`, `REVEAL_CODES_FIXTURES_ONLY`, `REVEAL_CODES_CACHE_DIR`, and `COURTLISTENER_BASE_URL`. Only `cli.ts` references `process.env`; it passes the environment into the pure function `buildDeps`. No `app.json` or other Crew manifest is created in this repository.

## Glossary

- **Sentinel**: the package `crew/sentinel`, published in the workspace as `@reveal-codes/sentinel`.
- **Sentinel_CLI**: the module `crew/sentinel/src/cli.ts`, run as `pnpm sentinel <command>`.
- **Export_File**: a `.docx` file produced by `buildDocx` of the Export_Package: the filing, the Statement_Text, and the Provenance_Appendix, in that order.
- **Export_Package**: `packages/export`, `@reveal-codes/export`.
- **Statement_Title**: the string `STATEMENT_TITLE` of the Export_Package, "AI-Use and Verification Statement".
- **Appendix_Title**: the string `APPENDIX_TITLE` of the Export_Package, "Provenance Appendix".
- **Paragraph_List**: the `readonly string[]` that `readDocx` returns, one entry per `w:p` element of `word/document.xml` in document order.
- **Export_Parts**: the value `{ body, appendix }` that `splitExport` returns; `body` and `appendix` are each a `readonly string[]`.
- **Body**: `Export_Parts.body`, the filing paragraphs.
- **Appendix_Lines**: `Export_Parts.appendix`, the Provenance_Appendix lines after its title and introductory sentences.
- **Recorded_Document**: the Document returned by the Engine's `parse(appendix.join("\n"))`; its `text` is the filing as the Appendix says it was, and its citation, quote, and override records are the recorded ones.
- **Reverified_Document**: the Recorded_Document after `reverify` has applied the new results with the Engine's `setVerification` and `setQuoteCheck`; the Sentinel uses it only as the argument of the Engine's `issues`, and never shows or reports it.
- **Lock_File**: a file whose name matches `~$*.docx`, the owner file that Word creates beside an open document.
- **Recorded_Status**: the verification status or quote check status held by a record of the Recorded_Document.
- **New_Status**: the status the Verifier returns, or the quote check returns, for the same record during `reverify`.
- **Drift**: a Finding of kind `body_edited`, `citation_changed`, `quote_changed`, or `override_stale`.
- **Finding**: one of the discriminated union members defined in Requirement 6, each holding `file`, `line`, `before`, and `after`.
- **Sentinel_Error**: the discriminated union of Requirement 2, criterion 12, returned as the `Err` value of `Result` by the Sentinel's reading and splitting functions.
- **Mode**: `fixtures` or `live`; `fixtures` unless `COURTLISTENER_TOKEN` is non-empty and `REVEAL_CODES_FIXTURES_ONLY` is not `1`.
- **Sweep_Report**: the value `{ sweptAt, mode, files }` holding one entry `{ file, findings }` per swept file, from which the Markdown_Report and the Json_Report are rendered.
- **Markdown_Report**: the Markdown text rendered from a Sweep_Report by `renderReport`.
- **Json_Report**: the JSON text rendered from a Sweep_Report by `renderJson`.
- **Local_Date_Time**: the `YYYY-MM-DD HH:MM` reading of a `Date` in the host time zone, computed by `localDateTime` of the Export_Package.
- **Iso_Instant**: the ISO 8601 reading of a `Date` returned by `Date.prototype.toISOString()`.
- **Fixtures_Notice**: the sentence "Citations outside the recorded set read as not found in fixtures mode."
- **Clock**: the injected function `() => Date`; the Sentinel reads the time only through the Clock.
- **Token**: the value of `COURTLISTENER_TOKEN`.
- **Sentinel_Env**: the read-only record of optional strings that `buildDeps` receives, holding the four variables `COURTLISTENER_TOKEN`, `REVEAL_CODES_FIXTURES_ONLY`, `REVEAL_CODES_CACHE_DIR`, and `COURTLISTENER_BASE_URL`.
- **Verifier**: `packages/verifier`, `@reveal-codes/verifier`.
- **Engine**: `packages/engine`, `@reveal-codes/engine`.
- **Web_App**: `apps/web`.
- **Demo_Export**: the `.docx` bytes produced by `buildDocx` from the Export_Package test support's demo Document and demo Statement.
- **Sentinel_Hook**: the file `.kiro/hooks/sentinel-tests-on-save.json`.

## Requirements

### Requirement 1: Package, dependencies and boundaries

**User Story:** As a maintainer, I want the Sentinel to be a small package with explicit dependencies and one runner, so that the Crew app can call it and nothing else in the repository changes.

#### Acceptance Criteria

1. THE Sentinel SHALL keep the package name `@reveal-codes/sentinel` and the directory `crew/sentinel`.
2. THE Sentinel SHALL declare as runtime dependencies exactly `@reveal-codes/engine`, `@reveal-codes/export`, and `@reveal-codes/verifier` (all `workspace:*`) and `fflate` at the exact version `0.8.3`, with no other entry in `dependencies`.
3. THE Sentinel SHALL declare as development dependencies exactly `vitest` and `fast-check`, each at the same version specifier the other workspace packages already pin, and no other entry in `devDependencies`.
4. THE Sentinel SHALL add to the lockfile no package other than `fflate@0.8.3` and the transitive dependencies of the pinned `vitest` and `fast-check`, and SHALL add no XML library, command-line parsing library, or build tool.
5. WHEN the Sentinel is built, THE Sentinel SHALL contain neither the export `PACKAGE_NAME` nor the file `crew/sentinel/test/index.test.ts`, and no remaining file SHALL reference `PACKAGE_NAME`.
6. THE Sentinel SHALL define a package script `cli` equal to `node --import jiti/register src/cli.ts`, the same runner `apps/web/scripts/copy-demo.ts` uses.
7. THE root `package.json` SHALL define a script `sentinel` equal to `pnpm --filter @reveal-codes/sentinel run cli`.
8. THE Sentinel MAY import from `node:fs`, `node:path`, and `node:os`, and SHALL import from no other `node:` module; the Sentinel is not the Engine.
9. THE Sentinel SHALL reference `process.env` in exactly one source module, `crew/sentinel/src/cli.ts`, and SHALL read from the Sentinel_Env no variable other than `COURTLISTENER_TOKEN`, `REVEAL_CODES_FIXTURES_ONLY`, `REVEAL_CODES_CACHE_DIR`, and `COURTLISTENER_BASE_URL`.
10. THE Sentinel SHALL use named exports only, plain data types and discriminated unions in place of classes, and no `any`, in every source file.
11. THE Sentinel SHALL return `Result` values in place of thrown errors in every function except the Sentinel_CLI entry, SHALL limit each function to 40 lines or fewer, and SHALL limit each module to 300 lines or fewer.
12. THE Sentinel SHALL contain a `try/catch` only where the block converts a thrown error into a Sentinel_Error value, into a Finding, or into an exit code and a message, and SHALL contain no `try/catch` with an empty block or a block that neither returns, rethrows, nor records the error.
13. THE Sentinel SHALL change no file under `packages/engine`, `packages/verifier`, `packages/courtlistener-mcp`, or `apps/web`, and SHALL change files under `packages/export` only as Requirement 3, criterion 1 states and, only when the fallback of Requirement 12, criterion 17 applies, by adding the two support files under `packages/export/src/testing/` and the `@reveal-codes/export/testing` subpath export.
14. THE Sentinel SHALL contain no file named `app.json` and no other Crew app manifest under `crew/sentinel`.
15. THE Sentinel SHALL declare `@reveal-codes/export` as a runtime dependency because the Sentinel reads at run time what the Export_Package writes (`STATEMENT_TITLE`, `APPENDIX_TITLE`, `buildAppendix`, `ellipsize`, and `localDateTime`), AND the Engine SHALL remain the only workspace package with zero dependencies.

### Requirement 2: Reading a .docx

**User Story:** As the Sentinel, I want the paragraphs of a `.docx` file as plain strings, so that the filing and the Appendix can be compared without a word-processing library.

#### Acceptance Criteria

1. THE Sentinel SHALL export `readDocx(bytes: Uint8Array): Result<DocxText, SentinelError>`, where `DocxText` is the Paragraph_List, and `readDocx` SHALL be total: it returns an `Ok` or `Err` value for every `Uint8Array` input, including an empty array, and does not throw.
2. THE `readDocx` function SHALL unzip `bytes` with `fflate`, inflating only the entry `word/document.xml`, and SHALL read no other entry of the archive.
3. IF `bytes` is not a zip archive, including when `bytes` has length 0, THEN THE `readDocx` function SHALL return `{ kind: "not_docx" }` as the `Err` value.
4. IF `bytes` is a zip archive with no entry `word/document.xml`, THEN THE `readDocx` function SHALL return `{ kind: "not_docx" }` as the `Err` value.
5. IF the entry `word/document.xml` cannot be inflated, THEN THE `readDocx` function SHALL return `{ kind: "not_docx" }` as the `Err` value.
6. WHEN `bytes` is a zip archive with a readable `word/document.xml`, THE `readDocx` function SHALL return an `Ok` value holding one Paragraph_List entry for each `w:p` element, including each self-closing `<w:p/>` (an empty string) and each `w:p` inside a table cell, in document order.
7. THE `readDocx` function SHALL form the text of a paragraph by concatenating, in document order, the contents of its `w:t` elements, a tab character for each `w:tab` element, and a line feed for each `w:br` element whose `w:type` is absent or `textWrapping`.
8. THE `readDocx` function SHALL add no text for a `w:br` element whose `w:type` is `page` or `column`, because the Export_Package emits its page break as a `w:br w:type="page"` run inside the title paragraph.
9. THE `readDocx` function SHALL recognise a tag by its complete name, so that `w:pPr` is not read as `w:p`, and `w:tab`, `w:tbl`, `w:tc`, `w:tr`, and `w:tcPr` are not read as `w:t`.
10. THE `readDocx` function SHALL decode the entities `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&apos;` and the decimal and hexadecimal numeric character references in a single left-to-right pass, so that the text `&amp;lt;` decodes to `&lt;` and not to `<`.
11. IF a numeric character reference names a code point above U+10FFFF or a surrogate code point (U+D800 to U+DFFF), THEN THE `readDocx` function SHALL leave the reference text unchanged in the paragraph and SHALL NOT throw.
12. THE Sentinel SHALL define Sentinel_Error as the union of `{ kind: "not_docx" }`, `{ kind: "not_reveal_codes_export" }`, `{ kind: "appendix_unparseable"; detail: string }`, and `{ kind: "read_failed"; detail: string }`, where `read_failed` is the error of a file that the file system could not read.
13. THE `readDocx` function SHALL use a tokenizer over the tags `<w:p`, `</w:p>`, `<w:t`, `<w:tab`, and `<w:br` and SHALL use no XML parsing library.
14. FOR ALL Documents that the Export_Package can export, `readDocx(buildDocx(document, statement))` SHALL return an `Ok` value whose Paragraph_List holds, in order, the filing paragraphs, the Statement_Title, and the Appendix_Title (Property 1, round trip, with Requirement 4, criterion 6).

### Requirement 3: Splitting an Export_File

**User Story:** As the Sentinel, I want the filing and the Appendix separated, so that each can be checked against the other.

#### Acceptance Criteria

1. THE Export_Package SHALL add `STATEMENT_TITLE` and `APPENDIX_TITLE` to the named exports of `packages/export/src/index.ts`, re-exported from `wording.ts` with no change to their values, and SHALL change no other line of the Export_Package.
2. THE Sentinel SHALL export `splitExport(paragraphs: readonly string[]): Result<ExportParts, SentinelError>`, and `splitExport` SHALL return a `Result` value for every input, including an empty list, and SHALL NOT throw.
3. WHEN `splitExport` is called, THE `splitExport` function SHALL locate the first paragraph equal to the Statement_Title (compared by exact string equality) and, after it, the first paragraph equal to the Appendix_Title (compared by exact string equality).
4. IF the Paragraph_List is empty, holds no paragraph equal to the Statement_Title, or holds no paragraph equal to the Appendix_Title after the first one equal to the Statement_Title, THEN THE `splitExport` function SHALL return `{ kind: "not_reveal_codes_export" }` as the `Err` value.
5. WHEN `splitExport` returns an `Ok` value, THE `splitExport` function SHALL return as `body` every paragraph before the paragraph equal to the Statement_Title, in original order, with no paragraph removed, because the Export_Package emits the page break inside the title paragraph and emits no separate empty paragraph for it.
6. WHEN `splitExport` returns an `Ok` value, THE `splitExport` function SHALL return as `appendix` every paragraph after the paragraph equal to the Appendix_Title, in original order, omitting the first *n* of them, where *n* is the length of the `intro` list of the Appendix that the Export_Package's `buildAppendix` returns, read from `buildAppendix` and not written as a literal.
7. WHEN the Appendix_Title is the last paragraph or is followed by *n* or fewer paragraphs, THE `splitExport` function SHALL return an `Ok` value whose `appendix` is an empty list.
8. THE `splitExport` function SHALL leave its input unmodified (same length and same element at every index after the call) and SHALL return deeply equal results for deeply equal inputs.

### Requirement 4: Reconstructing the Recorded_Document

**User Story:** As the Sentinel, I want the Document that the Appendix records, so that I can compare it with the filing text and re-verify its citations.

#### Acceptance Criteria

1. WHEN the Sentinel receives an Appendix (an array of zero or more strings), THE Sentinel SHALL form the codes text as `appendix.join("\n")` and SHALL form the Recorded_Document as the Engine's `parse` of that text.
2. IF `parse` returns an `Err` value, THEN THE Sentinel SHALL return `{ kind: "appendix_unparseable", detail }` as the Sentinel_Error, where `detail` is a non-empty string naming the Engine error kind and, for `malformed_codes`, its `index` and `rule`, and THE Sentinel SHALL produce no Recorded_Document and perform no comparison or citation re-verification for that input.
3. WHEN the Sentinel receives a body (an array of zero or more strings), THE Sentinel SHALL form the body text as `body.join("\n")`.
4. WHEN a Recorded_Document has been formed, THE Sentinel SHALL compare the body text with `recordedDocument.text` by exact code-unit string equality, so that any difference in spaces, tabs, line breaks, trailing whitespace, or Unicode normalization form is a mismatch, and an empty body text equals an empty `recordedDocument.text`.
5. THE Sentinel SHALL take the recorded citations, quotes, and overrides only from the Recorded_Document and SHALL take citation and quote offsets only from the Recorded_Document, never from the body text.
6. FOR ALL Documents from the Engine's `arbDocument` whose `text` contains no character below U+0020 other than `\n` and `\t` (the limitation L5 of the export-certification spec), THE Sentinel SHALL satisfy both of the following: `splitExport(readDocx(buildDocx(document, statement)))` returns an `Ok` value whose `body.join("\n")` equals `document.text`, and `parse(appendix.join("\n"))` returns an `Ok` value whose value satisfies vitest `toEqual` against `document`, as the Engine's own round-trip property does, with no `normalise()` step because the output of `parse` is canonical (Property 1, round trip).

### Requirement 5: Re-verification

**User Story:** As a filer, I want the sweep to ask the same questions the editor asked, so that a change in the answer is a change in the world and not in the method.

#### Acceptance Criteria

1. THE Sentinel SHALL export `reverify(document, deps)` that returns the Reverified_Document and the facts the Findings need, and SHALL never mutate its input.
2. WHEN `reverify` is called, THE Sentinel SHALL call the Verifier's `lookup` exactly once with the citation records of the Recorded_Document, and SHALL apply each returned result whose status is not `unchecked` with the Engine's `setVerification`.
3. WHEN `lookup` returns a result with status `unchecked` for a full citation, THE `reverify` function SHALL leave that record's Recorded_Status in place and SHALL report that the re-check was unavailable, carrying the result's `waitUntil` when present.
4. IF the Engine rejects a `setVerification` or `setQuoteCheck` call with an `Err` value, THEN THE `reverify` function SHALL leave that record unchanged, SHALL report the record as not re-checked, and SHALL continue with the next record.
5. WHEN all citation results have been applied, THE `reverify` function SHALL determine for each quote of the Reverified_Document its owning cluster by the rule of `ownerCluster` and `quotesByCluster` in `apps/web/src/client/verify-flow.ts`: the owner of a quote is the citation at `quote.citationStart`, or, for a short form, the full citation at the short form's `targetStart`, and the quote has a cluster only when that full citation is `verified` in the Reverified_Document.
6. THE Sentinel SHALL contain its own copy of those functions, of at most 40 lines in total, with a comment naming `apps/web/src/client/verify-flow.ts` as the source, and SHALL NOT import from `apps/web`.
7. WHEN quotes have owning clusters, THE `reverify` function SHALL fetch the opinion text for each distinct cluster exactly once, with the Verifier's `fetchOpinionText(clusterId, deps)`, one cluster after another and never concurrently, in first-encounter order of the quotes in the document.
8. WHEN `fetchOpinionText` returns a string, THE `reverify` function SHALL run the Verifier's `checkQuote(opinionText, quote.text)` for each quote of that cluster and SHALL apply a result whose status is not `unchecked` with the Engine's `setQuoteCheck`.
9. IF `fetchOpinionText` returns `null`, THEN THE `reverify` function SHALL leave the quotes of that cluster at their Recorded_Status and SHALL report, once per cluster, that the re-check was unavailable.
10. IF a quote has no owning cluster, THEN THE `reverify` function SHALL leave that quote at its Recorded_Status and SHALL report nothing for it.
11. THE `reverify` function SHALL make no network request except through the Verifier's `Deps`, SHALL send no draft text in any request, and SHALL leave rate limiting to the Verifier's token bucket.
12. FOR ALL Recorded_Documents and `Deps`, THE `reverify` function SHALL return a Reverified_Document whose `text` equals the Recorded_Document's `text`.

### Requirement 6: Findings

**User Story:** As a supervising attorney, I want each difference between a filing's record and today's data listed with the line it touches, so that I can open the file and look.

#### Acceptance Criteria

1. THE Sentinel SHALL define Finding as a discriminated union on `kind` with the members `body_edited`, `citation_changed`, `quote_changed`, `override_stale`, `recheck_unavailable`, and `unreadable`, and every member SHALL hold `file` (the file name), `line` (an integer of at least 1, or `null`), `before` (a string), and `after` (a string).
2. WHEN the body text differs from `recordedDocument.text`, THE Sentinel SHALL produce exactly one `body_edited` Finding whose `line` is the 1-based number of the first line, in the split on `\n`, at which the two texts differ, whose `before` is that line of the Recorded_Document text, and whose `after` is that line of the body text, each cut with the Export_Package's `ellipsize(text, 80)` (the first 79 characters followed by "…" when longer than 80), and an absent line is the empty string.
3. WHEN a full citation's New_Status differs from its Recorded_Status and the New_Status is not `unchecked`, THE Sentinel SHALL produce exactly one `citation_changed` Finding for that citation whose `line` is the 1-based line of the citation's `start` in the Recorded_Document text, whose `before` is the Recorded_Status as text, and whose `after` is the New_Status as text.
4. THE Sentinel SHALL write a verification status as text in exactly these forms: `verified <clusterId>`, `not_found`, `ambiguous <n>` where *n* is the number of candidates, and `unchecked`.
5. WHEN a citation's Recorded_Status and New_Status are both `verified` and the New_Status cluster id differs from the Recorded_Status cluster id, THE Sentinel SHALL produce exactly one `citation_changed` Finding for that citation, with `before` and `after` formed under criterion 4, because the filing now points at another decision.
6. WHEN a quote's New_Status differs from its Recorded_Status and the New_Status is not `unchecked`, THE Sentinel SHALL produce exactly one `quote_changed` Finding for that quote whose `line` is the 1-based line of the quote's `start` in the Recorded_Document text, and whose `before` and `after` are the Recorded_Status and New_Status, each written as one of the texts `match`, `mismatch`, or `unchecked`.
7. WHEN an override of the Recorded_Document has an issue key that is not the key of any element of `issues(reverifiedDocument)`, THE Sentinel SHALL produce exactly one `override_stale` Finding for that override whose `line` is the 1-based line of the start of the record with that key in the Recorded_Document text (or `null` when the record is absent), whose `before` is the override's reason cut with `ellipsize(reason, 80)`, and whose `after` is "no longer an issue".
8. THE Sentinel SHALL take the overrides for criterion 7 from the Recorded_Document and test each against `issues(reverifiedDocument)`, and SHALL use the Reverified_Document for nothing except that `issues` call, so that it is never shown or reported.
9. IF `reverify` reports that any re-check was unavailable, THEN THE Sentinel SHALL produce exactly one `recheck_unavailable` Finding for the file, with `line` `null`, with `before` the empty string, with the additional field `waitUntil` (a string or `null`) holding the raw value as the Verifier gives it, and with `after` "retry after <Local_Date_Time of waitUntil>" (for example `retry after 2026-11-07 14:30`) when at least one unchecked result carries a `waitUntil`, using the latest one, and "unavailable" otherwise.
10. IF the file cannot be read, unzipped, split, or parsed, THEN THE Sentinel SHALL produce exactly one `unreadable` Finding for the file, with `line` `null`, with `before` the empty string, and with `after` equal to the `kind` of the Sentinel_Error, and SHALL produce no other Finding for that file.
11. THE Sentinel SHALL list the Findings of one file in this order: the `body_edited` Finding first, because a change to the certified text puts every later Finding in doubt; then the `citation_changed`, `quote_changed`, and `override_stale` Findings together in ascending order of the position of the touched record in the Recorded_Document text, with the kind in the order `citation_changed`, `quote_changed`, `override_stale` as tiebreak; then the `recheck_unavailable` Finding last; and an `unreadable` Finding stands alone, with no other Finding for that file.
12. THE Sentinel SHALL build the Reverified_Document with the Engine's `setVerification` and `setQuoteCheck` and SHALL never mutate a Document.
13. WHEN the New_Status of a record equals its Recorded_Status, THE Sentinel SHALL produce no `citation_changed` or `quote_changed` Finding for that record.
14. WHEN the Verifier's `checkQuote` returns `unchecked` for a quote, or the quote has no owning cluster because its owner is no longer `verified`, THE Sentinel SHALL produce no Finding for that quote, and the quote SHALL keep its Recorded_Status.
15. WHEN `fetchOpinionText` returns `null` for a cluster, THE Sentinel SHALL produce the `recheck_unavailable` Finding of criterion 9 and no `quote_changed` Finding for the quotes of that cluster.
16. WHEN a citation's Recorded_Status and New_Status are both `ambiguous` and differ only in the number of candidates, THE Sentinel SHALL produce no `citation_changed` Finding for that citation; a citation changes only when its status kind differs, or when both statuses are `verified` with different cluster ids.

### Requirement 7: Verifier dependencies from the environment

**User Story:** As an operator, I want the Sentinel to pick fixtures or live data the way the editor does and to share its cache, so that one token, one cache, and one rate limit serve both.

#### Acceptance Criteria

1. THE Sentinel SHALL export `buildDeps(env, io)` that returns the Mode and the Verifier `Deps`, where `env` is a Sentinel_Env (the same shape as the argument of `readServerConfig` in `apps/web/src/server/deps.ts`) and `io` supplies `fetch`, the Clock, `sleep`, and the home directory, and `buildDeps` SHALL be a pure function that reads neither `process.env` nor the clock except through `io`.
2. THE `buildDeps` function SHALL select the Mode `live` IF `COURTLISTENER_TOKEN` is a string of length 1 or more AND `REVEAL_CODES_FIXTURES_ONLY` is not exactly the string `1`, and SHALL select the Mode `fixtures` in every other case (including `COURTLISTENER_TOKEN` absent, empty, or `REVEAL_CODES_FIXTURES_ONLY` equal to `1`), mirroring `readServerConfig` in `apps/web/src/server/deps.ts`.
3. WHILE the Mode is `fixtures`, THE `buildDeps` function SHALL build `Deps` from `createFixtureFetch()` and an in-memory cache store, and SHALL carry no Token.
4. WHILE the Mode is `live`, THE `buildDeps` function SHALL build `Deps` from `io.fetch`, a file cache store in the directory named by `REVEAL_CODES_CACHE_DIR` when that variable is a string of length 1 or more and in `<home>/.reveal-codes/cache` otherwise, and the Token, so that the Sentinel and the Web_App share one cache directory.
5. THE `buildDeps` function SHALL use the value of `COURTLISTENER_BASE_URL` as the CourtListener base URL WHEN that variable is a string of length 1 or more, and SHALL otherwise use the same default as the Web_App's `deps.ts`, `https://www.courtlistener.com/api/rest/v4`.
6. THE Sentinel SHALL contain a copy of the real abortable `sleep` of `apps/web/src/server/deps.ts`, with a comment naming that file, because an instantly resolving sleep makes the Verifier's timeout win every race.
7. WHEN the Sentinel prints a report, a Finding, or the value of `verifierStatus(deps)`, THE Sentinel SHALL omit the Token from every one of them, so that the Token string appears in none of their serialized forms.
8. IF the Token is a string of length 1 or more AND the Sentinel prints error text, THEN THE Sentinel SHALL replace every occurrence of the Token in that text with `[redacted]`, as `packages/courtlistener-mcp/src/main.ts` does.
9. WHEN the Token is absent or empty, THE Sentinel SHALL print error text unchanged by redaction.
10. THE `cli.ts` module SHALL be the only module of the Sentinel that references `process.env`, and SHALL pass it as the `env` argument of `buildDeps`; WHEN a test calls `buildDeps` with a plain object, THE `buildDeps` function SHALL return `Deps` determined by that object alone.

### Requirement 8: Analysing files

**User Story:** As an operator, I want a failing file to be a line in the report and not the end of the sweep, so that one bad file does not hide the others.

#### Acceptance Criteria

1. THE Sentinel SHALL export `analyseFile(file, bytes, deps)` that returns a Promise resolving to the list of Findings for one file, produced by running `readDocx`, `splitExport`, the Recorded_Document reconstruction, `reverify`, and the Finding rules of Requirement 6, and SHALL never reject and never throw.
2. WHEN `analyseFile` receives bytes that fail in `readDocx`, `splitExport`, or the Recorded_Document reconstruction, THE Sentinel SHALL return a list holding exactly one `unreadable` Finding as defined in Requirement 6, criterion 10, and SHALL run no later stage (in particular, no `reverify` and no call to the Verifier's `lookup`) for that file.
3. IF the file system cannot read a file, including a file that vanished between the directory listing and the read, THEN THE Sentinel SHALL return a list holding exactly one `unreadable` Finding for that file, with `file` the file name, `line` `null`, `before` the empty string, and `after` equal to `read_failed`.
4. THE Sentinel SHALL start the analysis of each file of one run only after the analysis of the previous file has settled, and SHALL analyse the files in the report's sorted order (`localeCompare("en")` on the file name, Requirement 9, criterion 2).
5. WHEN `analyseFile` returns for one file, THE Sentinel SHALL proceed to the next file of the run whether the returned list is empty, holds drift Findings, or holds an `unreadable` Finding.
6. THE Sentinel SHALL open every analysed file for reading only, and SHALL leave each analysed file with the same bytes, the same size, and the same modification time after the run as before it.
7. THE `analyseFile` function SHALL leave its `bytes` argument unmodified, and SHALL return deeply equal results for deeply equal inputs and `deps` that return the same responses.
8. IF an unexpected error is thrown inside `analyseFile`, THEN THE `analyseFile` function SHALL return a list holding exactly one `unreadable` Finding for that file, with `line` `null`, `before` the empty string, and `after` equal to `read_failed`, and THE Sentinel SHALL continue the run with the next file.

### Requirement 9: Reports

**User Story:** As a Crew app and as a person, I want the same sweep as readable Markdown and as JSON, so that a person can read it and a program can compare runs.

#### Acceptance Criteria

1. THE Sentinel SHALL export `renderReport(report): string` and `renderJson(report): string`, both pure functions of a Sweep_Report with no read of the clock, file system, or environment.
2. WHEN `renderReport` is called, THE Sentinel SHALL sort the entries of `report.files` by `file` with `localeCompare(b, "en")` and SHALL render, in this order: the heading `# Sentinel sweep — <Local_Date_Time of sweptAt>`; a blank line; the summary line `<n> files · <m> with findings · <mode> mode`; then, in fixtures mode only, a blank line and the Fixtures_Notice (criterion 11); and then, for each file, a blank line, the heading `## <file>`, a blank line, and either the line `No drift.` when the file has no Findings or a table.
3. WHEN `renderReport` renders the summary line, THE Sentinel SHALL write "1 file" when exactly one file is swept and "<n> files" for every other count including 0, SHALL write `<m>` as the number of files with at least one Finding, and SHALL write `<mode> mode` as `fixtures mode` or `live mode`.
4. WHEN a file has one or more Findings, THE Sentinel SHALL render the table with the header `| Finding | Line | Before | After |`, the separator `| --- | --- | --- | --- |`, and one row per Finding in the order of the file's Findings list, whose first cell is the label "Body edited", "Citation changed", "Quote changed", "Override no longer needed", "Recheck unavailable", or "Unreadable" for the Finding's kind.
5. WHEN `renderReport` writes a table cell, THE Sentinel SHALL write the Line cell as the decimal line number, or `-` when `line` is `null`, SHALL escape `|` as `\|` in every cell, and SHALL replace every line feed in a cell by a space.
6. THE `renderReport` function SHALL end the text with exactly one line feed, and the text SHALL contain no colour code, no emoji, and no exclamation mark outside text that comes from a Finding (the Copy rules of `ui.md` apply to the Sentinel's own text).
7. WHEN `renderJson` is called, THE Sentinel SHALL return the JSON of `{ sweptAt, mode, files: [{ file, findings }] }` with the `files` in the same sorted order as the Markdown_Report, indented by two spaces, ending in exactly one line feed.
8. THE `sweptAt` value of the Json_Report SHALL be the Iso_Instant of `report.sweptAt`, a machine field, while the Markdown_Report heading keeps the Local_Date_Time string, both derived from the same `report.sweptAt` value.
9. IF `report.files` is empty, THEN THE `renderReport` function SHALL render the heading, a blank line, and the summary line `0 files · 0 with findings · <mode> mode` (followed, in fixtures mode, by a blank line and the Fixtures_Notice) with no file sections, and THE `renderJson` function SHALL return `files` as an empty array.
10. FOR ALL Sweep_Reports with distinct file names, `renderReport` and `renderJson` SHALL return the same text for deeply equal inputs, SHALL list each file exactly once in `localeCompare("en")` order, and, for each file, the section of the Markdown_Report that begins at its `## <file>` heading SHALL contain the line `No drift.` if and only if the file's Findings list is empty (Property 2, sweep is a function of its inputs).
11. WHILE the Mode of the Sweep_Report is `fixtures`, THE `renderReport` function SHALL write the Fixtures_Notice as one line directly after the summary line, separated from it by one blank line; WHILE the Mode is `live`, THE `renderReport` function SHALL write no Fixtures_Notice; THE `renderJson` function SHALL be unaffected by the Mode beyond the `mode` field, and the Sentinel SHALL suppress no Finding in fixtures mode.

### Requirement 10: Command line

**User Story:** As a Crew app and as a filer, I want two commands with predictable output and exit codes, so that a schedule can run one and a person can run the other.

#### Acceptance Criteria

1. WHEN the Sentinel_CLI is run as `sentinel sweep <dir>`, THE Sentinel_CLI SHALL analyse every file whose name ends in `.docx` (the extension compared case-insensitively) and that lies directly in `<dir>`, without recursion into subdirectories, sorted by file name with `localeCompare("en")`, and SHALL skip every Lock_File silently, so that a Lock_File produces no Finding and is not counted in the file total of the summary line; the sort and the count use the remaining files.
2. WHEN the Sentinel_CLI is run as `sentinel sweep <dir> --json <file>`, THE Sentinel_CLI SHALL write the Json_Report to `<file>`.
3. WHEN the Sentinel_CLI is run with `--out <file>`, THE Sentinel_CLI SHALL write the Markdown_Report to `<file>` and nothing to standard output.
4. WHEN the Sentinel_CLI is run without `--out`, THE Sentinel_CLI SHALL write the Markdown_Report to standard output.
5. WHEN the Sentinel_CLI is run as `sentinel check <file.docx>`, THE Sentinel_CLI SHALL analyse that one file and produce the same report shape as `sweep`, with the options `--json` and `--out` accepted as for `sweep`.
6. THE Sentinel_CLI SHALL take the Clock from an injected function so that a test can fix the heading time, and SHALL use `new Date()` only at the process entry.
7. WHEN a sweep or check run completes, whether or not any Finding was produced, THE Sentinel_CLI SHALL exit with code 0.
8. IF the arguments name no command, an unknown command, a missing or extra argument, or an unknown option, THEN THE Sentinel_CLI SHALL write a usage message to standard error, write nothing to standard output, write no file, and exit with code 2.
9. IF `<dir>` does not exist or is not a directory, THEN THE Sentinel_CLI SHALL write a message to standard error naming the path, write nothing to standard output, and exit with code 2.
10. IF a file cannot be read or is not an Export_File, THEN THE Sentinel_CLI SHALL report it as an `unreadable` Finding and SHALL continue with the next file.
11. IF an unexpected error stops the run, THEN THE Sentinel_CLI SHALL write its message with the Token redacted to standard error and exit with code 1.
12. THE Sentinel_CLI SHALL write no output other than the reports and error text, and SHALL write the Token nowhere.
13. WHEN the Sentinel_CLI is started as `pnpm sentinel <command> ...` from the repository root, THE Sentinel_CLI SHALL receive `<command>` as its first argument.
14. IF the `<file.docx>` of `sentinel check` does not exist or is not a file, THEN THE Sentinel_CLI SHALL write a message to standard error naming the path, write nothing to standard output, write no file, and exit with code 2.
15. IF a file listed by a sweep vanishes before it is read, THEN THE Sentinel_CLI SHALL report it as an `unreadable` Finding with `after` equal to `read_failed` and SHALL NOT stop the run.
16. THE final checkpoint of the implementation SHALL confirm that `pnpm sentinel check <file>` delivers `check` as the first argument of the Sentinel_CLI; IF pnpm swallows the `--` or passes a literal `--`, THEN THE root `package.json` script `sentinel` SHALL be adjusted (for example by dropping the `--`) so that criterion 13 holds, and `BUILD_LOG.md` SHALL note the adjustment.
17. IF writing the `--out` file or the `--json` file fails, THEN THE Sentinel_CLI SHALL write a message with the Token redacted to standard error and exit with code 1, as a refinement of criterion 11.

### Requirement 11: Tests on save

**User Story:** As a maintainer, I want the Sentinel's tests to run when I save a Sentinel file, as for every other package.

#### Acceptance Criteria

1. THE repository SHALL contain `.kiro/hooks/sentinel-tests-on-save.json` as a valid JSON file in the shape of the four existing `*-tests-on-save.json` hooks: `version` `v1`, exactly one hook named "Sentinel tests on save", trigger `PostFileSave`, `timeout_ms` 120000.
2. THE Sentinel_Hook SHALL have the matcher `crew/sentinel/(src|test)/.*\.ts$` (written `crew/sentinel/(src|test)/.*\\.ts$` in the JSON) and the command `perl -e 'alarm shift; exec @ARGV' 120 pnpm vitest run --project sentinel --passWithNoTests`.
3. WHEN a file whose repository-relative path matches the Sentinel_Hook matcher is saved, THE Sentinel_Hook SHALL run its command once for that save.
4. WHEN a file whose repository-relative path does not match the Sentinel_Hook matcher is saved, including a `.ts` file outside `crew/sentinel/src/` and `crew/sentinel/test/`, THE Sentinel_Hook SHALL NOT run its command.
5. IF the command has not exited within 120 seconds, THEN THE Sentinel_Hook SHALL terminate it through the `alarm` wrapper so that it ends before the `timeout_ms` limit of 120000 is reached.

### Requirement 12: Tests

**User Story:** As a reviewer, I want the exact cases of this spec covered by real files and real fixtures, so that a green run means the Sentinel works.

#### Acceptance Criteria

1. THE Sentinel tests SHALL build every `.docx` input with the Export_Package's `buildDocx`, SHALL build a file that is not an Export_File from a real `buildDocx` output whose Statement_Title and Appendix_Title paragraphs are renamed through `fflate` (unzip, rewrite `word/document.xml`, rezip), SHALL use `fflate` to edit and rezip a `word/document.xml`, SHALL import no `docx` module, and THE Sentinel SHALL add no `docx` entry to `devDependencies`.
2. THE Sentinel tests SHALL use recorded fixtures and an injected `fetch` for every citation lookup, and SHALL make zero network requests.
3. IF a Sentinel test calls the injected `fetch` with a request that has no recorded fixture, THEN THE injected `fetch` SHALL throw an error naming the unmatched request, so that the test fails and no network request is made.
4. THE Sentinel tests SHALL import `buildDemoDocument()` and `buildDemoDocumentStatement()` by relative path from `packages/export/test/support/`, SHALL cover `readDocx` of `buildDocx` of that demo Document and demo Statement, and SHALL assert that it returns the filing lines, the Statement_Title, and the Appendix_Lines, each in document order.
5. THE Sentinel tests SHALL cover `splitExport` of a `.docx` that is not an Export_File (a real `buildDocx` output with the Statement_Title and Appendix_Title paragraphs renamed through `fflate`, criterion 1), and SHALL assert that it returns `not_reveal_codes_export`.
6. THE Sentinel tests SHALL cover a zip without `word/document.xml` and a non-zip byte sequence, and SHALL assert that each returns `not_docx`.
7. THE Sentinel tests SHALL cover `body_edited`: exactly one body paragraph is changed in the XML before reading, and the test SHALL assert that the Finding names the line number of that paragraph and carries the two ellipsized strings, the original and the edited.
8. THE Sentinel tests SHALL cover `citation_changed`: for a citation that the fixtures resolve as `verified`, the recorded code in the Appendix is rewritten to `CIT ✘` before parsing, and the test SHALL assert that the Finding reads `not_found` for the recorded status and `verified <clusterId>` for the rechecked status, with the `clusterId` of the fixture.
9. THE Sentinel tests SHALL cover `recheck_unavailable`: the injected `fetch` returns status 429, `lookup` returns `unchecked`, and the test SHALL assert that the Finding carries the `waitUntil` value.
10. THE Sentinel tests SHALL cover `override_stale`: an override on a citation that the fixtures now resolve as `verified`, and the test SHALL assert that the Finding is `override_stale` for that citation.
11. THE Sentinel tests SHALL cover a sweep over a temporary directory that holds exactly two files, one readable and one unreadable, and SHALL assert the processing order, the exit code, the Markdown_Report, and the Json_Report.
12. WHEN a sweep test finishes, THE Sentinel tests SHALL delete the temporary directory they created.
13. THE Sentinel tests SHALL cover `buildDeps` in two cases: with fixtures and no Token, and in live mode with a Token, and SHALL assert that the Token string is absent from `verifierStatus` and from the text of every error; both cases SHALL call `buildDeps` with a plain object and not with `process.env`.
14. THE Sentinel tests SHALL contain Property 1 of Requirement 4, criterion 6, and Property 2 of Requirement 9, criterion 10.
15. WHERE `FC_NUM_RUNS` is unset, THE Sentinel tests SHALL run Property 1 with `numRuns` equal to 50; WHERE `FC_NUM_RUNS` is set, THE Sentinel tests SHALL run Property 1 with `numRuns` equal to `min(FC_NUM_RUNS, 100)`, because packing a `.docx` is slow.
16. THE Sentinel tests SHALL follow `tech.md` and `testing.md`: one `fc.assert(fc.property(...))` per property in a file named `<module>.properties.test.ts`, a `// Property N` comment above each, `_Requirements: x.y_` in each `describe` title, arbitraries taken from the Engine's `arbDocument`, no snapshot test, no `try/catch` that discards an error, and no test that only imports a module.
17. IF `tsc -b` project references reject the import of another package's test folder (criterion 4), THEN THE two support files SHALL move to `packages/export/src/testing/` and be exported as the subpath `@reveal-codes/export/testing`, AND `BUILD_LOG.md` SHALL record which of the two happened; this is the only permitted change to `packages/export` beyond Requirement 3, criterion 1.
18. THE Sentinel tests SHALL cover Requirement 6, criterion 16: a recorded `ambiguous` citation that the fixtures resolve as `ambiguous` with a different candidate count, and SHALL assert that no `citation_changed` Finding is produced; and a pair of `verified` statuses with different cluster ids, and SHALL assert that one `citation_changed` Finding is produced.
19. THE Sentinel tests SHALL cover Requirement 8, criterion 8: a test in which an injected dependency throws inside `analyseFile`, asserting that `analyseFile` returns exactly one `unreadable` Finding with `after` equal to `read_failed`, and that a sweep over a directory holding that file and a second readable file continues and analyses the second file.
20. THE Sentinel tests SHALL cover Requirement 10, criterion 17: a run with `--out` (and a run with `--json`) set to an unwritable path, asserting exit code 1, a standard error message that does not contain the Token, and no output to the unwritable path.

### Requirement 13: Documentation and steering

**User Story:** As a judge reading the repository, I want the Sentinel described where I look for it and the Kiro usage recorded, so that I can see what was built and how.

#### Acceptance Criteria

1. THE README SHALL contain exactly one section whose heading text is "Sentinel", and that section SHALL (a) state which checks the Sentinel performs, (b) show the command `pnpm sentinel sweep ~/Filings`, (c) name the four variables `COURTLISTENER_TOKEN`, `REVEAL_CODES_FIXTURES_ONLY`, `REVEAL_CODES_CACHE_DIR`, and `COURTLISTENER_BASE_URL`, each with a one-line description, and (d) state in exactly one line that the Kiro Crew app that schedules the Sentinel lives in a separate repository, using the link placeholder `<crew app repo>`.
2. THE file `docs/KIRO_USAGE.md` SHALL contain exactly three new rows for this spec: (a) one row naming all five files of `.kiro/specs/sentinel-sweep` (`.config.kiro`, `requirements.md`, `design.md`, `tasks.md`, `tasks.meta.json`), (b) one row for the `sentinel-tests-on-save` hook with the path `.kiro/hooks/sentinel-tests-on-save.json`, and (c) one row for the edits to `structure.md` and `tech.md`; AND each row SHALL follow the column layout of the existing rows, AND existing rows SHALL remain unchanged.
3. THE file `BUILD_LOG.md` SHALL contain exactly one new entry for this spec, dated in YYYY-MM-DD form, that records at least one thing Kiro got wrong together with the change that fixed it, AND records which outcome of Requirement 12, criterion 17 occurred (relative-path import or the `@reveal-codes/export/testing` fallback), AND records the result of the `pnpm sentinel check <file>` confirmation of Requirement 10, criterion 16, AND existing entries SHALL remain unchanged.
4. IF Kiro got nothing wrong during this spec, THEN THE `BUILD_LOG.md` entry for this spec SHALL state explicitly, in a sentence containing the words "Kiro got nothing wrong", that no errors occurred.
5. THE `structure.md` steering file SHALL describe the `crew/sentinel` line as "the sweep CLI that the Reveal Codes Sentinel Crew app (separate repository) runs on a schedule", AND SHALL contain no other description of `crew/sentinel` that names it a Crew app.
6. THE `tech.md` steering file SHALL replace "Crew app: `crew/sentinel`" in its workspace list with the sweep CLI `crew/sentinel`, AND SHALL add `pnpm sentinel` as one new entry, with a trailing comment, to its Commands code block; AND the existing commands in that block SHALL remain unchanged.
7. THE file `.env.example` already lists `COURTLISTENER_TOKEN`, `COURTLISTENER_BASE_URL`, `REVEAL_CODES_FIXTURES_ONLY`, and `REVEAL_CODES_CACHE_DIR` and SHALL NOT be edited by this spec; THE Sentinel static tests SHALL assert that each of those four names appears in `.env.example`, and SHALL assert nothing more about that file.

## Known limitations

Standing rule (carried over from the earlier specs, user decision): anything that affects only malformed input or a rare citation or editing style is recorded here as one line, with no spec change and no stop.

- L1. A filing paragraph that equals the Statement_Title makes `splitExport` cut the Body at that paragraph, so the sweep reports `body_edited`, `appendix_unparseable`, or `not_reveal_codes_export` for that file.
- L2. The `docx` package drops XML-illegal control characters (limitation L5 of the export-certification spec), so a filing exported with one carries a Body shorter than its Appendix text and the sweep reports `body_edited` for that file from the day of export.
- L3. A numeric character reference that names no valid character (zero, a lone surrogate, or a value above U+10FFFF) is left as written in the paragraph text.
- L4. A `w:p` nested in a text box inside another paragraph is read as a separate paragraph in tag order; a file the Export_Package produced has none.
- L5. A file re-saved by Word may split or alter the Statement_Title paragraph, so the sweep reports `not_reveal_codes_export` for it.
- L6. Fixtures mode is the demo mode: only recorded responses answer, so a real citation that the fixtures do not hold is reported as changed (not found), and no Finding is suppressed; the Markdown_Report states the mode in its summary line and, in fixtures mode, adds the Fixtures_Notice.
- L7. Word lock files named `~$<name>.docx` are skipped silently by `sweep` and are neither Findings nor counted; `check` on such a file analyses it like any other file.
- L8. The sweep reads each file whole into memory and applies no size limit; the sweep does not recurse into subdirectories.
- L9. When the Engine rejects a `setVerification` or `setQuoteCheck` call (for example a Lexis citation that the CourtListener does not list), the record keeps its Recorded_Status and no Finding is produced for it.
- L10. A live sweep of many files is slow, because opinion fetches run one after another and the Verifier's token bucket limits lookups.
- L11. Token redaction replaces the exact Token string only; a transformed copy of the Token (for example URL-encoded) in an error text is not recognised.
- L12. A file name that contains a line feed breaks the `## <file>` heading of the Markdown_Report; the Json_Report keeps the name exactly.
- L13. After a `body_edited` Finding, the line numbers of other Findings count lines of the Recorded_Document text (the Appendix), not of the edited Body.
