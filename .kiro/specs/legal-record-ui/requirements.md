# Requirements Document

## Introduction

This feature is a visual redesign of `apps/web` to fixed values: one token set, three self-hosted type families, square controls, and new looks for the toolbar, the sheet, the Issues region, the Pane, the dialogs, the assistant and the small-screen page. It also rewrites `.kiro/steering/ui.md`, updates the pane palette in `.kiro/steering/product.md`, and updates the static scans.

The redesign changes the look only. No layout region moves, no wording changes except where a requirement below states the change, and no behaviour changes. The text of the Document is never styled. The Engine, the Verifier, the Export_Package, the MCP server, the server routes and the Sentinel are not changed. The printed filing (the `/print` view) and the exported DOCX are unchanged.

Request limits on the public endpoints, the size cap on `/api/verify`, the optional links on the small-screen page and the Sentinel title fix are not part of this spec. They are specified and built separately afterwards. The small-screen page keeps no link, as first-run-and-flow Requirement 10, criterion 6 says.

The user's ten decisions are carried as Requirements 1 to 10, in the order of the request:

| Decision | Subject | Requirement |
| -------- | ------- | ----------- |
| 1 | Tokens | 1 |
| 2 | Type | 2 |
| 3 | Controls | 3 |
| 4 | Toolbar | 4 |
| 5 | The sheet and line numbers | 5 |
| 6 | Issues region | 6 |
| 7 | The Pane and the status bar | 7 |
| 8 | Dialogs | 8 |
| 9 | Assistant and small-screen page | 9 |
| 10 | Steering and scans | 10 |

Requirements 11 to 13 cover the contrast record, the scope fence, and documents and task shape. Property 1 (tokens are total) is the only property of this spec and is stated in Requirement 10.

### Precedence over earlier requirements

Where a value in this spec conflicts with `first-run-and-flow` or `shell-polish`, the value in this spec wins on look, and the earlier spec wins on behaviour. Each conflict is listed here. An earlier requirement that is not listed stays as it was. The earlier tests that assert an old value are updated in the same tasks as the change (Requirement 13).

**first-run-and-flow (FRF)**

- FRF Requirement 2, criterion 2 (Pane_Header `#0000AA` on `#AAAAAA`, 12px): look. This spec wins; the header is drawn as Requirement 7 says. FRF criteria 1, 3, 6, 8, 9 and 10 (position, text "Reveal Codes", real text in the accessibility tree, stays at the top, click leaves the selection, absent while closed) stay.
- FRF Requirement 2, criterion 4 (Legend entries joined by ` · `): this is a wording point, and the user's decision 7 removes it on purpose. This spec wins on this point only. The Legend keeps its seven entries, their codes and their words, with no separator characters; the 20px gap between items is the only separation.
- FRF Requirement 2, criterion 5 (Legend codes drawn exactly as the Pane_Body draws them): FRF wins on which style class each Legend code uses. This spec wins on how that style looks, with one difference it states: the failing Legend entries use a 1px ring where the body uses 2px.
- FRF Requirement 3, criteria 1 and 2 (failing `#FFFFFF` on `#AA0000` with no outline; every other code with a 1px `#AAAAAA` outline): look. This spec wins. Failing codes are one block, white on `#A8001C` with a `#FF8A8A` ring; other codes are coloured text with no outline box.
- FRF Requirement 3, criterion 7 (contrast of at least 7:1 for the failing pair, with the measured ratio recorded in the design): FRF wins and the criterion carries over to the new pair (Requirement 11). FRF Requirement 3, criteria 3, 4, 6 and 8 (closer pairing, accessible names, the concatenated text of the Pane_Items equals the display rendering) stay.
- FRF Requirement 4, criteria 7, 9, 10 and 12 (primary button `#111111` on `#FFFFFF`; hover turns to `#FFFFFF`; disabled primary uses `#B0B0B0`; the primary style uses only `var(--ink)` and `var(--paper)`): look. This spec wins; Requirement 3 gives the primary, hover and disabled styles. FRF criteria 1 to 6, 8, 11 and 13 (the Next_Step rule, one `data-primary` on the Toolbar, none while Verify runs) stay.
- FRF Requirement 4, criterion 7, last clause (the primary button has the same padding, font size and height as every other Toolbar button): FRF wins; the primary button is 30px high like the others.
- FRF Requirement 9, criteria 1 and 2 (Export dialog `min(560px, 100vw - 32px)`; Override and confirm dialogs keep their width): look. This spec wins; every dialog is `min(600px, 100vw - 32px)` (Requirement 8).
- FRF Requirement 9, criterion 4 (the blocking line reads `<n> blocking items remain` or `1 blocking item remains`): FRF wins on the words. This spec adds a fail chip with the character ✘ in front of the words. The words and their count do not change.
- FRF Requirement 8, criterion 1 and FRF Requirement 5 (where the Override text and the Verify_Summary appear): FRF wins on position and wording. This spec changes only their type and colour.
- FRF Requirement 6 (the Unchecked_Row, its text and its Verify button): FRF wins on the text, the order and the handler. This spec changes only the row's look (Requirement 6).
- FRF Requirement 10, criterion 5 (wordmark 15px bold in the editor family; three sentences): the wording of the three sentences is behaviour and stays. The wordmark and sentence type is look and this spec wins (Requirement 9).
- FRF Requirement 10, criterion 6 (paper `#FFFFFF`, ink `#111111`, "no image, no icon, no button and no link"): look for the colours; this spec wins. The "no link" clause is behaviour and stays: the small-screen page has no link, no image, no icon and no button.
- FRF Requirement 11, criterion 1 (page marks as a dotted underline in ink `#111111`): look. This spec wins; the dotted underline is in the fail colour (Requirement 5). FRF criteria 2 to 7 stay.
- FRF Requirement 12, criteria 2, 3, 11 and 12 and FRF Requirement 13, criteria 1 and 5 (tests for the old header colours, the old Legend string, the old failing pair, the `#AAAAAA`/`#AA0000` scan, the primary-rule scan, and the old `ui.md` and `product.md` text): superseded by Requirement 10 and Requirement 7. The scans and the steering files are rewritten.
- FRF Requirement 14, criteria 2 and 3 (add no dependency; add no colour outside the Pane): these bound the FRF change only. This spec adds three font packages (Requirement 2), and the Tokens of Requirement 1 are its colours.

