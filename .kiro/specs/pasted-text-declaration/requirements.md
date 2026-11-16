# Requirements Document

## Introduction

The AI-Use and Verification Statement must say only what the provenance record shows. Where the record cannot know, the author must say, and the statement must attribute that to the author.

The observation that prompted this spec: a filing made only of pasted text exports with the sentence "No generative artificial intelligence was used in preparing this filing." Pasted and imported text carries the code `PST`, and `PST` means the tool does not know where the text came from (product.md, principle 1: "If we cannot know, the code is PST."). Today `usedAi(document)` counts only spans with origin `AI` or `AI>HUM`, so a document that is one `PST` span prints a claim the tool has no basis for. That is the path of a person who drafted in ChatGPT and pasted the result, which is the user the product exists for.

A second case has the same root. A court order that requires a statement in every filing, or that treats silence as a no-AI certification, needs the author to say that no AI was used, because the tool cannot know that typed text was not copied from a chatbot by hand.

This spec makes two changes.

1. The statement has two kinds of sentence and never mixes them. A record sentence states what was recorded: how many characters were typed in the editor, how many were pasted or imported, how many the assistant wrote and how many of those were later edited, each with its share of the whole. An author sentence begins "The author states that" and exists only for what the record cannot show. The sentence "No generative artificial intelligence was used in preparing this filing." is no longer asserted by the tool.
2. In two cases the Export dialog requires one two-way choice before the statement is shown or anything can be downloaded or printed: the author declares whether generative AI was used. The two cases differ only in the subject of the declaration. When the Document holds pasted text with at least one non-whitespace character, the subject is "the pasted text". When the Document holds no such pasted text, holds no assistant text, and the selected court order requires a certification either way or a negative certification, the subject is "this filing". The declaration is printed as an author sentence, is kept with the record, and counts as AI use for every court rule that asks about AI. With no court order selected, a typed-only filing prints the record sentence and asks nothing.

The feature changes `packages/export` (statement data, wording, gate, prohibition notice, first-page heading), `apps/web` (Export dialog, Print view, persistence, Legend text, samples), and the Reveal Codes form of the Appendix (so the declaration survives export and can be read back). It does not change the Verifier, the verification statuses, or the Provenance codes of product.md.

Product principles that bind this spec: principle 1 (provenance is captured, never inferred; this spec adds the rule for what the statement may assert), principle 2 (same Document, same order and same declaration give the same statement), principle 3 (the declaration stays on the machine), and principle 4 (the declaration gate blocks export like a red code, and the prohibition refusal has no override).

Out of scope: detecting AI text; per-passage declarations; any change to verification; asking about typed text when no court order requires a statement.

Interpretation notes, so that the criteria below are testable:

- The Engine counts characters in UTF-16 code units. "Share" is the existing one-decimal percentage of the total, rounded half up in integer arithmetic, and "0.0" for a total of 0.
- `<T>` is the total character count of the Document. `<H>`, `<P>`, `<A>` and `<E>` are the character counts of origins `HUM`, `PST`, `AI` plus `AI>HUM`, and `AI>HUM` alone.
- Wording given in double quotation marks is exact, including punctuation. Angle-bracket fields are replaced by values; no other text changes.
- `<subject>` in a wording is the Subject_Phrase of the Declaration_Subject: "the pasted text" or "this filing".
- The existing reading order of the statement paragraphs, tables, and signature block is unchanged.

## Glossary

