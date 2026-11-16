# Requirements Document

## Introduction

A citation that resolves to a real decision with a different name than the one the filing gives must fail, the same way a citation that cannot be found fails. Today the Verifier checks only that a citation exists. On 2026-11-11, in live mode, the following was typed into the editor:

| Typed in the editor | Result today |
| ------------------- | ------------ |
| Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009) | CIT ✓, "No issues", Export enabled (556 U.S. 662 is Ashcroft v. Iqbal) |
| Varghese v. China Southern Airlines Co., Ltd., 925 F.3d 1339 (11th Cir. 2019) | CIT ✘ |
| Petersen v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012) | CIT ✓ |
| Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999) | CIT ✓ |
| Zicherman v. Korean Air Lines Co., Ltd., 516 F.3d 1237, 1254 (11th Cir. 2008) | CIT ✘ |

This feature makes the Extractor record the case name written before each full citation, adds the verification status `wrong_case` (code `CIT ≠`) for a citation whose single resolved cluster has a different name, and treats that status exactly like `not_found`: a red block in the Pane, a dotted underline on the page, a blocking Issues row, and an Override with a written reason. The comparison is a pure function in the Verifier. The Statement, the Provenance Appendix, the Sentinel, the code vocabulary in `product.md` and the Pane legend change to carry the new code. A second worked example, four citations from the Avianca sanctions order and two real decisions added for comparison, joins the Demo_Motion on the empty page, with recorded lookups so that demo mode gives the same answers as live mode. A non-blocking list of the citations that resolved to a matching decision, each with a link to the decision, completes the Issues region.

Product principles that bind this feature: principle 2 (the same text and the same CourtListener data give the same codes; no model decides whether a name matches), principle 3 (the request to CourtListener stays the formatted Citation_Lines; no case name leaves the machine), principle 4 (red codes block export), principle 5 (the Pane stays a faithful serialisation) and principle 7 (the look changes only by the new code and one legend item).

Interpretation notes, so that the criteria below are testable:

- `abbreviations.ts` holds the Legal_Abbreviation list that the Segmenter and the Party_Name rule use. It holds no expansions. The Name_Expansion_Table of Requirement 4 is a new table owned by the Verifier.
- A correct citation flagged as the wrong case is the failure that matters most here, so the name rule of Requirement 4 forgives the ways filers really write names: abbreviations, spaced initials such as `U. S.`, and initialisms such as `NLRB`.
- A changed `caseName` resets a citation's result to `unchecked` (Requirement 1, criterion 11), and a cached `verified` entry without name data counts as a cache miss (Requirement 5, criterion 7). Pincite ranges stay as they are.
- The public CourtListener pages are not the lookup API. The recording of Requirement 11 is the authority for every found name, and any difference from Requirement 12 stops the work.
- `case-name.ts` checks a Case_Name (`<Party_Name> v. <Party_Name>,`) and has no `In re` rule and no rule for where a Case_Name begins. The left edge of a name before a citation is found by the Party_Run rule of `party.ts` (the rule that finds a Short_Form_Party). The `In re` rule is new.
- `caseName` holds the name as written, without its closing comma and without any lead-in word.
- The Party_Run rule of `party.ts` reads only Capitalised_Words, Legal_Abbreviations and Connectors, so it does not read `Cascade Residential Mgmt., LLC` or `Dep't of Homeland Sec.`. A citation with such a name would reach the Verifier with no `caseName` and would pass on existence alone. The Tolerant_Read of Requirement 1, criteria 13 to 15 closes that gap inside `cited-name.ts`. `party.ts` and `case-name.ts` do not change, so quote attachment and sentence segmentation are untouched.
- The lookup request carries the Citation_Lines only. Its response carries, per cluster, `case_name`, `date_filed` and `absolute_url` (see `packages/verifier/fixtures/lookup/556-us-662.json`). The comparison therefore runs per record after the lookup entry is read, not per line.
- The pincite range `371-72` in the Miller row ended the Extractor's citation text at `174 F.3d 366, 371` when this note was first written, and the note said to leave it. The author withdrew that instruction on 2026-11-12; Requirement 18 now makes the citation text cover the whole range and the parenthetical after it.
- The Pane and the page underline are driven by the Document alone, so everything they show for `wrong_case` (found name, found year) is stored in the Document. The found name of a verified citation and the `absolute_url` of any citation are display data and are not stored in the Document. The link of a `wrong_case` row survives a reload because it can be built from the stored `clusterId`.

Follow-up (Requirements 17 to 21). The author walked the finished feature in a browser on 2026-11-12 and reported four findings: the two empty-page links cannot be clicked with a pointer (Requirement 17); a page range such as `371-72` ends the citation inside the range and leaves the court-and-year parenthetical outside it (Requirement 18); the rows and dialogs where the author decides do not say which name the filing gave (Requirement 19); and role words in a long `case_name_full` make a chance match easier (Requirement 20). Requirement 21 holds the process rules. Criterion 8 of Requirement 9 is reworded as the author asked. The original Requirements 1 to 16 are otherwise unchanged. The earlier instruction to leave page ranges alone (the interpretation note on `371-72`) is withdrawn by Requirement 18.

Second follow-up (Requirements 22 to 24). CI failed on commit aef6d70 in `packages/engine/test/arb-codes.test.ts`: the test "arbSemanticTamper … is rejected with the recorded rule and index, and every kind is reachable" saw 21 of the tamper kinds in 1,500 runs. The test draws with a random seed and this spec added kinds, so reaching every kind in one run had become a matter of luck (Requirement 22). The author also decided that a saved draft that cannot be read must never be silently replaced: the editor opens empty, the stored value stays, autosave does not write, and the Issues region says so and offers two actions (Requirement 23). Requirement 24 holds the process rules. Requirement 21, criterion 3 is reworded: the aggregate inventory test requires twenty properties, 1 to 20.

## Glossary

- **Engine**: `packages/engine`. Pure functions over plain data; no runtime dependency, no `node:` import, no DOM.
- **Verifier**: `packages/verifier`. Takes `fetch` as an injected dependency.
- **Web_App**: `apps/web`.
- **Sentinel**: the sweep CLI in `crew/sentinel`.
- **Export_Package**: `packages/export`.
- **Case_Name**: as in `case-name.ts`: `<Party_Name> v. <Party_Name>,`.
- **In_Re_Name**: `In re <Name>,` or `In Re <Name>,` where `<Name>` is a Party_Name of at most 80 code units (commas inside are allowed).
- **Cited_Name**: the `caseName` value of an ExtractedCitation: a Case_Name or In_Re_Name as written, without its closing comma and without a lead-in word such as a Signal, `In` or `As`.
- **Strict_Read**: the reading of a Cited_Name by criteria 2 to 5 of Requirement 1, which uses `partyStartFor`, `isCaseName` and `isPartyName` as they are.
- **Tolerant_Read**: the reading of a Cited_Name by criteria 13 and 14 of Requirement 1. Its result is used when the Strict_Read finds no name, and when it extends the Strict_Read result to the left by words none of which ends in a period (criterion 15).
- **Name_Token**: a token that begins with an uppercase letter and continues with letters, digits, `'`, `’`, `.` or `-`; it covers capitalised words, abbreviations such as `Mgmt.` and `Props.`, initials such as `U.S.`, and contractions such as `Dep't`, `Ass'n`, `Comm'r`, `Int'l`, `Nat'l` and `Gov't`.
- **Full_Citation**: a reporter, parallel or database citation, as in the provenance-engine spec.
- **Cluster_Data**: the `case_name`, `case_name_full`, `case_name_short`, `date_filed` and `absolute_url` fields of the one cluster that a lookup entry resolves to; the three name fields may be absent.
- **Found_Name**: the Cluster_Data `case_name`.
- **Found_Names**: the non-blank strings among the Cluster_Data `case_name`, `case_name_full` and `case_name_short`.
- **Found_Year**: the integer of the first four characters of the Cluster_Data `date_filed`, when they are four digits.
- **wrong_case**: the verification status `{ status: "wrong_case"; clusterId: string; foundName: string; foundYear?: number }`. Its code is `CIT ≠`.
- **Name_Match**: the pure function `namesMatch(cited: string, found: string): boolean` of the Verifier.
- **Normalised_Words**: the words of a name after Normalisation (Requirement 4).
- **Dropped_Words**: v, vs, in, re, the, of, and, et, al, ex, rel, inc, co, corp, corporation, company, llc, ltd, lp, llp, plc, na, and the fifteen Role_Words added by Requirement 20.
- **Role_Words**: plaintiff, plaintiffs, defendant, defendants, appellant, appellants, appellee, appellees, petitioner, petitioners, respondent, respondents, individually, deceased, no.
- **Pincite_Expression**: the text a citation gives after its page or `at`: one page (`371`), a range of two pages joined by a hyphen or an en dash with the second number written in full or shortened (`371-72`, `371–372`), or a list of up to five such items separated by a comma and one space (`678, 680-81`). A shortened second number is a run of one to five ASCII digits.
- **First_Page**: the first number of a Pincite_Expression; it is the only part stored as the value's `pincite`.
- **Walkthrough_Findings**: the four findings of the author's browser walkthrough of 2026-11-12 that Requirements 17 to 20 answer.
- **Joined_Letters**: a run of two or more consecutive single-letter words that Normalisation joins into one word, so that `u s` becomes `us` and `n l r b` becomes `nlrb`.
- **Initials_Skip_Words**: of, and, the, for; the only words skipped when initials are taken.
- **Initialism_Match**: the relation in which a word of two or more letters on one side equals the initials of two or more consecutive words on the other side, taking the first letter of each word and skipping Initials_Skip_Words.
- **Name_Expansion_Table**: the Verifier's table that maps a punctuation-free, lower-case abbreviation to one or more words, for example `dept` to `department` and `us` to `united states`.
- **Display_Info**: `{ foundName, foundYear?, absoluteUrl? }` for one resolved citation. It is returned beside the VerificationResult and is not part of it.
- **CourtListener_Link**: the plain link `View on CourtListener`. Its target is `https://www.courtlistener.com` followed by the cluster's `absolute_url` when that is at hand, and otherwise `https://www.courtlistener.com/opinion/<clusterId>/x/`.
- **Resolved_List**: the non-blocking list headed `Resolved citations` in the Issues_Region (Requirement 7).
- **Verify_Run**: one completed activation of the Verify action in the current browser session.
- **Recording_Script**: the script `packages/verifier/scripts/record-lookups.ts` that records live lookups as fixtures (Requirement 11).
- **Resolved_Citation**: a Full_Citation whose lookup entry resolved to exactly one cluster; its result is `verified` or `wrong_case`.
- **Failing_Block**: as defined in `ui.md` and `product.md` ("Pane palette").
- **Legend**: the strip of codes in the Pane_Header.
- **Issues_Region**: the Issues list and the Verify result lines of the Web_App.
- **Verify_Summary**: the `Citations:` and `Quotations:` lines of the Issues_Region.
- **Statement**: the AI-Use and Verification Statement built by `buildStatement`.
- **Provenance_Appendix**: the `render(document, "full")` text printed after the Statement.
- **Demo_Motion**: `packages/engine/fixtures/demo-motion.txt`.
- **Avianca_Sample**: `packages/engine/fixtures/avianca-citations.txt` (four citations from the Avianca sanctions order and two real decisions added for comparison), copied to `apps/web/public/avianca-citations.txt` by `apps/web/scripts/copy-demo.ts`.
- **Expected_Outcomes**: the table of Requirement 12.
- **Reveal_Codes_Form**: `render(document, "full")` and `render(document, "display")`, and `parse`.
- **Result**: the Engine's `Result<T, E>`.
- **Tamper_Kind**: a member of `TAMPER_KINDS` in `packages/engine/src/testing/arb-codes.ts`, the kinds of `arbSemanticTamper`.
- **Syntax_Fault_Kind**: a member of `SYNTAX_FAULT_KINDS` in `packages/engine/src/testing/arb-codes-syntax.ts`, the kinds of `arbSyntaxFault`.
- **Witness_Document**: a fixed Document, held in a test support module, to which the builder of one Tamper_Kind applies.
- **Reachability_Test**: a test that shows every member of a kind list can be produced by its arbitrary.
- **Rare_Kind**: the Tamper_Kind with the lowest measured frequency in `arbTamperDocument.chain(arbSemanticTamper)`.
- **Stored_Draft**: the string stored in `localStorage` under `AUTOSAVE_KEY`.
- **Unreadable_Draft**: a Stored_Draft for which `deserialise` returns an error other than `absent` (`not_json`, `bad_shape` or `bad_codes`).
- **Draft_Gate**: the in-memory value of the Web_App that is `blocked` from the load of an Unreadable_Draft until the author starts a new document, and `open` otherwise. It is not part of the Document, the Store state or any stored value.
- **Draft_Notice**: the text `A saved draft could not be read, so it was not loaded. It is still stored in this browser. Nothing you type is saved until you choose.` with its two actions, shown in the Issues_Region while the Draft_Gate is blocked.
- **Save_Copy_Action**: the button `Save a copy` of the Draft_Notice.
- **Start_New_Action**: the button `Start a new document` of the Draft_Notice, and the Toolbar's New button while the Draft_Gate is blocked.

