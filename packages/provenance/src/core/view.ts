/**
 * `viewRecord`: the file with its provenance codes inline (Req 9.1 to 9.8, 9.13; design M5, M6).
 * Pure; no `node:`. Only the four provenance codes are printed: the citation layer is emptied
 * before the Engine renders, and the colour body reads the codes of that same rendering.
 */
import { render, type Document } from "@reveal-codes/engine";
import { legendLines } from "./legend.js";
import { neutralize } from "./neutralize.js";
import { LINE_END, onBody, PANE, type ColourMode } from "./palette.js";
import { runsListLines } from "./runs-list.js";
import { assignTags, windowRunOf } from "./tags.js";
/** How the output is coloured: 24-bit, 256 colours, or none. */
export type ViewMode = ColourMode | "plain";
/** The header line, which names the file. */
export function headerLine(path: string): string {
  return `Reveal Codes: ${neutralize(path)}`;
}
type SpanOf = Document["spans"][number];
function agentRun(span: SpanOf): string | null {
  const { provenance } = span;
  if (provenance.origin !== "AI" && provenance.origin !== "AI>HUM") return null;
  return provenance.runId ?? null;
}

/** The Run_Ids of the file's `AI` and `AI>HUM` spans, in file order. */
function runIdsOf(doc: Document): string[] {
  return doc.spans.flatMap((span) => agentRun(span) ?? []);
}

/** `span` with its Run_Id replaced by `tags.get(window)`, when it has a run and a tag for it. */
function tagged(span: SpanOf, tags: ReadonlyMap<string, string>): SpanOf {
  const run = agentRun(span);
  const tag = run === null ? undefined : tags.get(windowRunOf(run));
  if (tag === undefined || span.provenance.origin === "HUM") return span;
  if (span.provenance.origin === "PST") return span;
  return { ...span, provenance: { ...span.provenance, runId: tag } };
}

/**
 * A copy of `doc` with neutralized text and no citation layer, so only provenance codes render.
 * Unless `full`, the code of an agent span names its window by tag instead of by Run_Id.
 */
function provenanceOnly(doc: Document, full: boolean): Document {
  const base = { ...doc, text: neutralize(doc.text), citations: [], quotes: [], overrides: [] };
  if (full) return base;
  const windows = assignTags(runIdsOf(doc));
  const tags = new Map(windows.map((w) => [w.windowRun, w.tag]));
  return { ...base, spans: doc.spans.map((span) => tagged(span, tags)) };
}

/**
 * The legend, then the Runs list when the file has agent text. The sentence that points to the list
 * is printed only when tags are shown and the list is absent, which never happens (Req 9.3).
 */
function legendBlock(doc: Document, full: boolean, escape: boolean): string[] {
  const items = legendLines(full ? "run" : "tag");
  const ids = runIdsOf(doc);
  if (full || ids.length === 0) return items;
  return [...items, ...runsListLines(assignTags(ids), escape)];
}
function lineEnds(style: string, text: string): string {
  return text.split("\n").join(`${LINE_END}\n${style}`);
}
function colourBody(view: Document, mode: ColourMode): string {
  const codes = render(view, "display").positions;
  let out = "";
  view.spans.forEach((span, i) => {
    const style = onBody(PANE.origin[span.provenance.origin], mode);
    const code = codes[i]?.code ?? "";
    out += style + lineEnds(style, code + view.text.slice(span.start, span.end));
  });
  return out === "" ? out : out + LINE_END;
}
function colourLines(lines: readonly string[], colour: string, mode: ColourMode): string[] {
  const style = onBody(colour, mode);
  return lines.map((line) => `${style}${line}${LINE_END}`);
}
function colourView(doc: Document, mode: ColourMode, path: string, full: boolean): string {
  const head = colourLines([headerLine(path)], PANE.title, mode);
  const legend = colourLines([...legendBlock(doc, full, false), ""], PANE.legend, mode);
  return [...head, ...legend, colourBody(provenanceOnly(doc, full), mode)].join("\n");
}
function plainView(doc: Document, path: string, full: boolean): string {
  const body = render(provenanceOnly(doc, full), "display").text;
  return [headerLine(path), ...legendBlock(doc, full, true), "", body].join("\n");
}
/**
 * The header naming `path`, the four-item legend, the Runs list (when the file has agent text),
 * one empty line, then the body of `doc`, in `mode`. Colour mode prints the text unescaped, plain mode with the
 * Engine's escaping. With `full` the codes carry the full Run_Id and there is no Runs list.
 */
export function viewRecord(doc: Document, mode: ViewMode, path: string, full = false): string {
  return mode === "plain" ? plainView(doc, path, full) : colourView(doc, mode, path, full);
}