- **Statement**: the plain-data value returned by `buildStatement`, as defined by the export-certification and court-orders specs. **Statement_Text** is the output of `renderStatement`.
- **Record_Sentence**: a sentence of the Statement_Text that states a figure or fact computed from the Document's spans and run log. It does not begin "The author states that".
- **Author_Sentence**: a sentence of the Statement_Text that begins "The author states that" and reports the author's declaration or the author's naming of tools.
- **Pasted_Text**: the characters covered by spans of origin `PST`. The Document **holds Pasted_Text** when `<P>` is greater than 0.
- **Substantive_Pasted_Text**: Pasted_Text that includes at least one character that is not whitespace. The Document **holds Substantive_Pasted_Text** when at least one `PST` character is not whitespace (Unicode White_Space).
- **Assistant_Text**: the characters covered by spans of origin `AI` or `AI>HUM`. The Document **holds Assistant_Text** when at least one span has one of those origins.
- **Order_Requires_Statement**: the condition that the selected Order_Entry has kind `certification_every_filing` or includes the element `negative_certification_when_unused`. It is false when no Order_Entry is selected.
- **Declaration_Subject**: determined by the Document and the selected Order_Entry, in this order: `pasted_text` when the Document holds Substantive_Pasted_Text; otherwise `this_filing` when the Document holds no Assistant_Text and Order_Requires_Statement holds; otherwise `none`. **Subject_Phrase** is "the pasted text" for `pasted_text` and "this filing" for `this_filing`.
- **Declaration**: the author's recorded answer, carrying the Declaration_Subject it was made for. It is one of three states: **Pending** (no choice made), **None** (the first choice), or **Declared_AI** (the second choice, with a Tool_Name).
- **Applicable_Declaration**: the stored Declaration when its subject equals the current Declaration_Subject and that subject is not `none`; otherwise Pending with no subject. A Declaration made for one subject never answers the other.
- **Tool_Name**: the free text the author enters with the second choice, naming the tool or tools. It is trimmed of leading and trailing whitespace and has 2 to 100 characters after trimming. It contains no line break and no control character. It may contain parentheses, brackets, quotation marks and any other printable character.
- **Declaration_Choice_None**: the label "No generative AI was used to prepare <subject>."
- **Declaration_Choice_AI**: the label "Generative AI was used to prepare some or all of <subject>."
- **Declaration_Required**: the condition that the Declaration_Subject is not `none` and the Applicable_Declaration is Pending.
- **Used_AI**: the single definition of AI use. Used_AI(document, order, declaration) is true when the Document holds Assistant_Text or the Applicable_Declaration is Declared_AI, and false otherwise. It covers both subjects.
- **Export_Dialog**, **Print_View**, **Picker**, **Confidentiality_Checkbox**, **Prohibition_Block**, **Gate**, **Order_Entry**, **First_Page_Heading**: as defined by the export-certification and court-orders specs.
- **Reveal_Codes_Form**: the full serialisation `render(document, "full").text` that the Appendix prints and `parse` reads back.
- **Sentinel**: the sweep CLI in `crew/sentinel`.
- **Export_Package**: `packages/export`. **Web_App**: `apps/web`.

## Requirements

### Requirement 1: Two kinds of sentence

**User Story:** As a self-represented filer, I want the statement to separate what the tool recorded from what I said, so that I know what I am signing and a court can tell which is which.

#### Acceptance Criteria

1. THE Export_Package SHALL render every sentence of the Statement_Text as either a Record_Sentence or an Author_Sentence, and SHALL render no sentence that mixes the two.
2. THE Export_Package SHALL begin every Author_Sentence with the words "The author states that", except the sentence of Requirement 7 criterion 3, which begins "The generative artificial intelligence program used was" and ends with the words "as named by the author".
3. THE Export_Package SHALL remove the sentence "No generative artificial intelligence was used in preparing this filing." from every Statement_Text.
4. THE Export_Package SHALL render no sentence that asserts, without attribution to the author, that no generative AI was used.
5. THE Export_Package SHALL render an Author_Sentence that says no generative AI was used only on the first choice (the Applicable_Declaration is None).
6. THE Export_Package SHALL render the same Statement_Text for the same Document, run log, meta, order context and Declaration.

### Requirement 2: Paragraph 2 by case

**User Story:** As a filer, I want the AI paragraph to describe what the record shows in each situation, so that no case prints a claim the tool cannot support.

#### Acceptance Criteria