**shell-polish (SP)**

- SP Requirement 1, criterion 2 (Wordmark: editor family, weight 700, 15px, ink): look. This spec wins (Requirement 4). The wordmark text stays "Reveal Codes"; capitals come from the style, not from the text. SP criteria 1, 3 and 4 stay, and the single 1px rule after the wordmark keeps its place.
- SP Requirement 2, criterion 9 (Toolbar height 32px): look. This spec wins; the Toolbar is 52px. SP criteria 1 to 8 (group order, group rules, label, notice truncation) stay.
- SP Requirement 4, criterion 4 (Status_Line 22px, top rule, `var(--ui-bg)`, 12px, pane family): look. This spec wins; it is the status bar of Requirement 7: 26px, `#0A1C4F`. SP criteria 1 to 3 and 5 to 10 stay.
- SP Requirement 5 (the Pane_Status_Line text and Mode_Text): behaviour stays; only the look changes (Requirement 7).
- SP Requirement 6, criteria 3, 5, 7 and 8 (Page padding 1in; border; `var(--ui-bg)` column; line height 1.5, 12pt, Georgia): look. This spec wins (Requirement 5). SP criteria 1 and 2 (8.5in wide, shrinking to 100% of the column when narrower) stay, and 8.5in is 816px. SP criteria 4 and 6 (11in minimum height, 24px margin) stay.
- SP Requirement 7, criterion 2 (the Placeholder starts where the first typed character appears): behaviour stays; its offsets follow the new padding. Its colour (`var(--rule)`) is look; this spec wins (muted italic).
- SP Requirement 8, criterion 5 (the Issues_Region has the same background as the Editor_Column): look. This spec wins; the region uses the panel colour and the column uses the desk colour. SP criteria 1 to 4 (heading text and 1px bottom rule) stay.
- SP Requirement 9, criterion 5 (Assistant panel heading in bold with a 1px bottom rule): look. This spec wins on the heading type (regular, 20px/26px). The 1px bottom rule stays. SP criteria 1 to 4, 6 and 7 stay.
- SP Requirement 12, criteria 1 to 3 (Dialog_Title bold 13px, 1px rule, padding 12px): look. This spec wins (Requirement 8). SP criterion 4 (one shared `Modal` component) stays. SP criterion 6 (dialogs unchanged apart from the title) is amended only by the changes Requirement 8 states: the Override button order, the ✘ chip, and the real quotation marks.
- SP Requirement 13, criteria 3, 6 and 7 (the `ui.md` type list; the Css_Scan accepts 12px and 15px): superseded by Requirement 10.
- SP Requirement 11 (the favicon is `#FFFFFF` and `#111111`): not changed. The favicon is outside the token scan (Requirement 1, criterion 7).
- SP Requirement 15, criterion 3 (the README screenshot placeholder is byte-identical): stays; the README edit of Requirement 13 leaves it untouched.

**Other earlier specs**

- editor-app Requirement 12, criteria 2, 4 and 6 and Requirement 13, criterion 1 (Pane colours, font size 14px, the CGA palette, the cursor block `#AAAAAA`): look. This spec wins (Requirement 7).
- The sixteen-colour CGA palette in `product.md` "Pane palette" is replaced by the table of Requirement 7. Principle 7 of `product.md` is not edited.

## Glossary

