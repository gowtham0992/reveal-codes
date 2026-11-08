import type { CallerOperation, Provenance } from "@reveal-codes/engine";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ReplaceStep } from "@tiptap/pm/transform";
import type { Step } from "@tiptap/pm/transform";
import { docFromText, docText, posToOffset } from "./offsets";
import { editorSchema } from "./schema";
import { sliceToText } from "./slice-text";

export type StepMapping = Readonly<{
  ops: readonly CallerOperation[];
  path: "mapped" | "fallback";
}>;

type Cursor = Readonly<{ doc: PMNode; text: string; ops: readonly CallerOperation[] }>;

function classify(
  from: number,
  to: number,
  ins: string,
  provenance: Provenance,
): CallerOperation | null {
  if (from < to && ins === "") return { kind: "delete", from, to, actor: provenance.origin };
  if (from === to && ins !== "") return { kind: "insert", at: from, text: ins, provenance };
  if (from < to) return { kind: "replace", from, to, text: ins, provenance };
  return null;
}

/** One ReplaceStep applied to the cursor; null sends the whole list to the fallback. */
function mapStep(cursor: Cursor, step: Step, provenance: Provenance): Cursor | null {
  if (!(step instanceof ReplaceStep)) return null;
  const from = posToOffset(cursor.doc, step.from);
  const to = posToOffset(cursor.doc, step.to);
  const ins = sliceToText(step.slice);
  if (from === null || to === null || ins === null) return null;
  if (!inBounds(step, cursor.doc.content.size)) return null;
  const result = step.apply(cursor.doc);
  if (result.failed !== null || result.doc === null) return null;
  const text = cursor.text.slice(0, from) + ins + cursor.text.slice(to);
  if (docText(result.doc) !== text) return null;
  const op = classify(from, to, ins, provenance);
  return { doc: result.doc, text, ops: op === null ? cursor.ops : [...cursor.ops, op] };
}

function mapAll(beforeText: string, steps: readonly Step[], provenance: Provenance) {
  let cursor: Cursor | null = {
    doc: docFromText(editorSchema, beforeText),
    text: beforeText,
    ops: [],
  };
  for (const step of steps) {
    cursor = mapStep(cursor, step, provenance);
    if (cursor === null) return null;
  }
  return cursor.ops;
}

/**
 * Step.apply throws a RangeError for positions outside the document instead of
 * returning a failed result, so the bounds are checked first.
 */
function inBounds(step: Step, size: number): boolean {
  const fields = step as unknown as Record<string, unknown>;
  return ["from", "to", "gapFrom", "gapTo"].every((key) => {
    const value = fields[key];
    return value === undefined || (typeof value === "number" && value >= 0 && value <= size);
  });
}

function resultingText(beforeText: string, steps: readonly Step[]): string | null {
  let doc = docFromText(editorSchema, beforeText);
  for (const step of steps) {
    if (!inBounds(step, doc.content.size)) return null;
    const result = step.apply(doc);
    if (result.failed !== null || result.doc === null) return null;
    doc = result.doc;
  }
  return docText(doc);
}

const isHigh = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

function commonPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

function commonSuffix(a: string, b: string, limit: number): number {
  let i = 0;
  while (i < limit && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) i++;
  return i;
}

function fallbackOps(
  before: string,
  after: string,
  provenance: Provenance,
): readonly CallerOperation[] {
  if (before === after) return [];
  let prefix = commonPrefix(before, after);
  let suffix = commonSuffix(before, after, Math.min(before.length, after.length) - prefix);
  if (prefix > 0 && isHigh(before.charCodeAt(prefix - 1))) prefix -= 1;
  // A suffix that starts on a low surrogate would split the pair before it.
  if (suffix > 0 && isLow(before.charCodeAt(before.length - suffix))) suffix += 1;
  if (prefix + suffix > Math.min(before.length, after.length))
    suffix = Math.min(before.length, after.length) - prefix;
  const to = before.length - suffix;
  return [
    {
      kind: "replace",
      from: prefix,
      to,
      text: after.slice(prefix, after.length - suffix),
      provenance,
    },
  ];
}

/** Maps ProseMirror steps to Engine operations; falls back to one prefix/suffix replace. */
export function mapSteps(
  beforeText: string,
  steps: readonly Step[],
  provenance: Provenance,
): StepMapping {
  const mapped = mapAll(beforeText, steps, provenance);
  if (mapped !== null) return { ops: mapped, path: "mapped" };
  const after = resultingText(beforeText, steps);
  if (after === null) return { ops: [], path: "fallback" };
  return { ops: fallbackOps(beforeText, after, provenance), path: "fallback" };
}

export function transactionToOps(
  beforeText: string,
  steps: readonly Step[],
  provenance: Provenance,
): readonly CallerOperation[] {
  return mapSteps(beforeText, steps, provenance).ops;
}
