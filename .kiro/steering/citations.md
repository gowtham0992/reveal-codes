---
inclusion: fileMatch
fileMatchPattern: ["packages/engine/src/citations/**", "packages/verifier/**"]
---

# Legal citation handling

Scope for v1: **US case law citations** in Bluebook-style forms. Statutes, regulations, and secondary sources are recognised as `other` and not verified.

Recognise at minimum:

- Reporter citations: `<vol> <reporter> <page>` with optional pincite, court, and year: `410 U.S. 113, 116 (1973)`, `598 F.3d 1, 7 (2d Cir. 2010)`, `123 Cal. App. 4th 456 (2004)`.
- Westlaw and Lexis forms: `2024 WL 123456`, `2023 U.S. Dist. LEXIS 98765` (recognised; verification may return `unchecked` when the source cannot resolve them).
- Short forms: `Id.`, `Id. at 118`, `Roe, 410 U.S. at 116`. Short forms attach to the nearest preceding full citation in the same document and inherit its verification status.
- Parallel citations separated by commas resolve as one citation with multiple reporters.

Reporter abbreviations: use the Free Law Project `reporters-db` list as the source of truth, vendored as JSON in `packages/engine/src/citations/reporters.json` with its licence note. Do not hand-type reporter lists.

Extraction contract:

- `extract(text)` returns citations with exact `[start, end)` offsets into the input. `text.slice(start, end)` must equal the citation as written. No normalisation in offsets.
- `format(citation)` produces a canonical form; `extract(format(c))` must return a citation equal to `c` for every valid `c` (round trip property).
- Near misses (`410 US 113`, `410 U. S. 113`) are extracted and normalised; garbage (`410 Q.Z. 113`) is not extracted.

CourtListener facts the verifier is built around (verified 2026-11-02 against the official API help page):

- `POST https://www.courtlistener.com/api/rest/v4/citation-lookup/` with `Authorization: Token …`. Body is either `text` (whole document, up to 64,000 characters) or `volume`/`reporter`/`page` for one citation.
- Per-citation `status` in the response: `200` found (one cluster), `300` ambiguous (several `normalized_citations` and clusters), `404` valid form but not in the database, `400` reporter not recognised, `429` identified but not looked up because the request exceeded 250 citations. Response also carries `start_index`/`end_index` into the submitted text and `normalized_citations`.
- Throttle: 60 valid citations per minute; a refused request returns HTTP 429 with a `wait_until` ISO-8601 timestamp. General account limits also apply: free accounts 5 requests/min, 50/hour, 125/day; $10/month Tier 1 is 10/75/300; nonprofit legal-services organisations get Tier 1 free.
- The endpoint does not match `Id.`, `supra`, statutes, or law-journal citations. Short forms are resolved by the engine (linked to the preceding full citation) and never sent.
- Opinion text for quote checks comes from `GET /api/rest/v4/opinions/{id}/` (`plain_text`, falling back to stripped `html*` fields); one general request per opinion, so fetch only opinions that have quote candidates, and cache.

Design consequences: one `citation-lookup` request per verify action for the whole document (the 64k/250 budget covers any filing); opinions fetched lazily and cached on disk for 24h; when throttled, statuses become `unchecked` with the `wait_until` shown in the UI, never `verified`.

Verification contract (verifier package):

- `lookup(documentText)` sends one `text` request, maps `200→verified` (with cluster id), `300→ambiguous` (with candidate list), `404→not_found`, `400→not_found` with reason `unknown_reporter`, `429`/throttle→`unchecked` (with `wait_until`), and caches by normalised citation for 24h. `unchecked` is never silently treated as verified.
- `checkQuote(clusterId, quote)` normalises whitespace, curly quotes, and ellipses on both sides, then requires a verbatim match of the quote inside the opinion text. Partial matches are reported with the longest matching prefix length so the UI can show where the quote diverges.
- All network access goes through the injected `fetch`. Respect `Retry-After`. Never retry more than twice.
