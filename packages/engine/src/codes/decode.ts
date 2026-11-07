/**
 * Decoder: lexed tokens to a draft Document (design A12 step 2; Req 20.1,
 * 20.3).
 *
 * The draft holds exactly what the Codes say. It carries no Citation_Values,
 * link targets, or Quote rules; those come from the Extractor in check
 * (task 8.6). It is not validated: coverage, canonical form, provenance
 * shape, and the other Req 20.4 rules are check's job. Every draft entry
 * keeps the input index of its Code so check can report at that index.
 *
 * Typed field values that cannot be decoded (including a malformed
 * Timestamp) are `bad_field` faults here. Faults are values; nothing throws.
 */
import { err, ok } from "../result.js";
import type { Result } from "../result.js";
import type { Origin, Provenance, QuoteCheckResult, RunEntry } from "../types.js";
import type {
  DecodeFault,
  DraftCitation,
  DraftDocument,
  DraftOverride,
  DraftQuote,
  DraftRef,
  DraftSpan,
  DraftStatus,
} from "./decode-types.js";
import { BAD, decodeInt, readInt, readKey, readList, readRuns } from "./decode-fields.js";
import { readText, readTimestamp, readVersion } from "./decode-fields.js";
import type { Read } from "./decode-fields.js";
import type { CodeToken, LexToken } from "./lex.js";
import { CODE_NAMES } from "./syntax.js";

export type * from "./decode-types.js";

type Family = "cit" | "quo" | "ref";
type Opened = Readonly<{ family: Family; index: number; start: number }>;
type Pending = Opened & { slot: number; key: string; payload: Payload; override?: DraftOverride };
type Payload =
  | Readonly<{ family: "cit"; status: DraftStatus }>
  | Readonly<{ family: "quo"; result: QuoteCheckResult }>
  | Readonly<{ family: "ref" }>;

type Header = Readonly<{ keyCounter: number; runs: readonly RunEntry[] }>;

const fault = (index: number, rule: DecodeFault["rule"]): DecodeFault => ({ index, rule });
const bad = (code: CodeToken): DecodeFault => fault(code.index, "bad_field");

/** Folds a `Read` into an object spread: absent -> `{}`. */
function opt<K extends string, T>(key: K, r: Read<T>): Result<Partial<Record<K, T>>, typeof BAD> {
  if (!r.ok) return err(BAD);
  const out: Partial<Record<K, T>> = {};
  if (r.value !== undefined) out[key] = r.value;
  return ok(out);
}

function decodeHeader(code: CodeToken): Result<Header, DecodeFault> {
  const v = readVersion(code);
  const n = readInt(code, "n");
  const runs = readRuns(code);
  if (!v.ok || v.value === undefined || !n.ok || n.value === undefined || runs === undefined) {
    return err(bad(code));
  }
  return ok({ keyCounter: n.value, runs });
}

function originOf(name: string): Origin | undefined {
  const map: Readonly<Record<string, Origin>> = {
    [CODE_NAMES.hum]: "HUM",
    [CODE_NAMES.pst]: "PST",
    [CODE_NAMES.ai]: "AI",
    [CODE_NAMES.aiHum]: "AI>HUM",
  };
  return map[name];
}

function decodeProvenance(code: CodeToken, origin: Origin): Result<Provenance, DecodeFault> {
  const t = readTimestamp(code, "t");
  if (!t.ok || t.value === undefined) return err(bad(code));
  const base = { origin, timestamp: t.value };
  return ok(code.retained === null ? base : { ...base, runId: code.retained });
}

function decodeStatus(code: CodeToken): Result<DraftStatus, typeof BAD> {
  switch (code.name) {
    case CODE_NAMES.citVerified: {
      const r = opt("clusterId", readText(code, "cl"));
      return r.ok ? ok({ status: "verified", ...r.value }) : err(BAD);
    }
    case CODE_NAMES.citAmbiguous: {
      const count = decodeInt(code.retained ?? "");
      const r = opt("candidates", readList(code, "cs"));
      return r.ok && count !== undefined
        ? ok({ status: "ambiguous", count, ...r.value })
        : err(BAD);
    }
    case CODE_NAMES.citNotFound: {
      const r = opt("reason", readText(code, "why"));
      return r.ok ? ok({ status: "not_found", ...r.value }) : err(BAD);
    }
    default: {
      const r = opt("waitUntil", readTimestamp(code, "wu"));
      return r.ok ? ok({ status: "unchecked", ...r.value }) : err(BAD);
    }
  }
}

function decodeQuoteResult(code: CodeToken): Result<QuoteCheckResult, typeof BAD> {
  if (code.name === CODE_NAMES.quoVerified) return ok({ status: "match" });
  if (code.name === CODE_NAMES.quoUnchecked) return ok({ status: "unchecked" });
  const p = readInt(code, "p");
  return p.ok && p.value !== undefined
    ? ok({ status: "mismatch", prefixLength: p.value })
    : err(BAD);
}

function familyOf(name: string): Family | undefined {
  if (name.startsWith("CIT ")) return "cit";
  if (name.startsWith("QUO ")) return "quo";
  return name === CODE_NAMES.ref ? "ref" : undefined;
}

function closeFamily(name: string): Family | undefined {
  const map: Readonly<Record<string, Family>> = {
    [CODE_NAMES.closeCit]: "cit",
    [CODE_NAMES.closeQuo]: "quo",
    [CODE_NAMES.closeRef]: "ref",
  };
  return map[name];
}

