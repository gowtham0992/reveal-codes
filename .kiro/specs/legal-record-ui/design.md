# Design Document

## Overview

The redesign is almost all CSS. It rests on four moves:

1. One Token_Sheet in `apps/web/app/globals.css` replaces the old palette variables. Every stylesheet outside `src/pane/` reads colour only through `var(--token)`.
2. Three families load from `@fontsource` packages (exact version `5.3.0` each, checked on the registry), imported once in `app/layout.tsx`, served from the app's own origin.
3. Component markup changes only where a requirement needs a hook: the Issue_Row lines, the Pane's Failing_Block wrapper and closer colours, the shared status bar stylesheet, the Export blocking chip and curly quotes, the Override button order. No text, handler or order of regions changes.
4. The static scans and one property (Property 1) are rewritten to the new lists.

No file under `packages/*`, `crew/sentinel`, `apps/web/app/api` or `apps/web/src/server` changes. `.env.example` does not change.

## Verified against the code

These facts were read from the repository before the design was written.

- The Editor schema is `doc > paragraph > text` (`src/editor/schema.ts`). `docFromText` and `textToSlice` split the Document text on `"\n"` into one paragraph per line, and an empty line is an empty paragraph (`src/editor/offsets.ts`, `slice-text.ts`). A CSS counter on `.ProseMirror > p` therefore numbers exactly the lines of the Document, blank lines included, and wrapped rows stay inside one paragraph. Requirement 5, criterion 13 does not trigger: no schema, paragraph or offset change is needed.
- `lineAt` in `src/pane/layout.ts` gives the number after `Ln` (1 plus the newlines before the offset). `crew/sentinel/src/lines.ts` `lineAt` uses the same rule. A counter that starts at 1 and adds 1 per paragraph gives the same number.
- `quoted()` in `src/order-copy.ts` is used by `OrderSummary` (Export dialog) and by `print-order.tsx` (print view). Curly quotes therefore need a second function; `quoted()` stays.
- `print-view.module.css` uses `--paper`, `--ink`, `--rule`, `--page-max`, `--font-editor`, `--font-pane`, `--size-editor`, `--line-editor` and `--size-ui`. Retinting those would change the printed filing, so the print view gets its own variables (below).
- `inventory.test.ts` counts properties: today `["1","1","1","2","3","4","5"]`. Property 1 of this spec is an eighth. That test and its test title are updated in the same task.
- `status-line.module.css` holds `grid-column: main;`, which `css-rules.test.ts` checks. That rule stays in a layout-only stylesheet.
- `fast-check` properties use `runs()` from `test/support/fc.ts`, and `inventory.test.ts` requires exactly one `fc.assert` per `*.properties.test.ts` file with `{ numRuns: runs() }`.
- `package-json.test.ts` requires exact pins and bans UI libraries. `@fontsource/*` packages are CSS and font files, not UI libraries.

## Data Models

No stored data changes. The new types are small and pure:

```ts
// pane/closers.ts
export function openerFamilies(
  positions: readonly CodePosition[],
): readonly (CodeFamily | null)[]; // parallel to positions; non-null only for a paired closer

// pane/blocks.ts
export type Segment = Readonly<{ block: boolean; items: readonly PaneItem[] }>;
export function blockSegments(
  lines: readonly (readonly PaneItem[])[],
): readonly (readonly Segment[])[]; // same lines, items regrouped; concatenation unchanged

// pane/failing.ts (added export; the set it reads already exists)
export function isFailingOpener(code: string): boolean; // "CIT ✘", "CIT ?", "QUO ✘" (display form accepted)

// order-copy.ts (added export; quoted() is unchanged)
export function curlyQuoted(text: string): string; // U+201C text U+201D
```

`PaneItem`, `PaneLayout` and `CodeFamily` keep their types. A paired closer now carries its opener's `family` (it was `"close"`); an unbalanced closer keeps `"close"`.

The Token list under "Tokens" is the other model: a flat set of CSS custom properties with the values of Requirement 1.

## Architecture

### File map

| Area | Files |
| ---- | ----- |
| Tokens, controls, fonts | `app/globals.css`, `app/layout.tsx`, `apps/web/package.json`, `pnpm-lock.yaml` |
| Toolbar | `components/toolbar.module.css` |
| Sheet and line numbers | `components/editor-surface.module.css` |
| Issues region | `components/issues-region.module.css`, `issues-list.tsx`, `issues-list.module.css`, `verify-result.module.css` |
| Pane | `pane/pane.module.css`, `pane/pane.tsx`, `pane/pane-header.tsx`, `pane/layout.ts`, new `pane/closers.ts`, new `pane/blocks.ts`, `pane/failing.ts` |
| Status bar | new `pane/status-bar.module.css`, `pane/pane.tsx`, `components/status-line.tsx`, `components/status-line.module.css` (layout only) |
| Dialogs | `components/modal.tsx`, `modal.module.css`, `export-dialog.tsx`, `export-dialog.module.css`, `override-dialog.tsx`, `override-dialog.module.css`, `order-picker.tsx`, `order-picker.module.css`, `order-copy.ts`, `confidentiality-checkbox.module.css` |
| Assistant, small screen | `assistant-column.module.css`, `assistant-panel.module.css`, `assistant-panel.tsx`, `small-screen-page.module.css` |
| Print view (pin only) | `print-view.module.css` |
| Steering | `.kiro/steering/ui.md`, `.kiro/steering/product.md` |
| Tests | see "Testing strategy" |

