---
name: check-citations
description: Check the legal citations and quotations in a file or in pasted text against CourtListener and report one table of results. Use when asked to check, verify or cite-check citations, cases or quotations in a brief, motion, filing or draft, or whether a case citation is real.
---

# Check citations

Check every case citation in a document, and every quotation attributed to a cited case, then report what was found. Report the record. Do not give legal opinions.

## Procedure

1. Call `verifier_status`. Tell the user which mode is in use, in the words of its `message` field.
   - In fixtures mode, say that the results come from a small recorded set and are not a live check. Say that "not found" then means only "not in the recorded set". Say that setting `COURTLISTENER_TOKEN` in the shell that starts Kiro switches to live checking.
   - If the mode is `live_without_token`, say that nothing can be checked until a token is set, and stop.
2. Read the file, or take the pasted text. Find each case citation, such as `410 U.S. 113` or `598 F.3d 1, 7 (2d Cir. 2010)`. Ignore statutes, rules and secondary sources.
3. Call `lookup_citations` with the text that contains the citations. Pass each sentence or paragraph as one string and keep the case name written before the citation, because the name comparison needs it. Send at most 50 strings of 2000 characters at a time, and send further batches for the rest.
4. For each quotation in quotation marks that the text attributes to a cited case, call `check_quote` with the `clusterId` from that citation's result (as a number) and the quotation exactly as written. If the citation has no `clusterId`, do not call it. Report that quotation as could not be checked.
5. Report one table, with one row per citation, in the order they appear:

   | Citation as written | Case it names | Result | CourtListener link |
   | ------------------- | ------------- | ------ | ------------------ |
   - Citation as written: the text exactly as it appears in the document.
   - Case it names: the case name written before the citation, or "none given".
   - Result, in plain words:
     - `verified`: "found".
     - `wrong_case`: "found, but it is a different case", then the name and year of the case it really is (`foundName`, `foundYear`).
     - `not_found`: "not found".
     - `ambiguous`: "could not be matched to one case", then the number of candidates.
     - `unchecked`, or any error: "could not be checked".
   - Link: `https://www.courtlistener.com/opinion/<clusterId>/x/` when the result has a `clusterId`, otherwise a dash.
   - For each quotation that was checked, add a line under the table: its first words, then "appears in the opinion" (`match`), "does not appear in the opinion" (`mismatch`, with how many leading characters did match) or "could not be checked".

6. Under the table, say how many citations were checked and how many failed. Count as failed every citation that is not "found", and every quotation that does not appear or could not be checked. For example: "12 citations checked. 3 failed: 1 not found, 1 different case, 1 could not be checked. 4 quotations checked. 1 does not appear."

## Rules

- Never propose a replacement citation, and never suggest what a citation "probably" meant.
- Never say that a case supports a point or does not support it. The checker shows whether a case exists and whether words appear in it. It does not show what the case means.
- Never mark a citation as fine when it could not be checked.
- Never claim that a document is free of errors. Say what was checked.
- Do not describe a result as legal advice, and do not give any.

The codes and statuses are in [references/statuses.md](references/statuses.md).
