# Requirements Document

## Introduction

`packages/engine` is the pure, dependency-free core of Reveal Codes. It models a document as text plus provenance spans, applies edit operations while keeping provenance exact, segments text into sentences losslessly, extracts US case-law citations with exact offsets, stores verification and quote-check results written by callers, computes which issues block export, and serialises the whole structure in two Render_Modes: a Full_Rendering that parses back into the Document, and a Display_Rendering for the Reveal Codes pane that is a pure projection of the Full_Rendering.

The engine has no knowledge of the DOM, TipTap, CourtListener, or any LLM. It receives values and returns new immutable values. It never reads a clock, a random source, the network, or the file system. Verification statuses are written into the document by callers (the verifier and the app); the engine only stores, re-anchors, resets, and renders them.

This spec is constrained by `.kiro/steering/tech.md`, `citations.md`, `testing.md`, `product.md`, and `structure.md`. Where the original request and the steering files differ, the steering files win and the reconciliation is recorded in "Notes for the user" at the end. Each requirement cites the original request item it derives from as "(Request x.y)" or marks itself "(Added)".

Out of scope: network access, CourtListener, LLM providers, UI, DOCX and PDF export.

## Glossary

- **Engine**: the `@reveal-codes/engine` package in `packages/engine`; the system under specification.
- **Repository**: the `reveal-codes` source repository that contains the Engine and `BUILD_LOG.md`.
- **Text**: a JavaScript string held by a Document.
- **Offset**: an index into a Text measured in UTF-16 code units, the native unit of JavaScript strings.
- **Surrogate_Pair**: two adjacent UTF-16 code units that together encode one Unicode code point above U+FFFF.
- **Valid_Boundary**: an Offset in [0, Text.length] that does not fall between the two code units of a Surrogate_Pair.
- **Timestamp**: an ISO-8601 UTC string supplied by the caller. The Engine stores Timestamps and never generates them.
- **Structural_Equality**: the equality defined in Requirement 1.4: the same primitive values, the same object keys with structurally equal values, and the same array elements in the same order. Where this spec says two Documents are "equal" without listing fields, it means Structural_Equality of every field of the Document, including the Issue_Key_Counter.
- **Origin**: one of `HUM` (typed by the author), `PST` (entered from outside the editor, pasted or imported, and also the Origin of text whose origin cannot be known), `AI` (inserted by the assistant), `AI>HUM` (inserted by the assistant and then substantially edited by the author), as defined in product.md.
- **Run**: one assistant insertion event, identified by a Run_Id. The Run table holds one entry per Run, recording the Run's Original_Length, Cumulative_Edited_Count, and Relabelled_Flag.
- **Relabelled_Flag** (written "relabelled flag" in criteria): a boolean stored in a Run's Run table entry, `false` when the entry is created, set to `true` only by relabelling under Requirement 6.3, and cleared only by an Inverse under Requirement 5.4. A Run whose Relabelled_Flag is `true` is a relabelled Run.
- **Run_Id**: a non-empty string identifying a Run, rendered in codes such as `[AI:r7]`.
- **Original_Length**: the total number of code units inserted with Origin `AI` under one Run_Id.
- **Cumulative_Edited_Count** (written "cumulative edited count" in criteria): a non-negative integer stored in a Run's Run table entry, starting at 0, increased only as Requirement 6.1, 6.2, and 6.9 specify, and restored only by an Inverse.
- **Provenance_Record**: the tuple (Origin, Run_Id, Timestamp). Run_Id is present if and only if Origin is `AI` or `AI>HUM`.
- **Mergeable**: two Provenance_Records (or two Spans, or a Span and a Provenance_Record) are Mergeable when their Origins are equal and their Run_Ids are equal or both absent. Timestamps are ignored.
- **Span**: a contiguous, non-empty run of characters `[start, end)` sharing one Provenance_Record.
- **Document**: an immutable value holding a Text, an ordered list of Spans, a Run table, Citations with their Verification_Results, Quote_Candidates with their Quote_Check_Results, Overrides, and an Issue_Key_Counter.
- **Coverage_Invariant**: the condition that a Document's Spans are non-empty, pairwise non-overlapping, sorted by start, and together cover [0, Text.length) exactly with no gaps.
- **Canonical_Document**: a Document satisfying the Coverage_Invariant in which no two adjacent Spans are Mergeable.
- **Actor**: the Origin on whose behalf an Operation is performed. A delete carries an Actor; insert and replace carry a Provenance_Record whose Origin is the Actor.
- **Operation**: one of Insert(at, text, provenance), Delete(from, to, actor), Replace(from, to, text, provenance), or an engine-produced inverse value.
- **Caller_Operation**: an Insert, Delete, or Replace constructed and supplied by a caller, as distinct from an Inverse returned by the Engine. A forward Operation is a Caller_Operation.
- **Inverse**: the Operation returned alongside a new Document that, when applied to the new Document, yields a Document equal to the previous one.
- **Edited_Proportion**: for a Run, the Run's Cumulative_Edited_Count (code units deleted by Actor `HUM` from that Run's Spans plus code units inserted by Actor `HUM` strictly inside that Run's extent) divided by the Run's Original_Length.
- **Run_Extent**: the Offset range from the start of a Run's first Span to the end of its last Span.
- **Relabel_Threshold**: a number in (0, 1], default 0.4, supplied in the Engine configuration.
- **Sentence**: a `[start, end)` range of Text produced by the Segmenter, with its Dominant_Origin and Origin set.
- **Dominant_Origin**: the Origin covering the most code units within a Sentence; ties broken by the earliest-starting Span.
- **Segmenter**: the Engine function `segment(text, spans)` that returns Sentences.
- **Legal_Abbreviation**: one of `Id.`, `v.`, `Inc.`, `Corp.`, `Ltd.`, `Co.`, `L.P.`, `N.A.`, `L.L.C.`, `No.`, `Cir.`, `Dist.`, `Ct.`, `Fed.`, `Supp.`, `et al.`, plus every reporter abbreviation in the Reporter_List.
- **Entity_Suffix**: the two code units `, ` followed by exactly one of `Inc.`, `LLC`, `L.L.C.`, `Ltd.`, `Co.`, `Corp.`, `L.P.`, `N.A.`, compared case-sensitively. Example: the `, Inc.` in `Smith, Inc.`.
- **Reporter_List**: the Free Law Project `reporters-db` reporter abbreviations, vendored as `packages/engine/src/citations/reporters.json` with its licence note.
- **Reporter_Citation**: `<volume> <reporter> <page>` with optional pincite, court, and year, e.g. `410 U.S. 113, 116 (1973)`, `598 F.3d 1, 7 (2d Cir. 2010)`, `123 Cal. App. 4th 456 (2004)`.
- **Database_Citation**: a Westlaw or Lexis form, e.g. `2024 WL 123456`, `2023 U.S. Dist. LEXIS 98765`.
- **Parallel_Citation**: two or more Reporter_Citations for the same opinion separated by commas, treated as one Full_Citation with multiple reporters.
- **Full_Citation**: a Reporter_Citation, Database_Citation, or Parallel_Citation.
- **Short_Form**: `Id.`, `Id. at <page>`, or `<party>, <volume> <reporter> at <page>`, where `<party>` is a Short_Form_Party.
- **Party_Stop_List**: the fixed list of every Signal (which includes `Citing` and `Quoting`) plus `In`, `As`, `Under`, `Following`, `Applying`, `The court in`, and `The Court in`. Entries are compared case-sensitively.
- **Short_Form_Party**: the `<party>` of a Short_Form of the form `<party>, <volume> <reporter> at <page>`, found as follows.
  - A Capitalised_Word is a string of non-space code units whose first code unit is an uppercase Unicode letter and whose remaining code units are Unicode letters, ASCII digits, `'`, `’`, or `-`, except that the whole string may instead be a Legal_Abbreviation other than `v.` or a Single_Capital_Initial ending in `.`.
  - A Connector is one of the words `&`, `of`, `the`, `and`, or the two-word sequence `ex rel.`.
  - A Word_Run is a sequence of Capitalised_Words and Connectors separated by single ASCII spaces, whose first and last words are Capitalised_Words, so that every Connector lies between two Capitalised_Words (consecutive Connectors, as in `Board of the City`, are allowed). A Word_Run contains no `,`, no quotation mark, no `v.` word, and no `<digits> <token> <digits>` substring.
  - A Party_Side is a Word_Run optionally followed by exactly one Entity_Suffix, e.g. `Smith` or `Smith, Inc.`.
  - A Party_Run is either one Party_Side, or two Party_Sides joined by the four code units ` v. `, e.g. `Roe v. Wade` or `Acme, Inc. v. Smith, LLC`. The word `v.` therefore appears at most once in a Party_Run and only between two Party_Sides, each of which starts with a Capitalised_Word and ends with a Capitalised_Word or an Entity_Suffix. Each Party_Side carries at most one Entity_Suffix. A Party_Run contains a `,` only as the first code unit of an Entity_Suffix, and contains no quotation mark and no `<digits> <token> <digits>` substring.
  - The Short_Form_Party is obtained by taking the longest Party_Run that ends immediately before `, <volume>` and whose first code unit is preceded by the start of the Text or by a code unit that is not a Unicode letter, ASCII digit, `.`, `'`, `’`, or `-`, and then repeatedly removing from its start any Party_Stop_List entry that is followed by a space, together with any Connectors that then lead it, until neither an entry nor a Connector remains at its start. Each removed entry or Connector is removed together with the space after it. Example: `In the Matter of Smith, 5 U.S. at 9` gives `Matter of Smith`. Only whole entries are removed: `The Smith Corp., 5 U.S. at 9` keeps `The Smith Corp.` because `The` alone is not an entry. Because a Party_Run's longest match includes any Entity_Suffix and any ` v. ` side, `Smith, Inc., 5 U.S. at 9` gives `Smith, Inc.`, not `Inc.`, and `Roe v. Wade, 410 U.S. at 153` gives `Roe v. Wade`, not `Wade`.
  - The Short_Form_Party is 1 to 80 code units long, the same bound as a Party_Name, counted over the whole stripped party including any ` v. ` and every Entity_Suffix. If the stripped result is empty, is not itself a Party_Run (for example because stripping left it starting with `v.`), or the Party_Run exceeds 80 code units, the text yields no Short_Form of this form.
  - Examples: `In Casey, 505 U.S. at 833` gives `Casey`; `Planned Parenthood, 505 U.S. at 833` and `See Planned Parenthood, 505 U.S. at 833` give `Planned Parenthood`; `Roe v. Wade, 410 U.S. at 153` and `See Roe v. Wade, 410 U.S. at 153` give `Roe v. Wade`; `Smith, Inc., 5 U.S. at 9` gives `Smith, Inc.`; `Acme, Inc. v. Smith, 5 U.S. at 9` gives `Acme, Inc. v. Smith`.
