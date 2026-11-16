// Fixed wording for the pasted-text declaration. Pure string builders; no dependencies.
import type { DeclarationSubject } from "@reveal-codes/engine";

const n = (value: number): string => String(value);

export const subjectPhrase = (s: DeclarationSubject): string =>
  s === "pasted_text" ? "the pasted text" : "this filing";

export const choiceNoneLabel = (s: DeclarationSubject): string =>
  `No generative AI was used to prepare ${subjectPhrase(s)}.`;

export const choiceAiLabel = (s: DeclarationSubject): string =>
  `Generative AI was used to prepare some or all of ${subjectPhrase(s)}.`;

export const TOOL_NAME_LINE = "Enter the name of the tool or tools, 2 to 100 characters.";

export const requiredLine = (s: DeclarationSubject): string =>
  `State whether generative AI was used to prepare ${subjectPhrase(s)} before you download or print.`;

// Record sentences.

export const typedOnlySentence =
  "The record shows that every character was typed in the editor and that the editor's assistant was not used.";

export type TypedAndPastedFigures = Readonly<{
  total: number;
  typed: number;
  typedPct: number;
  pasted: number;
  pastedPct: number;
}>;

export function typedAndPastedSentence(f: TypedAndPastedFigures): string {
  return (
    `The record shows that the editor's assistant was not used. ` +
    `Of the ${n(f.total)} characters of this filing, ${n(f.typed)} (${n(f.typedPct)}%) were typed in the editor ` +
    `and ${n(f.pasted)} (${n(f.pastedPct)}%) were pasted or imported; ` +
    `the tool did not record the origin of the pasted or imported text.`
  );
}

export type PastedAfterAssistantFigures = Readonly<{
  total: number;
  pasted: number;
  pastedPct: number;
}>;

export function pastedAfterAssistantSentence(f: PastedAfterAssistantFigures): string {
  return `${n(f.pasted)} of ${n(f.total)} characters (${n(f.pastedPct)}%) were pasted or imported; the tool did not record their origin.`;
}

export const NO_PROGRAM_RECORD =
  "The record shows that no generative artificial intelligence program was used in the editor.";

export const howUsedDeclared = (s: DeclarationSubject): string =>
  `The tool did not record how generative AI was used to prepare ${subjectPhrase(s)}.`;

export const promptRecordsDeclared = (s: DeclarationSubject): string =>
  `The tool holds no prompt records for ${subjectPhrase(s)}.`;

// Author sentences. The tool name is inserted as given; nothing is added around it.

export const declarationNone = (s: DeclarationSubject): string =>
  `The author states that no generative AI was used to prepare ${subjectPhrase(s)}.`;

export function declarationAi(s: DeclarationSubject, tool: string): string {
  const lead = `The author states that generative AI was used to prepare some or all of ${subjectPhrase(s)}, and names the tool as ${tool}.`;
  return s === "pasted_text"
    ? `${lead} The tool did not record which pasted passages.`
    : `${lead} The tool did not record which passages.`;
}

export const portionsDeclared = (s: DeclarationSubject): string =>
  `The author states that generative AI was used to prepare some or all of ${subjectPhrase(s)}; the tool did not record which passages.`;

/** `tools` is the recorded tools text, or null when the run log yields none. */
export function programWithAuthor(tools: string | null, tool: string): string {
  const used = tools === null ? "is not recorded" : `was ${tools}`;
  return `The generative artificial intelligence program used ${used}; the author names ${tool} for the pasted text.`;
}

export const programAsNamed = (tool: string): string =>
  `The generative artificial intelligence program used was ${tool}, as named by the author.`;

/** `court` is the order's subject, e.g. "Judge Smith's order" or the instrument name. */
export const prohibitionDeclaredLine = (court: string, s: DeclarationSubject): string =>
  `${court} prohibits AI-drafted text. The author declared that generative AI was used to prepare ${subjectPhrase(s)}.`;