## Requirements

### Requirement 1: The Extractor records the cited name

**User Story:** As a filer, I want the editor to know which case name I wrote before each citation, so that the Verifier can check the name against the decision the citation points to.

#### Acceptance Criteria

1. THE Engine SHALL add the optional field `caseName: string` to `ExtractedCitation`, and the field SHALL be absent (not `undefined`) when no Cited_Name applies.
2. WHEN a Full_Citation is immediately preceded by a Case_Name, THE Extractor SHALL set `caseName` to that Case_Name as written, without its closing comma, where "immediately preceded" means that only whitespace lies between the closing comma and the start of the Full_Citation.
3. WHEN the text before a Full_Citation reads `<lead-in> <Case_Name>` and the lead-in is a Signal, `In`, `As`, `Under`, `Following`, `Applying` or `The court in`, THE Extractor SHALL leave the lead-in out of `caseName`, by the Party_Run rule that `party.ts` applies to a Short_Form_Party.
4. WHEN a Full_Citation is immediately preceded by an In_Re_Name, THE Extractor SHALL set `caseName` to `In re <Name>` as written, including when `<Name>` holds commas, as in `In re Air Crash Disaster Near New Orleans, LA`.
5. WHEN a Full_Citation follows a semicolon of a string cite and is immediately preceded by a Case_Name or an In_Re_Name, THE Extractor SHALL set `caseName` for that Full_Citation.
6. THE Extractor SHALL leave `caseName` absent on every Short_Form (`Id.`, `Id. at 118`, `Roe, 410 U.S. at 116`) and on every Other_Reference.
7. WHEN neither the Strict_Read nor the Tolerant_Read finds a Case_Name or an In_Re_Name immediately before a Full_Citation, THE Extractor SHALL leave `caseName` absent for that Full_Citation.
8. WHEN a Parallel_Citation is preceded by a Case_Name, THE Extractor SHALL set `caseName` on the one ExtractedCitation that holds all of its members.
9. THE Extractor SHALL derive `caseName` after the match layer, from the text and the matches, so that the incremental rescan still returns exactly the match list of a full scan.
10. THE Extractor SHALL return, for every field other than `caseName`, the same `start`, `end`, `text`, `value`, `normalised`, link targets and quotes as before this feature, and every existing extraction property SHALL pass without being edited.
11. WHEN the Document pipeline applies an edit, THE Engine SHALL carry a citation record over only when its previous `caseName` equals its new `caseName` (both absent, or equal strings) in addition to the existing conditions, and SHALL otherwise give the citation a fresh key, the status `unchecked` and no Override.
12. THE Extractor SHALL be total: for every string, including the empty string and strings with unpaired surrogates, it SHALL return a value and SHALL NOT throw.
13. WHEN a Full_Citation has a tail comma as in criterion 2, THE Extractor SHALL apply the Tolerant_Read (always, so that criterion 15 can compare it with the Strict_Read result), which scans left from the tail comma over tokens separated by exactly one space and accepts a Name_Token (which may carry one trailing comma when it ends in `.`, as in `Mgmt.,` and `Co.,`), a token of ASCII digits, a Connector from `of`, `the`, `and`, `for`, `&`, `de` and `la`, and exactly one `v.`, and SHALL stop at a line break, at a second `v.`, and at any other token.
14. THE Extractor SHALL accept a Tolerant_Read result as `caseName` only when, after leading Party_Stop_List entries and Connectors are removed as criterion 3 describes, it holds `v.` with at least one token on each side, or begins with `In re` or `In Re` followed by at least one token, and SHALL otherwise leave `caseName` absent; a lowercase `re` SHALL be accepted only directly to the right of `In`, and the scan SHALL end there.
15. WHEN the Strict_Read finds a name, THE Extractor SHALL use the Strict_Read result, except that it SHALL use the Tolerant_Read result instead when that result is longer than the Strict_Read result and ends with the Strict_Read result (the Strict_Read result is its right-hand suffix, so the Tolerant_Read only adds words to the left of the strict name) AND none of the words it adds to the left of the Strict_Read result is a token ending in a period (Rule A). A token ending in a period cannot be told from the end of a sentence, so an extension over one would make the `caseName` change when an earlier sentence is edited; the Strict_Read result is kept instead, as in `Aaaa. Aaaa v. Dep't`, which gives `Aaaa v. Dep't`. Apostrophe contractions (`Dep't`), Connectors (`de`, `la`, `for`), capitalised words and digits among the added words are allowed, as in `Nnnn de Bbbb v. Nnnn`. A Tolerant_Read result that is not such an extension SHALL NOT replace the Strict_Read result. THE Extractor SHALL give every `caseName` from either read at most 164 code units, and SHALL leave `party.ts` and `case-name.ts` unchanged.

### Requirement 2: The `wrong_case` status in the Engine

**User Story:** As a filer, I want a citation to a different case to fail like a citation that cannot be found, so that the export cannot carry it unless I write down why.

#### Acceptance Criteria

1. THE Engine SHALL add the variant `{ status: "wrong_case"; clusterId: string; foundName: string; foundYear?: number }` to `VerificationResult`.
2. THE Engine SHALL add `"CIT ≠"` to `IssueCode`.
3. WHEN `setVerification` receives a `wrong_case` result whose `clusterId` or `foundName` is not a non-empty string, THE Engine SHALL return `invalid_verification_result` naming the field.
4. WHEN `setVerification` receives a `wrong_case` result whose `foundYear` is present and is not an integer from 1000 to 9999, THE Engine SHALL return `invalid_verification_result` naming `foundYear`.
5. WHEN `setVerification` receives `wrong_case` for a Short_Form, or for a Database_Citation whose Lexis court is unlisted, THE Engine SHALL return `not_verifiable`, as it does for `verified`.
6. WHEN a Full_Citation has the status `wrong_case`, THE Engine SHALL list it in `issues` with kind `citation` and code `CIT ≠`, in the same order position as any other citation Issue.
7. WHILE a Full_Citation has the status `wrong_case` and no Override, THE Engine SHALL list its Issue in `blockingIssues`.
8. WHEN `recordOverride` receives the key of a `wrong_case` Issue, a non-blank reason and a valid timestamp, THE Engine SHALL store the Override, and the Issue SHALL leave `blockingIssues`.
9. WHEN `setVerification` changes a citation's status from `wrong_case` to another status, or from another status to `wrong_case`, THE Engine SHALL drop the Override of that citation; WHEN the status stays `wrong_case`, THE Engine SHALL keep it.
10. WHEN a Short_Form links to a Full_Citation whose status is `wrong_case`, THE Engine SHALL report `wrong_case` from `verificationOf` for the Short_Form, and SHALL list no Issue for the Short_Form.
11. THE Export gate (`canExport`) SHALL refuse a Document that holds a `wrong_case` Issue without an Override, and SHALL accept it when every such Issue has an Override.
12. THE Engine, the Verifier, the Export_Package, the Sentinel and the Web_App SHALL update every `switch` and every lookup table keyed by `VerificationResult["status"]` or by `IssueCode` to handle `wrong_case` and `CIT ≠` without a `default` branch that hides a missing case, so that `pnpm typecheck` fails when any such site misses the new member.