1. WHERE the Document holds Assistant_Text, THE Export_Package SHALL render paragraph 2 as the sentences of the existing AI paragraph ("Generative artificial intelligence was used in preparing this filing. Tools: <tools>. Text inserted by the tool accounts for <A> of <T> characters (<share>%); of that, <E> characters were subsequently edited by the author.").
2. WHERE the Document holds Assistant_Text and Pasted_Text, THE Export_Package SHALL render after the sentences of criterion 1 the sentence "<P> of <T> characters (<share>%) were pasted or imported; the tool did not record their origin."
3. WHERE the Document holds neither Assistant_Text nor Pasted_Text, THE Export_Package SHALL render paragraph 2 as the Record_Sentence "The record shows that every character was typed in the editor and that the editor's assistant was not used."
4. WHERE the Document holds Pasted_Text and no Assistant_Text, THE Export_Package SHALL render paragraph 2 as "The record shows that the editor's assistant was not used. Of the <T> characters of this filing, <H> (<share>%) were typed in the editor and <P> (<share>%) were pasted or imported; the tool did not record the origin of the pasted or imported text."
5. WHEN the Declaration_Subject is not `none` and the Applicable_Declaration is None, THE Export_Package SHALL render the Declaration sentence "The author states that no generative AI was used to prepare <subject>."
6. WHEN the Declaration_Subject is `pasted_text` and the Applicable_Declaration is Declared_AI with Tool_Name `<tools>`, THE Export_Package SHALL render "The author states that generative AI was used to prepare some or all of the pasted text, and names the tool as <tools>. The tool did not record which pasted passages."
7. WHEN the Declaration_Subject is `this_filing` and the Applicable_Declaration is Declared_AI with Tool_Name `<tools>`, THE Export_Package SHALL render "The author states that generative AI was used to prepare some or all of this filing, and names the tool as <tools>. The tool did not record which passages."
8. THE Export_Package SHALL print the Tool_Name as entered after trimming, with no parentheses, quotation marks or other characters added around it.
9. WHEN the Declaration sentence is rendered, THE Export_Package SHALL render it as its own sentence, after every Record_Sentence of paragraph 2 and before the order sentences of Requirement 7.
10. WHEN the Declaration_Subject is `none`, THE Export_Package SHALL render no Declaration sentence, whatever Declaration value was supplied.
11. WHEN the Document holds Pasted_Text but no Substantive_Pasted_Text and the Declaration_Subject is not `this_filing`, THE Export_Package SHALL print the recorded counts of criterion 2 or 4 and SHALL render no Author_Sentence.
12. WHEN no Order_Entry is selected and the Document holds neither Assistant_Text nor Pasted_Text, THE Export_Package SHALL render the Record_Sentence of criterion 3 and no Declaration sentence.
13. WHEN Declaration_Required holds, THE Export_Package SHALL return an error value from `buildStatement` instead of a Statement, so that no Statement_Text can be produced without the declaration.
14. WHEN `<P>` is 0 and `<A>` is 0, THE Export_Package SHALL print `<T>` as the count of typed characters and no pasted count.

### Requirement 3: The declaration and its validation

**User Story:** As a filer, I want a plain two-way question with no default, so that I answer it myself and the tool never answers for me.

#### Acceptance Criteria

1. WHILE Declaration_Required holds, THE Web_App SHALL offer exactly two choices, labelled Declaration_Choice_None and Declaration_Choice_AI with `<subject>` replaced by the Subject_Phrase, as a native radio group with no choice selected.
2. WHEN the author selects Declaration_Choice_AI, THE Web_App SHALL show a labelled text field for the Tool_Name.
3. IF the Tool_Name has fewer than 2 or more than 100 characters after trimming, THEN THE Web_App SHALL treat the Declaration as Pending, SHALL keep the export actions disabled, and SHALL show the line "Enter the name of the tool or tools, 2 to 100 characters."
4. IF the Tool_Name contains a line break or another control character, THEN THE Web_App SHALL treat the Tool_Name as invalid under criterion 3.
5. WHEN the Tool_Name contains a parenthesis, a bracket, a quotation mark or another printable character and meets criterion 3, THE Web_App SHALL accept the Tool_Name.
6. WHEN the author selects Declaration_Choice_None, THE Web_App SHALL discard any Tool_Name text from the Declaration.
7. THE Export_Package SHALL validate the Tool_Name with the same limits when it receives a Declaration, and SHALL return an error value for an invalid one.
8. THE Web_App SHALL set no choice as a default, SHALL derive no choice from the text, and SHALL not preselect the previous answer to a different Document or to a different Declaration_Subject.
9. THE Web_App SHALL keep the Declaration and the Tool_Name on the machine; THE Web_App SHALL send neither to the LLM provider, to CourtListener, nor to any other host.

### Requirement 4: Declaration gate in the Export dialog and Print view

**User Story:** As a filer, I want to be asked once, in the same place as the other export questions, so that I cannot print a statement I have not answered for.

#### Acceptance Criteria

