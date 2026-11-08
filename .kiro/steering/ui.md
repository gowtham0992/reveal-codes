---
inclusion: fileMatch
fileMatchPattern: ["apps/web/**", "**/*.css", ".kiro/specs/**/design.md"]
---

# UI rules

The app should look like a tool a lawyer's office would have used, not like a generated web app. Every spec that touches `apps/web` follows these rules. The Reveal Codes pane has its own fixed palette (product.md, editor-app spec) and is exempt from the palette below.

## Build

- No component library, no icon library, no Tailwind, no CSS-in-JS.
- One global stylesheet defining CSS variables, plus one CSS module per component.
- Text labels only. No icons, no emoji, no illustrations.

## Palette (outside the pane)

- Paper `#FFFFFF`, ink `#111111`, rule grey `#B0B0B0`, UI background `#ECECEC`.
- One accent, `#1F3A8A`, used only for the focused control and for links.
- Nothing else. No gradients, no shadows, no rounded cards, no purple, no glassmorphism.

## Type

- UI: system sans (`-apple-system, "Segoe UI", Helvetica, Arial, sans-serif`) at 13px.
- Editor: `Georgia, "Times New Roman", serif` at 12pt.
- Pane: `ui-monospace, Menlo, Consolas, monospace`.
- Three families, no more. Weights regular and bold only.

## Controls

- Buttons are flat rectangles: 1px `#111111` border, `4px 10px` padding, no radius.
- Disabled: grey text and grey border (`#B0B0B0`).
- Hover is a background change only, with no transition or animation.
- Focus is a 2px `#1F3A8A` outline.

## Layout

- Fixed grid: 32px toolbar, 260px left panel, 300px right panel, pane 40% of the viewport height when open.
- Separate regions with 1px `#B0B0B0` rules, not whitespace and shadows.

## Copy

- Short and plain. No exclamation marks, no "Oops", no "Let's", no sparkle characters, no marketing text.
- No empty-state illustrations and no toasts. State is shown as text in the toolbar or the pane status line.
- Severity is shown by the code colour in the pane and by words in the Issues list ("blocking", "not found"), not by coloured badges.
