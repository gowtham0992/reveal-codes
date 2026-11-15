/**
 * Reveal Codes syntax: names, per-context escaping, and Code string building
 * (design "Code syntax", A11; Req 19.2, 19.3, 19.11).
 */
import { err, ok } from "../result.js";
import type { Result } from "../result.js";
import type { RenderMode } from "../types.js";

/** Escape_Character (design deferred-item table). */
export const ESCAPE = "\\";

/** Every Code name, with the exact glyphs from product.md. */
export const CODE_NAMES = {
  hum: "HUM",
  pst: "PST",
  ai: "AI",
  aiHum: "AI>HUM",
  citVerified: "CIT ✓",
  citNotFound: "CIT ✘",
  citWrongCase: "CIT ≠",
  citAmbiguous: "CIT ?",
  citUnchecked: "CIT …",
  quoVerified: "QUO ✓",
  quoMismatch: "QUO ✘",
  quoUnchecked: "QUO …",
  ref: "REF",
  closeCit: "/CIT",
  closeQuo: "/QUO",
  closeRef: "/REF",
  ovr: "OVR",
  doc: "DOC",
} as const;

export type CodeName = (typeof CODE_NAMES)[keyof typeof CODE_NAMES];

const NAME_SET: ReadonlySet<string> = new Set<string>(Object.values(CODE_NAMES));

export function isCodeName(s: string): s is CodeName {
  return NAME_SET.has(s);
}

/** Where an escaped string appears. */
export type EscapeContext = "text" | "retained" | "payload";

const ESCAPED: Readonly<Record<EscapeContext, ReadonlySet<string>>> = {
  text: new Set(["\\", "[", "]"]),
  retained: new Set(["\\", "[", "]", "{"]),
  payload: new Set(["\\", "[", "]", "{", "}", ";", "=", ","]),
};

function escapeWith(s: string, set: ReadonlySet<string>): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    out += set.has(ch) ? ESCAPE + ch : ch;
  }
  return out;
}

/** Escapes Document Text: `\` `[` `]`. */
export function escapeText(s: string): string {
  return escapeWith(s, ESCAPED.text);
}

/** Escapes a Retained_Payload: `\` `[` `]` `{`. */
export function escapeRetained(s: string): string {
  return escapeWith(s, ESCAPED.retained);
}

/** Escapes one Payload_Section value: `\` `[` `]` `{` `}` `;` `=` `,`. */
export function escapePayload(s: string): string {
  return escapeWith(s, ESCAPED.payload);
}

/** `index` is the input index of the offending Escape_Character. */
export type UnescapeFault = Readonly<{ kind: "dangling_escape"; index: number }>;

/**
 * Inverse of the matching escape function. A `\` followed by a character
 * outside the context's escape set, or a `\` at the end of input, is a
 * dangling Escape_Character (Req 20.3).
 */
export function unescape(s: string, context: EscapeContext): Result<string, UnescapeFault> {
  const set = ESCAPED[context];
  let out = "";
  let i = 0;
  while (i < s.length) {
    const ch = s.charAt(i);
    if (ch !== ESCAPE) {
      out += ch;
      i += 1;
      continue;
    }
    const next = i + 1 < s.length ? s.charAt(i + 1) : "";
    if (next === "" || !set.has(next)) return err({ kind: "dangling_escape", index: i });
    out += next;
    i += 2;
  }
  return ok(out);
}

/** One Payload_Section field: a key and its escaped-on-write values. */
export type CodeField = Readonly<{ key: string; values: readonly string[] }>;

function fieldString(f: CodeField): string {
  return `${f.key}=${f.values.map(escapePayload).join(",")}`;
}

/**
 * Builds one Code token. `retained` is `null` when the Code has none. In
 * `display` mode the Payload_Section is omitted and the rest is identical, so
 * Strip of the full token equals the display token (Req 19.11).
 */
export function codeString(
  name: CodeName,
  retained: string | null,
  fields: readonly CodeField[],
  mode: RenderMode,
): string {
  const head = retained === null ? name : `${name}:${escapeRetained(retained)}`;
  const section =
    mode === "full" && fields.length > 0 ? `{${fields.map(fieldString).join(";")}}` : "";
  return `[${head}${section}]`;
}
