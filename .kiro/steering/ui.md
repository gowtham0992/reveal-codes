---
inclusion: fileMatch
fileMatchPattern: ["apps/web/**", "**/*.css", ".kiro/specs/**/design.md"]
---

# UI rules

The app should look like a page of a court record, not like a generated web app. Every spec that touches `apps/web` follows these rules. The Reveal Codes Pane has its own fixed colours and is exempt from the Tokens below; the Pane_Header and its Legend are part of the Pane.

## Build

- No component library, no icon library, no Tailwind, no CSS-in-JS.
- One global stylesheet (`apps/web/app/globals.css`) defining the Tokens, plus one CSS module per component.
- Text labels only. No icons, no emoji, no illustrations.
- No animation and no transition.
- No shadows, no gradients, no rounded corners.
- Severity is never shown by colour alone. A word or a code always says the same thing.
- The mark (`apps/web/app/icon.svg`, copied byte for byte from `docs/images/mark.svg`: the page above, the codes pane below, a failing code between brackets) is the only picture. It may appear in three places: the favicon, the lockup beside the wordmark in the Toolbar and on the small-screen page (24px, 10px before the wordmark, `aria-hidden`), and the README. It is outside the Token rules and does not change. The rule against icons stays: no control, label or message carries one.
- Outside the Pane, a colour is written only as `var(--token)`. A colour literal appears in `globals.css` only on the declaration of the Token that has that value.

## Tokens

Defined in `:root` of `globals.css`.

| Token | Value | Use |
| ----- | ----- | --- |
| `--paper` | `#FFFDF8` | The Sheet and dialogs |
| `--desk` | `#E9E3D6` | Behind the Sheet |
| `--panel` | `#FBF8F1` | Toolbar, Issues region, assistant |
| `--ink` | `#1B1915` | Text, button borders, heavy rules |
| `--muted` | `#5E574C` | Secondary text |
| `--rule` | `#CFC6B4` | Hairlines |
| `--oxblood` | `#6B1A24` | Primary button, links, focus, status labels |
| `--fail` | `#A8001C` | Failing code blocks and chips |
| `--fail-ring` | `#FF8A8A` | Outline round failing codes in the Pane |
| `--rule-light` | `#DDD4C2` | Lighter row dividers, the single margin rule on the Sheet |
| `--margin-rule` | `#B5A98F` | The double margin rule |
| `--disabled-border` | `#8C8475` | Disabled button border |
| `--disabled-fill` | `#F1ECE1` | Disabled button fill |
| `--white` | `#FFFFFF` | Text on oxblood and on fail, fill of selects |
| `--overlay` | `rgba(27, 25, 21, 0.55)` | Dialog overlay |

The print view uses its own Tokens so the printed filing does not change: `--print-paper` `#FFFFFF`, `--print-ink` `#111111`, `--print-rule` `#B0B0B0`. Add no Token for a colour that is not named here.

## Type

Three families, self-hosted from the `@fontsource` packages (exact versions), Latin subset only. No request goes to a third-party font host.

- Public Sans for controls and labels (weights 500, 600, 700). Fallback: `-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`.
- Libre Caslon Text for headings, the wordmark, the Sheet and page text (weight 400, roman and italic). Fallback: `Georgia, "Times New Roman", serif`.
- IBM Plex Mono for the Pane and the Status_Bar (weights 400, 600, 700). Fallback: `ui-monospace, Menlo, Consolas, monospace`.

Sizes and line heights:

- Controls and labels: 13px / 16px, weight 500. Other running UI text: 13px / 18px, weight 500.
- Small label: 10.5px, weight 700, uppercase, letter spacing 0.1em.
- Region headings (Issues, Assistant): Libre Caslon Text 20px / 26px, weight 400.
- Dialog titles: Libre Caslon Text 26px / 32px.
- Wordmark: Libre Caslon Text 15px, uppercase, letter spacing 0.16em, weight 400.
- Sheet text: Libre Caslon Text 14px / 22px. Page text: 14px / 22px.
- Pane body: IBM Plex Mono 13.5px / 20px, codes weight 600, failing codes weight 700. Status_Bar: 12px.
- Allowed sizes: 10.5, 11, 12, 12.5, 13, 13.5, 14, 15, 18, 20 and 26px. The print view keeps 12pt. Allowed weights: 400, 500, 600, 700.

## Controls

