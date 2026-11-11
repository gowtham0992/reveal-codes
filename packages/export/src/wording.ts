// The only module that holds the fixed wording of the Statement, the Appendix and the
// court-orders additions (citing sentence, order sentences, first-page pointer, prohibition line).
// Every sentence is defined by export-certification Requirements 4 and 5 and by court-orders
// Requirements 4, 5 and 7; nothing else may be added. No sentence contains an exclamation mark.
import { ORDERS, statementTitles } from "./orders.js";
import type { AiPassage } from "./ai-paragraphs.js";
import type { StatementTool } from "./types.js";

export const STATEMENT_TITLE = "AI-Use and Verification Statement";
/** The standard title plus every statement-title caption in the dataset (any status). */
export const STATEMENT_TITLES = statementTitles(ORDERS, STATEMENT_TITLE);
export const APPENDIX_TITLE = "Provenance Appendix";
export const APPENDIX_INTRO_1 =
  "The following is the complete provenance record of this filing in Reveal Codes form.";
export const APPENDIX_INTRO_2 =
  "It can be re-read by the tool to reproduce the filing and its provenance record exactly.";

export const PARAGRAPH_1 =
  "This filing was prepared with the drafting tool Reveal Codes, which records the origin of every character.";
export const PARAGRAPH_NO_AI =
  "No generative artificial intelligence was used in preparing this filing.";
export const OVERRIDES_INTRO =
  "The author chose to file despite the following unresolved items, for the reasons stated:";
export const RESPONSIBILITY =
  "The author has read the filing in full and takes responsibility for its contents.";
export const SIGNATURE_LINE = "/s/ ________________";

export const CITATION_COLUMNS = ["Citation", "Status", "Cluster id"] as const;
export const QUOTE_COLUMNS = ["Quotation", "Status"] as const;
export const OVERRIDE_COLUMNS = ["Code", "Text", "Reason", "Timestamp"] as const;

/** Product codes shown in the status columns (design D3). */
export const CITATION_CODES = {
  verified: "CIT ✓",
  not_found: "CIT ✘",
  ambiguous: "CIT ?",
  unchecked: "CIT …",
} as const;
export const QUOTE_CODES = {
  match: "QUO ✓",
  mismatch: "QUO ✘",
  unchecked: "QUO …",
} as const;

/** The provider string the app records for the credential-free fixture provider (apps/web/src/server/llm.ts). */
const FIXTURE_PROVIDER = "fixture";

export const DEMO_RESPONSE_WORDS = "a recorded demonstration response (no model was called)";

/**
 * One tool as wording (D24). The fixture provider prints the demonstration words;
 * any other provider prints `<provider><separator><model>`, or the provider alone for a null model.
 */
export function toolText(tool: StatementTool, separator: string): string {
  if (tool.provider === FIXTURE_PROVIDER) return DEMO_RESPONSE_WORDS;
  return tool.model === null ? tool.provider : `${tool.provider}${separator}${tool.model}`;
}

function toolList(tools: readonly StatementTool[]): string {
  if (tools.length === 0) return "not recorded";
  return tools.map((t) => toolText(t, ": ")).join(", ");
}

export type AiFigures = Readonly<{
  tools: readonly StatementTool[];
  ai: number;
  total: number;
  percent: string;
  edited: number;
}>;

export function aiParagraph(f: AiFigures): string {
  return (
    "Generative artificial intelligence was used in preparing this filing. " +
    `Tools: ${toolList(f.tools)}. ` +
    `Text inserted by the tool accounts for ${String(f.ai)} of ${String(f.total)} characters (${f.percent}%); ` +
    `of that, ${String(f.edited)} characters were subsequently edited by the author.`
  );
}

export type CitationCounts = Readonly<{
  date: string | null;
  verified: number;
  notFound: number;
  ambiguous: number;
  unchecked: number;
}>;

export function citationParagraph(c: CitationCounts): string {
  const when = c.date === null ? "a date that was not recorded" : c.date;
  return (
    `Every legal citation in this filing was checked against the CourtListener database on ${when}. ` +
    `${String(c.verified)} resolved to a single reported decision, ${String(c.notFound)} could not be found, ` +
    `${String(c.ambiguous)} matched more than one decision, and ${String(c.unchecked)} were not checked.`
  );
}

/** Paragraph 3 for a filing with no citation; the citation table is omitted. */
export const NO_CITATIONS_SENTENCE = "This filing contains no legal citations.";
/** Paragraph 4 for a filing with no quotation attributed to a cited decision; the table is omitted. */
export const NO_QUOTATIONS_SENTENCE =
  "This filing contains no quotations attributed to a cited decision.";
