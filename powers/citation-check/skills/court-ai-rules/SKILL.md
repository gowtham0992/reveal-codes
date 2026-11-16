---
name: court-ai-rules
description: Look up what a federal court or judge requires about generative AI in court filings, from a dataset of published standing orders, local rules and general orders. Use when asked what a court or judge requires, allows or prohibits about AI in filings, or whether a court has an AI disclosure rule.
---

# Court AI rules

Answer what a federal court or judge requires about generative AI in filings, using only the dataset in [references/standing-orders.json](references/standing-orders.json).

## Procedure

1. Read `references/standing-orders.json`. Its `entries` array holds one instrument each. Each entry has `court` (with `name` and `abbreviation`), `judge` (a name or null), `instrument`, `title`, `date`, `kind`, `applies_to`, `key_language`, `source_url`, `status` and `notes`. The `vocabulary` object at the top defines every `kind` and `status` value.
2. Find the entries for the court or judge asked about. Match on `court.name` or `court.abbreviation`, and on `judge` when a judge is named. A court can have a court-wide rule and judge-level orders. Report all that apply.
3. For each entry, answer with:
   - the kind of rule, in the words of `vocabulary.kind` for that entry's `kind`;
   - the sentence quoted in `key_language`, in quotation marks;
   - the effective date (`date`), and the `date_note` when it says how the date was set;
   - whether it is current: `status` is `current`, or it is not in force (`superseded`, `rescinded`, `inactive`, `not_adopted` or `proposed`), with the meaning from `vocabulary.status`;
   - the source URL (`source_url`).
4. If an entry's `notes` says the quoted sentence is a close paraphrase, say so.

## Rules

- Answer only from the file. Do not add rules from memory, from other sources or from the web.
- If the court or judge is not in the file, say so. Then say how much the file covers, using the real figures: the number of entries, the number of distinct `court.name` values, and the `compiled` date. For example: "The file covers 27 courts and 41 instruments, as of 2026-11-08." Read those figures from the file each time. Do not guess what an unlisted court requires, and do not say it has no rule.
- Say the date the file was compiled, because courts change these instruments often. Tell the user to check the source URL before relying on an entry.
- Never describe the answer as legal advice, and do not tell the user what they must do. Report what the instrument says.