- **Orphan**: a Short_Form that has no Full_Citation to link to.
- **Other_Reference**: a statute, regulation, or secondary-source reference recognised but not verified, per citations.md. An Other_Reference is not a citation under product.md's vocabulary ("a reference to a judicial opinion"): it carries no Verification_Result and no Issue_Key, is never an Issue, never takes an Override or an `[OVR]` Code, and is marked in Reveal_Codes_Text only by the non-blocking reference Code pair `[REF]` … `[/REF]`.
- **Citation**: a Full_Citation, Short_Form, or Other_Reference extracted from Text, carrying its `[start, end)` Offsets, the text as written, its Citation_Value, its Issue_Key (except an Other_Reference, which has none), and, for near misses, its Normalised_Form.
- **Citation_Identifier** (written "Citation identifier" in criteria): the value a caller uses to address one Citation in a Document. A Citation's identifier is its Issue_Key.
- **Citation_Value**: the structured fields of a Citation excluding Offsets: kind, volume, reporter(s), page, pincite, court, year, and link target for Short_Forms.
- **Canonical_Form**: the string `format(citation)` produces for a Citation_Value.
- **Near_Miss**: a citation string whose reporter matches a Reporter_List entry after removing or collapsing periods and spaces, e.g. `410 US 113`, `410 U. S. 113`.
- **Normalised_Form**: the Canonical_Form of a Near_Miss.
- **Garbage_Citation**: a `<volume> <token> <page>` string whose token matches no Reporter_List entry under exact or Near_Miss comparison, e.g. `410 Q.Z. 113`.
- **Extractor**: the Engine function `extract(text)` returning Citations and Quote_Candidates. The Extractor is infallible and returns a plain value, not a Result (Requirement 9.9).
- **Quotation_Pair**: a straight `"` followed by the next straight `"`, or a curly `“` followed by the next curly `”`, as paired under Requirement 13.1. Its closing mark is the second mark of the pair and its opening mark the first.
- **Signal**: a Bluebook introductory signal word, used by the Party_Name rule and the Party_Stop_List: every Gap_Signal in the capitalised form listed under Gap_Signal (`See`, `See also`, `See, e.g.,`, `E.g.,`, `Accord`, `Cf.`, `But see`, `Compare`, `Citing`, `Quoting`), plus `But cf.`, `Contra`, `E.g.`, and `See generally`. Signals are compared case-sensitively.
- **Gap_Signal**: exactly one of `See`, `See also`, `See, e.g.,`, `E.g.,`, `Accord`, `Cf.`, `But see`, `Compare`, `Citing`, `Quoting`, either as listed or with only its first letter lowercased (`see`, `see also`, `see, e.g.,`, `e.g.,`, `accord`, `cf.`, `but see`, `compare`, `citing`, `quoting`), compared case-sensitively otherwise. A Gap_Signal may appear in the gap of a Preceding_Quote (Requirement 13.1) and nowhere else in quote attachment. The word `with` (as in `Compare … with`) is not a Gap_Signal.
- **Party_Name**: a string of 1 to 80 code units with all of these properties: every code unit is a Unicode letter, an ASCII digit, a space, or one of `.` `,` `'` `’` `&` `-`; it begins with a letter or digit and ends with a code unit other than a space or `,`; it contains no two consecutive spaces; every `.` in it is one of the periods of an occurrence of a Legal_Abbreviation (including the inner periods of `L.L.C.`, `L.P.`, and `N.A.`) or the period of a Single_Capital_Initial; it may end with one Entity_Suffix, as in `Acme, L.L.C.` or `Smith, Inc.`; it contains no substring ` v. `; it does not begin with a Signal followed by a space, `,`, or the end of the Party_Name; and it contains no substring of the form `<digits> <token> <digits>`, so that no Full_Citation, Near_Miss, or Garbage_Citation lies inside it. A Party_Name contains no quotation mark, `?`, or `!`, because those code units are not in its character set.
- **Single_Capital_Initial**: one ASCII capital letter followed by `.`, preceded by the start of the Party_Name or a space, e.g. the `J.` in `J. Smith`.
- **Case_Name**: a Party_Name, then the four code units ` v. `, then a Party_Name, then `,`. Examples: `Roe v. Wade,` and `Acme, L.L.C. v. Smith,`. The `<party>` of a Short_Form of the form `<party>, <volume> <reporter> at <page>` is not a Case_Name: it is a Short_Form_Party, which may itself contain ` v. `, and lies inside the Short_Form's own range (Requirement 12.2), so a quote before such a Short_Form needs no Case_Name in its gap. Party_Stop_List words removed from the start of a Short_Form_Party lie outside the Short_Form's range, in the gap. A quote followed by `See Planned Parenthood, 505 U.S. at 833` therefore attaches under Requirement 13.1, because the stripped `See` is a Gap_Signal, while a quote followed by `In Casey, 505 U.S. at 833` does not attach, because `In` is not a Gap_Signal.
- **Preceding_Quote**: a Quote_Candidate attached under Requirement 13.1 to a Citation that follows it.
- **Following_Quote**: a Quote_Candidate attached under Requirement 13.8 to a Citation that precedes it.
- **Quote_Candidate**: the text between the marks of a Quotation_Pair, attached under Requirement 13 to exactly one Full_Citation or Short_Form as a Preceding_Quote or a Following_Quote, with its own Offsets and its own Issue_Key. A Quotation_Pair that satisfies neither attachment rule yields no Quote_Candidate. One Citation may have several Quote_Candidates.
- **Quote_Candidate_Identifier** (written "Quote_Candidate identifier" in criteria): the value a caller uses to address one Quote_Candidate in a Document. A Quote_Candidate's identifier is its Issue_Key.
- **Verification_Status**: one of `verified`, `not_found`, `ambiguous`, `unchecked`, as defined in product.md.
- **Verification_Result**: a Verification_Status plus its payload: cluster id for `verified`; two or more candidate cluster ids for `ambiguous`; optional reason (e.g. `unknown_reporter`) for `not_found`; optional `wait_until` Timestamp for `unchecked`.
- **Quote_Check_Result**: one of `unchecked`, `match`, or `mismatch` carrying the longest matching prefix length in code units.
- **Issue**: any of the following: a Full_Citation whose Verification_Status is not `verified` (that is, `not_found`, `ambiguous`, or `unchecked`, including `unchecked` with a `wait_until`); a Quote_Candidate whose Quote_Check_Result is not `match` (that is, `mismatch` or `unchecked`), including a Quote_Candidate attached to an Orphan; or an Orphan. A linked Short_Form is not an Issue (its target Full_Citation is), and an Other_Reference is never an Issue.
- **Issue_Key**: an identifier carried by every Full_Citation, every Short_Form, and every Quote_Candidate, whether or not it is currently an Issue, and stable across edits that do not change its own characters (Requirement 15). Other_References carry no Issue_Key.
- **Issue_Key_Counter**: a non-negative integer stored in a Document, 0 in a newly created Document's starting state, used only to assign Issue_Keys.
- **Issue_Key assignment**: the rule by which the Engine gives a Full_Citation, Short_Form, or Quote_Candidate a new Issue_Key; Other_References are skipped and do not advance the Issue_Key_Counter. The Engine takes the Document's current Issue_Key_Counter value `n`, sets the Issue_Key to a string derived only from `n` (format chosen in design.md), and increments the counter. Items needing new keys are assigned in ascending start Offset, with a Citation before a Quote_Candidate at an equal start. At Document creation every extracted item is assigned a key this way; after an Operation only items that do not carry a key over under Requirement 15 are. Because the counter only increases on forward Operations, a newly assigned key never equals a key present in the previous Document, and no randomness is used.
- **Override**: a record of (Issue_Key, reason, Timestamp) with a reason containing at least one non-whitespace character.
- **Blocking_Issue**: an Issue with no Override.
- **Escape_Character**: the single character the Renderer uses to escape literal `[`, `]`, and itself in Reveal_Codes_Text, chosen in design.md.
- **Code**: a bracketed token in Reveal_Codes_Text drawn from the Code_Vocabulary.
- **Code_Vocabulary**: exactly the binding code list in `.kiro/steering/product.md` under "Codes (binding)", and no other Codes:
  - provenance Codes, one at the start of every Span: `[HUM]` (typed by the author), `[PST]` (entered from outside the editor, or origin unknown), `[AI:<run>]` (inserted by the assistant in Run `<run>`), `[AI>HUM:<run>]` (inserted by the assistant in Run `<run>`, then substantially edited by the author);
  - citation Codes, opening at the start of a Full_Citation or Short_Form: `[CIT ✓]` (`verified`), `[CIT ✘]` (`not_found`), `[CIT ?]` (`ambiguous`, showing the candidate count), `[CIT …]` (`unchecked`, including an Orphan);
  - quote Codes, opening at the start of a Quote_Candidate: `[QUO ✓]` (`match`), `[QUO ✘]` (`mismatch`), `[QUO …]` (`unchecked`);
  - reference Code, opening at the start of an Other_Reference: `[REF]` (recognised non-case reference; never verified, never blocking, carries no Payload);
  - structural Codes: `[/CIT]`, `[/QUO]`, and `[/REF]` (close the most recent citation, quote, or reference Code), `[OVR]` (the author's Override reason for the Issue whose opening Code it follows), and `[DOC]` (document header carrying Engine state, present only in a Full_Rendering).
- **Render_Mode**: one of `full` or `display`, passed to the Renderer.
- **Payload**: a field value a Code carries beyond its name, such as a Timestamp, Issue_Key, Run table entry, cluster id, candidate cluster id list, `wait_until`, longest matching prefix length, run id, candidate count, or Override reason.
- **Retained_Payload**: the only Payloads a Display_Rendering shows: the run id in `[AI:<run>]` and `[AI>HUM:<run>]`, the candidate count in `[CIT ?]`, and the reason text in `[OVR]`.
- **Payload_Section**: the syntactically delimited part inside a Code's brackets in a Full_Rendering that holds every Payload of that Code other than its Retained_Payload. Its syntax is chosen in design.md.
- **Full_Rendering**: the Reveal_Codes_Text and Code_Positions `render(doc, "full")` returns, in which every Code carries every Payload and which the Parser reads back.
- **Display_Rendering**: the Reveal_Codes_Text and Code_Positions `render(doc, "display")` returns for the Reveal Codes pane, carrying only Retained_Payloads and no `[DOC]` Code.
- **Strip**: the pure function on Reveal_Codes_Text strings that removes the whole `[DOC]` Code and the Payload_Section of every other Code, keeping every other character (including escaped Text and Retained_Payloads) in place. Strip is defined only in terms of the text, so it can be applied without access to the Engine's internals. Applied to a list of Code_Positions, Strip removes the `[DOC]` entry and applies Strip to the Code of every other entry, keeping its Offset.
- **Reveal_Codes_Text**: the string produced by `render(doc, mode)`.
- **Code_Position**: an (Offset, Code) pair returned by `render` giving the Text Offset at which a Code appears.
- **Renderer**: the Engine function `render(doc, mode)`.
- **Parser**: the Engine function `parse(revealCodesText)`, which reads a Full_Rendering.
- **Result**: the discriminated union `{ ok: true, value } | { ok: false, error }` the Engine returns for fallible functions.
- **Engine_Error**: a plain-data error value with a discriminating `kind` field and the Offsets or input that caused it. The kinds this spec defines are `invalid_provenance`, `split_surrogate`, `invalid_timestamp`, `invalid_spans`, `out_of_range`, `inverted_range`, `invalid_config`, `stale_inverse`, `invalid_citation`, `unknown_citation`, `not_verifiable`, `invalid_verification_result`, `unknown_quote`, `invalid_quote_result`, `empty_override_reason`, `unknown_issue`, and `malformed_codes`.
- **Benchmark_Script**: the script in `packages/engine/bench/` that measures Requirement 21. It lives outside `packages/engine/src` because it reads a clock.
- **Reference_Machine**: the machine named in `BUILD_LOG.md` on which performance is measured.

## Requirements

### Requirement 1: Purity, determinism, and packaging (Added)

**User Story:** As a maintainer, I want the engine to be pure and dependency-free, so that its output is reproducible and it runs unchanged in the browser, on the server, and in tests.

#### Acceptance Criteria

1. THE Engine SHALL declare zero entries under `dependencies`, `peerDependencies`, and `optionalDependencies` in `packages/engine/package.json`, with test-only tooling (vitest, fast-check) declared only under `devDependencies`.
2. THE Engine SHALL contain no import or reference to a `node:` module or a DOM global (for example `window`, `document`) in any source file under `packages/engine/src`, and no import of any package outside `packages/engine`; the one exception is `packages/engine/src/testing/arbitraries.ts`, which may import fast-check and which the Engine's public entry point SHALL NOT export.
3. THE Engine SHALL contain no reference in any source file under `packages/engine/src` to a clock, random source, network, or file-system facility, including `Date`, `performance`, `Math.random`, `crypto`, `fetch`, `XMLHttpRequest`, `setTimeout`, and `setInterval`.
4. WHEN any exported Engine function is called twice with structurally equal arguments, in the same process or in different processes, THE Engine SHALL return structurally equal results. Structurally equal means the same primitive values, the same object keys with structurally equal values, and the same array elements in the same order.
5. THE Engine SHALL obtain every Timestamp, Run_Id, and configuration value (including Relabel_Threshold) from its caller's arguments, and SHALL return only Timestamps and Run_Ids that appeared in those arguments or in a Document passed as an argument.
6. WHEN any exported Engine function returns, whether it succeeded or returned an Engine_Error, THE Engine SHALL leave every argument it received, including every input Document, structurally equal to its state before the call.
7. IF an exported Engine function receives arguments that conform to its exported TypeScript types but cannot complete the requested computation, THEN THE Engine SHALL return a Result whose `ok` field is `false` and whose `error` is an Engine_Error with a `kind` field naming the failure, and SHALL NOT throw an exception.
8. WHEN an exported Engine function completes successfully, THE Engine SHALL return a Result whose `ok` field is `true` and whose `value` holds the output. This applies to every function the Glossary or a later requirement declares fallible.
9. THE Engine SHALL expose its public API through named exports only from its package entry point, with zero default exports in any module under `packages/engine/src`.

### Requirement 2: Document creation (Request 1.1, 1.4)

**User Story:** As the editor app, I want to create a document from pasted text, so that pasted drafts start with exact provenance.

#### Acceptance Criteria

1. WHEN a Document is created from a non-empty string that contains no unpaired surrogate and a valid caller-supplied Timestamp, THE Engine SHALL return a Result with `ok` set to `true` whose Document has Text equal to the string code unit for code unit, exactly one Span covering [0, Text.length) with Provenance_Record (Origin `PST`, no Run_Id, that Timestamp), an empty Run table, and zero Overrides.
2. WHEN a Document is created from the empty string and a valid caller-supplied Timestamp, THE Engine SHALL return a Result with `ok` set to `true` whose Document has empty Text, zero Spans, an empty Run table, zero Citations, zero Quote_Candidates, and zero Overrides.
3. WHEN a Document is created, THE Engine SHALL set the Document's Citations and Quote_Candidates to exactly the output of the Extractor on the Text, with identical Offsets, Citation_Values, and Normalised_Forms and in the same document order. Each Full_Citation SHALL carry Verification_Status `unchecked` with no `wait_until`, and each Quote_Candidate SHALL carry Quote_Check_Result `unchecked`.
4. THE Engine SHALL represent Origin as exactly one of `HUM`, `PST`, `AI`, `AI>HUM`.
5. IF any Engine function receives a Provenance_Record with Origin `AI` or `AI>HUM` and an absent or empty-string Run_Id, or with Origin `HUM` or `PST` and a Run_Id present, THEN THE Engine SHALL return a Result with `ok` set to `false` and an Engine_Error of kind `invalid_provenance`, and SHALL return no Document. This criterion governs the shape of a Provenance_Record only. Requirement 7.4 additionally restricts the Origins a Caller_Operation may carry, and the Parser accepts well-formed `AI>HUM` Spans under Requirement 20.
6. IF the string supplied for Document creation contains an unpaired surrogate code unit, THEN THE Engine SHALL return a Result with `ok` set to `false` and an Engine_Error of kind `split_surrogate` carrying the Offset of the first unpaired surrogate, and SHALL return no Document.
7. IF the Timestamp supplied for Document creation is not an ISO-8601 UTC string, THEN THE Engine SHALL return a Result with `ok` set to `false` and an Engine_Error of kind `invalid_timestamp` carrying the supplied value, and SHALL return no Document.

### Requirement 3: Coverage invariant and canonical form (Request 1.2, 1.3)

**User Story:** As a maintainer, I want one canonical span representation for each provenance state, so that equality checks and round trips are exact.

#### Acceptance Criteria

1. THE Engine SHALL return only Documents that satisfy the Coverage_Invariant from every Engine function that returns a Document, including Document creation, Operation and Inverse application, normalisation, and the Parser.
2. THE Engine SHALL return only Canonical_Documents from every Engine function that returns a Document.
3. WHEN normalisation is applied to a list of Spans that satisfies the Coverage_Invariant, THE Engine SHALL merge each maximal sequence of adjacent, pairwise Mergeable Spans into one Span that starts at the first Span's start, ends at the last Span's end, and carries the shared Origin and Run_Id (or its absence) together with the Timestamp of the first (lowest-start) Span in the sequence. Timestamps play no part in deciding whether Spans merge.
4. WHEN normalisation is applied to a Canonical_Document, THE Engine SHALL return a Document equal to the input in Text, Spans, Run table, Citations, Verification_Results, Quote_Candidates, Quote_Check_Results, Overrides, and Issue_Key_Counter (idempotence).
5. WHEN normalisation is applied, THE Engine SHALL return Spans such that, for every Offset i in [0, Text.length), the Origin and Run_Id covering code unit i after normalisation equal the Origin and Run_Id that covered code unit i before normalisation, and the Timestamp covering code unit i after normalisation equals the Timestamp of the lowest-start input Span in the merged sequence that contains code unit i.
6. IF normalisation receives a list of Spans that violates the Coverage_Invariant, meaning it contains an empty Span, overlapping Spans, Spans not sorted by start, a gap, or coverage other than exactly [0, Text.length), THEN THE Engine SHALL return an Engine_Error of kind `invalid_spans` that identifies the Offset of the first violation, and SHALL return no Document.
7. WHEN two Canonical_Documents have equal Text and the same Origin and Run_Id at every Offset in [0, Text.length), THE Engine SHALL represent both with Span lists of the same count, with the same starts and ends and the same Origin and Run_Id in the same order; the two Span lists SHALL then be identical if and only if each pair of corresponding Spans also has equal Timestamps.

### Requirement 4: Edit operations (Request 2.1, 2.2, 2.3)

**User Story:** As the editor app, I want to apply insert, delete, and replace operations, so that every character's provenance stays exact as the author edits.

#### Acceptance Criteria

1. WHEN Insert(at, text, provenance) is applied with a Valid_Boundary `at` and a non-empty `text` that contains no unpaired surrogate, THE Engine SHALL return a Document whose Text equals `old.slice(0, at) + text + old.slice(at)` and whose Spans meet three conditions: the code units [at, at + text.length) have the Origin and Run_Id of `provenance` (subject to Requirement 6.11 for a relabelled Run); every code unit at old Offset `i < at` keeps its previous Origin and Run_Id at Offset `i`; and every code unit at old Offset `i >= at` keeps its previous Origin and Run_Id at Offset `i + text.length`. Timestamps follow criterion 11.
2. WHEN Insert is applied at an Offset strictly inside an existing Span that is not Mergeable with `provenance`, THE Engine SHALL split that Span into two Spans with the original Provenance_Record, one covering [span.start, at) and one covering [at + text.length, span.end + text.length), with the inserted Span between them.
3. WHEN Insert is applied at an Offset equal to an existing Span boundary, or at 0 or Text.length, THE Engine SHALL split no existing Span, and SHALL merge the inserted code units with an adjacent Span only if that Span is Mergeable with `provenance`, as Requirement 3.3 requires. When the inserted code units merge with a preceding Mergeable Span they take that Span's Timestamp; when a following Mergeable Span merges with the inserted code units, that following Span's code units take the Timestamp of `provenance`.
4. WHEN Delete(from, to, actor) is applied with Valid_Boundaries `from < to`, THE Engine SHALL return a Document whose Text equals `old.slice(0, from) + old.slice(to)`. Every code unit at old Offset `i < from` SHALL keep its previous Origin and Run_Id at Offset `i`. Every code unit at old Offset `i >= to` SHALL keep its previous Origin and Run_Id at Offset `i - (to - from)`. Every Span lying entirely inside [from, to) SHALL be dropped. Timestamps follow criterion 11.
5. WHEN Delete(0, Text.length, actor) is applied to a Document with non-empty Text, THE Engine SHALL return a Document with empty Text and zero Spans. Every Run table entry SHALL be retained with its Original_Length unchanged.
6. WHEN Replace(from, to, text, provenance) is applied with Valid_Boundaries `from <= to`, THE Engine SHALL return a Document equal to the one that Delete(from, to, provenance.Origin) followed by Insert(from, text, provenance) would return. The Engine SHALL return the result as one Operation with one Inverse. This holds whether `text` is empty (equivalent to the Delete alone) or `from == to` (equivalent to the Insert alone).
7. WHEN Insert with empty `text`, Delete with `from == to`, or Replace with `from == to` and empty `text` is applied at a Valid_Boundary, THE Engine SHALL return a Document equal to the input, including its Run table and every Run's cumulative edited count, together with an Inverse that, when applied, also returns an unchanged Document.
8. WHEN an Insert or Replace with non-empty `text` carries Origin `AI` and Run_Id `r`, THE Engine SHALL add `text.length` code units to the Original_Length of `r`, creating the Run table entry for `r` with that Original_Length, a cumulative edited count of 0, and a relabelled flag of `false` if it is absent. This applies also when Requirement 6.11 gives the inserted code units Origin `AI>HUM` because `r` is a relabelled Run.
9. WHEN an Insert or Replace carries an Origin other than `AI`, THE Engine SHALL leave every Original_Length in the Run table unchanged.
10. WHEN an Operation is applied to an empty Document at Offset 0, THE Engine SHALL return a Document that satisfies Requirement 3. The Engine SHALL return an Insert or Replace with non-empty `text` as exactly one Span covering [0, text.length) with `provenance`, and SHALL treat Delete(0, 0, actor) as a no-op under criterion 7.
11. WHEN an Operation is applied, THE Engine SHALL set the new Spans to the normalisation under Requirement 3.3 of the unmerged piece list formed, in Offset order, from: the parts of previous Spans that lie outside the deleted range (shifted as criteria 1 and 4 specify, each keeping its previous Provenance_Record including its Timestamp), and, for a non-empty inserted `text`, one piece covering the inserted code units with `provenance` including its Timestamp. Each resulting Span therefore carries the Timestamp of the lowest-start piece merged into it.
12. WHEN Insert is applied at an Offset strictly inside an existing Span that is Mergeable with `provenance`, THE Engine SHALL split no Span and SHALL extend that Span by `text.length` code units, keeping that Span's Timestamp, whether or not that Timestamp equals the Timestamp of `provenance`.

### Requirement 5: Inverse operations (Request 2.4)

**User Story:** As the editor app, I want every operation to come with its exact inverse, so that undo restores the document bit for bit.

#### Acceptance Criteria

1. WHEN an Operation is applied successfully, including a no-op Operation under Requirement 4.7, THE Engine SHALL return a Result whose `ok` field is `true` and whose value contains the new Document and exactly one Inverse.
2. IF an Operation is rejected with an Engine_Error under Requirement 7 or Requirement 6.6, THEN THE Engine SHALL return a Result whose `ok` field is `false`, return no Inverse, and leave the input Document unchanged.
3. WHEN the Inverse is applied to the new Document, THE Engine SHALL return a Document equal to the previous Document in Text, Spans, each Span's Provenance_Record including its Timestamp (so the Inverse restores every Timestamp that merging under Requirement 4.11 replaced, and re-splits every Span that the Operation merged), Run table (including every Run's Original_Length, cumulative edited count, and relabelled flag), Citations with their Offsets and Issue_Keys, Verification_Results, Quote_Candidates with their Offsets and Issue_Keys, Quote_Check_Results, Overrides, and Issue_Key_Counter.
4. WHEN applying an Operation caused a Run to be relabelled from `AI` to `AI>HUM` under Requirement 6.3, THE Engine SHALL produce an Inverse that, when applied, restores Origin `AI` on every Span of that Run, keeps the same Run_Id, restores the Run's cumulative edited count, and therefore its Edited_Proportion, to the value it had before the Operation, and restores the Run's relabelled flag to `false`.
5. WHEN the Inverse is applied successfully, THE Engine SHALL return a second Inverse that, applied to the restored Document, returns a Document equal to the new Document under the equality defined in criterion 3 (redo).
6. WHEN a sequence of one or more Operations is applied one after another and their Inverses are then applied in reverse order, THE Engine SHALL return a Document equal to the Document before the first Operation under the equality defined in criterion 3.
7. IF an Inverse is applied to a Document that is not equal to the Document returned with that Inverse, THEN THE Engine SHALL return an Engine_Error of kind `stale_inverse` and leave the input Document unchanged.