- **Web_App**: `apps/web`; the system under specification.
- **Token**: a CSS custom property defined in `:root` of `apps/web/app/globals.css` in Requirement 1.
- **Token_Sheet**: the `:root` block of `globals.css` that defines the Tokens.
- **Pane_Files**: the files under `apps/web/src/pane/`, including the stylesheet of the status bar that Requirement 7 places there.
- **Pane_Colours**: the colours that Requirement 1, criterion 4 and Requirement 7 list for the Pane.
- **Toolbar**: the toolbar component (`role="toolbar"`) of the Web_App.
- **Sheet**: the paper page inside the Editor_Column; the element `.page` of `editor-surface.module.css`.
- **Desk**: the Editor_Column background behind the Sheet.
- **Editor**: the TipTap editor in the Sheet. Its schema is doc, paragraph, text; one paragraph holds one line of the Document.
- **Document**: the Engine `Document` held in the Store. Its text is `document.text`.
- **Line_Number**: the 1-based number of a line of the Document text, that is, 1 plus the number of `"\n"` before the line. It is the number that `lnPos` shows after `Ln` in the Status_Line and the Pane status bar, and the number that the Sentinel's report calls `Line`.
- **Issues_Region**: the right-hand region with the heading "Issues".
- **Issue_Row**: one row of the Issues list for an entry of `issues(document)`.
- **Unchecked_Row**: the collapsed row of first-run-and-flow Requirement 6.
- **Code_Chip**: the box in line (a) of an Issue_Row that holds the code, for example `CIT ✘`.
- **Fail_Chip**: a Code_Chip, or a chip in the Export dialog, drawn white on the fail Token.
- **Small_Label**: text at 10.5px, weight 700, uppercase, letter spacing 0.1em, in Public Sans.
- **Pane**: the Reveal Codes pane in Pane_Files.
- **Pane_Header**, **Legend**, **Pane_Body**: as first-run-and-flow defines them.
- **Failing_Code**: as first-run-and-flow defines it: an opening code `[CIT ✘]`, `[CIT ?]` or `[QUO ✘]`, or the closing code that closes one of them.
- **Failing_Block**: one run of the Pane that starts at the opening code of a Failing_Code, continues through the text it covers, and ends after its closing code.
- **Status_Bar**: the 26px bar at the bottom of the Pane, and the Status_Line under the editor while the Pane is closed; Requirement 7 styles both.
- **Print_Tokens**: the Tokens `--print-paper`, `--print-ink`, `--print-rule`, which hold the colours that the print view used before this spec (`#FFFFFF`, `#111111`, `#B0B0B0`).
- **Dialog**: a modal dialog rendered by the shared `Modal` component: Export, Override and New document.
- **Small_Screen_Page**: the page that replaces the Shell below 800px.
- **Css_Scan**: the static test `apps/web/test/static/css-rules.test.ts`.
- **Contrast_Ratio**: the WCAG relative-luminance contrast ratio of two colours.

## Requirements

### Requirement 1: Tokens (decision 1)

**User Story:** As the maintainer, I want one set of colour variables used everywhere, so that the colours of the app are defined in one place.

#### Acceptance Criteria

1. THE Token_Sheet SHALL define these Tokens with these values: `--paper` `#FFFDF8` (the Sheet and dialogs); `--desk` `#E9E3D6` (behind the Sheet); `--panel` `#FBF8F1` (Toolbar, Issues_Region, assistant); `--ink` `#1B1915` (text, button borders, heavy rules); `--muted` `#5E574C` (secondary text); `--rule` `#CFC6B4` (hairlines); `--oxblood` `#6B1A24` (primary button, links, focus, status labels); `--fail` `#A8001C` (failing code blocks and chips); `--fail-ring` `#FF8A8A` (outline round failing codes in the Pane).
2. THE Token_Sheet SHALL define these Tokens for values that the decisions name in prose: `--rule-light` `#DDD4C2` (the lighter row dividers and the single margin rule on the Sheet); `--margin-rule` `#B5A98F` (the double margin rule); `--disabled-border` `#8C8475`; `--disabled-fill` `#F1ECE1`; `--white` `#FFFFFF` (text on oxblood and on fail, and the fill of selects); `--overlay` `rgba(27, 25, 21, 0.55)`.
3. THE Token_Sheet SHALL define the Print_Tokens `--print-paper` `#FFFFFF`, `--print-ink` `#111111` and `--print-rule` `#B0B0B0`, and the print view SHALL use them in place of `--paper`, `--ink` and `--rule`, so that the printed colours do not change.
4. THE Pane_Files SHALL hold the Pane_Colours as written values: pane body `#0F2766`; pane hairline `#2E4A8F`; status bar `#0A1C4F`; pane text `#E8ECF6`; pane label `#BAC4E2`; status bar text `#C9D2EC`; and the code colours typed `#E8ECF6`, pasted `#F5D98B`, assistant `#A6D4F7`, assistant-edited `#D7C6F5`, found `#9ADBB0`.
5. THE Web_App SHALL use a colour only through `var(--token)` outside the Pane_Files and outside the Token_Sheet, and SHALL hold no colour literal (hex, `rgb`, `rgba`, `hsl`, other colour function, or named colour) in any other stylesheet.
6. THE Token_Sheet SHALL hold no Token for a colour that the user's decisions do not name, apart from the Tokens of criteria 1 to 3.
7. THE favicon `apps/web/app/icon.svg` SHALL stay as it is and SHALL be outside criteria 5 and 6.