### Requirement 3: Reveal Codes form and Provenance Appendix

**User Story:** As a reviewer of an exported filing, I want the Appendix to record that a citation named the wrong case and which case it is, so that the record can be re-read exactly.

#### Acceptance Criteria

1. THE Engine SHALL render a Full_Citation with the status `wrong_case` as the code `[CIT ≠…]` in the full form, carrying the key, the `clusterId`, the `foundName` and, when present, the `foundYear`, and as `[CIT ≠]` with no payload in the display form.
2. THE Engine SHALL render a Short_Form that links to a `wrong_case` Full_Citation with the code `[CIT ≠]` and its key only, as it does for the other statuses.
3. THE Engine SHALL close a `[CIT ≠]` code with `[/CIT]`, and `strip` and `stripPositions` SHALL remove it like any other citation code.
4. THE Engine SHALL render the Override of a `wrong_case` citation directly after its opening `[CIT ≠]` code, as it does for `[CIT ✘]`.
5. WHEN `foundName` holds any characters, including `[`, `]`, `{`, `}`, `;`, `:`, `"`, `\`, a backslash escape sequence and non-ASCII letters, THE Engine SHALL render it so that `parse` returns the identical string.
6. WHEN `parse` reads a `[CIT ≠…]` code whose `clusterId` or `foundName` is missing or empty, or whose `foundYear` is not an integer from 1000 to 9999, THE Engine SHALL return `malformed_codes` with the rule `bad_field` and the input index of the code.
7. WHEN `parse` reads a Short_Form code whose status differs from its target's status, or that carries a payload, THE Engine SHALL return `malformed_codes` with the rule `short_form_code`, as it does for the existing statuses.
8. FOR ALL Documents built from the shared arbitraries extended so that some Full_Citations carry `wrong_case` results, `parse(render(d, "full").text)` SHALL return a Document structurally equal to `d` (round-trip property; Property 2).
9. THE Export_Package SHALL print the full rendering of a Document that holds `wrong_case` results in the Provenance_Appendix without change to the two introductory sentences, so that the appendix records the `foundName` and the `clusterId`.
10. THE Sentinel SHALL parse a Provenance_Appendix that contains `[CIT ≠…]` without an `appendix_unparseable` error.

### Requirement 4: Name matching

**User Story:** As a maintainer, I want one pure function that decides whether two case names are the same case, so that the rule is written down once, forgives the ways filers really write names, and is the same for every caller.

#### Acceptance Criteria

1. THE Verifier SHALL export the pure function `namesMatch(cited: string, found: readonly string[]): boolean`, where `found` holds the Found_Names, that performs no I/O, reads no clock and imports nothing from `node:`.
2. THE Verifier SHALL normalise a name in this order: lower-case it; delete every character that is not a letter, a digit or whitespace; split it on whitespace; join each run of Joined_Letters into one word; replace each word that is a key of the Name_Expansion_Table with its expansion, which may be more than one word; drop each Dropped_Word.
3. THE Verifier SHALL hold the Name_Expansion_Table in one module, with every key punctuation-free and lower-case, and the design SHALL list its final entries.
4. THE Name_Expansion_Table SHALL hold `dept` to `department`, `us` to `united states`, `commr` to `commissioner`, `govt` to `government`, `bd` to `board`, `educ` to `education`, `ins` to `insurance`, `mfg` to `manufacturing`, `sch` to `school`, `ry` to `railway`, `rr` to `railroad`, `hous` to `housing`, `fedn` to `federation`, `socy` to `society`, `ctr` to `center`, `sys` to `system`, `servs` to `services`, `mgmt` to `management`, `assn` to `association`, `intl` to `international`, `natl` to `national`, `bros` to `brothers`, `univ` to `university`, `hosp` to `hospital`, `auth` to `authority`, `cnty` to `county`, `commn` to `commission`, `props` to `properties`, `cos` to `companies` and `assocs` to `associates`, which makes thirty entries, and SHALL hold no key that stands for two different words.
5. THE Verifier SHALL split the cited name into parties at its ` v. `; a cited name with no ` v. `, such as an In_Re_Name, SHALL have one party.
6. THE Verifier SHALL normalise each cited party separately, and SHALL normalise each of the Found_Names separately and take the union of their Normalised_Words as the found words.
7. WHEN every cited party that has at least one Normalised_Word shares a word with the found words, THE Name_Match SHALL return `true`, where a shared word is a Normalised_Word of the party that is among the found words, or an Initialism_Match between a word of the party and the words of any one Found_Name, in either direction.
8. WHEN some cited party that has at least one Normalised_Word shares no word with the found words, THE Name_Match SHALL return `false`.
9. WHEN no cited party has a Normalised_Word, THE Name_Match SHALL return `true`.
10. THE Verifier SHALL take the initials of an Initialism_Match from the words of a party after joining Joined_Letters and before expansion and dropping, skipping only the Initials_Skip_Words.
11. THE Name_Match SHALL return `true` for each of these example pairs: `NLRB v. Jones & Laughlin Steel Corp.` and `National Labor Relations Board v. Jones & Laughlin Steel Corp.`; `SEC v. Chenery Corp.` and `Securities and Exchange Commission v. Chenery Corporation`; `U.S. v. Lopez` and `United States v. Lopez`.
12. FOR ALL generated Case_Names, THE Name_Match of a name with itself, with its letter case changed, with its punctuation removed, with any abbreviation of the Name_Expansion_Table expanded, and with one party replaced by the initialism of its words (at least two words) SHALL return `true`, and the Name_Match of a name with a generated name that shares no Normalised_Word and no Initialism_Match with it SHALL return `false` (Property 1).
13. THE Name_Match SHALL return the same value for the same inputs on every call.

### Requirement 5: The verifier rule

**User Story:** As a filer, I want a citation that resolves to a different case to be reported as such, so that a real citation under a wrong name cannot pass as verified.

#### Acceptance Criteria

1. WHEN a lookup entry resolves a Full_Citation record to exactly one cluster, the record has a `caseName`, and the Cluster_Data has a `case_name` that is a non-blank string, THE Verifier SHALL return `verified` with that cluster id when the Name_Match of the `caseName` and the Found_Names is `true`, and SHALL return `wrong_case` with that cluster's id, the `case_name` as `foundName` and the Found_Year as `foundYear` otherwise.
2. WHEN a record resolves to exactly one cluster and has no `caseName`, or the Cluster_Data has no `case_name` that is a non-blank string, THE Verifier SHALL return `verified` as before this feature.
3. WHEN a lookup entry has the status 300, 400, 404 or 429, or malformed data, THE Verifier SHALL return `ambiguous`, `not_found`, `not_found` with reason `unknown_reporter`, `unchecked`, or `unchecked` respectively, as before this feature, and SHALL perform no name comparison.
4. THE Verifier SHALL run the comparison once per record, so that two records of one lookup line with different `caseName` values (for example `Henderson v. Pacific Housing Authority, 556 U.S. 662` and `Ashcroft v. Iqbal, 556 U.S. 662` in one Document) receive their own results.
5. WHEN a Parallel_Citation record's members resolve to one common cluster, THE Verifier SHALL apply the comparison to that cluster; WHEN they resolve to different clusters, THE Verifier SHALL return `ambiguous` as before this feature.
6. THE Verifier SHALL send CourtListener the Citation_Lines only, so that the body of every lookup request is identical to the body before this feature and holds no case name.
7. THE Verifier SHALL keep the Cluster_Data (`case_name`, `case_name_full`, `case_name_short`, `date_filed`, `absolute_url`, each where the response has it) in the cache entry of a resolved line, and SHALL treat a cached `verified` entry that holds no Cluster_Data record as a cache miss, so that a cache hit never skips the comparison and a live lookup and a cache hit give the same result.
8. THE Verifier SHALL return the Display_Info of every Resolved_Citation beside the VerificationResult, and SHALL leave `absoluteUrl` out of the Display_Info when `absolute_url` is not a string that begins with a single `/`.
9. THE Verifier SHALL set Found_Year from the first four characters of `date_filed` only when they are four digits, and SHALL leave `foundYear` absent otherwise.
10. THE Web_App's verify route SHALL accept an optional `caseName` string of at most 200 code units on a record's citation, SHALL answer 400 with its fixed message for a `caseName` of any other type, and SHALL return the Display_Info with its results.
11. THE Web_App's client SHALL accept a `wrong_case` result in a verify response and SHALL treat any other unknown status as a shape error, as before this feature.
12. WHEN the `lookup_citations` tool of the courtlistener-mcp package reads a citation string that holds a case name before the citation, THE tool SHALL apply the rule of criterion 1: for `Henderson v. Pacific Housing Authority, 556 U.S. 662, 678 (2009)` it SHALL return the result `wrong_case` with `foundName` `Ashcroft v. Iqbal` and `foundYear` 2009, and for `556 U.S. 662` alone it SHALL return `verified`.
13. THE `lookup_citations` tool SHALL include in its output for each Full_Citation the `caseName` that the Extractor read, and SHALL omit the key when the Extractor read none.
14. THE exported function `lookup(records, deps)` of the Verifier SHALL return exactly the `results` of `lookupWithInfo(records, deps)` for the same arguments, so that every caller of `lookup`, including the courtlistener-mcp package and the Sentinel, receives the comparison of criterion 1.

### Requirement 6: The Pane, the legend and the page underline

**User Story:** As a filer, I want the new code to look like the other failing codes, so that I see the failure at once and the product keeps one look.

#### Acceptance Criteria

1. THE Pane SHALL draw `[CIT ≠]`, its text and its `[/CIT]` closer as one Failing_Block, with the same colours, weight and ring as `[CIT ✘]`.
2. THE Pane SHALL draw a Short_Form that links to a `wrong_case` citation as `[CIT ≠]` in a Failing_Block, as it does for a Short_Form that links to a `not_found` citation.
3. THE Legend SHALL gain the entry `[CIT ≠]` with the words `wrong case`, as a failing entry with a 1px ring, placed directly after `[CIT ✘] not found`, and SHALL keep the other seven entries and their order.
4. THE Pane's plain-words description of the code `[CIT ≠]` SHALL read `Citation is a different case`.
5. WHEN a Full_Citation has the status `wrong_case`, THE Web_App SHALL mark its range on the page with the same dotted underline as `CIT ✘`, and SHALL set the hover title of that mark to `This citation is <foundName> (<foundYear>)`, or `This citation is <foundName>` when `foundYear` is absent.
6. THE Web_App SHALL add no colour literal, no Token, no icon and no style beyond the selectors and class names that name the new code.
7. THE `product.md` steering file SHALL list `[CIT ≠]: wrong case; CourtListener resolved the citation to exactly one cluster whose case name does not match the name the filing gives` among the Citation codes, SHALL add `wrong_case` to the verification status vocabulary, SHALL add `CIT ≠` to the codes named in principle 4, and SHALL add `CIT ≠` to the Failing_Block row of the Pane palette.
8. THE `citations.md` steering file SHALL gain the comparison rule and the `wrong_case` mapping in its verification contract.

### Requirement 7: The Issues row, the link, the Resolved list and the Verify result

**User Story:** As a filer, I want the row to say which case my citation really points to, let me open it, and show me which citations resolved cleanly, so that I can fix the name or the citation and see what the check accepted.

#### Acceptance Criteria

1. WHEN a Full_Citation has the status `wrong_case`, THE Issues_Region SHALL show one row with the failing chip `CIT ≠`, the words `blocking, wrong case` (or `overridden, wrong case` after an Override), the citation text shortened as for other rows, and under the citation text the line `This citation is <foundName> (<foundYear>)`.
2. WHEN `foundYear` is absent, THE Issues_Region SHALL print the line as `This citation is <foundName>`.
3. THE row SHALL keep the `Go` button and the `Override…` button of the other blocking rows, and the written Override reason SHALL show on the row as `Overridden: <reason>`.
4. WHEN a `wrong_case` row or a Resolved_List row is shown and the `clusterId` of the citation's result is a string of ASCII digits, THE Issues_Region SHALL offer the CourtListener_Link as an `a` element with `target="_blank"` and `rel="noreferrer"`, whose `href` is `https://www.courtlistener.com` followed by the `absoluteUrl` of the Display_Info when the Display_Info holds one for that cluster, and otherwise `https://www.courtlistener.com/opinion/<clusterId>/x/`.
5. THE Web_App SHALL keep the Display_Info of the latest Verify_Run in memory only, keyed by issue key, and SHALL use it for a citation only while the cluster id of the Display_Info equals the `clusterId` of the citation's current result.
6. THE Web_App SHALL NOT store the Display_Info of a `verified` citation, or the `absoluteUrl` of any citation, in the Document, in the autosaved value, in the Provenance_Appendix or in the Statement.
7. WHEN a Document holding a `wrong_case` citation is reloaded from the autosaved value, THE `wrong_case` row SHALL show the same `foundName`, the same `foundYear` and a CourtListener_Link built from the stored `clusterId`, with no Verify_Run needed.
8. WHILE a Document holds only `verified` citations, THE Issues_Region SHALL keep showing `No issues.`, and the Resolved_List SHALL NOT change that line.
9. THE Verify_Summary SHALL show the term `<n> wrong case` on the `Citations:` line, between `<n> found` and `<n> not found`, and SHALL omit the term when `n` is 0.
10. THE Export dialog's issue list SHALL show the chip `CIT ≠` and the same words as the Issues_Region for a `wrong_case` Issue.
11. THE Web_App's row text, link text and hover title SHALL contain no exclamation mark, no icon and no emoji, and SHALL show severity in words.
12. WHILE no Verify_Run has completed in the current browser session, THE Issues_Region SHALL NOT show the Resolved_List.
13. WHEN a Verify_Run has completed and at least one Full_Citation has the status `verified`, THE Issues_Region SHALL show the Resolved_List below the Issues list, headed `Resolved citations`, with one row per such Full_Citation in document order.
14. THE Resolved_List row SHALL show the citation as written (shortened as for other rows), the text `<foundName> (<foundYear>)` (or `<foundName>` when `foundYear` is absent) only while the Display_Info is usable under criterion 5, and the CourtListener_Link.
15. THE Resolved_List SHALL NOT list a `wrong_case` citation, a Short_Form, or a citation with any other status, and a `wrong_case` citation SHALL appear only in the Issues list.
16. THE Resolved_List SHALL NOT change the blocking count, the state of the Export button, or the Next_Step, and SHALL carry no Override control and no `Go` button.
17. WHEN a Verify_Run has completed and no Full_Citation has the status `verified`, THE Issues_Region SHALL NOT show the Resolved_List heading.
18. THE Resolved_List SHALL add no colour literal, no Token and no icon, and SHALL use the existing link colour of `ui.md`.