### Requirement 6: AI-then-edited relabelling (Request 2.5)

**User Story:** As a supervising attorney, I want substantially rewritten AI text to be labelled AI>HUM, so that the codes distinguish raw AI output from AI text the author has reworked.

#### Acceptance Criteria

1. WHEN an Operation with Actor `HUM` deletes code units that belong to one or more Spans with Origin `AI`, THE Engine SHALL add, for each Run_Id affected, exactly the number of deleted code units that belonged to that Run's Spans to that Run's cumulative edited count. Deleted code units from Spans of any other Run_Id or Origin SHALL add nothing to that Run's count.
2. WHEN an Operation with Actor `HUM` inserts N code units at an Offset `at` where `runStart < at < runEnd` for a Run_Extent [runStart, runEnd) measured before the insertion, THE Engine SHALL add N to the cumulative edited count of every Run whose Run_Extent satisfies that condition. An insertion at `at == runStart` or `at == runEnd` SHALL add nothing to that Run's count.
3. WHEN a non-empty Operation (any Operation other than a no-op Operation under Requirement 4.7) completes and a Run's Edited_Proportion is strictly greater than the Relabel_Threshold, THE Engine SHALL set that Run's relabelled flag to `true` and change the Origin of every remaining Span of that Run from `AI` to `AI>HUM`. It SHALL keep each Span's Run_Id, Timestamp, and Offsets unchanged, except that a relabelled Span becoming Mergeable with an adjacent Span is merged under Requirement 3.3, and SHALL leave the Spans of every other Run unchanged. WHEN a no-op Operation under Requirement 4.7 is applied, THE Engine SHALL relabel no Run, even if the Relabel_Threshold passed with it is lower than the Relabel_Threshold passed with earlier Operations.
4. WHEN a Run's Edited_Proportion is less than or equal to the Relabel_Threshold after an Operation completes, THE Engine SHALL leave the Origin of every Span of that Run as it was before the Operation.
5. WHERE the caller supplies a Relabel_Threshold, THE Engine SHALL use the supplied value in place of 0.4 in criteria 3 and 4.
6. IF a supplied Relabel_Threshold is not a finite number in the interval (0, 1], including 0, negative values, values above 1, `NaN`, and infinities, THEN THE Engine SHALL return an Engine_Error of kind `invalid_config`, apply no Operation, and leave the input Document unchanged.
7. WHEN an Operation has an Actor of `PST` or `AI`, THE Engine SHALL leave every Run's cumulative edited count unchanged.
8. WHILE a Run is relabelled `AI>HUM`, THE Engine SHALL keep every remaining Span of that Run at Origin `AI>HUM` after every subsequent forward Operation, whatever that Operation's Actor or effect on the Run's cumulative edited count. Only applying an Inverse under Requirement 5.4 SHALL restore Origin `AI`.
9. WHEN Replace(from, to, text, provenance) with Origin `HUM` is applied, THE Engine SHALL first count the deleted code units under criterion 1. It SHALL then count the inserted code units under criterion 2, evaluating Run_Extents against the Document after the deletion. It SHALL evaluate criteria 3 and 4 once, after both counts are applied.
10. IF the caller supplies no Relabel_Threshold, THEN THE Engine SHALL use 0.4 as the Relabel_Threshold in criteria 3 and 4.
11. WHEN an Insert or Replace with non-empty `text` carries Origin `AI` and a Run_Id `r` whose Run is a relabelled Run, THE Engine SHALL give the inserted code units Origin `AI>HUM` with Run_Id `r` and the Timestamp of `provenance`, and SHALL apply every criterion of Requirement 4 (including Mergeable comparisons in 4.2, 4.3, 4.11, and 4.12) as if `provenance` carried Origin `AI>HUM`. The inserted code units SHALL still add `text.length` to the Original_Length of `r` under Requirement 4.8.
12. THE Engine SHALL return only Documents in which, for every Run_Id `r` carried by a Span, the Run table holds an entry for `r`, and either the entry's relabelled flag is `false` and every Span with Run_Id `r` has Origin `AI`, or the flag is `true` and every Span with Run_Id `r` has Origin `AI>HUM`. No Run SHALL hold both `AI` and `AI>HUM` Spans after any forward Operation, any Inverse, or parsing.

### Requirement 7: Operation errors (Request 2.6, Added)

**User Story:** As the editor app, I want invalid operations rejected as values, so that a bad transaction cannot corrupt the document.

#### Acceptance Criteria

