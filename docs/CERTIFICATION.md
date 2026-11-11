# Export and certification

## What an export contains

Export is always available. The dialog lists every blocking item, and Download .docx and Open print view stay disabled until each red code is fixed or overridden. The .docx has three parts: the filing, the certification statement, and an appendix. The print view at `/print` shows the same three parts, each on its own page.

The statement starts on a new page under the title "AI-Use and Verification Statement". Its six paragraphs print in this order:

1. Names the drafting tool, Reveal Codes, and says it records the origin of every character.
2. States whether generative AI was used. If so, it lists the tools, the share of characters the tool inserted, and how many of those the author later edited. If not, it says none was used.
3. Reports the citation check against CourtListener with the date of the last Verify, and counts how many citations resolved, were not found, were ambiguous or were unchecked. A table lists each citation with its status.
4. Reports the quotation check against the cited opinions, with counts of matched, mismatched and unchecked quotations and a table of each one.
5. Lists the overrides. Each red code the author overrode is printed with its code, its text, the written override reason and the time it was written. This paragraph appears only when there are overrides.
6. Says the author has read the filing in full and takes responsibility for it, followed by a signature line and the date. The date is the local date on your machine when you export or print.

The appendix starts on its own page under the title "Provenance Appendix". It holds the full Reveal Codes record of the filing in monospace, one line per line of the record, so the filing and its provenance can be re-read exactly.

Two cases change the wording. When a court or judge is selected, the statement opens with a sentence citing that instrument and its source, and the later paragraphs are renumbered. When the filing has no citations, the citation paragraph reads "This filing contains no legal citations." and its table is omitted; the same holds for quotations.

## Court-specific certification

Some federal courts and judges ask for their own AI statement. The Export dialog has a Picker labelled "Court or judge", above the Issues list. Choose a court or judge and the dialog shows a one-line summary of the instrument, its key language and a link to the source. The choice is saved in your browser, and the print view uses it too. The default is no selection, which gives the standard statement. Reveal Codes states what the order says; it does not tell you what the law requires, so read the source before you file.

Three examples:

- N.D. Tex., Local Civil Rule 7.2(f): a brief prepared with generative AI must say so on its first page under the heading "Use of Generative Artificial Intelligence". The DOCX and the print view put that heading on the first page of the filing.
- E.D. Tex., Judge Love: every filing carries a "Certificate of Generative Artificial Intelligence Usage". The statement takes that title, and the Sentinel recognises it when it reads the file back.
- S.D. Ohio, Judge Newman: the standing order bars the use of AI in preparing any filing. The dialog shows this as a notice with no override, because it is not a red code. It does not count toward the "Export (n blocking)" label. The notice states the prohibition once, in a single line that counts the AI-origin passages left in the filing and quotes the first, for example "1 AI-origin passage remains: paragraph 2, beginning "…"." The key language of the order appears once, in the summary.

Where an order asks how AI was used, the statement says where. It lists the passages the program drafted: each is a paragraph number plus the first words of the passage, up to five, then a count of any more. Paragraphs are counted from the first line of the caption, skipping blank lines.

If the only AI text was drafted by the demo assistant with no provider configured, the statement does not name a model. It says the text came from a recorded demonstration response and that no model was called.

The orders come from `data/standing-orders.json`. See [data/README.md](data/README.md) for its fields and sources. The dataset is released under CC0.