1. WHILE Declaration_Required holds, THE Export_Dialog SHALL show the declaration controls in the same block as the Picker and the Confidentiality_Checkbox, above the Confidentiality_Checkbox, and SHALL show "Download .docx" and "Open print view" as disabled buttons.
2. WHILE Declaration_Required holds, THE Export_Dialog SHALL show the line "State whether generative AI was used to prepare <subject> before you download or print." in the dialog status area.
3. THE Web_App SHALL offer the declaration controls in the Export_Dialog only, and SHALL offer no declaration control in the Print_View.
4. WHILE Declaration_Required holds, THE Print_View SHALL show, in place of the Statement_Text, one line that says the statement is not shown until the declaration is made in the Export dialog, followed by a link back to the editor.
5. THE Print_View SHALL render the line and link of criterion 4 in a block hidden in `@media print`.
6. WHEN a valid choice is made in the Export_Dialog and no other block holds, THE Export_Dialog SHALL enable the export buttons.
7. WHEN Declaration_Required holds, THE Gate SHALL refuse a download at the moment of export, as it does for the Confidentiality_Checkbox.
8. WHILE the Declaration_Subject is `none`, THE Export_Dialog and THE Print_View SHALL show no declaration controls or line and SHALL require no declaration.
9. WHILE Used_AI is false because the Applicable_Declaration is None or the Declaration_Subject is `none`, and the Document holds no Assistant_Text, THE Export_Dialog SHALL show no Confidentiality_Checkbox.
10. WHEN the Applicable_Declaration becomes Declared_AI and the selected Order_Entry includes `confidentiality`, THE Export_Dialog SHALL show the Confidentiality_Checkbox, unticked, under the Requirement 6 rules of the court-orders spec applied to Used_AI.
11. WHEN the Declaration changes, THE Web_App SHALL clear the Confidentiality_Checkbox tick and the export result notice.
12. WHEN the selected Order_Entry changes, THE Export_Dialog SHALL recompute the Declaration_Subject and SHALL apply Requirement 3 criterion 8 to the stored Declaration.
13. THE Print_View SHALL read the Declaration from the same stored value as the Export_Dialog, so that a choice made in the dialog is the one the Print_View prints.

### Requirement 5: Remembering and clearing the declaration

**User Story:** As a filer, I want my answer remembered with my draft but not carried onto text I did not answer for, so that a declaration never covers pasted text I added afterwards.

#### Acceptance Criteria

1. WHEN the author makes a valid choice, THE Web_App SHALL store the Declaration, with its subject, as an optional field of the draft's Persisted_Value, with the Persisted_Value version unchanged, so that the Declaration survives a reload.
2. WHEN the Export_Dialog opens and the Applicable_Declaration is not Pending, THE Export_Dialog SHALL show the stored choice selected.
3. WHEN an operation inserts at least one character of origin `PST` into the Document (a paste into the editor, or an undo or redo that restores `PST` characters), THE Web_App SHALL set the Declaration to Pending.
4. WHEN a sample or a file is loaded into the Document, THE Web_App SHALL set the Declaration to Pending.
5. WHEN the author starts a new document, THE Web_App SHALL discard the stored Declaration.
6. WHEN an operation deletes part of the Pasted_Text or edits inside it and inserts no `PST` character, THE Web_App SHALL keep the Declaration.
7. WHEN no Substantive_Pasted_Text remains after an operation and the stored Declaration has subject `pasted_text`, THE Web_App SHALL drop the Declaration, and THE Export_Package SHALL print no Declaration sentence for it.
8. WHILE the Declaration_Subject is `none`, THE Export_Package SHALL print no Declaration sentence, whatever stored Declaration exists.
9. WHEN a stored Declaration has subject `this_filing` and the selected Order_Entry changes so that Order_Requires_Statement no longer holds, THE Web_App SHALL keep the stored value and SHALL not apply it, and THE Web_App SHALL apply it again if Order_Requires_Statement holds again before any operation clears it.
10. IF the stored Declaration cannot be read, THEN THE Web_App SHALL treat the Declaration as Pending and SHALL keep the Document unchanged.
11. IF a stored draft from before this feature holds Substantive_Pasted_Text and has no Declaration, THEN THE Web_App SHALL treat the Declaration as Pending and SHALL load the draft unchanged.
12. FOR ALL sequences of editor operations, a stored Declaration SHALL NOT remain in force after an operation that inserts `PST` characters, SHALL remain in force after an operation that only deletes characters or edits inside the Pasted_Text while Substantive_Pasted_Text remains, and SHALL be dropped when no Substantive_Pasted_Text remains (Property 4).

### Requirement 6: One definition of AI use

**User Story:** As a filer, I want every court rule to treat my declaration the same way as assistant text, so that the statement cannot satisfy a court by omission.

#### Acceptance Criteria

