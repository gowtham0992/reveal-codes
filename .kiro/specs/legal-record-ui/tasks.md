# Implementation Plan: legal-record-ui

## Overview

The plan changes the look of `apps/web` in five groups, in the order of Requirement 13, criterion 2: (1) fonts, Tokens, controls and `ui.md`; (2) the Toolbar, the Sheet with line numbers, and the Issues region; (3) the Pane, the Status_Bar and `product.md`; (4) the Dialogs, the assistant and the Small_Screen_Page; (5) the scan clean-up, Property 1, the contrast and print tests, documents, and one final checkpoint. Request limits, the `/api/verify` size cap, the small-screen links and the Sentinel title fix are not in this plan; they are separate specs.

Task count: **22 leaf tasks** (numbered `N.M`), one of them the checkpoint (5.5). Exactly one property is added, Property 1, in task 5.2.

Conventions that apply to every task:

- Paths are repository-relative. Source modules stay at 300 lines or fewer and functions at 40 lines or fewer. No `any`, no default exports outside Next route files, no `try/catch` that swallows an error (tech.md).
- All tasks follow the new `ui.md` from task 1.5 on: no component library, no icon library, text labels only, no animation or transition, no shadow, no gradient, no rounded corner, severity never by colour alone, no exclamation marks. The static scans in `apps/web/test/static` enforce it.
- **No behaviour change.** Each task changes stylesheets, class names, and the small markup hooks the design lists. Words, handlers, order of regions and the Document text rules do not change, except the changes Requirements 7 and 8 name (the Legend without separators, the ✘ chip, curly quotes in the Export dialog, the Override button order).
- No file under `packages/*`, `crew/sentinel`, `apps/web/app/api` or `apps/web/src/server` changes, and `.env.example` does not change (Requirement 12). The only dependencies added are the three `@fontsource` packages in task 1.1.
- **Scans stay green after every task.** The stylesheets change from task 1.2 on, so the Css_Scan constants (colours, variables, families, sizes, weights, control rules) are rewritten in group 1 and the old Pane checks stay until task 3.3 replaces them. Old variables stay as **temporary aliases** in `globals.css` (`--ui-bg`, `--accent`, `--size-ui`, `--size-editor`, `--size-pane`, `--size-wordmark`, `--size-status`, `--line-editor`), and the scan allows exactly those names until task 5.1 removes the aliases and the allowance together. Each component task stops using the aliases in the stylesheets it touches.
- Tests that assert an old value are updated in the same task that changes the value (Requirement 13, criterion 10). Tests use no `vi.mock` of the Engine or the Verifier and no swallowing `try/catch`.
- Prettier lowercases hex digits; scans compare case-insensitively. Run `pnpm prettier --write <changed files>` before finishing a task so `pnpm lint` stays clean.
- Task completion notes record anything Kiro got wrong and the fix, for the BUILD_LOG entry in task 5.4.
- The spec files are committed with a first line `spec(legal-record-ui): <subject>` (at most 72 characters) before task 1.1 runs (Requirement 13, criterion 1). That is a git step by the owner, not a task.
- Tasks must not run `pnpm dev` or watchers. Single runs only, for example `pnpm vitest run --project web <file>`.
- There is no checkpoint before the last task. Each task runs its own affected tests; the full set runs once in 5.5. The checkpoint does not push.

## Tasks