### Requirement 8: The Statement and the Appendix

**User Story:** As a court reader of the exported filing, I want the Statement to count the citations that named a different case and to name that case, so that the certification matches the record.

#### Acceptance Criteria

1. THE Export_Package SHALL word the citation paragraph of the Statement as `Every legal citation in this filing was checked against the CourtListener database on <date>. <n> resolved to a single reported decision, <n> resolved to a different case than the one named, <n> could not be found, <n> matched more than one decision, and <n> were not checked.`, with the existing date wording for a missing check date.
2. THE Export_Package SHALL print a zero term with its numeral `0`, as the existing paragraph does.
3. THE Export_Package SHALL count a `wrong_case` citation in the term `resolved to a different case than the one named` and in no other term.
4. WHEN the Statement lists a `wrong_case` citation, THE citation table SHALL show `CIT ≠ (<foundName>, <foundYear>)` in its Status cell, for example `CIT ≠ (Ashcroft v. Iqbal, 2009)`, or `CIT ≠ (<foundName>)` when `foundYear` is absent, and the cluster id in its Cluster id cell, and SHALL add no column.
5. THE Export_Package SHALL list a `wrong_case` Override in the Overrides table like any other Override, with the code `CIT ≠`, the citation text, the reason and the local timestamp, and in Issue order.
6. THE Export_Package SHALL keep `wording.ts` as the only module that holds the fixed wording, with the new sentence and the code `CIT ≠` in it.
7. THE DOCX builder and the print view at `/print` SHALL show the same Statement blocks, so that the new paragraph and the new Status cell appear in both, and the DOCX and print tests SHALL expect them.
8. THE Statement SHALL read `foundName` and `foundYear` from the Document and SHALL make no network call.
9. THE `docs/CERTIFICATION.md` statement paragraph SHALL name the count of citations that resolved to a different case than the one named.

### Requirement 9: The Sentinel

**User Story:** As a maintainer who sweeps exported filings, I want a citation that changed between `verified` and `wrong_case` to show as drift and to name the case, so that a re-check reports it.

#### Acceptance Criteria

1. THE Sentinel's status text SHALL print a `wrong_case` result as `wrong_case <clusterId> <foundName>`, so that the notice names the case.
2. WHEN a citation's recorded status was `verified` and its re-check gives `wrong_case`, THE Sentinel SHALL report one `citation_changed` finding whose Before reads `verified <clusterId>` and whose After reads `wrong_case <clusterId> <foundName>`.
3. WHEN a citation's recorded status was `wrong_case` and its re-check gives `verified`, THE Sentinel SHALL report one `citation_changed` finding whose Before reads `wrong_case <clusterId> <foundName>` and whose After reads `verified <clusterId>`.
4. WHEN a citation's recorded status and its re-check are both `wrong_case` with different cluster ids, THE Sentinel SHALL report a `citation_changed` finding, as it does for two `verified` results with different cluster ids.
5. WHEN a citation's recorded status and its re-check are both `wrong_case` with the same cluster id, THE Sentinel SHALL report no finding for it, whatever the two `foundName` values are.
6. THE Sentinel SHALL re-check each recorded citation with the `caseName` that the Extractor reads from the recorded text, so that no Sentinel source file other than `status-text.ts` and `findings.ts` needs to change, and `reverify` receives the comparison through `lookup` (Requirement 5, criterion 14).
7. THE Sentinel tests SHALL gain one example test for the direction `verified` to `wrong_case`, one for `wrong_case` to `verified`, and one example test in which an appendix containing `CIT ≠` parses.
8. WHEN the Sentinel sweeps a filing exported before this spec, whose Statement citation paragraph has no wrong-case term and whose appendix holds no `CIT ≠`, THE Sentinel SHALL report no finding and no error for it when the name each recorded `verified` citation gives matches the re-check data, and SHALL report one `citation_changed` finding (Before `verified <clusterId>`, After `wrong_case <clusterId> <foundName>`) for each recorded `verified` citation whose written name now resolves to a different case; the Sentinel tests SHALL contain one example test for each of the two outcomes.