1. IF any of an Operation's `at`, `from`, or `to` values is not an integer (including `NaN`, `Infinity`, and fractional numbers) or lies outside [0, Text.length], THEN THE Engine SHALL return a Result with `ok` equal to `false`, an Engine_Error of kind `out_of_range` that names the offending field and carries its value and the Text.length, and no Inverse, and leave the input Document unchanged.
2. IF an Operation has `from > to`, THEN THE Engine SHALL return a Result with `ok` equal to `false`, an Engine_Error of kind `inverted_range` carrying both `from` and `to`, and no Inverse, and leave the input Document unchanged.
3. IF an Operation's `at`, `from`, or `to` falls between the two code units of a Surrogate_Pair in the Text, or an inserted `text` contains a high surrogate not immediately followed by a low surrogate or a low surrogate not immediately preceded by a high surrogate, THEN THE Engine SHALL return a Result with `ok` equal to `false`, an Engine_Error of kind `split_surrogate` carrying the Offset of the fault (an Offset into the Text for a boundary fault, or an Offset into the inserted `text` for an unpaired surrogate), and no Inverse, and leave the input Document unchanged.
4. IF a Caller_Operation's Provenance_Record has an Origin outside `HUM`, `PST`, `AI`, `AI>HUM`, has Origin `AI>HUM` on an Insert or Replace (only the Engine produces `AI>HUM`, through Requirement 6.3 or 6.11), has Origin `AI` with an absent or empty Run_Id, or has Origin `HUM` or `PST` with a Run_Id present, THEN THE Engine SHALL return a Result with `ok` equal to `false`, an Engine_Error of kind `invalid_provenance`, and no Inverse, and leave the input Document unchanged. The `AI>HUM` restriction applies only to Caller_Operations; an Inverse returned by the Engine may restore Spans with Origin `AI>HUM` and is checked only under Requirement 5.7.
5. IF a Delete's Actor is not one of `HUM`, `PST`, `AI`, `AI>HUM`, THEN THE Engine SHALL return a Result with `ok` equal to `false`, an Engine_Error of kind `invalid_provenance`, and no Inverse, and leave the input Document unchanged.
6. IF an Operation violates more than one of criteria 7.1 to 7.5, or violates one or more of them and also carries a Provenance_Record whose Timestamp is not an ISO-8601 UTC string, THEN THE Engine SHALL return exactly one Engine_Error, chosen by checking in this fixed order: `out_of_range`, `inverted_range`, `split_surrogate`, `invalid_provenance`, `invalid_timestamp`.
7. IF an Operation is rejected under any of criteria 7.1 to 7.5, THEN THE Engine SHALL leave the input Document equal to its state before the call in Text, Spans, Run table (including Original_Length values, cumulative edited counts, and relabelled flags), Citations, Verification_Results, Quote_Candidates, Quote_Check_Results, Overrides, and Issue_Key_Counter.

### Requirement 8: Sentence segmentation (Request 3.1–3.4)

**User Story:** As the Reveal Codes pane, I want text split into sentences without losing any character, so that per-sentence provenance is exact.

#### Acceptance Criteria

1. WHEN a non-empty Text is segmented, THE Segmenter SHALL return one or more Sentences, each with `start < end`, ordered by `start`, where the first Sentence starts at 0, each subsequent Sentence starts at the previous Sentence's `end`, the last Sentence ends at Text.length, and the concatenation of `text.slice(start, end)` over all Sentences equals the Text exactly, including every whitespace code unit.
2. WHEN the empty Text is segmented, THE Segmenter SHALL return zero Sentences.
3. WHEN a Text contains a terminator sequence (one or more of `.`, `?`, `!`, optionally followed by one or more of `"`, `”`, `'`, `’`, `)`), followed by one or more whitespace code units and then a non-whitespace code unit, THE Segmenter SHALL place a Sentence boundary at the Offset of that non-whitespace code unit, so that the whitespace belongs to the preceding Sentence, unless criterion 5 or 6 excludes the boundary.
4. WHEN a Text contains no position satisfying criterion 3, THE Segmenter SHALL return exactly one Sentence covering [0, Text.length).
5. THE Segmenter SHALL place no Sentence boundary at an Offset `b` with `start < b < end` for any Citation range `[start, end)` returned by the Extractor for the same Text.
6. IF the terminator sequence in criterion 3 ends with the final period of a Legal_Abbreviation that matches exactly (case-sensitive) and is preceded by the start of the Text, a whitespace code unit, or `(`, THEN THE Segmenter SHALL place no Sentence boundary after that terminator sequence.
7. WHEN a Text is segmented with Spans that satisfy the Coverage_Invariant for that Text, THE Segmenter SHALL report for every Sentence, including a Sentence that overlaps only one Span, its Dominant_Origin (computed over code units in `[start, end)`, ties broken by the earliest-starting Span) and the set of every Origin of a Span that overlaps at least one code unit of the Sentence.
8. THE Segmenter SHALL place each Sentence boundary at a Valid_Boundary.
9. IF the Spans passed to the Segmenter do not satisfy the Coverage_Invariant for the Text, THEN THE Segmenter SHALL return an Engine_Error of kind `invalid_spans` and return no Sentences.

### Requirement 9: Full citation extraction (Request 4.1, Added from citations.md)

**User Story:** As a pro se filer, I want every case citation in my draft found at its exact position, so that each one can be checked and marked in place.

#### Acceptance Criteria

1. WHEN a Text is scanned, THE Extractor SHALL return every Reporter_Citation, Database_Citation, and Parallel_Citation in the Text, including Near_Misses and excluding Garbage_Citations as defined in Requirement 11, ordered by ascending `start` Offset.
2. THE Extractor SHALL return, for every Citation, `[start, end)` Offsets such that `text.slice(start, end)` equals the Citation's text as written, where `start` is the first code unit of the first volume (or of `Id.` for an `Id.` Short_Form, or of the Short_Form_Party, after any removed Party_Stop_List prefix, for a `<party>, <volume> <reporter> at <page>` Short_Form, so that `Roe v. Wade, 410 U.S. at 153` starts at `Roe` and `Smith, Inc., 5 U.S. at 9` starts at `Smith`) and `end` is one past the closing parenthesis of the citation's parenthetical if one is present, otherwise one past the last code unit of the pincite if one is present, otherwise one past the last code unit of the page or database number.
3. WHEN a Reporter_Citation is extracted, THE Extractor SHALL record in its Citation_Value the volume, reporter, and page, and SHALL record the pincite, court, and year each as present with the value as written when that field appears in the Text and as absent when it does not.
4. WHEN a Database_Citation is extracted, THE Extractor SHALL record in its Citation_Value the four-digit year, the database designator (`WL`, or the court abbreviation followed by `LEXIS`), and the document number.
5. WHEN two or more Reporter_Citations are separated only by a comma and whitespace and share one parenthetical, THE Extractor SHALL return one Parallel_Citation whose range runs from the first volume to the closing parenthesis, which lists every component's volume, reporter, page, and pincite in the order written, and SHALL return no separate Citation for any component.
6. WHEN a statute or regulation reference of the form `<title> U.S.C. § <section>` or `<title> C.F.R. § <section>`, or another statute, regulation, or secondary-source reference recognised under citations.md, is found, THE Extractor SHALL return it as a Citation of kind Other_Reference with no Verification_Result and no Issue_Key, which is excluded from Issues and is marked only by the `[REF]` … `[/REF]` Code pair (Requirement 19.1), and SHALL NOT return a Reporter_Citation overlapping that reference.
7. THE Extractor SHALL return Citations whose ranges are pairwise non-overlapping, and where candidate matches overlap, a Parallel_Citation SHALL take precedence over its component Reporter_Citations and a Full_Citation SHALL take precedence over an Other_Reference.
8. IF a candidate citation's first volume digit is immediately preceded by a letter or digit, or its last page, pincite, or database-number digit is immediately followed by a letter or digit, THEN THE Extractor SHALL return no Citation for that candidate.
9. WHEN the Extractor is called on any string, including the empty string, a string with no citations, and a string containing unpaired surrogates, THE Extractor SHALL return a list of Citations (empty when none are found) without returning an Engine_Error or throwing.

### Requirement 10: Canonical format and round trip (Request 4.2)

**User Story:** As a maintainer, I want a canonical citation printer that the extractor reads back exactly, so that normalisation is lossless.

#### Acceptance Criteria

1. WHEN `format(citation)` is called with a valid Full_Citation Citation_Value, THE Engine SHALL return a Result whose `ok` field is `true` and whose `value` is the Canonical_Form: a string with no leading or trailing whitespace, single ASCII spaces between tokens, and every reporter spelled exactly as its Reporter_List entry. A Full_Citation Citation_Value is valid when all of these hold:
   - Volume and page are integers from 1 to 99,999 with no leading zeros.
   - Each reporter is an exact Reporter_List entry.
   - Any pincite is an integer from 1 to 99,999.
   - Any year is a four-digit integer from 1600 to 2999.
   - Any court is a string of 1 to 40 characters with no parenthesis characters and no leading or trailing whitespace.
   - A Parallel_Citation has 2 to 4 reporters.
   - A Database_Citation document number is an integer from 1 to 9,999,999.
2. THE Engine SHALL lay out the Canonical_Form as follows:
   - Reporter_Citation: `<volume> <reporter> <page>`, then `, <pincite>` if a pincite is present, then ` (<court> <year>)`, ` (<year>)`, or ` (<court>)` depending on which of court and year are present, and no parenthetical if neither is present. Examples: `410 U.S. 113, 116 (1973)` and `598 F.3d 1, 7 (2d Cir. 2010)`.
   - Parallel_Citation: each `<volume> <reporter> <page>` member in Citation_Value order, joined by `, `, followed by one shared parenthetical laid out as for a Reporter_Citation.
   - Database_Citation: `<year> WL <number>` or `<year> <court> LEXIS <number>`, then `, at *<pincite>` if a pincite is present. Examples: `2024 WL 123456` and `2023 U.S. Dist. LEXIS 98765`.
3. WHEN the Extractor is applied to `format(c)` for any valid Full_Citation value `c`, THE Extractor SHALL return the following (round trip):
   - Exactly one Citation, with Offsets [0, format(c).length).
   - Zero Quote_Candidates.
   - No Normalised_Form on that Citation.
   - A Citation_Value equal to `c` in every field: kind, volume, every reporter in order, page, pincite, court, and year. Optional fields absent from `c` must also be absent from the extracted value.
4. WHEN `format` is applied to the Citation_Value extracted from `format(c)` for any valid Full_Citation value `c`, THE Engine SHALL return a string equal to `format(c)`, code unit for code unit (idempotence).
5. IF `format` is called with a Citation_Value that is not a valid Full_Citation under criterion 1, THEN THE Engine SHALL return an Engine_Error of kind `invalid_citation` without throwing. This includes a value of kind Short_Form or Other_Reference. The Engine_Error identifies the first field that fails validation.
6. WHEN `format` is applied to the Citation_Value of an extracted Near_Miss, THE Engine SHALL return a string equal to that Citation's Normalised_Form.

### Requirement 11: Near misses and garbage (Request 4.3, 4.4)

**User Story:** As a pro se filer, I want sloppy but real citations recognised and nonsense ignored, so that I see codes on what I meant and not on noise.

#### Acceptance Criteria

1. WHEN a Text contains a `<volume> <token> <page>` string whose token matches no Reporter_List entry exactly, but matches at least one Reporter_List entry once all periods and spaces are removed from both the token and the entry (case-sensitive), THE Extractor SHALL return exactly one Citation for that Near_Miss. The Citation's `[start, end)` Offsets SHALL satisfy `text.slice(start, end)` equal to the Near_Miss as written, with its original periods and spacing.
2. WHEN a Citation is extracted from text that is character-for-character equal to the Canonical_Form of its Citation_Value, THE Extractor SHALL record no Normalised_Form. WHEN the text as written differs from that Canonical_Form in at least one code unit, THE Extractor SHALL record a Normalised_Form.
3. WHEN a Text contains a Garbage_Citation, THE Extractor SHALL do all of the following:
   - return no Citation whose range overlaps the Garbage_Citation's range;
   - attach no Quote_Candidate to it;
   - return Citations and Quote_Candidates for the rest of the Text that are identical in value to those returned for the same Text with the Garbage_Citation replaced by the same number of space characters;
   - return no Engine_Error, as Requirement 9.9 requires.
4. WHEN a Near_Miss is extracted, THE Extractor SHALL do all of the following:
   - set the reporter in the Citation_Value to the matched Reporter_List abbreviation exactly as it appears in the Reporter_List;
   - set the Normalised_Form to `format(citationValue)`;
   - ensure that extracting the Normalised_Form on its own returns one Citation whose Citation_Value equals the Near_Miss's Citation_Value and which has no Normalised_Form.
5. IF a Near_Miss token, after all periods and spaces are removed, matches more than one Reporter_List entry, THEN THE Extractor SHALL extract the Near_Miss under criterion 1 using the matching entry that appears first in `reporters.json` order. Repeated extractions of the same Text SHALL select the same entry.
6. WHEN a Parallel_Citation contains at least one Near_Miss component, THE Extractor SHALL return one Parallel_Citation with these properties:
   - every component's reporter is normalised under criterion 4;
   - its Offsets cover the whole Parallel_Citation as written;
   - it carries exactly one Normalised_Form, equal to `format` of the whole Parallel_Citation's Citation_Value.

### Requirement 12: Short forms (Request 4.5, reconciled with citations.md)

**User Story:** As a filer, I want `Id.` and short-form references tied to the case they refer to, so that they inherit that case's verification.

#### Acceptance Criteria

