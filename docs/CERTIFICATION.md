# Export and certification

## What an export contains

Export is always available. The dialog lists every blocking item, and Download .docx and Open print view stay disabled until each red code is fixed or overridden. The .docx has three parts: the filing, the certification statement, and an appendix. The print view at `/print` shows the same three parts, each on its own page.

The statement starts on a new page under the title "AI-Use and Verification Statement". Its six paragraphs print in this order:

1. Names the drafting tool, Reveal Codes, and says it records the origin of every character.
2. States what the record shows about generative AI and, where the record cannot show it, what the author states. See "Paragraph 2 by case" below. The tool never asserts on its own that no AI was used.
3. Reports the citation check against CourtListener with the date of the last Verify, and counts five outcomes in one sentence: how many citations "resolved to a single reported decision", how many "resolved to a different case than the one named", how many "could not be found", how many "matched more than one decision", and how many "were not checked". A table lists each citation with its status. For a citation that resolved to a different case, the Status cell shows the code `CIT ≠` followed by the name and year of the case CourtListener found, for example `CIT ≠ (Other v. Case, 1999)`.
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

## Two kinds of sentence

Every sentence of the statement is one of two kinds, and no sentence mixes them.

- **Record_Sentence**: states a figure or fact computed from the filing's spans and run log. It does not begin "The author states that". Example: "The record shows that the editor's assistant was not used."
- **Author_Sentence**: begins "The author states that" and reports what the author declared. It exists only for what the record cannot show. One sentence, the program sentence under a court order that asks for the tool name, begins "The generative artificial intelligence program used was" and ends "as named by the author".

The text of a filing that was pasted or imported carries the code `PST`. `PST` means the tool does not know where the text came from. The statement therefore reports how many characters were pasted or imported, and leaves the origin of that text to the author's declaration.

## Paragraph by paragraph

| Paragraph                                               | Content                                                                                                                                                                              | Kind                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Court sentence (only when a court or judge is selected) | Cites the instrument and its source.                                                                                                                                                 | Record_Sentence                                                                                                                           |
| 1                                                       | "This filing was prepared with the drafting tool Reveal Codes, which records the origin of every character."                                                                         | Record_Sentence                                                                                                                           |
| 2                                                       | Origin figures, the author's declaration, and the court's elements. See below.                                                                                                       | Record_Sentences, then Author_Sentences                                                                                                   |
| 3                                                       | Citation check against CourtListener, its date, five counts, and a table.                                                                                                            | Record_Sentences                                                                                                                          |
| 4                                                       | Quotation check against the cited opinions, three counts, and a table.                                                                                                               | Record_Sentences                                                                                                                          |
| Overrides (only when there are overrides)               | "The author chose to file despite the following unresolved items, for the reasons stated:" followed by a table of each override. The reasons are the author's own text in the table. | Record_Sentence, with a table of the author's written reasons                                                                             |
| Last                                                    | "The author has read the filing in full and takes responsibility for its contents." followed by the signature line and the date.                                                     | Fixed responsibility sentence, adopted by the author's signature. It does not begin "The author states that" and makes no claim about AI. |

Paragraph 2 is built in this order: Record_Sentences, then the declaration sentence, then the order sentences.

## Paragraph 2 by case

`<T>` is the total number of characters. `<H>` is the number typed in the editor, `<P>` the number pasted or imported, `<A>` the number inserted by the assistant (`AI` plus `AI>HUM`), and `<E>` the number inserted by the assistant and later edited by the author (`AI>HUM`). Each share is a percentage with one decimal. `<subject>` is "the pasted text" or "this filing".

**Assistant text present.** Record_Sentences:

> Generative artificial intelligence was used in preparing this filing. Tools: `<tools>`. Text inserted by the tool accounts for `<A>` of `<T>` characters (`<share>`%); of that, `<E>` characters were subsequently edited by the author.

When pasted or imported text is also present, one more Record_Sentence follows:

> `<P>` of `<T>` characters (`<share>`%) were pasted or imported; the tool did not record their origin.

**Typed text only.** The filing holds no assistant text and no pasted or imported text. Record_Sentence:

> The record shows that every character was typed in the editor and that the editor's assistant was not used.

**Pasted or imported text, no assistant text.** Record_Sentence:

> The record shows that the editor's assistant was not used. Of the `<T>` characters of this filing, `<H>` (`<share>`%) were typed in the editor and `<P>` (`<share>`%) were pasted or imported; the tool did not record the origin of the pasted or imported text.

A paste that holds only whitespace prints these counts and no Author_Sentence.

**The declaration sentence** follows the Record_Sentences. It is an Author_Sentence and appears only when a declaration applies (see the next section).

- First choice: "The author states that no generative AI was used to prepare `<subject>`."
- Second choice, subject the pasted text: "The author states that generative AI was used to prepare some or all of the pasted text, and names the tool as `<tools>`. The tool did not record which pasted passages."
- Second choice, subject this filing: "The author states that generative AI was used to prepare some or all of this filing, and names the tool as `<tools>`. The tool did not record which passages."