### Requirement 10: The Avianca sample and the empty-page links

**User Story:** As a judge trying the app with no account, I want a second worked example that shows a real citation under a wrong name, so that I can see the new failure in one click.

#### Acceptance Criteria

1. THE repository SHALL hold the Avianca_Sample as plain text whose first line reads exactly `The first four citations are from the Affirmation in Opposition in Mata v. Avianca, Inc., No. 22-cv-1461 (S.D.N.Y. 2023), as listed in the court's Opinion and Order on Sanctions, ECF 54 at 7. The last two are real decisions, added for comparison.`, where that line is the whole first paragraph of the sample and one blank line follows it.
2. THE Avianca_Sample SHALL be a short passage written for this app and SHALL NOT copy text from the brief.
3. THE Avianca_Sample SHALL cite, in this order, each with its Case_Name immediately before it: `Varghese v. China Southern Airlines Co., Ltd., 925 F.3d 1339 (11th Cir. 2019)`; `Petersen v. Iran Air, 905 F. Supp. 2d 121 (D.D.C. 2012)`; `Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999)`; `Zicherman v. Korean Air Lines Co., Ltd., 516 F.3d 1237, 1254 (11th Cir. 2008)`; `Zicherman v. Korean Air Lines Co., 516 U.S. 217 (1996)`; `Chambers v. NASCO, Inc., 501 U.S. 32 (1991)`.
4. THE Avianca_Sample SHALL place between the fourth and fifth citations the paragraph `The citation above and the one below share a name. The one above is invented. The one below is the real decision of the Supreme Court.`, SHALL place before the sixth citation the line `A second real decision, for comparison:`, and SHALL NOT say or imply that the brief cited the fifth or the sixth.
5. WHEN the Extractor reads the Avianca_Sample, THE Extractor SHALL return exactly six Full_Citations, each with the `caseName` of its own name as written, and none from the first line, including none from `No. 22-cv-1461` and `ECF 54 at 7`, and the first line SHALL NOT contribute a `caseName` to any of the six.
6. THE copy script `apps/web/scripts/copy-demo.ts` SHALL copy the Avianca_Sample byte for byte to `apps/web/public/avianca-citations.txt` next to the Demo_Motion, and the copied file SHALL stay git-ignored like `demo-motion.txt`.
7. WHILE the Document text is empty, THE empty page SHALL show, under the existing placeholder text, two plain links in this order: `Load demo motion` and `Load the Avianca citations`.
8. WHEN the author activates `Load demo motion`, THE Web_App SHALL load the Demo_Motion exactly as the Toolbar button does today.
9. WHEN the author activates `Load the Avianca citations`, THE Web_App SHALL load the Avianca_Sample through the same path as the Demo_Motion, so that it enters the Document as one `PST` span.
10. IF the Avianca_Sample cannot be fetched, THEN THE Web_App SHALL show one plain sentence in the notice region and SHALL leave the Document unchanged.
11. WHILE the Document text is not empty, THE Web_App SHALL show neither link.
12. THE links SHALL be keyboard-focusable, SHALL be reachable by assistive technology (the placeholder text may stay `aria-hidden`; the links SHALL NOT), SHALL use the link colour of `ui.md`, and SHALL carry no icon.
13. THE Toolbar SHALL stay as it is: the same buttons, the same labels, the same primary-button rule.
14. WHEN the Avianca_Sample is verified in demo mode, THE Web_App SHALL give the same statuses as in live mode for the same data (Requirement 11).
15. IF the extraction example test of criterion 5 shows that any line of the Avianca_Sample reads differently from the six expected Full_Citations and their `caseName` values, THEN THE task SHALL report which line reads differently and why BEFORE it changes the sample text, and SHALL NOT change the Extractor, the Tolerant_Read or the sample to make the test pass without that report.

### Requirement 11: The recording script and the recorded lookups

**User Story:** As a judge who tests the deployed app without a token, I want demo mode to give the same answers as live mode, so that the second example works with no credentials.

#### Acceptance Criteria

1. THE Recording_Script SHALL be added at `packages/verifier/scripts/record-lookups.ts`, next to the package it records for, as `apps/web/scripts/` sits next to its package, because no script that makes live lookups for fixtures exists today.
2. THE Recording_Script SHALL read the CourtListener token from the environment only, SHALL NOT print it, log it or write it to any file, SHALL NOT write any request header into a fixture, and SHALL take `fetch` as an injected dependency so that its tests make no network call.
3. THE Verifier tests SHALL scan every file under `packages/verifier/fixtures/` and fail when any file contains an authorization value (a `Token` or `Bearer` credential, or an `authorization` header).
4. IF the token is not in the shell environment of the agent that runs the recording task, THEN THE task SHALL stop and tell the author, who will run the Recording_Script in the author's own terminal.
5. THE Verifier fixtures SHALL gain one lookup fixture each for `925 F.3d 1339`, `905 F. Supp. 2d 121`, `174 F.3d 366`, `516 F.3d 1237`, `516 U.S. 217` and `501 U.S. 32`, each recorded live from CourtListener with the Recording_Script, in the shape of the existing lookup fixtures, with the embedded cluster trimmed to identifying fields that keep `id`, `absolute_url`, `case_name`, `date_filed`, and `case_name_full` and `case_name_short` where the response carries them.
6. THE task SHALL NOT record the lines `360 N.J. Super. 360` or `821 F.2d 1147`.
7. THE manifest SHALL list each new fixture with `source` `courtlistener-live`, its recording date and a note, and the fixtures README SHALL gain a line for each, as the testing rules require; `fixtures.ts` SHALL route each of them.
8. THE fixture for `556 U.S. 662` SHALL stay the existing file, because a lookup is keyed by the citation line and the name `Henderson v. Pacific Housing Authority` is not part of the request; the recording task SHALL re-fetch that line and report whether the live entry still matches the fixture.
9. WHEN the recording is done, THE task SHALL report, for each of the seven lines (the six above and `556 U.S. 662`), the status, the cluster id and the case name that CourtListener returned.
10. IF any recorded result differs from the Expected_Outcomes of Requirement 12 (a status, a cluster, or a name that makes the rule give a different outcome), THEN THE task SHALL report the difference and stop, and SHALL NOT change the Avianca_Sample, the rule, the Expected_Outcomes or the fixtures to make them fit.
11. THE recording SHALL NOT write the token to a file, a fixture, a log or a commit.

### Requirement 12: Worked outcomes

**User Story:** As a reviewer of the rule, I want every case the product shows to have its outcome written down before the code, so that I can check the rule against real names.

#### Acceptance Criteria

1. THE design SHALL contain a table with one row for each of these inputs: the five rows of the table in the Introduction; every Full_Citation and every Short_Form of the Demo_Motion; the six citations of the Avianca_Sample; and every line of the existing fixtures. Each row SHALL give the cited name, the citation line, the lookup status, the found name, and the outcome the rule gives.
2. THE Expected_Outcomes SHALL be, from the author's lookups on CourtListener's public pages (the recording of Requirement 11 is the authority):

   | Citation line | Cited name | Found name (cluster) | Outcome |
   | ------------- | ---------- | -------------------- | ------- |
   | 556 U.S. 662 | Henderson v. Pacific Housing Authority | Ashcroft v. Iqbal (145875), 2009 | `wrong_case` |
   | 556 U.S. 662 | Ashcroft v. Iqbal (Demo_Motion) | Ashcroft v. Iqbal (145875) | `verified` |
   | 404 U.S. 519 | Haines v. Kerner (Demo_Motion) | Haines v. Kerner | `verified` |
   | 925 F.3d 1339 | Varghese v. China Southern Airlines Co., Ltd. | not found | `not_found` |
   | 905 F. Supp. 2d 121 | Petersen v. Iran Air | United States of America v. ISS Marine Services, Inc. (2661490) | `wrong_case` |
   | 174 F.3d 366 | Miller v. United Airlines, Inc. | Greenleaf v. Garlock, Inc. (3011108) | `wrong_case` |
   | 516 F.3d 1237 | Zicherman v. Korean Air Lines Co., Ltd. | not found | `not_found` |
   | 516 U.S. 217 | Zicherman v. Korean Air Lines Co. | Zicherman ex rel. Estate of Kole v. Korean Air Lines Co. (117990) | `verified` |
   | 501 U.S. 32 | Chambers v. NASCO, Inc. | Chambers v. NASCO, Inc. (112616) | `verified` |

3. THE Demo_Motion's Alvarez, Brennan and Okafor citations SHALL each carry a `caseName` (Alvarez and Okafor through the Tolerant_Read) and SHALL give `not_found`, and its `Id.` and `Iqbal, 556 U.S. at 679` SHALL carry no `caseName` and take their target's result.
4. THE existing fixture lines `1 Hill 150` (300, two clusters), `576 U.S. 644` (429 inside HTTP 200), `1047 F.3d 212`, `1012 F. Supp. 2d 88` and `912 F.4th 33` (404) SHALL keep their results, because no name comparison runs for them.
5. WHEN a recorded found name for Petersen or Miller shares a Normalised_Word or an Initialism_Match with every party of the cited name, THE recording task SHALL report it under criterion 10 of Requirement 11, because the rule would then give `verified` for a citation that this spec expects to fail.
6. THE tests SHALL contain one example test per row of criterion 1 that asserts its outcome.
7. THE tests SHALL contain an example test in which `Alvarez v. Cascade Residential Mgmt., LLC, 556 U.S. 662, 678 (2009)` gives `wrong_case` against the recorded `556 U.S. 662` fixture, and an example test in which `Dep't of Homeland Sec. v. Regents of the Univ. of Cal.` matches `Department of Homeland Security v. Regents of Univ. of Cal.`.

