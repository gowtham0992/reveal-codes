import { Fragment, Slice } from "@tiptap/pm/model";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";

function textOfChildren(paragraph: PMNode): string | null {
  let out = "";
  for (let i = 0; i < paragraph.childCount; i++) {
    const text = paragraph.child(i).text;
    if (text === undefined || text.includes("\n")) return null;
    out += text;
  }
  return out;
}

/**
 * Text of a slice: text nodes concatenated, or paragraphs joined by "\n".
 * null when a node is outside the Editor_Schema or a text node holds "\n".
 */
export function sliceToText(slice: Slice): string | null {
  const nodes: PMNode[] = [];
  slice.content.forEach((node) => {
    nodes.push(node);
  });
  if (nodes.length === 0) return "";
  if (nodes.every((node) => node.isText)) {
    const parts = nodes.map((node) => node.text ?? "");
    return parts.some((part) => part.includes("\n")) ? null : parts.join("");
  }
  if (!nodes.every((node) => node.type.name === "paragraph")) return null;
  const lines = nodes.map(textOfChildren);
  return lines.some((line) => line === null) ? null : lines.join("\n");
}

/**
 * One line: Slice of a text node (open 0, 0). Several lines: Slice of
 * paragraphs (open 1, 1). "" gives Slice.empty.
 */
export function textToSlice(schema: Schema, text: string): Slice {
  if (text === "") return Slice.empty;
  if (!text.includes("\n")) return new Slice(Fragment.from(schema.text(text)), 0, 0);
  const paragraphs = text
    .split("\n")
    .map((line) => schema.node("paragraph", null, line === "" ? [] : [schema.text(line)]));
  return new Slice(Fragment.fromArray(paragraphs), 1, 1);
}