1. THE Export_Package SHALL define Used_AI in one function and SHALL use that function wherever any of the following asks whether the filing used AI: the Statement field `aiUsed`, the Gate, the Prohibition_Block, the Confidentiality_Checkbox condition, the First_Page_Heading, and every order sentence of Requirement 7.
2. WHEN the selected Order_Entry has kind `prohibition` and Used_AI is true, THE Gate SHALL return `false` whether or not `blockingIssues(document)` is empty.
3. WHEN the selected Order_Entry has kind `prohibition` and the Document holds Assistant_Text, THE Gate SHALL refuse at once, whether the Declaration is Pending, None or Declared_AI, so that a pending declaration does not delay the refusal.
4. WHEN the selected Order_Entry has kind `prohibition`, the Document holds no Assistant_Text, and the Applicable_Declaration is not Declared_AI, THE Gate SHALL apply no prohibition refusal.
5. WHEN the Gate refuses under criterion 2, THE Export_Dialog and THE Print_View SHALL offer no override.
6. WHEN the Prohibition_Block holds because the Document holds Assistant_Text, THE prohibition line SHALL be the existing line of the court-orders spec, with the sentence " The author also declared that generative AI was used to prepare <subject>." appended WHEN the Applicable_Declaration is also Declared_AI.
7. WHEN the Prohibition_Block holds only because the Applicable_Declaration is Declared_AI, THE prohibition line SHALL read "<court> prohibits AI-drafted text. The author declared that generative AI was used to prepare <subject>.", where `<court>` is the existing subject of the court-orders prohibition line.
8. WHILE the Prohibition_Block holds, THE Export_Dialog and THE Print_View SHALL show the prohibition line of criterion 6 or 7 before any declaration control, and SHALL keep the declaration controls available while Declaration_Required holds.
9. FOR ALL Documents, Orders and Declarations, export is refused without an override exactly when the Order_Entry has kind `prohibition` and Used_AI is true (Property 2).
10. WHEN an author changes a Declared_AI Declaration to None under a prohibition entry, THE Gate SHALL stop refusing for that reason if no Assistant_Text remains.

### Requirement 7: Order sentences and first-page heading

**User Story:** As a filer under a court's AI rule, I want the elements the court asks for to appear whenever AI was recorded or declared, and the court's "no AI" sentences to appear only when the author has said so, so that the statement does not under-disclose.

#### Acceptance Criteria

1. WHEN Used_AI is true and the selected Order_Entry's `caption.placement` is `first_page_heading`, THE Export_Package SHALL give the DOCX the first-page heading of the court-orders spec, and THE Print_View SHALL render the same two lines.
2. WHEN Used_AI is false, THE Export_Package SHALL add no first-page heading.
3. WHEN the Order_Entry's `caption.placement` is `statement_title` or `separate_declaration`, THE Export_Package SHALL render the title or declaration clause as today, in every case of Used_AI.
4. WHERE the Order_Entry includes `tool_name` and the Document holds Assistant_Text only, THE Export_Package SHALL render the existing tools sentence.
5. WHERE the Order_Entry includes `tool_name`, the Document holds Assistant_Text and the Applicable_Declaration is Declared_AI, THE Export_Package SHALL render "The generative artificial intelligence program used was <recorded tools>; the author names <tools> for the pasted text."
6. WHERE the Order_Entry includes `tool_name`, the Document holds no Assistant_Text and the Applicable_Declaration is Declared_AI, THE Export_Package SHALL render "The generative artificial intelligence program used was <tools>, as named by the author."
7. WHERE the Order_Entry includes `tool_name` and Used_AI is false, THE Export_Package SHALL render the Record_Sentence "The record shows that no program was used in the editor."
8. WHERE the Order_Entry includes `tool_name`, Used_AI is false and the Applicable_Declaration is None, THE Export_Package SHALL render after the sentence of criterion 7 the sentence "The author states that no program was used to prepare <subject>."
9. WHERE the Order_Entry includes `portions` and Used_AI is true, THE Export_Package SHALL render the existing passages sentence WHEN the Document holds Assistant_Text.
10. WHERE the Order_Entry includes `portions` and the Applicable_Declaration is Declared_AI, THE Export_Package SHALL render "The author states that generative AI was used to prepare some or all of <subject>; the tool did not record which passages."
11. WHERE the Order_Entry includes `how_used` and Used_AI is true, THE Export_Package SHALL render the existing sentence WHEN the run count is greater than 0.
12. WHERE the Order_Entry includes `how_used` and the Applicable_Declaration is Declared_AI, THE Export_Package SHALL render "The tool did not record how generative AI was used to prepare <subject>."
13. WHERE the Order_Entry includes `prompt_records` and Used_AI is true, THE Export_Package SHALL render the existing sentence WHEN the run count is greater than 0.
14. WHERE the Order_Entry includes `prompt_records` and the Applicable_Declaration is Declared_AI, THE Export_Package SHALL render "The tool holds no prompt records for <subject>."
15. WHERE the Order_Entry includes `confidentiality`, Used_AI is true and the author ticked the Confidentiality_Checkbox, THE Export_Package SHALL render the existing confidentiality sentence.
16. WHERE the Order_Entry includes `negative_certification_when_unused`, THE Export_Package SHALL render a "no AI" sentence only WHEN the Document holds no Assistant_Text and the Applicable_Declaration is None, and SHALL render it as the sentence of criterion 8.
17. THE Export_Package SHALL leave the sentences for `accuracy_certification`, `citations_verified`, `human_review` and `signed_by_all_drafters` unchanged.
18. FOR ALL Documents, Orders and Declarations, the Statement_Text SHALL contain no tool-asserted "no AI" sentence, and SHALL contain an Author_Sentence that says no AI was used only when the Applicable_Declaration is None, under either Declaration_Subject (Property 1).
19. FOR EACH Order_Entry kind (`certification_every_filing`, `disclosure_when_used`, `prohibition`, `verification_only`, `guidance`), THE Export_Package SHALL render the sentences of this requirement identically for the same Used_AI value, Declaration_Subject and element list.