### Requirement 13: Tests

**User Story:** As a maintainer, I want the rule and the round trip proved by properties and the user-visible text proved by examples, so that a later change cannot weaken the check unnoticed.

#### Acceptance Criteria

1. THE Verifier tests SHALL contain Property 1 (names) of Requirement 4, criterion 12, as one `fc.assert(fc.property(...))` in `case-match.properties.test.ts`, with the comment `// Property 1` above it and `_Requirements: 4.12_` in the describe title.
2. THE Engine tests SHALL contain Property 2 (round trip) of Requirement 3, criterion 8, as one `fc.assert(fc.property(...))` in a `<module>.properties.test.ts` file, with the comment `// Property 2` above it and `_Requirements: 3.8_` in the describe title.
3. THE shared arbitraries in `packages/engine/src/testing/arbitraries.ts` SHALL be extended so that some generated Full_Citations carry `wrong_case` results, with `foundName` values that include the characters of Requirement 3, criterion 5, and so that generated Case_Names exist for Property 1, and so that generated names for Property 3 include unlisted dotted abbreviations (such as `Mgmt.` and `Props.`) and apostrophe contractions (such as `Dep't`, `Ass'n`, `Comm'r`, `Int'l`, `Nat'l` and `Gov't`).
4. THE property tests SHALL run with `numRuns` of at least 200 locally and 500 in CI (`FC_NUM_RUNS`), SHALL log the seed on failure, and SHALL assert a relationship between input and output.
5. THE tests SHALL include example tests for: every row of the table in the Introduction with the outcome of Requirement 12; the Avianca_Sample's six results; the render and parse round trip of `CIT ≠` with its found name; the three name pairs of Requirement 4, criterion 11; a name that matches only through `case_name_full` or `case_name_short`; the Statement counts and Status cell; the Issues row text and link (`href`, `target`, `rel`), including the link built from the `clusterId` when no `absoluteUrl` is at hand and the row after a reload; the Resolved_List (hidden before a Verify_Run, rows, no effect on the blocking count, the Export button, the Next_Step or the `No issues.` line); the Legend; the two Sentinel directions and the pre-spec filing of Requirement 9, criterion 8; the page mark title; the empty-page links; an In_Re_Name with commas (Requirement 1, criterion 4) read from text written for the test; the Tolerant_Read of `Alvarez v. Cascade Residential Mgmt., LLC` and `Okafor v. Lindqvist Props.` from the Demo_Motion, of a name that follows a sentence ending just before it, and of a name that the Tolerant_Read rejects; and the two `lookup_citations` outcomes of Requirement 5, criterion 12 and the `caseName` output of criterion 13, run through the MCP server.
6. THE tests SHALL include an example test that the body of the lookup request holds no case name, and one that a cached `verified` entry without Cluster_Data is a cache miss.
7. THE tests SHALL contain no snapshot of the Engine, no `try/catch` that hides an error, and no test that only imports a module.
8. WHEN a property fails, THE maintainer SHALL record the shrunk counterexample as a named example test and fix the code, and SHALL NOT weaken the property.
9. WHEN an existing test's expected outcome changes because a record now carries a `caseName`, THE task SHALL change that test and SHALL list it in the BUILD_LOG entry; every other existing test SHALL pass unedited.

### Requirement 14: Documentation

**User Story:** As a judge reading the repository, I want the docs to say what the new check does and why it exists, so that the product reads as one whole.

#### Acceptance Criteria

