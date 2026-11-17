# Federal court instruments on generative AI in filings

`standing-orders.json` is a compiled dataset of United States federal court standing orders, local rules, general orders and published guidance on the use of generative artificial intelligence in court filings, as they stood on 2026-11-15. Reveal Codes uses it to shape the AI-Use and Verification Statement to the court the filing is going to. It is published here so anyone else can use it too.

## What is in it

41 entries across 27 courts: 19 that require a disclosure or certificate when generative AI was used, 7 that require a statement in every filing, 2 that prohibit AI drafting, 8 that require verification without disclosure, and 5 advisory texts. Five entries are no longer in force and are kept for their history (Judge Starr's 2023 certification, superseded by N.D. Tex. Local Civil Rule 7.2(f); the Fifth Circuit's proposed rule, declined in 2024; two orders of judges who have left the bench; one withdrawn disclosure requirement).

Each entry records the court, the judge where the instrument is judge-specific, the instrument and its title, the date and how that date was established, what kind of requirement it is, whom it applies to, the elements a compliant statement must contain, any required caption, one key sentence quoted from the instrument, the source URL, when it was retrieved, and its status. The `vocabulary` object at the top of the file defines every enumerated value.

## How it was compiled

Every entry comes from the court's own published text: the order or rule PDF on the court's `uscourts.gov` site, or the court's own web page. Trackers published by Ropes & Gray, Duke Law's RAILS project, a Harvard student's GitHub tracker, Bloomberg Law, Law360 and Sidley Austin were used only to find instruments; nothing was copied from them, and an instrument whose primary text could not be read was left out. Three entries note that `key_language` is a close paraphrase rather than a verbatim sentence, because the signed order is a scanned image. One source (Judge Cole's order) is a mirror of a court PDF that the court removed after the judge retired.

Dates are the instrument's own date where it has one. Where a posted document is undated, `date_note` says which date was used and why.

## What is not in it

Instruments whose primary text has not been read: about forty further judge-level orders are listed by the trackers above, most in C.D. Cal., N.D. Cal., S.D.N.Y., M.D. Pa. and D. Colo. Case-specific pretrial orders (E.D. Va., D. Ariz.) are out of scope. State courts are out of scope. The Tenth Circuit's proposed Rule 46.5(B)(4) (September 2026) is pending and could not be confirmed from the court's site.

## Adding an entry

Read the instrument on the court's site. Copy an existing entry, fill every field, quote one sentence verbatim (US government works are in the public domain), and set `source_kind` to `primary`. The export package's tests validate the file: unique ids, known vocabulary values, resolvable `supersedes` references, ISO dates and `https` URLs.

## Licence

Facts are not copyrightable and the quoted text consists of works of the United States Government. The compilation, selection and field design are released under CC0 1.0. Please check the source URL before relying on an entry; courts revise these instruments often.