1. WHEN the Extractor finds `Id.` or `Id. at <page>` at the start of the Text or right after whitespace or an opening punctuation character, THE Extractor SHALL return a Short_Form whose Offsets run from the `I` of `Id.` to the last character of `<page>`, or to the period of `Id.` when there is no page. The Extractor SHALL record `<page>` as the Short_Form's pincite. Except as criteria 6 and 7 specify, it SHALL link the Short_Form to the Citation with the greatest start Offset below the Short_Form's start Offset. If that Citation is a linked Short_Form, the link target SHALL be that Short_Form's own target Full_Citation.
2. WHEN the Extractor finds `<party>, <volume> <reporter> at <page>`, THE Extractor SHALL return a Short_Form covering the text from the first code unit of the Short_Form_Party, after any Party_Stop_List prefix has been removed, to the last code unit of `<page>`, where the Short_Form_Party is derived from the longest valid Party_Run ending immediately before `, <volume>` as the Glossary defines, including at most one ` v. ` and at most one Entity_Suffix on each side of it. Examples: `Roe v. Wade, 410 U.S. at 153` gives party `Roe v. Wade`; `Smith, Inc., 5 U.S. at 9` gives `Smith, Inc.`; `See Roe v. Wade, 410 U.S. at 153` gives `Roe v. Wade`; `In Casey, 505 U.S. at 833` gives `Casey`. It SHALL record `<page>` as the pincite and link the Short_Form to the Full_Citation with the greatest start Offset below the Short_Form's start Offset whose volume and reporter both equal the Short_Form's. Reporters SHALL be compared after Near_Miss normalisation. A Parallel_Citation SHALL match if any one of its reporters has that volume and reporter.
3. IF no Full_Citation with a lower start Offset satisfies the linking rule in criterion 1 or criterion 2 for a Short_Form, THEN THE Extractor SHALL mark that Short_Form as an Orphan with no link target. This includes a Short_Form that appears before every Full_Citation in the Text.
4. WHILE a Short_Form is linked to a target Full_Citation, THE Engine SHALL report for that Short_Form a Verification_Result equal in status and payload to its target's current Verification_Result, including after a caller changes the target's Verification_Result.
5. WHILE a Short_Form is an Orphan, THE Engine SHALL report its Verification_Result as `unchecked` with no `wait_until`, treat the Orphan as an Issue that renders as `[CIT …]` and accepts an Override under Requirement 18.3, and include the Orphan in `blockingIssues(doc)` until an Override is recorded for its Issue_Key.
6. IF the Citation with the greatest start Offset below an `Id.` Short_Form's start Offset is an Other_Reference, THEN THE Extractor SHALL mark that `Id.` Short_Form as an Orphan rather than linking it to any earlier Full_Citation.
7. IF the Citation with the greatest start Offset below an `Id.` Short_Form's start Offset is an Orphan, THEN THE Extractor SHALL mark that `Id.` Short_Form as an Orphan.
8. THE Extractor SHALL return only `<party>, <volume> <reporter> at <page>` Short_Forms whose range text starts with a Capitalised_Word, starts with no Party_Stop_List entry followed by a space, and has as its `<party>` a Party_Run of 1 to 80 code units as the Glossary defines.

### Requirement 13: Quote candidates (Request 4.6)

**User Story:** As a filer, I want quotations attached to the case they quote, so that invented quotes in real cases can be caught.

#### Acceptance Criteria

1. WHEN a Text contains a Quotation_Pair (a straight `"` paired with the next straight `"`, or a curly `“` paired with the next curly `”`) and the first Citation whose start Offset is greater than the Offset of the pair's closing mark meets all of the following conditions, THE Extractor SHALL attach the text between the quotation marks to that Citation as a Preceding_Quote:
   - the Citation is a Full_Citation or a Short_Form;
   - the Sentence containing the closing mark and the Sentence containing the Citation's start Offset, among the Sentences the Segmenter returns for the Text, are the same Sentence or adjacent Sentences, so that the gap contains at most one Sentence boundary;
   - the gap, meaning the code units from one past the closing mark up to the Citation's start Offset, can be written as `P1 + S + P2 + C + P3`, where `P1`, `P2`, and `P3` consist only of whitespace code units and the characters `,` `;` `:` `.` `(` `)`, `S` is either empty or exactly one Gap_Signal, and `C` is either empty or exactly one Case_Name.

   Examples that attach: `"… ." Roe, 410 U.S. at 153.` (one Sentence boundary in the gap, Short_Form party inside the Short_Form range), `"…," Roe v. Wade, 410 U.S. 113 (1973)` (Case_Name in the gap), `"…." See Roe v. Wade, 410 U.S. 113` (Gap_Signal then Case_Name), `"…" See Planned Parenthood, 505 U.S. at 833` (Gap_Signal; the party is inside the Short_Form range), and `"…" (quoting Roe v. Wade, 410 U.S. 113)` (lowercase Gap_Signal in a parenthetical). With `Compare`, the quote attaches to the Citation right after `Compare`: in `"…." Compare Roe v. Wade, 410 U.S. 113, with Casey, 505 U.S. at 833` it attaches to `410 U.S. 113`. Examples that do not attach under this criterion: `"…" In Casey, 505 U.S. at 833` (`In` is not a Gap_Signal), a gap containing `with` (not a Gap_Signal, so a quote is never attached across a `with`), a gap containing two Gap_Signals, a gap spanning two Sentence boundaries, and a gap containing another quotation mark.
2. THE Extractor SHALL return, for every Quote_Candidate, `[start, end)` Offsets of the quoted text excluding both quotation marks, such that `text.slice(start, end)` equals the quoted text as written and the range contains at least one non-whitespace code unit.
3. WHEN a Quote_Candidate attaches to a linked Short_Form, THE Engine SHALL use the Short_Form's target Full_Citation as the citation for quote checking.
4. IF a Quote_Candidate attaches to a Short_Form that is an Orphan, THEN THE Engine SHALL keep that Quote_Candidate's Quote_Check_Result at `unchecked` (Requirement 17.8) and treat the Quote_Candidate as an Issue of its own, separate from the Orphan, that is blocking until an Override is recorded for the Quote_Candidate's own Issue_Key.
5. WHEN a Quotation_Pair satisfies both criterion 1 for a following Citation and criterion 8 for a preceding Citation, THE Extractor SHALL attach the Quote_Candidate to the following Citation only, as a Preceding_Quote.
6. IF a quotation mark has no partner under the pairing rule in criterion 1 (an unterminated quote, a `“` closed by a straight `"`, or a stray `”`), or a quotation pair encloses only whitespace or nothing, THEN THE Extractor SHALL create no Quote_Candidate for those marks, return no Engine_Error, and still return every Citation in the Text.
7. THE Extractor SHALL attach each Quote_Candidate to exactly one Citation, return Quote_Candidates in document order with pairwise non-overlapping ranges, and attach no Quote_Candidate to a Citation of kind Other_Reference. THE Extractor SHALL attach to a Citation every Quote_Candidate that criteria 1, 5, and 8 assign to it, so that one Citation can carry several Quote_Candidates, for example one Preceding_Quote and one Following_Quote.
8. WHEN a Text contains a Quotation_Pair whose opening mark lies after the end Offset of a Full_Citation or Short_Form, in the same Sentence as that Citation's start Offset, and every code unit from the Citation's end Offset up to the opening mark is whitespace or one of `,` `;` `:` `(`, THE Extractor SHALL attach the text between the quotation marks to that Citation as a Following_Quote, unless criterion 1 attaches the same Quotation_Pair to a following Citation (criterion 5). Examples: `Roe, 410 U.S. at 153 ("quoted text")` and `410 U.S. 113, 116: "quoted text"`. This gap admits no Gap_Signal: a `quoting` or `citing` after a Citation introduces a different authority, so in `Roe, 410 U.S. at 153 (quoting "quoted text")` the quote does not attach to `Roe` under this criterion.
9. IF a Quotation_Pair satisfies neither criterion 1 nor criterion 8, THEN THE Extractor SHALL create no Quote_Candidate for that Quotation_Pair and return no Engine_Error.

### Requirement 14: Vendored reporter list (Request 4.7)

**User Story:** As a maintainer, I want the reporter list vendored from reporters-db, so that recognition is authoritative and works offline.

#### Acceptance Criteria

1. THE Engine SHALL obtain the Reporter_List only from `packages/engine/src/citations/reporters.json`, included in the Engine as a static module import with no file-system, network, or `node:` access at run time, and SHALL contain no other list of reporter abbreviations in any source file under `packages/engine/src` outside `packages/engine/src/testing/`.
2. THE Engine SHALL ship `reporters.json` generated from Free Law Project `reporters-db`, with a licence note in the same directory that states the reporters-db licence name, the source repository, the source release version or commit identifier, and the generation date.
3. THE Extractor SHALL recognise a `<volume> <token> <page>` string as a Reporter_Citation if and only if `<token>` equals a Reporter_List entry exactly or is a Near_Miss of a Reporter_List entry, and SHALL return no Citation for every other token, as Requirement 11.3 specifies for Garbage_Citations.
4. THE Engine SHALL ship a `reporters.json` that contains at least one entry, in which every entry is a non-empty string with no leading or trailing whitespace and no two entries are equal.
5. WHEN a Reporter_Citation's token matches a Reporter_List entry exactly, THE Extractor SHALL record that entry as the reporter in the Citation_Value, and SHALL record a Normalised_Form only when Requirement 11.2 requires one.
6. WHEN a Near_Miss token matches more than one Reporter_List entry after removing or collapsing periods and spaces, THE Extractor SHALL record as the reporter the matching entry that appears first in `reporters.json`, so that equal input always yields an equal Normalised_Form.

### Requirement 15: Re-anchoring citations on edit (Request 5.3, Added)

**User Story:** As a filer, I want verification results to survive edits elsewhere in the document but reset when the citation itself changes, so that green codes are never stale.

#### Acceptance Criteria

1. WHEN an Operation is applied successfully, THE Engine SHALL replace the Document's Citations and Quote_Candidates with the output of the Extractor on the new Text, re-link every Short_Form under Requirement 12, and then assign Verification_Results, Quote_Check_Results, Issue_Keys, and Overrides only as criteria 2 to 8 specify.
2. WHEN a Citation in the new Document meets all three of these conditions, THE Engine SHALL carry over that previous Citation's Verification_Result (including any `wait_until` Timestamp), Issue_Key, and Override unchanged: (a) it has the same text as written and the same Citation_Value as a Citation in the previous Document; (b) the Operation left that previous Citation untouched under criterion 3; and (c) its Offsets equal the previous Citation's Offsets mapped through the Operation under criterion 3.
3. THE Engine SHALL treat a previous range `[start, end)` as follows. For Insert(at, text, provenance): the range is untouched if `at <= start` or `at >= end`. For Delete(from, to, actor) and Replace(from, to, text, provenance): the range is untouched if `to <= start` or `from >= end`. An untouched range maps to `[start + delta, end + delta)` if it lies at or after the edit point (`start >= at`, or `start >= to`), and to `[start, end)` otherwise. Here `delta` equals the inserted text length minus `(to − from)`, with `(to − from)` taken as 0 for Insert.
4. WHEN an Operation is an Insert with `start < at < end`, or a Delete or Replace whose `[from, to)` shares at least one code unit with a Citation's `[start, end)`, THE Engine SHALL treat that Citation as touched and SHALL give every resulting Citation in the new Document the Verification_Result `unchecked` with no `wait_until`. This applies even when a Replace writes text identical to the text it removes.
5. IF a Citation in the new Document does not satisfy criterion 2, THEN THE Engine SHALL give it the Verification_Result `unchecked` with no `wait_until`, an Issue_Key newly given under Issue_Key assignment (and therefore equal to no Issue_Key in the previous Document), and no Override.
6. WHEN an Operation touches a Quote_Candidate's range under the rule in criterion 4, or the Quote_Candidate's attached Citation (for a Short_Form, its target Full_Citation) receives the Verification_Result `unchecked` under criterion 4 or 5, THE Engine SHALL set that Quote_Candidate's Quote_Check_Result to `unchecked`.
7. WHEN a Quote_Candidate in the new Document meets all four of these conditions, THE Engine SHALL carry over that previous Quote_Candidate's Quote_Check_Result, Issue_Key, and Override unchanged: (a) it has the same quoted text as a Quote_Candidate in the previous Document whose range the Operation left untouched; (b) its Offsets equal that previous range mapped under criterion 3; (c) its attached Citation was carried over under criterion 2 from the Citation that previous Quote_Candidate was attached to and, when that Citation is a linked Short_Form, the Short_Form's target Full_Citation was also carried over under criterion 2; and (d) it is attached by the same rule as that previous Quote_Candidate (both Preceding_Quotes or both Following_Quotes under Requirement 13). Any other Quote_Candidate in the new Document SHALL receive Quote_Check_Result `unchecked`, an Issue_Key newly given under Issue_Key assignment, and no Override. An Operation that touches only the gap between a Quotation_Pair and its Citation (for example, editing a Case_Name or adding a Sentence boundary) can therefore change or remove the attachment even though neither range is touched; a removed Quote_Candidate is absent from the Extractor output under criterion 8.
8. WHEN a Citation or Quote_Candidate is reset to `unchecked` under criteria 4 to 7, or is absent from the Extractor output on the new Text, THE Engine SHALL discard any Override recorded for its previous Issue_Key, so that `overrides(doc)` on the new Document contains no Override whose Issue_Key does not identify a current Issue.

### Requirement 16: Verification state (Request 5.1)

**User Story:** As the verifier, I want to write verification results into the document, so that the pane and export reflect CourtListener's answers.

#### Acceptance Criteria