- [ ] 1. Fonts, Tokens, controls and ui.md
  - [x] 1.1 Self-hosted font packages and the third-party font scan
    - Run `pnpm --filter @reveal-codes/web add --save-exact @fontsource/public-sans@5.3.0 @fontsource/libre-caslon-text@5.3.0 @fontsource/ibm-plex-mono@5.3.0`. Check that `apps/web/package.json` holds the three at exactly `5.3.0` and that `pnpm-lock.yaml` changed only for them.
    - In `apps/web/app/layout.tsx` add the eight side-effect imports of the design, before `./globals.css`: Public Sans `latin-500.css`, `latin-600.css`, `latin-700.css`; Libre Caslon Text `latin-400.css`, `latin-400-italic.css`; IBM Plex Mono `latin-400.css`, `latin-600.css`, `latin-700.css`. Import no other weight and no other subset.
    - Create `apps/web/test/static/fonts.test.ts`: read every `.css` under `app` and `src`, the eight `@fontsource` stylesheets that `layout.tsx` imports (resolved from the import specifiers through `node_modules`), and every `.css` under `.next/static/css` when that directory exists. Fail with path and line on `fonts.googleapis.com`, `fonts.gstatic.com`, or any `url(` or `@import` that names an `http:` or `https:` address. Assert that `layout.tsx` imports exactly the eight files and no other `@fontsource` path. Add planted-violation examples for each failure.
    - Add an example to `apps/web/test/static/package-json.test.ts` that the three packages are present at exactly `5.3.0`.
    - Run `pnpm tsc -b apps/web` to confirm a side-effect CSS import type-checks; if it does not, add the minimum ambient declaration to `apps/web/src/css-modules.d.ts` and say so in the completion note.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.13, 12.8_
  - [~] 1.2 Token_Sheet, temporary aliases, and the print view pin
    - Rewrite `:root` in `apps/web/app/globals.css` to the Token_Sheet of the design: the fifteen colour Tokens, the Print_Tokens and print fonts, `--font-ui`, `--font-editor`, `--font-pane` with the three new stacks, and the geometry variables (`--page-max`, `--toolbar-h` 32px for now, `--status-h` 22px for now, `--strip-w`, `--left-w`, `--right-w`, `--pane-h`, `--shell-min`, `--control-h`). Keep `color-scheme: light`.
    - Add the **temporary aliases** after the Tokens, under a comment `TEMPORARY: removed in task 5.1`: `--ui-bg: var(--panel); --accent: var(--oxblood); --size-ui: 13px; --size-editor: 12pt; --size-pane: 14px; --size-wordmark: 15px; --size-status: 12px; --line-editor: 1.5;`.
    - In `globals.css` set the `body` rule to `background: var(--desk)`, `color: var(--ink)`, Public Sans 13px, weight 500, line height 18px (buttons, selects and text areas keep 16px); `a { color: var(--oxblood) }`; `:focus-visible { outline: 2px solid var(--oxblood); outline-offset: 2px; }`. Leave the button rules for task 1.3 and the grid rules unchanged.
    - Rewrite `apps/web/src/components/print-view.module.css` to the print pin: `--print-paper`, `--print-ink`, `--print-rule`, `--print-font-text`, `--print-font-mono`, `max-width: var(--page-max)`, and the literals `12pt`, `1.5` and `13px` in place of the removed variables. The rendered values equal the old ones.
    - Create `apps/web/test/static/css-colours.ts` (helpers only) with `TOKEN_VALUES`, `LEGACY_ALIASES` (the temporary names), `parseTokenSheet(globalsText)`, and `colourViolations(sheets)`: outside Pane_Files, a colour literal (hex, `rgb`, `rgba`, `hsl`, other colour function, named colour) is allowed only on the `:root` declaration of the Token that has that value, and `var(--x)` must name a Token or a temporary alias; inside Pane_Files the old CGA check stays as it is for now.
    - In `apps/web/test/static/css-rules.test.ts` replace `UI_PALETTE`, the UI colour check and `VARIABLE_VALUES` with `colourViolations` and the new geometry list; delete `accentViolations`. Keep the Pane checks and `paneColourViolations` unchanged for now. Add `apps/web/test/static/css-colours.test.ts` with planted examples: a stray hex, a stray `rgba`, a named colour, a Token declared with the wrong value, an unknown `var(--x)`, and a temporary alias.
    - Add `apps/web/test/print-values.test.ts`: resolve each colour and font declaration of `print-view.module.css` through the Token_Sheet and compare to the old values `#FFFFFF`, `#111111`, `#B0B0B0`, `Georgia, "Times New Roman", serif`, `ui-monospace, Menlo, Consolas, monospace`, `12pt`, line height `1.5`, `13px`. Update `print-view.test.tsx` if it asserts a removed variable.
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 2.12, 10.3, 12.7, 13.10_
  - [~] 1.3 Controls in globals.css
    - In `globals.css` rewrite the `button`, `button:hover:not(:disabled)`, primary (rest and hover), `button:disabled`, `select`, `textarea` and `textarea:focus` rules exactly as the design lists them, and add the global class `.small-label` (font properties only: Public Sans, 10.5px, 700, 0.1em, uppercase, line height 14px, no colour). Remove `--button-pad` use. The primary rule exists once, in `globals.css`.
    - Remove the control rules that component stylesheets repeat and that the global rules now cover: the `.select` border, colour, fill and font in `order-picker.module.css` (keep `width: 100%`), the `.prompt` border, fill and font in `assistant-panel.module.css`, and the `.field` border, fill and font in `override-dialog.module.css` (keep `display: block; width: 100%; resize: vertical`). Where a module still holds `outline: 2px solid var(--accent)` on `:focus-visible`, delete that rule (the global rule applies).
    - Update the scan in `css-rules.test.ts`: `FOCUS_OUTLINE` is `2px solid var(--oxblood)`; the button border check stays (`1px solid var(--ink)`); the disabled check requires `var(--disabled-border)` or `var(--disabled-fill)` or `var(--muted)`; the primary check expects exactly one rest and one hover rule with `data-primary` in `globals.css` only, rest values from `var(--oxblood)`, `var(--white)`, `var(--ink)` on `background`, `border-color`, `color` and `font-weight` only, hover only `background`; `buttonBaseViolations` checks `height: var(--control-h)`. Update the planted primary example to the new values.
    - Update `toolbar.test.tsx` and `app-shell.test.tsx` only where they assert an old control value.
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 10.8, 10.9, 13.10_
  - [~] 1.4 Css_Scan lists: families, sizes, weights
    - In `css-rules.test.ts` replace `FONT_STACKS`, the `sizes` array and the weight check. `--font-ui`, `--font-editor` and `--font-pane` must equal the three stacks of Requirement 2, criterion 5; `--print-font-text` and `--print-font-mono` must equal the print stacks; `font-family` must be `var(--font-ui|editor|pane)`, `var(--print-font-text|mono)` or `inherit`.
    - Sizes: `10.5px`, `11px`, `12px`, `12.5px`, `13px`, `13.5px`, `14px`, `15px`, `18px`, `20px`, `26px`, `12pt`, `inherit`, plus the temporary `var(--size-*)` aliases (removed in 5.1). The message reads `font-size must be one of 10.5px, 11px, ...` and still carries path and line. Weights: 400, 500, 600, 700, `normal`, `bold`, `inherit`.
    - Update the planted examples (`accepts 12px and 15px and still reports 14px` becomes a case for the new list: `17px` reported, `13.5px` accepted; weight `300` reported, `600` accepted; a fourth family reported).
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 10.5, 10.6, 10.7, 13.10_
  - [~] 1.5 Rewrite ui.md
    - Rewrite `.kiro/steering/ui.md`, keeping its front matter (`inclusion: fileMatch`, same patterns). Sections: Build (no component library, no icon library, no Tailwind, no CSS-in-JS, text labels only, one global stylesheet defining Tokens plus one CSS module per component, favicon rule), Tokens (the table of Requirement 1 with uses), Type (three families, sizes, line heights, weights, fallback stacks, self-hosted, no third-party host), Controls (heights 30/32/24, primary, disabled, hover, focus, links, select, textarea), Layout (52px Toolbar, 26px Status_Bar, 32px strip, 260px assistant panel, 300px Issues_Region, 816px Sheet with 96px/104px padding, 1150px Shell minimum, 800px small-screen switch, Pane 40% height), Pane (exempt from Tokens; its colours live in `src/pane/`; Failing_Block rule; status bar shares the Pane stylesheet), Copy (the existing rules: short and plain, no exclamation marks, no toasts, Verify result also in the Issues region, severity never by colour alone), and the rule that the Document text is never styled.
    - Keep these lines from the old file: no component or icon library, text labels only, no animation, no shadows, no gradients, no rounded corners, severity never by colour alone.
    - Add `apps/web/test/ui-md.test.ts` (or extend `docs.test.ts`): `ui.md` contains each Token name and value of Requirement 1, the three family names, no `#1F3A8A`, no `#ECECEC`, and the retained rule lines.
    - _Requirements: 10.1, 10.2_