export function quoteParagraph(matched: number, mismatched: number, unchecked: number): string {
  return (
    "Quotations attributed to a cited decision were compared with the text of that decision. " +
    `${String(matched)} matched, ${String(mismatched)} did not, ${String(unchecked)} were not checked.`
  );
}

// ---- court-orders wording (court-orders Requirements 4, 5.5, 7.3) ----

export const NO_PROGRAM_SENTENCE = "No program was used.";
export const CONFIDENTIALITY_SENTENCE =
  "The author certifies that no confidential or business proprietary information was entered into the program.";
export const ALL_DRAFTERS_SUFFIX = " (all contributors to the drafting)";

export type CitingParts = Readonly<{
  court: string;
  title: string;
  instrument: string;
  /** Full judge name for a Judge_Entry, else null. */
  judge: string | null;
  date: string;
  sourceUrl: string;
  /** The caption text when the placement is separate_declaration, else null. */
  declarationCaption: string | null;
}>;

/** Paragraph 1. The declaration clause replaces the full stop before "Source:" (design D10). */
export function citingSentence(p: CitingParts): string {
  const judge = p.judge === null ? "" : `, Judge ${p.judge}`;
  const declaration =
    p.declarationCaption === null
      ? "."
      : `, filed as a declaration captioned "${p.declarationCaption}".`;
  return (
    `This statement is made to comply with the following instrument of the ${p.court}: ` +
    `${p.title} (${p.instrument}${judge}, ${p.date})${declaration} Source: ${p.sourceUrl}.`
  );
}

export function toolsSentence(tools: readonly StatementTool[]): string {
  if (tools.length === 0) {
    return "The generative artificial intelligence program used is not recorded.";
  }
  const list = tools.map((t) => toolText(t, " "));
  return `The generative artificial intelligence program used was ${list.join("; ")}.`;
}

/** `one` when n is 1, else `many` (D23). */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const MAX_PASSAGE_ITEMS = 5;

function passageItem(p: AiPassage): string {
  return `paragraph ${String(p.paragraph)}, beginning "${p.words}\u2026"`;
}

/** The caller omits the sentence when there are no passages. */
export function portionsSentence(passages: readonly AiPassage[]): string {
  const n = passages.length;
  const items = passages.slice(0, MAX_PASSAGE_ITEMS).map(passageItem).join("; ");
  const more = n - MAX_PASSAGE_ITEMS;
  const tail =
    more > 0
      ? ` and ${String(more)} more, each marked with an AI code in the Provenance Appendix.`
      : ".";
  return (
    `The text drafted with the program appears in ${String(n)} ${plural(n, "passage", "passages")} of the filing: ` +
    `${items}${tail} Paragraphs are counted from the first line of the caption, skipping blank lines.`
  );
}

export function howUsedSentence(runCount: number): string {
  const noun = plural(runCount, "run", "runs");
  return (
    `The program was used to draft text inserted at the author's request in ${String(runCount)} ${noun}; ` +
    "each prompt is recorded in the run log."
  );
}

export function promptRecordsSentence(runCount: number): string {
  const noun = plural(runCount, "prompt", "prompts");
  return `Prompt records are retained in the document's run log (${String(runCount)} ${noun}).`;
}

export function headerPointer(title: string): string {
  return `This filing was prepared using generative artificial intelligence. See the ${title} following the filing.`;
}

export type ProhibitionParts = Readonly<{
  /** Judge surname for a Judge_Entry, else null. */
  judgeSurname: string | null;
  instrument: string;
  /** AI passages in document order; [] when AI text holds line breaks only (design D18). */
  passages: readonly AiPassage[];
}>;

export function prohibitionLine(p: ProhibitionParts): string {
  const subject = p.judgeSurname === null ? p.instrument : `Judge ${p.judgeSurname}'s order`;
  const head = `${subject} prohibits AI-drafted text.`;
  const first = p.passages[0];
  if (first === undefined) return `${head} AI-origin text remains, consisting of line breaks only.`;
  const n = p.passages.length;
  const where =
    n === 1
      ? passageItem(first)
      : `the first at paragraph ${String(first.paragraph)}, beginning "${first.words}\u2026"`;
  const clause = n === 1 ? ":" : ",";
  return `${head} ${String(n)} AI-origin ${plural(n, "passage", "passages")} ${plural(n, "remains", "remain")}${clause} ${where}.`;
}
