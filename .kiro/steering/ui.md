---
inclusion: fileMatch
fileMatchPattern: ["apps/web/**", "**/*.css", ".kiro/specs/**/design.md"]
---

# UI rules

The app should look like a tool a lawyer's office would have used, not like a generated web app. Every spec that touches `apps/web` follows these rules. The Reveal Codes pane has its own fixed palette (product.md, editor-app spec) and is exempt from the palette below. The Pane_Header and its Legend are part of the Pane and use the Pane palette.

## Build

- No component library, no icon library, no Tailwind, no CSS-in-JS.
- One global stylesheet defining CSS variables, plus one CSS module per component.
- Text labels only. No icons, no emoji, no illustrations.
- The favicon (the letters "RC" in Georgia bold) is the only place where letters serve as a mark.

## Palette (outside the pane)

- Paper `#FFFFFF`, ink `#111111`, rule grey `#B0B0B0`, UI background `#ECECEC`.
- One accent, `#1F3A8A`, used only for the focused control and for links.
- Nothing else. No gradients, no shadows, no rounded cards, no purple, no glassmorphism.

## Type

- UI: system sans (`-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`) at 13px.
- Editor: `Georgia, "Times New Roman", serif` at 12pt.
- Wordmark: the editor family at 15px.
- Status line: the pane family (`ui-monospace, Menlo, Consolas, monospace`) at 12px.
- Three families, no more. Weights regular and bold only.

## Controls

- Buttons are flat rectangles: 1px `#111111` border, `4px 10px` padding, no radius.
- Disabled: grey text and grey border (`#B0B0B0`).
- Hover is a background change only, with no transition or animation.
- Focus is a 2px `#1F3A8A` outline.
- One primary button on the Toolbar at most: ink background, paper text, the same border and size as other buttons. It names the next step, by the first rule that matches: nothing while a Verify run is in flight; Load demo motion when the text is empty; Verify when a full citation is unchecked; otherwise Export.

## Layout

- 32px toolbar.
- 22px status line under the editor while the pane is closed.
- 32px assistant strip while the assistant column is collapsed; 260px left panel while it is expanded.
- 300px right panel.
- Pane 40% of the viewport height when open.
- The page is a fixed 8.5in sheet with 1in padding.
- The Issues region has a 1px left rule.
- Separate regions with 1px `#B0B0B0` rules, not whitespace and shadows.
- The Shell is at least 1150px wide. Between 800px and 1150px the page scrolls sideways. Below 800px a plain page replaces it.

## Copy

- Short and plain. No exclamation marks, no "Oops", no "Let's", no sparkle characters, no marketing text.
- No empty-state illustrations and no toasts. State is shown as text in the toolbar, the status line under the editor, or the pane status line.
- The result of Verify is shown as text in the Issues region, in addition to the toolbar, the status line and the pane status line.
- Severity is shown by the code colour in the pane and by words in the Issues list ("blocking", "not found"), not by coloured badges.