- [ ] 2. Toolbar, Sheet with line numbers, and Issues region
  - [~] 2.1 Toolbar
    - In `apps/web/app/globals.css` set `--toolbar-h: 52px`. Update `VARIABLE_VALUES` in the scan.
    - Rewrite `apps/web/src/components/toolbar.module.css`: `background: var(--panel); border-bottom: 3px double var(--ink)`; `.wordmark` in Libre Caslon 15px, weight 400, `text-transform: uppercase; letter-spacing: 0.16em; margin-right: 24px; padding-right: 24px; border-right: 1px solid var(--rule)`; the `.group` rules and the 8px gaps unchanged with `var(--rule)`; `.notice` with `color: var(--muted)` and `font-size: 12.5px`. Use no `--ui-bg`, `--size-wordmark` or `--font-editor` alias that no longer exists; use `var(--font-editor)` and literal sizes. `toolbar.tsx` does not change; the text "Reveal Codes" stays in the DOM.
    - Update `toolbar.test.tsx` and `app-shell.test.tsx` where they assert the 32px row or the old wordmark weight. Add CSS assertions (read through `parseCss`) for the 52px row, the 3px double ink border, uppercase and letter spacing, 24px and 24px around the rule, and the 12.5px muted notice.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 13.10_
  - [~] 2.2 Sheet, margin rules and line numbers
    - Rewrite `apps/web/src/components/editor-surface.module.css` as in the design: `.main` on `var(--desk)`; `.page` with `max-width: var(--page-max)`, padding `96px 96px 96px 104px`, border `1px solid var(--rule)`, Libre Caslon 14px/22px, minimum height 11in and 24px margin kept; `.page::before` (double rule at 74px) and `.page::after` (single rule 72px from the right); the counter rules on `.ProseMirror` and `.ProseMirror p`; `p::before` with `content: counter(line)` followed by `content: counter(line) / ""`, 62px wide, 11px/22px Public Sans, `var(--muted)`, `user-select: none`; the `[data-issue]` underline in `var(--fail)`; `.placeholder` at `top: 96px; left: 104px; right: 96px` in `var(--muted)` italic. Add no italic, centring, indent, margin or padding on Document text.
    - Confirm in the completion note that the markup carries the counter without any schema, paragraph or offset change (Requirement 5, criterion 13). If it does not, stop and say so.
    - Update `editor-surface.test.tsx`: render the real Editor for these texts and assert that `.ProseMirror` has exactly one `p` child per `"\n"`-separated line: the empty text, one line, `"a\n\nb"` (the blank line has its own `p`), and a long line that wraps. Assert the placeholder text and `aria-hidden`.
    - Add a CSS test (in `css-rules.test.ts` or `editor-surface.test.tsx`): the counter is reset on `.ProseMirror`, incremented on `.ProseMirror p`, drawn by `p::before` with the alt-text form, with `user-select: none`; the margin rules sit at the stated offsets (`left: 74px` with a 4px box and `1px` borders on both sides; `right: 72px` with a `1px` left border); and every declaration whose selector contains `.ProseMirror` (other than `::before`) sets none of `font-style`, `text-align`, `text-indent`, `padding`, and sets `margin` only to `0`. Add a planted-violation example for that rule.
    - Add an example that the Line_Number of every line equals the `Ln` of `lnPos` for a caret on that line, for the same example texts (the counter is 1 plus the paragraph index, `lineAt` is 1 plus the newlines before it).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15, 5.16, 12.4, 13.10_
  - [~] 2.3 Issues region and Issue_Row layout
    - In `apps/web/src/pane/failing.ts` export `isFailingOpener(code)` over the existing opener set (accepting the display form with or without brackets, as `nameOf` does).
    - Rewrite `issues-region.module.css` (`--panel` background, `1px solid var(--rule)` left, heading in Libre Caslon 20px/26px weight 400 with the existing 1px bottom rule, `.note` in `var(--muted)`), `verify-result.module.css` (`.line` 12.5px/18px `var(--muted)`), and `issues-list.module.css` (list with `border-top: 3px double var(--ink)` and `--control-h: 24px`; row padding 10px with a `1px solid var(--rule-light)` bottom; `.lineA`, `.actions`, `.chip`, `.chipFail`, `.words`, `.text` as in the design).
    - In `issues-list.tsx` restructure `IssueRow` into line (a) (chip and the Go and Override… buttons on the right), line (b) (the status words with the `small-label` class and `--oxblood`) and line (c) (the text), then the "Diverges at:" and "Overridden:" lines in the style of (c). The chip is `chipFail` when `isFailingOpener(issue.code)`, whether or not the item is overridden, otherwise `chip`. Restructure `UncheckedRow` so the Verify button is at the right end of its first line and the sentence follows in `.text`, with no chip and no status words. Words, text, order, handlers and `disabled` rules do not change.
    - Update `issues-list.test.tsx` and `issues-shell.test.tsx`: three lines in order; the chip class for `CIT ✘`, `CIT ?` and `QUO ✘` (including an overridden one) and the outline class for `CIT …` and `QUO …`; the status words text unchanged; Go and Override… in the first line; the Unchecked_Row has no chip and no status words and keeps its text, its button and its handler.
    - Update the scan if it names `issues-region.module.css` (`grid-row: 2 / 4` stays).
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 13.10_