- Buttons are square: 1px `--ink` border, transparent fill, `--ink` text. Heights: 30px in the Toolbar and by default, 32px in dialogs, 24px in Issue rows, the Unchecked row and the Export dialog's issue list.
- Primary (`data-primary="true"`): `--oxblood` fill and border, `--white` text, weight 600. One primary button on the Toolbar at most. It names the next step, by the first rule that matches: nothing while a Verify run is in flight; Load demo motion when the text is empty; Verify when a full citation is unchecked, or when the Document holds a Verification_Result and has no check date (a restored Document); otherwise Export. Open is never primary and carries no `data-primary`. The Next_Step is not an input to the export gate: red codes without an override still block export while Verify is primary.
- Disabled: dashed 1px `--disabled-border`, `--disabled-fill` fill, `--muted` text, `cursor: not-allowed`. A disabled primary keeps its `data-primary`.
- Hover is a fill change only: `--rule`, and `--ink` for the primary. No transition.
- Focus is a 2px `--oxblood` outline with a 2px offset on every focusable control.
- The Editor's content element is an editing surface, not a control: it draws no outline, and the caret is its focus indicator.
- Links are `--oxblood`.
- Selects are 34px high with a 1px `--ink` border and a `--white` fill.
- Text areas have a 1px `--ink` border and a 2px `--oxblood` border while focused, with no layout shift and no outline: the border is the one focus ring.
- Text inputs (`input[type="text"]`, used by the `/courts` filter) are 34px high with a 1px `--ink` border, a `--white` fill, no radius and Public Sans 13px / 16px weight 500. Focused, the border is 2px `--oxblood` with the padding reduced by 1px and no outline, so nothing shifts.
- Checkboxes (`input[type="checkbox"]`) are 16px by 16px with no margin and `accent-color: var(--oxblood)`; they take the standard 2px `--oxblood` focus outline and always sit beside a text label.
- A quotation on `/courts` is a `blockquote` in Libre Caslon Text roman, wrapped in real quotation marks, with a 1px `--rule` rule on its left edge. It is not italic, centred or indented beyond that rule's padding. A status is shown in words ("Not in force."), never by colour alone.
- `/courts` type, as built in `apps/web/app/courts/courts.module.css`. Every size and weight is from the allowed lists above, and no Token is added:

  | Element | Family | Size / line | Weight | Colour |
  | ------- | ------ | ----------- | ------ | ------ |
  | Page text, requirements, required heading, key language | Libre Caslon Text | 14 / 22 | 400 | `--ink` |
  | Page title (`h1`) | Libre Caslon Text | 26 / 32 | 400 | `--ink` |
  | Court heading (`h2`), with a 1px `--rule` underline | Libre Caslon Text | 20 / 26 | 400 | `--ink` |
  | Instrument title (`h3`) | Libre Caslon Text | 18 / 26 | 400 | `--ink` |
  | Wordmark in the header, uppercase, letter spacing 0.16em | Libre Caslon Text | 15 | 400 | `--ink` |
  | Judge, kind and date line (`.meta`) | Public Sans | 13 / 18 | 500 | `--muted` |
  | "Not in force." line | Public Sans | 13 / 18 | 700 | `--ink` |
  | "Requires" label, uppercase, letter spacing 0.1em | Public Sans | 10.5 / 16 | 700 | `--muted` |
  | Filter labels and checkbox label | Public Sans | 13 / 16 | 500 | `--ink` |
  | Count line and empty-result sentence | Public Sans | 13 / 18 | 500 | `--ink` |