1. WHEN a caller sets a valid Verification_Result on a Full_Citation present in the Document, THE Engine SHALL return a Document in which that Full_Citation and every Short_Form linked to it report that Verification_Result. In that Document, the Text, Spans, Run table, and every other Citation's Verification_Result SHALL be unchanged from the input Document.
2. THE Engine SHALL accept exactly these Verification_Result payloads and no others:
   - `verified` with exactly one non-empty cluster id;
   - `ambiguous` with a list of two or more non-empty, pairwise distinct candidate cluster ids;
   - `not_found` with an optional non-empty reason;
   - `unchecked` with an optional `wait_until` Timestamp.
3. IF a caller sets a Verification_Result whose payload does not match the form Criterion 2 gives for its Verification_Status, THEN THE Engine SHALL return an Engine_Error of kind `invalid_verification_result` and leave the input Document unchanged. Examples of a non-matching payload: a `verified` result with no cluster id or an empty one; an `ambiguous` result with an empty, single-element, or duplicate-containing candidate list; a `wait_until` value that is not a Timestamp.
4. IF a caller sets a Verification_Result on a Citation identifier that identifies no Citation in the Document, THEN THE Engine SHALL return an Engine_Error of kind `unknown_citation` and leave the input Document unchanged.
5. IF a caller sets a Verification_Result on a Citation identifier that identifies a Short_Form, THEN THE Engine SHALL return an Engine_Error of kind `not_verifiable` and leave the input Document unchanged.
6. WHEN a caller sets a Verification_Result whose Verification_Status differs from the current Verification_Status of a Full_Citation that has an Override, THE Engine SHALL discard that Override and exclude it from `overrides(doc)`.
7. WHEN a caller sets a Verification_Result whose Verification_Status equals the current Verification_Status of a Full_Citation that has an Override, THE Engine SHALL keep that Override and its Issue_Key unchanged.

### Requirement 17: Quote-check state (Request 5.2)

**User Story:** As the verifier, I want to write quote-check results onto quote candidates, so that `QUO ✘` codes show where a quote diverges.

#### Acceptance Criteria

1. WHEN a caller sets a Quote_Check_Result of `unchecked`, `match`, or `mismatch` on a Quote_Candidate present in the Document, THE Engine SHALL return a new Document in which that Quote_Candidate carries exactly the supplied Quote_Check_Result. The supplied result SHALL replace any previous result on that Quote_Candidate. Every other Quote_Candidate, Citation, Verification_Result, and Override SHALL stay unchanged, except as Criterion 4 requires.
2. WHEN a caller sets a `mismatch` Quote_Check_Result with a valid longest matching prefix length `p`, THE Engine SHALL store `p` on the Quote_Candidate, so that the divergence Offset in the Text equals the Quote_Candidate's `start + p`.
3. IF a `mismatch` Quote_Check_Result carries a longest matching prefix length that is not an integer, is negative, or is greater than or equal to the Quote_Candidate's length in code units, THEN THE Engine SHALL return an Engine_Error of kind `invalid_quote_result` and leave the input Document unchanged.
4. WHEN a caller sets a Quote_Check_Result that differs from the current Quote_Check_Result of a Quote_Candidate that has an Override, THE Engine SHALL discard that Override.
5. IF a caller sets a Quote_Check_Result on a Quote_Candidate identifier absent from the Document, THEN THE Engine SHALL return an Engine_Error of kind `unknown_quote` and leave the input Document unchanged.
6. WHEN a Quote_Candidate's Quote_Check_Result is set to `mismatch` or `unchecked`, THE Engine SHALL include that Quote_Candidate as an Issue in document order.
7. WHEN a Quote_Candidate's Quote_Check_Result is set to `match`, THE Engine SHALL exclude that Quote_Candidate from the Issues.
8. IF a caller sets a Quote_Check_Result on a Quote_Candidate attached to a Short_Form that is an Orphan, THEN THE Engine SHALL return an Engine_Error of kind `not_verifiable` and leave the input Document unchanged, as Requirement 13.4 requires.

### Requirement 18: Blocking issues and overrides (Request 5.4, 5.5)

**User Story:** As a filer, I want to know exactly which problems block export and to record why I am filing anyway, so that the certification is honest.

#### Acceptance Criteria

1. THE Engine SHALL compute `blockingIssues(doc)` as a list of every Issue in the Document that has no Override, each Issue appearing exactly once with its Issue_Key. The list SHALL be ordered by ascending start Offset, and when a Citation (Full_Citation or Orphan) and a Quote_Candidate share a start Offset, the Citation SHALL come first.
2. THE Engine SHALL include in the Issues of a Document exactly every Full_Citation whose Verification_Status is `not_found`, `ambiguous`, or `unchecked` (with or without `wait_until`), every Orphan, and every Quote_Candidate whose Quote_Check_Result is `mismatch` or `unchecked` (including one attached to an Orphan), and SHALL exclude every Full_Citation whose Verification_Status is `verified`, every Quote_Candidate whose Quote_Check_Result is `match`, every linked Short_Form, and every Other_Reference.
3. WHEN a caller records an Override with an Issue_Key that identifies a current Issue, a reason containing at least one character that JavaScript's `String.prototype.trim` would not remove, and a caller-supplied Timestamp, THE Engine SHALL return a Result whose `ok` field is `true` with a new Document. In that Document the Issue SHALL be absent from `blockingIssues(doc)`, and `overrides(doc)` SHALL contain an Override holding that Issue_Key, the reason exactly as supplied without trimming, and that Timestamp.
4. WHEN a caller records an Override for an Issue_Key that already has an Override, THE Engine SHALL replace the existing Override with the new one, so that `overrides(doc)` holds exactly one Override per Issue_Key.
5. IF an Override reason is the empty string or consists only of characters that JavaScript's `String.prototype.trim` removes, THEN THE Engine SHALL return an Engine_Error of kind `empty_override_reason`, store no Override, and leave the input Document unchanged.
6. IF an Override is recorded for an Issue_Key that does not identify a current Issue, including the key of a `verified` Full_Citation, a linked Short_Form, a `match` Quote_Candidate, or a key present in no current item, THEN THE Engine SHALL return an Engine_Error of kind `unknown_issue` that carries the supplied Issue_Key, store no Override, and leave the input Document unchanged.
7. THE Engine SHALL compute `overrides(doc)` as the list of every Override in the Document, ordered by the start Offset of the Issue each Override belongs to, using the same tie-break rule as criterion 1.
8. THE Engine SHALL return an empty `blockingIssues(doc)` if and only if every Issue in the Document has an Override, including the case where the Document has zero Issues.

### Requirement 19: Reveal Codes rendering (Request 6.1, 6.3, 6.4)

**User Story:** As a judge or filer pressing Alt-F3, I want a faithful text serialisation of the document's provenance and verification, so that I can see where every sentence came from and whether every case checks out.

#### Acceptance Criteria