- [ ] 3. Pane, Status_Bar and product.md
  - [~] 3.1 Closer families
    - Create `apps/web/src/pane/closers.ts` with `openerFamilies(positions)` as the design lists it: one stack per kind (`CIT`, `QUO`, `REF`), an opener pushes `codeFamily(code)`, a closer pops, everything else and an unbalanced closer gives `null`. It reads only `positions`.
    - In `apps/web/src/pane/layout.ts` call `openerFamilies` once in `layoutPane` and give a paired closer the family of its opener (`family = opener ?? "close"`); `failing`, `text`, `offset` and `meaning` do not change. Add `pane/closers.ts` to the layout regex in `apps/web/test/static/boundaries.test.ts`.
    - Add `apps/web/test/closers.test.ts` and update `layout.test.ts` and `layout.properties.test.ts` if they assert the closer family: a closer of `CIT ✓` is `verified`; of `CIT …` is `pending`; of `REF` is `ref`; of `QUO ✓` inside `CIT …` pairs by kind; an unbalanced closer keeps `close`; item text and offsets still equal `render(document, "display")` (editor-app Property 4 stays green).
    - _Requirements: 7.7, 7.16, 13.10_
  - [~] 3.2 Failing_Block grouping
    - Create `apps/web/src/pane/blocks.ts` with `Segment` and `blockSegments(lines)` as the design lists them: one carried `depth`, failing openers add 1, failing closers subtract 1 (not below 0), an item is in a block segment when `depth > 0` before it, or it is a failing opener, or it is the failing closer that returns `depth` to 0; a new line starts a new segment; non-failing codes inside a block stay in the segment. Add `pane/blocks.ts` to the layout regex in `boundaries.test.ts`.
    - In `apps/web/src/pane/pane.tsx` render each line as its segments: a block segment is `<span className={cls("block")}>` around the same `ItemView` elements. No role, no `data-offset`, no change to `nearestOffset`, the cursor highlight or the accessible names.
    - Add `apps/web/test/blocks.test.ts`: a failing citation with its text is one segment from opener through closer; a failing quote across a line break gives a block on each line; a `QUO ✘` inside a `CIT ✘` is one block; a non-failing `QUO ✓` inside a `CIT ✘` stays in the block; a `CIT ✓` containing a `QUO ✘` blocks only the quote; an unclosed failing opener runs to the end; for every case the concatenated items equal the input, line by line. Update `pane.test.tsx` for the wrapper and for click-inside-a-block setting the Editor selection to the item's offset.
    - _Requirements: 7.8, 7.9, 7.10, 7.16, 7.17, 13.10_
  - [~] 3.3 Pane stylesheet, header and Legend; Pane scan
    - Rewrite `apps/web/src/pane/pane.module.css` as in the design: `.pane`, `.header` (`min-height: 40px`, `padding: 0 48px`, `border-bottom: 1px solid #2e4a8f`), `.title`, `.legend` (flex, `gap: 0 20px`), `.legendItem`, `.body` (`padding: 18px 48px`), `.line`, `.code`, the code colour classes, `.failing`, `.block`, `.legendBlock`, `.cursor`. Remove the old CGA colours, the code outline, the `.header` grey and the old `.status` rule (the status bar moves in task 3.4). Colours are the listed Pane_Colours as literals and `var(--ink)`, `var(--white)`, `var(--fail)`, `var(--fail-ring)` by name. No `font-smooth` or `text-rendering`.
    - Update `pane-header.tsx`: the title in `<span className={cls("title")}>`, no `" · "` fragment, each entry a `legendItem` span, the two failing entries' code wrapped in `legendBlock` inside the `failing` class; no `aria-hidden`, `role` or `aria-label`. Update `code-class.ts` only if needed for the `block` and `legendBlock` names.
    - Replace the Pane checks in `css-rules.test.ts`: delete `CGA`, `FAMILY_COLOURS`, `familyViolations` and `paneColourViolations` and their examples; add `PANE_ALLOWED` (the ten literals of the design) and a Pane check that every hex literal in `src/pane/` is in it and every `var(--x)` is one of `--ink`, `--white`, `--fail`, `--fail-ring`; add a class table (`hum` `#E8ECF6`, `pst` `#F5D98B`, `ai` `#A6D4F7`, `aihum` `#D7C6F5`, `verified` `#9ADBB0`, `pending` `#BAC4E2`, `ref` `#BAC4E2`, `ovr` `#F5D98B`, `close` `#BAC4E2`, `cursor` `#E8ECF6` on `#0F2766`, `block` on `var(--fail)`). Add planted examples (an old CGA colour, a non-listed hex).
    - Rewrite `apps/web/test/pane-css.test.ts` for the new values (colours, header 40px and 48px, body 18px/48px, 13.5px/20px, codes 600, failing 700, 2px and 1px rings, no outline box on codes, Legend gap 20px and `nowrap` items) and update `pane.test.tsx` and `layout.test.ts`: the Legend string is now the seven codes and words without `" · "` (assert the seven entries in order by element), the failing Legend entries carry the ring class, `failing.test.ts` still passes.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.8, 7.11, 7.12, 7.18, 10.4, 10.12, 13.10_
  - [~] 3.4 Status bar and grid row
    - Create `apps/web/src/pane/status-bar.module.css` as in the design (`.bar`, `.key`). In `pane.tsx` render the status line with `.bar` and delete the old `.status` rules from `pane.module.css` if task 3.3 left them. Keep the position text, the F7 prompt and the Mode_Text exactly as they are.
    - In `status-line.tsx` import the bar and key classes from `../pane/status-bar.module.css`; render `<strong className={key}>Alt-F3</strong> Codes   <strong className={key}>F7</strong> Exit` so the text content is still `Alt-F3 Codes   F7 Exit`. Reduce `status-line.module.css` to layout (`grid-column: main`, flex children widths); no colour, font or height there.
    - In `globals.css` set `--status-h: 26px`; update `VARIABLE_VALUES` in the scan. Confirm the `.app[data-pane="open"]` row still uses `var(--pane-h)`.
    - Update `app-shell.test.tsx` and the scan test that reads `status-line.module.css` (it must still contain `grid-column: main;`). Add CSS assertions for `status-bar.module.css`: 26px, `#0A1C4F`, `#C9D2EC`, 12px Plex Mono, key names white and 700; and a DOM assertion that the Status_Line `textContent` contains `Alt-F3 Codes   F7 Exit` and that both key names are `strong` elements.
    - _Requirements: 7.13, 7.14, 7.15, 13.10_
  - [~] 3.5 Pane palette in product.md
    - Rewrite the "Pane palette" section of `.kiro/steering/product.md` to the new colours: a table of Family, Text, Background and Outline covering typed, pasted, assistant, assistant-edited, found, unchecked and `REF`, `OVR`, closers (the colour of their opener), the Failing_Block (`#FFFFFF` on `#A8001C`, 2px `#FF8A8A` ring; 1px in the Legend), the cursor, the Pane body, the Pane_Header (title white, Legend `#BAC4E2`, 1px `#2E4A8F` rule), and the Status_Bar (`#C9D2EC` on `#0A1C4F`, key names white bold). Keep the sentence that the table styles the Codes list and adds, renames and restyles no code. In principle 7 change the words "grey text" to "pale text" and nothing else; edit nothing else in `product.md`.
    - Add an example to the docs test: `product.md` contains each Pane colour of the table and none of `#0000AA`, `#AAAAAA`, `#AA0000`, `#FF55FF`, and principle 7 contains "pale text" and not "grey text".
    - _Requirements: 7.19_

