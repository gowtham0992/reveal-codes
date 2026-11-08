import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type Hit = { readonly file: string; readonly line: number; readonly pattern: string };

const REGEX_PRECEDERS = "(,=:[!&|?{};+-*%<>~^";

type St = {
  readonly src: string;
  readonly out: string[];
  readonly templateDepths: number[];
  depth: number;
  last: string;
  i: number;
};

function blank(st: St, from: number, to: number): void {
  for (let k = from; k < to && k < st.out.length; k++) {
    if (st.out[k] !== "\n") st.out[k] = " ";
  }
}

function skipQuoted(st: St, quote: string): void {
  const start = st.i++;
  while (st.i < st.src.length && st.src[st.i] !== quote && st.src[st.i] !== "\n") {
    st.i += st.src[st.i] === "\\" ? 2 : 1;
  }
  st.i++;
  blank(st, start, st.i);
  st.last = '"';
}

/** Blanks template text up to the closing backtick or the next `${`. */
function skipTemplate(st: St, from: number): void {
  st.i = from + 1; // skip the opening backtick, or the `}` that resumes the template
  st.last = "`";
  while (st.i < st.src.length) {
    const ch = st.src[st.i];
    if (ch === "\\") st.i += 2;
    else if (ch === "`") {
      st.i++;
      blank(st, from, st.i);
      return;
    } else if (ch === "$" && st.src[st.i + 1] === "{") {
      blank(st, from, st.i + 2);
      st.templateDepths.push(st.depth++);
      st.i += 2;
      return;
    } else st.i++;
  }
  blank(st, from, st.i);
}

function skipRegex(st: St): void {
  const start = st.i++;
  let inClass = false;
  while (st.i < st.src.length && st.src[st.i] !== "\n") {
    const ch = st.src[st.i];
    if (ch === "\\") st.i++;
    else if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) break;
    st.i++;
  }
  st.i++;
  blank(st, start, st.i);
  st.last = "/";
}

function skipComment(st: St, block: boolean): void {
  const start = st.i;
  if (block) {
    const end = st.src.indexOf("*/", st.i + 2);
    st.i = end === -1 ? st.src.length : end + 2;
  } else {
    while (st.i < st.src.length && st.src[st.i] !== "\n") st.i++;
  }
  blank(st, start, st.i);
}

function codeChar(st: St, ch: string): void {
  if (ch === "{") st.depth++;
  if (ch === "}") {
    st.depth--;
    if (st.templateDepths[st.templateDepths.length - 1] === st.depth) {
      st.templateDepths.pop();
      skipTemplate(st, st.i);
      return;
    }
  }
  if (ch.trim() !== "") st.last = ch;
  st.i++;
}

/**
 * Replaces comments, string and template text, and regex literals by spaces.
 * Newlines are kept, so offsets and line numbers match the input.
 * Template substitutions (`${...}`) stay as code.
 */
export function stripNonCode(src: string): string {
  const st: St = { src, out: src.split(""), templateDepths: [], depth: 0, last: "", i: 0 };
  while (st.i < src.length) {
    const ch = src[st.i] as string;
    const next = src[st.i + 1];
    if (ch === "/" && (next === "/" || next === "*")) skipComment(st, next === "*");
    else if (ch === '"' || ch === "'") skipQuoted(st, ch);
    else if (ch === "`") skipTemplate(st, st.i);
    else if (ch === "/" && (st.last === "" || REGEX_PRECEDERS.includes(st.last))) skipRegex(st);
    else codeChar(st, ch);
  }
  return st.out.join("");
}

const FORBIDDEN: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "process.env", re: /\bprocess\s*\.\s*env\b/g },
  { name: "Date.now(", re: /\bDate\s*\.\s*now\s*\(/g },
  { name: "new Date()", re: /\bnew\s+Date\s*\(\s*\)/g },
  { name: "setTimeout(", re: /\bsetTimeout\s*\(/g },
  { name: "globalThis.fetch", re: /\bglobalThis\s*\.\s*fetch\b/g },
  { name: "fetch(", re: /(?<![.$\w])fetch\s*\(/g },
];

/** Reports each forbidden construct in `src` as `file:line`. */
export function scanSource(file: string, src: string): Hit[] {
  const code = stripNonCode(src);
  const hits: Hit[] = [];
  for (const { name, re } of FORBIDDEN) {
    for (const m of code.matchAll(re)) {
      const line = code.slice(0, m.index).split("\n").length;
      hits.push({ file, line, pattern: name });
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}

export function formatHit(hit: Hit): string {
  return `${hit.file}:${String(hit.line)} ${hit.pattern}`;
}

/** All `.ts` files under `dir`, recursively, sorted. */
export function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out.sort();
}

export function readText(file: string): string {
  return readFileSync(file, "utf8");
}