### Requirement 2: Type (decision 2)

**User Story:** As a reader of the filing, I want a consistent, self-hosted type system, so that the app looks like one document and makes no request to a third party.

#### Acceptance Criteria

1. THE Web_App SHALL use three families: Public Sans for controls and labels, Libre Caslon Text for headings, the wordmark, the Sheet and page text, and IBM Plex Mono for the Pane and the Status_Bar.
2. THE Web_App SHALL load the three families from npm packages (`@fontsource/public-sans`, `@fontsource/libre-caslon-text`, `@fontsource/ibm-plex-mono`) pinned to exact versions, and SHALL serve the font files from its own origin.
3. WHEN the Web_App runs, THE Web_App SHALL make no request to a third-party host for a font.
4. THE Web_App SHALL load only these files: Public Sans weights 500, 600 and 700; Libre Caslon Text weight 400 in roman and in italic; IBM Plex Mono weights 400, 600 and 700; each in the Latin subset only.
5. THE Web_App SHALL give each family a system fallback stack: Public Sans, then `-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`; Libre Caslon Text, then `Georgia, "Times New Roman", serif`; IBM Plex Mono, then `ui-monospace, Menlo, Consolas, monospace`.
6. THE Web_App SHALL set controls and labels in Public Sans at 13px, weight 500, line height 16px.
7. THE Web_App SHALL set every Small_Label in Public Sans at 10.5px, weight 700, uppercase, with letter spacing 0.1em.
8. THE Web_App SHALL set region headings (the Issues heading and the Assistant heading) in Libre Caslon Text at 20px with line height 26px and weight 400.
9. THE Web_App SHALL set Dialog titles in Libre Caslon Text at 26px with line height 32px.
10. THE Web_App SHALL set page text in Libre Caslon Text at 14px with line height 22px.
11. THE Web_App SHALL set the Pane body in IBM Plex Mono at 13.5px with line height 20px, codes in weight 600 and Failing_Codes in weight 700, and the Status_Bar in IBM Plex Mono at 12px.
12. THE print view SHALL keep the fonts, sizes and line height it used before this spec (the system stacks `Georgia, "Times New Roman", serif` and `ui-monospace, Menlo, Consolas, monospace`, 12pt, line height 1.5, 13px).
13. THE Css_Scan SHALL fail when the built CSS, or any stylesheet of the Web_App, or any imported font stylesheet, contains the host `fonts.googleapis.com` or `fonts.gstatic.com`, or any `url(` or `@import` that names an `http:` or `https:` address.

### Requirement 3: Controls (decision 3)

**User Story:** As a user, I want controls that look the same everywhere and show clearly which one has focus, so that I can operate the app by sight or by keyboard.

#### Acceptance Criteria

1. THE Web_App SHALL draw buttons square, with a 1px `--ink` border, a transparent fill and `--ink` text.
2. THE Web_App SHALL give buttons a height of 30px in the Toolbar, 32px in Dialogs and 24px in Issue_Rows and in the Unchecked_Row.
3. THE Web_App SHALL draw the primary button (any button with `data-primary="true"`) with an `--oxblood` fill and border, `--white` text and weight 600.
4. WHILE a button is disabled, THE Web_App SHALL draw it with a dashed 1px `--disabled-border` border, the `--disabled-fill` fill and `--muted` text, with `cursor: not-allowed`; a disabled primary button SHALL use this style and SHALL keep its `data-primary` attribute.
5. WHILE the pointer is over an enabled button, THE Web_App SHALL change its fill to `--rule`, and the fill of the primary button to `--ink`, with no transition.
6. WHILE a focusable control has keyboard focus, THE Web_App SHALL draw a 2px `--oxblood` outline with an offset of 2px.
7. THE Web_App SHALL draw links in `--oxblood`.
8. THE Web_App SHALL draw selects 34px high, with a 1px `--ink` border, a `--white` fill and square corners.
9. THE Web_App SHALL draw text areas with a 1px `--ink` border, and with a 2px `--oxblood` border while focused, without moving the surrounding layout.
10. THE Web_App SHALL define the control rules in `app/globals.css` and in the shared `Modal` styles, and SHALL not repeat them in component stylesheets except for the heights of criterion 2.
11. THE Web_App SHALL use no border radius, shadow, gradient, transition or animation anywhere.

### Requirement 4: Toolbar (decision 4)

**User Story:** As a user, I want a toolbar that reads as the head of a legal document, so that the page has an identity.

#### Acceptance Criteria