1. THE README.md SHALL gain one line under "It checks citations and quotations" that says a citation must also name the case it points to, and one line in the demo path that names the Avianca sample.
2. THE `docs/CERTIFICATION.md` statement paragraph SHALL be updated as in Requirement 8, criterion 9.
3. THE BUILD_LOG.md SHALL gain a dated entry that starts with the table of the Introduction as the reason for the spec, and that records the Requirement 13 criterion 9 test changes and any finding of the recording task.
4. THE `docs/KIRO_USAGE.md` SHALL gain a row for this spec, a row for its `.config.kiro` and `tasks.meta.json`, and a row for each steering file this feature edits (`product.md`, `citations.md`, `structure.md`), and `pnpm kiro:check` SHALL pass.
5. THE `structure.md` steering file SHALL gain the line `scripts/` under `packages/verifier/` naming `record-lookups.ts`, the one script that records live lookups as fixtures.
6. THE docs SHALL contain no exclamation mark and no marketing text.
7. THE README.md bullet under "What leaves your machine" that says Verify sends only citation records to the app's own server SHALL say that each record includes the case name written before the citation, SHALL keep the statement that only citation strings go to CourtListener, SHALL keep the heading verbatim, and SHALL keep every sentence that `apps/web/test/static/docs.test.ts` matches (`Verify sends only citation records to this app's own server` and `from there only citation strings go to CourtListener`).

### Requirement 15: Boundaries and out of scope

**User Story:** As a maintainer, I want the change kept to the rule, so that nothing else in the product moves.

#### Acceptance Criteria

1. THE feature SHALL NOT decide whether a decision supports the proposition it is cited for.
2. THE feature SHALL NOT add state-reporter or Westlaw verification beyond what the lookup already returns, and a Database_Citation SHALL stay `unchecked`.
3. THE feature SHALL NOT treat a year mismatch on its own as a failure.
4. THE feature SHALL NOT change the look beyond the new code `CIT ≠` and one Legend item, and SHALL NOT change the Toolbar.
5. THE new Engine code SHALL import nothing from `node:` or the DOM and SHALL add no runtime dependency; the new Verifier code SHALL take `fetch` as an injected dependency and SHALL NOT touch the network in tests.
6. THE new code SHALL use named exports, plain data types, `Result` values for errors in the Engine, `unknown` plus narrowing instead of `any`, functions under 40 lines and modules under 300 lines.
7. THE feature SHALL add no telemetry, and SHALL send no case name, draft text or Found_Name to CourtListener or to any other third-party service; the case name SHALL reach only the app's own verify route (criterion 10 of Requirement 5) and the Verifier in the same process.

### Requirement 16: Process and final checkpoint

**User Story:** As the author, I want the spec committed before any task runs and a full check at the end, so that I can walk the result before anything is pushed.

#### Acceptance Criteria

1. THE spec phases SHALL run in this order: requirements, design, tasks, the author's questions on the requirements having been answered and folded into this document.
2. THE spec files `requirements.md`, `design.md`, `tasks.md`, `.config.kiro` and `tasks.meta.json` (where present) SHALL be committed in one commit titled `spec(case-match): …` before any task runs, and SHALL NOT be pushed.
3. THE spec phases SHALL make no code change; every code change belongs to a task.
4. THE tasks SHALL group the work in this order: the Engine (Requirements 1 to 3), the Verifier and the MCP server (Requirements 4 and 5), the Pane, page and Issues_Region (Requirements 6 and 7), the Statement (Requirement 8), the Sentinel (Requirement 9), the Avianca sample, then the Recording_Script and its tests, then the recording, which is a stop-and-report gate (Requirements 10 and 11), the documentation (Requirement 14), and one final checkpoint.
5. THE final checkpoint task SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build `pnpm --filter @reveal-codes/web build`, and `pnpm kiro:check`, and SHALL state that the browser check and the push are left to the author.

### Requirement 17: The empty-page links take a pointer click

**User Story:** As a judge using a mouse, I want the two sample links on the empty page to respond to a click, so that I can load a sample without the keyboard.

#### Acceptance Criteria

1. WHILE the Document text is empty and the empty-page links are shown, THE Web_App SHALL make each link the target of the pointer at every point inside that link's own box, so that `document.elementFromPoint` at the centre of each link returns that link's `a` element and not the Editor's content element.
2. WHILE the Document text is empty, THE Web_App SHALL leave every point of the page outside the two link boxes as part of the Editor's content element, so that a click there places the caret.
3. WHEN the author presses a mouse button on a link, THE Web_App SHALL cancel the default action of the `mousedown` event, so that the keyboard focus and the selection stay where they were.
4. WHEN the author clicks a link, THE Web_App SHALL load the sample that the link names, through the same path as a keyboard activation.
5. WHEN the author activates a link from the keyboard, THE Web_App SHALL load the sample that the link names, as before this requirement.
6. THE Web_App SHALL render the link list after the Editor's content element in DOM order, outside that element, and THE stylesheet `apps/web/src/components/editor-surface.module.css` SHALL limit the pointer target of the list to the links themselves, without adding a `z-index` to any rule, so that the Modal overlay still covers the links.
7. THE Web_App tests SHALL contain a static test of the stylesheet rules of criterion 6, a structure test of the link list and its DOM position relative to the Editor's content element, and a test that a `mousedown` on each link is default-prevented and leaves `document.activeElement` unchanged.
8. THE BUILD_LOG entry for this requirement SHALL state what a test under jsdom can prove (the rules exist, the structure, the cancelled default) and what it cannot prove (paint order, hit testing and the browser's focus behaviour, because jsdom does no layout), SHALL record whether a real-browser check could be run with tooling already in the repository, and SHALL list the manual check for the author when it could not.
9. THE change SHALL add no colour literal, no Token, no icon, no transition and no outline, and the links SHALL keep the link colour of `ui.md`.

### Requirement 18: Page ranges and lists in a pincite

**User Story:** As a filer, I want a citation with a page range to be read as one citation from its volume to the end of its parenthetical, so that the code, the underline and the Issues row cover the whole citation.

#### Acceptance Criteria

1. WHEN a Reporter_Citation member, a Parallel_Citation member, an `Id. at` Short_Form or a party Short_Form (`<volume> <reporter> at`) is followed at the place of its pincite by a Pincite_Expression, THE Extractor SHALL read the whole Pincite_Expression.
2. WHEN a Database_Citation is followed by `, at *` and a range of pages, THE Extractor SHALL read the whole range, and SHALL read no comma-separated list there.
3. THE Extractor SHALL set `text` and the `[start, end)` range of a citation to cover the whole Pincite_Expression and, when a recognised parenthetical follows it, that parenthetical, as it does today for a single page.
4. THE Extractor SHALL set the `pincite` of the value to the First_Page, so that the value of a citation written with a Pincite_Expression equals the value of the same citation written with the First_Page alone.
5. THE Verifier SHALL derive the Citation_Line of a citation written with a Pincite_Expression identically to the Citation_Line of the same citation written with the First_Page alone, and the Reveal Codes payload of the two SHALL be identical.
6. IF a list item starts a Parallel_Citation member (`<volume> <reporter> <page>`) or a Database_Citation (`<year> WL <n>`, `<year> <court> LEXIS <n>`), THEN THE Extractor SHALL end the Pincite_Expression before the comma that precedes that item.
7. IF a hyphen or an en dash is not followed by one to five ASCII digits that end before a letter or a number, THEN THE Extractor SHALL end the Pincite_Expression before the dash.
8. THE Extractor SHALL read at most five items in one Pincite_Expression and at most 24 code units for it, and every match SHALL stay at most `MAX_MATCH` code units.
9. WHEN a Full_Citation is written with a Pincite_Expression that is not a single page, THE Extractor SHALL record `normalised` as the Canonical_Form of its value, as it does for any citation written other than in Canonical_Form.
10. THE Extractor SHALL return, for a text without a range or list in any pincite, the same citations as before this requirement, and every existing extraction property SHALL pass without being edited.
11. THE incremental rescan SHALL return exactly the match list of a full scan for texts that hold a Pincite_Expression.
12. WHEN the Extractor reads `Miller v. United Airlines, Inc., 174 F.3d 366, 371-72 (2d Cir. 1999)`, THE Extractor SHALL return one Full_Citation whose `text` is `174 F.3d 366, 371-72 (2d Cir. 1999)` and whose `value` holds pincite 371, and THE Pane SHALL render it as one code pair from `174 F.3d 366` to `1999)`.
13. WHEN the Extractor reads the Avianca_Sample, THE Extractor SHALL return the Miller citation with that text and the other five citations unchanged.
14. THE shared arbitraries SHALL generate Pincite_Expressions (single pages, ranges with a hyphen or an en dash with full and shortened second numbers, and lists) for Full_Citations and Short_Forms.
15. FOR ALL generated Full_Citations and Short_Forms written with a Pincite_Expression, THE Extractor SHALL return a citation whose `text` is the whole written citation (the Pincite_Expression and any parenthetical included) and whose `value` equals the value extracted from the same citation written with the First_Page alone, so that the Citation_Line and the Reveal Codes payload are the same (Property 19).
16. IF Reveal Codes written before this requirement (an autosaved draft or a Provenance_Appendix) close a citation code inside a Pincite_Expression, THEN THE Engine SHALL return `malformed_codes` with the rule `extractor_mismatch` from `parse`, as it does for any codes that disagree with the Extractor, and the BUILD_LOG entry SHALL record this consequence.
17. THE Engine SHALL change no existing field of `ExtractedCitation` and SHALL change no type of `CitationValue`.

### Requirement 19: Say what the mismatch is where the author decides

**User Story:** As a filer deciding whether to fix or override a wrong-case item, I want to see the name my filing gave next to the name the decision has, so that I can judge the mismatch without opening the Document.

#### Acceptance Criteria

1. WHEN the Issues_Region shows a row for a `wrong_case` Issue whose citation has a `caseName`, THE Web_App SHALL show under the citation text the two lines `Cited as <caseName>` and `This citation is <foundName> (<foundYear>)`, in that order, with `<foundYear>` and its parentheses left out when `foundYear` is absent.
2. WHEN the Export dialog shows a row for a `wrong_case` Issue whose citation has a `caseName`, THE Web_App SHALL show the same two lines and the CourtListener_Link in that row.
3. WHEN the Override dialog opens for a `wrong_case` Issue whose citation has a `caseName`, THE Web_App SHALL show the same two lines above the reason box.
4. THE Web_App SHALL read `caseName` from the citation record of the current Document, and SHALL NOT store it in the `wrong_case` result, in the autosaved value or in the Display_Info.
5. IF a `wrong_case` Issue's citation has no `caseName`, THEN THE Web_App SHALL omit the line `Cited as <caseName>` and SHALL show the line `This citation is <foundName> (<foundYear>)`.
6. THE Web_App SHALL write neither line with a trailing full stop, and SHALL write each name in full as it is stored, with no shortening.
7. THE Issues_Region, the Export dialog and the Override dialog SHALL build the two lines with one shared function, so that the three places cannot differ.
8. THE row text and dialog text of this requirement SHALL contain no exclamation mark, no icon and no emoji, and SHALL leave the buttons, the Overridden line and the severity words of Requirement 7 as they are.
9. THE change SHALL leave the Resolved_List, the Statement and the Provenance_Appendix as they are.

### Requirement 20: Role words do not count as shared words

**User Story:** As a maintainer of the name rule, I want words that name a party's role to be dropped, so that a long `case_name_full` that lists thirty parties with their roles cannot make a chance match.

#### Acceptance Criteria

1. THE Verifier SHALL add the fifteen Role_Words to its Dropped_Words, and SHALL change no other Dropped_Word and no entry of the Name_Expansion_Table.
2. THE Name_Match SHALL treat a Role_Word as any other Dropped_Word: it SHALL NOT count as a Normalised_Word of a cited party and SHALL NOT count as a found word.
3. WHEN every Normalised_Word that a cited party shares with the found words is a Role_Word, THE Name_Match SHALL return `false` for a cited party that has at least one other Normalised_Word.
4. THE copy of the Dropped_Words held as plain data in `packages/engine/src/testing/arb-case-match.ts` SHALL list the same words as the Verifier, and a Verifier test SHALL fail when the two lists differ.
5. THE generator of Property 1 SHALL keep its words and initialisms clear of the Role_Words, as it does for the other Dropped_Words (design D10), and Property 1 SHALL stay as written.
6. THE Verifier tests SHALL contain an example test in which an invented cited name, whose only words shared with the recorded `case_name_full` of `174 F.3d 366` are Role_Words, gives `wrong_case` against the recorded fixture.
7. THE outcomes of the worked-outcomes tables SHALL stay as they are: Henderson, Petersen and Miller give `wrong_case`, and Ashcroft v. Iqbal, Haines v. Kerner, the Zicherman citation to 516 U.S. 217 and Chambers v. NASCO give `verified`, and the task SHALL report any outcome that changes.

### Requirement 21: Process and final checkpoint for the follow-up

**User Story:** As the author, I want the follow-up grouped and checked at the end, so that I can walk the product again before anything is pushed.

#### Acceptance Criteria

1. THE spec phases of the follow-up SHALL make no code change and SHALL NOT commit.
2. THE follow-up tasks SHALL group the work in this order: the empty-page links (Requirement 17), the pincite (Requirement 18), the mismatch lines (Requirement 19), the role words (Requirement 20), the Sentinel examples of Requirement 9 criterion 8, the inventory test and the documentation, and one final checkpoint.
3. THE aggregate inventory test `apps/web/test/static/case-match-inventory.test.ts` SHALL require nineteen properties, numbered 1 to 19, with Property 19 in `packages/engine/test/case-match.properties.test.ts`.
4. THE follow-up SHALL change every existing test whose expected outcome changes because of Requirements 17 to 20, and the BUILD_LOG entry SHALL list each such test.
5. THE `citations.md` steering file SHALL state the Pincite_Expression rule and the Role_Words, and the BUILD_LOG entry SHALL state what the follow-up changed and why.
6. THE final checkpoint task SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build `pnpm --filter @reveal-codes/web build`, and `pnpm kiro:check`, and SHALL state that the browser check and the push are left to the author.

### Requirement 22: Reachability tests do not depend on a seed

**User Story:** As a maintainer, I want the test that every fault and tamper kind can be produced to give the same answer on every run, so that adding a kind cannot turn CI red by chance.

#### Acceptance Criteria

1. THE Engine tests SHALL show each Tamper_Kind reachable by drawing from an arbitrary that produces only that kind, over a Witness_Document, and SHALL NOT infer reachability from the kinds collected over a random run of `arbTamperDocument.chain(arbSemanticTamper)`.
2. THE Engine tests SHALL hold one Witness_Document for each Tamper_Kind in a table typed `Record<TamperKind, Document>`, so that `pnpm typecheck` fails when a Tamper_Kind has no witness, and a test SHALL fail when the keys of the table differ from `TAMPER_KINDS`.
3. FOR EACH Tamper_Kind, THE Reachability_Test SHALL assert that the per-kind arbitrary is defined for the Witness_Document, and FOR ALL values it draws, SHALL assert that `kind` equals that Tamper_Kind and that `parse` of `text` returns `{ kind: "malformed_codes", index, rule }` with the recorded `index` and `rule` (Property 41 of the provenance-engine design, per kind).
4. THE rejection property over `arbTamperDocument.chain(arbSemanticTamper)` SHALL stay random, SHALL keep its assertion that `parse` rejects with the recorded rule and index, and SHALL assert nothing about which kinds were drawn.
5. FOR EACH Syntax_Fault_Kind, THE Engine tests SHALL draw faults of that kind alone over generated Documents, and FOR ALL values SHALL assert that every injected fault has that kind and that `parse` rejects with the recorded `index` and `rule`.
6. THE Engine tests SHALL assert that faults drawn with at least two faults over a fixed Witness_Document hold at least two injected faults, in place of the counter `multi` of the random run.
7. THE Reachability_Test SHALL still cover every member of `TAMPER_KINDS` and `SYNTAX_FAULT_KINDS`, and the lists compared SHALL be the exported lists, so that a kind added later without a generator or a witness fails a test.
8. THE Engine tests SHALL NOT use a fixed seed as the only guard of a reachability claim; the seeded `fc.sample` reachability checks of the tamper arbitraries in `packages/engine/test/codes.properties.test.ts` and `packages/engine/test/arb-codes.test.ts` SHALL be replaced by the per-kind test.
9. THE change SHALL leave the weights of `arbTamperDocument`, the choice of `arbSemanticTamper` and the draws of `arbSyntaxFault` with its existing arguments unchanged in distribution, and every existing property SHALL pass unedited.
10. WHEN the task has changed no code, THE task SHALL draw 100,000 values of `arbTamperDocument.chain(arbSemanticTamper)` in a throwaway script, SHALL count each Tamper_Kind, and SHALL report the Rare_Kind, its count and its rate, the number of Tamper_Kinds in the tree (the author counted 22 in the failing run), and the probability that 1,500 independent draws miss the Rare_Kind.
11. THE task SHALL state in the BUILD_LOG that the figure of 1,500 is a fixed `numRuns` of the test and does not come from `FC_NUM_RUNS`, that the Syntax_Fault test used `max(runs().numRuns, 400)`, and which Tamper_Kind was the Rare_Kind and how rare it was.
12. THE throwaway script SHALL be deleted before the task ends and SHALL NOT be committed.
13. THE task SHALL search all packages, `apps/web` and `crew/sentinel` for other tests that collect kinds over random runs and compare them with a kind list; it SHALL convert every such test whose draw is not seeded, SHALL list every seeded one that it leaves, with its seed and the reason, and SHALL list the result in the BUILD_LOG.
14. IF the builder of a Tamper_Kind returns no arbitrary for every Witness_Document the task can construct, THEN THE task SHALL stop and report that kind, and SHALL NOT drop the kind from the list, lower the assertion or make the builder total without the author's decision.
15. THE test suite SHALL pass in three consecutive runs of `pnpm test`.

### Requirement 23: An unreadable saved draft is never silently replaced

**User Story:** As a filer whose saved draft cannot be read, I want the editor to keep the stored draft, say so, and let me save a copy or start over, so that autosave never overwrites my work without my choice.

#### Acceptance Criteria

1. WHEN the Web_App mounts at a width of at least `NARROW_WIDTH` and the Stored_Draft is an Unreadable_Draft, THE Web_App SHALL open the editor with the empty Document, SHALL leave the Stored_Draft unchanged, and SHALL set the Draft_Gate to blocked.
2. WHEN the Stored_Draft is absent, or the read of `localStorage` throws, THE Web_App SHALL leave the Draft_Gate open.
3. THE Web_App SHALL treat each of `not_json`, `bad_shape` and `bad_codes` as an Unreadable_Draft, so that the rule covers every unreadable autosave and not only the old pincite form.
4. WHILE the Draft_Gate is blocked, THE Autosave SHALL write nothing to `AUTOSAVE_KEY` on a scheduled save, on `flush`, on `visibilitychange` to hidden, on `pagehide`, on unmount and on the print flow.
5. WHILE the Draft_Gate is blocked, THE Web_App SHALL allow typing, undo, redo, Verify and DOCX export as when it is open.
6. WHILE the Draft_Gate is blocked, THE Issues_Region SHALL show the Draft_Notice, above the Verify result lines, with the notice text in one paragraph and the two buttons `Save a copy` and `Start a new document` in that order.
7. THE notice paragraph SHALL sit in a polite status region that holds the paragraph only, and the two buttons SHALL be `button` elements of type `button` outside that region, at the 24px height of an Issue row, with no icon.
8. THE Draft_Notice SHALL NOT change the blocking count, the Issues heading, the Export button, the Next_Step or the line `No issues.`.
9. WHEN the author activates the Save_Copy_Action, THE Web_App SHALL read the Stored_Draft from `localStorage` at that moment and pass it, encoded as UTF-8 and otherwise unchanged, to `AppServices.download` with the file name `reveal-codes-saved-draft.txt` and the media type `text/plain;charset=utf-8`.
10. WHEN the Save_Copy_Action has run, THE Web_App SHALL leave the Stored_Draft and the Draft_Gate as they were.
11. IF the Stored_Draft cannot be read at the moment of the Save_Copy_Action, or `AppServices.download` throws, THEN THE Web_App SHALL show the notice `The saved draft could not be copied. It is still stored in this browser.` and SHALL leave the Stored_Draft and the Draft_Gate as they were.
12. WHEN the author activates the Start_New_Action, THE Web_App SHALL open the existing confirm dialog with the title `Start a new document`, the message `Delete the saved draft that could not be read and start a new document? Anything on the page is discarded too.` and the confirm label `Delete and start new`.
13. WHEN the author confirms the Start_New_Action, THE Web_App SHALL remove the Stored_Draft, replace the Document with an empty one, set the Draft_Gate to open and resume autosave, so that the next change is saved after 300 ms.
14. WHEN the author cancels the Start_New_Action, THE Web_App SHALL change nothing.
15. IF the removal of the Stored_Draft throws, THEN THE Web_App SHALL keep the Draft_Gate blocked and SHALL show `Autosave failed. Your draft is kept in this tab only.`.
16. WHILE the Draft_Gate is blocked, THE Toolbar's New button SHALL open the same dialog as the Start_New_Action and SHALL have the same effect.
17. WHILE the Draft_Gate is blocked, THE Web_App SHALL load a sample (demo motion or Avianca citations) as it does when the Draft_Gate is open, and SHALL leave the Draft_Gate blocked and the Stored_Draft unchanged.
18. WHILE the Draft_Gate is blocked, WHEN the author activates Open print view, THE Web_App SHALL show the notice `Choose Save a copy or Start a new document before opening the print view.` and SHALL NOT open the print tab.
19. WHEN the Web_App mounts below `NARROW_WIDTH`, THE Web_App SHALL NOT read the Stored_Draft and SHALL NOT set the Draft_Gate.
20. THE Web_App SHALL NOT store the Draft_Gate in the Document, in the Store state, in the autosaved value or in any other stored value.
21. THE sentences of the Draft_Notice, the copy-failed notice and the print notice SHALL live in `apps/web/src/notices.ts`, and the button labels and the confirm copy SHALL live beside the components that show them, as the existing confirm copy does.
22. THE Draft_Notice, the confirm copy, the new notices and the button labels SHALL contain no exclamation mark, no icon and no emoji, and the stylesheet of the Draft_Notice SHALL add no colour literal and no Token.
23. FOR ALL stored strings that `deserialise` rejects with an error other than `absent` (text that is not JSON, JSON of the wrong shape or version, and a well-formed value whose codes do not parse), the sequence of a mount-time load, any number of edits of the Document, an advance of the clock by at least 300 ms, a flush, a hidden visibility change and an unmount SHALL leave the Stored_Draft equal to the string that was stored and SHALL make no call to `setItem` (Property 20).
24. THE README `Limits` list SHALL no longer say that an old draft is silently overwritten, and the BUILD_LOG SHALL keep its record of the old behaviour and add one entry for this change.
25. THE tests SHALL include example tests for: the Stored_Draft surviving a load, typing and a 300 ms wait; the Draft_Notice text and its buttons; the bytes of the Save_Copy_Action for an ASCII value, a non-ASCII value and the old pincite draft; the Start_New_Action (confirm, cancel, removal failure) clearing the Stored_Draft and resuming autosave; the Toolbar's New button while blocked; a sample load while blocked; the print notice; each of `not_json`, `bad_shape` and `bad_codes`; a mount below `NARROW_WIDTH`; and no effect on the blocking count, the Export button and the Next_Step.

### Requirement 24: Process and final checkpoint for the second follow-up

**User Story:** As the author, I want the work grouped and checked at the end, and the stability of the reachability test shown, so that I can check CI after the push.

#### Acceptance Criteria

1. THE spec phases of the second follow-up SHALL make no code change and SHALL NOT commit.
2. THE second follow-up tasks SHALL group the work in this order: the measurement before any change, the reachability tests (Requirement 22), the unreadable draft (Requirement 23), the aggregate inventory test and the documentation, and one final checkpoint.
3. THE aggregate inventory test `apps/web/test/static/case-match-inventory.test.ts` SHALL require twenty properties, numbered 1 to 20, with Property 20 in `apps/web/test/case-match.properties.test.ts`.
4. THE second follow-up SHALL change every existing test whose expected outcome changes because of Requirements 22 and 23, and the BUILD_LOG entry SHALL list each of them.
5. THE final checkpoint task SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test` three times in a row, `pnpm test:pbt`, the clean-checkout web build `pnpm --filter @reveal-codes/web build`, and `pnpm kiro:check`, SHALL report the result of each of the three `pnpm test` runs, and SHALL state that the push and the check of CI are left to the author.
6. THE task SHALL NOT push.
