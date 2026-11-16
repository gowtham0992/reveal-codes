# Requirements Document

## Introduction

Most people who use Reveal Codes draft somewhere else (product.md, principle 0: "Paste is the front door"). Today the only way in is to paste. This feature adds a second way in: a person opens a `.docx`, `.txt` or `.md` file from their computer, and a `.docx` that Reveal Codes itself exported reopens with its provenance record restored.

Three paths follow from the file.

1. A text file, or a Word file with no Provenance Appendix, becomes the Document as one `PST` span. The tool does not know who wrote the text and does not pretend to (product.md, principle 1). The Declaration is cleared, so the Export dialog asks whether AI was used to prepare the opened text (pasted-text-declaration, Requirement 5, criterion 4).
2. A Reveal Codes export whose body still matches the document text recorded in its Provenance Appendix is restored from the appendix: spans, verification results, overrides and the author's Declaration come back as recorded. The file does not carry the tool names of assistant runs or the check date, so a reopened file has an empty run log and no check date, and the Issues region says so (Requirement 13).
3. A Reveal Codes export whose body differs from the record is imported as body text only, as one `PST` span, and the Issues region says why.

The file is read in the browser. Nothing is uploaded and no request is made. The statement pages and the appendix of an export are never imported as body text.

Text from every source is made safe for Word files at the moment it enters the Document (Requirement 22), so that an export never drops a character silently.

The `.docx` text reader that the Sentinel uses moves to a place both the Sentinel and the web app import, so that the repository holds one reader and not two. The end-of-filing rule and the appendix parse that the Sentinel already uses move with it, and so does the classification of a Word file (`readWordDraft`), which is a pure function of bytes.

Deferred: the rule that a reopened export produces the same certification statement it was exported with is not part of this spec. It would need the record to carry the tool names and the check date. It is recorded in the design under "Deferred".

Scope: `packages/export` (the shared reader, the appendix parse, `readWordDraft` and the DOCX-safe text function), `crew/sentinel` (imports only), `apps/web` (Toolbar, page drop, empty page, Issues region, Open flow, `limits.ts`, the input points of Requirement 22), `README.md`, `docs/KIRO_USAGE.md`, `BUILD_LOG.md`, `.kiro/steering/ui.md`, `.kiro/steering/structure.md` and `.kiro/steering/tech.md`. `packages/engine` is not changed.

Out of scope: `.doc`, `.pdf`, `.rtf` and Google Docs; formatting of any kind (bold, italics, headings, numbering); saving back to the opened file; any server route; any new origin or code; restoring the court, the judge or the confidentiality tick; restoring the tool names of assistant runs or the check date (deferred). The code list and the `[DOC]` entry of product.md gain, lose and restyle nothing under this feature, and the Reveal_Codes_Form does not change.

Product principles that bind this spec: principle 0 (paste is the front door; open is a second door), principle 1 (provenance is captured, never inferred: an opened file is `PST`, and only a matching record restores anything else), principle 3 (nothing leaves the machine silently), and principle 4 (red codes still block export after a reopen; a restored override stays an override).

Interpretation notes, so that the criteria below are testable:

- The Engine counts characters in UTF-16 code units. `<n>` in a message is `document.text.length` as a decimal integer with no separator.
- Wording given in double quotation marks is exact, including punctuation. Angle-bracket fields are replaced by values; no other text changes.
- `<file name>` is `File.name` as the browser reports it: the name only, with no directory.
- Message wording for refusals was accepted by the author; the structure of each message (it names the file and says what to do) is binding.
- Known limit: text inside Word text boxes may be read twice or not at all, depending on how Word stored it; the Docx_Reader makes no attempt to deduplicate it.

## Glossary