### Requirement 8: The record keeps the declaration

**User Story:** As a filer and as a later reader of an exported file, I want the declaration to travel with the record, so that the Sentinel does not flag it and reopening the export restores it.

#### Acceptance Criteria

1. THE Appendix SHALL carry the Applicable_Declaration, with its subject, in the Reveal_Codes_Form, so that a reader of the DOCX can recover the Document, its provenance, and the Declaration from the Appendix alone.
2. WHEN the Declaration_Subject is `none` or the Applicable_Declaration is Pending, THE Reveal_Codes_Form SHALL carry no Declaration.
3. THE Reveal_Codes_Form SHALL carry the Declaration as an optional field of `[DOC]`, and THE `[DOC]` version SHALL remain 1.
4. WHEN the Reveal_Codes_Form of a Document with a Declaration is parsed, THE Engine SHALL return the same Document and the same Declaration, including a Tool_Name that contains brackets, parentheses, quotation marks, commas, semicolons and non-ASCII characters.
5. FOR ALL Documents and valid Declarations of either subject, `parse(render(document, "full"))` SHALL reproduce the Document and the Declaration, and the Declaration SHALL survive the export-and-read-back path (DOCX export, `splitExport`, `recordedDocument`) unchanged (Property 3).
6. WHEN the Sentinel reads an export that carries a Declaration, THE Sentinel SHALL report no Finding because of the Declaration, and SHALL report "No drift." for an otherwise unchanged file.
7. THE Statement_Text SHALL contain no paragraph equal to any member of `STATEMENT_TITLES` other than its own title, so that `splitExport` cuts the body where it did before.
8. WHEN the Reveal_Codes_Form is the display form (`render(document, "display")`), THE Engine SHALL omit the Declaration, so that the Pane shows no new code and no new payload.
9. WHEN a file exported before this feature is read, THE Engine and THE Sentinel SHALL read it as a Document with no Declaration and SHALL report no Finding because the Declaration is absent.
10. THE design SHALL state where the Declaration field sits in `[DOC]` and how the lexer treats an unknown `[DOC]` key, and SHALL state whether a Sentinel built before this feature can read a file that carries the new field.
11. THE spec SHALL record that the code list of product.md adds, renames and restyles no code under this feature; because the `[DOC]` entry of that list names no payload, THE product.md `[DOC]` entry SHALL be edited first to say that `[DOC]` may carry the Declaration as an optional field, before any Engine code changes, as structure.md and Requirement 14 criterion 5 require.
12. THE record SHALL support the later open-draft spec: a Declaration restored from an exported Appendix SHALL be the Declaration the author made, with the same subject and the same Tool_Name.

### Requirement 9: Legend text

**User Story:** As a filer reading the pane, I want the Legend to say what `PST` really means, so that I know the tool did not record where the text came from.

#### Acceptance Criteria

1. THE Web_App SHALL show the Legend entry for `[PST]` as "pasted, origin not recorded".
2. THE Web_App SHALL change no other Legend entry, no pane colour, no code, and no other visual element of the Pane.
3. THE Web_App SHALL keep the Legend within its existing width rules at the supported viewport widths.

### Requirement 10: Samples and the demo path

