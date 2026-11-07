/** Types shared by the check modules (design A12 step 3; Req 20.4, 20.5). */
import type { MalformedRule } from "../errors.js";
import type { ExtractedCitation, Extraction } from "../types.js";
import type { DraftDocument } from "./decode-types.js";

/** `index` is the input index of the offending Code (0 for whole-document rules). */
export type CheckFault = Readonly<{ index: number; rule: MalformedRule }>;

/** A draft that passed every Req 20.4 and 20.5 rule, with the Extractor output it was checked against. */
export type CheckedDraft = Readonly<{ draft: DraftDocument; extraction: Extraction }>;

/** Everything a citation-level rule needs. */
export type CheckInput = Readonly<{
  draft: DraftDocument;
  extraction: Extraction;
  /** Extractor citations by `"start:end"`. */
  byRange: ReadonlyMap<string, ExtractedCitation>;
}>;

export const rangeKey = (start: number, end: number): string => `${String(start)}:${String(end)}`;

export const fault = (index: number, rule: CheckFault["rule"]): CheckFault => ({ index, rule });
