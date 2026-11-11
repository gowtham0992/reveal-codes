import { render } from "@reveal-codes/engine";
import type { CodePosition, Document } from "@reveal-codes/engine";
import { openerFamilies } from "./closers";
import { failingFlags } from "./failing";

export type CodeFamily =
  "HUM" | "PST" | "AI" | "AI>HUM" | "verified" | "failed" | "pending" | "ovr" | "ref" | "close";

export type PaneItem =
  | Readonly<{ kind: "text"; offset: number; text: string }>
  | Readonly<{
      kind: "code";
      offset: number;
      text: string;
      family: CodeFamily;
      meaning: string;
      failing: boolean;
    }>;

export type PaneLayout = Readonly<{ items: readonly PaneItem[]; textLength: number }>;

const FAMILIES: Readonly<Record<string, CodeFamily>> = {
  HUM: "HUM",
  PST: "PST",
  AI: "AI",
  "AI>HUM": "AI>HUM",
  "CIT ✓": "verified",
  "QUO ✓": "verified",
  "CIT ✘": "failed",
  "QUO ✘": "failed",
  "CIT ?": "pending",
  "CIT …": "pending",
  "QUO …": "pending",
  OVR: "ovr",
  REF: "ref",
  "/CIT": "close",
  "/QUO": "close",
  "/REF": "close",
};

const MEANINGS: Readonly<Record<string, string>> = {
  HUM: "Typed by the author",
  PST: "Pasted or from outside the editor",
  "CIT ✓": "Citation verified",
  "CIT ✘": "Citation not found",
  "CIT …": "Citation unchecked",
  "QUO ✓": "Quote verified",
  "QUO ✘": "Quote not found in the opinion",
  "QUO …": "Quote unchecked",
  REF: "Reference, not verified",
  "/CIT": "End of citation",
  "/QUO": "End of quote",
  "/REF": "End of reference",
};

/** Name of a display token: the text between `[` and the first `:`, `{` or `]`. */
function nameOf(token: string): string {
  const body = token.startsWith("[") ? token.slice(1) : token;
  const end = body.search(/[:{\]]/);
  return end < 0 ? body : body.slice(0, end);
}

/** Retained payload of a display token (after the first `:`), still escaped. */
function retainedOf(token: string): string {
  const colon = token.indexOf(":");
  if (colon < 0) return "";
  const close = token.endsWith("]") ? token.length - 1 : token.length;
  return token.slice(colon + 1, close);
}

/** Removes the escaping backslash from each escaped character. */
function unescapeRetained(s: string): string {
  return s.replace(/\\([\s\S])/g, "$1");
}

export function codeFamily(token: string): CodeFamily {
  return FAMILIES[nameOf(token)] ?? "ref";
}

export function codeMeaning(token: string): string {
  const name = nameOf(token);
  const retained = unescapeRetained(retainedOf(token));
  switch (name) {
    case "AI":
      return `Inserted by the assistant, run ${retained}`;
    case "AI>HUM":
      return `Inserted by the assistant, run ${retained}, then edited by the author`;
    case "CIT ?":
      return `Citation ambiguous, ${retained} candidates`;
    case "OVR":
      return `Override: ${retained}`;
    default:
      return MEANINGS[name] ?? name;
  }
}

function codeItem(position: CodePosition, failing: boolean, opener: CodeFamily | null): PaneItem {
  return {
    failing,
    kind: "code",
    offset: position.offset,
    text: position.code,
    family: opener ?? codeFamily(position.code),
    meaning: codeMeaning(position.code),
  };
}

/** The rendered text item starting at `at`: a backslash keeps its escaped character. */
function textUnit(rendered: string, at: number): Readonly<{ text: string; width: number }> {
  if (rendered.charAt(at) === "\\") return { text: rendered.slice(at, at + 2), width: 1 };
  const cp = String.fromCodePoint(rendered.codePointAt(at) ?? 0);
  return { text: cp, width: cp.length };
}

export function layoutPane(document: Document): PaneLayout {
  const rendering = render(document, "display");
  const { positions } = rendering;
  const flags = failingFlags(positions);
  const openers = openerFamilies(positions);
  const length = document.text.length;
  const items: PaneItem[] = [];
  let next = 0;
  let at = 0;
  let offset = 0;
  for (;;) {
    for (let p = positions[next]; p !== undefined && p.offset === offset; p = positions[next]) {
      items.push(codeItem(p, flags[next] ?? false, openers[next] ?? null));
      at += p.code.length;
      next += 1;
    }
    if (offset >= length) break;
    const unit = textUnit(rendering.text, at);
    items.push({ kind: "text", offset, text: unit.text });
    at += unit.text.length;
    offset += unit.width;
  }
  return { items, textLength: length };
}

/** Index of the Text_Item at `offset`, or the end position when `offset` is the text length. */
export function itemIndexAtOffset(layout: PaneLayout, offset: number): number {
  let found = -1;
  let last = -1;
  layout.items.forEach((item, index) => {
    if (item.kind !== "text") return;
    last = index;
    if (item.offset <= offset) found = index;
  });
  if (offset >= layout.textLength) return last + 1;
  return found < 0 ? firstTextIndex(layout) : found;
}

function firstTextIndex(layout: PaneLayout): number {
  const index = layout.items.findIndex((item) => item.kind === "text");
  return index < 0 ? 0 : index;
}

export function offsetOfItem(layout: PaneLayout, index: number): number {
  const item = layout.items[index];
  return item === undefined ? layout.textLength : item.offset;
}

function headOf(text: string, offset: number): string {
  return text.slice(0, Math.max(0, Math.min(offset, text.length)));
}

/** Line number of `offset`: 1 plus the newlines before it; the offset is clamped to the text. */
export function lineAt(text: string, offset: number): number {
  return headOf(text, offset).split("\n").length;
}

/** `Ln <line> Pos <col>`; offsets outside the text are clamped. */
export function lnPos(text: string, offset: number): string {
  const head = headOf(text, offset);
  const col = head.length - (head.lastIndexOf("\n") + 1) + 1;
  return `Ln ${String(lineAt(text, offset))} Pos ${String(col)}`;
}

/** `Doc 1 Pg 1 Ln <line> Pos <col>`; offsets outside the text are clamped. */
export function statusText(text: string, offset: number): string {
  return `Doc 1 Pg 1 ${lnPos(text, offset)}`;
}