1. THE Toolbar SHALL be 52px high, with the `--panel` background and a 3px double `--ink` bottom border.
2. THE Toolbar SHALL show the wordmark in Libre Caslon Text at 15px, uppercase, with letter spacing 0.16em, weight 400, and SHALL keep the text "Reveal Codes" in the DOM.
3. THE Toolbar SHALL draw a 1px `--rule` vertical rule to the right of the wordmark, with 24px between the wordmark and the rule and 24px between the rule and the first button group.
4. THE Toolbar SHALL keep its buttons 8px apart and SHALL keep the 1px `--rule` vertical rules between button groups as shell-polish Requirement 2 defines.
5. THE Toolbar SHALL show the transient Verify status text (the notice) to the right of the groups in `--muted` at 12.5px.
6. THE Web_App SHALL set the grid row of the Toolbar to 52px, and SHALL move no other region.

### Requirement 5: The sheet and line numbers (decision 5)

**User Story:** As a drafter, I want the page to look like a numbered pleading sheet, so that I can refer to a line by number.

#### Acceptance Criteria

1. THE Desk SHALL have the `--desk` background.
2. THE Sheet SHALL have the `--paper` background, a 1px `--rule` border, a width of 816px, and the padding 96px 96px 96px 104px (top, right, bottom, left).
3. WHILE the Editor_Column is narrower than 816px, THE Sheet SHALL take 100% of the Editor_Column, as shell-polish Requirement 6, criterion 2 says.
4. THE Sheet SHALL keep the minimum height 11in and the 24px top and bottom margin of shell-polish Requirement 6.
5. THE Sheet SHALL set its text in Libre Caslon Text at 14px with line height 22px, in `--ink`.
6. THE Sheet SHALL show a double vertical rule 74px from its left edge, made of two 1px lines in `--margin-rule` with a 2px gap between them, running the full height of the Sheet.
7. THE Sheet SHALL show a single 1px vertical rule in `--rule-light` 72px from its right edge, running the full height of the Sheet.
8. THE Editor SHALL draw one Line_Number in the left margin of the Sheet for each line of the Document, in Public Sans at 11px with line height 22px, in `--muted`, right-aligned in a 62px column that starts at the left edge of the Sheet.
9. THE Editor SHALL place the Line_Number of a line on the first visual row of that line, SHALL give a wrapped row no number, and SHALL number blank lines.
10. THE Editor SHALL draw the Line_Numbers with a CSS counter on the paragraphs of the Editor, so that no script computes or places them.
11. THE Line_Numbers SHALL be absent from the DOM text, SHALL carry an empty alternative text so that assistive technology does not read them, and SHALL not be selectable or copyable.
12. THE Line_Number of every line SHALL equal the number after `Ln` that the Status_Line shows for a caret on that line.
13. IF the Editor markup cannot carry the counter without changing how lines are represented, THEN the design SHALL stop and say so, and the Web_App SHALL not change the schema, the paragraph structure or the offset mapping to make the counter work.
14. WHILE the Document text is empty, THE Sheet SHALL show the placeholder in `--muted` italic, starting where the first typed character appears (shell-polish Requirement 7, criterion 2).
15. THE Sheet SHALL keep the dotted underline on failing citations and quotations, drawn in the `--fail` colour.
16. THE Web_App SHALL set no italic, centring, indent or paragraph margin on the Document text; the only style rules that reach the Document text are its family, size, line height and colour, the issue underline of criterion 15, and the Line_Numbers.

### Requirement 6: Issues region (decision 6)

**User Story:** As a user reading the Issues list, I want each row laid out the same way, so that I can find the code, the state and the text at a glance.

#### Acceptance Criteria

1. THE Issues_Region SHALL have the `--panel` background and a 1px `--rule` rule on its left edge.
2. THE Issues_Region SHALL set its heading in Libre Caslon Text at 20px with line height 26px.
3. THE Issues_Region SHALL set the Verify_Summary lines at 12.5px with line height 18px in `--muted`.
4. THE Issues list SHALL begin with a 3px double `--ink` rule.
5. THE Issues list SHALL give each Issue_Row a vertical padding of 10px and a bottom rule of 1px `--rule-light`.
6. THE Issue_Row SHALL show three lines: (a) the Code_Chip, with the Go and Override… buttons pushed to the right end of the same line; (b) the status words (for example `blocking, not found`) as a Small_Label in `--oxblood`; (c) the citation or quotation text in Libre Caslon Text at 13px with line height 19px.
7. THE Code_Chip SHALL be set in IBM Plex Mono at 12px, weight 700, with a 20px line height and 6px side padding.
8. WHEN the code of the Issue_Row is a Failing_Code opener (`CIT ✘`, `CIT ?` or `QUO ✘`), THE Code_Chip SHALL be a Fail_Chip, that is, `--white` text on `--fail`, whether or not the item is overridden.
9. WHEN the code of the Issue_Row is any other code, THE Code_Chip SHALL show `--ink` text inside a 1px `--ink` outline.
10. THE Unchecked_Row SHALL put its Verify button at the right end of its first line and its sentence below in Libre Caslon Text at 13px with line height 19px, and SHALL show no Code_Chip and no status words.
11. THE Issue_Row SHALL keep the "Diverges at:" and "Overridden:" lines, in the style of line (c), after line (c).
12. THE Issue_Row SHALL keep its words, its text, its order and its handlers unchanged.

