---
name: add-standing-order
description: Add or update one court standing order on generative AI in data/standing-orders.json from the court's own text. Use when asked to add a standing order, add a court's AI rule, or update the orders dataset.
---

# Add a standing order

Add or update one entry in `data/standing-orders.json`. Work as a careful person would: read the court's own text, copy nothing from a tracker, and change only what the instrument supports.

## Procedure

1. Read the instrument on the court's own site (a `uscourts.gov` host). Fetch the PDF or page and read the full text, not a summary. If you cannot read it, stop and add nothing.
2. Read the `vocabulary` object at the top of `data/standing-orders.json`. Choose each value below only from it.
   - `kind`: what the instrument requires.
     - A statement required whether or not AI was used: `certification_every_filing`, not `disclosure_when_used`.
     - A disclosure only when AI was used: `disclosure_when_used`.
     - AI may not be used to prepare filings: `prohibition`.
     - Verification and responsibility, with no disclosure: `verification_only`.
     - Advisory text with no new duty: `guidance`.
   - `applies_to`: whom the wording covers. `all` unless the text names counsel only (`attorneys`) or self-represented parties only (`pro_se`).
   - `elements`: one value for each thing a compliant statement must contain, as the text states it. Do not add an element the text does not require.
   - `caption.placement`: where the statement goes. A required heading on the first page is `first_page_heading`; a titled statement or certificate is `statement_title`; a separate filing is `separate_declaration`. Set a caption only when the instrument itself prescribes a heading or names the statement as a title, and put that heading or title in `caption.text`. A word the order merely uses for the statement (for example "certification") is not a caption: every caption text becomes a statement title that the Sentinel splits filings on. If the instrument prescribes no heading or title, `caption` is `null`, and `notes` says "The order does not prescribe a heading."
   - `status`: `current` if posted and in force, `superseded` if a later instrument replaced it, `rescinded` if withdrawn, `inactive` if the judge has left the court, `not_adopted` or `proposed` for rules that were declined or are pending.
3. Quote one sentence from the instrument in `key_language`, verbatim, 400 characters at most. If the PDF is a scanned image and you cannot copy the text exactly, make `key_language` a close paraphrase and say so in `notes`.
4. Use the instrument's own date in `date`. If the posted document has no date, use the best date available and explain which and why in `date_note`.
5. Build the `id` in the existing style: lowercase, hyphen-separated court or judge slug, then the instrument or year (for example `ndtex-lr-7-2-f`, `edtex-love-2025`, `sdohio-newman`). Check that it is unique in the file.
6. Fill every other field as the existing entries do: `court`, `judge`, `instrument`, `title`, `source_url`, `source_kind` (`primary`), `retrieved` (today's date), `notes`.
7. If the new entry replaces an older one, set `supersedes` on the new entry and `superseded_by` on the old one, and set the old entry's `status` to `superseded`. Change nothing else on the old entry.
8. Show the new entry and the quoted sentence with the page it came from. Then save.
9. Update the counts in `data/README.md`: the total entries, the number of courts, the per-kind counts, the number of entries whose status is not `current`, and the sentence about entries no longer in force (it must list each of them). Update the same counts in `README.md` wherever it states them.
10. Run the orders tests: `pnpm vitest run --project export orders`. Report the result. If they fail, fix the entry, not the test. The exception: a test that asserts the total number of entries (`packages/export/test/orders.test.ts`) is updated to the new total.

## Out of scope

- State courts.
- Case-specific pretrial orders.
- Instruments whose primary text you did not read.