- **Web_App**: `apps/web`.
- **Export_Package**: `packages/export`. **Sentinel**: the sweep CLI in `crew/sentinel`. **Engine**: `packages/engine`.
- **Open_Flow**: the code path that takes one `File`, reads it, and either installs a Document or refuses. The picker and the drop both call it.
- **Picker**: the system file chooser opened by the Open button or by the Open_Link. (Not the court Picker of the Export dialog.)
- **Open_Button**: the Toolbar button labelled "Open".
- **Open_Link**: the link "Open a draft" on the empty page.
- **Opened_File**: the `File` handed to the Open_Flow, from the Picker or from a drop.
- **Accepted_Kind**: a file whose name ends, in any letter case, in `.docx`, `.txt` or `.md`.
- **Text_File**: an Accepted_Kind ending in `.txt` or `.md`. **Word_File**: an Accepted_Kind ending in `.docx`.
- **Size_Limit**: 5 MB, taken as 5 242 880 bytes.
- **Part_Size_Limit**: 32 MiB, taken as 33 554 432 bytes, the most that one part of a Word_File may unpack to.
- **Character_Limit**: the existing `MAX_TEXT_CHARS`, 200 000 code units. It lives in `apps/web/src/limits.ts` and the Open_Flow and the verify route use that one constant.
- **Docx_Reader**: the shared module that reads the text of a Word_File (Requirement 1).
- **Plain_Reading**: the text the Docx_Reader returns for a Word_File that is read as an ordinary Word file (Requirement 6), including the Notes_Block when the file has notes.
- **Notes_Block**: the text appended after the body when the file has footnotes or endnotes: a blank line, the line `Footnotes`, then one line per note (Requirement 7).
- **Separator_Note**: a note entry of `word/footnotes.xml` or `word/endnotes.xml` with `w:id` -1 or 0, or with a `w:type` of `separator` or `continuationSeparator`.
- **Reveal_Codes_Export**: a `.docx` that carries the Appendix title (`APPENDIX_TITLE`) as a paragraph. **Statement_Titles**: `STATEMENT_TITLES`. **Appendix**: the Provenance Appendix.
- **Filing_End**: the index of the last paragraph before the Appendix title that equals a member of Statement_Titles, found by the rule the Sentinel's `splitExport` uses. **Export_Body**: the paragraphs before the Filing_End. **Appendix_Lines**: the paragraphs after the Appendix title less the introductory sentences.
- **Recorded_Text**: `document.text` of the record that `parseRecord` reads from the Appendix_Lines.
- **Body_Text**: the Export_Body joined with `\n`, followed by the Notes_Block when the file has notes.
- **Match**: Body_Text equals Recorded_Text, code unit for code unit.
- **Restore**: installing the Document and Declaration that `parseRecord` returns, unchanged.
- **Open_Message**: the text of the Toolbar status region (the Store `notice`, shown in the Toolbar's `role="status"` element) after an open.
- **Run_Log**: the Store's list of assistant runs, each with its run identifier, the provider and model, and the prompt.
- **Verification_Time**: the `verifiedAt` instant of the last Verify run, or null when there is none.
- **Docx_Unsafe_Character**: a code unit or code point that XML 1.0 cannot carry: anything other than U+0009, U+000A, U+000D, U+0020 to U+D7FF, U+E000 to U+FFFD and U+10000 to U+10FFFF. This includes U+0000 to U+0008, U+000B, U+000C, U+000E to U+001F, U+FFFE, U+FFFF and an unpaired surrogate.
- **Docx_Safe_Text**: the result of the function of Requirement 22 criterion 1, which turns U+000B and U+000C into `\n` and removes every other Docx_Unsafe_Character.
- **Entry_Point**: a place where text enters the Document: paste, drop, a loaded sample (demo motion or the Avianca citations), text inserted by the assistant, and Open.
- **Open_Note**: the message in the Issues region that explains a refusal, a changed export, or what a restore did not bring back (Requirement 15).
- **Issues_Region**, **Store**, **Declaration**, **Applicable_Declaration**, **Next_Step**, **Draft_Gate**, **Persisted_Value**, **Appendix**, **Reveal_Codes_Form**: as defined by the editor-app, first-run-and-flow, export-certification, sentinel-sweep and pasted-text-declaration specs.
- **Empty_Page**: the editor surface while `document.text` has zero characters.

## Requirements

### Requirement 1: One reader for the Sentinel and the web app

**User Story:** As a maintainer, I want one `.docx` text reader, so that the Sentinel and the editor can never disagree about what a file says.

#### Acceptance Criteria

1. THE repository SHALL hold one implementation of the `.docx` paragraph reader (today `crew/sentinel/src/docx-read.ts` and `xml-text.ts`), one implementation of the end-of-filing rule (today `crew/sentinel/src/split.ts`) and one implementation of the appendix parse (today `crew/sentinel/src/recorded.ts`), each in a module that both the Sentinel and the Web_App import.
2. THE design SHALL name the package and module paths of the shared code and SHALL state why; the Export_Package is the proposed home.
3. THE repository SHALL hold no copy of those modules, in the Web_App or elsewhere.
4. THE shared modules SHALL import nothing from `node:` and nothing from the DOM, so that they run in the browser and under Node.
5. WHERE the shared code lives in the Export_Package, THE Export_Package SHALL list the zip library as a runtime dependency, and THE Engine SHALL keep zero runtime dependencies.
6. THE Docx_Reader SHALL be total: for any bytes it SHALL return a value and SHALL throw nothing.
7. WHEN the Sentinel reads a file, THE Sentinel SHALL produce the same Findings, the same report text and the same error kinds as before the move, for every existing Sentinel test and fixture.
8. THE Sentinel tests SHALL stay green with no change other than import paths.
9. WHEN the Docx_Reader reads `word/document.xml` for the Sentinel, THE Docx_Reader SHALL return the same paragraphs as before the move, so that the Sentinel does not read footnotes or endnotes.
10. THE classification of a Word_File as plain, restored, changed or refused SHALL be one pure function of bytes, `readWordDraft`, in the Export_Package, so that it is tested without a browser; THE Web_App SHALL hold only the Store actions and the messages that follow from its result, and SHALL NOT hold a second copy of the classification.

### Requirement 2: Open from the Toolbar

**User Story:** As a person with a draft in a file, I want an Open button, so that I can bring the file in without copying it by hand.

#### Acceptance Criteria

1. THE Toolbar SHALL show a button labelled "Open" in the group of New, immediately after New and before Load demo motion.
2. WHEN the author activates the Open_Button, THE Web_App SHALL open the Picker, filtered to `.docx`, `.txt` and `.md`.
3. WHEN the author chooses one file in the Picker, THE Web_App SHALL pass that Opened_File to the Open_Flow.
4. WHEN the author cancels the Picker, THE Web_App SHALL leave the Document, the Store and every message unchanged.
5. WHEN the Picker returns the same file name as the last open, THE Web_App SHALL still run the Open_Flow, so that choosing the same file twice opens it twice.
6. THE Open_Button SHALL carry no `data-primary`: the Next_Step rules of ui.md "Controls" stay as they are.
7. WHILE a Verify run is in flight, THE Open_Button SHALL be enabled and the Open_Flow SHALL follow Requirement 4 criterion 6.
8. THE Web_App SHALL read the Opened_File in the browser with the File API, SHALL upload nothing and SHALL send no request of any kind while opening (Requirement 17).

### Requirement 3: Open by dropping a file

**User Story:** As a person with a file open in a folder, I want to drop it on the page, so that I do not need the Picker.

#### Acceptance Criteria

1. WHEN the author drops files on the page and the drop carries exactly one file, THE Web_App SHALL pass that file to the same Open_Flow function as the Picker.
2. WHEN a drop carries files, THE Web_App SHALL insert no text from the drop into the editor and SHALL let the browser navigate to no file.
3. WHEN a drop carries files and the file is not an Accepted_Kind, THE Web_App SHALL refuse it under Requirement 14.
4. WHEN a drop carries more than one file, THE Web_App SHALL refuse it with the Open_Note of Requirement 14 criterion 8 and SHALL open none.
5. WHEN a drag carries no file (selected text moved within or into the editor), THE Web_App SHALL keep the existing drop behaviour, so that dropped text is `PST` as editor-app defines.
6. WHILE a file is dragged over the page, THE Web_App SHALL show no overlay, outline or animation (ui.md: no animation).
7. THE Picker path and the drop path SHALL reach the same function, so that one example test exercises both against the same fakes.

### Requirement 4: Confirm before replacing

**User Story:** As an author with work on the page, I want to be asked before an opened file replaces it, so that I do not lose a draft by mistake.

#### Acceptance Criteria

1. WHEN the Open_Flow has read and checked an Opened_File without refusing it and `document.text` is not empty, THE Web_App SHALL show the existing confirm dialog before replacing the Document.
2. THE confirm dialog SHALL use the wording pattern of New: title "Open a draft", message "Discard the current draft and open <file name>?", confirm label "Discard and open", and Cancel with focus on Cancel.
3. WHEN the author confirms, THE Web_App SHALL install the result of the Open_Flow.
4. WHEN the author cancels, THE Web_App SHALL leave the Document, the stored draft, the Declaration and every message unchanged.
5. WHEN `document.text` is empty, THE Web_App SHALL install the result with no dialog.
6. WHEN the Open_Flow refuses an Opened_File, THE Web_App SHALL show no confirm dialog, so that the author is never asked to discard a draft for a file that will not open.
7. WHEN the Open_Flow refuses an Opened_File or the author cancels, THE Web_App SHALL leave the Document, the undo and redo stacks, the Declaration, the verification time and the stored draft unchanged.
8. WHEN the Open_Flow installs a Document, THE Web_App SHALL replace the Document through the Store `replace` action, so that the history barrier, the autosave and the Declaration rules of the Store apply as for Load demo motion.
9. THE Web_App SHALL apply to Open the same Draft_Gate behaviour as it applies to Load demo motion, and SHALL add no Draft_Gate behaviour of its own.

### Requirement 5: Text files

**User Story:** As a person with a draft in a text or Markdown file, I want the text to come in as it is, so that nothing is added or lost.

#### Acceptance Criteria

1. WHEN the Opened_File is a Text_File, THE Open_Flow SHALL decode its bytes as UTF-8.
2. WHEN the decoded text begins with U+FEFF, THE Open_Flow SHALL remove that one character.
3. THE Open_Flow SHALL replace every `\r\n` and every lone `\r` with `\n`.
4. THE Open_Flow SHALL use the resulting text, with no change other than the normalisation of criteria 2 and 3 and the Docx_Safe_Text step of Requirement 22, as the text of the Document, so that Markdown marks, trailing newlines and blank lines are kept and nothing is rendered or interpreted.
5. IF the bytes of a Text_File are not valid UTF-8, THEN THE Open_Flow SHALL refuse the file under Requirement 14 criterion 7, including a file in UTF-16.
6. FOR ALL byte sequences that are the UTF-8 encoding of a string `s` that holds no `\r` and no Docx_Unsafe_Character, with or without a leading byte-order mark, THE Open_Flow SHALL produce `s`.

### Requirement 6: Word files, plain

**User Story:** As a person with a draft in Word, I want the text of the body, so that I can verify and export it.

#### Acceptance Criteria

1. WHEN the Opened_File is a Word_File and carries no Appendix title paragraph, THE Open_Flow SHALL use the Plain_Reading, after the Docx_Safe_Text step of Requirement 22, as the text.
2. THE Docx_Reader SHALL return the paragraphs of `word/document.xml` in order, one line for each paragraph, with the runs of a paragraph joined.
3. THE Docx_Reader SHALL keep a tab as `\t` and a line break (`w:br` with no type or type `textWrapping`) as `\n`.
4. THE Docx_Reader SHALL include the text of tracked insertions and SHALL omit the text of tracked deletions.
5. THE Docx_Reader SHALL read the text of a table cell by cell, row by row, as the paragraphs the table holds, so that each paragraph of a cell is one line and no table markup is kept (flat reading).
6. THE Docx_Reader SHALL ignore headers, footers, comments, images and formatting.
7. THE Open_Flow SHALL replace any `\r\n` or lone `\r` in the text with `\n`.
8. THE Docx_Reader SHALL decode the five named XML entities and numeric character references, and SHALL keep the characters of the text unchanged otherwise, including leading and trailing spaces of a run.
9. FOR ALL lists of paragraphs `p` that hold no `\n` and no character that XML 1.0 cannot carry, a Word_File built from `p` with the Export_Package's paragraph builder SHALL read back as `p` joined with `\n` (Property 1).

### Requirement 7: Footnotes and endnotes

**User Story:** As a lawyer whose citations sit in footnotes, I want the notes kept, so that Verify checks them.

#### Acceptance Criteria

1. WHEN a Word_File read as an ordinary Word file has footnotes or endnotes, THE Docx_Reader SHALL append the Notes_Block to the body: a blank line, the line `Footnotes`, then each note on its own line as `<n>. <text>`, in order.
2. THE Docx_Reader SHALL read footnotes from `word/footnotes.xml` and endnotes from `word/endnotes.xml`, and SHALL skip every Separator_Note, so that Word's separator and continuation-separator notes are never numbered.
3. THE Docx_Reader SHALL number the notes from 1 in one sequence, footnotes first, then endnotes, in the order each part holds them; a Separator_Note takes no number.
4. THE Docx_Reader SHALL set the text of one note on one line: the paragraphs of a note are joined with a single space, and a line break or tab inside a note becomes a space.
5. THE Docx_Reader SHALL leave out a note whose text is empty after joining.
6. WHEN the file has no note with text, THE Docx_Reader SHALL append nothing.
7. WHEN the Open_Flow installs text that holds a Notes_Block, THE Open_Message SHALL carry the sentence " Footnotes and endnotes follow the body." after the sentence of Requirement 8 criterion 3 and after the sentence of Requirement 22 criterion 5 when that applies.
8. THE Docx_Reader SHALL read notes only for the Open_Flow; THE Sentinel SHALL call the reader in the mode that reads `word/document.xml` alone (Requirement 1 criterion 9).

### Requirement 8: Provenance of an opened file

**User Story:** As an author, I want an opened file marked as pasted, so that the record says what the tool knows and no more.

#### Acceptance Criteria

1. WHEN the Open_Flow installs text from a Text_File, a Plain_Reading, or the body-only import of Requirement 10, THE Web_App SHALL set the whole text as one `PST` span, by the same construction as the demo motion (one insert over an empty Document with origin `PST` and the current time).
2. WHEN the Open_Flow installs such text, THE Web_App SHALL set the Declaration to Pending, SHALL clear the verification time, SHALL set the run log to empty, and SHALL install no override and no verification result.
3. WHEN the Open_Flow installs such text, THE Open_Message SHALL read "Opened <file name>: <n> characters, marked as pasted."
4. WHEN the Open_Flow installs such text, THE Next_Step SHALL be the value that the existing rules of `nextStep` give, which is `verify` whenever the text holds a full citation that Verify can act on; THE Web_App SHALL change no Next_Step rule.
5. WHEN the opened text holds substantive text, THE Export dialog SHALL ask for the Declaration with the subject "the pasted text", as it does after Load demo motion.
6. THE Web_App SHALL assign no origin other than `PST` to opened text, and SHALL run no detector on it.

### Requirement 9: Reopening an export

**User Story:** As an author who exported a filing and wants to continue, I want the file to reopen with its record, so that I do not verify and override everything again.

#### Acceptance Criteria

1. WHEN the Opened_File is a Word_File whose paragraphs include the Appendix title, THE Open_Flow SHALL classify the file with `readWordDraft`, which finds the Filing_End with the shared end-of-filing rule, SHALL parse the Appendix_Lines with `parseRecord`, and SHALL compare Recorded_Text with Body_Text.
2. WHEN the Appendix parses and Recorded_Text and Body_Text Match, THE Web_App SHALL Restore.
3. WHEN the Web_App restores, THE Document SHALL equal the Document that `parseRecord` returned, with its spans, runs, citations, quotes, verification results, quote-check results, overrides and issue key counter as recorded.
4. WHEN the Web_App restores, THE Web_App SHALL mark no character as `PST` that the record does not mark as `PST`.
5. WHEN the Web_App restores, THE Open_Message SHALL read "Reopened <file name> with its provenance record (exported <date>)."
6. WHERE the paragraph immediately before the Appendix title is a signature date line in the form YYYY-MM-DD, THE Open_Flow SHALL take `<date>` from it; otherwise THE Open_Message SHALL read "Reopened <file name> with its provenance record." with the parenthetical dropped. THE design SHALL confirm against the export builder that the date line sits in that position.
7. WHEN the Web_App restores, THE red codes of the record SHALL block export as they did before, and a restored override SHALL stay attached to its issue with its reason and timestamp.
8. IF the Document that `parseRecord` returns has text longer than the Character_Limit or no text, THEN THE Open_Flow SHALL refuse the file under Requirement 14.
9. THE Open_Flow SHALL decide Match on the Export_Body read with the same reader and the same paragraph rules the Sentinel uses, so that the Sentinel and the Open_Flow agree on whether a file was edited.
10. FOR ALL Documents and Applicable_Declarations, exporting to `.docx` and reopening the file SHALL return a Document equal to the original (by `structuralEqual`) and the same Declaration (Property 2).

### Requirement 10: A changed export

**User Story:** As an author whose export was edited after the fact, I want the text imported but not trusted, so that an old record is never attached to new words.

#### Acceptance Criteria

1. WHEN a Word_File carries the Appendix title and the end of the filing is found, and either Recorded_Text and Body_Text differ or the Appendix_Lines do not parse, THE Open_Flow SHALL import Body_Text only.
2. WHEN the Open_Flow imports Body_Text only, THE Web_App SHALL install it, after the Docx_Safe_Text step of Requirement 22, as one `PST` span under Requirement 8 criteria 1, 2 and 6.
3. WHEN the Open_Flow imports Body_Text only, THE Open_Message SHALL read "Opened <file name>: <n> characters, marked as pasted."
4. WHEN the Open_Flow imports Body_Text only, THE Issues_Region SHALL show the Open_Note "This file was changed after it was exported, so its provenance record was not restored. The text is marked as pasted."
5. WHEN the Open_Flow imports Body_Text only, THE Web_App SHALL restore no Declaration, so that the author is asked again as for any newly pasted text.
6. WHEN the Open_Flow imports Body_Text only, THE Web_App SHALL restore no span, verification result or override from the Appendix, and SHALL treat an unparseable Appendix as a changed export.
7. FOR ALL Documents that export, and FOR ALL single-character changes to the exported body, reopening SHALL return one `PST` span covering the changed text, no Declaration, and the Open_Note of criterion 4 (Property 3).
8. IF the file carries the Appendix title and the end of the filing cannot be found, THEN THE Open_Flow SHALL refuse the file under Requirement 14 criterion 9.

### Requirement 11: Statement and appendix pages are never body text

**User Story:** As an author, I want only my filing to come in, so that the old statement does not become part of the new draft.

#### Acceptance Criteria

1. WHEN the Opened_File is a Reveal_Codes_Export, THE Open_Flow SHALL use no paragraph at or after the Filing_End as text of the Document, whether it restores or imports the body only.
2. THE Open_Flow SHALL import no paragraph of the statement title, the statement paragraphs, the statement tables, the signature lines, the Appendix title, the Appendix introduction or the Appendix_Lines as text.
3. WHEN the body of the filing holds a line equal to a member of Statement_Titles, THE Open_Flow SHALL cut at the last such line before the Appendix title, as the Sentinel does, so that the filing's own line stays in the body.
4. WHEN a file carries no Appendix title, THE Open_Flow SHALL treat it as an ordinary Word file even if a paragraph equals a statement title.

### Requirement 12: The Declaration of a restored record

**User Story:** As an author, I want my AI declaration to come back with my record, so that I am not asked a question I already answered, and am asked again when the text is new.

#### Acceptance Criteria

1. WHEN the Web_App restores, THE Web_App SHALL read the Declaration with `parseRecord` and SHALL install it with the Document through the Store `replace` action, with the same subject and the same Tool_Name the author gave.
2. WHEN the record carries no Declaration, THE Web_App SHALL install none.
3. WHEN the restored Declaration is not applicable to the restored Document, THE Store SHALL apply its existing rules for stored Declarations (pasted-text-declaration, Requirement 5) and SHALL keep or drop it as they say.
4. WHEN the body differs and the text comes in as pasted, THE Web_App SHALL restore no Declaration (Requirement 10 criterion 5).
5. WHEN a Declaration is restored, THE Export dialog SHALL show the stored choice selected (pasted-text-declaration, Requirement 5 criterion 2).

### Requirement 13: What the record restores and what it does not

**User Story:** As an author who reopens an export, I want to be told what did not come back, so that nothing looks recorded that is not.

#### Acceptance Criteria

1. WHEN the Web_App restores, THE Web_App SHALL set the Run_Log to empty and the Store's verification time to null, because the file carries neither the tool names of assistant runs nor the check date.
2. WHEN the Web_App restores and the Document holds at least one AI run, THE Issues_Region SHALL show an Open_Note that says the tool names were not in the file; WHEN the restored Document also holds at least one verification result or quote-check result, the same Open_Note SHALL say the check date was not in the file.
3. WHEN the Web_App restores and the restored Document holds at least one verification result or quote-check result but no AI run, THE Issues_Region SHALL show an Open_Note that says the check date was not in the file and names no tool.
4. THE Open_Note of criteria 2 and 3 SHALL read, by case: with AI runs and results, "The tool names of the assistant runs and the check date were not in this file, so the next statement cannot give them."; with AI runs only, "The tool names of the assistant runs were not in this file, so the next statement cannot name them."; with results only, "The check date was not in this file, so the next statement cannot give it."
5. WHEN the restored Document holds no AI run and no verification result, THE Web_App SHALL show no Open_Note about the record.
6. WHEN the next statement is built after a restore, THE statement SHALL say that the tool is not recorded, SHALL give no check date, and SHALL print no sentence about prompt records or the run log, because the empty Run_Log gives a run count of 0; THE statement SHALL print nothing that the Run_Log and the verification time cannot support.
7. WHEN the Web_App restores, THE Web_App SHALL select no court or judge, and SHALL leave the confidentiality tick unticked, because the record carries neither; THE author picks the court again.
8. THE Web_App SHALL keep the recorded span timestamps and override timestamps exactly as the record gives them.
9. THE design SHALL state, for each item the record does not carry, what the Store holds after a restore and what the next statement prints for it, and SHALL confirm that the Store and `buildStatement` accept a Document with AI spans and an empty Run_Log.
10. THE rule that a reopened export produces the same statement it was exported with SHALL NOT be a requirement of this spec; THE design SHALL record it under "Deferred".

### Requirement 14: Refusals

**User Story:** As an author who chooses a file that cannot be used, I want a plain reason and a next step, so that I am not left guessing.

#### Acceptance Criteria

1. IF the Opened_File is a Word_File that is not a zip archive, has no `word/document.xml`, or cannot be unpacked, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> is not a Word document, or it is damaged. Save it again as .docx from Word, or choose another file."
2. IF the Opened_File is a Word_File that begins with the compound-file signature and holds an encrypted package, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> is password-protected, so it cannot be read. Remove the password in Word, save a copy, and open the copy."
3. IF the Opened_File is larger than the Size_Limit, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> is larger than 5 MB. Open a smaller file, or paste the text into the page." before reading its bytes.
4. IF the text read from the Opened_File, or the Recorded_Text of a restored record, is longer than the Character_Limit, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> holds more than 200,000 characters, which is more than this page can check. Split the filing and open one part."
5. IF the text read from the Opened_File has no character, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> is empty. Choose a file that has text in it." A text whose characters are all whitespace counts as empty.
6. IF the Opened_File is not an Accepted_Kind, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> is not a .docx, .txt or .md file. Choose one of those."
7. IF the Opened_File is a Text_File whose bytes are not valid UTF-8, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> is not UTF-8 text. Save it as UTF-8 and open it again." A file in UTF-16 is refused with this message.
8. IF a drop carries more than one file, THEN THE Open_Flow SHALL refuse with the Open_Note "Open one file at a time. Drop a single file." The message is shown with the Open_Note of Requirement 15 and in the Toolbar message of criterion 11, which reads "Open one file at a time." with no file name.
9. IF the Opened_File carries the Appendix title and the end of the filing cannot be found, THEN THE Open_Flow SHALL refuse it with the Open_Note "<file name> has a Provenance Appendix but its filing could not be separated from it. Open the original export, or copy the filing into a new file."
10. IF the Open_Flow reads a Word_File whose part would unpack to more than the Part_Size_Limit, THEN THE Open_Flow SHALL refuse it under criterion 1 as damaged, without unpacking the part.
11. WHEN the Open_Flow refuses a file, THE Web_App SHALL leave the Document, the Store state other than the Open_Note, the Declaration and the stored draft unchanged, and SHALL show a Toolbar message that names the refusal in the words "Could not open <file name>."
12. WHEN the Open_Flow checks an Opened_File, THE Open_Flow SHALL apply the refusals in this order: Accepted_Kind, Size_Limit, unreadable or encrypted, part size, then the text limits; the first that holds decides the message.
13. THE Open_Flow SHALL contain no `try`/`catch` that discards an error: each failure SHALL become one of the messages above, and an unexpected failure SHALL become the criterion 1 message for a Word_File and the Toolbar message of criterion 11 for any file.

### Requirement 15: The Open_Note in the Issues region

**User Story:** As an author, I want the reason for a refusal or a changed export in the same place as the other problems, so that I do not lose it when the Toolbar message changes.

#### Acceptance Criteria

1. THE Issues_Region SHALL show the Open_Note as text, above the Issues list and below the Draft_Gate notice, in the existing region style, with no icon, no toast and no colour as the only signal (ui.md "Copy").
2. WHEN the Open_Flow refuses a file, imports a changed export, or restores a file for which Requirement 13 criterion 2 or 3 gives a note, THE Web_App SHALL store one Open_Note and SHALL show it until the next Open_Flow run, New, Load demo motion, Load the Avianca citations, or the start of a Verify run.
3. WHEN the Open_Flow starts, THE Web_App SHALL clear the previous Open_Note.
4. WHEN the Open_Flow installs a Document with no note to show, THE Web_App SHALL show no Open_Note.
5. THE Open_Note SHALL be in the accessibility tree as text of a region with a live status, so that a screen reader announces it once.
6. THE Web_App SHALL not persist the Open_Note, so that a reload shows none.

### Requirement 16: The empty page

**User Story:** As a first-time visitor, I want the empty page to tell me I can open a file, so that I see the second door without searching the Toolbar.

#### Acceptance Criteria

1. WHILE the Empty_Page is shown, THE Web_App SHALL show the placeholder "Type or paste your filing here, or open a draft."
2. WHILE the Empty_Page is shown, THE Web_App SHALL show under the placeholder three plain links, in this order: "Open a draft", "Load demo motion", "Load the Avianca citations".
3. WHEN the author activates "Open a draft", THE Web_App SHALL open the Picker, as the Open_Button does, and SHALL navigate nowhere.
4. WHEN the author activates "Load demo motion" or "Load the Avianca citations", THE Web_App SHALL behave as before.
5. WHEN the Document has at least one character, THE Web_App SHALL show neither the placeholder nor the links.
6. THE links SHALL use the link style of ui.md "Controls" (`--oxblood`), with no icon.
7. THE old placeholder "Type or paste your filing here. Load demo motion to see a worked example." SHALL no longer appear in the Web_App.

### Requirement 17: Nothing is uploaded

**User Story:** As a self-represented filer, I want to know that opening a file does not send it anywhere, so that I can open a draft that holds private facts.

#### Acceptance Criteria

1. WHILE the Open_Flow runs, from the choice of the file to the installed Document or the refusal, THE Web_App SHALL make no network request of any kind, including no `fetch`, no `XMLHttpRequest`, no `sendBeacon` and no form post.
2. THE Web_App SHALL add no route under `apps/web/app/api` for opening a file.
3. THE README section "What leaves your machine" SHALL gain one sentence: opening a file reads it in your browser; the file is not uploaded.
4. THE README SHALL keep every existing assertion of `apps/web/test/static/docs.test.ts` true, including that the README holds no exclamation mark.
5. THE Web_App SHALL send neither the file name nor the text of an opened file to the LLM provider, to CourtListener or to any other host, except as the existing Verify and Draft flows already send citation records and the assistant prompt when the author uses them.

### Requirement 18: Properties

**User Story:** As a maintainer, I want the round trips stated as properties, so that a later change to the builder, the reader or the text rules cannot break reopening quietly.

#### Acceptance Criteria

1. THE tests SHALL contain Properties 1 to 4 in `<module>.properties.test.ts` files, each with a `// Property N` comment above one `fc.assert(fc.property(...))`, and each `describe` title ending in `_Requirements: x.y_`, run with `numRuns` of 200 locally and 500 in CI (testing.md; tech.md).
2. Property 1 (text round trip) SHALL generate lists of paragraphs, SHALL build a `.docx` with the Export_Package's paragraph builder, SHALL read it with the Docx_Reader, and SHALL assert that the text equals the paragraphs joined with `\n`.
3. Property 1 SHALL generate paragraphs that include leading and trailing spaces, tabs, quotation marks, `&`, `<`, `>`, non-ASCII characters and empty paragraphs.
4. Property 2 (record round trip) SHALL generate Documents with the existing arbitraries, including overrides and every verification status (`wrong_case` among them), SHALL generate each Applicable_Declaration for both subjects (None, and Declared_AI with Tool_Names that hold brackets, parentheses and quotation marks), SHALL export with `buildStatement` and `buildDocx`, SHALL reopen, and SHALL assert a Document equal by `structuralEqual` and the same Declaration.
5. Property 3 (changed export) SHALL generate one single-character change to the exported body paragraphs, SHALL reopen, and SHALL assert one `PST` span over the changed text, no Declaration and the Open_Note of Requirement 10 criterion 4.
6. Property 4 (DOCX-safe text) SHALL be as stated in Requirement 22 criterion 6.
7. THE shared arbitraries (paragraph lists; a body edit; the widened text of Requirement 22 criterion 7) SHALL live in `packages/engine/src/testing/arbitraries.ts` or an Export_Package equivalent used by more than one test file.
8. IF a generated Document holds a character that DOCX cannot carry, THEN THE failure SHALL be recorded in BUILD_LOG.md with the shrunk counterexample and SHALL NOT be hidden by narrowing the arbitrary (testing.md); THE fix is the one chosen in Requirement 22 (Docx_Safe_Text at every Entry_Point, with an export refusal as a backstop).
9. THE tests SHALL contain no snapshot of the Engine, no `try`/`catch` that hides an error, and no test that only imports a module.

### Requirement 19: Example tests and fixtures

**User Story:** As a maintainer, I want the exact cases pinned, so that the messages and the refusals cannot drift.

#### Acceptance Criteria

1. THE tests SHALL pin each refusal of Requirement 14: not a Word file or damaged, password-protected, larger than 5 MB, more than the Character_Limit, empty, plus criteria 6 to 9 and the oversize part of criterion 10; each asserting the message text, that the Document and the stored draft are unchanged, and that no confirm dialog opened.
2. THE tests SHALL pin a text file with a byte-order mark and Windows line endings, and a lone `\r`, reading as `\n` text with no U+FEFF.
3. THE tests SHALL pin a `.docx` with a table, a tracked deletion, a tracked insertion, two footnotes, one endnote and Word's separator notes (never numbered), asserting the exact text, the Notes_Block and the sentence of Requirement 7 criterion 7.
4. THE tests SHALL pin that the Picker and a drop reach the same function and produce the same Document for the same bytes.
5. THE tests SHALL pin confirm-before-replace: a dialog for a non-empty Document, none for an empty one, Cancel leaves everything unchanged, and Confirm replaces it.
6. THE tests SHALL pin the three Toolbar messages: "Opened <file name>: <n> characters, marked as pasted.", "Reopened <file name> with its provenance record (exported <date>).", and the changed-export Open_Message of Requirement 10 criterion 3.
7. THE tests SHALL pin the Open_Note of a changed export in the Issues region, and that it is cleared by New.
8. THE tests SHALL pin that the statement and appendix paragraphs of an export are in no installed text, for a restore and for a body-only import, including a body that holds a line equal to a statement title.
9. THE tests SHALL pin that opening clears a stored Declaration, that a restore installs the recorded Declaration, and that a body-only import installs none.
10. THE tests SHALL pin the empty-page placeholder and the three links in order, the Open_Button position after New, and zero network calls during an open.
11. THE tests SHALL pin the Sentinel: every existing Sentinel test unmodified except import paths.
12. THE deterministic fixtures and the endnotes helper SHALL be built as part of this spec. THE fixtures SHALL be built by a helper in the Export_Package tests, with the `docx` library for paragraphs, tables, tracked changes and footnotes, and a deterministic post-processing step with the zip library that adds `word/endnotes.xml` with its content-type and relationship entries (the `docx` library writes no endnotes); the helper SHALL fix every date and zip timestamp so that the bytes are the same on every run.
13. THE fixtures SHALL include a password-protected stand-in (a compound-file header with an `EncryptedPackage` stream name), a truncated zip, a zip without `word/document.xml`, and an export whose body was edited by one character.
14. WHERE the author supplies a file saved by Word, THE repository MAY commit it under the package's `fixtures/` with a `README` line giving its source and date (tech.md: fixtures are committed). The file is out of scope for this spec: it gets its own example test in a follow-up spec or task, and this spec only notes it.
15. THE tests SHALL pin Requirement 22: Docx_Safe_Text at each Entry_Point; the Open_Message with the count of removed characters, for 1 and for more than 1, and none when nothing was removed; and the export refusal for a stored draft that holds a Docx_Unsafe_Character, with nothing downloaded.
16. THE tests SHALL pin the Open_Note of each case of Requirement 13 criterion 4 and the absence of a note for criterion 5, and that the statement built after a restore prints no sentence about prompt records.

### Requirement 20: Documentation

**User Story:** As a reader of the repository, I want the documents to describe Open, so that the product is described as it behaves.

#### Acceptance Criteria

1. THE README "What it does" section SHALL gain one line that says a draft can be opened from a `.docx`, `.txt` or `.md` file and that an exported `.docx` reopens with its record.
2. THE README "Demo path" SHALL gain one line that names Open as the other way in beside Load demo motion.
3. THE README "What leaves your machine" section SHALL gain the sentence of Requirement 17 criterion 3.
4. THE docs/KIRO_USAGE.md SHALL gain a row for this spec, listing `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`, so that the inventory test and `pnpm kiro:check` pass, and a row for each steering file this spec edits.
5. THE BUILD_LOG.md SHALL gain a dated entry that records the decision to share one reader, the decision to defer the record additions, the DOCX-safe text fix, and what Kiro got wrong in the requirements pass or "No Kiro errors".
6. THE `.kiro/steering/ui.md` SHALL describe the Open button after New in "Layout", the empty-page placeholder and three links in "Copy", and the Open_Note in the Issues region.
7. THE `.kiro/steering/structure.md` SHALL describe the shared reader modules, `readWordDraft` and the DOCX-safe text function in `packages/export` and the Open_Flow modules in `apps/web/src`, and SHALL list `crew/sentinel` as an importer of them.
8. THE `.kiro/steering/tech.md` SHALL keep its Stack section true: if the zip library becomes a runtime dependency of the Export_Package, the line about the export package says so.
9. THE docs SHALL use the words "opened", "reopened", "record", "pasted" and "changed after it was exported" consistently, and SHALL not use "detected" or "inferred" about authorship.

### Requirement 21: Process and limits

**User Story:** As the owner of the repository, I want the spec committed before code and the checks run before anything is called done, so that the history shows the order of work.

#### Acceptance Criteria

1. THE spec files SHALL be committed, in a commit titled `spec(open-draft): …`, before any implementation task starts.
2. THE work SHALL follow this order: requirements, one numbered question message to the author, design, tasks.
3. THE final checkpoint SHALL run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build `pnpm --filter @reveal-codes/web build`, and `pnpm kiro:check`, and SHALL record each result.
4. THE work SHALL NOT push to any remote.
5. THE feature SHALL keep `packages/engine` free of runtime dependencies and free of `node:` and DOM imports, SHALL keep every function under 40 lines and every module under 300 lines, SHALL add no `any`, and SHALL use named exports only.
6. THE feature SHALL leave the Engine Document, the Reveal_Codes_Form and the code list unchanged, so that no steering edit to product.md precedes the code and no code is added, renamed or restyled.
7. THE Web_App SHALL follow ui.md: text labels only, no icon, no animation, no toast, and a colour written only as `var(--token)`.
8. THE constant `MAX_TEXT_CHARS` SHALL move out of `apps/web/src/server` to `apps/web/src/limits.ts`, SHALL have one definition, and SHALL be imported from there by the verify route and the Open_Flow; THE boundary test (`apps/web/test/static/boundaries.test.ts`) SHALL be run to prove that the new location is accepted for both importers.

### Requirement 22: Text that Word files can carry

**User Story:** As an author, I want text that Word files cannot store to be dealt with when it comes in, so that an export never silently differs from what I see.

#### Acceptance Criteria

1. THE Export_Package SHALL provide one pure function that returns Docx_Safe_Text: it SHALL turn U+000B and U+000C into `\n`, and SHALL remove every other Docx_Unsafe_Character, including U+FFFE, U+FFFF, an unpaired surrogate and every C0 control other than tab, LF and CR; a lone `\r` SHALL be normalised to `\n` as Requirement 5 criterion 3 specifies.
2. THE function SHALL be idempotent and SHALL return its input unchanged when the input holds no Docx_Unsafe_Character and no lone `\r`.
3. THE Web_App SHALL apply the function at every Entry_Point: paste, drop, a loaded sample (the demo motion and the Avianca citations), text inserted by the assistant, and Open (Text_File, Plain_Reading and the body-only import), before the text limits of Requirement 14 criteria 4 and 5 are applied.
4. WHEN the Web_App restores, THE Web_App SHALL apply no change to the Document that `parseRecord` returned.
5. WHEN the Open_Flow installs text and the function removed k characters, with k at least 1, THE Open_Message SHALL carry, after the sentence of Requirement 8 criterion 3, the sentence " <k> characters that Word files cannot store were removed.", or " 1 character that Word files cannot store was removed." when k is 1; `<k>` is a decimal integer with no separator. A U+000B or U+000C turned into a line break is not counted. WHEN no character was removed, THE Open_Message SHALL carry no such sentence.
6. Property 4: FOR ALL strings, including any sequence of UTF-16 code units, THE function SHALL return a string with no Docx_Unsafe_Character, SHALL satisfy `f(f(s)) = f(s)`, and SHALL return `s` when `s` holds none; AND FOR ALL Documents whose text has passed through the function, exporting and reopening SHALL return a Document equal to the original by `structuralEqual`.
7. THE Property 4 test SHALL draw its text from a widened arbitrary (a new `arbDocxHostileText` that includes U+0000 to U+001F, U+FFFE, U+FFFF and unpaired surrogates); THE existing arbitrary SHALL NOT be narrowed or changed, and Properties 1 to 3 SHALL keep using the existing arbitraries.
8. IF a stored draft already holds a Docx_Unsafe_Character in the Document text or in an override reason, THEN THE export SHALL refuse with the plain message "This draft holds a character that Word files cannot store, so it was not exported. Paste the text again or remove the character.", SHALL download nothing, and SHALL leave the Document unchanged.

## Resolved decisions

1. The shared reader is one implementation, in a module both the Sentinel and the Web_App import. Its location is proposed in the design; the Export_Package is the likely home.
2. Open is a Toolbar button after New, a link on the empty page, and a drop on the page. All three call one function.
3. A text file or an ordinary Word file becomes one `PST` span and clears the Declaration. Only a matching record restores spans, results, overrides and the Declaration.
4. A changed export imports its body only, as `PST`, with the reason in the Issues region.
5. Statement and appendix pages are never body text.
6. Nothing is uploaded; there is no server route.
7. Reopening restores an empty run log and no check date, and the Issues note says the tool names and the check date were not in the file. The record additions (tool names, check date) are cut from this spec and deferred. Court, judge and the confidentiality tick are not restored.
8. Open messages go to the Toolbar notice. Tables read flat. Notes are numbered 1..N, footnotes then endnotes, separators skipped. A file over 5 242 880 bytes, or a part over 32 MiB unpacked, is refused. Only `.docx`, `.txt` and `.md` open; UTF-16 and non-UTF-8 text are refused; whitespace-only text is empty. Several dropped files are refused. An unparseable appendix is a changed export; an appendix with no findable filing end is a refusal.
9. Text is made safe for Word files at every Entry_Point; characters that cannot be stored are removed and counted on Open; a stored draft that still holds one blocks export with a plain message. The existing arbitrary is not narrowed.
10. `MAX_TEXT_CHARS` lives in `apps/web/src/limits.ts`; `readWordDraft` lives in `packages/export`; a note with empty text takes no number.