**User Story:** As a judge or a first-time user, I want the two samples to walk through the declaration, so that the first-run path shows the feature and still finishes in the time budget.

#### Acceptance Criteria

1. WHEN Load demo motion or Load the Avianca citations is used, THE Web_App SHALL load the text as origin `PST`, as today, and SHALL set the Declaration to Pending.
2. WHEN the Export_Dialog opens for either sample, THE Export_Dialog SHALL show the declaration controls under Requirement 4 with the subject "the pasted text".
3. THE README "Demo path" SHALL gain a step that makes the declaration in the order: Export, choose the court, make the declaration, resolve or override, Download.
4. THE README "Demo path" SHALL name the court as N.D. Tex. and the choice as Declaration_Choice_AI with a named tool, and SHALL state that the statement then prints the sentence of Requirement 2 criterion 6 and that the first-page heading appears.
5. THE Web_App tests that walk the demo path SHALL make the declaration before asserting that the export buttons are enabled.
6. THE demo path SHALL stay within the end-to-end time of product.md ("Success for the hackathon demo") with the declaration step included.

### Requirement 11: Properties

**User Story:** As a maintainer, I want the guarantees that matter stated as properties, so that a later change cannot quietly bring back an unsupported sentence.

#### Acceptance Criteria

1. THE tests SHALL contain, in `<module>.properties.test.ts` files with `// Property N` comments, one `fc.assert(fc.property(...))` for each of Properties 1 to 4, run with `numRuns` of 200 locally and 500 in CI.
2. Property 1 SHALL generate Documents over all four origins including whitespace-only `PST` text, every Declaration that `buildStatement` accepts for both subjects (None, and Declared_AI with valid Tool_Names including bracket, parenthesis and quote characters), and every Order_Entry kind and the no-order case, and SHALL assert that the rendered Statement_Text never contains the old sentence "No generative artificial intelligence was used in preparing this filing.", never contains an unattributed "no AI" sentence, and contains an Author_Sentence "no AI" only when the Applicable_Declaration is None.
3. Property 2 SHALL assert that `canExport` refuses without an override exactly when the Order_Entry has kind `prohibition` and Used_AI (Assistant_Text or an Applicable_Declaration of Declared_AI, under either subject) is true, over Documents with no blocking issues.
4. Property 3 SHALL assert the round trip of Requirement 8 criterion 5 for both subjects, and SHALL include the Sentinel read path with the verifier fetch stubbed.
5. Property 4 SHALL assert Requirement 5 criterion 12.
6. THE shared arbitraries for Declarations and Tool_Names SHALL live in `packages/engine/src/testing/arbitraries.ts` or an Export_Package equivalent used by more than one test file.
7. THE tests SHALL contain no snapshot of the engine, no `try/catch` that hides an error, and no test that only imports a module.

### Requirement 12: Example tests

**User Story:** As a maintainer, I want exact cases pinned, so that the wording and the gate cannot drift unnoticed.

#### Acceptance Criteria

1. THE Export_Package tests SHALL pin the cases of paragraph 2: Assistant_Text with and without Pasted_Text; typed text only with no order selected; typed text only under an order with Order_Requires_Statement, with the declaration None and with Declared_AI; Substantive_Pasted_Text with no Assistant_Text, with the declaration None and with Declared_AI; whitespace-only Pasted_Text with no order selected, printing no Author_Sentence.
2. THE Export_Package tests SHALL pin, for each Order_Entry kind, a filing with Declared_AI pasted text and no Assistant_Text, asserting the Requirement 7 sentences or the prohibition refusal of Requirement 6.
3. THE Export_Package tests SHALL pin, for an Order_Entry with Order_Requires_Statement, a typed-only filing with the `this_filing` Declaration None and Declared_AI, asserting the Requirement 2 and 7 sentences.
4. THE Export_Package tests SHALL pin the N.D. Tex. `first_page_heading` for a filing with Declared_AI pasted text and no Assistant_Text, in the DOCX and in the Print_View.
5. THE Export_Package tests SHALL pin that a Declared_AI Tool_Name such as "ChatGPT (GPT-4o)" is printed unchanged.
6. THE Web_App tests SHALL pin that the Export_Dialog shows no statement and keeps the export buttons disabled until a choice is made, and that the Print_View shows the one-line notice with the link back to the editor and no declaration control.
7. THE Web_App tests SHALL pin the Tool_Name limits at 1, 2, 100 and 101 characters after trimming, a whitespace-only name, a name with a line break, and a name with parentheses.
8. THE Web_App tests SHALL pin that a paste clears a stored Declaration, that loading a sample clears it, that starting a new document discards it, that a partial delete of the pasted text keeps it, and that deleting all Substantive_Pasted_Text drops it.
9. THE Sentinel tests SHALL pin "No drift." for a Declared_AI export and a None export, and the result for a file exported before this feature.
10. THE Web_App tests SHALL pin the two samples: the demo motion and the Avianca sample each ask for the declaration.
11. THE Web_App tests SHALL pin the Legend text "pasted, origin not recorded" and the unchanged text of the other seven entries.

