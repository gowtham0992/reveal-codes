/**
 * Lexer for Full_Renderings (design A12 step 1; Req 20.3, 20.6).
 *
 * One left-to-right pass that never stops early. Every syntax fault is
 * recorded at its input index and the lowest one is returned (the earliest
 * recorded wins a tie). The lexer checks structure only: names, retained
 * presence, field keys, duplicate and missing keys, escapes, and bracket
 * balance. Typing of field values belongs to decode (task 8.5).
 */
import { err, ok } from "../result.js";
import type { Result } from "../result.js";
import type { MalformedSyntaxRule } from "../errors.js";
import { CODE_NAMES, ESCAPE, isCodeName, unescape } from "./syntax.js";
import type { CodeField, CodeName } from "./syntax.js";

export type LexFault = Readonly<{ index: number; rule: MalformedSyntaxRule }>;

export type TextToken = Readonly<{ kind: "text"; text: string }>;

/** `index` is the input index of `[`; `offset` is the Text Offset of the Code. */
export type CodeToken = Readonly<{
  kind: "code";
  name: CodeName;
  retained: string | null;
  fields: readonly CodeField[];
  index: number;
  offset: number;
}>;

export type LexToken = TextToken | CodeToken;

type Schema = Readonly<{
  retained: boolean;
  required: readonly string[];
  optional: readonly string[];
  repeat?: string;
}>;

const NONE: Schema = { retained: false, required: [], optional: [] };
const T: Schema = { retained: false, required: ["t"], optional: [] };
const RUN_T: Schema = { retained: true, required: ["t"], optional: [] };
const K: Schema = { retained: false, required: ["k"], optional: [] };

const SCHEMAS: Readonly<Record<CodeName, Schema>> = {
  [CODE_NAMES.doc]: { retained: false, required: ["v", "n"], optional: [], repeat: "r" },
  [CODE_NAMES.hum]: T,
  [CODE_NAMES.pst]: T,
  [CODE_NAMES.ai]: RUN_T,
  [CODE_NAMES.aiHum]: RUN_T,
  [CODE_NAMES.citVerified]: { retained: false, required: ["k"], optional: ["cl"] },
  [CODE_NAMES.citNotFound]: { retained: false, required: ["k"], optional: ["why"] },
  [CODE_NAMES.citAmbiguous]: { retained: true, required: ["k"], optional: ["cs"] },
  [CODE_NAMES.citUnchecked]: { retained: false, required: ["k"], optional: ["wu"] },
  [CODE_NAMES.quoVerified]: K,
  [CODE_NAMES.quoMismatch]: { retained: false, required: ["k", "p"], optional: [] },
  [CODE_NAMES.quoUnchecked]: K,
  [CODE_NAMES.ref]: NONE,
  [CODE_NAMES.closeCit]: NONE,
  [CODE_NAMES.closeQuo]: NONE,
  [CODE_NAMES.closeRef]: NONE,
  [CODE_NAMES.ovr]: RUN_T,
};

type Piece = Readonly<{ text: string; start: number }>;

/** Splits on `sep` outside `\x` pairs. */
function splitTop(s: string, sep: string, base: number): Piece[] {
  const out: Piece[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === ESCAPE) i += 1;
    else if (c === sep) {
      out.push({ text: s.slice(start, i), start: base + start });
      start = i + 1;
    }
  }
  out.push({ text: s.slice(start), start: base + start });
  return out;
}

/** Index of the first unescaped `}` in `s`, or -1 (also -1 if an unescaped `{` comes first). */
function closingBrace(s: string): number {
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === ESCAPE) i += 1;
    else if (c === "}") return i;
    else if (c === "{") return -1;
  }
  return -1;
}

type Sink = (fault: LexFault) => void;

function unescapeAt(s: string, ctx: "text" | "retained" | "payload", base: number, sink: Sink) {
  const r = unescape(s, ctx);
  if (r.ok) return r.value;
  sink({ index: base + r.error.index, rule: "dangling_escape" });
  return s;
}

