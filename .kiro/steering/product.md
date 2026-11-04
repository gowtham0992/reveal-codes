---
inclusion: always
---

# Product: Reveal Codes

## Context

This is an entry in Kiroween 2026, Kiro's annual hackathon, submitted in the **Resurrection** category ("bring your favourite dead technology back to life"). The dead technology is WordPerfect's Reveal Codes. Submission deadline is December 4, 2026. The entry is judged on Potential Impact, Technological Implementation (depth of Kiro usage), Design, Innovation, and Presentation, equally weighted. Judges may evaluate from the video and write-up alone, or test the deployed app without an account. Every feature decision should survive the question: does this help a judge see a complete product and a real audience in under three minutes?

## What it is

A drafting editor for court filings that records the provenance of every character and verifies every legal citation before the document leaves the machine. The name and the interface pay off WordPerfect 5.1's Reveal Codes pane (Alt-F3), the feature lawyers lost when the profession moved to Word. The codes are back, but now they answer two questions no modern editor answers: *where did this sentence come from?* and *does this case exist and say this?*

## Who it is for, in priority order

1. **Self-represented (pro se) litigants.** Roughly half to 60% of the court decisions that have caught AI-fabricated citations involve people with no lawyer, drafting with ChatGPT because they cannot afford counsel. Courts have held that pro se status is no shield from Rule 11 sanctions. These users have no access to commercial citation checkers. The product must work for them: paste text, no account, no cost, plain language.
2. **Legal-aid clinics and law-school clinics** supervising those filers.
3. **Solo litigators and small-firm paralegals** who draft with AI and sign the filing personally.

Not for: large firms with enterprise tooling, legal research, or anyone looking for legal advice. The product never tells a user what the law is; it tells them whether what they wrote can be traced and checked.

Not for: large firms with enterprise tooling, legal research, or anyone looking for legal advice.

## The problem, with numbers

Courts have sanctioned lawyers in several hundred decisions for filings that cited cases that do not exist or quoted language that is not in the opinion; the large majority of those decisions are from 2025 onward and the rate is rising. Many federal judges now have standing orders requiring disclosure of generative-AI use in filings. Existing tools check citations after the fact in a separate step. None record provenance at the point of writing.

## Product principles (binding on every feature)

0. **Paste is the front door.** Most users draft elsewhere. The first-run experience is: paste, see codes, verify, export. The in-app assistant is a second path, not a prerequisite.
1. **Provenance is captured, never inferred.** We record how text entered the document (typed, pasted, AI-inserted, AI-then-edited). We never run an "AI detector." If we cannot know, the code is PST.
2. **Verification is deterministic and reproducible.** Same text plus same CourtListener data gives the same codes. No LLM decides whether a citation is real.
3. **Nothing leaves the machine silently.** Citation strings go to CourtListener. Draft text goes to the LLM provider only when the author uses the assistant, and the UI says so. There is no telemetry.
4. **Red codes block export.** Only `CIT ✓` and `QUO ✓` pass. A filing with any `CIT ✘`, `CIT ?`, `CIT …`, `QUO ✘`, or `QUO …` code cannot export unless the author writes an override reason for each one. Overrides are printed in the certification. The product never hides a problem to be convenient.
5. **One keystroke to the truth.** Alt-F3 always toggles the Reveal Codes pane. The pane is a faithful serialization of the document's provenance; it is not a summary.
6. **Quotes are checked, not just citations.** A real case with an invented quotation is the failure mode that existence checkers miss. `QUO ✘` is a headline result, shown with where the quote diverges from the opinion.
7. **Respect the period.** The pane looks like 1989 (blue field, grey text, bracketed codes, monospace). The editor above it looks like 2026. The contrast is the point. Spooky theming is not; this is not a Costume entry.

## Vocabulary

Use these words consistently in code, specs, UI, and docs:

- **span**: a contiguous run of characters sharing one provenance record.
- **provenance code** (or just **code**): a bracketed token rendered in the pane, drawn only from the code list below.
- **origin**: one of `HUM`, `PST`, `AI`, `AI>HUM`.
- **citation**: a reference to a judicial opinion in a recognised reporter form, e.g. `410 U.S. 113`, `598 F.3d 1, 7 (2d Cir. 2010)`, `2024 WL 123456`.
- **cluster**: CourtListener's identifier for one opinion across reporters.
- **verification status**: `verified`, `not_found`, `ambiguous`, `unchecked`.
- **quote check**: whether text inside quotation marks attributed to a citation appears verbatim (whitespace-normalised) in the opinion.
- **certification**: the exported statement of AI use, verification results, and overrides.

### Codes (binding)

These are the only codes. No feature may add, rename, or restyle one without changing this list first.

Provenance codes, one at the start of every span:

- `[HUM]`: typed by the author.
- `[PST]`: entered from outside the editor (pasted or imported). This is also the code for text whose origin we cannot know.
- `[AI:<run>]`: inserted by the assistant in run `<run>`.
- `[AI>HUM:<run>]`: inserted by the assistant in run `<run>`, then substantially edited by the author.

Citation codes, opening at the start of a citation and closed by `[/CIT]`:

- `[CIT ✓]`: verified; CourtListener resolved it to exactly one cluster.
- `[CIT ✘]`: not found.
- `[CIT ?]`: ambiguous; more than one candidate cluster. Shows the candidate count.
- `[CIT …]`: unchecked; not yet verified, could not be verified, or a short form (such as `Id.`) with no preceding citation to refer to.

Quote codes, opening at the start of quoted text attributed to a citation and closed by `[/QUO]`:

- `[QUO ✓]`: the quote appears verbatim (whitespace-normalised) in the opinion.
- `[QUO ✘]`: the quote does not appear; the pane shows where it diverges.
- `[QUO …]`: unchecked.

Reference codes, opening at the start of a statute, regulation, or secondary-source reference and closed by `[/REF]`:

- `[REF]`: recognised as a non-case reference. Never verified, never blocks export, carries no verification payload, and is rendered grey in the pane.

Structural codes:

- `[/CIT]`, `[/QUO]`, `[/REF]`: close the most recent citation, quote, or reference code.
- `[OVR]`: the author's written override reason for the red code it follows. Shows the reason.
- `[DOC]`: document header carrying engine state. Present only in the full serialisation, never in the pane.

`CIT ✓` and `QUO ✓` are the only codes that pass export (principle 4). The pane shows the display form: the codes above with no payload except the run id, the `[CIT ?]` candidate count, and the `[OVR]` reason. The full form, used for round-tripping, carries every payload.

## Success for the hackathon demo

A judge pastes an AI-drafted motion with three fabricated citations and one fabricated quote, presses Alt-F3, sees the red codes within ten seconds, tries to export, is blocked, writes an override for one and fixes the others, and exports a DOCX whose certification lists the one override. Under ninety seconds, end to end, with no account required.