### Requirement 13: Documentation

**User Story:** As a reader of the repository and of the exported statement, I want the documents to describe the two kinds of sentence and the declaration, so that the product is described as it behaves.

#### Acceptance Criteria

1. THE docs/CERTIFICATION.md SHALL describe the statement paragraph by paragraph, label each sentence as a Record_Sentence or an Author_Sentence, and give the cases of paragraph 2 with their exact wording.
2. THE docs/CERTIFICATION.md SHALL explain the declaration and its two subjects, the clearing rule of Requirement 5, the single definition of AI use, and the prohibition reasons.
3. THE README.md "What it does" section SHALL describe that the statement states the record and that the author states the rest, and THE README.md "Demo path" SHALL change as in Requirement 10.
4. THE .kiro/steering/product.md principle 1 SHALL gain the rule of Requirement 1: the tool states the record; the author states the rest; the two kinds of sentence are never mixed; the tool never asserts "no AI" on its own.
5. THE BUILD_LOG.md SHALL gain a dated entry that gives the observation of the Introduction as the reason, and records what Kiro got wrong in the requirements pass.
6. THE docs/KIRO_USAGE.md SHALL gain a row for this spec and a row for each hook, agent, steering file or MCP tool this feature adds or changes, with file paths.
7. THE docs and the Statement_Text SHALL use the words "record", "pasted or imported", "declaration" and "author states" consistently and SHALL not use "detected" or "inferred" about AI.

### Requirement 14: Process

**User Story:** As the owner of the repository, I want the spec committed before code and the checks run before anything is called done, so that the history shows the order of work.

#### Acceptance Criteria

1. THE spec files SHALL be committed, in a commit titled `spec(pasted-text-declaration): …`, before any implementation task starts.
2. THE final checkpoint SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build `pnpm --filter @reveal-codes/web build`, and `pnpm kiro:check`, and SHALL record each result.
3. THE work SHALL NOT push to any remote.
4. THE feature SHALL keep `packages/engine` free of runtime dependencies and free of `node:` and DOM imports, SHALL keep every function under 40 lines and every module under 300 lines, and SHALL add no `any`.
5. WHEN the feature changes the Engine Document, the Reveal_Codes_Form or the code list, THE spec SHALL be updated before the code, as structure.md requires.

## Resolved decisions

1. The Declaration is stored as an optional field of the draft's Persisted_Value, version unchanged.
2. The Declaration is an optional `[DOC]` field under version 1. Exports made before this feature keep parsing. The product.md `[DOC]` entry names no payload, so it gets a one-line edit first (Requirement 8 criterion 11); no code is added or renamed.
3. A declaration is required for pasted text only when the pasted text holds at least one non-whitespace character. Recorded counts are unchanged, and whitespace-only pasted text prints no Author_Sentence about the pasted text.
4. The Declaration is kept through partial deletes and in-place edits, cleared when `PST` characters are added, and dropped and not printed when no Substantive_Pasted_Text remains. "No pasted text remains" is read as no non-whitespace pasted text, to match decision 3.
5. Typed-only wording is "The record shows that every character was typed in the editor and that the editor's assistant was not used." The same two-choice declaration is also asked, with the subject "this filing", when the selected order requires a certification either way or a negative certification and the record shows no assistant text and no substantive pasted text. With no order selected, a typed-only filing prints the record sentence and asks nothing. Decision 5 and Used_AI cover both subjects.
6. The First_Page_Heading wording is unchanged when AI is declared.
7. The choice is made in the Export dialog only. The Print_View shows a one-line notice and a link back to the editor until the choice is made.
8. A Tool_Name may contain parentheses and any printable character; only line breaks and control characters are rejected. The sentence names the tool outside parentheses.
9. The README demo path uses Declaration_Choice_AI with a named tool under N.D. Tex.
10. Under a prohibition entry the refusal for assistant text comes first and is not delayed by a pending declaration.