### Requirement 7: The Pane and the status bar (decision 7)

**User Story:** As a user opening the codes, I want a readable pane in which failing codes stand out as blocks, so that I find what stops the export at once.

#### Acceptance Criteria

1. THE Pane SHALL have a 3px `--ink` top border, the pane body colour `#0F2766` as its background and `#E8ECF6` as its text colour, in IBM Plex Mono at 13.5px with line height 20px.
2. THE Pane_Header SHALL be 40px high, with 48px side padding and a 1px `#2E4A8F` bottom border.
3. THE Pane_Header SHALL show the title "Reveal Codes" at 13px, weight 700, white, and then the Legend at 12px with line height 18px in `#BAC4E2`, with 20px between Legend items, each item unbreakable, and with no separator character between items.
4. THE Pane_Body SHALL have the padding 18px 48px.
5. THE Pane SHALL draw codes as coloured text with weight 600 and no outline box: typed (`HUM`) `#E8ECF6`, pasted (`PST`) `#F5D98B`, assistant (`AI`) `#A6D4F7`, assistant-edited (`AI>HUM`) `#D7C6F5`, found (`CIT ✓`, `QUO ✓`) `#9ADBB0`.
6. THE Pane SHALL draw `REF` and every unchecked code (`CIT …`, `QUO …`) in `#BAC4E2`, and an override code (`OVR`) in `#F5D98B`.
7. THE Pane SHALL draw each closing code of a non-failing code at weight 600 in the colour of its opening code: the closer of a found code in `#9ADBB0`, and the closer of `REF` or of an unchecked code in `#BAC4E2`; the Pane SHALL pair each closer with its opener as first-run-and-flow Requirement 3, criterion 4 pairs closers (the most recent unclosed opener of the same kind), reading only the `positions` of `render(document, "display")`.
8. THE Pane SHALL draw each Failing_Block as one block: `--white` text on `#A8001C`, weight 700, with a 2px `#FF8A8A` outline, from the opening code through its text to the closing code.
9. WHERE a Failing_Block crosses a line break of the Document, THE Pane SHALL draw the part on each line as its own block.
10. WHERE a code or a quotation lies inside a Failing_Block, THE Pane SHALL draw it in the style of the block, so that no text inside a block is drawn in a colour that has less than 7:1 contrast with `#A8001C`.
11. THE Legend SHALL draw the two failing entries (`[CIT ✘]`, `[QUO ✘]`) with the Failing_Block style and a 1px `#FF8A8A` outline.
12. THE Pane SHALL draw the cursor block with the pane text colour `#E8ECF6` as the background and the pane body colour `#0F2766` as the text.
13. THE Status_Bar SHALL be 26px high, with the background `#0A1C4F`, text `#C9D2EC`, in IBM Plex Mono at 12px, and SHALL draw the key names `Alt-F3` and `F7` in white bold.
14. THE Status_Bar styles SHALL apply to the Pane status line while the Pane is open and to the Status_Line while the Pane is closed, and the Status_Bar stylesheet SHALL be in Pane_Files.
15. THE Pane SHALL set the grid row of the Status_Line and the Pane status line to 26px, and SHALL move no region.
16. THE Pane SHALL keep every code, offset, accessible name and text that `layoutPane` produces: FOR ALL Documents, the concatenated text of the rendered Pane items SHALL equal `render(document, "display").text`, with or without the Failing_Block grouping.
17. WHEN the user clicks inside a Failing_Block, THE Pane SHALL set the Editor selection to the offset of the item clicked, as before.
18. THE Pane SHALL draw only Pane_Colours and the `--white`, `--fail`, `--fail-ring` and `--ink` colours, and no colour of the earlier sixteen-colour palette.
19. THE `product.md` "Pane palette" section SHALL be updated to the colours of this requirement and Requirement 1, criterion 4.

### Requirement 8: Dialogs (decision 8)

**User Story:** As a user in a dialog, I want it to read as a page of the record, so that I know what is asked of me.

#### Acceptance Criteria

1. THE Dialog overlay SHALL be `--overlay`.
2. THE Dialog SHALL be `min(600px, 100vw - 32px)` wide, with the `--paper` background, a 1px `--ink` border, the padding 24px 28px and 16px between its blocks.
3. THE Dialog title SHALL be set in Libre Caslon Text at 26px with line height 32px, with a 3px double `--ink` rule under it.
4. THE Dialog field labels (Reason, Court or judge) SHALL be Small_Labels in `--muted`.
5. THE Export dialog SHALL show the quoted sentence of the order in Libre Caslon Text at 15px with line height 24px, indented 24px, between real quotation marks (U+201C and U+201D).
6. THE real quotation marks of criterion 5 SHALL appear in the Export dialog only; the function `quoted` and the print view SHALL keep the straight marks they use now.
7. WHILE the Blocking_Count is greater than zero, THE Export dialog SHALL show the blocking line as a Fail_Chip that holds the character ✘, followed by the words of the line in `--fail`, at 14px, weight 600; the words SHALL be the words of first-run-and-flow Requirement 9, criterion 4, and the ✘ SHALL be hidden from assistive technology because the words state the same thing.
8. THE Export dialog SHALL right-align its buttons with 8px between them.
9. THE Override dialog SHALL show the text being overridden in Libre Caslon Text.
10. THE Override dialog SHALL draw Save override as the primary button, and SHALL place it after Cancel, so that it is the last button.
11. THE Dialogs SHALL keep their focus, Escape, Tab trap and reason rules unchanged.

