import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { MarkRange } from "./marks";
import { offsetToPos } from "./offsets";

/** Transaction meta key; the value is a `readonly MarkRange[]` that replaces the whole set. */
export const MARKS_META = new PluginKey<DecorationSet>("pageMarks");

function isRangeList(value: unknown): value is readonly MarkRange[] {
  return Array.isArray(value);
}

/** Inline decorations for `ranges`; a range whose offsets do not map to a Pos is skipped (Req 11.1). */
export function buildMarks(doc: PMNode, ranges: readonly MarkRange[]): DecorationSet {
  const decorations: Decoration[] = [];
  for (const range of ranges) {
    const from = offsetToPos(doc, range.start);
    const to = offsetToPos(doc, range.end);
    if (from === null || to === null || from >= to) continue;
    decorations.push(Decoration.inline(from, to, { "data-issue": range.code, title: range.title }));
  }
  return DecorationSet.create(doc, decorations);
}

/**
 * Page marks as decorations. A meta-only transaction replaces the set; any other transaction maps
 * it, so a mark follows the text while the Store catches up. The document is never touched.
 */
export function createMarksPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: MARKS_META,
    state: {
      init: () => DecorationSet.empty,
      apply: (tr, set) => {
        const meta: unknown = tr.getMeta(MARKS_META);
        if (isRangeList(meta)) return buildMarks(tr.doc, meta);
        return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
      },
    },
    props: { decorations: (state) => MARKS_META.getState(state) },
  });
}
