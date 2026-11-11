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
- Primary (`data-primary="true"`): `--oxblood` fill and border, `--white` text, weight 600. One primary button on the Toolbar at most. It names the next step, by the first rule that matches: nothing while a Verify run is in flight; Load demo motion when the text is empty; Verify when a full citation is unchecked; otherwise Export.
- Disabled: dashed 1px `--disabled-border`, `--disabled-fill` fill, `--muted` text, `cursor: not-allowed`. A disabled primary keeps its `data-primary`.
- Hover is a fill change only: `--rule`, and `--ink` for the primary. No transition.
- Focus is a 2px `--oxblood` outline with a 2px offset on every focusable control.
- The Editor's content element is an editing surface, not a control: it draws no outline, and the caret is its focus indicator.
- Links are `--oxblood`.
- Selects are 34px high with a 1px `--ink` border and a `--white` fill.
- Text areas have a 1px `--ink` border and a 2px `--oxblood` border while focused, with no layout shift and no outline: the border is the one focus ring.
- Control rules live in `globals.css` and the shared Modal styles. Component stylesheets set only heights.

## Layout

- Toolbar 52px, `--panel`, 3px double `--ink` bottom rule.
- Status_Bar 26px, under the editor while the Pane is closed and at the bottom of the Pane while it is open.
- Assistant strip 32px while collapsed; assistant panel 260px while expanded.
- Issues region 300px, with a 1px `--rule` left edge.
- The Sheet is 816px wide (8.5in), with padding 96px 96px 96px 104px, on the `--desk` background. It takes 100% of the column when the column is narrower.
- Dialogs are `min(600px, 100vw - 32px)` wide.
- The Shell is at least 1150px wide. Between 800px and 1150px the page scrolls sideways. Below 800px a plain page replaces it.
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
- Severity is shown by words in the Issues list ("blocking", "not found") and by the code text in its chip, never by colour alone.

## Document text

The text of the Document is never styled. Only its family, size, line height and colour, the dotted issue underline, and the line numbers reach it. No italic, centring, indent or paragraph margin.