## Tokens

`:root` in `globals.css`. Values are copied from the request; nothing is derived.

```css
:root {
  color-scheme: light;
  /* colour tokens (Requirement 1) */
  --paper: #fffdf8;
  --desk: #e9e3d6;
  --panel: #fbf8f1;
  --ink: #1b1915;
  --muted: #5e574c;
  --rule: #cfc6b4;
  --rule-light: #ddd4c2;
  --margin-rule: #b5a98f;
  --oxblood: #6b1a24;
  --fail: #a8001c;
  --fail-ring: #ff8a8a;
  --disabled-border: #8c8475;
  --disabled-fill: #f1ece1;
  --white: #ffffff;
  --overlay: rgba(27, 25, 21, 0.55);
  /* print tokens: the colours and fonts the print view used before this spec */
  --print-paper: #ffffff;
  --print-ink: #111111;
  --print-rule: #b0b0b0;
  --print-font-text: Georgia, "Times New Roman", serif;
  --print-font-mono: ui-monospace, Menlo, Consolas, monospace;
  /* type families */
  --font-ui: "Public Sans", -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-editor: "Libre Caslon Text", Georgia, "Times New Roman", serif;
  --font-pane: "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace;
  /* geometry that survives from the earlier specs */
  --page-max: 8.5in;
  --toolbar-h: 52px;
  --status-h: 26px;
  --strip-w: 32px;
  --left-w: 260px;
  --right-w: 300px;
  --pane-h: 40vh;
  --shell-min: 1150px;
  --control-h: 30px;
}
```

Removed: `--ui-bg`, `--accent`, `--size-ui`, `--size-editor`, `--size-pane`, `--size-wordmark`, `--size-status`, `--line-editor`, `--button-pad`. Each user is rewritten in the same task as its stylesheet (list in the file map). Sizes now sit in the module that uses them, because each size is used in one place.

`--page-max: 8.5in` is 816px, so the Sheet uses `max-width: var(--page-max)` and the print view keeps the same variable unchanged.

Prettier lowercases hex digits; the scans compare case-insensitively, as they do now.

## Type

### Loading

`app/layout.tsx` gains eight side-effect imports, one per weight actually used:

```ts
import "@fontsource/public-sans/latin-500.css";
import "@fontsource/public-sans/latin-600.css";
import "@fontsource/public-sans/latin-700.css";
import "@fontsource/libre-caslon-text/latin-400.css";
import "@fontsource/libre-caslon-text/latin-400-italic.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
```

I listed the tarballs of the packages to confirm these file names exist (`latin-400.css`, `latin-400-italic.css`, `latin-500.css`, `latin-600.css`, `latin-700.css`). Each `@font-face` points at `./files/*.woff2` with a `.woff` fallback, relative to the package, so webpack emits the files under `/_next/static/media` on the app's own origin. `font-display: swap` is what the packages set. Only the Latin subset is imported, so the ✓, ✘ and … glyphs come from the fallback stack where Plex Mono's Latin subset has none (Known limitation L2).

### Roles

| Role | Family | Size / line | Weight | Where set |
| ---- | ------ | ----------- | ------ | --------- |
| Controls, labels (body default) | Public Sans | 13px / 16px | 500 | `body` and `button`, `select`, `textarea` in `globals.css` |
| Small_Label | Public Sans | 10.5px, uppercase, 0.1em | 700 | global class `.small-label` (font properties only) |
| Primary button | Public Sans | 13px / 16px | 600 | `button[data-primary="true"]` in `globals.css` |
| Wordmark | Libre Caslon Text | 15px, uppercase, 0.16em | 400 | `toolbar.module.css`, `small-screen-page.module.css` |
| Region heading | Libre Caslon Text | 20px / 26px | 400 | `issues-region.module.css`, `assistant-panel.module.css` |
| Dialog title | Libre Caslon Text | 26px / 32px | 400 | `modal.module.css` |
| Sheet text | Libre Caslon Text | 14px / 22px | 400 | `editor-surface.module.css` |
| Placeholder | Libre Caslon Text | 14px / 22px, italic | 400 | `editor-surface.module.css` |
| Issue text, assistant reply | Libre Caslon Text | 13px / 19px | 400 | `issues-list.module.css`, `assistant-panel.module.css` |
| Export key sentence | Libre Caslon Text | 15px / 24px | 400 | `order-picker.module.css` |
| Small-screen sentences | Libre Caslon Text | 18px / 29px | 400 | `small-screen-page.module.css` |
| Line numbers | Public Sans | 11px / 22px | 500 | `editor-surface.module.css` |
| Verify notice | Public Sans | 12.5px | 500 | `toolbar.module.css` |
| Verify_Summary | Public Sans | 12.5px / 18px | 500 | `verify-result.module.css` |
| Blocking line | Public Sans | 14px | 600 | `export-dialog.module.css` |
| Code_Chip | IBM Plex Mono | 12px / 20px | 700 | `issues-list.module.css` |
| Pane body | IBM Plex Mono | 13.5px / 20px | 400, codes 600, failing 700 | `pane.module.css` |
| Pane title | IBM Plex Mono | 13px | 700 | `pane.module.css` |
| Legend | IBM Plex Mono | 12px / 18px | 400 | `pane.module.css` |
| Status_Bar | IBM Plex Mono | 12px | 400, keys 700 | `status-bar.module.css` |