function parseField(p: Piece, sink: Sink): CodeField | undefined {
  const sides = splitTop(p.text, "=", p.start);
  const key = sides[0]?.text ?? "";
  const valuePart = sides[1];
  if (sides.length !== 2 || valuePart === undefined || key === "") return undefined;
  const values = splitTop(valuePart.text, ",", valuePart.start).map((v) =>
    unescapeAt(v.text, "payload", v.start, sink),
  );
  return { key, values };
}

/** `rest` starts just after `{`. Returns undefined on a structural fault. */
function parseFields(rest: string, base: number, sink: Sink): CodeField[] | undefined {
  const end = closingBrace(rest);
  if (end < 0 || end !== rest.length - 1 || end === 0) return undefined;
  const fields: CodeField[] = [];
  for (const piece of splitTop(rest.slice(0, end), ";", base)) {
    const f = parseField(piece, sink);
    if (f === undefined) return undefined;
    fields.push(f);
  }
  return fields;
}

function fieldsMatch(schema: Schema, fields: readonly CodeField[]): boolean {
  const seen = new Set<string>();
  for (const f of fields) {
    const known =
      schema.required.includes(f.key) || schema.optional.includes(f.key) || f.key === schema.repeat;
    if (!known || (f.key !== schema.repeat && seen.has(f.key))) return false;
    seen.add(f.key);
  }
  return schema.required.every((k) => seen.has(k));
}

type Body = Readonly<{ name: string; retained: string | null; fieldsRest: string | null }>;

