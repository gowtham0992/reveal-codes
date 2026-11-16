import { paragraphsOf } from "./xml-text.js";

export type NoteKind = "footnote" | "endnote";

const NOTE = /<w:(footnote|endnote)(?=[\s>])([^>]*?)(\/?)>([\s\S]*?)<\/w:\1>/g;
const ATTR_ID = /\bw:id\s*=\s*(?:"([^"]*)"|'([^']*)')/;
const ATTR_TYPE = /\bw:type\s*=\s*(?:"([^"]*)"|'([^']*)')/;

function attribute(re: RegExp, attributes: string): string | undefined {
  const found = re.exec(attributes);
  return found === null ? undefined : (found[1] ?? found[2]);
}

function isSeparator(attributes: string): boolean {
  const id = attribute(ATTR_ID, attributes)?.trim();
  if (id === "-1" || id === "0") return true;
  const type = attribute(ATTR_TYPE, attributes);
  return type === "separator" || type === "continuationSeparator";
}

function noteText(inner: string): string {
  return paragraphsOf(inner)
    .join(" ")
    .replace(/[\n\t]/g, " ");
}

/**
 * The notes of word/footnotes.xml (kind "footnote") or word/endnotes.xml (kind "endnote"),
 * in part order. Separator notes and notes without text are left out. Total.
 */
export function notesOf(xml: string, kind: NoteKind): readonly string[] {
  const notes: string[] = [];
  for (const m of xml.matchAll(NOTE)) {
    if (m[1] !== kind || m[3] === "/") continue;
    if (isSeparator(m[2] ?? "")) continue;
    const text = noteText(m[4] ?? "");
    if (text.trim() !== "") notes.push(text);
  }
  return notes;
}

/**
 * A blank line, the line "Footnotes", then "<n>. <text>" for each note numbered from 1,
 * or "" when no note has text. Pass footnotes first, then endnotes.
 */
export function notesBlock(notes: readonly string[]): string {
  const present = notes.filter((n) => n.trim() !== "");
  if (present.length === 0) return "";
  const lines = present.map((text, i) => `${String(i + 1)}. ${text}`);
  return `\n\nFootnotes\n${lines.join("\n")}`;
}