function decodePayload(code: CodeToken, family: Family): Result<Payload, DecodeFault> {
  if (family === "ref") return ok({ family });
  const r = family === "cit" ? decodeStatus(code) : decodeQuoteResult(code);
  if (!r.ok) return err(bad(code));
  return ok(
    family === "cit"
      ? { family, status: r.value as DraftStatus }
      : { family, result: r.value as QuoteCheckResult },
  );
}

function decodeOverride(code: CodeToken): Result<DraftOverride, DecodeFault> {
  const t = readTimestamp(code, "t");
  if (!t.ok || t.value === undefined || code.retained === null) return err(bad(code));
  return ok({ index: code.index, reason: code.retained, timestamp: t.value });
}

type Out = {
  readonly spans: DraftSpan[];
  readonly citations: (DraftCitation | undefined)[];
  readonly quotes: (DraftQuote | undefined)[];
  readonly refs: (DraftRef | undefined)[];
  readonly stacks: Record<Family, Pending[]>;
  /** The opening Code that the previous token was, if any (for `[OVR]`). */
  prev: Pending | undefined;
};

function open(out: Out, code: CodeToken, family: Family): DecodeFault | undefined {
  const payload = decodePayload(code, family);
  const key = readKey(code, "k");
  if (!payload.ok) return payload.error;
  if (family !== "ref" && (!key.ok || key.value === undefined)) return bad(code);
  const list = family === "cit" ? out.citations : family === "quo" ? out.quotes : out.refs;
  const pending: Pending = {
    family,
    index: code.index,
    start: code.offset,
    slot: list.length,
    key: key.ok ? (key.value ?? "") : "",
    payload: payload.value,
  };
  list.push(undefined);
  out.stacks[family].push(pending);
  out.prev = pending;
  return undefined;
}

function close(out: Out, code: CodeToken, family: Family): DecodeFault | undefined {
  const p = out.stacks[family].pop();
  if (p === undefined) return fault(code.index, "unbalanced_close");
  const base = { index: p.index, start: p.start, end: code.offset };
  const ovr = p.override === undefined ? {} : { override: p.override };
  const pl = p.payload;
  if (pl.family === "cit") {
    out.citations[p.slot] = { ...base, key: p.key, status: pl.status, ...ovr };
  } else if (pl.family === "quo") {
    out.quotes[p.slot] = { ...base, key: p.key, result: pl.result, ...ovr };
  } else {
    out.refs[p.slot] = { ...base, ...ovr };
  }
  return undefined;
}

function attachOverride(out: Out, code: CodeToken): DecodeFault | undefined {
  const target = out.prev;
  if (target === undefined || target.override !== undefined) {
    return fault(code.index, "ovr_position");
  }
  const o = decodeOverride(code);
  if (!o.ok) return o.error;
  target.override = o.value;
  return undefined;
}

function spanStart(out: Out, code: CodeToken, origin: Origin): DecodeFault | undefined {
  const prov = decodeProvenance(code, origin);
  if (!prov.ok) return prov.error;
  out.spans.push({
    index: code.index,
    start: code.offset,
    end: code.offset,
    provenance: prov.value,
  });
  return undefined;
}

function handleCode(out: Out, code: CodeToken): DecodeFault | undefined {
  const wasPrev = out.prev;
  out.prev = undefined;
  if (code.name === CODE_NAMES.ovr) {
    out.prev = wasPrev;
    const f = attachOverride(out, code);
    out.prev = undefined;
    return f;
  }
  if (code.name === CODE_NAMES.doc) return fault(code.index, "misplaced_doc");
  const origin = originOf(code.name);
  if (origin !== undefined) return spanStart(out, code, origin);
  const opens = familyOf(code.name);
  if (opens !== undefined) return open(out, code, opens);
  const closes = closeFamily(code.name);
  return closes === undefined ? fault(code.index, "unknown_code") : close(out, code, closes);
}

/** Ends each span at the next span's start, or at the end of Text. */
function closeSpans(spans: readonly DraftSpan[], textLength: number): DraftSpan[] {
  return spans.map((s, i) => ({ ...s, end: spans[i + 1]?.start ?? textLength }));
}

function done<T>(xs: readonly (T | undefined)[]): T[] {
  return xs.filter((x): x is T => x !== undefined);
}

/**
 * Decodes lexed tokens into a draft Document. Returns the lowest-index
 * fault if any Code is undecodable or misplaced. Never throws.
 */
export function decodeTokens(tokens: readonly LexToken[]): Result<DraftDocument, DecodeFault> {
  const first = tokens[0];
  if (first === undefined || first.kind !== "code" || first.name !== CODE_NAMES.doc) {
    return err(fault(0, "missing_doc"));
  }
  const header = decodeHeader(first);
  if (!header.ok) return header;
  const out: Out = {
    spans: [],
    citations: [],
    quotes: [],
    refs: [],
    stacks: { cit: [], quo: [], ref: [] },
    prev: undefined,
  };
  let text = "";
  let lowest: DecodeFault | undefined;
  for (const t of tokens.slice(1)) {
    if (t.kind === "text") {
      text += t.text;
      out.prev = undefined;
      continue;
    }
    const f = handleCode(out, t);
    if (f !== undefined && (lowest === undefined || f.index < lowest.index)) lowest = f;
  }
  for (const p of [...out.stacks.cit, ...out.stacks.quo, ...out.stacks.ref]) {
    if (lowest === undefined || p.index < lowest.index) lowest = fault(p.index, "unclosed_open");
  }
  if (lowest !== undefined) return err(lowest);
  return ok({
    text,
    keyCounter: header.value.keyCounter,
    runs: header.value.runs,
    spans: closeSpans(out.spans, text.length),
    citations: done(out.citations),
    quotes: done(out.quotes),
    refs: done(out.refs),
  });
}
