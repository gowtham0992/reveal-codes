// The only module that holds the fixed wording of the Statement and the Appendix.
// Every sentence is defined by Requirements 4 and 5; nothing else may be added.
import type { StatementTool } from "./types.js";

export const STATEMENT_TITLE = "AI-Use and Verification Statement";
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

function toolList(tools: readonly StatementTool[]): string {
  if (tools.length === 0) return "not recorded";
  return tools.map((t) => (t.model === null ? t.provider : `${t.provider}: ${t.model}`)).join(", ");
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

export function quoteParagraph(matched: number, mismatched: number, unchecked: number): string {
  return (
    "Quotations attributed to a cited decision were compared with the text of that decision. " +
    `${String(matched)} matched, ${String(mismatched)} did not, ${String(unchecked)} were not checked.`
  );
}
