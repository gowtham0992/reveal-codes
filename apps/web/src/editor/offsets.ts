import type { Node as PMNode, Schema } from "@tiptap/pm/model";

/*
 * Paragraph i has content length len_i. Its content starts at Pos
 * s_i = 1 + sum_{j<i}(len_j + 2) and at Offset o_i = sum_{j<i}(len_j + 1).
 * Positions are UTF-16 code units on both sides, so no conversion exists.
 */

type Start = Readonly<{ pos: number; offset: number; length: number }>;

function paragraphStarts(doc: PMNode): readonly Start[] {
  const starts: Start[] = [];
  let pos = 1;
  let offset = 0;
  doc.forEach((child) => {
    const length = child.content.size;
    starts.push({ pos, offset, length });
    pos += length + 2;
    offset += length + 1;
  });
  return starts;
}

/** Paragraph texts joined by "\n". */
export function docText(doc: PMNode): string {
  const lines: string[] = [];
  doc.forEach((child) => {
    lines.push(child.textContent);
  });
  return lines.join("\n");
}

/** Offset of the character at `pos`, or null when `pos` is not inside a paragraph's content range. */
export function posToOffset(doc: PMNode, pos: number): number | null {
  if (!Number.isInteger(pos)) return null;
  for (const start of paragraphStarts(doc)) {
    if (pos >= start.pos && pos <= start.pos + start.length) {
      return start.offset + (pos - start.pos);
    }
  }
  return null;
}

/** Pos inside the paragraph that holds `offset`, or null when `offset` is not an integer in range. */
export function offsetToPos(doc: PMNode, offset: number): number | null {
  if (!Number.isInteger(offset)) return null;
  for (const start of paragraphStarts(doc)) {
    if (offset >= start.offset && offset <= start.offset + start.length) {
      return start.pos + (offset - start.offset);
    }
  }
  return null;
}

/** Split on "\n"; "" is one empty paragraph. */
export function docFromText(schema: Schema, text: string): PMNode {
  const paragraphs = text
    .split("\n")
    .map((line) => schema.node("paragraph", null, line === "" ? [] : [schema.text(line)]));
  return schema.node("doc", null, paragraphs);
}