Caslon has no 500 or 600 weight loaded; a rule that asks for one would synthesise bold. The scan accepts weights 400, 500, 600 and 700 only where the family has the file: a failing-block weight of 700 is Plex Mono, and the wordmark is 400, so nothing in Caslon asks for a weight it lacks. The Css_Scan does not track family and weight together; this is recorded as a review point, not a scan rule.

### Print view

`print-view.module.css` is rewritten to use `--print-paper`, `--print-ink`, `--print-rule`, `--print-font-text`, `--print-font-mono`, `max-width: var(--page-max)`, and literal `12pt`, `1.5` and `13px`. Those are the values it resolved to before this spec. A rendered-CSS test (below) compares the resolved values to the old ones.

## Controls

All in `globals.css` except the height overrides.

```css
button {
  appearance: none;
  height: var(--control-h);
  padding: 0 10px;
  margin: 0;
  background: transparent;
  border: 1px solid var(--ink);
  color: var(--ink);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
}
button:hover:not(:disabled) { background: var(--rule); }
button[data-primary="true"]:not(:disabled) {
  background: var(--oxblood);
  border-color: var(--oxblood);
  color: var(--white);
  font-weight: 600;
}
button[data-primary="true"]:hover:not(:disabled) { background: var(--ink); }
button:disabled {
  background: var(--disabled-fill);
  border: 1px dashed var(--disabled-border);
  color: var(--muted);
  cursor: not-allowed;
}
:focus-visible { outline: 2px solid var(--oxblood); outline-offset: 2px; }
a { color: var(--oxblood); }
select {
  height: 34px; padding: 0 8px; background: var(--white); border: 1px solid var(--ink);
  border-radius: 0; color: var(--ink); font-family: var(--font-ui); font-size: 13px; font-weight: 500;
}
textarea {
  padding: 4px; background: var(--paper); border: 1px solid var(--ink); color: var(--ink);
  font-family: var(--font-ui); font-size: 13px; line-height: 16px;
}
textarea:focus { padding: 3px; border: 2px solid var(--oxblood); }
```

- A disabled primary button is matched by `button:disabled` and not by the primary rule (that rule has `:not(:disabled)`), so it keeps `data-primary` and gets the dashed style, as Requirement 3, criterion 4 asks.
- The `padding: 3px` on a focused text area with a 2px border keeps the outer size equal to the 4px/1px resting size, so nothing moves. The global focus outline still draws, so a focused text area shows both the 2px border and the 2px outline; that is what "2px outline on every focusable control" and "2px border when focused" ask for together.
- Heights: the Toolbar uses the default 30px. `.dialog` in `modal.module.css` sets `--control-h: 32px`. `.list` in `issues-list.module.css` sets `--control-h: 24px`. The Unchecked_Row lives in that list. A custom property is not a repeated control rule, so Requirement 3, criterion 10 holds.
- The primary rule stays once, in `globals.css`. The Override dialog marks Save override with `data-primary="true"`. First-run-and-flow Requirement 4, criterion 8 limits the attribute to one Toolbar button (the Next_Step button) and puts it on no other Toolbar button; a dialog button is not on the Toolbar, so the Toolbar still renders at most one.
- No `transition`, no radius: the properties are absent, and the Css_Scan still reports them.
- `.small-label` is the one global class: `font-family: var(--font-ui); font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; line-height: 14px`. Colour is never set there; each user sets muted or oxblood.

## Components and Interfaces

### Toolbar

`toolbar.module.css`: `background: var(--panel); border-bottom: 3px double var(--ink); height` comes from the grid row `var(--toolbar-h)`. `.wordmark` uses Libre Caslon 15px, `text-transform: uppercase; letter-spacing: 0.16em; font-weight: 400; margin-right: 24px; padding-right: 24px; border-right: 1px solid var(--rule)`. So the rule sits 24px right of the wordmark text and the first group starts 24px after the rule. The `.group + .group` rules (1px `--rule`) stay. `.notice` becomes `color: var(--muted); font-size: 12.5px`. `toolbar.tsx` does not change.

### Sheet and line numbers

`editor-surface.module.css`:

```css
.main { grid-column: main; overflow: auto; background: var(--desk); }
.page {
  position: relative;
  width: 100%;
  max-width: var(--page-max);          /* 816px */
  min-height: 11in;
  margin: 24px auto;
  padding: 96px 96px 96px 104px;
  background: var(--paper);
  border: 1px solid var(--rule);
  color: var(--ink);
  font-family: var(--font-editor);
  font-size: 14px;
  line-height: 22px;
}
/* double margin rule: x = 74px and 77px; the single rule is 72px from the right edge */
.page::before { content: ""; position: absolute; top: 0; bottom: 0; left: 74px; width: 4px;
  border-left: 1px solid var(--margin-rule); border-right: 1px solid var(--margin-rule); pointer-events: none; }
.page::after { content: ""; position: absolute; top: 0; bottom: 0; right: 72px; width: 0;
  border-left: 1px solid var(--rule-light); pointer-events: none; }
.content :global(.ProseMirror) { counter-reset: line; min-height: 24em; white-space: pre-wrap; word-wrap: break-word; }
.content :global(.ProseMirror) p { position: relative; margin: 0; counter-increment: line; }
.content :global(.ProseMirror) p::before {
  content: counter(line);
  content: counter(line) / "";          /* empty alternative text where supported */
  position: absolute; top: 0; left: -104px; width: 62px;
  text-align: right; user-select: none; pointer-events: none;
  color: var(--muted); font-family: var(--font-ui); font-size: 11px; line-height: 22px; font-weight: 500;
}
.content :global(.ProseMirror) [data-issue] { text-decoration: underline dotted var(--fail); text-decoration-thickness: 1px; }
.placeholder { position: absolute; top: 96px; left: 104px; right: 96px; color: var(--muted); font-style: italic; pointer-events: none; }
```