1. WHEN a Document is rendered with Render_Mode `full`, THE Renderer SHALL produce a Full_Rendering made of the Document's Text with these Codes inserted: one `[DOC]` Code at Offset 0; one span Code at the start Offset of every Span; one opening citation Code at the start Offset and one `[/CIT]` at the end Offset of every Full_Citation and every Short_Form; one opening quote Code at the start Offset and one `[/QUO]` at the end Offset of every Quote_Candidate; and one `[REF]` at the start Offset and one `[/REF]` at the end Offset of every Other_Reference. The opening citation Code of a Full_Citation SHALL show its own Verification_Status, and that of a Short_Form SHALL show the Verification_Status the Engine reports for it under Requirement 12.4 or 12.5 (so an Orphan shows `[CIT …]`). THE Renderer SHALL emit for an Other_Reference only its `[REF]` and `[/REF]` Codes, and no citation Code, quote Code, or `[OVR]`; `[REF]` is a non-blocking Code.
2. THE Renderer SHALL emit only Codes from the Code_Vocabulary, and in a Full_Rendering each Code SHALL carry these Payloads: `[DOC]` carries the Issue_Key_Counter and, for every Run table entry, its Run_Id, Original_Length, cumulative edited count, and relabelled flag; each span Code carries its Span's Timestamp and, for `[AI:<run>]` and `[AI>HUM:<run>]`, its Run_Id as the run id; each opening citation Code carries the Citation's Issue_Key and, for a Full_Citation, its Verification_Result payload (cluster id, candidate cluster id list, reason, or `wait_until`); every `[CIT ?]`, including that of a linked Short_Form, carries the candidate count derived from its (target's) candidate list; each opening quote Code carries the Quote_Candidate's Issue_Key, with `[QUO ✘]` also carrying the longest matching prefix length; `[REF]`, `[/CIT]`, `[/QUO]`, and `[/REF]` carry no Payload and no Payload_Section (the Parser re-derives Other_References from the Text under Requirement 20.5); and `[OVR]` carries the Override's reason and Timestamp.
3. THE Renderer SHALL escape every literal `[`, every literal `]`, and every literal Escape_Character, both in the Document's Text and in every Payload value (including Run_Ids and Override reasons), so that the Parser treats each escaped character as literal text and not as part of a Code. THE Renderer SHALL apply identical escaping in both Render_Modes.
4. WHEN a Document is rendered in either Render_Mode, THE Renderer SHALL also return one Code_Position for every emitted Code, with the Offset measured in the Document's Text (not in Reveal_Codes_Text), sorted by ascending Offset. Code_Positions that share an Offset SHALL appear in the same order as their Codes appear in Reveal_Codes_Text.
5. THE Renderer SHALL produce, in either Render_Mode, Reveal_Codes_Text from which removing every Code and unescaping the remainder yields a string equal to the Document's Text exactly.
6. WHEN several Codes fall at the same Offset, THE Renderer SHALL emit them in this fixed order: `[DOC]` (at Offset 0, in a Full_Rendering only), then `[/QUO]`, then `[/CIT]`, then `[/REF]`, then the span Code, then the opening citation Code, then `[OVR]` for that Citation, then `[REF]`, then the opening quote Code, then `[OVR]` for that Quote_Candidate. (An opening citation Code and `[REF]` never share an Offset, because Citation ranges are pairwise non-overlapping under Requirement 9.7.)
7. WHEN an Issue of any kind has an Override, including a Full_Citation rendered `[CIT ✘]`, `[CIT ?]`, or `[CIT …]`, an Orphan, and a Quote_Candidate rendered `[QUO ✘]` or `[QUO …]`, THE Renderer SHALL emit exactly one `[OVR]` immediately after that Issue's opening citation Code or opening quote Code.
8. WHEN an Issue has no Override, THE Renderer SHALL emit no `[OVR]` for that Issue.
9. WHEN a Document with empty Text is rendered, THE Renderer SHALL return, in Render_Mode `full`, a Reveal_Codes_Text consisting only of the `[DOC]` Code and exactly one Code_Position, at Offset 0, for that Code, and, in Render_Mode `display`, the empty string and zero Code_Positions.
10. WHEN a Document is rendered with Render_Mode `display`, THE Renderer SHALL produce a Display_Rendering that emits the same Codes as the Full_Rendering of that Document, at the same Text Offsets and in the same order, except that the `[DOC]` Code is omitted, and in which each Code carries only its Retained_Payload: the run id in `[AI:<run>]` and `[AI>HUM:<run>]`, the candidate count in `[CIT ?]`, and the reason text in `[OVR]`. `[REF]` and `[/REF]` SHALL appear in the Display_Rendering exactly as in the Full_Rendering.
11. THE Renderer SHALL write every Payload of a Code in a Full_Rendering other than its Retained_Payload inside that Code's Payload_Section, so that the Code with its Payload_Section removed is character for character the same Code as it appears in the Display_Rendering, and so that Strip is well defined on every Full_Rendering.
12. WHEN a Document is rendered with Render_Mode `display`, THE Renderer SHALL return Code_Positions equal to the Full_Rendering's Code_Positions with the `[DOC]` entry removed and Strip applied to each remaining Code.
13. FOR ALL Documents `d` the Engine can return, THE Renderer SHALL produce a Display_Rendering that is the projection of the Full_Rendering: Strip applied to the Reveal_Codes_Text of `render(d, "full")` SHALL equal the Reveal_Codes_Text of `render(d, "display")`, and Strip applied to the Code_Positions of `render(d, "full")` SHALL equal the Code_Positions of `render(d, "display")` (projection property).

### Requirement 20: Reveal Codes parsing and round trip (Request 6.2, Added)

**User Story:** As a maintainer, I want the full serialisation to parse back into the document it came from, so that the pane, which is a projection of it, is provably faithful.

This requirement applies to Full_Renderings only. The Parser is not required to accept a Display_Rendering.

#### Acceptance Criteria

1. WHEN the Parser receives the Full_Rendering Reveal_Codes_Text that `render(d, "full")` produced for a Document `d` returned by the Engine, THE Parser SHALL return a Result with `ok` equal to `true` whose value equals `d` in every one of these fields: Text; Spans, including each Span's Origin, Run_Id, and Timestamp; Run table, including each Run's Original_Length, cumulative edited count, and relabelled flag, and including Runs with no remaining Spans; Citations, including Offsets, text as written, Citation_Value, Normalised_Form, Short_Form link targets, and Orphan marks, and including Other_References, which the Parser obtains by running the Extractor on the decoded Text and checks against the `[REF]` and `[/REF]` Codes under criterion 5; Verification_Results, including their payloads; Quote_Candidates and their Offsets; Quote_Check_Results, including longest matching prefix lengths; Issue_Keys; Overrides, including reason and Timestamp; and Issue_Key_Counter.
2. THE Parser SHALL satisfy `parse(render(d, "full"))` equal to `d` under criterion 20.1 for every Document `d` the Engine can return. This includes the empty Document (empty Text, zero Spans); Documents whose Text contains `[`, `]`, the Escape_Character, straight and curly double quotation marks, and Surrogate_Pairs; Documents with every Origin and every Verification_Status; Documents with every Quote_Check_Result; and Documents that have at least one Override, including override reasons that contain `[`, `]`, or the Escape_Character.
3. IF the Parser receives text containing an unknown Code, an unterminated Code, an unbalanced `[/CIT]`, `[/QUO]`, or `[/REF]` (including an opening `[REF]` with no matching `[/REF]`), a missing `[DOC]` Code (which includes every Display_Rendering, including the empty string, with the fault at index 0), a repeated `[DOC]` Code or a `[DOC]` Code anywhere other than the start of the input, a Code field value that cannot be decoded into its field type, or a dangling Escape_Character, THEN THE Parser SHALL return a Result with `ok` equal to `false`, no Document, and an Engine_Error of kind `malformed_codes`. The Engine_Error SHALL carry the lowest index in the Parser's input string, measured in UTF-16 code units, at which any of these faults begins.
4. IF the Parser receives text whose Codes decode to a Document that violates the Coverage_Invariant, violates Requirement 3, contains a Provenance_Record that is invalid under Requirement 2.5, contains Text with an unpaired surrogate, contains a `mismatch` Quote_Check_Result that is invalid under Requirement 17.3, contains a Short_Form whose opening citation Code or `[CIT ?]` candidate count differs from the one Requirement 19.1 and 19.2 prescribe, contains a citation Code at the range of an Other_Reference, contains a `[REF]` Code carrying a Payload_Section or followed by an `[OVR]`, violates the Run invariant of Requirement 6.12, or contains an Override whose Issue_Key identifies no current Issue, THEN THE Parser SHALL return a Result with `ok` equal to `false`, no Document, and an Engine_Error of kind `malformed_codes` that identifies which of these rules was violated.
5. IF the Full_Citations, Short_Forms, or Quote_Candidates decoded from the Parser's input differ in Offsets, Citation_Value, Short_Form link target, or attachment (the attached Citation, and whether the Quote_Candidate is a Preceding_Quote or a Following_Quote under Requirement 13) from the Full_Citations, Short_Forms, and Quote_Candidates in the output of the Extractor run on the decoded Text, or the Text Offsets of the `[REF]` … `[/REF]` pairs in the Parser's input differ from the `[start, end)` ranges of the Other_References in that Extractor output (a missing pair, an extra pair, or a pair at different Offsets), THEN THE Parser SHALL return a Result with `ok` equal to `false`, no Document, and an Engine_Error of kind `malformed_codes`.
6. THE Parser SHALL return a Result without throwing for every input string. This includes the empty string, strings with no Codes, strings containing unpaired surrogates, and strings that were not produced by the Renderer.

### Requirement 21: Performance (Request 7.1)

**User Story:** As a filer typing in a long motion, I want edits applied without perceptible delay, so that provenance tracking never slows drafting.

#### Acceptance Criteria

1. WHEN a single-code-unit Insert with Origin `HUM` is applied at an Offset outside every Citation range and outside every Run_Extent of a benchmark Document, THE Engine SHALL return the new Document and its Inverse, with Citations and Quote_Candidates recomputed as Requirement 15.1 requires, in under 5 ms at the median and under 15 ms at the 95th percentile of 1,000 timed runs, each run starting from the same input Document and preceded by 100 untimed warm-up runs on the Reference_Machine. A benchmark Document has a Text of exactly 50,000 code units, exactly 500 Spans, at least 10 Runs, exactly 100 Full_Citations, and at least 20 Quote_Candidates.
2. WHEN a single-code-unit Insert with Origin `HUM` is applied at an Offset strictly inside both a Full_Citation's range and a Run_Extent of the benchmark Document from criterion 21.1, so that the Citation resets under Requirement 15.4 and the Run's Edited_Proportion is updated under Requirement 6.2, THE Engine SHALL return the new Document and its Inverse within the same median and 95th-percentile limits and under the same run conditions as criterion 21.1.
3. WHEN a single-code-unit Delete or a single-code-unit Replace with Actor `HUM` is applied to the benchmark Document from criterion 21.1 at an Offset outside every Citation range, THE Engine SHALL return the new Document and its Inverse within the same median and 95th-percentile limits and under the same run conditions as criterion 21.1.
4. THE Engine SHALL include a Benchmark_Script in `packages/engine/bench/`, outside `packages/engine/src` so that Requirement 1.3 does not apply to its clock use, that builds the benchmark Document deterministically from a fixed, recorded seed, measures every scenario in criteria 21.1 to 21.3, and prints the median and 95th-percentile time in milliseconds for each scenario.
5. IF any scenario measured by the Benchmark_Script exceeds its median or 95th-percentile limit, THEN THE Benchmark_Script SHALL exit with a non-zero status and name each failing scenario with its measured times.
6. WHEN the Benchmark_Script has run on the Reference_Machine, THE Repository SHALL contain in `BUILD_LOG.md` the measured median and 95th-percentile times for each scenario, the seed, and the Reference_Machine's CPU model, memory size, operating system, and JavaScript runtime version.
7. THE Repository SHALL run the Benchmark_Script only by manual invocation before a release, and SHALL invoke the Benchmark_Script from none of `pnpm test`, `pnpm test:pbt`, and the CI workflow in `.github/workflows/ci.yml`.

### Requirement 22: Shared arbitraries and property tests (Added from tech.md, testing.md)

**User Story:** As a maintainer, I want shared generators and properties for every invariant, so that the engine's guarantees are checked on thousands of inputs.

#### Acceptance Criteria

1. THE Engine SHALL provide the following named exports in `packages/engine/src/testing/arbitraries.ts`, each built only from fast-check combinators (no `fc.constant` of a pre-built or parsed blob), so that every generated value shrinks:
   - `arbText`: strings of 0 to 2,000 code units. Generated strings include Surrogate_Pairs, `[`, `]`, the Escape_Character, and straight and curly double quotes.
   - `arbDocument`: a Document whose Text comes from `arbText` or `arbTextWithCitations`, with 0 to 64 Spans and a Run table holding 0 to 8 Runs, built through the Engine's own creation, Operation, verification, quote-check, and Override functions, so that across generated values it covers every Verification_Status, every Quote_Check_Result, Orphans, Other_References, relabelled and non-relabelled Runs, and Documents with and without Overrides.
   - `arbOpSequence(doc)`: sequences of 0 to 20 Caller_Operations against the given Document. No generated Insert or Replace carries Origin `AI>HUM`; generated sequences include `AI` Inserts and Replaces under Run_Ids of relabelled Runs, so that Requirement 6.11 is exercised.
   - `arbCitation`: valid Full_Citation values.
   - `arbNearMissCitation`: Near_Miss strings.
   - `arbGarbageCitation`: Garbage_Citation strings.
   - `arbTextWithCitations`: prose of up to 5,000 code units containing 0 to 10 Citations and 0 to 10 Quote_Candidates at known Offsets, paired with the expected Extractor output. Across generated values it SHALL produce Preceding_Quotes with the Citation in the same Sentence and in the next Sentence, Preceding_Quotes with and without a Case_Name in the gap, Preceding_Quotes with and without a Gap_Signal in the gap (every Gap_Signal, in both its capitalised and its lowercase-first-letter form), Following_Quotes in parenthetical (`("…")`) and colon (`: "…"`) forms, Quotation_Pairs that satisfy both Requirement 13.1 and 13.8 (resolved under 13.5), Citations carrying several Quote_Candidates, and Quotation_Pairs that attach to nothing under 13.9 (a gap spanning two Sentence boundaries, a non-Gap_Signal word such as `In` or `with` in the gap, a Party_Name over 80 code units).
   - `arbCaseName`: Case_Name strings built from Party_Names of 1 to 80 code units, including Legal_Abbreviations, Single_Capital_Initials, `&`, `'`, `’`, `-`, internal commas, and Entity_Suffixes.
   - `arbShortFormParty`: Short_Form_Party strings of 1 to 80 code units, including Party_Runs with and without ` v. ` and with zero or one Entity_Suffix on each Party_Side.
   - `arbOpinionWithQuotes`: opinion bodies of up to 20,000 code units with 1 to 10 embedded quotations, each paired with its Offsets.
2. THE Engine SHALL implement each `Property N` listed in `design.md` as exactly one `fc.assert(fc.property(...))` in a file named `<module>.properties.test.ts`. Each property SHALL be preceded by the comment `// Property N` and SHALL have `_Requirements: x.y_` in its describe title. Each property SHALL contain at least one assertion that compares an output to a value derived from the generated input. A property that only checks that the function does not throw SHALL not count as an implementation of that `Property N`.
3. THE Engine SHALL run each property with `numRuns` of at least 200 under `pnpm test` and exactly 500 under `pnpm test:pbt`. WHEN a property fails, the test output SHALL report the seed and the shrunk counterexample, and re-running that property with `fc.assert(..., { seed })` and the reported seed SHALL reproduce the same counterexample.
4. THE Engine SHALL guarantee that its arbitraries generate only values that meet their definitions:
   - Every `arbDocument` value is a Canonical_Document whose Provenance_Records pass Requirement 2.5 and which satisfies Requirement 6.12.
   - Applying every Operation from `arbOpSequence(doc)` in order to `doc` returns a Result with `ok` equal to `true`.
   - The Normalised_Form of every `arbNearMissCitation` value names a Reporter_List entry, and the value's text differs from its Canonical_Form.
   - The reporter token of every `arbGarbageCitation` value matches no Reporter_List entry under exact or Near_Miss comparison.
   - Every `arbCaseName` value is a Case_Name as defined in the Glossary.
   - Every `arbShortFormParty` value is a Party_Run of 1 to 80 code units that starts with a Capitalised_Word and with no Party_Stop_List entry followed by a space, so that it is its own Short_Form_Party.
5. IF a property fails, THEN THE Engine SHALL receive a fix that adds the shrunk counterexample as a named example test in the same `<module>.properties.test.ts` file and that either changes Engine source code or records in `BUILD_LOG.md` which requirement is wrong and why. That fix SHALL leave the property's assertion, its arbitrary, and its `numRuns` unchanged, and SHALL add no new `fc.pre` precondition or filter that excludes the counterexample.
6. THE Engine SHALL contain no property or example test that mocks any `packages/engine` module. THE Engine SHALL contain no `try/catch` in any property or example test that suppresses an error or an assertion failure.

## Notes for the user

### Requirements added (not in your list)

- **Req 1, purity and packaging**: zero runtime dependencies, no `node:`/DOM imports, determinism, immutability, `Result` errors instead of throws, named exports (tech.md).
- **Req 2.2, empty document**: a document created from `""` has zero spans. Your 1.1 ("exactly one span") contradicts 1.2 (spans are non-empty) for empty input.
- **Req 2.5 and 7.4, provenance validation**: Run_Id present only for `AI` and `AI>HUM`.
- **Req 4.7–4.10**: empty insert and empty delete are no-ops; AI inserts accumulate the Run's Original_Length; operations on an empty document are defined.
- **Req 5.3–5.4, full-state inverses**: inverses restore citations, verification, quote checks, overrides, and relabelling, not just text and spans.
- **Req 6, Edited_Proportion defined**: (HUM-deleted code units from the run + HUM-inserted code units strictly inside the run's extent) / Original_Length. Only `HUM` edits count. The comparison is strictly greater than the threshold. Relabelling never reverts on forward ops; only an inverse undoes it. The threshold must lie in (0, 1].
- **Req 7.2–7.3**: inverted ranges and surrogate-pair splits are errors. Offsets are UTF-16 code units.
- **Req 8.2, 8.8**: segmenting empty text gives zero sentences, and boundaries never split a surrogate pair. Dominant-origin ties go to the earliest span.
- **Req 9.5–9.7, from citations.md**: parallel citations become one citation; statutes, regulations, and secondary sources become `Other_Reference` (recognised, never verified, never an Issue); citation ranges don't overlap.
- **Req 10.4**: `format` is idempotent.
- **Req 13.2–13.5**: quote offsets exclude the quotation marks; quotes attached to short forms are checked against the target case; a quote that could attach to a preceding and a following citation attaches to the following one.
- **Req 15, re-anchoring**: citations are re-extracted after every op; untouched ones keep their status and override with shifted offsets; touched ones reset to `unchecked`; a quote resets when its text or its citation resets; overrides are discarded on reset.
- **Req 16.3–16.6, 17.3, 18.5–18.6**: bad caller writes are errors; changing a citation's status discards its override.
- **Req 19.3, 19.5, 20.3–20.4**: the escape character is escaped too; the parser rejects malformed codes with the offset of the first fault.
- **Req 21**: the benchmark is pinned to a fixture shape (500 spans, 100 citations), the median of 1,000 runs, and a committed script.
- **Req 22**: added `arbOpinionWithQuotes`, which tech.md requires.

### Conflicts with the steering files and how they were resolved

1. **Creation timestamp vs. purity (1.1 vs. tech.md)**: the engine never reads a clock, so the caller supplies the timestamp.
2. **"Unknown" origin**: resolved, no fifth origin. `PST` means "entered from outside the editor, origin unknown" and is the unknown code. product.md principle 1 reads "If we cannot know, the code is PST."
3. **Code vocabulary**: resolved. The glyphs are confirmed (`✓`, not `✔`) and the complete list is binding in product.md under "Codes (binding)", now including the reference pair `[REF]` … `[/REF]`. The Glossary's Code_Vocabulary is exactly that list, and Req 19.2 only assigns Payloads to those Codes.
4. **Is `unchecked` red?**: resolved, yes. Only `verified` Full_Citations and `match` Quote_Candidates pass. `unchecked` Full_Citations (including throttled results with `wait_until`, and Westlaw or Lexis citations nobody could check), `unchecked` Quote_Candidates, and Orphans are Issues and block until overridden (Glossary Issue, 12.5, 13.4, 17.6–17.7, 18.2). A newly created Document with any Full_Citation therefore blocks until it is verified.
5. **Span merging and Timestamps**: resolved. Adjacent Spans merge when they are Mergeable (same Origin and Run_Id, Timestamp ignored), and the merged Span keeps the earlier Span's Timestamp (3.3, 3.5, 3.7, 4.1–4.4, 4.11–4.12). Inverses still restore every Timestamp exactly (5.3). Verification stays on citations, not spans.
6. **Ambiguous payload**: resolved. The engine stores the candidate cluster id list; the count shown in `[CIT ?]` is derived from it.
7. **Short-form linking (citations.md "nearest preceding full citation")**: `Id.` links to the immediately preceding authority, as in the steering. `Roe, 410 U.S. at 116` also requires the same volume and reporter (12.2), which refines the steering rather than contradicting it.
8. **Delete has no actor**: relabelling needs to know whether a deletion was human, so `Delete` carries an `actor`.
9. **Reference machine**: resolved. Req 21 records it in `BUILD_LOG.md`. The benchmark is run by hand before a release and is not part of `pnpm test`, `pnpm test:pbt`, or CI (21.7).
10. **Pane shows payloads**: resolved. Rendering has two Render_Modes. `full` carries every Payload and round-trips (Req 20 applies to `full` only). `display` emits the same Codes at the same Offsets, without `[DOC]` and with only the run id, the `[CIT ?]` candidate count, and the `[OVR]` reason. Display is Strip of full (19.10–19.13), which is a property. The Parser rejects display text as `malformed_codes` because `[DOC]` is missing (20.3).

### Decisions confirmed by the user

- **(a) Other_References get their own non-blocking Code pair, `[REF]` … `[/REF]`.** Statutes, regulations, and secondary sources are not citations under product.md ("a reference to a judicial opinion"), but the pane shows that the Engine recognised them. They stay in the Extractor output (9.6, 12.6 still makes `Id.` after one an Orphan), carry no Verification_Result, no Issue_Key, and no Payload, never take `[OVR]`, and are never Issues (19.1, 19.2). `[REF]` and `[/REF]` appear identically in both Render_Modes (19.10), and the Parser re-derives Other_References from the Text and requires the pair exactly at their ranges (20.1, 20.3, 20.5). Setting a result on one fails as `unknown_citation`, because it has no identifier (16.4, 16.5). Grey rendering is a UI concern outside this spec.
- **(b) A quote attached to an Orphan is its own Issue.** It stays `unchecked` (17.8 still rejects setting a result on it), so it blocks and needs its own Override, separate from the Orphan's (13.4, 18.2).
- **(c) product.md principle 4 lists `CIT …` and `QUO …` as blocking**, which keeps the steering consistent with the `unchecked` decision.
- **(d) Relabelling can merge Spans.** When a Run's Spans change to `AI>HUM`, a relabelled Span that becomes Mergeable with an adjacent `AI>HUM` Span of the same Run merges with it under 3.3, so 6.3 does not promise unchanged Offsets in that case.
- **(e) Run rules.** A Caller_Operation's Insert or Replace with Origin `AI>HUM` is rejected as `invalid_provenance` (7.4); only the Engine produces `AI>HUM`, and Inverses may restore it. New `AI` text under an already-relabelled Run is labelled `AI>HUM` and still counts toward Original_Length (6.11, 4.8). Each Run table entry carries a relabelled flag (Glossary, 19.2, 20.1, 5.3, 5.4, 7.7), and no Run ever holds both `AI` and `AI>HUM` Spans (6.12, enforced by the Parser in 20.4). `arbOpSequence` generates no `AI>HUM` inserts (22.1).
- **(f) Quote attachment covers the next Sentence, case names, and quotes after a citation.** The old rule (same Sentence, gap of whitespace and `, ; : . ( )` only) missed `"… ." Roe, 410 U.S. at 153.` and `"…," Roe v. Wade, 410 U.S. 113`. Now:
  - A Preceding_Quote attaches to the first Citation after its closing mark when that Citation is a Full_Citation or Short_Form, lies in the same or the next Sentence, and the gap holds only whitespace, `, ; : . ( )`, and at most one Case_Name (`<Party_Name> v. <Party_Name>,`, Party_Names 1–80 code units, no Signal, no quotation mark, no citation-shaped text) (13.1, Glossary). Decision (h) adds an optional Gap_Signal before the Case_Name. The party of a `<party>, <vol> <rep> at <page>` Short_Form is inside the Short_Form's range, so it needs no Case_Name.
  - A Following_Quote attaches to a Citation in the same Sentence when the gap from the Citation's end to the opening mark holds only whitespace and `, ; : (`, covering `Roe, 410 U.S. at 153 ("…")` and `410 U.S. 113, 116: "…"` (13.8).
  - When both rules apply, the quote attaches to the following Citation (13.5). Each quote attaches to at most one Citation; a Citation may carry several quotes (13.7); a quote matching neither rule yields no Quote_Candidate (13.9).
  - Re-anchoring carries a quote's result over only when its attached Citation and its attachment rule are unchanged, so edits to the gap alone can reset or drop a quote (15.7). The Parser checks the attachment rule against the Extractor (20.5). `arbTextWithCitations` generates every form, and a new `arbCaseName` arbitrary generates Case_Names (22.1, 22.4).
- **(g) The party of a `<party>, <vol> <rep> at <page>` Short_Form is a run of capitalised words with a stop-list.** The Extractor takes the longest Party_Run ending right before `, <volume>`: Capitalised_Words joined by single spaces, with the Connectors `&`, `of`, `the`, `and`, `ex rel.` allowed between them, using Party_Name's character rules and its 80-code-unit bound. It then strips leading Party_Stop_List entries (every Signal, including `Citing` and `Quoting`, plus `In`, `As`, `Under`, `Following`, `Applying`, `The court in`, `The Court in`) and any Connectors left at the front. The Short_Form starts at the first remaining word (Glossary Short_Form_Party, 9.2, 12.2), and no Short_Form range starts with a stop-list entry (12.8). `In Casey, 505 U.S. at 833` starts at `Casey`; `Planned Parenthood, 505 U.S. at 833` and `See Planned Parenthood, 505 U.S. at 833` start at `Planned`. Stripped words fall in the quote gap; decision (h) lets a stripped Gap_Signal such as `See` sit there, while `In` still blocks Preceding_Quote attachment (Case_Name note, 13.1). Decision (h) also lets a Party_Run contain ` v. ` and Entity_Suffixes.
- **(h) Three fixes to party names and quote gaps.**
  - **Party names may contain `v.`.** A Party_Run is one Party_Side or two joined by ` v. `, so `Roe v. Wade, 410 U.S. at 153` has party `Roe v. Wade` and its range starts at `Roe`. `v.` is no longer a Capitalised_Word on its own; it can only join two Party_Sides, at most once (Glossary Short_Form_Party, 9.2, 12.2, 12.8).
  - **Party names may end with an Entity_Suffix.** Entity_Suffix is `, ` plus one of `Inc.`, `LLC`, `L.L.C.`, `Ltd.`, `Co.`, `Corp.`, `L.P.`, `N.A.`. `Smith, Inc., 5 U.S. at 9` has party `Smith, Inc.`. The longest-match rule picks the whole suffixed party, and the 80-code-unit bound covers the whole party including ` v. ` and every suffix. `Ltd.`, `Co.`, `L.P.`, `N.A.`, and `L.L.C.` join the Legal_Abbreviations so the Segmenter never splits after them (8.6). Party_Name now accepts every period of a Legal_Abbreviation, including the inner periods of `L.L.C.`, `L.P.`, `N.A.`, and explicitly allows an Entity_Suffix, so `Acme, L.L.C. v. Smith,` is a Case_Name (Glossary Party_Name, Case_Name).
  - **Signals may sit in a Preceding_Quote's gap.** The gap is now `P1 + Gap_Signal? + P2 + Case_Name? + P3`. Gap_Signal is exactly `See`, `See also`, `See, e.g.,`, `E.g.,`, `Accord`, `Cf.`, `But see`, `Compare`, `Citing`, `Quoting`. `"…." See Roe v. Wade, 410 U.S. 113` and `"…" See Planned Parenthood, 505 U.S. at 833` attach; `"…" In Casey, 505 U.S. at 833` does not (13.1, Case_Name note). Signal now includes every Gap_Signal (adding `See, e.g.,`, `E.g.,`, `Citing`, `Quoting`), and the Party_Stop_List still holds every Signal plus its extra words. `arbTextWithCitations` generates Gap_Signals in both cases, and a new `arbShortFormParty` entry generates `v.` and Entity_Suffixes (22.1, 22.4).
  - Kiro decisions, which you can override:
    - **Lowercase signals are accepted** in the gap (`see`, `citing`, `quoting`, …), because they appear mid-sentence and in parentheticals such as `(quoting Roe v. Wade, 410 U.S. 113)`. Only the first letter may be lowercased.
    - **`with` is not a Gap_Signal.** In `Compare … with …`, `Compare` may be the Gap_Signal and the quote attaches to the Citation right after it; a quote is never attached across a `with`.
    - **Following-quote gaps take no signal (13.8).** `quoting` or `citing` after a Citation introduces a different case, so `Roe, 410 U.S. at 153 (quoting "…")` does not attach to `Roe`.
    - **An Entity_Suffix is allowed on each side of `v.`**, at most one per side, so `Acme, Inc. v. Smith, LLC, 5 U.S. at 9` has party `Acme, Inc. v. Smith, LLC`.

### Added during refinement

New behaviours:

- **Redo and `stale_inverse` (5.5–5.7)**: applying an inverse returns a redo inverse; undo/redo chains restore exact state; an inverse applied to the wrong document is rejected.
- **Fixed error precedence (7.6)**: `out_of_range`, then `inverted_range`, then `split_surrogate`, then `invalid_provenance`, then `invalid_timestamp`.
- **Explicit sentence-terminator rule (8.3–8.6)**: terminators, trailing quotes and parentheses, whitespace ownership, and the citation and abbreviation exclusions.
- **Citation boundary rules and word-boundary rejection (9.2, 9.8)**.
- **Canonical format layout and value ranges (10.1–10.2, 10.5)**, with `invalid_citation` for values outside them.
- **First-entry tie-break for ambiguous near misses (11.5, 14.6)**: the first matching entry in `reporters.json` order wins.
- **`Id.` after an Other_Reference or an Orphan is an Orphan (12.6–12.7)**.
- **Unpaired or empty quotes are ignored (13.6)**.
- **Explicit touched/untouched mapping (15.3)**.
- **Re-recording an override replaces it (18.4)**.
- **Fixed code order at shared offsets and `[OVR]` placement (19.6–19.8)**.
- **Parser cross-checks against the Extractor (20.5)**.
- **Performance (21.1–21.5)**: a p95 limit of 15 ms, delete/replace and in-citation scenarios, and a benchmark that exits non-zero on failure. **These go beyond your 7.1**, which asked only for a 5 ms median on a single insert. Drop them if you want 7.1 exactly.
- **Arbitrary size bounds and the counterexample regression rule (22.1, 22.5)**.

Consistency decisions made while merging:

- **`[DOC]` header Code (19.1, 19.2, 19.6, 19.9, 20.3)**: Run table entries (including Runs with no remaining Spans after 4.5) and the Issue_Key_Counter are carried in one `[DOC]` Code at Offset 0 of the Full_Rendering, not on every span Code. An empty Document therefore renders as just `[DOC]` in full mode and as the empty string in display mode. Without this, `parse(render(d, "full"))` could not restore Runs whose Spans were all deleted.
- **Opening Codes for Short_Forms (19.1, 19.2)**: they use the same `[CIT …]`-family Codes as Full_Citations. A linked Short_Form shows its target's status (and, for `[CIT ?]`, its target's candidate count) and is not an Issue. An Orphan shows `[CIT …]`, is an Issue, and gets `[OVR]` when overridden.
- **Issue_Keys and identifiers**: every Full_Citation, Short_Form, and Quote_Candidate carries an Issue_Key, assigned from a per-Document counter with no randomness; Other_References do not. The same key is the identifier callers pass to Req 16 and 17. Issue_Keys live in the Payload_Section of full-mode Codes so that they survive the round trip and never appear in the pane.
- **Payload_Section (19.11)**: full-mode Codes keep every non-retained Payload in a delimited section inside the brackets, so Strip works on text alone. design.md chooses the syntax.
- **`ambiguous` needs two or more candidates (16.2–16.3)**: citations.md describes status 300 as several clusters.
- **Quote results on an Orphan's quote are rejected (13.4, 17.8)** with `not_verifiable`.
- **The Extractor returns a plain value (9.9, 11.3)**, not a Result.
- **The Benchmark_Script lives in `packages/engine/bench/` (21.4)** because it needs a clock, which Req 1.3 forbids in `src`.
- **Reporter-list scope (14.1, 14.5)**: the only reporter list is `reporters.json`. Test files and the non-reporter Legal_Abbreviations are allowed. An exact reporter match can still carry a Normalised_Form when other parts of the citation differ from the Canonical_Form (11.2).
