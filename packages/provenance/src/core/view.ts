/**
 * `viewRecord`: the file with its provenance codes inline (Req 9.1 to 9.8, 9.13; design M5, M6).
 * Pure; no `node:`. Only the four provenance codes are printed: the citation layer is emptied
 * before the Engine renders, and the colour body reads the codes of that same rendering.
 */
import { render, type Document } from "@reveal-codes/engine";
import { legendLines } from "./legend.js";
import { neutralize } from "./neutralize.js";
import { onBody, PANE, RESET, type ColourMode } from "./palette.js";
/** How the output is coloured: 24-bit, 256 colours, or none. */
export type ViewMode = ColourMode | "plain";
/** The header line, which names the file. */
export function headerLine(path: string): string {
  return `Reveal Codes: ${neutralize(path)}`;
}
/** A copy of `doc` with neutralized text and no citation layer, so only provenance codes render. */
function provenanceOnly(doc: Document): Document {
  return { ...doc, text: neutralize(doc.text), citations: [], quotes: [], overrides: [] };
}
function lineEnds(style: string, text: string): string {
  return text.split("\n").join(`${RESET}\n${style}`);
}
function colourBody(doc: Document, mode: ColourMode): string {
  const view = provenanceOnly(doc);
  const codes = render(view, "display").positions;
  let out = "";
  view.spans.forEach((span, i) => {
    const style = onBody(PANE.origin[span.provenance.origin], mode);
    const code = codes[i]?.code ?? "";
    out += style + lineEnds(style, code + view.text.slice(span.start, span.end));
  });
  return out === "" ? out : out + RESET;
}
function colourLines(lines: readonly string[], colour: string, mode: ColourMode): string[] {
  const style = onBody(colour, mode);
  return lines.map((line) => `${style}${line}${RESET}`);
}
function colourView(doc: Document, mode: ColourMode, path: string): string {
  const head = colourLines([headerLine(path)], PANE.title, mode);
  const legend = colourLines(legendLines(), PANE.legend, mode);
  return [...head, ...legend, colourBody(doc, mode)].join("\n");
}
function plainView(doc: Document, path: string): string {
  const body = render(provenanceOnly(doc), "display").text;
  return [headerLine(path), ...legendLines(), body].join("\n");
}
/**
 * The header naming `path`, the four-item legend, then the body of `doc`, in `mode`.
 * Colour mode prints the text unescaped, plain mode with the Engine's escaping.
 */
export function viewRecord(doc: Document, mode: ViewMode, path: string): string {
  return mode === "plain" ? plainView(doc, path) : colourView(doc, mode, path);
}