- Absolute positions are measured from the padding box of `.page`, that is, the inside of the 1px border. The column starts at the Sheet's left edge as drawn, 1px inside the border line. That is the only rounding choice.
- The double-rule box is 4px wide: 1px line, 2px gap, 1px line. Its left edge is at 74px.
- `p::before` is a generated box, not a DOM node. It is not selectable (`user-select: none`), not copied (generated content is never part of a selection's text), and not in `innerText`. The second `content` declaration adds `/ ""`, the alt-text form that tells assistive technology to skip it; a browser that does not know the form drops that declaration and keeps the first. This is the CSS equivalent of `aria-hidden`, because a pseudo-element cannot carry an attribute.
- `p { position: relative }` has no layout effect. `margin: 0` on paragraphs already exists. The Document text gets no italic, centring or indent: the only rules that reach it set family, size, line height, colour (inherited), and the `[data-issue]` underline. A static test selects every rule whose selector contains `.ProseMirror` and fails on `font-style`, `text-align`, `text-indent`, `padding` or non-zero `margin` other than on `p::before`.
- A blank line is an empty paragraph rendered with a trailing break, which keeps its 22px height, so the counter increments and the number shows.
- When the Editor_Column is narrower than 816px the Sheet takes 100%; the rules keep their offsets from the Sheet edges. The text area narrows by the same amount.
- jsdom does not compute generated content. The behaviour is tested in two parts: a DOM test that the rendered Editor has exactly one `p` child of `.ProseMirror` per line of the Document, for the empty text, a single line, a blank line between lines, and a long wrapped line; and a CSS test that the counter rules above exist and select `p` directly under `.ProseMirror`. Together they cover Requirement 5, criteria 9 to 12 as far as a static test can. A browser walk covers the pixels (checkpoint).

### Issues region

`issues-region.module.css`: `background: var(--panel); border-left: 1px solid var(--rule)`; `.heading` Libre Caslon 20px/26px, weight 400, bottom 1px `--rule`. `.note` (demo-mode line) uses `--muted`.

`verify-result.module.css`: `.line { color: var(--muted); font-size: 12.5px; line-height: 18px; }`.

`issues-list.tsx` markup for an Issue_Row:

```tsx
<li className={styles["row"]}>
  <div className={styles["lineA"]}>
    <span className={isFailingOpener(issue.code) ? styles["chipFail"] : styles["chip"]}>{issue.code}</span>
    <div className={styles["actions"]}>{/* Go, Override… exactly as now */}</div>
  </div>
  <p className={`small-label ${styles["words"] ?? ""}`}>{`${blocking ? "blocking" : "overridden"}, ${SEVERITY[issue.code]}`}</p>
  <p className={styles["text"]}>{issueText(document, issue)}</p>
  {/* "Diverges at:" and "Overridden:" lines, same class as text */}
</li>
```

- The words and handlers are the current ones. Only the order of the DOM changes: the buttons move up to line (a), as the request asks. They keep their order (Go, then Override…).
- `isFailingOpener(code)` is a new export of `pane/failing.ts` that reads the same `FAILING_OPENERS` set, so the list chip and the Pane use one definition. A components module importing `pane/failing.ts` is within the import-boundary table (components may import pane).
- `.list { margin: 0; padding: 0; list-style: none; border-top: 3px double var(--ink); --control-h: 24px; }`; `.row { padding: 10px 0; border-bottom: 1px solid var(--rule-light); }`; `.lineA { display: flex; align-items: center; justify-content: space-between; }`; `.actions { display: flex; gap: 8px; }`.
- `.chip { font-family: var(--font-pane); font-size: 12px; line-height: 20px; font-weight: 700; padding: 0 6px; border: 1px solid var(--ink); color: var(--ink); }`. `.chipFail` has `background: var(--fail); color: var(--white); border: 1px solid var(--fail)` (same box, so the two chips align). The chip also marks the failing state by its code text, so severity is never colour alone.
- `.words { color: var(--oxblood); margin: 4px 0 0; }`; `.text { font-family: var(--font-editor); font-size: 13px; line-height: 19px; margin: 4px 0 0; overflow-wrap: anywhere; }`.
- The Unchecked_Row is `UncheckedRow` with the Verify button in `.actions` aligned right on its first line (`.lineA` with an empty left side, `justify-content: flex-end`) and the sentence in `.text` below. No chip, no words.
- Export dialog's own list (`export-issues.tsx`) is not part of Requirement 6. It gets the token restyle only (`--rule-light` dividers, Plex Mono bold code, `--control-h` from the dialog), with no markup change.

### Pane

**Items and closers.** A new pure module `pane/closers.ts` exports `openerFamilies(positions): readonly (CodeFamily | null)[]`, parallel to `positions`. It keeps one stack per kind (`CIT`, `QUO`, `REF`); an opener pushes `codeFamily(code)`, a closer pops and returns the popped family; every other code and an unbalanced closer give `null`. `layoutPane` passes the result to `codeItem`, which uses it only to choose the family of a closer: `family = opener ?? "close"`, with `failing` still from `failingFlags`. Item text, offsets and meanings are unchanged, so first-run-and-flow Requirement 3, criterion 8 and editor-app Property 4 stay true. The module reads `positions` only, as the closer pairing does today, and joins the layout regex in `boundaries.test.ts`.

**Failing blocks.** A new pure module `pane/blocks.ts` exports `blockSegments(lines: readonly (readonly PaneItem[])[]): readonly (readonly Segment[])[]` where `Segment = { block: boolean; items: readonly PaneItem[] }`. It walks the lines in order with one carried integer `depth`:

- A code item with `failing` and text starting `[/` is a failing closer; with `failing` and no `/` it is a failing opener. An opener makes `depth + 1`; a closer makes `depth - 1` (not below 0).
- An item belongs to a block segment when `depth > 0` before it, or when it is an opener, or when it is the closer that brings `depth` back to 0.
- Items in a run are grouped into one segment; a new line starts a new segment, and the carried `depth` continues, so a failing quote that spans a line break draws a block on each line (Requirement 7, criterion 9).
- Non-failing openers and closers inside a block do not change `depth`; they stay inside the segment and are drawn in block style.
- The concatenation of every segment's items equals the input items, line by line.

`pane.tsx` renders each line as its segments: a block segment is `<span className={cls("block")}>…</span>` around the same `ItemView` elements as now. The wrapper has no role and no `data-offset`, so click handling (`nearestOffset`), accessible names and the cursor highlight are unchanged. `LineView` takes the segments in place of the raw items; the head index and cursor logic are unchanged.

**Stylesheet.** `pane.module.css`, with the allowed colours only. Shared Tokens (`--ink`, `--white`, `--fail`, `--fail-ring`) are used by name; Pane-only colours are literal.

```css
.pane { display: flex; flex-direction: column; height: 100%; min-height: 0; background: #0f2766;
  border-top: 3px solid var(--ink); color: #e8ecf6; font-family: var(--font-pane); font-size: 13.5px; line-height: 20px; }
.header { flex: none; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 0 20px; min-height: 40px; padding: 0 48px; border-bottom: 1px solid #2e4a8f; }
.title { color: var(--white); font-size: 13px; font-weight: 700; }
.legend { display: flex; flex-wrap: wrap; gap: 0 20px; color: #bac4e2; font-size: 12px; line-height: 18px; }
.legendItem { white-space: nowrap; }
.body { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 48px; white-space: pre-wrap; overflow-wrap: anywhere; }
.line { min-height: 20px; content-visibility: auto; contain-intrinsic-size: auto 20px; }
.code { font-weight: 600; }
.hum { color: #e8ecf6; }  .pst { color: #f5d98b; }  .ai { color: #a6d4f7; }  .aihum { color: #d7c6f5; }
.verified { color: #9adbb0; }  .pending { color: #bac4e2; }  .ref { color: #bac4e2; }
.ovr { color: #f5d98b; }  .close { color: #bac4e2; }
.failing { color: var(--white); font-weight: 700; }
.block { background: var(--fail); color: var(--white); font-weight: 700; outline: 2px solid var(--fail-ring); }
.block .code { color: inherit; font-weight: inherit; }
.legendBlock { background: var(--fail); outline: 1px solid var(--fail-ring); }
.cursor { background: #e8ecf6; color: #0f2766; }
```

- `.pending` is also the class of `CIT ?`; as a failing code its `failing` class and block win. `.close` is the class of an unbalanced closer only.
- `.header` uses `min-height: 40px` so a Legend that wraps to two 18px lines (36px) still fits in 40px, and a third line would grow the header, which keeps every entry visible as first-run-and-flow Requirement 2, criterion 7 asks.
- `pane-header.tsx` drops the `" · "` fragment; each entry is `<span className={cls("legendItem")}>` with the code span and its words; the two failing entries wrap their code in `<span className={cls("legendBlock")}>` inside the existing `failing` class. The title is `<span className={cls("title")}>Reveal Codes</span>`.
- The Pane has no outline box on codes: the old `.code { outline }` is removed.
- The Pane stylesheet keeps no `font-smooth` or `text-rendering` property.

**Status bar.** New `pane/status-bar.module.css`:

```css
.bar { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  height: 26px; padding: 0 48px; background: #0a1c4f; color: #c9d2ec;
  font-family: var(--font-pane); font-size: 12px; line-height: 18px; white-space: pre; overflow: hidden; }
.key { color: var(--white); font-weight: 700; }
```

`pane.tsx` renders the status line with `statusBar.bar`. `status-line.tsx` renders `<section role="region" aria-label="Status line" className={`${layout.statusLine} ${statusBar.bar}`}>`; its legend becomes `<strong className={statusBar.key}>Alt-F3</strong> Codes   <strong className={statusBar.key}>F7</strong> Exit`. The text content is still `Alt-F3 Codes   F7 Exit`, so `app-shell.test.tsx` line 430 (`toContain("Alt-F3 Codes   F7 Exit")` on `textContent`) stays true. `status-line.module.css` keeps layout only (`grid-column: main`, flex children widths) and no colour or font. The pane directory owns every status-bar colour, so Requirement 7, criterion 14 and the pane exemption hold.

`<strong>` is a semantic element; its bold weight is set by the class. Screen readers may announce emphasis; the key names are real text.

**Grid.** `--status-h: 26px` in the Token_Sheet makes the closed-state row 26px. With the Pane open the third row is `var(--pane-h)` and the status bar is the last 26px inside it.

### Dialogs

`modal.module.css`:

```css
.overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--overlay); }
.dialog { --control-h: 32px; display: flex; flex-direction: column; gap: 16px;
  width: min(600px, 100vw - 32px); max-width: none; padding: 24px 28px;
  background: var(--paper); color: var(--ink); border: 1px solid var(--ink); }
.title { margin: 0; padding-bottom: 12px; border-bottom: 3px double var(--ink);
  font-family: var(--font-editor); font-size: 26px; line-height: 32px; font-weight: 400; }
.body { display: flex; flex-direction: column; gap: 16px; }
.actions { display: flex; gap: 8px; justify-content: flex-end; }
```

The `wide` prop and `dialogWide` class are removed from `Modal` and its one caller, because every dialog now has this width. `modal.test.tsx` and `export-dialog` tests that look at `wide` are updated. The width rule lives in `modal.module.css` only, which the scan checks (Requirement 10, criterion 11).

Export dialog:

- `order-copy.ts` gains `curlyQuoted(text) = "\u201C" + text + "\u201D"`. `OrderSummary` calls it; `quoted()` is untouched for the print view.
- `.keyLanguage` in `order-picker.module.css`: `font-family: var(--font-editor); font-size: 15px; line-height: 24px; margin: 0 0 0 24px`.
- `.label` (Court or judge) is a Small_Label in `--muted`: the element gets `className={`small-label ${styles["label"]}`}`.
- The blocking line in `ExportActions` becomes `<p className={styles["blockingLine"]}><span aria-hidden="true" className={styles["chip"]}>✘</span>{line}</p>` when `!nothing && blocking > 0`; with `nothing` the `p` has the text only. `.blockingLine { color: var(--fail); font-size: 14px; font-weight: 600; margin: 0; display: flex; align-items: center; gap: 8px }`; `.chip { background: var(--fail); color: var(--white); padding: 0 6px; line-height: 20px }`. The `p`'s own text node is still `line`, so `getByText("2 blocking items remain")` still matches. The ✘ (U+2718) is on the copy-rule exemption list.
- Buttons: `ModalActions` already right-aligns with an 8px gap.

Override dialog:

- `.issueText { font-family: var(--font-editor); }`; the label "Reason" gets `small-label` and `--muted`.
- Button order in JSX becomes Cancel, then Save override with `data-primary="true"`. Focus starts on the textarea (`data-autofocus`), so the order change does not alter the first focus. Tab order changes with the visual order, which is the intent.

### Assistant

`assistant-column.module.css`: `background: var(--panel); border-right: 1px solid var(--rule)`. `assistant-panel.module.css`: panel `--panel`; `.heading` Libre Caslon 20px/26px weight 400 with the existing 1px bottom `--rule`; `.label` becomes a Small_Label (the two JSX elements get the `small-label` class) in `--muted`; `.stream` Libre Caslon 13px/19px; `.prompt` loses its own border and font rules (global `textarea`). The class names and the DOM are otherwise unchanged.

### Small-screen page

`small-screen-page.module.css`: `.page { min-height: 100vh; padding: 40px 28px; background: var(--paper); color: var(--ink); }`; `.wordmark` Libre Caslon 15px uppercase 0.16em weight 400, `padding-bottom: 12px; margin-bottom: 24px; border-bottom: 3px double var(--ink)`; `.page p { font-family: var(--font-editor); font-size: 18px; line-height: 29px; margin: 0 0 16px }`. The component, its three sentences and its title do not change; no link is added.

## Static scans

`css-rules.test.ts` is split because its helpers grew past what reads well; the split keeps each helper under 40 lines.

| Test file | Content |
| --------- | ------- |
| `test/static/css-rules.test.ts` | families, sizes, weights, banned properties, control rules, Shell width rule, Dialog width, third-party font URLs, Document-text rules |
| `test/static/css-colours.ts` (helper, not a test) | `colourViolations`, `PANE_ALLOWED`, `TOKEN_VALUES`, parsers of the Token_Sheet |
| `test/static/css-colours.test.ts` | example tests for the colour scan with planted violations, and the unchanged-print-values test |
| `test/static/css-tokens.properties.test.ts` | Property 1 |
| `test/contrast.test.ts` | contrast table (Requirement 11) |

Changes inside the rules:

- **Colours.** Outside Pane_Files: no colour literal (hex, function, named) except on the `:root` declaration of the Token whose value it is; any `var(--x)` must name a Token that exists. In Pane_Files: hex literals must be in `PANE_ALLOWED` (pane `#0F2766`, hairline `#2E4A8F`, bar `#0A1C4F`, text `#E8ECF6`, label `#BAC4E2`, bar text `#C9D2EC`, `#F5D98B`, `#A6D4F7`, `#D7C6F5`, `#9ADBB0`) and `var(--ink|white|fail|fail-ring)` are allowed. The old `FAMILY_COLOURS` table is replaced by a table of the Pane classes and their allowed `color`/`background` pair.
- **The `#AAAAAA`/`#AA0000` file scan** (`paneColourViolations`) is deleted and replaced by the rule above (Requirement 10, criterion 12). Its planted-violation example is replaced by examples for the new rule.
- **Accent rule** (`accentViolations`) is deleted: oxblood is used by links, focus, the primary button, labels and the failing words, and the colours are already limited to the Token list.
- **Families.** `font-family` must be `var(--font-ui|editor|pane)`, `var(--print-font-text|mono)` or `inherit`; the `--font-*` variables must equal the stacks of Requirement 2, criterion 5.
- **Sizes.** `SIZES = {10.5px, 11px, 12px, 12.5px, 13px, 13.5px, 14px, 15px, 18px, 20px, 26px, inherit, 12pt}`; the old `sizes` array and its `editor-surface|print-view` special case go. Reported as `font-size must be one of …`.
- **Weights.** 400, 500, 600, 700, `normal`, `bold`, `inherit`.
- **Variables.** `VARIABLE_VALUES` is replaced by the Token and geometry list above (so `--toolbar-h` must be `52px`, `--status-h` `26px`).
- **Controls.** `FOCUS_OUTLINE` becomes `2px solid var(--oxblood)`; the button border check stays; the disabled check requires `--disabled-border`; the primary-rule check expects exactly one rest rule and one hover rule in `globals.css`, with `var(--oxblood)`, `var(--white)`, `var(--ink)` values and no other property than background, border-color, color and font-weight at rest, and background only at hover.
- **Third-party fonts.** The test reads every `.css` under `app` and `src`, every `@fontsource` stylesheet imported by `layout.tsx` (resolved from `node_modules` by the same specifier), and, when `.next/static/css` exists, the built files. Any `fonts.googleapis.com`, `fonts.gstatic.com`, or `url(`/`@import` naming `http:`/`https:` fails with path and line. The `@fontsource` files are always available after `pnpm install`, so the test does not depend on a build; the built CSS is an extra check, not a skip condition.
- **Document text.** Every declaration whose selector contains `.ProseMirror` and does not end in `::before` must not set `font-style`, `text-align`, `text-indent` or a `padding` and may set `margin` only to `0`.

## Correctness Properties

### Property 1: tokens are total

**Validates: Requirements 1.5, 1.6, 10.3, 10.4**

```
// Property 1
FOR ALL non-empty lists S of the real stylesheet paths (fc.subarray over the file list),
  scanColours(S) = []                                        (totality)
  AND for any non-Pane file f in S and any stray colour c in {hex, rgba(), named},
      scanColours(S with ".x { color: c; }" appended to f) reports exactly one violation, at the appended line.
```

- Arbitraries in `test/arbitraries.ts`: `arbStylesheetSubset(paths)` and `arbStrayColour()` (a six-digit hex not in the Token or Pane lists, an `rgba(...)`, a named colour). The stray hex is generated outside the allowed sets by filtering, not by a fixed list.
- The assertion relates input and output (the planted line is the reported line), so it is not a does-not-throw property.
- `numRuns: runs()`, one `fc.assert`, `// Property 1`, and a `describe` title ending `_Requirements: 1.5, 1.6, 10.3, 10.4_`, as `inventory.test.ts` requires. `inventory.test.ts` changes to `["1","1","1","1","2","3","4","5"]`, names the new file in the list of property files, and its test title says "eight".
- Example tests with planted violations (stray hex, stray `rgba`, named colour, Pane colour outside the list, token declared with the wrong value) sit beside the property in `css-colours.test.ts`.

## Contrast record

Measured with the WCAG relative-luminance formula on the exact hex values (two decimals). The test in `test/contrast.test.ts` recomputes each pair from the stylesheets.

| Text | On | Ratio | Threshold | Where |
| ---- | -- | ----- | --------- | ----- |
| `--ink` `#1B1915` | `--paper` `#FFFDF8` | 17.27 | 4.5 | Sheet, dialogs, text |
| `--ink` | `--panel` `#FBF8F1` | 16.55 | 4.5 | Toolbar, Issues, assistant |
| `--ink` | `--desk` `#E9E3D6` | 13.73 | 4.5 | text on the Desk, if any |
| `--ink` | `--rule` `#CFC6B4` | 10.36 | 4.5 | button hover |
| `--ink` | `--white` `#FFFFFF` | 17.55 | 4.5 | select text |
| `--ink` | `--disabled-fill` `#F1ECE1` | 14.90 | 4.5 | (not used: disabled text is muted) |
| `--muted` `#5E574C` | `--paper` | 7.02 | 4.5 | line numbers, placeholder, labels. The request says 6.8:1; the measured value is 7.02. 6.73 is the value on `--panel`. |
| `--muted` | `--panel` | 6.73 | 4.5 | notice, summary lines, Small_Labels |
| `--muted` | `--disabled-fill` | 6.06 | 4.5 | disabled button text |
| `--oxblood` `#6B1A24` | `--paper` | 11.49 | 4.5 | links, focus text |
| `--oxblood` | `--panel` | 11.01 | 4.5 | status words |
| `--white` | `--oxblood` | 11.68 | 4.5 | primary button |
| `--white` | `--ink` | 17.55 | 4.5 | primary button on hover |
| `--fail` `#A8001C` | `--paper` | 7.70 | 7 | blocking line text |
| `--white` | `--fail` | 7.83 | 7 | failing chip, failing block, Legend failing entries (request: 7.8) |
| `#E8ECF6` pane text | `#0F2766` pane | 11.82 | 4.5 | body text, typed code (request: 11.6) |
| `#BAC4E2` pane label | pane | 8.04 | 4.5 | legend, REF, unchecked, closers |
| `#F5D98B` pasted, override | pane | 10.10 | 4.5 | |
| `#A6D4F7` assistant | pane | 8.91 | 4.5 | |
| `#D7C6F5` assistant-edited | pane | 8.84 | 4.5 | |
| `#9ADBB0` found | pane | 8.74 | 4.5 | |
| `--white` | pane | 13.98 | 4.5 | pane title |
| `#0F2766` | `#E8ECF6` | 11.82 | 4.5 | cursor block text |
| `#C9D2EC` bar text | `#0A1C4F` bar | 10.77 | 4.5 | status bar |
| `--white` | bar | 16.26 | 4.5 | key names |

Non-text: the `#FF8A8A` ring on the pane `#0F2766` is 6.16:1 (3:1 is the non-text minimum). The `#B5A98F`/`#DDD4C2` margin rules and the `--rule` hairlines are decoration. Every text and code pair is at least 4.5:1 and the failing pairs are at least 7:1; no pair needed a change from the values in the request.

## Error Handling

- **Line numbers.** Verified feasible (above). If a TipTap upgrade ever wraps paragraphs, the DOM test (one `p` per line) fails first.
- **`content: counter() / ""`.** Older browsers drop the second declaration and read the number aloud; the first declaration keeps the visual. This is a degradation, not a failure.
- **Fonts.** If a font file fails to load, `font-display: swap` shows the fallback stack. The ✓ and ✘ glyphs always come from a fallback (Known limitation L2).
- **Failing block and the cursor.** The cursor block sits inside a block's children and keeps its own background and colour because `.block .code` overrides only code spans.
- **Unclosed failing opener.** If a failing opener has no closer in `positions`, the block runs to the end of the Pane (the carried depth never returns to 0). `render` always emits a closer, so this is defensive, and a test covers it.
- **Print view.** The print stylesheet is pinned to the old values; a test resolves each declaration of `print-view.module.css` through the `:root` Tokens and compares the colours and fonts to the old values (`#FFFFFF`, `#111111`, `#B0B0B0`, `Georgia…`, `ui-monospace…`, `12pt`, `1.5`, `13px`).
- **Existing tests that assert old values.** `pane-css.test.ts`, `pane.test.tsx`, `layout.test.ts`, `failing.test.ts`, `issues-list.test.tsx`, `issues-shell.test.tsx`, `toolbar.test.tsx`, `editor-surface.test.tsx`, `modal.test.tsx`, `export-dialog*.test.tsx`, `override-dialog.test.tsx`, `order-picker.test.tsx`, `order-copy.test.ts`, `assistant-panel.test.tsx`, `small-screen.test.tsx`, `app-shell.test.tsx`, `inventory.test.ts`, and the static scans. Each is updated in the task that changes the value.

## Testing strategy

| Area | Tests |
| ---- | ----- |
| Tokens, fonts, controls | `css-rules.test.ts`, `css-colours.test.ts`, Property 1, a `package-json` example for the three exact pins, the third-party font scan |
| Toolbar | `toolbar.test.tsx` (wordmark text still "Reveal Codes"); CSS assertions for 52px, double border, uppercase, spacing |
| Sheet | `editor-surface.test.tsx` (one `p` per line for generated example texts; placeholder), CSS assertions for padding, rules, counter, underline in `--fail`, no Document-text styling |
| Issues | `issues-list.test.tsx`, `issues-shell.test.tsx`: three lines per row, chip class by code (Fail_Chip for `CIT ✘`, `CIT ?`, `QUO ✘`, outline for others, including an overridden failing item), Unchecked_Row with no chip and no words, unchanged text |
| Pane | `blocks.test.ts` (segments for a failing citation, a failing quote across a line break, a quote inside a citation, an unclosed opener, a non-failing code inside a block; concatenation equals input), `closers.test.ts`, `layout.test.ts` (closer family), `pane.test.tsx` (block wrapper, Legend without separators, failing legend ring), `pane-css.test.ts` (new colours, 40px header, 48px padding, 18px body padding) |
| Status bar | `app-shell.test.tsx` (text still present), `status-bar` CSS assertions (26px, colours, key weight) |
| Dialogs | `modal.test.tsx` (no `wide`), `export-dialog.test.tsx` (chip, aria-hidden, words), `order-picker.test.tsx` (curly quotes; `quoted()` unchanged), `override-dialog.test.tsx` (Save override last, `data-primary`) |
| Assistant, small screen | `assistant-panel.test.tsx`, `small-screen.test.tsx` (no link, sentences unchanged) |
| Print | `print-view.test.tsx` unchanged; new resolved-values test |
| Contrast | `contrast.test.ts` |

The browser walk at the checkpoint covers what jsdom cannot: fonts, pseudo-element line numbers, the block rings, the Sheet rules, and focus outlines.

## Alternatives considered

- **`next/font/local`** with the package files: rejected. It adds a build step and generated class names for no gain over importing the package CSS.
- **Line numbers as DOM nodes or ProseMirror decorations**: rejected. They would add text to copies and the accessibility tree, and the request asks for no script.
- **Status bar colours in `components/`**: rejected. They would put `#0A1C4F` and `#C9D2EC` outside the Pane exemption and fail Property 1. The shared stylesheet lives in `src/pane/`.
- **Pane block as a CSS `::before`/`::after` on code spans**: rejected. The block must wrap the covered text, which has no element of its own in the flat item list; a wrapper segment is the smallest change.
- **A `closerOf` field on layout items for the closer colour**: rejected in favour of reusing `family` for closers, which keeps the item type unchanged.