### Requirement 9: Assistant and the small-screen page (decision 9)

**User Story:** As a user of the assistant, and as a visitor on a small screen, I want these surfaces to match the rest of the app, so that nothing looks left over.

#### Acceptance Criteria

1. THE assistant strip and the assistant panel SHALL have the `--panel` background and a 1px `--rule` rule on their right edge.
2. THE assistant panel SHALL show the labels "Prompt" and "Last reply" as Small_Labels, and SHALL set the reply text in Libre Caslon Text at 13px with line height 19px.
3. THE assistant panel heading SHALL follow Requirement 2, criterion 8.
4. THE Small_Screen_Page SHALL have the `--paper` background and the padding 40px 28px.
5. THE Small_Screen_Page SHALL show the wordmark in the style of Requirement 4, criterion 2, with a 3px double `--ink` rule under it.
6. THE Small_Screen_Page SHALL show its three sentences, with their words unchanged, in Libre Caslon Text at 18px with line height 29px.
7. THE Small_Screen_Page SHALL show no link, no image, no icon and no button.

### Requirement 10: Steering and scans (decision 10)

**User Story:** As the maintainer, I want the steering and the static scans to say what the app now is, so that nothing drifts back.

#### Acceptance Criteria

1. THE `ui.md` file SHALL be rewritten to the rules of Requirements 1 to 9, and SHALL keep these rules: no component library, no icon library, text labels only, no animation, no shadows, no gradients, no rounded corners, and severity never by colour alone.
2. THE `ui.md` file SHALL describe the Tokens, the three families and their sizes, the controls, the Layout dimensions (52px Toolbar, 26px Status_Bar, 32px strip, 260px assistant panel, 300px Issues_Region, 1150px Shell minimum), and the Copy rules.
3. THE Css_Scan SHALL accept colours outside the Pane_Files only as `var(--token)` of the Token list, and SHALL accept a colour literal in the Token_Sheet only on the declaration of the Token that has that value.
4. THE Css_Scan SHALL accept in the Pane_Files only the colours of Requirement 1, criterion 4, Requirement 7, and the `--ink`, `--white`, `--fail` and `--fail-ring` Tokens.
5. THE Css_Scan SHALL accept the font families `var(--font-ui)`, `var(--font-editor)` and `var(--font-pane)` for the three families of Requirement 2, with the stacks of Requirement 2, criterion 5, and the print stacks of Requirement 2, criterion 12 under their own variable names.
6. THE Css_Scan SHALL accept the font sizes 10.5px, 11px, 12px, 12.5px, 13px, 13.5px, 14px, 15px, 18px, 20px and 26px, `inherit`, the `var(...)` forms of the same sizes, and the 12pt of the print view; any other size SHALL be reported with path and line.
7. THE Css_Scan SHALL accept the font weights 400, 500, 600 and 700.
8. THE Css_Scan SHALL keep reporting a border radius, a shadow, a gradient, a transition, an animation, `@keyframes`, `prefers-color-scheme` and a removed outline.
9. THE Css_Scan SHALL check the control rules of Requirement 3 that a scan can check: the focus outline, the button border, the disabled style, the primary style defined once in `globals.css`, and the hover rule with no transition.
10. THE Css_Scan SHALL keep the Shell width rules of first-run-and-flow Requirement 10 (one width media query, the 799px hide rule).
11. THE Css_Scan SHALL check that the Dialog width rule `width: min(600px, 100vw - 32px)` is defined in `modal.module.css` and in no other stylesheet.
12. THE `#AAAAAA`/`#AA0000` scan of first-run-and-flow Requirement 12, criterion 11 SHALL be replaced by criteria 3 and 4.
13. THE Web_App SHALL have one property test, Property 1 (tokens are total): FOR ALL generated lists of stylesheet files of the Web_App (drawn from the real list of `.css` files under `apps/web/app` and `apps/web/src`), every colour literal in the files outside the Pane_Files SHALL be on the declaration of the Token that has that value in the Token_Sheet or SHALL be absent, and every colour in the Pane_Files SHALL be one of the colours of criterion 4. The property SHALL be written as a static scan with generated file lists, SHALL carry the comment `// Property 1` and a `describe` title that ends with `_Requirements: 1.5, 1.6, 10.3, 10.4_`, `numRuns` of at least 200 locally and 500 when `CI` is set, and SHALL be accompanied by planted-violation examples that show the scan reports a stray hex colour, a stray `rgba`, a named colour and a Pane colour outside the list.