- One-column pages (`/courts` and `/check`) share the rules below. `/check` has its own stylesheet, `apps/web/app/check/check.module.css`, and uses the same type sizes and weights as the table above for the same elements. It adds no Token.
- One-column page column: a `--desk` wrapper (`min-height: 100vh`) holds one `--paper` column with `max-width: var(--page-max)`, `min-height: 100vh`, `margin: 0 auto` and fluid padding (`16px max(16px, 6vw) 48px`). The column is centred on the desk and fills it below `--page-max`. There is no width at-rule on either page. The column sets `overflow-wrap: anywhere` and every control group sets `max-width: 100%`, so the page shows no sideways scroll at 320px.
- One-column page header: the first element in the column. One link to `/` holds the Mark (24px, 10px before the wordmark, `aria-hidden`) and the REVEAL CODES wordmark, `--ink`, no underline, with a 3px double `--ink` rule under the header. The link is `inline-flex`, `align-items: center`, `min-height: 34px`.
- One-column page links: on `/courts`, the "Read the court's text" and "Draft under this rule" links; on `/check`, its links (View on CourtListener, the Editor_Link). They are `--oxblood`, `display: inline-flex`, `align-items: center`, `min-height: 34px`, side by side with a gap that wraps (16px between links). Their look is otherwise the link style above.
- Status_Label on `/check`: a Result_Item shows its code with the `CodeLabel` component (`apps/web/src/pane/code-label.tsx` and `code-label.module.css`). It uses the Pane's colours on the Pane's dark ground (`--pane-body`), so a code looks on `/check` as it does in the Pane. The label text is the code, so status is never shown by colour alone. A failing code is the Failing_Block: `--white` on `--fail`, weight 700, 2px `--fail-ring`. `check.module.css` holds no colour literal and no Pane colour; the Pane colours stay in `src/pane/`.
- Touch rule: on a coarse pointer, buttons and links are 44px high. The rule sits inside `@media (pointer: coarse)` on `/check` (`.page button` at 44px height, `.page a` at `inline-flex` with a 44px minimum height), on the Small_Screen_Page links, and on the two links under each rule on `/courts`. `@media (pointer: coarse)` is the only media query besides the one Shell width at-rule (and `@media print` in the print view); it is not a width at-rule. Every desktop rule stays outside the query and the desktop look does not change. The shared dialog is not changed.
- The Draft_Box text (`.draft`, the `/check` text area) is 16px / 22px at every width, so a phone browser does not zoom on focus. It is the one use of 16px: no other selector uses it, and it is not in the allowed sizes above.
- Control rules live in `globals.css` and the shared Modal styles. Component stylesheets set only heights.

## Layout

- Toolbar 52px, `--panel`, 3px double `--ink` bottom rule. The Open button comes directly after New, in the same square style, and is enabled while a Verify run is in flight.
- Status_Bar 26px, under the editor while the Pane is closed and at the bottom of the Pane while it is open.
- Assistant strip 32px while collapsed; assistant panel 260px while expanded.
- Issues region 300px, with a 1px `--rule` left edge.
- The Sheet is 816px wide (8.5in), with padding 96px 96px 96px 104px, on the `--desk` background. It takes 100% of the column when the column is narrower.
- Dialogs are `min(600px, 100vw - 32px)` wide.
- The Shell is at least 1150px wide. Between 800px and 1150px the page scrolls sideways. Below 800px a plain page replaces it. The 1150px minimum applies to the Shell only: `/courts` and `/check` are one-column pages that read from 320px up, use no width at-rule, and never scroll sideways.
- Pane 40% of the viewport height when open.

## Pane

- The Pane is exempt from the Tokens. Its colours are written values and live only in `apps/web/src/pane/` (product.md "Pane palette"). Beside them it may use `--ink`, `--white`, `--fail` and `--fail-ring`.
- A Failing_Block is one block: `--white` text on `--fail`, weight 700, with a 2px `--fail-ring` outline, from the opening code through its text to the closing code. Text inside a block never has less than 7:1 contrast with `--fail`. The Legend's failing entries use a 1px ring.
- Other codes are coloured text with no outline box.
- The Status_Bar shares the Pane stylesheet directory: its stylesheet is in `src/pane/` and styles both the Pane status line and the Status_Line.

## Copy

- Short and plain. No exclamation marks, no "Oops", no "Let's", no sparkle characters, no marketing text.
- No empty-state illustrations and no toasts. State is shown as text in the Toolbar, the Status_Bar, or the Pane status line.
- The result of Verify is also shown as text in the Issues region.
- The Open_Note is plain text in the Issues region. It explains a refused file, a changed export, or what a restore did not bring back. It is not persisted and has no icon.
- A file dragged over the page shows no overlay, outline or animation. A dropped file opens through the same function as the Open button.
- The empty page shows the placeholder "Type or paste your filing here, or open a draft." and, under it, three plain links in this order: "Open a draft", "Load demo motion", "Load the Avianca citations". Both disappear when the Document has one character. The links use the link style above, with no icon.
- Severity is shown by words in the Issues list ("blocking", "not found") and by the code text in its chip, never by colour alone.

## Document text

The text of the Document is never styled. Only its family, size, line height and colour, the dotted issue underline, and the line numbers reach it. No italic, centring, indent or paragraph margin.