- [ ] 4. Dialogs, assistant and Small_Screen_Page
  - [~] 4.1 Dialog shell and Export dialog
    - Rewrite `apps/web/src/components/modal.module.css` as in the design (`--overlay`, `width: min(600px, 100vw - 32px)`, padding `24px 28px`, `gap: 16px`, `--control-h: 32px`, title in Libre Caslon 26px/32px with `border-bottom: 3px double var(--ink)`). Remove the `wide` prop from `Modal` and the `dialogWide` class, and remove `wide` at its one call in `export-dialog.tsx`.
    - In `order-copy.ts` add `curlyQuoted`. In `order-picker.tsx` `OrderSummary` call `curlyQuoted(entry.key_language)`; `quoted()` stays for `print-order.tsx`. Update `order-picker.module.css` (`.label` becomes a Small_Label in `var(--muted)`; `.keyLanguage` Libre Caslon 15px/24px with `margin-left: 24px`; the summary line and the `Source` link use the global link colour; remove the `--accent` rules).
    - In `export-dialog.tsx` render the blocking line as `<p className={styles["blockingLine"]}><span aria-hidden="true" className={styles["chip"]}>✘</span>{line}</p>` when `!nothing && blocking > 0`, and the plain `p` otherwise. Update `export-dialog.module.css` (`.blockingLine` `var(--fail)` 14px weight 600 flex with 8px gap; `.chip` white on `var(--fail)`; row dividers `var(--rule-light)`; remove `--accent` and `--ui-bg`) and `confidentiality-checkbox.module.css` and `export-issues` styling to tokens only, with `--control-h: 24px` on its list so its row buttons are 24px. The "Nothing to export" line stays plain text with no chip and no ✘. `ModalActions` keeps right alignment and the 8px gap.
    - Update `modal.test.tsx`, `export-dialog.test.tsx`, `export-dialog-orders.test.tsx`, `order-picker.test.tsx`, `order-copy.test.ts` and `print-view-orders.test.tsx`: no `wide`; the blocking line text is unchanged and sits next to an `aria-hidden` ✘ chip, plural, singular and absent; the Export summary shows `“…”` (U+201C and U+201D) and `quoted()` still returns straight marks; the print view still shows straight marks. Add a CSS assertion for the Dialog width rule in `modal.module.css` and in no other sheet (replace the `EXPORT_WIDTH` check in `css-rules.test.ts` with `min(600px, 100vw - 32px)`).
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.11, 10.11, 13.10_
  - [~] 4.2 Override dialog
    - In `override-dialog.tsx` order the buttons Cancel then Save override, and give Save override `data-primary="true"`; the label "Reason" gets the `small-label` class. In `override-dialog.module.css` set `.issueText` to Libre Caslon, the label to `var(--muted)`, remove repeated control rules; error text keeps weight and uses tokens only.
    - Update `override-dialog.test.tsx` and `modal.test.tsx`: Save override is the last button in DOM order and carries `data-primary`; Cancel is before it; focus still starts on the reason field; Escape, Tab trap, the hint and the error behave as before; the Toolbar still renders at most one `data-primary` while the dialog is open (the dialog's button is outside the Toolbar).
    - _Requirements: 8.4, 8.9, 8.10, 8.11, 13.10_
  - [~] 4.3 Assistant strip and panel
    - Rewrite `assistant-column.module.css` (`--panel` background, `1px solid var(--rule)` right edge, the closed strip unchanged otherwise) and `assistant-panel.module.css` (`--panel`; `.heading` Libre Caslon 20px/26px weight 400 with the 1px bottom rule; `.label` as a Small_Label in `var(--muted)`; `.stream` Libre Caslon 13px/19px; the prompt keeps only layout). In `assistant-panel.tsx` add the `small-label` class to the "Prompt" label and the "Last reply" span.
    - Update `assistant-panel.test.tsx`: both labels keep their text and accessible names; the reply text is in the same element; no wording change. Add CSS assertions for the right rule, the panel background and the 13px/19px reply.
    - _Requirements: 9.1, 9.2, 9.3, 13.10_
  - [~] 4.4 Small_Screen_Page
    - Rewrite `small-screen-page.module.css` as in the design (`--paper`, `padding: 40px 28px`, the wordmark in the toolbar's style with `border-bottom: 3px double var(--ink)`, sentences in Libre Caslon 18px/29px). `small-screen-page.tsx` does not change: the three sentences, the title and the absence of any link, image, icon or button stay.
    - Update `small-screen.test.tsx`: the three sentences in order, no `a`, `img`, `svg` or `button` in the page, the window title "Reveal Codes"; CSS assertions for the padding, the 3px double rule and the 18px/29px sentences.
    - _Requirements: 9.4, 9.5, 9.6, 9.7, 13.10_

- [ ] 5. Scan clean-up, Property 1, contrast, documents and checkpoint
  - [~] 5.1 Remove the temporary aliases and finish the control scan
    - Delete the temporary aliases from `globals.css` and the `LEGACY_ALIASES` allowance and the `var(--size-*)` allowance from the scan. Fix any stylesheet that still uses them (the scan names the file and line). Confirm the variable list in the scan is exactly the Token_Sheet of the design.
    - Add to `css-rules.test.ts` the Document-text rule if task 2.2 put it elsewhere (one place only), and assert the Shell width rules of first-run-and-flow Requirement 10 still hold (one width media query, the 799px hide rule).
    - Confirm by scan that `--ui-bg`, `--accent`, `--size-ui`, `--size-editor`, `--size-pane`, `--size-wordmark`, `--size-status`, `--line-editor` and `--button-pad` appear nowhere under `apps/web/app` or `apps/web/src`.
    - _Requirements: 1.5, 1.6, 10.3, 10.8, 10.9, 10.10, 13.10_
  - [~] 5.2 Property 1: tokens are total
    - Add to `apps/web/test/arbitraries.ts`: `arbStylesheetSubset(paths)` (`fc.subarray` of the real list, minimum length 1) and `arbStrayColour()` (a six-digit hex outside the Token and Pane lists by filtering, an `rgba(...)`, a named colour). Tag comment `Feature: legal-record-ui, Property 1: tokens are total`.
    - Create `apps/web/test/static/css-tokens.properties.test.ts`: one `fc.assert(fc.property(...))` with `{ numRuns: runs() }`, a `// Property 1` comment above it, and a `describe` title `"Property 1: tokens are total _Requirements: 1.5, 1.6, 10.3, 10.4_"`. For a generated subset of the real stylesheets the scan reports nothing; and appending `.x { color: <stray>; }` to a generated non-Pane file adds exactly one violation at the appended line, while a stray colour outside the Pane list in a Pane file does the same.
    - In `apps/web/test/static/inventory.test.ts` change the property inventory to eight (`["1","1","1","1","2","3","4","5"]`), name `css-tokens.properties.test.ts`, and change the test title to "eight properties". The "exactly one `fc.assert` per file with `{ numRuns: runs() }`" and "describe title ends with `_Requirements: ..._`" checks need no change.
    - Keep the planted-violation examples in `css-colours.test.ts` (stray hex, stray `rgba`, named colour, Pane colour outside the list, Token with the wrong value).
    - _Requirements: 10.13_
  - [~] 5.3 Contrast record test
    - Create `apps/web/test/contrast.test.ts`: read the Token_Sheet and the Pane stylesheets through `parseCss`, compute the WCAG ratio for every pair of the design's contrast table, and assert each text and code pair is at least 4.5 and each Failing_Code pair (`--white` on `--fail`) at least 7. Assert the ring `#FF8A8A` on `#0F2766` is at least 3. Assert the pair list covers every text colour used (every class in `pane.module.css` with a `color` and every `color` declaration outside the Pane resolves to a Token in the table). Assert the measured values equal the design's table to two decimals so the record cannot drift.
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [~] 5.4 README, KIRO_USAGE rows, BUILD_LOG entry
    - `README.md`: search it for text that describes the look (colours, fonts, the pane's appearance, the toolbar). Update each such sentence to the new look in plain words. If nothing describes the look, change nothing and say so in the completion note. Leave the screenshot placeholder byte-identical. No exclamation marks.
    - `docs/KIRO_USAGE.md`: confirm the row for this spec (added with the spec commit) lists `.config.kiro`, `requirements.md`, `design.md`, `tasks.md` and `tasks.meta.json`; add one row for the `ui.md` edit and one for the `product.md` edit, each stating what changed in one sentence. Run `pnpm kiro:check`.
    - `BUILD_LOG.md`: append one dated entry (use `date +%F`) under the existing format: what the app looked like before and after in a few sentences, what Kiro got wrong and how it was fixed (from the task completion notes) or "No Kiro errors", any requirement found unbuildable, and that request limits, the size cap, the small-screen links and the Sentinel title fix were split into later specs. Do not edit existing entries.
    - _Requirements: 13.6, 13.7, 13.8_
  - [~] 5.5 Checkpoint
    - Run, from the repository root, in this order: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @reveal-codes/web build` (the clean-checkout build: `tsc -b` of engine, verifier and export, then `next build --webpack`; it runs before the tests so the font scan can read `.next/static/css`), `pnpm test`, `pnpm test:pbt`, and `pnpm kiro:check`. Each must exit with code 0. Report each exit code and the test counts. Fix failures in the task that caused them; do not weaken a scan or a test.
    - Run `git status` and confirm no file under `packages/`, `crew/sentinel`, `apps/web/app/api` or `apps/web/src/server` changed and that `.env.example` is unchanged.
    - Do not push. Tell the user the app is ready to walk in a browser, and list what only a browser can show: the three fonts loading from the app's own origin (no third-party request in the network panel), the line numbers in the margin (blank lines numbered, wrapped rows without a number), the double and single margin rules, the Failing_Block rings in the Pane and the Legend, the Issue_Row chips, the 52px Toolbar and 26px status bar, focus outlines, and the Export and Override dialogs.
    - _Requirements: 13.3, 13.4, 13.5_

## Notes

- No task is optional.
- Property numbers are per spec: `// Property 1` here does not clash with Property 1 of editor-app, first-run-and-flow or the limiter. `inventory.test.ts` lists all eight.
- Each task references the specific requirement clauses it covers.
- There is one checkpoint, the last task (Requirement 13, criterion 5).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["1.5"] },
    { "id": 5, "tasks": ["2.1"] },
    { "id": 6, "tasks": ["2.2"] },
    { "id": 7, "tasks": ["2.3"] },
    { "id": 8, "tasks": ["3.1"] },
    { "id": 9, "tasks": ["3.2"] },
    { "id": 10, "tasks": ["3.3"] },
    { "id": 11, "tasks": ["3.4"] },
    { "id": 12, "tasks": ["3.5"] },
    { "id": 13, "tasks": ["4.1"] },
    { "id": 14, "tasks": ["4.2"] },
    { "id": 15, "tasks": ["4.3"] },
    { "id": 16, "tasks": ["4.4"] },
    { "id": 17, "tasks": ["5.1"] },
    { "id": 18, "tasks": ["5.2"] },
    { "id": 19, "tasks": ["5.3"] },
    { "id": 20, "tasks": ["5.4"] },
    { "id": 21, "tasks": ["5.5"] }
  ]
}
```