### Requirement 11: Contrast record

**User Story:** As a user with low vision, I want every text colour to have enough contrast with its background, so that I can read the app.

#### Acceptance Criteria

1. THE design SHALL record the measured Contrast_Ratio of every text colour and every code colour against the background it is drawn on, with two decimals.
2. THE Contrast_Ratio of every text and code colour with its background SHALL be at least 4.5:1.
3. THE Contrast_Ratio of every Failing_Code text with its background SHALL be at least 7:1 (`--white` on `--fail`).
4. THE Web_App tests SHALL compute the ratios of criteria 2 and 3 with the WCAG formula from the colours in the Token_Sheet and the Pane stylesheet, and SHALL fail when a pair falls below its threshold.
5. IF a pair stated in the request has a measured ratio that differs from the figure the request gives, THEN the design SHALL record the measured figure.

### Requirement 12: Scope fence

**User Story:** As the maintainer, I want the redesign to change the look and nothing else, so that it can be reviewed by eye.

#### Acceptance Criteria

1. THE Web_App SHALL move no layout region: the grid areas, the order of regions and the columns stay as they are, and only the heights and widths that Requirements 4, 5 and 7 state change.
2. THE Web_App SHALL change no wording, except the changes that Requirements 7 and 8 state (the Legend without separators, the ✘ chip, the real quotation marks in the Export dialog).
3. THE Web_App SHALL change no behaviour.
4. THE Web_App SHALL not style the Document text with italics, centring or indents.
5. THE change SHALL modify no file under `packages/engine`, `packages/verifier`, `packages/export`, `packages/courtlistener-mcp` or `crew/sentinel`.
6. THE change SHALL modify no file under `apps/web/app/api` or `apps/web/src/server`, and SHALL not edit `.env.example`.
7. THE printed filing and the exported DOCX SHALL be unchanged: the `/print` page SHALL keep its fonts, sizes and colours (Requirement 1, criterion 3; Requirement 2, criterion 12), and no file of `packages/export` changes.
8. THE change SHALL add only these dependencies: `@fontsource/public-sans`, `@fontsource/libre-caslon-text` and `@fontsource/ibm-plex-mono`, each at an exact version, in `apps/web/package.json`, with the lockfile updated to match.

### Requirement 13: Documents, commits and task shape

**User Story:** As the maintainer, I want the record and the history to match the change, so that the submission reads cleanly.

#### Acceptance Criteria

1. THE spec files SHALL be committed with a first line that matches `spec(legal-record-ui): <subject>`, where `<subject>` is non-empty and the whole first line is at most 72 characters, before any task runs.
2. THE task list SHALL be arranged in five groups in this order: (1) fonts, Tokens, controls and `ui.md`; (2) the Toolbar, the Sheet with line numbers, and the Issues region; (3) the Pane, the Status_Bar and `product.md`; (4) the Dialogs, the assistant, and the Small_Screen_Page; (5) the static scans and Property 1, the README where it describes the look, the `docs/KIRO_USAGE.md` rows, the `BUILD_LOG.md` entry, and the final checkpoint.
3. THE task list SHALL end with exactly one checkpoint task, positioned last, that runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:pbt`, the clean-checkout web build (`pnpm --filter @reveal-codes/web build`), and `pnpm kiro:check`, and requires each to exit with code 0.
4. THE checkpoint task SHALL not push, because the user walks the app in a browser first.
5. THE task list SHALL have no checkpoint task other than the last task.
6. THE `README.md` SHALL be updated where it describes the look, and SHALL leave the screenshot placeholder byte-identical.
7. THE `docs/KIRO_USAGE.md` file SHALL gain one row for this spec (with its `.config.kiro`, requirements, design, tasks and `tasks.meta.json` paths) and one row each for the `ui.md` and `product.md` edits.
8. THE `BUILD_LOG.md` file SHALL gain one new dated entry that states what the app looked like before and after, what Kiro got wrong and how it was fixed or "No Kiro errors", and that records any requirement that was found unbuildable; existing entries SHALL stay unmodified.
9. THE tests SHALL use no `vi.mock` of the Engine or the Verifier, and SHALL contain no `try/catch` that swallows an error.
10. WHEN the Web_App tests assert an old value that this spec changes, THE same task SHALL update them, and `pnpm test` SHALL exit with code 0.

## Known limitations

Standing rule carried over from the earlier specs: anything that affects only a rare case is recorded here as one line, with no spec change and no stop.

- L1. Line_Numbers are drawn with a CSS counter and are therefore not present in the DOM text, in a copy, or in a screen reader's reading, by design.
- L2. The Plex Mono Latin subset has no glyph for ✓ and ✘; the browser draws them from the fallback stack, so their weight and width can differ slightly from the surrounding code text.