The tool name is printed as the author entered it after trimming, with no parentheses or quotation marks added around it. "ChatGPT (GPT-4o)" prints unchanged. The first-choice sentence is the only sentence in the statement that says no AI was used, and it appears once.

## The declaration

The declaration is the author's answer to one two-way question in the Export dialog. There is no default and nothing is derived from the text.

The two choices are:

- "No generative AI was used to prepare `<subject>`."
- "Generative AI was used to prepare some or all of `<subject>`." The second choice asks for the name of the tool or tools, 2 to 100 characters after trimming, with no line break or control character.

Until the author answers, the dialog shows no statement and keeps Download .docx and Open print view disabled. The print view shows one line that sends the author back to the Export dialog, and it has no declaration control.

### Two subjects

The subject depends on the filing and on the selected court, checked in this order.

1. `pasted_text`: the filing holds pasted or imported text with at least one non-whitespace character.
2. `this_filing`: the filing holds no assistant text, and the selected court requires a statement in every filing or a negative certification. The tool cannot know that typed text was not copied from a chatbot by hand, so the author says.
3. None: no question is asked. With no court selected, a typed-only filing prints the record sentence and asks nothing.

A declaration made for one subject never answers the other. The declaration is kept on your machine with the draft. It is not sent to the assistant provider, to CourtListener or to any other host.

### The clearing rule

- A paste, or an undo or redo that restores pasted characters, returns the declaration to unanswered.
- Loading a sample or a file returns it to unanswered. Starting a new document discards it.
- Deleting part of the pasted text, or editing inside it without adding pasted characters, keeps it.
- When no non-whitespace pasted text remains, a `pasted_text` declaration is dropped and prints nothing.
- A `this_filing` declaration is kept but not applied when the selected court stops requiring a statement. It applies again if the court requires one again before any edit clears it.
- A draft saved before this feature that holds pasted text starts unanswered. A stored declaration that cannot be read is treated as unanswered, and the draft loads unchanged.

## The single definition of AI use

One function, `usedAi`, answers "did this filing use AI?". It is true when the filing holds assistant text or the applicable declaration is the second choice, under either subject. The first-page heading, the gate, the prohibition notice, the confidentiality checkbox, the `aiUsed` field of the statement and every order sentence use it. No other code reads span origins to decide this.

## Order sentences

When a court or judge is selected, sentences for the elements the court asks for follow the declaration sentence. They are the same for every kind of order, for the same AI use, subject and element list.

| Element                | When AI was used                                                                                                                                                                                                                                                                                                                                                                                                                                             | Kind                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Tool name              | With assistant text: "The generative artificial intelligence program used was `<recorded tools>`." (or "is not recorded"). With assistant text and a declared tool: "The generative artificial intelligence program used `<was recorded tools / is not recorded>`; the author names `<tools>` for the pasted text." With a declared tool and no assistant text: "The generative artificial intelligence program used was `<tools>`, as named by the author." | Record_Sentence, or Author_Sentence for the last two |
| Portions               | With assistant text, the passages are listed. With a declaration: "The author states that generative AI was used to prepare some or all of `<subject>`; the tool did not record which passages."                                                                                                                                                                                                                                                             | Record_Sentence, Author_Sentence                     |
| How used               | With assistant runs, the run count. With a declaration: "The tool did not record how generative AI was used to prepare `<subject>`."                                                                                                                                                                                                                                                                                                                         | Record_Sentence                                      |
| Prompt records         | With assistant runs, the run count. With a declaration: "The tool holds no prompt records for `<subject>`."                                                                                                                                                                                                                                                                                                                                                  | Record_Sentence                                      |
| Confidentiality        | Printed only when the author ticks the checkbox: "The author certifies that no confidential or business proprietary information was entered into the program."                                                                                                                                                                                                                                                                                               | Author_Sentence                                      |
| Negative certification | Adds no sentence of its own. The declaration sentence is the only no-AI statement.                                                                                                                                                                                                                                                                                                                                                                           | not applicable                                       |

When the filing did not use AI, the tool name element prints nothing: paragraph 2 already says the editor's assistant was not used, and the declaration sentence is the only author no-AI statement.

The N.D. Tex. first-page heading appears when AI was used, including when the author declares it for pasted text. Its wording is unchanged.

## Prohibition reasons

When the selected order prohibits AI, export is refused, with no override, exactly when `usedAi` is true. There are two reasons, and the notice shows its line before any declaration control.

- The filing holds assistant text. The refusal is immediate and does not wait for the declaration. The line is the court's prohibition line, with this sentence added when the author also declared AI use: "The author also declared that generative AI was used to prepare `<subject>`."
- The filing holds no assistant text and the author declared AI use. The line reads "`<court>` prohibits AI-drafted text. The author declared that generative AI was used to prepare `<subject>`."

Changing the declaration to the first choice stops the refusal when no assistant text remains.

## The record carries the declaration

The Appendix carries the applicable declaration as an optional `d` field of the `[DOC]` header, so the author's answer, its subject and the tool name can be read back from an exported file. The display form shown in the pane never carries it. The Sentinel reads it and reports no drift because of it. A file exported before this feature has no declaration and reads without a finding.