/** Splits a Code body (between `[` and `]`) into name, raw retained, and raw field section. */
function splitBody(body: string): Body & Readonly<{ retainedStart: number; fieldsStart: number }> {
  const sep = body.search(/[:{]/);
  const nameEnd = sep < 0 ? body.length : sep;
  let pos = nameEnd;
  let retained: string | null = null;
  if (body.charAt(pos) === ":") {
    let k = pos + 1;
    while (k < body.length && body.charAt(k) !== "{") k += body.charAt(k) === ESCAPE ? 2 : 1;
    k = Math.min(k, body.length);
    retained = body.slice(pos + 1, k);
    pos = k;
  }
  const retainedStart = nameEnd + 1;
  const fieldsRest = body.charAt(pos) === "{" ? body.slice(pos + 1) : null;
  return {
    name: body.slice(0, nameEnd),
    retained,
    fieldsRest,
    retainedStart,
    fieldsStart: pos + 1,
  };
}

/** Parses one Code at input index `index`; faults go to `sink`. */
function parseCode(body: string, index: number, offset: number, sink: Sink): CodeToken | undefined {
  const b = splitBody(body);
  if (!isCodeName(b.name)) {
    sink({ index, rule: "unknown_code" });
    return undefined;
  }
  const schema = SCHEMAS[b.name];
  const bodyBase = index + 1;
  const retained =
    b.retained === null
      ? null
      : unescapeAt(b.retained, "retained", bodyBase + b.retainedStart, sink);
  const fields =
    b.fieldsRest === null ? [] : parseFields(b.fieldsRest, bodyBase + b.fieldsStart, sink);
  const shapeOk =
    (b.retained !== null) === schema.retained &&
    fields !== undefined &&
    fieldsMatch(schema, fields);
  if (!shapeOk) sink({ index, rule: "bad_field" });
  return { kind: "code", name: b.name, retained, fields: fields ?? [], index, offset };
}

type Scan = Readonly<{ closed: boolean; end: number; dangling: number }>;

/** Finds the unescaped `]` for the `[` at `start`; `end` is where scanning resumes if unclosed. */
function scanCode(input: string, start: number): Scan {
  let j = start + 1;
  while (j < input.length) {
    const c = input.charAt(j);
    if (c === ESCAPE) {
      if (j + 1 >= input.length) return { closed: false, end: input.length, dangling: j };
      j += 2;
    } else if (c === "]") return { closed: true, end: j, dangling: -1 };
    else if (c === "[") return { closed: false, end: j, dangling: -1 };
    else j += 1;
  }
  return { closed: false, end: input.length, dangling: -1 };
}

type Family = "cit" | "quo" | "ref";

const OPENS: Readonly<Partial<Record<CodeName, Family>>> = {
  [CODE_NAMES.citVerified]: "cit",
  [CODE_NAMES.citNotFound]: "cit",
  [CODE_NAMES.citAmbiguous]: "cit",
  [CODE_NAMES.citUnchecked]: "cit",
  [CODE_NAMES.quoVerified]: "quo",
  [CODE_NAMES.quoMismatch]: "quo",
  [CODE_NAMES.quoUnchecked]: "quo",
  [CODE_NAMES.ref]: "ref",
};

const CLOSES: Readonly<Partial<Record<CodeName, Family>>> = {
  [CODE_NAMES.closeCit]: "cit",
  [CODE_NAMES.closeQuo]: "quo",
  [CODE_NAMES.closeRef]: "ref",
};

type Stacks = Readonly<Record<Family, number[]>>;

function trackBalance(code: CodeToken, stacks: Stacks, sink: Sink): void {
  const open = OPENS[code.name];
  if (open !== undefined) stacks[open].push(code.index);
  const close = CLOSES[code.name];
  if (close !== undefined && stacks[close].pop() === undefined) {
    sink({ index: code.index, rule: "unbalanced_close" });
  }
}

type State = {
  readonly input: string;
  readonly tokens: LexToken[];
  readonly faults: LexFault[];
  readonly stacks: Stacks;
  offset: number;
};

function flush(st: State, a: number, b: number): void {
  if (b <= a) return;
  const sink: Sink = (f) => void st.faults.push(f);
  const text = unescapeAt(st.input.slice(a, b), "text", a, sink);
  if (text !== "") st.tokens.push({ kind: "text", text });
  st.offset += text.length;
}

/** Lexes the Code starting at `i`; returns the input index where scanning resumes. */
function lexOne(st: State, i: number): number {
  const sink: Sink = (f) => void st.faults.push(f);
  const scan = scanCode(st.input, i);
  if (!scan.closed) sink({ index: i, rule: "unterminated_code" });
  if (scan.dangling >= 0) sink({ index: scan.dangling, rule: "dangling_escape" });
  const body = st.input.slice(i + 1, scan.end);
  const code = scan.closed ? parseCode(body, i, st.offset, sink) : undefined;
  if (code !== undefined) {
    st.tokens.push(code);
    trackBalance(code, st.stacks, sink);
  }
  return scan.closed ? scan.end + 1 : scan.end;
}

/**
 * Lexes a Full_Rendering. Returns the tokens, or the lowest-index syntax
 * fault. Never throws, for any string (Req 20.6).
 */
export function lexCodes(input: string): Result<readonly LexToken[], LexFault> {
  const st: State = {
    input,
    tokens: [],
    faults: [],
    stacks: { cit: [], quo: [], ref: [] },
    offset: 0,
  };
  let i = 0;
  let textStart = 0;
  while (i < input.length) {
    const c = input.charAt(i);
    if (c === ESCAPE) i += 2;
    else if (c === "[") {
      flush(st, textStart, i);
      i = lexOne(st, i);
      textStart = i;
    } else {
      if (c === "]") st.faults.push({ index: i, rule: "unbalanced_close" });
      i += 1;
    }
  }
  flush(st, textStart, input.length);
  return finish(st.tokens, st.stacks, st.faults);
}

function finish(
  tokens: readonly LexToken[],
  stacks: Stacks,
  faults: LexFault[],
): Result<readonly LexToken[], LexFault> {
  for (const family of ["cit", "quo", "ref"] as const) {
    for (const index of stacks[family]) faults.push({ index, rule: "unclosed_open" });
  }
  const codes = tokens.filter((t): t is CodeToken => t.kind === "code");
  const first = codes[0];
  if (first === undefined || first.index !== 0 || first.name !== CODE_NAMES.doc) {
    faults.push({ index: 0, rule: "missing_doc" });
  }
  for (const c of codes) {
    if (c.name === CODE_NAMES.doc && c.index !== 0)
      faults.push({ index: c.index, rule: "misplaced_doc" });
  }
  let lowest: LexFault | undefined;
  for (const f of faults) if (lowest === undefined || f.index < lowest.index) lowest = f;
  return lowest === undefined ? ok(tokens) : err(lowest);
}
